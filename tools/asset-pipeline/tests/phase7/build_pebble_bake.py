"""Build and bake the Phase 7C curved/organic pebble benchmark."""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--resolution", type=int, default=1024)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
texture_dir = out_dir / "textures"
texture_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "pebble_source_001.blend"
glb_path = out_dir / "pebble_001.glb"
if source_path.exists() or glb_path.exists():
    raise FileExistsError("Refusing to overwrite existing pebble output")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_from_pixels(name, size, pixels, colorspace):
    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(np.ascontiguousarray(pixels, dtype=np.float32).ravel())
    image.pack()
    return image


def make_source_images(size):
    y, x = np.mgrid[0:size, 0:size]
    u = x / max(1, size - 1)
    v = y / max(1, size - 1)
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    albedo[..., :3] = [0.06, 0.62, 0.58]
    # Asymmetric coral band and lime spot make orientation and seam errors visible.
    band = (u > 0.18) & (u < 0.29)
    albedo[band, :3] = [0.92, 0.28, 0.18]
    spot = ((u - 0.68) ** 2 / 0.012 + (v - 0.38) ** 2 / 0.01) < 1.0
    albedo[spot, :3] = [0.55, 0.92, 0.20]
    dark = ((u - 0.38) ** 2 / 0.02 + (v - 0.76) ** 2 / 0.02) < 1.0
    albedo[dark, :3] = [0.025, 0.16, 0.18]
    albedo[..., 3] = 1.0

    roughness = np.zeros((size, size, 4), dtype=np.float32)
    cells = ((u * 7).astype(np.int32) + (v * 7).astype(np.int32)) % 4
    values = np.array([0.12, 0.34, 0.62, 0.88], dtype=np.float32)
    roughness[..., 0] = values[cells]
    roughness[..., 1] = roughness[..., 0]
    roughness[..., 2] = roughness[..., 0]
    roughness[..., 3] = 1.0

    metallic = np.zeros((size, size, 4), dtype=np.float32)
    metallic[..., 0] = np.where(v < 0.5, 0.15, 0.82)
    metallic[(u > 0.42) & (u < 0.58) & (v > 0.22) & (v < 0.78), 0] = 0.35
    metallic[..., 1] = metallic[..., 0]
    metallic[..., 2] = metallic[..., 0]
    metallic[..., 3] = 1.0
    return albedo, roughness, metallic


def make_source_material(albedo, roughness, metallic):
    material = bpy.data.materials.new("Pebble_Source_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    for label, image, colorspace in (
        ("Source_Albedo", albedo, "sRGB"),
        ("Source_Roughness", roughness, "Non-Color"),
        ("Source_Metallic", metallic, "Non-Color"),
    ):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = label
        node.image = image
        node.image.colorspace_settings.name = colorspace
    tree.links.new(tree.nodes["Source_Albedo"].outputs["Color"],
                   bsdf.inputs["Base Color"])
    tree.links.new(tree.nodes["Source_Roughness"].outputs["Color"],
                   bsdf.inputs["Roughness"])
    tree.links.new(tree.nodes["Source_Metallic"].outputs["Color"],
                   bsdf.inputs["Metallic"])
    return material


def make_pebble():
    # Pole-free quad sphere: subdivide a cube, soften it, then project to an
    # ellipsoid. This avoids the UV-sphere pole singularity while keeping a
    # curved/organic silhouette and a real UV seam set.
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, 0.0))
    pebble = bpy.context.object
    pebble.name = "Pebble_Low"
    pebble.data.name = "Pebble_Low_Mesh"
    subdivision = pebble.modifiers.new("Quad_Sphere", "SUBSURF")
    subdivision.levels = 4
    subdivision.render_levels = 4
    bpy.context.view_layer.objects.active = pebble
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for vertex in pebble.data.vertices:
        direction = vertex.co.normalized()
        vertex.co = (direction.x * 0.46, direction.y * 0.32, direction.z * 0.24)
    for vertex in pebble.data.vertices:
        x, y, z = vertex.co
        bump = 0.035 * math.exp(-((x - 0.16) ** 2 + (y - 0.08) ** 2) / 0.02)
        vertex.co.z += bump
        radius2 = (x - 0.10) ** 2 + (y + 0.04) ** 2
        if z > 0.10 and radius2 < 0.0225:
            vertex.co.z -= 0.075 * math.exp(-radius2 / 0.009)
    pebble.data.update()
    bpy.ops.object.select_all(action="DESELECT")
    pebble.select_set(True)
    bpy.context.view_layer.objects.active = pebble
    bpy.ops.object.shade_smooth()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0), island_margin=0.02,
        area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return pebble


