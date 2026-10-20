"""Classify remaining self-overlaps of one chart. Read-only."""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('diagchart_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--chart', type=int, default=1)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    audit, uvx = load('atlas_audit'), load('uv_island_export')
    ob = bpy.data.objects['ATLAS__' + args.object]
    mesh, layer = ob.data, ob.data.uv_layers['UV_AI_Atlas']
    mesh.calc_loop_triangles()
    by_face = defaultdict(list)
    for tri in mesh.loop_triangles:
        by_face[tri.polygon_index].append([(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops])

    def overlap_of(faces):
        tris = [t for f in faces for t in by_face[f]]
        prepared = []
        for tri in tris:
            lo = [min(p[k] for p in tri) for k in (0, 1)]
            hi = [max(p[k] for p in tri) for k in (0, 1)]
            prepared.append((tri, lo, hi))
        grid, total, count = defaultdict(list), 0.0, 0
        for index, (tri, lo, hi) in enumerate(prepared):
            cells = [(x, y) for x in range(int(lo[0] * 128), min(127, int(hi[0] * 128)) + 1)
                     for y in range(int(lo[1] * 128), min(127, int(hi[1] * 128)) + 1)]
            for j in {j for c in cells for j in grid[c]}:
                other, olo, ohi = prepared[j]
                if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                    continue
                area = audit.overlap(tri, other)
                if area > 1e-16:
                    total += area
                    count += 1
            for c in cells:
                grid[c].append(index)
        return total, count

    islands = uvx.mesh_islands(mesh, layer)
    measured = [(overlap_of(f), f) for f in islands]
    scored = sorted((row for row in measured if row[0][1]), key=lambda r: -r[0][0])
    (total, count), faces = scored[args.chart - 1]
    rot = ob.matrix_world.to_3x3()
    normals = {f: (rot @ mesh.polygons[f].normal).normalized() for f in faces}
    areas = {f: mesh.polygons[f].area for f in faces}
    average = sum((normals[f] * areas[f] for f in faces), start=normals[faces[0]] * 0).normalized()
    dots = {f: normals[f].dot(average) for f in faces}
    # vertex-position duplication across orientation groups
    positions = defaultdict(set)
    for f in faces:
        for v in mesh.polygons[f].vertices:
            co = ob.matrix_world @ mesh.vertices[v].co
            positions[tuple(round(c, 6) for c in co)].add(f)
    shared = sum(1 for fs in positions.values() if len(fs) > 1)
    print('faces', len(faces), 'pairs', count, 'area_norm', total)
    print('normal_dot_min', round(min(dots.values()), 4), 'max', round(max(dots.values()), 4),
          'negative', sum(1 for d in dots.values() if d < 0), 'near_zero', sum(1 for d in dots.values() if abs(d) < 0.2))
    print('shared_vertex_positions', shared, 'of', len(positions))
    print('uv_area', sum(abs((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) -
                             (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])) * 0.5
                         for f in faces for t in by_face[f]))


if __name__ == '__main__':
    main()
