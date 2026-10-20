"""Create a deliberately invalid material-zone fixture from the Phase 4 crate.

This is a negative control: one bevel polygon is assigned to the main material
slot, so the export-zone verifier must reject the wrong surface assignment.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--out-dir", required=True)
parser.add_argument("--polygon", type=int, default=0)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
if not source.is_file():
    raise FileNotFoundError(source)
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
checkpoint = out_dir / "crate_zones_invalid_001.blend"
glb = out_dir / "crate_zones_invalid_001.glb"
if checkpoint.exists() or glb.exists():
    raise FileExistsError("Refusing to overwrite an existing invalid-zone fixture")

crate = bpy.data.objects["Crate_Body"]
polygon = crate.data.polygons[args.polygon]
if polygon.material_index != 0:
    raise RuntimeError("Selected polygon is not in the edge slot")
polygon.material_index = 1
bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
bpy.ops.object.select_all(action="DESELECT")
crate.select_set(True)
bpy.context.view_layer.objects.active = crate
bpy.ops.export_scene.gltf(
    filepath=str(glb),
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_yup=True,
)
print("PHASE4_INVALID_ZONE", json.dumps({
    "checkpoint": str(checkpoint),
    "glb": str(glb),
    "polygon": args.polygon,
    "material_index": polygon.material_index,
}, sort_keys=True))
