"""Disposable Blender clean-import check for a GLB.

Run in a factory-startup background Blender; this script never saves the file.
It imports the candidate, records decoded inventory/materials/images/bounds and
writes a JSON result. It does not validate glTF conformance or appearance.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

TOOL_NAME = "asset-pipeline-clean-import"
TOOL_VERSION = "0.1.0"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def world_bounds(objects):
    dg = bpy.context.evaluated_depsgraph_get()
    mins = [math.inf, math.inf, math.inf]
    maxs = [-math.inf, -math.inf, -math.inf]
    sampled = 0
    for ob in objects:
        if ob.type != "MESH":
            continue
        evaluated = ob.evaluated_get(dg)
        mesh = evaluated.to_mesh()
        try:
            for vertex in mesh.vertices:
                co = evaluated.matrix_world @ vertex.co
                sampled += 1
                for index in range(3):
                    mins[index] = min(mins[index], float(co[index]))
                    maxs[index] = max(maxs[index], float(co[index]))
        finally:
            evaluated.to_mesh_clear()
    if not sampled:
        return None
    return {
        "min": mins,
        "max": maxs,
        "size": [maxs[index] - mins[index] for index in range(3)],
        "space": "world; evaluated mesh vertices",
    }


def image_record(image):
    path = bpy.path.abspath(image.filepath, library=image.library) if image.filepath else None
    packed = bool(image.packed_file) or bool(image.packed_files)
    external = bool(path) and not packed
    return {
        "name": image.name,
        "source": image.source,
        "filepath": image.filepath,
        "resolved_path": path,
        "packed": packed,
        "external": external,
        "exists": Path(path).is_file() if external else None,
        "size": list(image.size),
        "color_space": image.colorspace_settings.name,
    }


def material_record(material):
    tree = material.node_tree
    nodes = list(tree.nodes) if tree else []
    principled = next((node for node in nodes if node.type == "BSDF_PRINCIPLED"), None)
    channels = {}
    if principled is not None:
        for name in ("Base Color", "Metallic", "Roughness", "Normal",
                     "Emission Color", "Emission Strength", "Alpha"):
            if name in principled.inputs:
                socket = principled.inputs[name]
                channels[name] = {
                    "linked": bool(socket.is_linked),
                    "default": list(socket.default_value)
                    if hasattr(socket.default_value, "__len__")
                    and not isinstance(socket.default_value, str)
                    else socket.default_value,
                }
    return {
        "name": material.name,
        "use_nodes": bool(material.use_nodes),
        "node_types": sorted({node.type for node in nodes}),
        "principled": principled is not None,
        "channels": channels,
        "images": sorted({
            node.image.name for node in nodes
            if node.type == "TEX_IMAGE" and node.image
        }),
    }


def main():
    args = parse_args()
    result = {
        "tool": {"name": TOOL_NAME, "version": TOOL_VERSION,
                 "blender_version": bpy.app.version_string},
        "glb": str(Path(args.glb).resolve()),
        "status": "unverified",
        "findings": [],
        "objects": [],
        "materials": [],
        "images": [],
        "actions": [],
        "bounds": None,
        "limits": [
            "Import success does not prove glTF conformance.",
            "Material channel values do not prove rendered appearance.",
            "Extension support is reported by the validator and preview separately.",
        ],
    }
    try:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        if not Path(args.glb).is_file():
            raise FileNotFoundError(args.glb)
        bpy.ops.import_scene.gltf(filepath=str(Path(args.glb).resolve()))
        bpy.context.view_layer.update()
        helper_names = {
            ob.name for ob in bpy.data.objects
            if any(collection.name == "glTF_not_exported"
                   for collection in ob.users_collection)
        }
        for armature in bpy.data.objects:
            if armature.type != "ARMATURE":
                continue
            for bone in armature.pose.bones:
                if bone.custom_shape:
                    helper_names.add(bone.custom_shape.name)
        objects = [ob for ob in bpy.data.objects if ob.name not in helper_names]
        mesh_objects = [ob for ob in objects if ob.type == "MESH"]
        result["objects"] = [
            {
                "name": ob.name,
                "type": ob.type,
                "parent": ob.parent.name if ob.parent else None,
                "modifiers": [modifier.type for modifier in ob.modifiers],
            }
            for ob in objects
        ]
        result["helper_objects"] = sorted(helper_names)
        result["materials"] = [material_record(mat) for mat in bpy.data.materials]
        result["images"] = [image_record(image) for image in bpy.data.images
                            if image.name not in {"Render Result", "Viewer Node"}]
        result["actions"] = sorted(action.name for action in bpy.data.actions)
        result["bounds"] = world_bounds(mesh_objects)
        result["counts"] = {
            "objects": len(objects),
            "mesh_objects": len(mesh_objects),
            "meshes": len({ob.data.name for ob in mesh_objects}),
            "materials": len(bpy.data.materials),
            "images": len(result["images"]),
            "armatures": len(bpy.data.armatures),
            "actions": len(result["actions"]),
            "helper_objects": len(result["helper_objects"]),
        }
        missing_images = [
            image["name"] for image in result["images"]
            if image["external"] and image["exists"] is False
        ]
        for name in missing_images:
            result["findings"].append({
                "severity": "error",
                "code": "clean_import_missing_image",
                "message": "Imported image %s has no usable external file." % name,
            })
        if not mesh_objects:
            result["findings"].append({
                "severity": "error",
                "code": "clean_import_no_meshes",
                "message": "Import produced no mesh objects.",
            })
        if not result["materials"]:
            result["findings"].append({
                "severity": "warning",
                "code": "clean_import_no_materials",
                "message": "Import produced no materials.",
            })
        if missing_images or not mesh_objects:
            result["status"] = "fail"
        elif not result["materials"]:
            result["status"] = "review"
        else:
            result["status"] = "pass"
    except Exception as exc:
        result["status"] = "fail"
        result["findings"].append({
            "severity": "error",
            "code": "clean_import_exception",
            "message": "%s: %s" % (type(exc).__name__, exc),
        })
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2))
    print("CLEAN_IMPORT", json.dumps({
        "status": result["status"],
        "counts": result.get("counts"),
        "findings": len(result["findings"]),
    }), flush=True)


if __name__ == "__main__":
    main()
