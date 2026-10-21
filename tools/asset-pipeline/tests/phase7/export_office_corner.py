"""Export the accepted Phase 7E source checkpoint as a self-contained GLB."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--glb", required=True)
parse.add_argument("--report", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

glb_path = Path(args.glb)
report_path = Path(args.report)
for path in (glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")
if not bpy.data.filepath:
    raise RuntimeError("Open the accepted source checkpoint before exporting")

scene = bpy.context.scene
collections = [bpy.data.collections[name] for name in ("7E_Office", "7E_Books", "7E_Lamp")]
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
