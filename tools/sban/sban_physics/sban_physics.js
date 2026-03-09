const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Events = Matter.Events,
      Body = Matter.Body;

// 状态管理
const state = {
    stage: 0, 
    subtitleBodies: [],
    subtitleTimer: null,
    physicsReleaseTimer: null,
    startTime: 0,
    duration: 8000, 
    delay: 3000,
    physicsReleaseTime: 3000,
    subtitleText: "全てあなたの所為です。",
    charGap: -2,
    lineGap: 55,
    fontFamily: "Noto Sans JP Black",
    kanjiSize: 85,
    kanaSize: 70,
    // 新增选项
    globalScale: 100,
    showCollision: false,
    subtitleMotion: "moving",
    hideSubtitle: false,
    rotationStart: 0,
    rotationEnd: 0,
    randomVelocity: 0,
    velocityAngleStart: 0,
    velocityAngleEnd: 0,
    dropDelay: 0,
    motionBlur: false,
    customFontName: null,
    customFontLoaded: false
};

// UI 元素
const uiLayer = document.getElementById('ui-layer');
const playBtn = document.getElementById('play-btn');
const inputText = document.getElementById('input-text');
const subtitleTextInput = document.getElementById('subtitle-text');
const charGapInput = document.getElementById('char-gap');
const lineGapInput = document.getElementById('line-gap');
const subtitleDurationInput = document.getElementById('subtitle-duration');
const startDelayInput = document.getElementById('start-delay');
const physicsReleaseTimeInput = document.getElementById('physics-release-time');
const fontFamilyInput = document.getElementById('font-family');
const kanjiSizeInput = document.getElementById('kanji-size');
const kanaSizeInput = document.getElementById('kana-size');
// 新增UI元素
const globalScaleInput = document.getElementById('global-scale');
const showCollisionInput = document.getElementById('show-collision');
const subtitleMotionInput = document.getElementById('subtitle-motion');
const hideSubtitleInput = document.getElementById('hide-subtitle');
const rotationStartInput = document.getElementById('rotation-start');
const rotationEndInput = document.getElementById('rotation-end');
const randomVelocityInput = document.getElementById('random-velocity');
const velocityAngleStartInput = document.getElementById('velocity-angle-start');
const velocityAngleEndInput = document.getElementById('velocity-angle-end');
const dropDelayInput = document.getElementById('drop-delay');
const motionBlurInput = document.getElementById('motion-blur');
// 自定义字体相关UI元素
const customFontGroup = document.getElementById('custom-font-group');
const customFontFile = document.getElementById('custom-font-file');
const customFontNameDisplay = document.getElementById('custom-font-name');

// 字符类型判断函数
function isKanji(char) {
    const code = char.charCodeAt(0);
    // CJK统一汉字: 4E00-9FFF
    // CJK扩展A: 3400-4DBF
    // CJK扩展B及以上: 20000-2EBEF
    return (code >= 0x4E00 && code <= 0x9FFF) || 
           (code >= 0x3400 && code <= 0x4DBF) ||
           (code >= 0x20000 && code <= 0x2EBEF);
}

function getCharFontSize(char) {
    return isKanji(char) ? state.kanjiSize : state.kanaSize;
}

function getFontString(char) {
    const size = getCharFontSize(char);
    return `900 ${size}px '${state.fontFamily}'`;
}

// ========== 文字轮廓检测与碰撞箱生成 ==========

