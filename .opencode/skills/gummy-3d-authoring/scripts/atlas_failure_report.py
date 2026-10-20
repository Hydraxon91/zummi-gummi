"""Read-only forensic report for a failed atlas checkpoint, never an accepted delivery."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np


def helper(name):
    spec = importlib.util.spec_from_file_location('atlas_diag_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Disposable background process only')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused diagnostic output required')
    uvx, checks = helper('uv_island_export'), helper('uv_atlas_checks')
    records = []
    res = 1280
    for ob in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if ob.type != 'MESH' or not ob.visible_get() or ob.hide_render:
            continue
        mesh = ob.data
        layer = mesh.uv_layers['UV_AI_Atlas']
        triangles = uvx.uv_triangles(mesh, layer, res)
        for faces in uvx.mesh_islands(mesh, layer):
            points = [layer.data[k].uv for f in faces for k in mesh.polygons[f].loop_indices]
            ts = [t for f in faces for t in triangles[f]]
            area = sum(abs((t[2]-t[0])*(t[5]-t[1])-(t[4]-t[0])*(t[3]-t[1])) * 0.5 for t in ts) / (res-1)**2
            records.append({'object': ob.name, 'faces': faces, 'triangles': ts,
                            'u_min': min(p.x for p in points), 'v_min': min(p.y for p in points), 'area_uv': area,
                            'source_object': ob.get('source_object', ob.name)})
    records.sort(key=lambda r: (r['object'], round(r['u_min'],6), round(r['v_min'],6), -len(r['faces']), round(r['area_uv'],9)))
    for i, r in enumerate(records, 1):
        r['id'] = i
    result = checks.validate(records, res, max_pairs=10000)
    bad = {i for pair in result['overlaps'] for i in pair}
    details = []
    for r in records:
        if r['id'] not in bad:
            continue
        ob = bpy.data.objects[r['object']]
        ob.data.calc_loop_triangles()
        source_degenerate = 0
        for t in ob.data.loop_triangles:
            if t.polygon_index not in r['faces']:
                continue
            a, b, c = [ob.matrix_world @ ob.data.vertices[k].co for k in t.vertices]
            source_degenerate += (b-a).cross(c-a).length < 1e-12
        details.append({'id': r['id'], 'object': r['source_object'], 'faces': r['faces'],
                        'source_degenerate_triangles': source_degenerate})
    canvas = np.full((res, res, 3),255,dtype=np.uint8)
    for r in records:
        for t in r['triangles']:
            for i, j in ((0,2),(2,4),(4,0)):
                n = max(2, int(max(abs(t[j]-t[i]),abs(t[j+1]-t[i+1]))*2)+1)
                x = np.clip(np.rint(np.linspace(t[i],t[j],n)).astype(int),0,res-1)
                y = np.clip(np.rint(np.linspace(t[i+1],t[j+1],n)).astype(int),0,res-1)
                canvas[y,x] = (255,0,100) if r['id'] in bad else (70,70,70)
    out.mkdir(parents=True)
    uvx.write_png(out/'FAILED_layout_wireframe.png',canvas)
    report = {'status':'FAILED_DIAGNOSTIC_ONLY','source':bpy.data.filepath,'validation':result,'affected':details}
    (out/'failure_report.json').write_text(json.dumps(report,indent=2))
    print('ATLAS_DIAGNOSTIC', result, 'objects',sorted({r['object'] for r in details}))


if __name__ == '__main__':
    main()
