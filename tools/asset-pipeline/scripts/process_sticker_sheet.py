"""Blender-side sticker extraction; explicit crops, preserved RGB, optional grading.

Inputs use top-left pixel crop rectangles. A closed bright die-cut border is required:
this is not a general background remover. Holes enclosed by the border are filled.
Raw files are never overwritten. Run tests in disposable background Blender.
"""
from collections import deque

import numpy as np


def enclosed_mask(rgb, white_threshold=0.90, chroma_threshold=0.08):
    barrier = ((rgb.min(axis=2) >= white_threshold) |
               (rgb.max(axis=2) - rgb.min(axis=2) >= chroma_threshold))
    h, w = barrier.shape
    exterior = np.zeros((h, w), dtype=bool)
    queue = deque()
    for y, x in ([(0, x) for x in range(w)] + [(h-1, x) for x in range(w)] +
                 [(y, 0) for y in range(h)] + [(y, w-1) for y in range(h)]):
        if not barrier[y, x] and not exterior[y, x]:
            exterior[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y-1, x), (y+1, x), (y, x-1), (y, x+1)):
            if 0 <= yy < h and 0 <= xx < w and not barrier[yy, xx] and not exterior[yy, xx]:
                exterior[yy, xx] = True
                queue.append((yy, xx))
    return ~exterior


def extract(rgb, saturation=1.0, contrast=1.0):
    mask = enclosed_mask(rgb)
    if not mask.any() or mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any():
        raise ValueError('Crop must contain one sticker with an empty border')
    result = np.zeros((*rgb.shape[:2], 4), dtype=np.float32)
    luma = (rgb * np.array([0.2126, 0.7152, 0.0722])).sum(axis=2, keepdims=True)
    graded = np.clip((luma + saturation * (rgb-luma) - 0.5) * contrast + 0.5, 0, 1)
    # Preserve neutral white die-cut edging; grade only the coloured illustration.
    coloured = rgb.max(axis=2)-rgb.min(axis=2) >= 0.08
    result[:, :, :3] = np.where(coloured[:, :, None], graded, rgb)
    result[:, :, 3] = mask.astype(np.float32)
    return result


def process(raw_path, output_path, crops, saturation=1.0, contrast=1.0):
    import bpy
    from pathlib import Path
    if Path(output_path).exists():
        raise FileExistsError(output_path)
    source = bpy.data.images.load(str(raw_path), check_existing=False)
    output = None
    try:
        source.colorspace_settings.name = 'Non-Color'
        w, h = source.size
        # Blender pixels are bottom-up; crop definitions are top-down.
        rgb = np.array(source.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
        sheet = np.zeros((h, w, 4), dtype=np.float32)
        for x0, y0, x1, y1 in crops:
            if not (0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h):
                raise ValueError('Crop outside image')
            sheet[y0:y1, x0:x1] = extract(rgb[y0:y1, x0:x1], saturation, contrast)
        output = bpy.data.images.new('StickerProcessingTemporary', width=w, height=h, alpha=True)
        output.colorspace_settings.name = 'Non-Color'
        output.pixels = sheet[::-1].reshape(-1).tolist()
        output.file_format = 'PNG'
        output.filepath_raw = str(output_path)
        output.save()
        return {'size': [w, h], 'opaque_pixels': int(sheet[:, :, 3].sum()),
                'saturation': saturation, 'contrast': contrast,
                'limits': ['Closed white-border artwork only', 'Binary alpha; edge quality needs visual review']}
    finally:
        bpy.data.images.remove(source)
        if output is not None:
            bpy.data.images.remove(output)