// 从文字生成精确的多边形碰撞箱
function generateCharCollisionShape(char) {
    const fontSize = getCharFontSize(char);
    const font = getFontString(char);
    
    // 创建临时画布
    const canvas = document.createElement('canvas');
    const padding = Math.ceil(fontSize * 0.3);
    canvas.width = fontSize * 2 + padding * 2;
    canvas.height = fontSize * 2 + padding * 2;
    const ctx = canvas.getContext('2d');
    
    // 绘制文字
    ctx.fillStyle = '#ffffff';
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, canvas.width / 2, canvas.height / 2);
    
    // 获取像素数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // 检测文字边界
    const bounds = detectTextBounds(pixels, canvas.width, canvas.height);
    if (!bounds) {
        // 如果检测失败，返回简单的圆形数据
        const radius = fontSize / 2 * 0.85;
        return { type: 'circle', radius };
    }
    
    // 提取轮廓点
    const contourPoints = traceContour(pixels, canvas.width, canvas.height, bounds);
    
    if (contourPoints.length < 3) {
        // 轮廓点太少，使用圆形
        const radius = fontSize / 2 * 0.85;
        return { type: 'circle', radius };
    }
    
    // 简化轮廓（减少顶点数量）
    const simplifiedPoints = simplifyContour(contourPoints, 2.0);
    
    // 转换为相对于中心的坐标
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const vertices = simplifiedPoints.map(p => ({
        x: p.x - centerX,
        y: p.y - centerY
    }));
    
    // 确保顶点数量合理（Matter.js 对复杂多边形性能较差）
    if (vertices.length > 32) {
        const furtherSimplified = simplifyContour(contourPoints, 4.0);
        const newVertices = furtherSimplified.map(p => ({
            x: p.x - centerX,
            y: p.y - centerY
        }));
        return { type: 'polygon', vertices: newVertices };
    }
    
    return { type: 'polygon', vertices };
}

// 检测文字的边界框
function detectTextBounds(pixels, width, height) {
    let minX = width, minY = height, maxX = 0, maxY = 0;
    let hasPixel = false;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 30) {
                hasPixel = true;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    if (!hasPixel) return null;
    
    return { minX, minY, maxX, maxY };
}

// 轮廓追踪算法（简化版 Marching Squares）
function traceContour(pixels, width, height, bounds) {
    const { minX, minY, maxX, maxY } = bounds;
    const contour = [];
    const step = 2; // 采样步长，提高性能
    
    // 从上边界开始追踪
    for (let x = minX; x <= maxX; x += step) {
        for (let y = minY; y <= maxY; y++) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 30) {
                contour.push({ x, y });
                break;
            }
        }
    }
    
    // 右边界
    for (let y = minY; y <= maxY; y += step) {
        for (let x = maxX; x >= minX; x--) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 30) {
                contour.push({ x, y });
                break;
            }
        }
    }
    
    // 下边界
    for (let x = maxX; x >= minX; x -= step) {
        for (let y = maxY; y >= minY; y--) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 30) {
                contour.push({ x, y });
                break;
            }
        }
    }
    
    // 左边界
    for (let y = maxY; y >= minY; y -= step) {
        for (let x = minX; x <= maxX; x++) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha > 30) {
                contour.push({ x, y });
                break;
            }
        }
    }
    
    return contour;
}

// Douglas-Peucker 算法简化轮廓
function simplifyContour(points, tolerance) {
    if (points.length <= 2) return points;
    
    // 找到距离起点和终点连线最远的点
    let maxDistance = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];
    
    for (let i = 1; i < points.length - 1; i++) {
        const distance = perpendicularDistance(points[i], first, last);
        if (distance > maxDistance) {
            maxDistance = distance;
            maxIndex = i;
        }
    }
    
    // 如果最大距离大于阈值，递归简化
    if (maxDistance > tolerance) {
        const left = simplifyContour(points.slice(0, maxIndex + 1), tolerance);
        const right = simplifyContour(points.slice(maxIndex), tolerance);
        return left.slice(0, -1).concat(right);
    } else {
        return [first, last];
    }
}

// 计算点到线段的垂直距离
function perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const norm = Math.sqrt(dx * dx + dy * dy);
    
    if (norm === 0) {
        const pdx = point.x - lineStart.x;
        const pdy = point.y - lineStart.y;
        return Math.sqrt(pdx * pdx + pdy * pdy);
    }
    
    const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (norm * norm);
    const closestX = lineStart.x + u * dx;
    const closestY = lineStart.y + u * dy;
    const distX = point.x - closestX;
    const distY = point.y - closestY;
    
    return Math.sqrt(distX * distX + distY * distY);
}

