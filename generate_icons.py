#!/usr/bin/env python3
"""
图标生成脚本
- 裁剪为正方形（居中裁剪）
- 添加透明通道（去除白色背景）
- 生成多种尺寸
- 转换为 .ico 和 .icns 格式
"""

from PIL import Image
import os
import sys
import subprocess
import shutil

def make_transparent(img, threshold=240):
    """将接近白色的背景转换为透明"""
    img = img.convert('RGBA')
    datas = img.getdata()
    newData = []

    for item in datas:
        # 如果像素接近白色，则设为透明
        if item[0] > threshold and item[1] > threshold and item[2] > threshold:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    return img

def crop_to_square(img, position='center'):
    """裁剪图片为正方形"""
    width, height = img.size

    if width == height:
        return img

    if width > height:
        # 宽大于高，裁剪宽度
        if position == 'center':
            left = (width - height) // 2
        elif position == 'left':
            left = 0
        elif position == 'right':
            left = width - height
        else:
            left = (width - height) // 2

        top = 0
        right = left + height
        bottom = height
    else:
        # 高大于宽，裁剪高度
        left = 0
        if position == 'center':
            top = (height - width) // 2
        elif position == 'top':
            top = 0
        elif position == 'bottom':
            top = height - width
        else:
            top = (height - width) // 2

        right = width
        bottom = top + width

    return img.crop((left, top, right, bottom))

def create_icons(input_path, output_dir='icons'):
    """生成各种尺寸和格式的图标"""
    print(f"处理图片: {input_path}")

    # 打开原始图片
    img = Image.open(input_path)
    print(f"原始尺寸: {img.size}")

    # 裁剪为正方形（居中裁剪）
    print("裁剪为正方形...")
    square_img = crop_to_square(img, position='center')
    print(f"裁剪后尺寸: {square_img.size}")

    # 添加透明通道
    print("添加透明通道...")
    transparent_img = make_transparent(square_img, threshold=240)

    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 保存正方形 PNG（带透明通道）
    square_path = os.path.join(output_dir, 'icon_square.png')
    transparent_img.save(square_path, 'PNG')
    print(f"保存正方形图标: {square_path}")

    # 生成多种尺寸的 PNG
    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    png_files = []

    for size in sizes:
        resized = transparent_img.resize((size, size), Image.Resampling.LANCZOS)
        filename = f'icon_{size}x{size}.png'
        filepath = os.path.join(output_dir, filename)
        resized.save(filepath, 'PNG')
        png_files.append(filepath)
        print(f"生成尺寸: {size}x{size}")

    # 生成 .ico 文件 (Windows)
    print("\n生成 .ico 文件...")
    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_images = []
    for size in ico_sizes:
        resized = transparent_img.resize((size, size), Image.Resampling.LANCZOS)
        ico_images.append(resized)

    ico_path = os.path.join(output_dir, 'icon.ico')
    # Pillow 的 .ico 格式支持多尺寸
    ico_images[0].save(
        ico_path,
        format='ICO',
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:]
    )
    print(f"生成 .ico 文件: {ico_path}")

    # 生成 .icns 文件 (macOS)
    # 注意：Pillow 不直接支持 .icns，需要使用 iconutil (仅 macOS)
    print("\n生成 .icns 文件...")
    if sys.platform == 'darwin':
        # macOS 使用 iconutil
        iconset_dir = os.path.join(output_dir, 'icon.iconset')
        os.makedirs(iconset_dir, exist_ok=True)

        # iconset 需要的特定尺寸和命名
        iconset_sizes = [
            ('icon_16x16.png', 16),
            ('icon_16x16@2x.png', 32),
            ('icon_32x32.png', 32),
            ('icon_32x32@2x.png', 64),
            ('icon_128x128.png', 128),
            ('icon_128x128@2x.png', 256),
            ('icon_256x256.png', 256),
            ('icon_256x256@2x.png', 512),
            ('icon_512x512.png', 512),
            ('icon_512x512@2x.png', 1024),
        ]

        for filename, size in iconset_sizes:
            resized = transparent_img.resize((size, size), Image.Resampling.LANCZOS)
            filepath = os.path.join(iconset_dir, filename)
            resized.save(filepath, 'PNG')

        # 使用 subprocess 安全地调用 iconutil
        icns_path = os.path.join(output_dir, 'icon.icns')
        subprocess.run(['iconutil', '-c', 'icns', '-o', icns_path, iconset_dir], check=True)
        print(f"生成 .icns 文件: {icns_path}")

        # 清理临时 iconset 目录
        shutil.rmtree(iconset_dir)
    else:
        print("警告：非 macOS 系统，无法生成 .icns 文件")

    print(f"\n✅ 所有图标已生成在: {output_dir}/")
    print(f"  - icon_square.png: 正方形 PNG（带透明通道）")
    print(f"  - icon.ico: Windows 图标")
    print(f"  - icon.icns: macOS 图标")
    print(f"  - icon_16x16.png ~ icon_1024x1024.png: 各种尺寸 PNG")

if __name__ == '__main__':
    input_file = '/Users/pyu/Desktop/5183aa6f-6a6a-49c0-b7cf-49e83d8044b5.png'
    output_dir = './icons'

    create_icons(input_file, output_dir)
