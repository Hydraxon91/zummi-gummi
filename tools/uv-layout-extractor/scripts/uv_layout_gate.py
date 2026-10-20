"""Read-only UV layout gate: geometric overlaps, pixel collisions and bounds.

Geometric slivers between adjacent faces are reported separately. By default the
gate fails on pixel collisions, out-of-bounds or truncation; pass --strict-geometric
to fail on any triangle intersection as well.
"""
import argparse
import importlib.util
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import bpy
import numpy as np


def load(name):
    spec = importlib.util.spec_from_file_location('uv_gate_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def find_geometric_pairs(mesh, layer, islands, uvx, checks, resolution):
    triangles_map = uvx.uv_triangles(mesh, layer, resolution)
    grid = defaultdict(list)
    prepared = []
    pairs = {}
    for island in islands:
        island_id = island['id']
        for face in island['faces']:
            for flat in triangles_map[face]:
                tri = [(flat[k] / (resolution - 1), 1 - flat[k + 1] / (resolution - 1))
                       for k in (0, 2, 4)]
                if not all(math.isfinite(v) and 0 <= v <= 1 for p in tri for v in p):
                    continue
                if abs(checks.cross(*tri)) * 0.5 <= 1e-16:
                    continue
                lo = [min(p[k] for p in tri) for k in (0, 1)]
                hi = [max(p[k] for p in tri) for k in (0, 1)]
                cells = [(x, y) for x in range(int(lo[0] * 64), min(63, int(hi[0] * 64)) + 1)
                         for y in range(int(lo[1] * 64), min(63, int(hi[1] * 64)) + 1)]
                for j in {j for cell in cells for j in grid[cell]}:
                    other_id, other_face, other_tri, other_lo, other_hi = prepared[j]
                    if island_id == other_id and face == other_face:
                        continue
                    if any(hi[k] <= other_lo[k] or lo[k] >= other_hi[k] for k in (0, 1)):
                        continue
                    area = checks.intersection_area(tri, other_tri)
                    if area <= 1e-12:
                        continue
                    key = (min(island_id, other_id), max(island_id, other_id),
                           min(face, other_face), max(face, other_face))
                    previous = pairs.get(key)
                    if previous is None or area > previous:
                        pairs[key] = area
                index = len(prepared)
                prepared.append((island_id, face, tri, lo, hi))
                for cell in cells:
                    grid[cell].append(index)
    result = []
    for (id_a, id_b, face_a, face_b), area in sorted(pairs.items()):
        shared = sorted(set(mesh.polygons[face_a].vertices) &
                        set(mesh.polygons[face_b].vertices))
        result.append({'islands': [id_a, id_b], 'faces': [face_a, face_b],
                       'uv_area': area, 'shared_vertices': shared,
                       'adjacent_sliver': bool(shared) and area <= 1e-6})
    return result


def pixel_conflicts(mesh, layer, islands, uvx, resolution):
    triangles_map = uvx.uv_triangles(mesh, layer, resolution)
    id_map = np.zeros((resolution, resolution), dtype=np.int32)
    conflicts = defaultdict(int)
    for island in islands:
        island_id = island['id']
        faces = island['faces']
        points = [layer.data[k].uv for f in faces for k in mesh.polygons[f].loop_indices]
        bbox = (max(0, math.floor(min(p.x for p in points) * (resolution - 1))),
                max(0, math.floor((1 - max(p.y for p in points)) * (resolution - 1))),
                min(resolution - 1, math.ceil(max(p.x for p in points) * (resolution - 1))),
                min(resolution - 1, math.ceil((1 - min(p.y for p in points)) * (resolution - 1))))
        x0, y0, x1, y1 = bbox
        _, _, mask = uvx.rasterise([t for f in faces for t in triangles_map[f]],
                                   resolution, resolution, bbox)
        region = id_map[y0:y1 + 1, x0:x1 + 1]
        existing = region[mask]
        bad = (existing != 0) & (existing != island_id)
        for other in np.unique(existing[bad]):
            pair = tuple(sorted((int(other), int(island_id))))
            conflicts[pair] += int((existing == other).sum())
        region[mask] = island_id
    return {pair: count for pair, count in sorted(conflicts.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=4096)
    parser.add_argument('--pixel-resolution', type=int,
                        help='Defaults to --resolution; use 0 to skip the raster check')
    parser.add_argument('--strict-geometric', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Background Blender only')
    out = Path(args.out)
    if out.exists() and not args.force:
        raise ValueError('Output exists; pass --force to overwrite')
    out.mkdir(parents=True, exist_ok=True)
    core, checks = load('uv_core'), load('uv_atlas_checks')
    ob = bpy.context.scene.objects.get(args.object)
    if ob is None or ob.type != 'MESH':
        raise ValueError('Object not found or not a mesh: %s' % args.object)
    layer = ob.data.uv_layers.get(args.uv)
    if layer is None:
        raise ValueError('UV layer not found: %s' % args.uv)
    u0, v0, u1, v1 = core.uv_bounds(ob.data, layer)
    islands = core.ordered_islands(ob.data, layer, args.resolution)
    triangles = core.uv_triangles(ob.data, layer, args.resolution)
    records = [{'id': island['id'],
                'triangles': [t for f in island['faces'] for t in triangles[f]]}
               for island in islands]
    geometric = checks.validate(records, args.resolution, max_pairs=10000)
    pairs = find_geometric_pairs(ob.data, layer, islands, core, checks, args.resolution)
    pixel_res = args.pixel_resolution if args.pixel_resolution is not None else args.resolution
    pixels = {} if not pixel_res else pixel_conflicts(ob.data, layer, islands, core, pixel_res)
    non_sliver = [p for p in pairs if not p['adjacent_sliver']]
    clean = not (geometric['out_of_bounds'] or geometric['truncated'] or pixels or
                 (args.strict_geometric and geometric['overlaps']))
    report = {'object': ob.name, 'uv': layer.name, 'resolution': args.resolution,
              'pixel_resolution': pixel_res, 'islands': len(islands),
              'uv_bounds': [u0, v0, u1, v1],
              'geometric_overlaps': geometric['overlaps'],
              'geometric_pairs': pairs,
              'non_sliver_geometric_pairs': non_sliver,
              'pixel_conflicts': [list(pair) for pair in pixels],
              'pixel_conflict_count': sum(pixels.values()),
              'out_of_bounds': geometric['out_of_bounds'],
              'truncated': geometric['truncated'],
              'degenerate_triangles': geometric['degenerate_triangles'],
              'strict_geometric': args.strict_geometric,
              'clean': clean,
              'limits': ['Flipped-face orientation is not checked',
                         'Geometric slivers between adjacent faces are warnings unless '
                         '--strict-geometric is set',
                         'Single 0-1 tile only']}
    (out / 'layout_gate.json').write_text(json.dumps(report, indent=2))
    print('UV_LAYOUT_GATE', 'PASS' if clean else 'FAIL',
          json.dumps({'geometric': geometric, 'pixel_conflicts': report['pixel_conflicts'],
                      'pixel_conflict_count': report['pixel_conflict_count'],
                      'non_sliver_geometric_pairs': len(non_sliver)}), flush=True)
    if not clean:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