// 1. 初始化物理引擎
const engine = Engine.create();

const render = Render.create({
    element: document.getElementById('canvas-container'),
    engine: engine,
    options: {
        width: window.innerWidth,
        height: window.innerHeight,
        background: '#000000',
        wireframes: false, 
        showAngleIndicator: false
    }
});

// 2. 自定义渲染循环
Events.on(render, 'afterRender', function() {
    const context = render.context;
    const bodies = Composite.allBodies(engine.world);

    // 运动模糊效果
    if (state.motionBlur && state.stage > 0) {
        context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        context.fillRect(0, 0, render.options.width, render.options.height);
    }

    // 只在非 wireframes 模式下绘制文字
    if (!render.options.wireframes) {
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillStyle = "#FFFFFF";

        bodies.forEach(body => {
            if (body.label === 'char-body' || body.label === 'subtitle-char') {
                // 隐藏字幕功能
                if (body.label === 'subtitle-char' && state.hideSubtitle) {
                    return;
                }
                
                const char = body.render.text;
                context.font = getFontString(char);
                
                context.save();
                context.translate(body.position.x, body.position.y);
                context.rotate(body.angle);
                context.fillText(char, 0, 0);
                context.restore();
            }
        });
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// 3. 交互逻辑
playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startAnimation();
});

// 按任意键退出功能（除全屏键F11）
document.addEventListener('keydown', (e) => {
    // 在 stage 2 或 3 时，按任意键（除F11全屏键）退出回设置
    if (state.stage >= 2 && e.key !== 'F11') {
        e.preventDefault();
        resetToHome();
    }
});

function resetToHome() {
    // 清除所有物理对象
    const bodies = Composite.allBodies(engine.world);
    bodies.forEach(body => {
        if (body.label === 'char-body' || body.label === 'subtitle-char') {
            Composite.remove(engine.world, body);
        }
    });
    
    // 清除定时器
    if (state.subtitleTimer) {
        clearTimeout(state.subtitleTimer);
        state.subtitleTimer = null;
    }
    if (state.physicsReleaseTimer) {
        clearTimeout(state.physicsReleaseTimer);
        state.physicsReleaseTimer = null;
    }
    
    // 重置状态
    state.stage = 0;
    state.subtitleBodies = [];
    
    // 显示UI层
    uiLayer.classList.remove('hidden');
    
    // 重置渲染选项
    render.options.wireframes = false;
}

function startAnimation() {
    // 读取用户设置
    state.subtitleText = subtitleTextInput.value || "全てあなたの所為です。";
    state.charGap = parseInt(charGapInput.value) || -2;
    state.lineGap = parseInt(lineGapInput.value) || 55;
    state.duration = (parseInt(subtitleDurationInput.value) || 8) * 1000;
    state.delay = (parseInt(startDelayInput.value) || 3) * 1000;
    state.physicsReleaseTime = (parseInt(physicsReleaseTimeInput.value) || 3) * 1000;
    // 如果不是自定义字体，才更新 fontFamily；自定义字体已经在加载时设置了
    if (fontFamilyInput.value !== 'custom') {
        state.fontFamily = fontFamilyInput.value || "Noto Sans JP Black";
    }
    state.kanjiSize = parseInt(kanjiSizeInput.value) || 85;
    state.kanaSize = parseInt(kanaSizeInput.value) || 70;
    
    // 读取新增设置
    state.globalScale = parseInt(globalScaleInput.value) || 100;
    state.showCollision = showCollisionInput.value === 'true';
    state.subtitleMotion = subtitleMotionInput.value || 'moving';
    state.hideSubtitle = hideSubtitleInput.value === 'true';
    state.rotationStart = parseInt(rotationStartInput.value) || 0;
    state.rotationEnd = parseInt(rotationEndInput.value) || 0;
    state.randomVelocity = parseInt(randomVelocityInput.value) || 0;
    state.velocityAngleStart = parseInt(velocityAngleStartInput.value) || 0;
    state.velocityAngleEnd = parseInt(velocityAngleEndInput.value) || 0;
    state.dropDelay = parseInt(dropDelayInput.value) || 0;
    state.motionBlur = motionBlurInput.value === 'true';
    
    // 应用全局缩放
    const scale = state.globalScale / 100;
    state.kanjiSize = Math.round(state.kanjiSize * scale);
    state.kanaSize = Math.round(state.kanaSize * scale);
    state.lineGap = Math.round(state.lineGap * scale);
    
    // 应用Debug显示碰撞箱
    render.options.wireframes = state.showCollision;

    uiLayer.classList.add('hidden');
    state.stage = 1;

    state.subtitleTimer = setTimeout(() => {
        initSubtitle();
    }, state.delay);
}

function initSubtitle() {
    state.stage = 2;
    state.startTime = Date.now();

    const subtitleText = state.subtitleText;
    const charGap = state.charGap;
    
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    // 找到最大字号作为基准（用于底部对齐）
    const maxFontSize = Math.max(state.kanjiSize, state.kanaSize);

    let totalWidth = 0;
    const charData = [];
    for (let char of subtitleText) {
        ctx.font = getFontString(char);
        const charWidth = ctx.measureText(char).width;
        const fontSize = getCharFontSize(char);
        // 计算该字符相对于基线的偏移（较小字号需要向下偏移）
        const baselineOffset = (maxFontSize - fontSize) / 2;
        charData.push({ char, width: charWidth, fontSize, baselineOffset });
        totalWidth += charWidth + charGap;
    }
    totalWidth -= charGap;

    const startX = (window.innerWidth - totalWidth) / 2;
    // 根据运动方式决定初始位置
    let baseY;
    if (state.subtitleMotion === 'static') {
        baseY = window.innerHeight / 2; // 屏幕正中间
    } else {
        baseY = window.innerHeight + 60; // 从下往上
    }
    
    let currentX = startX;

    charData.forEach(item => {
        // 生成精确的碰撞箱形状
        const collisionShape = generateCharCollisionShape(item.char);
        
        // 应用底部对齐偏移
        const adjustedY = baseY + item.baselineOffset;
        
        let body;
        if (collisionShape.type === 'polygon') {
            // 使用多边形碰撞箱
        body = Bodies.fromVertices(
            currentX + item.width / 2, 
            adjustedY, 
            [collisionShape.vertices],
            { 
                isStatic: true, 
                label: 'subtitle-char',
                restitution: 0.5, 
                friction: 0.5,
                render: { 
                    visible: state.showCollision,
                    text: item.char
                },
                inertia: Infinity, 
                angle: 0
            },
            true
        );
        } else {
            // 使用圆形碰撞箱（回退方案）
            body = Bodies.circle(
                currentX + item.width / 2, 
                adjustedY, 
                collisionShape.radius, 
                { 
                    isStatic: true, 
                    label: 'subtitle-char',
                    restitution: 0.5, 
                    friction: 0.5,
                    render: { 
                        visible: state.showCollision,
                        text: item.char
                    }, 
                    inertia: Infinity, 
                    angle: 0
                }
            );
        }
        
        state.subtitleBodies.push(body);
        Composite.add(engine.world, body);
        
        currentX += item.width + charGap;
    });

    // 设置定时器自动释放物理文字
    state.physicsReleaseTimer = setTimeout(() => {
        const text = inputText.value;
        if (text.trim()) {
            spawnPhysicsText(text);
            state.stage = 3;
        }
    }, state.physicsReleaseTime);
}

// 4. 动画循环
Events.on(engine, 'beforeUpdate', function() {
    if (state.subtitleBodies.length > 0) {
        // 预计算字幕字符宽度和底部对齐偏移
        const subtitleText = state.subtitleText;
        const charGap = state.charGap;
        const tempCanvas = document.createElement('canvas');
        const ctx = tempCanvas.getContext('2d');
        
        // 找到最大字号作为基准
        const maxFontSize = Math.max(state.kanjiSize, state.kanaSize);
        
        let totalWidth = 0;
        const charData = [];
        for (let char of subtitleText) {
            ctx.font = getFontString(char);
            const w = ctx.measureText(char).width;
            const fontSize = getCharFontSize(char);
            const baselineOffset = (maxFontSize - fontSize) / 2;
            charData.push({ width: w, baselineOffset });
            totalWidth += w + charGap;
        }
        totalWidth -= charGap;
        
        if (state.subtitleMotion === 'static') {
            // 静止模式：保持在屏幕中间
            const baseY = window.innerHeight / 2;
            state.subtitleBodies.forEach((body, index) => {
                let xOffset = 0;
                for (let i = 0; i < index; i++) {
                    xOffset += charData[i].width + charGap;
                }
                const newX = (window.innerWidth - totalWidth) / 2 + xOffset + charData[index].width / 2;
                const newY = baseY + charData[index].baselineOffset;
                Body.setPosition(body, { x: newX, y: newY });
                Body.setVelocity(body, { x: 0, y: 0 });
            });
        } else {
            // 运动模式：从下往上
            const now = Date.now();
            const elapsed = now - state.startTime;
            const progress = elapsed / state.duration;

            const startPixel = window.innerHeight + 60;
            const endPixel = -200;
            const totalDistance = startPixel - endPixel;
            const baseY = startPixel - (progress * totalDistance);
            
            state.subtitleBodies.forEach((body, index) => {
                let xOffset = 0;
                for (let i = 0; i < index; i++) {
                    xOffset += charData[i].width + charGap;
                }
                const newX = (window.innerWidth - totalWidth) / 2 + xOffset + charData[index].width / 2;
                const newY = baseY + charData[index].baselineOffset;
                Body.setPosition(body, { x: newX, y: newY });
                
                const velocityY = - (totalDistance / state.duration) * (1000 / 60); 
                Body.setVelocity(body, { x: 0, y: velocityY });
            });

            if (baseY < -300) {
                state.subtitleBodies.forEach(body => {
                    Composite.remove(engine.world, body);
                });
                state.subtitleBodies = [];
            }
        }
    }

    // 性能优化：清理飞出太远的文字
    // 按需求移除“上边界”和“左右边界”清理逻辑，避免大行间距时顶部文字被提前删除。
    // 仅保留下方超远距离清理，防止无限堆积影响性能。
    const bodies = Composite.allBodies(engine.world);
    bodies.forEach(body => {
        if (body.label === 'char-body') {
            if (body.position.y > window.innerHeight + 5000000) {
                Composite.remove(engine.world, body);
            }
        }
    });
});

// 文本排版与生成逻辑
function spawnPhysicsText(text) {
    const lines = text.split('\n');
    const lineGap = state.lineGap; 
    const charGap = state.charGap; 
    
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');

    let allChars = [];

    const lineWidths = lines.map(line => {
        let w = 0;
        for(let char of line) {
            if(char === ' ') {
                ctx.font = getFontString(' ');
                w += ctx.measureText(' ').width + charGap;
                continue;
            }
            ctx.font = getFontString(char);
            w += ctx.measureText(char).width + charGap;
        }
        return w;
    });

    const maxLineWidth = Math.max(...lineWidths, 0);
    const startX = (window.innerWidth - maxLineWidth) / 2;
    
    const totalHeight = lines.length * lineGap;
    const marginFromTop = 50;
    const startY = -marginFromTop - totalHeight; 

    lines.forEach((line, lineIndex) => {
        const currentLineWidth = lineWidths[lineIndex];
        const lineStartX = startX + (maxLineWidth - currentLineWidth) / 2;

        let currentX = lineStartX;
        const currentY = startY + (lineIndex * lineGap);

        for (let char of line) {
            if (char === ' ') {
                ctx.font = getFontString(' ');
                currentX += ctx.measureText(' ').width + charGap;
                continue;
            }
            
            ctx.font = getFontString(char);
            const charWidth = ctx.measureText(char).width;
            const fontSize = getCharFontSize(char);
            
            allChars.push({
                char: char,
                x: currentX + charWidth / 2,
                y: currentY,
                radius: Math.max(charWidth, fontSize) / 2 * 0.85
            });

            currentX += charWidth + charGap;
        }
    });

    // 延迟掉落功能
    if (state.dropDelay > 0) {
        // 从下到上逐个物理化
        allChars.reverse().forEach((item, index) => {
            setTimeout(() => {
                createCharBody(item);
            }, index * state.dropDelay);
        });
    } else {
        // 立即创建所有字符
        allChars.forEach(item => {
            createCharBody(item);
        });
    }
}

// 创建单个字符物理体
// 注意：此函数为每个字符独立生成随机参数（旋转角度、速度等）
// 如果启用了延迟掉落，随机参数会在该字符实际创建时才生成，而不是提前计算
function createCharBody(item) {
    // 为当前字符独立生成随机旋转角度
    let initialAngle = 0;
    if (state.rotationStart !== 0 || state.rotationEnd !== 0) {
        const minAngle = Math.min(state.rotationStart, state.rotationEnd);
        const maxAngle = Math.max(state.rotationStart, state.rotationEnd);
        // 每次调用都会生成新的随机数
        initialAngle = (minAngle + Math.random() * (maxAngle - minAngle)) * (Math.PI / 180);
    }
    
    // 生成精确的碰撞箱形状
    const collisionShape = generateCharCollisionShape(item.char);
    
    let body;
    if (collisionShape.type === 'polygon') {
        // 使用多边形碰撞箱
        body = Bodies.fromVertices(
            item.x, 
            item.y, 
            [collisionShape.vertices],
            {
                restitution: 0.6, 
                friction: 0.3,    
                frictionAir: 0.01,
                density: 0.05,
                label: 'char-body',
                render: {
                    visible: state.showCollision,
                    text: item.char
                },
                angle: initialAngle
            },
            true
        );
    } else {
        // 使用圆形碰撞箱（回退方案）
        body = Bodies.circle(item.x, item.y, collisionShape.radius, {
            restitution: 0.6, 
            friction: 0.3,    
            frictionAir: 0.01,
            density: 0.05,
            label: 'char-body',
            render: {
                visible: state.showCollision,
                text: item.char
            },
            angle: initialAngle
        });
    }
    
    // 为当前字符独立生成随机初始速度
    if (state.randomVelocity > 0) {
        const velocity = state.randomVelocity / 10;
        let angle = 0;
        
        // 为当前字符独立生成随机速度角度
        if (state.velocityAngleStart !== 0 || state.velocityAngleEnd !== 0) {
            const minAngle = Math.min(state.velocityAngleStart, state.velocityAngleEnd);
            const maxAngle = Math.max(state.velocityAngleStart, state.velocityAngleEnd);
            // 每次调用都会生成新的随机角度
            angle = (minAngle + Math.random() * (maxAngle - minAngle)) * (Math.PI / 180);
        }
        
        const vx = velocity * Math.cos(angle);
        const vy = velocity * Math.sin(angle);
        Body.setVelocity(body, { x: vx, y: vy });
    } else {
        Body.setVelocity(body, { x: 0, y: 0 });
    }
    
    Composite.add(engine.world, body);
}

window.addEventListener('resize', () => {
    render.canvas.width = window.innerWidth;
    render.canvas.height = window.innerHeight;
});

// 实时预览功能
const subtitlePreview = document.getElementById('subtitle-preview');
let scrollAnimationId = null;
let scrollWrapper = null;

function isKanjiForPreview(char) {
    const code = char.charCodeAt(0);
    return (code >= 0x4E00 && code <= 0x9FFF) || 
           (code >= 0x3400 && code <= 0x4DBF) ||
           (code >= 0x20000 && code <= 0x2EBEF);
}

function startAutoScroll() {
    // 停止之前的滚动动画
    if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
    }
    
    if (!scrollWrapper) return;
    
    const container = subtitlePreview;
    const containerHeight = container.offsetHeight;
    const contentHeight = scrollWrapper.offsetHeight / 2; // 因为内容被复制了一份
    
    // 如果内容高度小于容器高度，不需要滚动
    if (contentHeight <= containerHeight) {
        scrollWrapper.style.transform = 'translateY(0)';
        return;
    }
    
    let scrollPosition = 0;
    const scrollSpeed = 0.5; // 每帧滚动的像素数，可以调整速度
    
    function animate() {
        scrollPosition += scrollSpeed;
        
        // 当滚动到一半时（即原始内容滚动完毕），重置到开始位置
        if (scrollPosition >= contentHeight) {
            scrollPosition = 0;
        }
        
        scrollWrapper.style.transform = `translateY(-${scrollPosition}px)`;
        scrollAnimationId = requestAnimationFrame(animate);
    }
    
    scrollAnimationId = requestAnimationFrame(animate);
}

