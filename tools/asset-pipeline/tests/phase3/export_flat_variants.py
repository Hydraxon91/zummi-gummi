"""Export flat-colour diagnostics from the curved checkpoint."""

import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: export_flat_variants.py -- <out-dir>")
out_dir = Path(argv[0])
out_dir.mkdir(parents=True, exist_ok=True)
low = bpy.data.objects["Curved_Low"]


def flat_material(name, normal_image=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.55, 0.55, 0.55, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.45
    bsdf.inputs["Metallic"].default_value = 0.0
    if normal_image is not None:
        texture = nodes.new("ShaderNodeTexImage")
        texture.image = normal_image
        normal_map = nodes.new("ShaderNodeNormalMap")
        links.new(texture.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def export(name, material):
    low.data.materials.clear()
    low.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(
        filepath=name, export_format="GLB", use_selection=True,
        export_apply=False, export_materials="EXPORT",
        export_image_format="AUTO", export_tangents=True, export_yup=True)


export(str(out_dir / "curved_1024_flat.glb"), flat_material("Curved_Flat"))
normal = bpy.data.images.get("Curved_Normal_1024")
if normal is not None:
    export(str(out_dir / "curved_1024_flat_normal.glb"),
           flat_material("Curved_Flat_Normal", normal))
print("FLAT_VARIANTS_DONE", out_dir)
