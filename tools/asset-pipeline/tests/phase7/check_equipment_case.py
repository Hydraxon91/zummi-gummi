"""Check Phase 7B equipment-case material zones and bounds."""

import argparse
import json
import sys
from pathlib import Path

import bpy

parse = argparse.ArgumentParser()
parse.add_argument("--source", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source")
objects = ["Equipment_Case", "Equipment_Handle", "Equipment_Feet"]
expected = {
    "Equipment_Case": {"Case_Shell_Teal", "Case_Frame_Silver", "Case_Dark_Rubber"},
    "Equipment_Handle": {"Case_Frame_Silver"},
    "Equipment_Feet": {"Case_Dark_Rubber"},
}
findings = []
records = {}
for name in objects:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        findings.append("missing mesh %s" % name)
        continue
    slots = [slot.material.name if slot.material else None for slot in obj.material_slots]
    counts = {slot: 0 for slot in slots if slot}
    for polygon in obj.data.polygons:
        material = slots[polygon.material_index] if polygon.material_index < len(slots) else None
        if material is None:
            findings.append("%s has a polygon without a material" % name)
        else:
            counts[material] = counts.get(material, 0) + 1
    if set(slots) != expected[name]:
        findings.append("%s material slots %s != %s" % (name, slots, sorted(expected[name])))
    if any(count == 0 for count in counts.values()):
        findings.append("%s has an unused material slot" % name)
    if not obj.data.uv_layers.active:
        findings.append("%s has no active UV map" % name)
    obj.data.calc_loop_triangles()
    records[name] = {
        "materials": slots,
        "polygons_per_material": counts,
        "polygons": len(obj.data.polygons),
        "triangles": len(obj.data.loop_triangles),
        "uv_maps": [layer.name for layer in obj.data.uv_layers],
        "dimensions": [round(float(value), 6) for value in obj.dimensions],
    }

# Combined world bounds of the three meshes.
points = []
for name in objects:
    obj = bpy.data.objects.get(name)
    if obj:
        points.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
bounds = None
if points:
    bounds = {
        "min": [min(point[index] for point in points) for index in range(3)],
        "max": [max(point[index] for point in points) for index in range(3)],
    }
    bounds["size"] = [bounds["max"][index] - bounds["min"][index]
                      for index in range(3)]

report = {
    "source": str(source),
    "objects": records,
    "world_bounds": bounds,
    "findings": findings,
    "status": "pass" if not findings else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_CASE_" + report["status"].upper(), json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
