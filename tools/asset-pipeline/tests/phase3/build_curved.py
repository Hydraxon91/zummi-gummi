"""Build the Phase 3 curved-surface bake fixture.

A 1 m diameter x 1 m cylinder with a packed UV seam is baked from a beveled high
copy to 1024 and 2048 albedo/roughness/normal sets. The low object is triangulated
before baking and export so both use the same topology. The editable n-gon source
and the high object remain in the checkpoint for inspection.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

TOOL = "asset-pipeline-phase3-curved"
PACK_MARGIN = 0.03


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--resolutions", default="1024,2048")
    return parser.parse_args(argv)


def make_cylinder(name):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64, radius=0.5, depth=1.0, end_fill_type="NGON",
        location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name + "_Mesh"
    return ob


def shade_smooth_by_angle(ob, angle_degrees=35.0):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.shade_smooth_by_angle(
        angle=math.radians(angle_degrees), keep_sharp_edges=True)


def pack_uvs(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(
        rotate=True, margin=PACK_MARGIN, margin_method="ADD",
        shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def make_source_images(size):
    y, x = np.mgrid[0:size, 0:size]
    u = x / max(1, size - 1)
    v = y / max(1, size - 1)
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    # Horizontal bands plus one vertical marker and one corner block.
    band = np.floor(v * 6).astype(np.int32) % 3
    colours = np.array([
        [0.06, 0.58, 0.86],
        [0.98, 0.42, 0.18],
        [0.95, 0.88, 0.22],
    ], dtype=np.float32)
    albedo[..., :3] = colours[band]
    stripe = (u > 0.12) & (u < 0.18)
    albedo[stripe, :3] = [0.95, 0.05, 0.22]
    marker = (u > 0.58) & (u < 0.68) & (v > 0.58) & (v < 0.68)
    albedo[marker, :3] = [0.05, 0.92, 0.35]
    albedo[..., 3] = 1.0
    roughness = np.zeros((size, size, 4), dtype=np.float32)
    cells = (np.floor(u * 4).astype(np.int32)
             + np.floor(v * 4).astype(np.int32)) % 4
    values = np.array([0.10, 0.35, 0.65, 0.92], dtype=np.float32)
    roughness[..., 0] = values[cells]
    roughness[..., 1] = roughness[..., 0]
    roughness[..., 2] = roughness[..., 0]
    roughness[..., 3] = 1.0
    return albedo, roughness


def image_from_pixels(name, size, pixels, color_space):
    image = bpy.data.images.get(name)
    if image is not None and tuple(image.size) != (size, size):
        bpy.data.images.remove(image)
        image = None
    if image is None:
        image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = color_space
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    return image


def make_source_material(albedo, roughness):
    material = bpy.data.materials.new("Curved_Source_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    albedo_node = tree.nodes.new("ShaderNodeTexImage")
    albedo_node.name = "Source_Albedo"
    albedo_node.image = albedo
    roughness_node = tree.nodes.new("ShaderNodeTexImage")
    roughness_node.name = "Source_Roughness"
    roughness_node.image = roughness
    tree.links.new(albedo_node.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(roughness_node.outputs["Color"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def make_target_image(name, resolution, color_space):
    image = bpy.data.images.get(name)
    if image is not None and tuple(image.size) != (resolution, resolution):
        bpy.data.images.remove(image)
        image = None
    if image is None:
        image = bpy.data.images.new(
            name, width=resolution, height=resolution, alpha=False)
    image.colorspace_settings.name = color_space
    return image


def save_image(image, folder):
    path = folder / (image.name + ".png")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return path


def bake_map(low, high, material, image, bake_type, folder, normal=False):
    nodes = material.node_tree.nodes
    target = nodes.get("Bake_Target")
    if target is None:
        target = nodes.new("ShaderNodeTexImage")
        target.name = "Bake_Target"
    target.image = image
    target.select = True
    nodes.active = target
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = True
    scene.render.bake.margin = max(8, round(32 * image.size[0] / 2048))
    scene.render.bake.use_selected_to_active = bool(normal)
    if normal:
        high.select_set(True)
        scene.render.bake.normal_space = "TANGENT"
        scene.render.bake.cage_extrusion = 0.08
        scene.render.bake.max_ray_distance = 0.2
    else:
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)
    scene.render.bake.use_selected_to_active = False
    return save_image(image, folder)


def make_export_material(albedo, roughness, normal, mode="full"):
    material = bpy.data.materials.new("Curved_Export_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")

    def texture(image, label):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = label + "_Image"
        node.image = image
        return node

    if mode in {"full", "albedo"}:
        tree.links.new(texture(albedo, "Albedo").outputs["Color"],
                       bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (0.72, 0.72, 0.72, 1.0)
    if mode == "full":
        tree.links.new(texture(roughness, "Roughness").outputs["Color"],
                       bsdf.inputs["Roughness"])
        normal_map = tree.nodes.new("ShaderNodeNormalMap")
        tree.links.new(
            texture(normal, "Normal").outputs["Color"],
            normal_map.inputs["Color"])
        tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    else:
        bsdf.inputs["Roughness"].default_value = 0.45
        if mode == "normal":
            normal_map = tree.nodes.new("ShaderNodeNormalMap")
            tree.links.new(
                texture(normal, "Normal").outputs["Color"],
                normal_map.inputs["Color"])
            tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def export_low(low, material, path):
    low.data.materials.clear()
    low.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_tangents=True,
        export_yup=True,
    )


def image_array(image, size):
    values = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(size, size, 4)


def sample_image(array, uv, size):
    x = min(size - 1, max(0, int(round(uv[0] * (size - 1)))))
    y = min(size - 1, max(0, int(round(uv[1] * (size - 1)))))
    return array[y, x]


def bake_checks(low, size, source_albedo, source_roughness, baked_albedo,
                baked_roughness, baked_normal, paths):
    source_a = image_array(source_albedo, size)
    source_r = image_array(source_roughness, size)
    baked_a = image_array(baked_albedo, size)
    baked_r = image_array(baked_roughness, size)
    normal = image_array(baked_normal, size)
    uvs = [tuple(loop.uv) for loop in low.data.uv_layers.active.data]
    albedo_errors = []
    roughness_errors = []
    for uv in uvs:
        albedo_errors.append(np.abs(
            sample_image(source_a, uv, size)[:3]
            - sample_image(baked_a, uv, size)[:3]).mean())
        roughness_errors.append(abs(
            float(sample_image(source_r, uv, size)[0])
            - float(sample_image(baked_r, uv, size)[0])))
    border = min(
        min(uv[0], 1.0 - uv[0], uv[1], 1.0 - uv[1])
        for uv in uvs)
    normal_rg = normal[..., :2]
    return {
        "resolution": size,
        "albedo_mae": float(np.mean(albedo_errors)),
        "roughness_mae": float(np.mean(roughness_errors)),
        "normal_rg_std": float(np.std(normal_rg)),
        "normal_b_mean": float(normal[..., 2].mean()),
        "normal_b_min": float(normal[..., 2].min()),
        "min_uv_border_margin": float(border),
        "pack_margin": PACK_MARGIN,
        "bake_margin_px": max(8, round(32 * size / 2048)),
        "colorspaces": {
            "albedo": baked_albedo.colorspace_settings.name,
            "roughness": baked_roughness.colorspace_settings.name,
            "normal": baked_normal.colorspace_settings.name,
        },
        "paths": {key: str(value) for key, value in paths.items()},
        "hashes": {
            key: hashlib.sha256(Path(value).read_bytes()).hexdigest()
            for key, value in paths.items()
        },
    }


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = out_dir / "textures"
    texture_dir.mkdir(exist_ok=True)
    checkpoint = out_dir / "curved_001.blend"
    if checkpoint.exists():
        raise FileExistsError("Refusing to overwrite an existing Phase 3 curved checkpoint")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    source_low = make_cylinder("Curved_Low_Source")
    pack_uvs(source_low)
    low = source_low.copy()
    low.data = source_low.data.copy()
    low.name = "Curved_Low"
    low.data.name = "Curved_Low_Mesh"
    bpy.context.collection.objects.link(low)
    bpy.context.view_layer.objects.active = low
    low.select_set(True)
    triangulate = low.modifiers.new("Export_Triangulate", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    shade_smooth_by_angle(low)
    source_low.hide_render = True
    high = low.copy()
    high.data = low.data.copy()
    high.name = "Curved_High"
    high.data.name = "Curved_High_Mesh"
    bpy.context.collection.objects.link(high)
    bpy.context.view_layer.objects.active = high
    high.select_set(True)
    bevel = high.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    shade_smooth_by_angle(high)
    high.hide_render = False
    source_low.hide_render = True
    source_low.hide_set(True)
    resolutions = [int(value) for value in args.resolutions.split(",") if value]
    outputs = []
    all_checks = []
    for resolution in resolutions:
        source_albedo_pixels, source_roughness_pixels = make_source_images(resolution)
        source_albedo = image_from_pixels(
            "Source_Albedo_%s" % resolution, resolution,
            source_albedo_pixels, "sRGB")
        source_roughness = image_from_pixels(
            "Source_Roughness_%s" % resolution, resolution,
            source_roughness_pixels, "Non-Color")
        source_material = make_source_material(source_albedo, source_roughness)
        low.data.materials.clear()
        low.data.materials.append(source_material)
        albedo = make_target_image(
            "Curved_Albedo_%s" % resolution, resolution, "sRGB")
        roughness = make_target_image(
            "Curved_Roughness_%s" % resolution, resolution, "Non-Color")
        normal = make_target_image(
            "Curved_Normal_%s" % resolution, resolution, "Non-Color")
        albedo_path = bake_map(
            low, high, source_material, albedo, "DIFFUSE", texture_dir)
        roughness_path = bake_map(
            low, high, source_material, roughness, "ROUGHNESS", texture_dir)
        normal_path = bake_map(
            low, high, source_material, normal, "NORMAL", texture_dir, normal=True)
        full = make_export_material(albedo, roughness, normal, "full")
        glb = out_dir / ("curved_%s.glb" % resolution)
        export_low(low, full, glb)
        outputs.append({
            "resolution": resolution,
            "glb": str(glb),
            "material": full.name,
        })
        all_checks.append(bake_checks(
            low, resolution, source_albedo, source_roughness,
            albedo, roughness, normal, {
                "albedo": albedo_path,
                "roughness": roughness_path,
                "normal": normal_path,
            }))
        if resolution == resolutions[0]:
            albedo_only = make_export_material(albedo, roughness, normal, "albedo")
            normal_only = make_export_material(albedo, roughness, normal, "normal")
            export_low(low, albedo_only, out_dir / ("curved_%s_albedo.glb" % resolution))
            export_low(low, normal_only, out_dir / ("curved_%s_normal.glb" % resolution))
    high.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
    low.data.calc_loop_triangles()
    high.data.calc_loop_triangles()
    (out_dir / "bake_checks.json").write_text(
        json.dumps(all_checks, indent=2), encoding="utf-8")
    print("PHASE3_CURVED", json.dumps({
        "tool": TOOL,
        "checkpoint": str(checkpoint),
        "low": low.name,
        "source_low": source_low.name,
        "high": high.name,
        "dimensions": [round(float(value), 6) for value in low.dimensions],
        "uv_map": low.data.uv_layers.active.name if low.data.uv_layers.active else None,
        "vertices": len(low.data.vertices),
        "triangles": len(low.data.loop_triangles),
        "high_triangles": len(high.data.loop_triangles),
        "bake_checks": all_checks,
        "outputs": outputs,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