function updatePreview() {
    const text = inputText.value || "それは万有引力の、\n様なモノであり、\n抗えば抗う程、\n青く燃え上がるのです。";
    // 如果选择了自定义字体，使用 state.fontFamily，否则使用选择的字体
    const fontFamily = (fontFamilyInput.value === 'custom' ? state.fontFamily : fontFamilyInput.value) || "Noto Sans JP Black";
    const kanjiSize = parseInt(kanjiSizeInput.value) || 85;
    const kanaSize = parseInt(kanaSizeInput.value) || 70;
    const charGap = parseInt(charGapInput.value) || -2;
    const lineGap = parseInt(lineGapInput.value) || 55;
    const globalScale = parseInt(globalScaleInput.value) || 100;
    
    // 应用全局缩放
    const scaledKanjiSize = Math.round(kanjiSize * (globalScale / 100));
    const scaledKanaSize = Math.round(kanaSize * (globalScale / 100));
    const scaledLineGap = Math.round(lineGap * (globalScale / 100));
    
    // 清空预览区域
    subtitlePreview.innerHTML = '';
    
    // 创建滚动包装器
    scrollWrapper = document.createElement('div');
    scrollWrapper.style.display = 'flex';
    scrollWrapper.style.flexDirection = 'column';
    scrollWrapper.style.alignItems = 'center';
    
    // 创建内容容器
    const contentContainer = document.createElement('div');
    contentContainer.style.display = 'flex';
    contentContainer.style.flexDirection = 'column';
    contentContainer.style.alignItems = 'center';
    
    // 按行分割文本
    const lines = text.split('\n');
    
    lines.forEach((line, lineIndex) => {
        const lineDiv = document.createElement('div');
        lineDiv.style.display = 'flex';
        lineDiv.style.justifyContent = 'center';
        lineDiv.style.alignItems = 'baseline';
        if (lineIndex > 0) {
            lineDiv.style.marginTop = `${scaledLineGap}px`;
        }
        
        // 为每个字符创建span
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === ' ') continue;
            
            const charSpan = document.createElement('span');
            charSpan.textContent = char;
            charSpan.style.fontFamily = `'${fontFamily}', 'Noto Sans SC', sans-serif`;
            charSpan.style.fontWeight = '900';
            charSpan.style.color = '#fff';
            
            // 根据字符类型设置字号
            if (isKanjiForPreview(char)) {
                charSpan.style.fontSize = `${scaledKanjiSize}px`;
            } else {
                charSpan.style.fontSize = `${scaledKanaSize}px`;
            }
            
            // 设置字间距（除了最后一个字符）
            if (i < line.length - 1) {
                charSpan.style.marginRight = `${charGap}px`;
            }
            
            lineDiv.appendChild(charSpan);
        }
        
        contentContainer.appendChild(lineDiv);
    });
    
    // 将内容添加到滚动包装器（原始内容）
    scrollWrapper.appendChild(contentContainer);
    
    // 克隆内容以实现无缝循环
    const clonedContent = contentContainer.cloneNode(true);
    clonedContent.style.marginTop = `${scaledLineGap}px`;
    scrollWrapper.appendChild(clonedContent);
    
    // 将滚动包装器添加到预览区域
    subtitlePreview.appendChild(scrollWrapper);
    
    // 延迟启动滚动动画，确保DOM已渲染
    setTimeout(() => {
        startAutoScroll();
    }, 100);
}

