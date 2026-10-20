"""Independent brute-force check of reported atlas failures, including same-face triangles."""
import json
from collections import defaultdict
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).parent))
import importlib.util
spec = importlib.util.spec_from_file_location('checks', Path(__file__).with_name('uv_atlas_checks.py'))
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
spec = importlib.util.spec_from_file_location('uvx', Path(__file__).with_name('uv_island_export.py'))
uvx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uvx)

RES = 1280
TARGETS = {'ATLAS__Dashboard_PassengerInset', 'ATLAS__RearLamp_Housing_L',
           'ATLAS__RearLamp_Housing_R', 'ATLAS__RearLamp_Lens_L',
           'ATLAS__RearLamp_Lens_R', 'ATLAS__Reservoirs', 'ATLAS__Body_Shell',
           'ATLAS__Interior_Firewall'}
for ob in bpy.context.scene.objects:
    if ob.name not in TARGETS or ob.type != 'MESH':
        continue
    mesh = ob.data
    layer = mesh.uv_layers['UV_AI_Atlas']
    mesh.calc_loop_triangles()
    tri_map = uvx.uv_triangles(mesh, layer, RES)
    islands = uvx.mesh_islands(mesh, layer)
    tris = []
    for faces in islands:
        for face in faces:
            for flat in tri_map[face]:
                tri = [(flat[k] / (RES - 1), 1 - flat[k + 1] / (RES - 1)) for k in (0, 2, 4)]
                if abs(checks.cross(*tri)) <= 1e-12:
                    continue
                lo = [min(p[k] for p in tri) for k in (0, 1)]
                hi = [max(p[k] for p in tri) for k in (0, 1)]
                tris.append((face, tri, lo, hi))
    grid, hits, same_face = defaultdict(list), 0, 0
    for index, (face, tri, lo, hi) in enumerate(tris):
        cells = [(x, y) for x in range(int(lo[0] * 128), min(127, int(hi[0] * 128)) + 1)
                 for y in range(int(lo[1] * 128), min(127, int(hi[1] * 128)) + 1)]
        for j in {j for c in cells for j in grid[c]}:
            other_face, other, olo, ohi = tris[j]
            if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                continue
            if checks.intersection_area(tri, other) > 1e-12:
                hits += 1
                same_face += face == other_face
        for c in cells:
            grid[c].append(index)
    print(ob.name, 'triangle_intersections', hits, 'same_face_intersections', same_face,
          'triangles', len(tris))
