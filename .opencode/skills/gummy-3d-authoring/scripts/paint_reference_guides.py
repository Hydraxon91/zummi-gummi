"""Export labelled and clean guides from an unchanged, fingerprint-bound UV layout.

Names come only from a supplied reviewed evaluation; all other islands are unresolved.
This exports an existing guide, not a UV repair or overlap/padding acceptance.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from itertools import combinations
from pathlib import Path
import sys

import bpy
import numpy as np


def helper():
    spec = importlib.util.spec_from_file_location('paint_guide_uvx', Path(__file__).with_name('uv_island_export.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fingerprint(mesh, layer):
    doc = {'vertices': [list(v.co) for v in mesh.vertices],
           'faces': [list(p.vertices) for p in mesh.polygons],
           'uv': [list(d.uv) for d in layer.data]}
    return hashlib.sha256(json.dumps(doc, separators=(',', ':')).encode()).hexdigest()


def line(canvas, a, b, colour, width=1):
    a, b = np.array(a), np.array(b)
    count = max(2, int(np.max(np.abs(b-a)))*2+1)
    points = np.rint(np.linspace(a, b, count)).astype(int)
    h, w = canvas.shape[:2]
    for dy in range(-(width//2), width-width//2):
        for dx in range(-(width//2), width-width//2):
            x, y = points[:, 0]+dx, points[:, 1]+dy
            valid = (x >= 0) & (x < w) & (y >= 0) & (y < h)
            canvas[y[valid], x[valid]] = colour


def integral(mask):
    return np.pad(mask.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)


def box_sums(table, x, y, w, h):
    return table[y+h, x+w]-table[y, x+w]-table[y+h, x]+table[y, x]


def text_width(text, scale):
    return len(text) * 6 * scale


def wrap_candidates(text, scale, max_width):
    """Best 1-, 2- and 3-line splits at underscores that fit the width."""
    tokens = text.split('_')
    result = []
    for count in (1, 2, 3):
        if count > len(tokens):
            break
        best = None
        for splits in combinations(range(1, len(tokens)), count-1):
            bounds = (0,) + splits + (len(tokens),)
            lines = ['_'.join(tokens[a:b]) for a, b in zip(bounds, bounds[1:])]
            widths = [text_width(item, scale) for item in lines]
            if max(widths) <= max_width and (best is None or max(widths) < best[0]):
                best = (max(widths), lines)
        if best:
            result.append(best[1])
    return result


def render(mesh, layer, islands, names, size, out, uvx):
    clean = np.full((size, size, 3), 255, dtype=np.uint8)
    records = []
    all_solid = np.zeros((size, size), dtype=bool)
    triangles = uvx.uv_triangles(mesh, layer, size)
    for island in islands:
        faces = island['faces']
        coords = [layer.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
        bbox = (max(0, math.floor(min(p.x for p in coords)*(size-1))),
                max(0, math.floor((1-max(p.y for p in coords))*(size-1))),
                min(size-1, math.ceil(max(p.x for p in coords)*(size-1))),
                min(size-1, math.ceil((1-min(p.y for p in coords))*(size-1))))
        x0, y0, x1, y1 = bbox
        _, _, mask = uvx.rasterise([t for f in faces for t in triangles[f]], size, size, bbox)
        all_solid[y0:y1+1, x0:x1+1] |= mask
        # UV-boundary edges only, never the internal triangulation overlay.
        edges = {}
        for face in faces:
            loops = list(mesh.polygons[face].loop_indices)
            for a, b in zip(loops, loops[1:]+loops[:1]):
                ends = tuple(sorted((mesh.loops[k].vertex_index, tuple(layer.data[k].uv)) for k in (a, b)))
                if ends in edges:
                    edges[ends][0] += 1
                else:
                    edges[ends] = [1, layer.data[a].uv.copy(), layer.data[b].uv.copy()]
        for count, a, b in edges.values():
            if count == 1:
                line(clean, (a.x*(size-1), (1-a.y)*(size-1)),
                     (b.x*(size-1), (1-b.y)*(size-1)), (0, 0, 0), max(1, size//1280))
        ys, xs = np.nonzero(mask)
        if len(xs):
            cx, cy = xs.mean(), ys.mean()
            nearest = np.argmin((xs-cx)**2+(ys-cy)**2)
            anchor = [int(xs[nearest]+x0), int(ys[nearest]+y0)]
        else:
            anchor = [(x0+x1)//2, (y0+y1)//2]
        records.append({'id': island['id'], 'part_name': names.get(island['id'], 'UNRESOLVED'),
                        'status': 'reviewed_development_name' if island['id'] in names else 'unresolved',
                        'mask': mask, 'bbox': bbox, 'anchor': anchor, 'area_px': int(mask.sum())})
    labelled = clean.copy()
    reservations = []
    blocked = integral(all_solid | (clean != 255).any(axis=2))
    scale = max(1, size//1280)
    line_height, pad = 7*scale, 2*scale
    # Priority to large panels and their full names, not mechanical fragments.
    for row in sorted(records, key=lambda r: -r['area_px']):
        x0, y0, x1, y1 = row['bbox']
        mask = row.pop('mask')
        local = integral(mask)
        anchor = row['anchor']
        named = row['status'] != 'unresolved'
        text = f"{row['id']} {row['part_name'].upper()}" if named else str(row['id'])
        line_sets = [[text]]
        if named:
            line_sets = wrap_candidates(text, scale, mask.shape[1] - 2*pad)
        chosen = None
        for lines in line_sets:
            width = max(text_width(item, scale) for item in lines)
            height = len(lines)*line_height + (len(lines)-1)*scale
            if width+2*pad > mask.shape[1] or height+2*pad > mask.shape[0]:
                continue
            ys, xs = np.nonzero(mask)
            step = max(1, len(xs)//600)
            x = np.clip(xs[::step]-width//2-pad, 0, mask.shape[1]-width-2*pad)
            y = np.clip(ys[::step]-height//2-pad, 0, mask.shape[0]-height-2*pad)
            valid = box_sums(local, x, y, width+2*pad, height+2*pad) == (width+2*pad)*(height+2*pad)
            candidates = [(int(a+x0+pad), int(b+y0+pad)) for a, b in zip(x[valid], y[valid])]
            candidates.sort(key=lambda p: (p[0]+width/2-anchor[0])**2+(p[1]+height/2-anchor[1])**2)
            if candidates:
                placement = ('inside_name_wrapped' if named and len(lines) > 1 else
                             'inside_name' if named else 'inside_id')
                chosen = (lines, candidates[0], placement)
                break
        if chosen is None:
            edge = 6*scale
            callout_sets = ([[text]] if not named else
                            wrap_candidates(text, scale, size-2*edge-2*pad))
            for lines in reversed(callout_sets):
                width = max(text_width(item, scale) for item in lines)
                height = len(lines)*line_height + (len(lines)-1)*scale
                yy, xx = np.mgrid[edge+pad:size-height-edge-pad:4*scale,
                                  edge+pad:size-width-edge-pad:4*scale]
                x, y = xx.ravel(), yy.ravel()
                valid = box_sums(blocked, x-pad, y-pad, width+2*pad, height+2*pad) == 0
                x, y = x[valid], y[valid]
                for bx, by, bw, bh in reservations:
                    keep = (x+width+pad < bx) | (x-pad > bx+bw) | (y+height+pad < by) | (y-pad > by+bh)
                    x, y = x[keep], y[keep]
                if not len(x):
                    continue
                clear = np.minimum.reduce([x, y, size-(x+width), size-(y+height)])
                cost = ((x+width/2-anchor[0])**2 + (y+height/2-anchor[1])**2 +
                        8*np.maximum(0, 40*scale-clear)**2)
                index = int(np.argmin(cost))
                point = (int(x[index]), int(y[index]))
                line(labelled, anchor, (point[0]+width/2, point[1]+height/2), (110, 110, 110), scale)
                chosen = (lines, point, 'leader_callout')
                break
            if chosen is None:
                raise ValueError('No readable callout position for island %s at %s' % (row['id'], size))
        lines, (x, y), placement = chosen
        width = max(text_width(item, scale) for item in lines)
        height = len(lines)*line_height + (len(lines)-1)*scale
        labelled[y-pad:y+height+pad, x-pad:x+width+pad] = 255
        for index, item in enumerate(lines):
            uvx.draw_text(labelled, item, x+(width-text_width(item, scale))//2,
                          y+index*(line_height+scale), scale, (0, 0, 0))
        reservations.append((x-pad, y-pad, width+2*pad, height+2*pad))
        row.update(label='\n'.join(lines), label_lines=lines,
                   label_position=[x, y], placement=placement)
    # A separate full-name legend accounts for all islands, including numbered callouts.
    legend = np.full((size, size, 3), 255, dtype=np.uint8)
    uvx.draw_text(legend, 'ISLAND KEY - UNRESOLVED MEANS NOT YET IDENTIFIED', 20*scale, 16*scale, scale, (0, 0, 0))
    for index, row in enumerate(sorted(records, key=lambda r: r['id'])):
        column, position = divmod(index, 34)
        text = f"{row['id']:02d} {row['part_name'].upper()}"
        uvx.draw_text(legend, text, (20+column*420)*scale, (48+position*32)*scale, scale, (0, 0, 0))
    out.mkdir()
    for name, pixels in [('clean_guide', clean), ('labelled_reference', labelled), ('island_legend', legend)]:
        uvx.write_png(out/(name+'.png'), pixels)
    (out/'labels.json').write_text(json.dumps(sorted(records, key=lambda r:r['id']), indent=2))
    assert len(records) == len(islands) and all(r['placement'] and r['label_lines'] for r in records)
    for row in records:
        flat = ''.join(row['label_lines']).replace(' ', '').replace('_', '').lower()
        if row['status'] == 'unresolved':
            assert row['label_lines'] == [str(row['id'])], row
        else:
            assert row['part_name'].replace('_', '').lower() in flat, row
    return {'resolution': [size, size], 'islands': len(records),
            'callouts': sum(r['placement'] == 'leader_callout' for r in records),
            'names': len(names), 'unresolved': len(records)-len(names)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', default='UVMap')
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--review', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    out = Path(args.out)
    if out.exists() or not bpy.app.background:
        raise ValueError('Background Blender and unused output required')
    ob = bpy.context.scene.objects[args.object]
    mesh, layer = ob.data, ob.data.uv_layers[args.uv]
    before = fingerprint(mesh, layer)
    evidence, review = json.loads(Path(args.evidence).read_text()), json.loads(Path(args.review).read_text())
    if evidence['fingerprint'] != before or review['fingerprint'] != before:
        raise ValueError('Names/face correspondence fingerprint differs from current source')
    islands = evidence['islands']
    uvx = helper()
    assert {frozenset(c['faces']) for c in islands} == {frozenset(f) for f in uvx.mesh_islands(mesh, layer)}
    assert len({c['id'] for c in islands}) == len(islands)
    names = {c['id']: c['expected'] for c in review['evaluation']['comparisons'] if c['correct']}
    out.mkdir(parents=True)
    summary = [render(mesh, layer, islands, names, size, out/str(size), uvx) for size in (1280, 4096)]
    assert fingerprint(mesh, layer) == before
    manifest = {'source': bpy.data.filepath, 'object': ob.name, 'uv': args.uv,
                'fingerprint': before, 'layout_unchanged': True, 'outputs': summary,
                'names_provenance': str(Path(args.review)),
                'limits': ['Existing UV overlaps retained, not repaired or waived',
                           '24 names from historical visually assessed development set; remaining islands explicitly unresolved',
                           'Clean guide is UV outlines, not generated albedo; no bake/padding certification']}
    (out/'guide_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('PAINT_GUIDES', json.dumps(summary))


if __name__ == '__main__':
    main()
