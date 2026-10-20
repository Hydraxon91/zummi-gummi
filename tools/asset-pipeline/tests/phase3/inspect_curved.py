"""Print seam, topology and normal diagnostics for the curved fixture."""

import json
import math
import sys
from collections import defaultdict

import bmesh
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
object_name = argv[0] if argv else "Curved_Low"
ob = bpy.data.objects[object_name]
mesh = ob.data
uv_layer = mesh.uv_layers.active
assert uv_layer is not None

bm = bmesh.new()
bm.from_mesh(mesh)
bm.normal_update()
uv = bm.loops.layers.uv.active

loose = [v for v in bm.verts if not v.link_edges]
non_manifold = [e for e in bm.edges if not e.is_manifold]
sharp = [e for e in bm.edges if not e.smooth]

positions = defaultdict(list)
for vertex in bm.verts:
    key = tuple(round(value, 6) for value in vertex.co)
    positions[key].append(vertex.index)
coincident = {
    ",".join(str(value) for value in key): indexes
    for key, indexes in positions.items()
    if len(indexes) > 1
}

seams = []
for edge in bm.edges:
    loops = list(edge.link_loops)
    if len(loops) != 2:
        continue
    left, right = loops
    left_next = left.link_loop_next
    right_next = right.link_loop_next
    differences = []
    normal_deltas = []
    for left_loop, right_loop in (
            (left, right if right.vert == left.vert else right_next),
            (left_next, right if right.vert == left_next.vert else right_next)):
        left_uv = left_loop[uv].uv.copy()
        right_uv = right_loop[uv].uv.copy()
        differences.append((left_uv - right_uv).length)
        normal_deltas.append(
            (mesh.corner_normals[left_loop.index].vector
             - mesh.corner_normals[right_loop.index].vector).length)
    if max(differences) <= 1e-6:
        continue
    midpoint = (edge.verts[0].co + edge.verts[1].co) / 2.0
    seams.append({
        "edge": edge.index,
        "verts": [edge.verts[0].index, edge.verts[1].index],
        "midpoint": [round(value, 6) for value in midpoint],
        "angle_degrees": round(math.degrees(math.atan2(midpoint.y, midpoint.x)), 3),
        "uv_delta_max": round(max(differences), 6),
        "normal_delta_max": round(max(normal_deltas), 8),
    })

uvs = [tuple(loop[uv].uv) for face in bm.faces for loop in face.loops]
print("CURVED_DIAGNOSTICS", json.dumps({
    "object": object_name,
    "vertices": len(bm.verts),
    "edges": len(bm.edges),
    "faces": len(bm.faces),
    "loose_vertices": len(loose),
    "non_manifold_edges": len(non_manifold),
    "sharp_edges": len(sharp),
    "coincident_vertex_groups": coincident,
    "custom_normals": bool(mesh.has_custom_normals),
    "smooth_polygons": sum(1 for polygon in mesh.polygons if polygon.use_smooth),
    "polygons": len(mesh.polygons),
    "uv_island_bounds": [
        round(min(value[0] for value in uvs), 6),
        round(min(value[1] for value in uvs), 6),
        round(max(value[0] for value in uvs), 6),
        round(max(value[1] for value in uvs), 6),
    ],
    "uv_discontinuity_edges": len(seams),
    "uv_seams": seams,
}, sort_keys=True))
bm.free()
