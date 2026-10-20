"""Map semantic island ids (surface-probe evidence) to exporter island ids and write overrides."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('map_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--names', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--object', default='Body_Shell')
    parser.add_argument('--uv', default='UVMap')
    parser.add_argument('--resolution', type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused output required')
    uvx = load('uv_island_export')
    doc = json.loads(Path(args.evidence).read_text())
    names = json.loads(Path(args.names).read_text())
    ob = bpy.data.objects[args.object]
    mesh = ob.data
    layer = mesh.uv_layers[args.uv]
    semantic = {face: r['id'] for r in doc['islands'] for face in r['faces']}
    triangles = uvx.uv_triangles(mesh, layer, args.resolution)
    rows = []
    for faces in uvx.mesh_islands(mesh, layer):
        points = [layer.data[k].uv for f in faces for k in mesh.polygons[f].loop_indices]
        u_min = min(p.x for p in points)
        v_min = min(p.y for p in points)
        area = sum(abs((t[2] - t[0]) * (t[5] - t[1]) - (t[4] - t[0]) * (t[3] - t[1])) * 0.5
                   for f in faces for t in triangles[f]) / (args.resolution - 1) ** 2
        ids = {semantic[f] for f in faces}
        if len(ids) != 1:
            raise ValueError('Exporter island spans semantic ids %r' % sorted(ids))
        rows.append({'u_min': u_min, 'v_min': v_min, 'faces': len(faces), 'area': area,
                     'semantic': ids.pop()})
    rows.sort(key=lambda r: (args.object, round(r['u_min'], 6), round(r['v_min'], 6),
                             -r['faces'], round(r['area'], 9)))
    overrides = {}
    for index, row in enumerate(rows, start=1):
        name = names[str(row['semantic'])]['part_name']
        overrides[str(index)] = {'part_name': name}
    if len(overrides) != len(doc['islands']):
        raise ValueError('Island count mismatch: %d vs %d' % (len(overrides), len(doc['islands'])))
    if len({row['semantic'] for row in rows}) != len(rows):
        raise ValueError('Semantic id used more than once')
    out.write_text(json.dumps(overrides, indent=2, sort_keys=True))
    crosswalk = {str(row['semantic']): index for index, row in enumerate(rows, start=1)}
    out.with_name('id_crosswalk.json').write_text(json.dumps(crosswalk, indent=2, sort_keys=True))
    print('ISLAND_NAME_MAP', len(overrides), 'islands; example', json.dumps(overrides['1']))


if __name__ == '__main__':
    main()
