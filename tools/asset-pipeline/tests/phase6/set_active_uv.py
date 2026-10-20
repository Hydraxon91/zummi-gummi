"""Set one UV layer active/active-render for a read-only density review copy."""

import argparse
import sys
from pathlib import Path

import bpy

parse = argparse.ArgumentParser()
parse.add_argument("--source", required=True)
parse.add_argument("--out", required=True)
parse.add_argument("--uv", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
out = Path(args.out).resolve()
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
if out.exists():
    raise FileExistsError(out)
crate = bpy.data.objects.get("Crate_Body")
if crate is None or crate.type != "MESH":
    raise RuntimeError("Crate_Body mesh not found")
layer = crate.data.uv_layers.get(args.uv)
if layer is None:
    raise RuntimeError("UV map not found: %s" % args.uv)
for candidate in crate.data.uv_layers:
    candidate.active_render = candidate == layer
crate.data.uv_layers.active = layer
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print("PHASE6_ACTIVE_UV", args.uv, str(out))
