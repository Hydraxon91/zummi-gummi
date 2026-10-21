"""Check the Phase 7D desk-lamp assembly and source/export preservation."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

parse = argparse.ArgumentParser()
parse.add_argument("--second")
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def mesh_objects(prefix=""):
    return sorted(
        (obj for obj in bpy.data.objects
         if obj.type == "MESH" and obj.name.startswith(prefix)),
        key=lambda obj: obj.name,
    )


def object_bvh(obj):
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    faces = [tuple(triangle.vertices) for triangle in obj.data.loop_triangles]
    return BVHTree.FromPolygons(verts, faces, all_triangles=True)


def world_bounds(obj):
    points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "min": [min(point[i] for point in points) for i in range(3)],
        "max": [max(point[i] for point in points) for i in range(3)],
    }


def inventory(prefix=""):
    result = {}
    for obj in mesh_objects(prefix):
        name = obj.name[len(prefix):] if prefix else obj.name
        result[name] = {
            "vertices": len(obj.data.vertices),
            "triangles": len(obj.data.loop_triangles),
            "bounds": world_bounds(obj),
            "location": [round(float(value), 6) for value in obj.location],
            "rotation": [round(float(value), 6) for value in obj.rotation_euler],
            "scale": [round(float(value), 6) for value in obj.scale],
            "materials": [slot.material.name for slot in obj.material_slots
                          if slot.material],
            "parent": obj.parent.name if obj.parent else None,
        }
    return result


def pair_key(left, right):
    return "%s|%s" % tuple(sorted((left, right)))


def close_bounds(left, right, tolerance=1e-5):
    for key in ("min", "max"):
        for a, b in zip(left[key], right[key]):
            if abs(a - b) > tolerance:
                return False
    return True


all_objects = mesh_objects()
by_name = {obj.name: obj for obj in all_objects}
bvh = {obj.name: object_bvh(obj) for obj in all_objects}
source_inventory = inventory()

expected_pairs = [
    ("DeskLamp_Base", "DeskLamp_Stem"),
    ("DeskLamp_Base", "DeskLamp_Collar"),
    ("DeskLamp_Stem", "DeskLamp_Collar"),
    ("DeskLamp_Stem", "DeskLamp_Yoke"),
    ("DeskLamp_Yoke", "DeskLamp_Yoke_Arm_1"),
    ("DeskLamp_Yoke", "DeskLamp_Yoke_Arm_2"),
    ("DeskLamp_Yoke_Arm_1", "DeskLamp_Pivot"),
    ("DeskLamp_Yoke_Arm_2", "DeskLamp_Pivot"),
    ("DeskLamp_Pivot", "DeskLamp_Pivot_Cap_1"),
    ("DeskLamp_Pivot", "DeskLamp_Pivot_Cap_2"),
    ("DeskLamp_Pivot", "DeskLamp_Head_Arm"),
    ("DeskLamp_Head_Arm", "DeskLamp_Bracket"),
    ("DeskLamp_Bracket", "DeskLamp_Shade_Neck"),
    ("DeskLamp_Shade_Neck", "DeskLamp_Shade_Mount"),
    ("DeskLamp_Shade_Neck", "DeskLamp_Shade"),
    ("DeskLamp_Shade_Mount", "DeskLamp_Shade"),
    ("DeskLamp_Base", "DeskLamp_Base_Screw_1"),
    ("DeskLamp_Base", "DeskLamp_Base_Screw_2"),
    ("DeskLamp_Base", "DeskLamp_Pad_1"),
    ("DeskLamp_Base", "DeskLamp_Pad_2"),
    ("DeskLamp_Base", "DeskLamp_Pad_3"),
    ("DeskLamp_Base", "DeskLamp_Pad_4"),
    ("DeskLamp_Reflector", "DeskLamp_Reflector_Spoke_1"),
    ("DeskLamp_Reflector", "DeskLamp_Reflector_Spoke_2"),
    ("DeskLamp_Reflector", "DeskLamp_Reflector_Spoke_3"),
    ("DeskLamp_Shade", "DeskLamp_Reflector_Spoke_1"),
    ("DeskLamp_Shade", "DeskLamp_Reflector_Spoke_2"),
    ("DeskLamp_Shade", "DeskLamp_Reflector_Spoke_3"),
]

interfaces = {}
for left, right in expected_pairs:
    count = len(bvh[left].overlap(bvh[right]))
    interfaces[pair_key(left, right)] = {
        "left": left,
        "right": right,
        "overlap_pairs": count,
        "status": "pass" if count > 0 else "fail",
    }

# Reflector must clear the shade; its spokes provide the physical attachment.
shade = bvh["DeskLamp_Shade"]
reflector = bvh["DeskLamp_Reflector"]
reflector_overlap = len(shade.overlap(reflector))
reflector_distances = []
for vertex in by_name["DeskLamp_Reflector"].data.vertices:
    point = by_name["DeskLamp_Reflector"].matrix_world @ vertex.co
    _, _, _, distance = shade.find_nearest(point)
    if distance is not None:
        reflector_distances.append(distance)
for vertex in by_name["DeskLamp_Shade"].data.vertices:
    point = by_name["DeskLamp_Shade"].matrix_world @ vertex.co
    _, _, _, distance = reflector.find_nearest(point)
    if distance is not None:
        reflector_distances.append(distance)
reflector_gap = min(reflector_distances) if reflector_distances else None

# Connectivity graph for intentional contact.
adjacency = {obj.name: set() for obj in all_objects}
for left, right in expected_pairs:
    adjacency[left].add(right)
    adjacency[right].add(left)
visited = set()
stack = ["DeskLamp_Base"]
while stack:
    name = stack.pop()
    if name in visited:
        continue
    visited.add(name)
    stack.extend(adjacency.get(name, ()))
unvisited = sorted(set(adjacency) - visited)

expected_material = {}
for name in source_inventory:
    if name == "DeskLamp_Base" or name == "DeskLamp_Shade":
        expected_material[name] = "Lamp_Teal"
    elif name == "DeskLamp_Reflector":
        expected_material[name] = "Lamp_Reflector_Baked"
    elif name.startswith("DeskLamp_Pad_"):
        expected_material[name] = "Lamp_Rubber"
    else:
        expected_material[name] = "Lamp_Silver"
material_mismatches = []
material_users = {}
for name, data in source_inventory.items():
    materials = data["materials"]
    for material in materials:
        material_users.setdefault(material, []).append(name)
    if materials != [expected_material[name]]:
        material_mismatches.append({"object": name, "materials": materials,
                                    "expected": expected_material[name]})

export_inventory = None
preservation = None
if args.second:
    # Capture the source inventory first, then open the export checkpoint.
    source_snapshot = source_inventory
    bpy.ops.wm.open_mainfile(filepath=args.second)
    export_inventory = inventory("Export_")
    preservation = {
        "source_objects": len(source_snapshot),
        "export_objects": len(export_inventory),
        "mismatches": [],
    }
    for name, source_data in source_snapshot.items():
        export_data = export_inventory.get(name)
        if export_data is None:
            preservation["mismatches"].append(
                {"object": name, "reason": "missing from export copy"})
            continue
        if (source_data["vertices"] != export_data["vertices"]
                or source_data["triangles"] != export_data["triangles"]):
            preservation["mismatches"].append(
                {"object": name, "reason": "mesh count differs"})
        if not close_bounds(source_data["bounds"], export_data["bounds"]):
            preservation["mismatches"].append(
                {"object": name, "reason": "world bounds differ"})
        for key in ("location", "rotation", "scale"):
            if any(abs(a - b) > 1e-6
                   for a, b in zip(source_data[key], export_data[key])):
                preservation["mismatches"].append(
                    {"object": name, "reason": "%s differs" % key})

findings = []
for pair, data in interfaces.items():
    if data["status"] != "pass":
        findings.append("expected contact has no overlap: %s" % pair)
if reflector_overlap:
    findings.append("reflector intersects the shade")
if reflector_gap is None or reflector_gap <= 0.001:
    findings.append("reflector clearance is missing or below 1 mm")
if unvisited:
    findings.append("unconnected parts: %s" % ", ".join(unvisited))
if material_mismatches:
    findings.append("material assignment mismatch")
if preservation and preservation["mismatches"]:
    findings.append("source/export-copy preservation mismatch")

report = {
    "source_objects": len(source_inventory),
    "object_names": sorted(source_inventory),
    "interfaces": interfaces,
    "reflector_shade": {
        "overlap_pairs": reflector_overlap,
        "min_surface_vertex_distance_m": reflector_gap,
        "status": "pass" if reflector_overlap == 0
        and reflector_gap is not None and reflector_gap > 0.001 else "fail",
    },
    "connectivity": {
        "visited": sorted(visited),
        "unvisited": unvisited,
        "status": "pass" if not unvisited else "fail",
    },
    "materials": {
        "users": material_users,
        "mismatches": material_mismatches,
        "status": "pass" if not material_mismatches else "fail",
    },
    "preservation": preservation,
    "findings": findings,
    "status": "pass" if not findings else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_DESK_ASSEMBLY_" + report["status"].upper(),
      json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
