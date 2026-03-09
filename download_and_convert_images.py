#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动下载bilibili图片并转换为webp格式
同时更新HTML和JS文件中的图片引用
"""

import os
import re
import requests
from PIL import Image
from io import BytesIO
from urllib.parse import urlparse
import hashlib

# 配置
IMAGE_DIR = "images"  # 图片保存目录
QUALITY = 85  # webp质量 (1-100)

# 需要处理的文件
FILES_TO_UPDATE = [
    "index.html",
    "projects.js"
]

def ensure_dir(directory):
    """确保目录存在"""
    if not os.path.exists(directory):
        os.makedirs(directory)
        print(f"✓ 创建目录: {directory}")

def download_image(url):
    """下载图片"""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com/'
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.content
    except Exception as e:
        print(f"✗ 下载失败 {url}: {e}")
        return None

def convert_to_webp(image_data, output_path, quality=85):
    """将图片转换为webp格式"""
    try:
        img = Image.open(BytesIO(image_data))
        # 如果是RGBA模式，转换为RGB
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode in ('RGBA', 'LA') else None)
            img = background
        
        img.save(output_path, 'WEBP', quality=quality, method=6)
        return True
    except Exception as e:
        print(f"✗ 转换失败: {e}")
        return False

def generate_filename(url):
    """根据URL生成文件名"""
    # 使用URL的hash作为文件名，避免重复和特殊字符问题
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    return f"bili_{url_hash}.webp"

def find_bilibili_images(content):
    """查找内容中的bilibili图片URL"""
    pattern = r'https?://i[0-9]\.hdslb\.com/bfs/[^\s"\'\)>]+'
    return re.findall(pattern, content)

def process_file(filepath):
    """处理单个文件"""
    print(f"\n处理文件: {filepath}")
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"✗ 读取文件失败: {e}")
        return
    
    # 查找所有bilibili图片URL
    image_urls = find_bilibili_images(content)
    
    if not image_urls:
        print("  未找到bilibili图片")
        return
    
    print(f"  找到 {len(image_urls)} 个bilibili图片")
    
    # 下载并转换图片
    url_mapping = {}  # 旧URL -> 新URL的映射
    
    for url in image_urls:
        print(f"  处理: {url}")
        
        # 下载图片
        image_data = download_image(url)
        if not image_data:
            continue
        
        # 生成文件名
        filename = generate_filename(url)
        output_path = os.path.join(IMAGE_DIR, filename)
        
        # 转换为webp
        if convert_to_webp(image_data, output_path, QUALITY):
            new_url = f"{IMAGE_DIR}/{filename}"
            url_mapping[url] = new_url
            print(f"    ✓ 保存为: {new_url}")
        else:
            print(f"    ✗ 转换失败")
    
    # 更新文件内容
    if url_mapping:
        new_content = content
        for old_url, new_url in url_mapping.items():
            new_content = new_content.replace(old_url, new_url)
        
        # 写回文件
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"  ✓ 已更新文件中的 {len(url_mapping)} 个图片引用")
        except Exception as e:
            print(f"  ✗ 写入文件失败: {e}")

def main():
    """主函数"""
    print("=" * 60)
    print("Bilibili图片下载与转换工具")
    print("=" * 60)
    
    # 确保图片目录存在
    ensure_dir(IMAGE_DIR)
    
    # 处理每个文件
    for filepath in FILES_TO_UPDATE:
        if os.path.exists(filepath):
            process_file(filepath)
        else:
            print(f"\n✗ 文件不存在: {filepath}")
    
    print("\n" + "=" * 60)
    print("处理完成！")
    print("=" * 60)

if __name__ == "__main__":
    main()
