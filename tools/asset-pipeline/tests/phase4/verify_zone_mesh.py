"""Verify evaluated material slots, zone coverage and mesh health for Phase 4."""

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--out", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

crate = bpy.data.objects["Crate_Body"]
slots = list(crate.material_slots)
slot_names = [slot.material.name if slot.material else None for slot in slots]
slot_indices = [polygon.material_index for polygon in crate.data.polygons]
valid_indices = all(0 <= index < len(slots) for index in slot_indices)
missing_materials = [index for index, name in enumerate(slot_names) if name is None]
expected_main = {
    polygon.index for polygon in crate.data.polygons
    if max(abs(value) for value in polygon.normal) > 0.999
}
mismatches = [
    polygon.index for polygon in crate.data.polygons
    if (polygon.material_index == 1) != (polygon.index in expected_main)
]
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated = crate.evaluated_get(depsgraph)
mesh = evaluated.to_mesh()
bm = bmesh.new()
bm.from_mesh(mesh)
bm.normal_update()
bounds = [vertex.co.copy() for vertex in bm.verts]
center = sum(bounds, bounds[0].copy() * 0.0) / len(bounds)
loose = [vertex for vertex in bm.verts if not vertex.link_edges]
non_manifold = [edge for edge in bm.edges if not edge.is_manifold]
flipped = [
    face for face in bm.faces
    if face.normal.dot(face.calc_center_median() - center) <= 1e-6
]
report = {
    "object": crate.name,
    "slot_names": slot_names,
    "slot_count": len(slots),
    "missing_material_slots": missing_materials,
    "slot_indices_valid": valid_indices,
    "material_indices": slot_indices,
    "main_polygons": len(expected_main),
    "edge_polygons": len(crate.data.polygons) - len(expected_main),
    "zone_mismatches": mismatches,
    "evaluated_vertices": len(bm.verts),
    "evaluated_edges": len(bm.edges),
    "evaluated_faces": len(bm.faces),
    "loose_vertices": len(loose),
    "non_manifold_edges": len(non_manifold),
    "flipped_faces": len(flipped),
    "status": "pass" if (
        valid_indices
        and not missing_materials
        and not mismatches
        and not loose
        and not non_manifold
        and not flipped
    ) else "fail",
}
bm.free()
evaluated.to_mesh_clear()
Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PHASE4_ZONE_MESH", json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
