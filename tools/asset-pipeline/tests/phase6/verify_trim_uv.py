"""Verify the independent silver UV map after the trim-scale edit."""

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
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
crate = bpy.data.objects.get("Crate_Body")
if crate is None or crate.type != "MESH":
    raise RuntimeError("Crate_Body mesh not found")
mesh = crate.data
base = mesh.uv_layers.get("UVMap")
silver_map = mesh.uv_layers.get("UVMap_Silver")
if base is None or silver_map is None:
    raise RuntimeError("Expected UVMap and UVMap_Silver")
silver_slot = None
for index, slot in enumerate(crate.material_slots):
    name = slot.material.name.lower() if slot.material else ""
    if "silver" in name or "pilot" in name:
        silver_slot = index
        break
if silver_slot is None:
    raise RuntimeError("Silver material slot not found")

silver_loops = []
teal_loops = []
for polygon in mesh.polygons:
    target = silver_loops if polygon.material_index == silver_slot else teal_loops
    target.extend(polygon.loop_indices)


def bounds(layer, loops):
    us = [layer.data[index].uv[0] for index in loops]
    vs = [layer.data[index].uv[1] for index in loops]
    return [min(us), min(vs), max(us), max(vs)]


def span(bounds_value):
    return [bounds_value[2] - bounds_value[0], bounds_value[3] - bounds_value[1]]


base_silver = bounds(base, silver_loops)
scaled_silver = bounds(silver_map, silver_loops)
base_teal = bounds(base, teal_loops)
scaled_teal = bounds(silver_map, teal_loops)
teal_max_delta = max(
    max(abs(base.data[index].uv[0] - silver_map.data[index].uv[0]),
        abs(base.data[index].uv[1] - silver_map.data[index].uv[1]))
    for index in teal_loops)
silver_span = span(base_silver)
scaled_span = span(scaled_silver)
ratios = [scaled_span[0] / silver_span[0], scaled_span[1] / silver_span[1]]
report = {
    "source": str(source),
    "silver_slot": silver_slot,
    "silver_material": crate.material_slots[silver_slot].material.name,
    "uv_maps": [layer.name for layer in mesh.uv_layers],
    "silver_loop_count": len(silver_loops),
    "teal_loop_count": len(teal_loops),
    "silver_bounds_uv": base_silver,
    "silver_scaled_bounds_uv": scaled_silver,
    "silver_span_ratio": ratios,
    "teal_bounds_uv": base_teal,
    "teal_scaled_bounds_uv": scaled_teal,
    "teal_max_delta": teal_max_delta,
    "expected_scale": 0.8,
    "status": "pass" if (abs(ratios[0] - 0.8) < 1e-4
                         and abs(ratios[1] - 0.8) < 1e-4
                         and teal_max_delta < 1e-6) else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE6_TRIM_UV_CHECK", json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
