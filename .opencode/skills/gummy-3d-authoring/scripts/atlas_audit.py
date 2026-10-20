"""Independent atlas audit. Does not use uv_atlas_checks' clipping routine.

UV area is measured in normalized UV units and 3D area in world square metres.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def cross2(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def signed_area(poly):
    return 0.5 * sum(poly[i - 1][0] * p[1] - p[0] * poly[i - 1][1]
                     for i, p in enumerate(poly))


def inside(p, tri):
    signs = [cross2(tri[i], tri[(i + 1) % 3], p) for i in range(3)]
    return all(s >= -1e-18 for s in signs) or all(s <= 1e-18 for s in signs)


def hull(points):
    points = sorted(set((round(p[0], 15), round(p[1], 15)) for p in points))
    if len(points) < 3:
        return 0.0

    def build(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and cross2(out[-2], out[-1], p) <= 0:
                out.pop()
            out.append(p)
        return out

    lower, upper = build(points), build(reversed(points))
    return abs(signed_area(lower[:-1] + upper[:-1]))


def segment_hit(p1, p2, q1, q2):
    r, s = (p2[0] - p1[0], p2[1] - p1[1]), (q2[0] - q1[0], q2[1] - q1[1])
    denom = r[0] * s[1] - r[1] * s[0]
    if abs(denom) <= 1e-24:
        return None
    t = ((q1[0] - p1[0]) * s[1] - (q1[1] - p1[1]) * s[0]) / denom
    u = ((q1[0] - p1[0]) * r[1] - (q1[1] - p1[1]) * r[0]) / denom
    if -1e-15 <= t <= 1 + 1e-15 and -1e-15 <= u <= 1 + 1e-15:
        return (p1[0] + t * r[0], p1[1] + t * r[1])
    return None


def overlap(a, b):
    points = [p for p in a if inside(p, b)] + [p for p in b if inside(p, a)]
    for i in range(3):
        for j in range(3):
            hit = segment_hit(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3])
            if hit:
                points.append(hit)
    return hull(points)


def triangle_area_3d(ob, mesh, tri):
    a, b, c = [ob.matrix_world @ mesh.vertices[k].co for k in tri.vertices]
    return (b - a).cross(c - a).length * 0.5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused audit output required')
    res = args.resolution
    scale = float((res - 1) ** 2)
    report = {'resolution': res, 'objects': {},
              'thresholds': {'normalized_uv_area': 1e-16, 'world_area_m2': 1e-12}}
    for ob in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if ob.type != 'MESH' or not ob.visible_get() or ob.hide_render:
            continue
        if 'UV_AI_Atlas' not in ob.data.uv_layers:
            continue
        mesh = ob.data
        layer = mesh.uv_layers['UV_AI_Atlas']
        mesh.calc_loop_triangles()
        source = defaultdict(list)
        for tri in mesh.loop_triangles:
            source[tri.polygon_index].append(triangle_area_3d(ob, mesh, tri))
        prepared, degenerate, collapsed, source_zero = [], 0, 0, 0
        by_face = defaultdict(list)
        for tri in mesh.loop_triangles:
            by_face[tri.polygon_index].append(
                [(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops])
        for poly in mesh.polygons:
            for tri, area3d in zip(by_face[poly.index], source[poly.index]):
                area_uv = abs(signed_area(tri)) * scale
                if area_uv <= 1e-16:
                    degenerate += 1
                    if area3d <= 1e-12:
                        source_zero += 1
                    else:
                        collapsed += 1
                    continue
                lo = [min(p[k] for p in tri) for k in (0, 1)]
                hi = [max(p[k] for p in tri) for k in (0, 1)]
                prepared.append((poly.index, tri, lo, hi))
        grid, hits, same_face, max_area, samples = defaultdict(list), 0, 0, 0.0, []
        for index, (face, tri, lo, hi) in enumerate(prepared):
            cells = [(x, y) for x in range(int(lo[0] * 128), min(127, int(hi[0] * 128)) + 1)
                     for y in range(int(lo[1] * 128), min(127, int(hi[1] * 128)) + 1)]
            for j in {j for c in cells for j in grid[c]}:
                other_face, other, olo, ohi = prepared[j]
                if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                    continue
                area = overlap(tri, other)
                if area > 1e-16:
                    hits += 1
                    same_face += face == other_face
                    max_area = max(max_area, area)
                    if len(samples) < 12:
                        samples.append({'faces': [face, other_face], 'area': area})
            for c in cells:
                grid[c].append(index)
        if hits or collapsed:
            report['objects'][ob.name] = {
                'triangles': len(prepared), 'overlap_pairs': hits,
                'same_face_overlaps': same_face, 'max_overlap_area': max_area,
                'degenerate_uv': degenerate, 'collapsed_uv': collapsed,
                'source_zero_uv': source_zero, 'samples': samples}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    for name, item in report['objects'].items():
        print(name, 'pairs', item['overlap_pairs'], 'same_face', item['same_face_overlaps'],
              'collapsed', item['collapsed_uv'], 'source_zero', item['source_zero_uv'],
              'max_area', round(item['max_overlap_area'], 10))
    print('AUDIT_OBJECTS', len(report['objects']), 'of', sum(
        1 for o in bpy.context.scene.objects if o.type == 'MESH' and 'UV_AI_Atlas' in o.data.uv_layers))


if __name__ == '__main__':
    main()
