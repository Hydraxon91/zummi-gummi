"""Export clean, labelled and legend line guides from a UV layout.

Read-only. Names come from an optional JSON map; every other island is labelled with
its numeric ID only and marked UNRESOLVED in the legend. The layout is not repaired.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np


def load_core():
    spec = importlib.util.spec_from_file_location('uv_line_core',
                                                  Path(__file__).with_name('uv_core.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def integral(mask):
    return np.pad(mask.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)


def box_sums(table, x, y, w, h):
    return table[y+h, x+w]-table[y, x+w]-table[y+h, x]+table[y, x]


def normalized_label(value):
    return ''.join(value.split()).replace('_', '').casefold()


def load_names(path):
    if path is None:
        return {}
    data = json.loads(Path(path).read_text())
    if isinstance(data, list):
        result = {}
        for item in data:
            identifier = int(item['id'])
            name = item.get('name', item.get('part_name', ''))
            if name:
                result[identifier] = name
        return result
    result = {}
    for key, value in data.items():
        name = value.get('name', value.get('part_name', '')) if isinstance(value, dict) else value
        if name:
            result[int(key)] = str(name)
    return result


def render(mesh, layer, islands, names, size, out, core, force=False, placements=None):
    clean = np.full((size, size, 3), 255, dtype=np.uint8)
    records = []
    all_solid = np.zeros((size, size), dtype=bool)
    triangles = core.uv_triangles(mesh, layer, size)
    for island in islands:
        faces = island['faces']
        coords = [layer.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
        bbox = (max(0, math.floor(min(p.x for p in coords) * (size - 1))),
                max(0, math.floor((1 - max(p.y for p in coords)) * (size - 1))),
                min(size - 1, math.ceil(max(p.x for p in coords) * (size - 1))),
                min(size - 1, math.ceil((1 - min(p.y for p in coords)) * (size - 1))))
        x0, y0, x1, y1 = bbox
        _, _, mask = core.rasterise([t for f in faces for t in triangles[f]],
                                    size, size, bbox)
        all_solid[y0:y1 + 1, x0:x1 + 1] |= mask
        for placement in (placements or []):
            if placement['island'] != island['id']:
                continue
            u0, v0, u1, v1 = placement['uv_rect']
            px0, px1 = math.ceil(u0 * (size - 1)), math.floor(u1 * (size - 1))
            py0, py1 = math.ceil((1 - v1) * (size - 1)), math.floor((1 - v0) * (size - 1))
            if (px1 < px0 or py1 < py0 or px0 < x0 or px1 > x1 or
                    py0 < y0 or py1 > y1 or
                    not mask[py0-y0:py1-y0+1, px0-x0:px1-x0+1].all()):
                raise ValueError('Placement %s is not fully covered by island %s at %s' %
                                 (placement['id'], island['id'], size))
        edges = {}
        for face in faces:
            loops = list(mesh.polygons[face].loop_indices)
            for a, b in zip(loops, loops[1:] + loops[:1]):
                ends = tuple(sorted((mesh.loops[k].vertex_index,
                                     tuple(layer.data[k].uv)) for k in (a, b)))
                if ends in edges:
                    edges[ends][0] += 1
                else:
                    edges[ends] = [1, layer.data[a].uv.copy(), layer.data[b].uv.copy()]
        for count, a, b in edges.values():
            if count == 1:
                core.line(clean, (a.x * (size - 1), (1 - a.y) * (size - 1)),
                          (b.x * (size - 1), (1 - b.y) * (size - 1)),
                          (0, 0, 0), max(1, size // 1280))
        ys, xs = np.nonzero(mask)
        if len(xs):
            cx, cy = xs.mean(), ys.mean()
            nearest = np.argmin((xs - cx) ** 2 + (ys - cy) ** 2)
            anchor = [int(xs[nearest] + x0), int(ys[nearest] + y0)]
        else:
            anchor = [(x0 + x1) // 2, (y0 + y1) // 2]
        records.append({'id': island['id'], 'faces': faces,
                        'part_name': names.get(island['id'], 'UNRESOLVED'),
                        'status': 'named' if island['id'] in names else 'unresolved',
                        'mask': mask, 'bbox': bbox, 'anchor': anchor,
                        'area_px': int(mask.sum())})

    labelled = clean.copy()
    reservations = []
    blocked = integral(all_solid | (clean != 255).any(axis=2))
    scale = max(1, size // 1280)
    line_height, pad = 7 * scale, 2 * scale
    for row in sorted(records, key=lambda r: -r['area_px']):
        x0, y0, x1, y1 = row['bbox']
        mask = row.pop('mask')
        local = integral(mask)
        anchor = row['anchor']
        named = row['status'] != 'unresolved'
        text = f"{row['id']} {row['part_name'].upper()}" if named else str(row['id'])
        line_sets = [[text]]
        if named:
            line_sets = core.wrap_candidates(text, scale, mask.shape[1] - 2 * pad) or [[text]]
        chosen = None
        for lines in line_sets:
            width = max(core.text_width(item, scale) for item in lines)
            height = len(lines) * line_height + (len(lines) - 1) * scale
            if width + 2 * pad > mask.shape[1] or height + 2 * pad > mask.shape[0]:
                continue
            ys, xs = np.nonzero(mask)
            step = max(1, len(xs) // 600)
            x = np.clip(xs[::step] - width // 2 - pad, 0, mask.shape[1] - width - 2 * pad)
            y = np.clip(ys[::step] - height // 2 - pad, 0, mask.shape[0] - height - 2 * pad)
            valid = box_sums(local, x, y, width + 2 * pad, height + 2 * pad) == (width + 2 * pad) * (height + 2 * pad)
            candidates = [(int(a + x0 + pad), int(b + y0 + pad)) for a, b in zip(x[valid], y[valid])]
            candidates.sort(key=lambda p: (p[0] + width / 2 - anchor[0]) ** 2 + (p[1] + height / 2 - anchor[1]) ** 2)
            if candidates:
                placement = ('inside_name_wrapped' if named and len(lines) > 1 else
                             'inside_name' if named else 'inside_id')
                chosen = (lines, candidates[0], placement)
                break
        if chosen is None:
            edge = 6 * scale
            callout_sets = ([[text]] if not named else
                            core.wrap_candidates(text, scale, size - 2 * edge - 2 * pad) or [[text]])
            for lines in reversed(callout_sets):
                width = max(core.text_width(item, scale) for item in lines)
                height = len(lines) * line_height + (len(lines) - 1) * scale
                yy, xx = np.mgrid[edge + pad:size - height - edge - pad:4 * scale,
                                  edge + pad:size - width - edge - pad:4 * scale]
                x, y = xx.ravel(), yy.ravel()
                valid = box_sums(blocked, x - pad, y - pad, width + 2 * pad, height + 2 * pad) == 0
                x, y = x[valid], y[valid]
                for bx, by, bw, bh in reservations:
                    keep = ((x + width + pad < bx) | (x - pad > bx + bw) |
                            (y + height + pad < by) | (y - pad > by + bh))
                    x, y = x[keep], y[keep]
                if not len(x):
                    continue
                clear = np.minimum.reduce([x, y, size - (x + width), size - (y + height)])
                cost = ((x + width / 2 - anchor[0]) ** 2 + (y + height / 2 - anchor[1]) ** 2 +
                        8 * np.maximum(0, 40 * scale - clear) ** 2)
                index = int(np.argmin(cost))
                point = (int(x[index]), int(y[index]))
                core.line(labelled, anchor, (point[0] + width / 2, point[1] + height / 2),
                          (110, 110, 110), scale)
                chosen = (lines, point, 'leader_callout')
                break
            if chosen is None:
                raise ValueError('No readable callout position for island %s at %s' %
                                 (row['id'], size))
        lines, (x, y), placement = chosen
        width = max(core.text_width(item, scale) for item in lines)
        height = len(lines) * line_height + (len(lines) - 1) * scale
        labelled[y - pad:y + height + pad, x - pad:x + width + pad] = 255
        for index, item in enumerate(lines):
            core.draw_text(labelled, item, x + (width - core.text_width(item, scale)) // 2,
                           y + index * (line_height + scale), scale, (0, 0, 0))
        reservations.append((x - pad, y - pad, width + 2 * pad, height + 2 * pad))
        row.update(label='\n'.join(lines), label_lines=lines,
                   label_position=[x, y], placement=placement)

    legend = np.full((size, size, 3), 255, dtype=np.uint8)
    core.draw_text(legend, 'ISLAND KEY - UNRESOLVED MEANS NOT YET IDENTIFIED',
                   20 * scale, 16 * scale, scale, (0, 0, 0))
    order = sorted(records, key=lambda r: r['id'])
    header = 48 * scale
    row_height = 32 * scale
    rows = max(1, (size - header) // row_height)
    columns = max(1, math.ceil(len(order) / rows))
    column_width = size // columns
    for index, row in enumerate(order):
        column, position = divmod(index, rows)
        text = f"{row['id']:02d} {row['part_name'].upper()}"
        core.draw_text(legend, text, 20 * scale + column * column_width,
                       header + position * row_height, scale, (0, 0, 0))

    assert len(records) == len(islands)
    assert all(r['placement'] and r['label_lines'] for r in records)
    for row in records:
        flat = normalized_label(''.join(row['label_lines']))
        if row['status'] == 'unresolved':
            assert row['label_lines'] == [str(row['id'])], row
        else:
            assert normalized_label(row['part_name']) in flat, row
    out.mkdir(parents=True, exist_ok=True)
    for name, pixels in [('clean_guide', clean), ('labelled_reference', labelled),
                         ('island_legend', legend)]:
        core.write_png(out / (name + '.png'), pixels, overwrite=force)
    (out / 'labels.json').write_text(json.dumps(sorted(records, key=lambda r: r['id']), indent=2))
    for placement in (placements or []):
        safe = np.zeros((size, size, 3), dtype=np.uint8)
        u0, v0, u1, v1 = placement['uv_rect']
        x0, x1 = math.ceil(u0 * (size - 1)), math.floor(u1 * (size - 1))
        y0, y1 = math.ceil((1 - v1) * (size - 1)), math.floor((1 - v0) * (size - 1))
        safe[y0:y1+1, x0:x1+1] = 255
        core.write_png(out / ('safe_' + placement['id'] + '.png'), safe, overwrite=force)
    named_count = sum(r['status'] == 'named' for r in records)
    return {'resolution': [size, size], 'islands': len(records),
            'callouts': sum(r['placement'] == 'leader_callout' for r in records),
            'names': named_count, 'unresolved': len(records) - named_count}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--names', help='Optional JSON map: {"1": "hood", ...}')
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolutions', type=int, nargs='+', default=[1280, 4096])
    parser.add_argument('--force', action='store_true', help='Overwrite named output files')
    parser.add_argument('--placements', help='Explicit reviewed UV rectangles and source-object metadata JSON')
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
    names = load_names(args.names)
    islands = core.ordered_islands(ob.data, layer)
    placements = []
    if args.placements:
        placements = json.loads(Path(args.placements).read_text())
        known = {island['id'] for island in islands}
        seen = set()
        for placement in placements:
            identifier = placement['id']
            if (not isinstance(identifier, str) or not identifier or
                    any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789_' for c in identifier) or
                    identifier in seen):
                raise ValueError('Placement IDs must be unique lowercase filename-safe identifiers')
            seen.add(identifier)
            rect = placement['uv_rect']
            if (len(rect) != 4 or not all(math.isfinite(v) for v in rect) or
                    not 0 <= rect[0] < rect[2] <= 1 or not 0 <= rect[1] < rect[3] <= 1):
                raise ValueError('Invalid placement UV rectangle: %s' % identifier)
            if placement['island'] not in known:
                raise ValueError('Unknown placement island: %s' % identifier)
            if not placement.get('source_object') or not placement.get('source_uv'):
                raise ValueError('Placement requires source_object and source_uv')
            transform = placement.get('source_uv_to_canvas')
            if (not isinstance(transform, list) or len(transform) != 6 or
                    not all(math.isfinite(v) for v in transform)):
                raise ValueError('Placement requires six affine source_uv_to_canvas coefficients')
    summary = []
    for size in args.resolutions:
        summary.append(render(ob.data, layer, islands, names, size,
                              out / str(size), core, args.force, placements))
    manifest = {'source': bpy.data.filepath, 'object': ob.name, 'uv': layer.name,
                'uv_sha256': hashlib.sha256(json.dumps({
                    'faces': [list(p.vertices) for p in ob.data.polygons],
                    'uv': [list(value.uv) for value in layer.data],
                }, sort_keys=True).encode()).hexdigest(),
                'names_source': str(args.names) if args.names else None,
                'uv_bounds': [u0, v0, u1, v1], 'outputs': summary,
                'placements': placements,
                'pixel_axes': 'top-left origin; x=u*(size-1), y=(1-v)*(size-1)',
                'limits': ['Existing UV overlaps retained, not repaired or waived',
                           'Single 0-1 tile only',
                           'Names absent from the input map remain unresolved',
                           'Clean guide is UV outlines, not generated albedo',
                           'Safe rectangles are user-reviewed, not automatic obstacle detection',
                           'Raster coverage is not proof of clearance from other scene objects']}
    (out / 'guide_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('UV_LINE_GUIDE', json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
