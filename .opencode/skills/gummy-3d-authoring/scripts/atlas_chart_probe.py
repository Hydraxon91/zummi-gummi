"""Probe self-overlaps and repairability of charts in one object. Read-only."""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy
import numpy as np


def load(name):
    spec = importlib.util.spec_from_file_location('probe_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--objects', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused probe output required')
    audit, uvx = load('atlas_audit'), load('uv_island_export')
    res, scale = args.resolution, float((args.resolution - 1) ** 2)
    report = {}
    for name in args.objects.split(','):
        ob = bpy.data.objects.get('ATLAS__' + name)
        if ob is None:
            print('MISSING', name)
            continue
        mesh = ob.data
        layer = mesh.uv_layers['UV_AI_Atlas']
        mesh.calc_loop_triangles()
        by_face = defaultdict(list)
        for tri in mesh.loop_triangles:
            by_face[tri.polygon_index].append(
                [(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops])
        islands = uvx.mesh_islands(mesh, layer)
        items = []
        for faces in islands:
            tris = [(face, tri) for face in faces for tri in by_face[face]]
            prepared = []
            for face, tri in tris:
                lo = [min(p[k] for p in tri) for k in (0, 1)]
                hi = [max(p[k] for p in tri) for k in (0, 1)]
                prepared.append((face, tri, lo, hi))
            grid, total, count, max_area = defaultdict(list), 0.0, 0, 0.0
            for index, (face, tri, lo, hi) in enumerate(prepared):
                cells = [(x, y) for x in range(int(lo[0] * 128), min(127, int(hi[0] * 128)) + 1)
                         for y in range(int(lo[1] * 128), min(127, int(hi[1] * 128)) + 1)]
                for j in {j for c in cells for j in grid[c]}:
                    other_face, other, olo, ohi = prepared[j]
                    if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                        continue
                    area = audit.overlap(tri, other)
                    if area > 1e-16:
                        count += 1
                        total += area
                        max_area = max(max_area, area)
                for c in cells:
                    grid[c].append(index)
            if not count:
                continue
            # 3D components by shared edge within chart.
            parent = {f: f for f in faces}

            def find(x):
                while parent[x] != x:
                    parent[x] = parent[parent[x]]
                    x = parent[x]
                return x

            edge_owner = {}
            for face in faces:
                poly = mesh.polygons[face]
                loops = list(poly.loop_indices)
                for i, li in enumerate(loops):
                    lj = loops[(i + 1) % len(loops)]
                    key = tuple(sorted((mesh.loops[li].vertex_index,
                                        mesh.loops[lj].vertex_index)))
                    owner = edge_owner.setdefault(key, face)
                    if owner != face:
                        parent[find(face)] = find(owner)
            comps = defaultdict(list)
            for face in faces:
                comps[find(face)].append(face)
            planarity, comp_faces = [], []
            for comp in comps.values():
                verts = sorted({v for f in comp for v in mesh.polygons[f].vertices})
                cloud = np.array([list(ob.matrix_world @ mesh.vertices[v].co) for v in verts])
                center = cloud.mean(axis=0)
                normals = np.linalg.eigh(np.cov((cloud - center).T))[1][:, 0]
                deviation = np.abs((cloud - center) @ normals).max()
                diagonal = np.linalg.norm(cloud.max(axis=0) - cloud.min(axis=0)) or 1.0
                planarity.append(float(deviation / diagonal))
                comp_faces.append(len(comp))
            bbox = [min(p[0] for _, tri in tris for p in tri), min(p[1] for _, tri in tris for p in tri),
                    max(p[0] for _, tri in tris for p in tri), max(p[1] for _, tri in tris for p in tri)]
            items.append({'faces': len(faces), 'uv_bbox_px': bbox, 'self_pairs': count,
                          'self_total_px2': total * scale, 'self_max_px2': max_area * scale,
                          'components': len(comps), 'component_faces': comp_faces,
                          'planarity_ratio': planarity})
        items.sort(key=lambda r: -r['self_total_px2'])
        report[name] = items
        print(name, 'charts', len(items), 'failing', sum(1 for i in items if i['self_total_px2'] > 1e-6))
        for item in items[:4]:
            print('  faces', item['faces'], 'pairs', item['self_pairs'],
                  'total_px2', round(item['self_total_px2'], 4),
                  'max_px2', round(item['self_max_px2'], 4),
                  'components', item['component_faces'],
                  'planarity', [round(p, 5) for p in item['planarity_ratio']])
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print('PROBE_DONE')


if __name__ == '__main__':
    main()
