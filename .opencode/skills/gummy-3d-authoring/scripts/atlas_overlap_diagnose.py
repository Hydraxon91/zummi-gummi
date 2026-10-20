"""Read-only face-level diagnosis of failed atlas charts. No edits or saves."""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('diag_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def area3(a, b, c):
    return (b - a).cross(c - a).length * 0.5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Disposable background process only')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused diagnostic output required')
    uvx, checks = load('uv_island_export'), load('uv_atlas_checks')
    res = args.resolution
    report = {'objects': {}, 'resolution': res,
              'thresholds': {'uv_area': 1e-12, 'intersection': 1e-12}}
    for ob in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if ob.type != 'MESH' or not ob.visible_get() or ob.hide_render:
            continue
        mesh = ob.data
        layer = mesh.uv_layers['UV_AI_Atlas']
        mesh.calc_loop_triangles()
        tri_map = uvx.uv_triangles(mesh, layer, res)
        islands = uvx.mesh_islands(mesh, layer)
        records = []
        for faces in islands:
            points = [layer.data[k].uv for f in faces for k in mesh.polygons[f].loop_indices]
            ts = [t for f in faces for t in tri_map[f]]
            area = sum(abs((t[2]-t[0])*(t[5]-t[1])-(t[4]-t[0])*(t[3]-t[1]))*0.5 for t in ts)/(res-1)**2
            records.append({'faces': faces, 'triangles': ts,
                            'uv': (min(p.x for p in points), min(p.y for p in points)), 'area': area})
        records.sort(key=lambda r: (round(r['uv'][0], 6), round(r['uv'][1], 6),
                                    -len(r['faces']), round(r['area'], 9)))
        for i, r in enumerate(records, 1):
            r['id'] = i
        prepared = []
        for r in records:
            for face in r['faces']:
                for flat in tri_map[face]:
                    tri = [(flat[k]/(res-1), 1-flat[k+1]/(res-1)) for k in (0, 2, 4)]
                    lo = [min(p[k] for p in tri) for k in (0, 1)]
                    hi = [max(p[k] for p in tri) for k in (0, 1)]
                    prepared.append((r['id'], face, tri, lo, hi))
        three_d = defaultdict(list)
        for tri in mesh.loop_triangles:
            a, b, c = [ob.matrix_world @ mesh.vertices[k].co for k in tri.vertices]
            three_d[tri.polygon_index].append(area3(a, b, c))
        degenerate = []
        for iid, face, tri, _, _ in prepared:
            uv_area = abs(checks.cross(*tri)) * 0.5
            if uv_area <= 1e-12:
                degenerate.append({'island': iid, 'face': face, 'uv_area': uv_area,
                                   'source_3d_areas': three_d[face]})
        spatial, overlaps = defaultdict(list), []
        for index, (iid, face, tri, lo, hi) in enumerate(prepared):
            cells = [(x, y) for x in range(int(lo[0]*128), min(127, int(hi[0]*128))+1)
                     for y in range(int(lo[1]*128), min(127, int(hi[1]*128))+1)]
            for j in {j for cell in cells for j in spatial[cell]}:
                other_id, other_face, other, olo, ohi = prepared[j]
                if other_id == iid and other_face == face:
                    continue
                if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                    continue
                overlap = checks.intersection_area(tri, other)
                if overlap > 1e-12:
                    overlaps.append({'islands': [iid, other_id], 'faces': [face, other_face],
                                     'uv_overlap_area': overlap, 'same_island': iid == other_id,
                                     'source_3d_areas': three_d[face] + three_d[other_face]})
            for cell in cells:
                spatial[cell].append(index)
        if overlaps or degenerate:
            report['objects'][ob.name] = {
                'source_object': ob.get('source_object', ob.name),
                'islands': len(records), 'overlap_count': len(overlaps),
                'overlaps': overlaps[:400], 'degenerate_count': len(degenerate),
                'degenerate': degenerate[:400],
                'island_faces': [{'id': r['id'], 'faces': len(r['faces'])} for r in records],
            }
    out.mkdir(parents=True)
    (out / 'diagnosis.json').write_text(json.dumps(report, indent=2))
    for name, item in report['objects'].items():
        print(name, 'overlaps', item['overlap_count'], 'degenerate', item['degenerate_count'],
              'same_island', sum(o['same_island'] for o in item['overlaps']))
    print('ATLAS_DIAGNOSIS', len(report['objects']), 'objects')


if __name__ == '__main__':
    main()
