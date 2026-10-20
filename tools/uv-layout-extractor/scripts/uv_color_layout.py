"""Export a polished coloured UV layout.

Read-only. Renders one deterministic colour per island, in guide-ID order, on a dark
technical sheet with a 0-1 frame. It carries no title, labels or statistics.
"""
import argparse
import colorsys
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np


def load_core():
    spec = importlib.util.spec_from_file_location('uv_colour_core',
                                                  Path(__file__).with_name('uv_core.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def colour_for(identifier):
    hue = (identifier * 0.618033988749895 + 0.07) % 1.0
    saturation = 0.50
    value = 0.92 + 0.06 * ((identifier % 3) / 2.0)
    red, green, blue = colorsys.hsv_to_rgb(hue, saturation, value)
    return (int(red * 255), int(green * 255), int(blue * 255))


def render(mesh, layer, islands, core, size, out, force=False):
    margin = max(8, size // 50)
    side = size - 2 * margin
    x0 = y0 = margin
    background = (12, 15, 20)
    square_background = (9, 11, 15)
    outline = (8, 10, 14)
    border = (60, 220, 140)
    canvas = np.full((size, size, 3), background, dtype=np.uint8)
    canvas[y0:y0 + side, x0:x0 + side] = square_background
    triangles = core.uv_triangles(mesh, layer, side)
    covered = np.zeros((size, size), dtype=bool)
    colours = {}
    edge_map = {}

    for island in islands:
        identifier = island['id']
        colour = colour_for(identifier)
        colours[identifier] = list(colour)
        faces = island['faces']
        points = [layer.data[k].uv for f in faces for k in mesh.polygons[f].loop_indices]
        local_bbox = (max(0, math.floor(min(p.x for p in points) * (side - 1))),
                      max(0, math.floor((1 - max(p.y for p in points)) * (side - 1))),
                      min(side - 1, math.ceil(max(p.x for p in points) * (side - 1))),
                      min(side - 1, math.ceil((1 - min(p.y for p in points)) * (side - 1))))
        bx0, by0, bx1, by1 = local_bbox
        _, _, mask = core.rasterise([t for f in faces for t in triangles[f]],
                                    side, side, local_bbox)
        region = canvas[y0 + by0:y0 + by1 + 1, x0 + bx0:x0 + bx1 + 1]
        region[mask] = colour
        covered[y0 + by0:y0 + by1 + 1, x0 + bx0:x0 + bx1 + 1][mask] = True
        for face in faces:
            loops = list(mesh.polygons[face].loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                ends = tuple(sorted((mesh.loops[k].vertex_index,
                                     tuple(layer.data[k].uv)) for k in (a, b)))
                if ends in edge_map:
                    edge_map[ends][0] += 1
                else:
                    edge_map[ends] = [1, layer.data[a].uv.copy(), layer.data[b].uv.copy()]
    stroke = max(1, side // 1280)
    for count, a, b in edge_map.values():
        if count == 1:
            core.line(canvas, (x0 + a.x * (side - 1), y0 + (1 - a.y) * (side - 1)),
                      (x0 + b.x * (side - 1), y0 + (1 - b.y) * (side - 1)),
                      outline, stroke)

    used = float(covered[y0:y0 + side, x0:x0 + side].sum()) / float(side * side) * 100.0
    frame = max(2, size // 640)
    canvas[y0:y0 + side, x0:x0 + frame] = border
    canvas[y0:y0 + side, x0 + side - frame:x0 + side] = border
    canvas[y0:y0 + frame, x0:x0 + side] = border
    canvas[y0 + side - frame:y0 + side, x0:x0 + side] = border
    core.write_png(out / 'color_layout.png', canvas, overwrite=force)
    return used, colours


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolutions', type=int, nargs='+', default=[1280, 4096])
    parser.add_argument('--force', action='store_true', help='Overwrite named output files')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Background Blender only')
    out = Path(args.out)
    if out.exists() and not args.force:
        raise ValueError('Output exists; pass --force to overwrite')
    core = load_core()
    ob = bpy.context.scene.objects.get(args.object)
    if ob is None or ob.type != 'MESH':
        raise ValueError('Object not found or not a mesh: %s' % args.object)
    layer = ob.data.uv_layers.get(args.uv)
    if layer is None:
        raise ValueError('UV layer not found: %s' % args.uv)
    u0, v0, u1, v1 = core.require_single_tile(ob.data, layer)
    ob.data.calc_loop_triangles()
    islands = core.ordered_islands(ob.data, layer)
    manifest = {'source': bpy.data.filepath, 'object': ob.name, 'uv': layer.name,
                'uv_bounds': [u0, v0, u1, v1], 'islands': len(islands),
                'outputs': {}, 'colours': {}}
    for size in args.resolutions:
        target = out / str(size)
        target.mkdir(parents=True, exist_ok=True)
        used, colours = render(ob.data, layer, islands, core, size, target, args.force)
        manifest['outputs'][str(size)] = {'image': str(target / 'color_layout.png'),
                                          'uv_space_used_pct': round(used, 3)}
        print('UV_COLOR_LAYOUT', size, 'used %.2f%%' % used, flush=True)
    for island in islands:
        manifest['colours'][str(island['id'])] = list(colour_for(island['id']))
    (out / 'color_manifest.json').write_text(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
