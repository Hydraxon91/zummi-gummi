"""Diagnose one proof component: duplicates, island count, overlap buckets, adjacency."""
import argparse
import importlib.util
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('compdiag_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    audit, uvx = load('atlas_audit'), load('uv_island_export')
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('PROOF_'))
    mesh, layer = ob.data, ob.data.uv_layers['UV_PROOF']
    mesh.calc_loop_triangles()
    print('OBJECT', ob.name, 'MATERIAL_SLOTS', len(ob.material_slots), [s.material.name if s.material else None for s in ob.material_slots])
    print('TEX', len(mesh.polygons), 'LOOSE', sum(1 for v in mesh.vertices if not any(v.index in p.vertices for p in mesh.polygons)))
    signatures = defaultdict(int)
    for poly in mesh.polygons:
        signatures[tuple(sorted(poly.vertices))] += 1
    duplicates = {k: v for k, v in signatures.items() if v > 1}
    print('DUPLICATE_FACE_SETS', len(duplicates), 'extra_faces', sum(v - 1 for v in duplicates.values()))
    tri_sig = defaultdict(int)
    for tri in mesh.loop_triangles:
        tri_sig[tuple(sorted(tri.vertices))] += 1
    dup_tris = sum(v - 1 for v in tri_sig.values() if v > 1)
    print('DUPLICATE_TRIANGLES', dup_tris)
    islands = uvx.mesh_islands(mesh, layer)
    print('UV_ISLANDS', len(islands), 'largest', sorted((len(i) for i in islands), reverse=True)[:6])
    by_face = defaultdict(list)
    for tri in mesh.loop_triangles:
        by_face[tri.polygon_index].append((tri, [(layer.data[k].uv.x, layer.data[k].uv.y) for k in tri.loops],
                                          [list(mesh.vertices[v].co) for v in tri.vertices]))
    prepared = []
    for face, tris in by_face.items():
        for tri, uv, co in tris:
            area = abs(audit.signed_area(uv))
            if area <= 1e-16:
                continue
            lo = [min(p[k] for p in uv) for k in (0, 1)]
            hi = [max(p[k] for p in uv) for k in (0, 1)]
            prepared.append((face, tri, uv, co, lo, hi, audit.triangle_area_3d(ob, mesh, tri)))
    grid, buckets, samples, adjacent = {}, defaultdict(int), [], 0
    allpairs = []
    for index, (face, tri, uv, co, lo, hi, a3) in enumerate(prepared):
        cells = [(x, y) for x in range(int(lo[0] * 64), min(63, int(hi[0] * 64)) + 1)
                 for y in range(int(lo[1] * 64), min(63, int(hi[1] * 64)) + 1)]
        for j in {j for c in cells for j in grid.get(c, [])}:
            o_face, o_tri, o_uv, o_co, olo, ohi, oa3 = prepared[j]
            if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                continue
            area = audit.overlap(uv, o_uv)
            if area <= 1e-12:
                continue
            shared = len(set(tri.vertices) & set(o_tri.vertices))
            adjacent += 1 if shared else 0
            for edge in (1e-12, 1e-9, 1e-6, 1e-4):
                if area > edge:
                    buckets[edge] += 1
            if len(samples) < 8:
                samples.append({'faces': [face, o_face], 'area': area,
                                'shared_vertices': shared,
                                'uv_area': [abs(audit.signed_area(uv)), abs(audit.signed_area(o_uv))],
                                '3d_area': [a3, oa3]})
            allpairs.append({'faces': [face, o_face], 'area': area, 'shared': shared,
                             'a3': [a3, oa3]})
        for c in cells:
            grid.setdefault(c, []).append(index)
    print('PAIR_DETAIL', json.dumps(sorted(allpairs, key=lambda p: -p['area'])))
    print('PAIRS', sum(1 for _ in samples), 'buckets', dict(buckets), 'adjacent_pairs', adjacent,
          'nonadjacent', sum(buckets.values()) - adjacent if False else '')
    print('SAMPLES', json.dumps(samples))
    Path(args.out).write_text(json.dumps({'buckets': dict(buckets), 'samples': samples,
                                          'pairs': allpairs,
                                          'duplicate_tris': dup_tris, 'islands': len(islands)}))


if __name__ == '__main__':
    main()
