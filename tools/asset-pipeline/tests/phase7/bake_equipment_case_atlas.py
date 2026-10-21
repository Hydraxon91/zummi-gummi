"""Bake the Phase 7B equipment case into one non-overlapping texture atlas.

The accepted tileable case remains untouched. This script duplicates the three
parts, joins them, re-packs the UVs into one atlas and bakes the existing PBR
inputs. It is a comparison candidate, not a replacement delivery.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--resolution", type=int, default=1024)
parse.add_argument("--margin", type=int, default=4)
parse.add_argument("--samples", type=int, default=16)
parse.add_argument("--metallic-scale", type=float, default=1.0,
                   help="Scale the baked metallic channel; satin previews use < 1")
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
texture_dir = out_dir / "textures"
texture_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "equipment_case_atlas_source_001.blend"
glb_path = out_dir / "equipment_case_atlas_001.glb"
report_path = out_dir / "bake-report.json"
for path in (source_path, glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

scene = bpy.context.scene
source_objects = [bpy.data.objects[name] for name in
                  ("Equipment_Case", "Equipment_Handle", "Equipment_Feet")]
source_materials = [bpy.data.materials[name] for name in
                    ("Case_Shell_Teal", "Case_Frame_Silver", "Case_Dark_Rubber")]


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_stats(image):
    import numpy as np
    pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    values = pixels.reshape(-1, 4)
    return {
        "mean": [float(value) for value in values[:, :3].mean(axis=0)],
        "min": [float(value) for value in values[:, :3].min(axis=0)],
        "max": [float(value) for value in values[:, :3].max(axis=0)],
        "nonzero_fraction": float((values[:, :3].max(axis=1) > 0.001).mean()),
    }


def save_image(image, path):
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return {
        "path": str(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
        "size": [image.size[0], image.size[1]],
        "stats": image_stats(image),
    }


def target_node(material):
    nodes = material.node_tree.nodes
    node = nodes.new("ShaderNodeTexImage")
    node.select = True
    nodes.active = node
    return node


def uvmap_node(material, name="SourceUV"):
    nodes = material.node_tree.nodes
    node = nodes.new("ShaderNodeUVMap")
    node.uv_map = name
    return node


def emission_material(name, channel, source_material):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    links.new(emission.outputs["Emission"], output.inputs["Surface"])

    source_bsdf = next(
        (node for node in source_material.node_tree.nodes
         if node.type == "BSDF_PRINCIPLED"), None)
    source_image = next(
        (node for node in source_material.node_tree.nodes
         if node.type == "TEX_IMAGE" and node.name.lower() == channel.lower()), None)
    if source_image is not None:
        copy = nodes.new("ShaderNodeTexImage")
        copy.image = source_image.image
        uv = uvmap_node(material)
        links.new(uv.outputs["UV"], copy.inputs["Vector"])
        links.new(copy.outputs["Color"], emission.inputs["Color"])
    elif source_bsdf is not None:
        socket_name = {
            "basecolor": "Base Color",
            "roughness": "Roughness",
            "metallic": "Metallic",
        }[channel]
        value = source_bsdf.inputs[socket_name].default_value
        if isinstance(value, float):
            emission.inputs["Color"].default_value = (value, value, value, 1.0)
        else:
            emission.inputs["Color"].default_value = tuple(value)
    else:
        raise RuntimeError(f"No source for {channel} in {source_material.name}")
    return material


# Duplicate and flatten the three parts into one export-only object.
bpy.ops.object.select_all(action="DESELECT")
duplicates = []
for source in source_objects:
    duplicate = source.copy()
    duplicate.data = source.data.copy()
    duplicate.name = "Atlas_" + source.name
    duplicate.data.name = "Atlas_" + source.data.name
    scene.collection.objects.link(duplicate)
    duplicate.matrix_world = source.matrix_world
    duplicate.select_set(True)
    duplicates.append(duplicate)
    for layer in duplicate.data.uv_layers:
        layer.name = "SourceUV"
bpy.context.view_layer.objects.active = duplicates[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.ops.object.join()
atlas = bpy.context.object
atlas.name = "Equipment_Atlas"
atlas.data.name = "Equipment_Atlas_Mesh"

source_uv = atlas.data.uv_layers.get("SourceUV")
if source_uv is None:
    raise RuntimeError("Join lost the source UV layer")
atlas_uv = atlas.data.uv_layers.new(name="AtlasUV")
atlas.data.uv_layers.active = atlas_uv
atlas.data.uv_layers[atlas_uv.name].active_render = True
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02,
                         area_weight=0.0, correct_aspect=True,
                         scale_to_bounds=False)
bpy.ops.object.mode_set(mode="OBJECT")

# glTF derives per-triangle tangents for the baked normal map. Triangulate before
# baking so the tangent space used by the bake matches the exported mesh.
bpy.ops.object.select_all(action="DESELECT")
atlas.select_set(True)
bpy.context.view_layer.objects.active = atlas
triangulate = atlas.modifiers.new("Atlas_Triangulate", "TRIANGULATE")
triangulate.quad_method = "BEAUTY"
triangulate.ngon_method = "BEAUTY"
bpy.ops.object.modifier_apply(modifier=triangulate.name)

# Make the source materials sample the source UVs explicitly.
for material in source_materials:
    if not material.use_nodes:
        continue
    uv = uvmap_node(material)
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE":
            material.node_tree.links.new(uv.outputs["UV"], node.inputs["Vector"])

resolution = args.resolution
channels = {
    "basecolor": ("sRGB", "EMIT"),
    "roughness": ("Non-Color", "EMIT"),
    "metallic": ("Non-Color", "EMIT"),
    "normal": ("Non-Color", "NORMAL"),
}
images = {}
for channel, (colorspace, _) in channels.items():
    image = bpy.data.images.new(
        "Case_Atlas_" + channel, width=resolution, height=resolution,
        alpha=False, float_buffer=False)
    image.colorspace_settings.name = colorspace
    images[channel] = image

original_materials = [slot.material for slot in atlas.material_slots]
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.device = "CPU"
scene.render.bake.margin = args.margin
scene.render.bake.use_clear = True
scene.render.bake.use_selected_to_active = False
scene.render.bake.target = "IMAGE_TEXTURES"

bpy.ops.object.select_all(action="DESELECT")
atlas.select_set(True)
bpy.context.view_layer.objects.active = atlas

bake_report = {}
for channel, (colorspace, bake_type) in channels.items():
    if channel != "normal":
        temporary = []
        for index, material in enumerate(original_materials):
            temp = emission_material(
                f"Bake_{channel}_{index}", channel, material)
            target = target_node(temp)
            target.image = images[channel]
            atlas.material_slots[index].material = temp
            temporary.append((index, temp))
        bpy.ops.object.bake(type="EMIT")
        for index, _ in temporary:
            atlas.material_slots[index].material = original_materials[index]
    else:
        targets = []
        for index, material in enumerate(original_materials):
            target = target_node(material)
            target.image = images[channel]
            targets.append((material, target))
        scene.render.bake.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
        for material, target in targets:
            material.node_tree.nodes.remove(target)

    image = images[channel]
    if channel == "metallic" and args.metallic_scale != 1.0:
        import numpy as np
        pixels = np.empty(image.size[0] * image.size[1] * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape(-1, 4)
        pixels[:, :3] = np.clip(pixels[:, :3] * args.metallic_scale, 0.0, 1.0)
        image.pixels.foreach_set(pixels.ravel())
        image.update()
    bake_report[channel] = save_image(
        image, texture_dir / f"case_atlas_{channel}_{resolution}.png")

# Final single material using the atlas.
atlas_material = bpy.data.materials.new("Case_Atlas_Baked")
atlas_material.use_nodes = True
nodes = atlas_material.node_tree.nodes
links = atlas_material.node_tree.links
nodes.clear()
output = nodes.new("ShaderNodeOutputMaterial")
bsdf = nodes.new("ShaderNodeBsdfPrincipled")
links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
baked_uv = uvmap_node(atlas_material, "AtlasUV")
for channel, socket in (
    ("basecolor", "Base Color"),
    ("roughness", "Roughness"),
    ("metallic", "Metallic"),
):
    node = nodes.new("ShaderNodeTexImage")
    node.image = images[channel]
    node.name = channel
    links.new(baked_uv.outputs["UV"], node.inputs["Vector"])
    links.new(node.outputs["Color"], bsdf.inputs[socket])
normal_node = nodes.new("ShaderNodeTexImage")
normal_node.image = images["normal"]
normal_node.name = "normal"
links.new(baked_uv.outputs["UV"], normal_node.inputs["Vector"])
normal_map = nodes.new("ShaderNodeNormalMap")
links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

atlas.data.materials.clear()
atlas.data.materials.append(atlas_material)
for polygon in atlas.data.polygons:
    polygon.material_index = 0
for layer in list(atlas.data.uv_layers):
    if layer.name != "AtlasUV":
        atlas.data.uv_layers.remove(layer)
atlas.data.uv_layers.active = atlas.data.uv_layers.get("AtlasUV")
atlas.data.uv_layers.active.active_render = True
for source in source_objects:
    source.hide_viewport = True
    source.hide_render = True

bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
bpy.ops.object.select_all(action="DESELECT")
atlas.select_set(True)
bpy.context.view_layer.objects.active = atlas
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

atlas.data.calc_loop_triangles()
report = {
    "source": bpy.data.filepath,
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "glb_bytes": glb_path.stat().st_size,
    "resolution": resolution,
    "margin_px": args.margin,
    "metallic_scale": args.metallic_scale,
    "objects": 1,
    "triangles": len(atlas.data.loop_triangles),
    "vertices": len(atlas.data.vertices),
    "uv_layers": [layer.name for layer in atlas.data.uv_layers],
    "material": atlas_material.name,
    "baked_channels": bake_report,
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_EQUIPMENT_ATLAS", json.dumps({
    "glb": str(glb_path),
    "bytes": report["glb_bytes"],
    "sha256": report["glb_sha256"],
    "triangles": report["triangles"],
    "channels": list(bake_report),
}))
