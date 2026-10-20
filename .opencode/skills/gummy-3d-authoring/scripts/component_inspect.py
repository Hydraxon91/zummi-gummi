"""Read-only inspection of source components for a single-object UV proof."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('inspect_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--names', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    audit = load('atlas_audit')
    report = {}
    for name in args.names.split(','):
        ob = bpy.data.objects.get(name)
        if ob is None or ob.type != 'MESH':
            print(name, 'MISSING')
            continue
        mesh = ob.data
        entry = {'type': ob.type, 'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons),
                 'uv_layers': [layer.name for layer in mesh.uv_layers],
                 'materials': [s.material.name if s.material else None for s in ob.material_slots],
                 'modifiers': [m.type for m in ob.modifiers],
                 'dimensions': list(ob.dimensions), 'scale': list(ob.scale),
                 'hidden_render': ob.hide_render}
        for layer in mesh.uv_layers:
            mesh.calc_loop_triangles()
            tris = []
            for tri in mesh.loop_triangles:
                tris.append([(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops])
            lo = [min(p[i] for t in tris for p in t) for i in (0, 1)]
            hi = [max(p[i] for t in tris for p in t) for i in (0, 1)]
            prepared = []
            for tri in tris:
                tlo = [min(p[k] for p in tri) for k in (0, 1)]
                thi = [max(p[k] for p in tri) for k in (0, 1)]
                prepared.append((tri, tlo, thi))
            grid, pairs, max_area = {}, 0, 0.0
            for index, (tri, tlo, thi) in enumerate(prepared):
                cells = [(x, y) for x in range(int(tlo[0] * 64), min(63, int(thi[0] * 64)) + 1)
                         for y in range(int(tlo[1] * 64), min(63, int(thi[1] * 64)) + 1)]
                for j in {j for c in cells for j in grid.get(c, [])}:
                    other, olo, ohi = prepared[j]
                    if any(thi[k] <= olo[k] or tlo[k] >= ohi[k] for k in (0, 1)):
                        continue
                    area = audit.overlap(tri, other)
                    if area > 1e-12:
                        pairs += 1
                        max_area = max(max_area, area)
                for c in cells:
                    grid.setdefault(c, []).append(index)
            entry['uv_' + layer.name] = {'bounds': [lo, hi], 'overlap_pairs_1e12': pairs,
                                         'max_overlap_normalized': max_area}
        report[name] = entry
        print(name, json.dumps(entry))
    Path(args.out).write_text(json.dumps(report, indent=2))
    print('INSPECT_DONE')


if __name__ == '__main__':
    main()
