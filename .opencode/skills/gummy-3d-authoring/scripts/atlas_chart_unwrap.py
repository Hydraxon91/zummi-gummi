"""Chart-local seamed unwrap for one failing chart. New checkpoint only.

WARNING: experimental and currently diagnostic-only. In Blender 5.2 the pack step moved
other charts in the same object; this script does not restore them. Do not use its output as
a delivery checkpoint until non-target UVs are snapshotted and restored and it passes audit.
"""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bmesh
import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('unwrap_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--object', required=True)
    parser.add_argument('--chart', type=int, required=True)
    parser.add_argument('--sharp-angle', type=float, default=40.0)
    parser.add_argument('--margin', type=float, default=0.02)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Disposable background Blender with saved baseline required')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused output required')
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
    old = [layer.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
    old_lo = [min(p[i] for p in old) for i in (0, 1)]
    old_hi = [max(p[i] for p in old) for i in (0, 1)]
    # Isolate and unwrap only this chart.
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='OBJECT')
    for poly in mesh.polygons:
        poly.select = poly.index in set(faces)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(mesh)
    threshold = __import__('math').radians(args.sharp_angle)
    for edge in bm.edges:
        if not edge.select:
            continue
        edge.seam = (len(edge.link_faces) != 2 or
                     edge.calc_face_angle(0.0) > threshold)
    bmesh.update_edit_mesh(mesh)
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.001,
                            margin_method='ADD', shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    layer = mesh.uv_layers['UV_AI_Atlas']
    new = [layer.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
    new_lo = [min(p[i] for p in new) for i in (0, 1)]
    new_hi = [max(p[i] for p in new) for i in (0, 1)]
    scale = min((old_hi[0] - old_lo[0]) / (new_hi[0] - new_lo[0]),
                (old_hi[1] - old_lo[1]) / (new_hi[1] - new_lo[1])) * (1 - 2 * args.margin)
    cx = (old_lo[0] + old_hi[0]) * 0.5
    cy = (old_lo[1] + old_hi[1]) * 0.5
    mx = (new_lo[0] + new_hi[0]) * 0.5
    my = (new_lo[1] + new_hi[1]) * 0.5
    for f in faces:
        for li in mesh.polygons[f].loop_indices:
            uv = layer.data[li].uv
            layer.data[li].uv = (cx + (uv.x - mx) * scale, cy + (uv.y - my) * scale)
    mesh.update()
    out.mkdir(parents=True)
    baseline = bpy.data.filepath
    target = out / 'raptor_rc_170_atlas_repair.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(target), copy=True)
    manifest = {'baseline': baseline, 'checkpoint': str(target), 'object': ob.name,
                'chart': args.chart, 'faces': len(faces),
                'baseline_overlap_pairs': count, 'baseline_overlap_area_normalized': total,
                'method': 'chart-local angle-based unwrap with sharp/boundary seams',
                'sharp_angle_degrees': args.sharp_angle, 'fit_scale': scale,
                'untouched': 'all other charts and objects; no geometry or material edit'}
    (out / 'repair_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('CHART_UNWRAP', json.dumps(manifest))


if __name__ == '__main__':
    main()