// 监听所有相关输入的变化
inputText.addEventListener('input', updatePreview);
subtitleTextInput.addEventListener('input', updatePreview);
fontFamilyInput.addEventListener('change', updatePreview);
kanjiSizeInput.addEventListener('input', updatePreview);
kanaSizeInput.addEventListener('input', updatePreview);
charGapInput.addEventListener('input', updatePreview);
lineGapInput.addEventListener('input', updatePreview);
globalScaleInput.addEventListener('input', updatePreview);

// 初始化预览
updatePreview();

// ========== 自定义字体功能 ==========

// 监听字体选择变化
fontFamilyInput.addEventListener('change', function() {
    if (this.value === 'custom') {
        customFontGroup.style.display = 'flex';
        if (!state.customFontLoaded) {
            customFontFile.click(); // 自动打开文件选择对话框
        }
    } else {
        customFontGroup.style.display = 'none';
        state.fontFamily = this.value;
        updatePreview();
    }
});

// 监听自定义字体文件选择
customFontFile.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
        // 如果用户取消选择，恢复到默认字体
        fontFamilyInput.value = 'Noto Sans JP Black';
        customFontGroup.style.display = 'none';
        state.fontFamily = 'Noto Sans JP Black';
        updatePreview();
        return;
    }
    
    // 检查文件类型
    const validExtensions = ['.ttf', '.otf', '.woff', '.woff2'];
    const fileName = file.name.toLowerCase();
    const isValidFont = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidFont) {
        alert('请选择有效的字体文件（.ttf, .otf, .woff, .woff2）');
        fontFamilyInput.value = 'Noto Sans JP Black';
        customFontGroup.style.display = 'none';
        state.fontFamily = 'Noto Sans JP Black';
        updatePreview();
        return;
    }
    
    // 读取字体文件
    const reader = new FileReader();
    reader.onload = function(event) {
        const fontData = event.target.result;
        
        // 生成唯一的字体名称
        const fontName = 'CustomFont_' + Date.now();
        
        // 创建 @font-face 规则
        const fontFace = new FontFace(fontName, fontData);
        
        // 加载字体
        fontFace.load().then(function(loadedFont) {
            // 添加到文档
            document.fonts.add(loadedFont);
            
            // 更新状态
            state.fontFamily = fontName;
            state.customFontName = file.name;
            state.customFontLoaded = true;
            
            // 显示字体名称
            customFontNameDisplay.textContent = `已加载: ${file.name}`;
            customFontNameDisplay.style.color = '#4CAF50';
            
            // 更新预览
            updatePreview();
        }).catch(function(error) {
            console.error('字体加载失败:', error);
            alert('字体加载失败，请尝试其他字体文件');
            fontFamilyInput.value = 'Noto Sans JP Black';
            customFontGroup.style.display = 'none';
            state.fontFamily = 'Noto Sans JP Black';
            state.customFontLoaded = false;
            updatePreview();
        });
    };
    
    reader.onerror = function() {
        alert('文件读取失败');
        fontFamilyInput.value = 'Noto Sans JP Black';
        customFontGroup.style.display = 'none';
        state.fontFamily = 'Noto Sans JP Black';
        updatePreview();
    };
    
    reader.readAsArrayBuffer(file);
});
