"""Repair confirmed failing, nearly planar charts by plane reprojection. New checkpoint only."""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector


def load(name):
    spec = importlib.util.spec_from_file_location('repair_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def chart_overlap(audit, tris):
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
                count += 1
                total += area
        for c in cells:
            grid[c].append(index)
    return total, count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--object', required=True)
    parser.add_argument('--chart', type=int, required=True, help='1-based chart id by descending overlap')
    parser.add_argument('--max-planarity', type=float, default=0.01)
    parser.add_argument('--margin', type=float, default=0.02)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Disposable background Blender with saved baseline required')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused repair output required')
    audit, uvx = load('atlas_audit'), load('uv_island_export')
    ob = bpy.data.objects.get('ATLAS__' + args.object)
    if ob is None:
        raise ValueError('Target object missing')
    mesh = ob.data
    layer = mesh.uv_layers['UV_AI_Atlas']
    mesh.calc_loop_triangles()
    by_face = defaultdict(list)
    for tri in mesh.loop_triangles:
        by_face[tri.polygon_index].append(
            [(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops])
    islands = uvx.mesh_islands(mesh, layer)
    scored = []
    for faces in islands:
        tris = [tri for face in faces for tri in by_face[face]]
        total, count = chart_overlap(audit, tris)
        if total > 1e-16:
            scored.append((total, count, faces, tris))
    scored.sort(key=lambda row: -row[0])
    if not 1 <= args.chart <= len(scored):
        raise ValueError('Chart index out of range; failing charts: %d' % len(scored))
    total, count, faces, tris = scored[args.chart - 1]
    verts = sorted({v for f in faces for v in mesh.polygons[f].vertices})
    cloud = np.array([list(ob.matrix_world @ mesh.vertices[v].co) for v in verts])
    center = cloud.mean(axis=0)
    _, vectors = np.linalg.eigh(np.cov((cloud - center).T))
    deviation = float(np.abs((cloud - center) @ vectors[:, 0]).max())
    diagonal = float(np.linalg.norm(cloud.max(axis=0) - cloud.min(axis=0)) or 1.0)
    planarity = deviation / diagonal
    if planarity > args.max_planarity:
        raise ValueError('Chart planarity %.5f exceeds %.5f; not reprojected' %
                         (planarity, args.max_planarity))
    normal, e1, e2 = Vector(vectors[:, 0]), Vector(vectors[:, 2]), Vector(vectors[:, 1])
    center = Vector(center)

    old = [layer.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
    old_lo = [min(p[i] for p in old) for i in (0, 1)]
    old_hi = [max(p[i] for p in old) for i in (0, 1)]
    projected = {v: ((ob.matrix_world @ mesh.vertices[v].co - center).dot(e1),
                     (ob.matrix_world @ mesh.vertices[v].co - center).dot(e2)) for v in verts}
    new_lo = [min(p[i] for p in projected.values()) for i in (0, 1)]
    new_hi = [max(p[i] for p in projected.values()) for i in (0, 1)]
    width, height = new_hi[0] - new_lo[0], new_hi[1] - new_lo[1]
    if width <= 1e-9 or height <= 1e-9:
        raise ValueError('Projected chart has no extent')
    old_w, old_h = old_hi[0] - old_lo[0], old_hi[1] - old_lo[1]
    scale = min(old_w / width, old_h / height) * (1 - 2 * args.margin)
    # Match the original UV handedness so projectors are not mirrored.
    def signed(points):
        return sum(points[i - 1][0] * points[i][1] - points[i][0] * points[i - 1][1]
                   for i in range(len(points)))
    old_sign = signed([(layer.data[k].uv.x, layer.data[k].uv.y)
                       for f in faces for k in mesh.polygons[f].loop_indices])
    new_sign = 0.0
    for face in faces:
        poly = mesh.polygons[face]
        pts = [projected[mesh.loops[li].vertex_index] for li in poly.loop_indices]
        new_sign += signed(pts)
    flip = (old_sign > 0) != (new_sign > 0)
    cx, cy = (old_lo[0] + old_hi[0]) * 0.5, (old_lo[1] + old_hi[1]) * 0.5
    nx, ny = (new_lo[0] + new_hi[0]) * 0.5, (new_lo[1] + new_hi[1]) * 0.5
    for face in faces:
        for li in mesh.polygons[face].loop_indices:
            v = mesh.loops[li].vertex_index
            u = projected[v][0]
            t = (new_hi[1] - projected[v][1]) if flip else (projected[v][1] - new_lo[1])
            layer.data[li].uv = (cx + (u - nx) * scale, cy + (t - (height * 0.5)) * scale)
    mesh.update()
    out.mkdir(parents=True)
    source = Path(bpy.data.filepath)
    target = out / 'raptor_rc_169_atlas_repair.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target), copy=True)
    manifest = {
        'baseline': str(source), 'checkpoint': str(target), 'object': ob.name,
        'chart': args.chart, 'faces': len(faces), 'baseline_overlap_pairs': count,
        'baseline_overlap_area_normalized': total, 'planarity_ratio': planarity,
        'projection_scale': scale, 'mirrored': bool(flip), 'margin': args.margin,
        'repair': 'best-fit-plane reprojection fitted uniformly inside the old chart bounds',
        'untouched': 'all other objects and charts; no geometry, material or source UV edit',
    }
    (out / 'repair_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('CHART_REPAIR', json.dumps(manifest))


if __name__ == '__main__':
    main()