def make_target_image(name, size, colorspace):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = colorspace
    return image


def save_image(image, folder):
    path = folder / (image.name + ".png")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return path


def bake_map(low, high, material, image, bake_type, normal=False):
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
        scene.render.bake.cage_extrusion = 0.04
        scene.render.bake.max_ray_distance = 0.12
    else:
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)
    scene.render.bake.use_selected_to_active = False
    return save_image(image, texture_dir)


def pixels(image):
    size = image.size[0]
    values = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(size, size, 4)


def sample(array, uv):
    size = array.shape[0]
    x = min(size - 1, max(0, int(round(uv[0] * (size - 1)))))
    y = min(size - 1, max(0, int(round(uv[1] * (size - 1)))))
    return array[y, x]


def make_emission_material(image, colorspace):
    material = bpy.data.materials.new("Pebble_Emission_Bake_Mat")
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    emission = tree.nodes.new("ShaderNodeEmission")
    texture = tree.nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.image.colorspace_settings.name = colorspace
    tree.links.new(texture.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def make_baked_material(albedo, roughness, metallic, normal):
    material = bpy.data.materials.new("Pebble_Baked_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")

    def texture(image, label):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = label
        node.image = image
        return node

    tree.links.new(texture(albedo, "Baked_Albedo").outputs["Color"],
                   bsdf.inputs["Base Color"])
    tree.links.new(texture(roughness, "Baked_Roughness").outputs["Color"],
                   bsdf.inputs["Roughness"])
    tree.links.new(texture(metallic, "Baked_Metallic").outputs["Color"],
                   bsdf.inputs["Metallic"])
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.4
    tree.links.new(texture(normal, "Baked_Normal").outputs["Color"],
                   normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def channel_check(low, source_albedo, source_roughness, source_metallic,
                  baked_albedo, baked_roughness, baked_metallic, baked_normal):
    source_a = pixels(source_albedo)
    source_r = pixels(source_roughness)
    source_m = pixels(source_metallic)
    baked_a = pixels(baked_albedo)
    baked_r = pixels(baked_roughness)
    baked_m = pixels(baked_metallic)
    normal = pixels(baked_normal)
    uv_layer = low.data.uv_layers.active
    albedo_errors = []
    roughness_errors = []
    metallic_errors = []
    for loop in low.data.loops:
        uv = tuple(uv_layer.data[loop.index].uv)
        albedo_errors.append(np.abs(sample(source_a, uv)[:3]
                                    - sample(baked_a, uv)[:3]).mean())
        roughness_errors.append(abs(float(sample(source_r, uv)[0])
                                    - float(sample(baked_r, uv)[0])))
        metallic_errors.append(abs(float(sample(source_m, uv)[0])
                                   - float(sample(baked_m, uv)[0])))
    normal_vectors = normal[..., :3] * 2.0 - 1.0
    lengths = np.sqrt(np.sum(normal_vectors * normal_vectors, axis=2))
    findings = []
    if np.mean(albedo_errors) > 0.02:
        findings.append("albedo source-to-bake MAE exceeds 0.02")
    if np.mean(roughness_errors) > 0.02:
        findings.append("roughness source-to-bake MAE exceeds 0.02")
    if np.mean(metallic_errors) > 0.02:
        findings.append("metallic source-to-bake MAE exceeds 0.02")
    normal_rg_std = float(np.std(normal[..., :2]))
    if float(normal[..., 2].mean()) <= 0.5:
        findings.append("normal Z is not positive")
    if normal_rg_std < 0.01:
        findings.append("normal map is effectively flat")
    return {
        "albedo_mae": float(np.mean(albedo_errors)),
        "roughness_mae": float(np.mean(roughness_errors)),
        "metallic_mae": float(np.mean(metallic_errors)),
        "normal_b_mean": float(normal[..., 2].mean()),
        "normal_b_min": float(normal[..., 2].min()),
        "normal_rg_std": normal_rg_std,
        "normal_length_mean": float(lengths.mean()),
        "findings": findings,
        "status": "pass" if not findings else "fail",
    }


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
size = args.resolution

albedo_pixels, roughness_pixels, metallic_pixels = make_source_images(size)
source_albedo = image_from_pixels("Source_Albedo", size, albedo_pixels, "sRGB")
source_roughness = image_from_pixels("Source_Roughness", size, roughness_pixels,
                                     "Non-Color")
source_metallic = image_from_pixels("Source_Metallic", size, metallic_pixels,
                                    "Non-Color")
source_material = make_source_material(source_albedo, source_roughness, source_metallic)
low = make_pebble()
low.data.materials.append(source_material)

high = low.copy()
high.data = low.data.copy()
high.name = "Pebble_High"
high.data.name = "Pebble_High_Mesh"
bpy.context.scene.collection.objects.link(high)
subdivision = high.modifiers.new("Subdivision_High", "SUBSURF")
subdivision.levels = 2
subdivision.render_levels = 2
bpy.context.view_layer.objects.active = high
bpy.ops.object.modifier_apply(modifier=subdivision.name)
high.scale = (1.01, 1.01, 1.01)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
detail_texture = bpy.data.textures.new("Pebble_High_Detail", "CLOUDS")
detail_texture.noise_scale = 0.075
detail_texture.noise_depth = 2
detail_texture.contrast = 1.4
detail = high.modifiers.new("Pebble_Detail", "DISPLACE")
detail.texture = detail_texture
detail.texture_coords = "LOCAL"
detail.strength = 0.008
detail.mid_level = 0.5
bpy.context.view_layer.objects.active = high
bpy.ops.object.modifier_apply(modifier=detail.name)
bpy.ops.object.shade_smooth()

baked_albedo = make_target_image("Pebble_Albedo_1024", size, "sRGB")
baked_roughness = make_target_image("Pebble_Roughness_1024", size, "Non-Color")
baked_metallic = make_target_image("Pebble_Metallic_1024", size, "Non-Color")
baked_normal = make_target_image("Pebble_Normal_1024", size, "Non-Color")
paths = {}
# Albedo uses an emission pass, not DIFFUSE, so the bake stays in the source
# image's colour space instead of picking up a second display transform.
albedo_material = make_emission_material(source_albedo, "sRGB")
low.data.materials.clear()
low.data.materials.append(albedo_material)
paths["albedo"] = bake_map(low, high, albedo_material, baked_albedo, "EMIT")
low.data.materials.clear()
low.data.materials.append(source_material)
paths["roughness"] = bake_map(low, high, source_material, baked_roughness, "ROUGHNESS")
paths["normal"] = bake_map(low, high, source_material, baked_normal, "NORMAL",
                           normal=True)

emission_material = make_emission_material(source_metallic, "Non-Color")
low.data.materials.clear()
low.data.materials.append(emission_material)
paths["metallic"] = bake_map(low, high, emission_material, baked_metallic, "EMIT")
low.data.materials.clear()
low.data.materials.append(source_material)

high.hide_render = True
high.hide_set(True)
baked_material = make_baked_material(baked_albedo, baked_roughness,
                                    baked_metallic, baked_normal)
low.data.materials.clear()
low.data.materials.append(baked_material)
low.data.calc_loop_triangles()
high.data.calc_loop_triangles()

checks = channel_check(low, source_albedo, source_roughness, source_metallic,
                       baked_albedo, baked_roughness, baked_metallic, baked_normal)
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
)
report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "resolution": size,
    "low": {
        "vertices": len(low.data.vertices),
        "polygons": len(low.data.polygons),
        "triangles": len(low.data.loop_triangles),
        "dimensions": [round(float(value), 6) for value in low.dimensions],
        "uv_maps": [layer.name for layer in low.data.uv_layers],
    },
    "high": {
        "vertices": len(high.data.vertices),
        "polygons": len(high.data.polygons),
        "triangles": len(high.data.loop_triangles),
    },
    "bake": checks,
    "textures": {
        key: {"path": str(path), "sha256": sha256_file(path)}
        for key, path in paths.items()
    },
    "bake_settings": {
        "engine": "CYCLES",
        "samples": 24,
        "margin_px": max(8, round(32 * size / 2048)),
        "normal_selected_to_active": True,
        "normal_space": "TANGENT",
        "cage_extrusion": 0.04,
        "max_ray_distance": 0.12,
    },
}
(out_dir / "build.json").write_text(json.dumps(report, indent=2))
print("PHASE7_PEBBLE", json.dumps(report, sort_keys=True))
raise SystemExit(0 if checks["status"] == "pass" else 1)
