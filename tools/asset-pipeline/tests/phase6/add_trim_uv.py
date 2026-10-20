"""Add an independent silver trim UV map with a reduced texture footprint.

The teal UV map is unchanged. The new UV map is a copy of the normalized UVs with
only the silver bevel polygons scaled toward the UV centre. This keeps the silver
grain continuous across silver faces while lowering its texel density.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy

parse = argparse.ArgumentParser()
parse.add_argument("--source", required=True)
parse.add_argument("--out", required=True)
parse.add_argument("--scale", type=float, default=0.8)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
out = Path(args.out).resolve()
if not source.is_file():
    raise FileNotFoundError(source)
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
if out.exists():
    raise FileExistsError(out)
out.parent.mkdir(parents=True, exist_ok=True)
if not 0.0 < args.scale <= 1.0:
    raise ValueError("scale must be in (0, 1]")

crate = bpy.data.objects.get("Crate_Body")
if crate is None or crate.type != "MESH":
    raise RuntimeError("Crate_Body mesh not found")
mesh = crate.data
base_layer = mesh.uv_layers.get("UVMap")
if base_layer is None:
    raise RuntimeError("UVMap not found")
if mesh.uv_layers.get("UVMap_Silver") is not None:
    raise RuntimeError("UVMap_Silver already exists")

silver_slot = None
for index, slot in enumerate(crate.material_slots):
    name = slot.material.name.lower() if slot.material else ""
    if "silver" in name or "pilot" in name:
        silver_slot = index
        break
if silver_slot is None:
    raise RuntimeError("Silver material slot not found")

silver_layer = mesh.uv_layers.new(name="UVMap_Silver", do_init=True)
for loop_index, loop in enumerate(mesh.loops):
    silver_layer.data[loop_index].uv = base_layer.data[loop_index].uv

for polygon in mesh.polygons:
    if polygon.material_index != silver_slot:
        continue
    for loop_index in polygon.loop_indices:
        uv = silver_layer.data[loop_index].uv
        uv[0] = 0.5 + (uv[0] - 0.5) * args.scale
        uv[1] = 0.5 + (uv[1] - 0.5) * args.scale

# Keep the original map active; the silver material explicitly names the new one.
mesh.uv_layers.active = base_layer
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print("PHASE6_TRIM_UV", json.dumps({
    "source": str(source),
    "out": str(out),
    "silver_slot": silver_slot,
    "silver_material": crate.material_slots[silver_slot].material.name,
    "scale": args.scale,
    "uv_maps": [layer.name for layer in mesh.uv_layers],
    "loop_count": len(mesh.loops),
    "silver_polygon_count": sum(
        1 for polygon in mesh.polygons if polygon.material_index == silver_slot),
}, sort_keys=True))
