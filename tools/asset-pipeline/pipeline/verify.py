"""Clean-room verification of an exported GLB."""
from __future__ import annotations

from pathlib import Path

from .common import PipelineError
from .export import audit_glb


def clean_import(glb_path):
    """Import into an empty scene and report what actually resolved."""
    import bpy

    if not bpy.app.background:
        raise PipelineError('Clean import requires disposable background Blender; refusing to reset a live scene')
    path = Path(glb_path)
    if not path.exists():
        raise PipelineError(f"missing GLB: {path}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    missing = []
    for material in bpy.data.materials:
        if not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image is None:
                missing.append(material.name)
    uv_sets = {obj.name: [layer.name for layer in obj.data.uv_layers] for obj in objects}
    return {
        "path": str(path),
        "meshes": len(objects),
        "materials": len([m for m in bpy.data.materials if m.users]),
        "images": len(bpy.data.images),
        "vertices": sum(len(obj.data.vertices) for obj in objects),
        "triangles": sum(len(obj.data.loop_triangles) for obj in objects
                         if (obj.data.calc_loop_triangles() or True)),
        "missing_textures": sorted(set(missing)),
        "objects_without_uv": sorted(name for name, sets in uv_sets.items() if not sets),
        "ok": not missing,
    }


def verify(glb_path):
    result = {"audit": audit_glb(glb_path)}
    result["import"] = clean_import(glb_path)
    result["ok"] = result["audit"]["ok"] and result["import"]["ok"]
    return result
