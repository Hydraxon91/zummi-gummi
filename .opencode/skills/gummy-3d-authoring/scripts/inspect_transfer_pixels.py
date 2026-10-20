"""Read-only inspection of gradient samples at actual pixel centres, not requested UV points."""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def weights_at(point, tri):
    a, b, c = tri
    denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    if abs(denominator) < 1e-24:
        return None
    x = ((b[1] - c[1]) * (point[0] - c[0]) +
         (c[0] - b[0]) * (point[1] - c[1])) / denominator
    y = ((c[1] - a[1]) * (point[0] - c[0]) +
         (a[0] - c[0]) * (point[1] - c[1])) / denominator
    return (x, y, 1 - x - y)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused report path required')
    ob = bpy.context.scene.objects[args.object]
    mesh = ob.data
    mesh.calc_loop_triangles()
    source = mesh.uv_layers['UVMap']
    target = mesh.uv_layers['UV_AI_Atlas']
    image = bpy.data.images.load(args.image, check_existing=False)
    width, height = image.size
    pixels = np.array(image.pixels[:]).reshape(height, width, 4)
    counts = Counter()
    samples = []
    for tri in mesh.loop_triangles:
        a = [tuple(source.data[k].uv) for k in tri.loops]
        b = [tuple(target.data[k].uv) for k in tri.loops]
        for weights in ((.6, .2, .2), (.2, .6, .2), (.2, .2, .6)):
            uv = [sum(w * p[i] for w, p in zip(weights, b)) for i in (0, 1)]
            x, y = int(uv[0] * width), int(uv[1] * height)
            if not (0 <= x < width and 0 <= y < height):
                counts['out_of_bounds'] += 1
                continue
            pixel_weights = weights_at(((x + .5) / width, (y + .5) / height), b)
            if pixel_weights is None:
                counts['degenerate_target'] += 1
                continue
            if min(pixel_weights) < -1e-9:
                counts['pixel_center_outside_triangle'] += 1
                continue
            expected = np.array([sum(w * p[i] for w, p in zip(pixel_weights, a)) for i in (0, 1)])
            value = pixels[y, x, :3]
            error = float(np.abs(value[:2] - expected).max())
            counts['inside_samples'] += 1
            if abs(float(value[2]) - .5) > .02:
                counts['missing_or_wrong_blue_marker'] += 1
            if error > .03:
                counts['inside_error_over_0.03'] += 1
            samples.append({'face': tri.polygon_index, 'pixel': [x, y], 'error': error,
                            'blue': float(value[2]), 'expected': expected.tolist(),
                            'observed': value[:2].tolist()})
    samples.sort(key=lambda row: -row['error'])
    report = {'object': ob.name, 'triangles': len(mesh.loop_triangles), 'counts': dict(counts),
              'max_inside_error': samples[0]['error'] if samples else None,
              'worst_samples': samples[:12], 'pixel_space': image.colorspace_settings.name,
              'limits': 'Three requested sample locations only; no full-raster coverage claim'}
    out.write_text(json.dumps(report, indent=2))
    print('PIXEL_AUDIT', json.dumps(report))


if __name__ == '__main__':
    main()
