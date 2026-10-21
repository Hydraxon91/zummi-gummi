"""Export the accepted Phase 7E source checkpoint as a self-contained GLB."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from construction_gate import run as run_construction
from check_evidence import validate_evidence_report
from asset_identity import get_asset_id, object_ids

parse = argparse.ArgumentParser()
parse.add_argument("--glb", required=True)
parse.add_argument("--report", required=True)
parse.add_argument("--construction-brief", required=True)
parse.add_argument("--candidate-ledger", required=True)
parse.add_argument("--evidence-report", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

glb_path = Path(args.glb)
report_path = Path(args.report)
for path in (glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")
if not bpy.data.filepath:
    raise RuntimeError("Open the accepted source checkpoint before exporting")

export_collections = [bpy.data.collections[name] for name in
                      ("7E_Office", "7E_Books", "7E_Lamp", "7E_Frutiger")]
export_meshes = [obj for collection in export_collections
                 for obj in collection.objects if obj.type == "MESH"]
construction = run_construction(
    args.construction_brief, args.candidate_ledger, args.evidence_report,
    bpy.data.filepath, [get_asset_id(obj) for obj in export_meshes])
errors = list(construction["errors"])
export_names = sorted({obj.name for obj in export_meshes})
ids_by_name = object_ids(export_meshes, errors)
expected_ids = [ids_by_name[name] for name in export_names if ids_by_name.get(name)]
evidence_recheck = validate_evidence_report(
    args.evidence_report, errors, export_names, expected_ids)
if errors:
    print("EXPORT_OFFICE_CORNER blocked " + json.dumps({
        "construction": construction,
        "evidence_recheck": evidence_recheck,
        "errors": errors,
    }))
    raise SystemExit(1)

scene = bpy.context.scene
collections = [bpy.data.collections[name] for name in ("7E_Office", "7E_Books", "7E_Lamp", "7E_Frutiger")]
bpy.ops.object.select_all(action="DESELECT")
selected = []
for collection in collections:
    for obj in collection.objects:
        if obj.type in {"MESH", "EMPTY"}:
            obj.select_set(True)
            selected.append(obj)
scene.view_layers[0].objects.active = bpy.data.objects["Office_Root"]
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)

lamp = bpy.data.objects["Office_DeskLamp_Root"]
lamp_light = bpy.data.objects.get("Office_DeskLamp_Light")
fan_light = bpy.data.objects.get("Office_Fan_Light")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


meshes = [obj for obj in selected if obj.type == "MESH"]
report = {
    "source": bpy.data.filepath,
    "source_sha256": sha256_file(bpy.data.filepath),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "glb_bytes": glb_path.stat().st_size,
    "construction": construction,
    "evidence_recheck": evidence_recheck,
    "selected_objects": len(selected),
    "mesh_objects": len(meshes),
    "materials": sorted({material.name for obj in meshes for material in obj.data.materials if material}),
    "lamp": {
        "root": lamp.name,
        "location": [round(float(value), 6) for value in lamp.location],
        "rotation_z_degrees": round(float(lamp.rotation_euler.z) * 57.295779513, 4),
        "light": lamp_light.name if lamp_light else None,
        "light_parent": lamp_light.parent.name if lamp_light and lamp_light.parent else None,
        "light_exported": False,
    },
    "fan_light": {
        "name": fan_light.name if fan_light else None,
        "parent": fan_light.parent.name if fan_light and fan_light.parent else None,
        "exported": False,
    },
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_OFFICE_EXPORTED", json.dumps({
    "glb": str(glb_path),
    "bytes": report["glb_bytes"],
    "sha256": report["glb_sha256"],
    "meshes": report["mesh_objects"],
}))
