// 视频渲染模块（重构版）
// 核心原则：不再复制/重写物理与字幕逻辑，直接在“虚拟窗口(iframe)”里运行 sban_physics.js 的原生播放。

const RenderModule = (function() {
    const SANDBOX_FLAG = 'sban_render_sandbox';
    const isSandbox = new URLSearchParams(window.location.search).get(SANDBOX_FLAG) === '1';

    // 在沙箱窗口中不启用渲染模块，避免递归嵌套
    if (isSandbox) {
        return { init: function() {} };
    }

    const elements = {
        renderBtn: document.getElementById('render-btn'),
        renderDialog: document.getElementById('render-dialog'),
        renderResolution: document.getElementById('render-resolution'),
        customResolutionGroup: document.getElementById('custom-resolution-group'),
        customWidth: document.getElementById('custom-width'),
        customHeight: document.getElementById('custom-height'),
        renderFps: document.getElementById('render-fps'),
        renderForceFrameData: document.getElementById('render-force-frame-data'),
        renderDuration: document.getElementById('render-duration'),
        renderQuality: document.getElementById('render-quality'),
        renderPreviewBtn: document.getElementById('render-preview-btn'),
        renderStartBtn: document.getElementById('render-start-btn'),
        renderCancelBtn: document.getElementById('render-cancel-btn'),
        renderProgress: document.getElementById('render-progress'),
        progressFill: document.getElementById('progress-fill'),
        progressText: document.getElementById('progress-text')
    };

    const runtime = {
        isRendering: false,
        isPreviewing: false,
        useDirectMode: window.location.protocol === 'file:',
        sandboxIframe: null,
        mediaRecorder: null,
        recordedChunks: [],
        progressTimer: null,
        frameDataTimer: null,
        stopTimer: null,
        startTimestamp: 0,
        durationMs: 0,
        fps: 30,
        quality: 5000000,
        forceFrameData: true
    };

    function init() {
        if (!elements.renderBtn) return;

        elements.renderBtn.addEventListener('click', openRenderDialog);
        elements.renderCancelBtn.addEventListener('click', closeRenderDialog);
        elements.renderPreviewBtn.addEventListener('click', togglePreview);
        elements.renderStartBtn.addEventListener('click', startRender);

        elements.renderResolution.addEventListener('change', function() {
            elements.customResolutionGroup.style.display = this.value === 'custom' ? 'block' : 'none';
        });
    }

    function openRenderDialog() {
        elements.renderDialog.classList.remove('hidden');
        elements.renderProgress.classList.add('hidden');

        const delay = parseInt(document.getElementById('start-delay').value) || 0;
        const subtitleDuration = parseInt(document.getElementById('subtitle-duration').value) || 8;
        const physicsTime = parseInt(document.getElementById('physics-release-time').value) || 3;
        elements.renderDuration.value = Math.ceil(delay + subtitleDuration + physicsTime + 5);
    }

    function closeRenderDialog() {
        if (runtime.isRendering) {
            if (!confirm('正在渲染中，确定要取消吗？')) return;
            stopRender(true);
        }
        if (runtime.isPreviewing) stopPreview();
        elements.renderDialog.classList.add('hidden');
    }

    function getRenderSettings() {
        const resolution = elements.renderResolution.value;
        let width;
        let height;

        if (resolution === 'custom') {
            width = parseInt(elements.customWidth.value) || 1920;
            height = parseInt(elements.customHeight.value) || 1080;
        } else {
            const [w, h] = resolution.split('x').map(Number);
            width = w;
            height = h;
        }

        return {
            width,
            height,
            fps: parseInt(elements.renderFps.value) || 30,
            duration: parseInt(elements.renderDuration.value) || 15,
            quality: parseInt(elements.renderQuality.value) || 5000000,
            forceFrameData: !elements.renderForceFrameData || elements.renderForceFrameData.value !== 'false'
        };
    }

    function buildSandboxUrl() {
        const url = new URL(window.location.href);
        url.searchParams.set(SANDBOX_FLAG, '1');
        return url.toString();
    }

    function resetNativeScene(targetWindow) {
        if (targetWindow && typeof targetWindow.resetToHome === 'function') {
            targetWindow.resetToHome();
        }
    }

    function createSandboxIframe(settings, visible) {
        return new Promise((resolve, reject) => {
            if (runtime.useDirectMode) {
                // file:// 场景下 iframe 会导致 origin 为 null，容易触发扩展脚本跨域/消息异常
                // 直接复用当前页面原生播放逻辑，避免 null-origin iframe 问题。
                try {
                    syncControlsToSandbox(document);
                    resetNativeScene(window);
                    triggerSandboxPlay(window);
                    resolve(null);
                } catch (e) {
                    reject(e);
                }
                return;
            }

            cleanupSandbox();

            const iframe = document.createElement('iframe');
            iframe.src = buildSandboxUrl();
            iframe.width = String(settings.width);
            iframe.height = String(settings.height);
            iframe.setAttribute('aria-hidden', visible ? 'false' : 'true');
            iframe.style.border = '0';

            if (visible) {
                iframe.style.background = '#000';
            } else {
                iframe.style.position = 'fixed';
                iframe.style.left = '-10000px';
                iframe.style.top = '0';
                iframe.style.opacity = '0';
                iframe.style.pointerEvents = 'none';
            }

            iframe.onload = () => {
                try {
                    syncControlsToSandbox(iframe.contentDocument);
                    triggerSandboxPlay(iframe.contentWindow);
                    resolve(iframe);
                } catch (e) {
                    reject(e);
                }
            };

            iframe.onerror = () => reject(new Error('虚拟播放窗口加载失败'));
            document.body.appendChild(iframe);
            runtime.sandboxIframe = iframe;
        });
    }

    function syncControlsToSandbox(targetDoc) {
        const ids = [
            'input-text', 'subtitle-text', 'char-gap', 'line-gap', 'subtitle-duration', 'start-delay',
            'physics-release-time', 'font-family', 'kanji-size', 'kana-size', 'global-scale', 'show-collision',
            'subtitle-motion', 'hide-subtitle', 'rotation-start', 'rotation-end', 'random-velocity',
            'velocity-angle-start', 'velocity-angle-end', 'drop-delay', 'motion-blur'
        ];

        ids.forEach(id => {
            const src = document.getElementById(id);
            const dst = targetDoc.getElementById(id);
            if (!src || !dst) return;
            dst.value = src.value;
            dst.dispatchEvent(new Event('input', { bubbles: true }));
            dst.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function triggerSandboxPlay(targetWindow) {
        if (typeof targetWindow.startAnimation !== 'function') {
            throw new Error('沙箱中未找到 startAnimation，无法复用原生播放逻辑');
        }
        targetWindow.startAnimation();
    }

    function findSandboxCanvas() {
        if (runtime.useDirectMode) {
            return document.querySelector('#canvas-container canvas') || document.querySelector('canvas');
        }
        if (!runtime.sandboxIframe || !runtime.sandboxIframe.contentDocument) return null;
        return runtime.sandboxIframe.contentDocument.querySelector('canvas');
    }

    async function togglePreview() {
        if (runtime.isPreviewing) {
            stopPreview();
            return;
        }

        if (runtime.useDirectMode) {
            try {
                syncControlsToSandbox(document);
                resetNativeScene(window);
                triggerSandboxPlay(window);
                runtime.isPreviewing = true;
                elements.renderPreviewBtn.textContent = '停止预览';
            } catch (e) {
                alert('预览启动失败：' + e.message);
            }
            return;
        }

        const settings = getRenderSettings();
        const overlay = document.createElement('div');
        overlay.id = 'preview-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';

        const info = document.createElement('div');
        info.style.cssText = 'color:#fff;margin-bottom:10px;font-size:14px;';
        info.textContent = `预览中（原生播放）: ${settings.width}x${settings.height} @ ${settings.fps}fps`;

        const holder = document.createElement('div');
        const aspect = settings.width / settings.height;
        const w = aspect > 1 ? Math.min(800, settings.width * 0.4) : Math.min(600 * aspect, settings.width * 0.6);
        const h = w / aspect;
        holder.style.cssText = `width:${w}px;height:${h}px;border:2px solid #fff;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden;`;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '停止预览';
        closeBtn.style.cssText = 'margin-top:20px;padding:10px 30px;font-size:16px;cursor:pointer;background:#333;color:#fff;border:1px solid #fff;';
        closeBtn.onclick = stopPreview;

        overlay.appendChild(info);
        overlay.appendChild(holder);
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        try {
            const iframe = await createSandboxIframe(settings, true);
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            holder.appendChild(iframe);
            runtime.isPreviewing = true;
            elements.renderPreviewBtn.textContent = '停止预览';
        } catch (e) {
            overlay.remove();
            alert('预览启动失败：' + e.message);
        }
    }

    function stopPreview() {
        runtime.isPreviewing = false;
        elements.renderPreviewBtn.textContent = '预览';
        const overlay = document.getElementById('preview-overlay');
        if (overlay) overlay.remove();
        resetNativeScene(window);
        cleanupSandbox();
    }

    async function startRender() {
        if (runtime.isRendering) return;

        const settings = getRenderSettings();
        runtime.fps = settings.fps;
        runtime.quality = settings.quality;
        runtime.forceFrameData = settings.forceFrameData;
        runtime.durationMs = settings.duration * 1000;

        elements.renderStartBtn.disabled = true;
        elements.renderPreviewBtn.disabled = true;
        elements.renderProgress.classList.remove('hidden');
        elements.progressFill.style.width = '0%';
        elements.progressText.textContent = '准备渲染（原生播放复用）...';

        try {
            const iframe = await createSandboxIframe(settings, false);
            const sandboxCanvas = findSandboxCanvas();
            if (!sandboxCanvas) throw new Error('沙箱画布未找到');

            const stream = sandboxCanvas.captureStream(runtime.fps);
            let mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/webm;codecs=vp8';
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
            }

            runtime.recordedChunks = [];
            runtime.mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                videoBitsPerSecond: runtime.quality
            });

            runtime.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) runtime.recordedChunks.push(e.data);
            };
            runtime.mediaRecorder.onstop = downloadVideo;

            runtime.isRendering = true;
            runtime.startTimestamp = Date.now();
            const frameIntervalMs = Math.max(1, Math.round(1000 / runtime.fps));
            runtime.mediaRecorder.start(runtime.forceFrameData ? frameIntervalMs : undefined);

            if (runtime.forceFrameData) {
                runtime.frameDataTimer = setInterval(() => {
                    if (!runtime.mediaRecorder || runtime.mediaRecorder.state !== 'recording') return;
                    try {
                        runtime.mediaRecorder.requestData();
                    } catch (_) {
                        // 某些浏览器在状态切换时可能短暂抛错，忽略即可
                    }
                }, frameIntervalMs);
            }

            elements.progressText.textContent = '渲染中（与原生播放一致）...';

            runtime.progressTimer = setInterval(updateProgress, 100);
            runtime.stopTimer = setTimeout(() => stopRender(false), runtime.durationMs);
        } catch (e) {
            alert('渲染启动失败：' + e.message);
            stopRender(true);
        }
    }

    function updateProgress() {
        if (!runtime.isRendering) return;
        const elapsed = Date.now() - runtime.startTimestamp;
        const p = Math.min(elapsed / runtime.durationMs, 1);
        elements.progressFill.style.width = `${p * 100}%`;
        elements.progressText.textContent = `渲染中... ${(p * 100).toFixed(1)}%`;
    }

    function stopRender(cancelled) {
        runtime.isRendering = false;

        if (runtime.progressTimer) {
            clearInterval(runtime.progressTimer);
            runtime.progressTimer = null;
        }
        if (runtime.frameDataTimer) {
            clearInterval(runtime.frameDataTimer);
            runtime.frameDataTimer = null;
        }
        if (runtime.stopTimer) {
            clearTimeout(runtime.stopTimer);
            runtime.stopTimer = null;
        }

        if (runtime.mediaRecorder && runtime.mediaRecorder.state !== 'inactive') {
            runtime.mediaRecorder.stop();
        } else if (cancelled) {
            cleanupAfterRender();
        }

        elements.renderStartBtn.disabled = false;
        elements.renderPreviewBtn.disabled = false;
    }

    function cleanupAfterRender() {
        cleanupSandbox();
        runtime.mediaRecorder = null;
    }

    function cleanupSandbox() {
        if (runtime.sandboxIframe) {
            runtime.sandboxIframe.remove();
            runtime.sandboxIframe = null;
        }
    }

    function downloadVideo() {
        if (!runtime.recordedChunks.length) {
            alert('没有录制到数据！');
            cleanupAfterRender();
            return;
        }

        const blob = new Blob(runtime.recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sban_render_${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        elements.progressFill.style.width = '100%';
        elements.progressText.textContent = '渲染完成，已开始下载';

        cleanupAfterRender();
        elements.renderDialog.classList.add('hidden');
        alert('视频下载完成！');
    }

    return { init };
})();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        RenderModule.init();
    });
} else {
    RenderModule.init();
}
