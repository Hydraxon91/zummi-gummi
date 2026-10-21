"""Build and bake the Phase 7C procedural-source pebble benchmark.

The source material is defined in object-local metres with analytic shader
groups. The low mesh gets one non-overlapping Smart-UV atlas, is triangulated
before baking, and is baked from the analytic fields plus a high-detail
displacement copy. The editable source and high object remain in the saved
checkpoint.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import pebble_fields as fields

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--resolution", type=int, default=1024)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
texture_dir = out_dir / "textures"
texture_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "pebble_procedural_source_001.blend"
glb_path = out_dir / "pebble_procedural_001.glb"
neutral_path = out_dir / "pebble_neutral_001.glb"
for path in (source_path, glb_path, neutral_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

size = args.resolution


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def math_node(nodes, operation, a=None, b=None):
    node = nodes.new("ShaderNodeMath")
    node.operation = operation
    if a is not None:
        if isinstance(a, (int, float)):
            node.inputs[0].default_value = a
        else:
            node.id_data.links.new(a, node.inputs[0])
    if b is not None:
        if isinstance(b, (int, float)):
            node.inputs[1].default_value = b
        else:
            node.id_data.links.new(b, node.inputs[1])
    return node.outputs[0]


def smooth_map(nodes, links, value, from_min, from_max, to_min, to_max):
    node = nodes.new("ShaderNodeMapRange")
    node.interpolation_type = "SMOOTHSTEP"
    node.clamp = True
    links.new(value, node.inputs[0])
    node.inputs[1].default_value = from_min
    node.inputs[2].default_value = from_max
    node.inputs[3].default_value = to_min
    node.inputs[4].default_value = to_max
    return node.outputs[0]


def mix_colour(nodes, links, factor, colour1, colour2):
    node = nodes.new("ShaderNodeMixRGB")
    node.blend_type = "MIX"
    links.new(factor, node.inputs[0])
    if isinstance(colour1, tuple):
        node.inputs[1].default_value = (*colour1, 1.0)
    else:
        links.new(colour1, node.inputs[1])
    if isinstance(colour2, tuple):
        node.inputs[2].default_value = (*colour2, 1.0)
    else:
        links.new(colour2, node.inputs[2])
    return node.outputs[0]


def new_field_group(name, output_name, output_type):
    group = bpy.data.node_groups.new(name, "ShaderNodeTree")
    group.interface.new_socket("Vector", in_out="INPUT", socket_type="NodeSocketVector")
    group.interface.new_socket(output_name, in_out="OUTPUT", socket_type=output_type)
    nodes = group.nodes
    links = group.links
    group_input = nodes.new("NodeGroupInput")
    group_output = nodes.new("NodeGroupOutput")
    vector = group_input.outputs["Vector"]
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(vector, separate.inputs[0])
    return (group, nodes, links, separate.outputs["X"], separate.outputs["Y"],
            separate.outputs["Z"], group_output)


def make_base_colour_group():
    group, nodes, links, x, y, z, output = new_field_group(
        "Pebble_BaseColour_Field", "Colour", "NodeSocketColor")
    band_plane = math_node(
        nodes, "ADD", x,
        math_node(nodes, "MULTIPLY", y, 0.35))
    band_plane = math_node(nodes, "SUBTRACT", band_plane, fields.BAND_OFFSET)
    band = smooth_map(
        nodes, links, math_node(nodes, "ABSOLUTE", band_plane),
        fields.BAND_EDGE_0, fields.BAND_EDGE_1, 1.0, 0.0)
    colour = mix_colour(nodes, links, band, fields.TEAL, fields.CORAL)

    lime_dx = math_node(nodes, "SUBTRACT", x, fields.LIME_CENTER[0])
    lime_dy = math_node(nodes, "SUBTRACT", y, fields.LIME_CENTER[1])
    lime_dz = math_node(nodes, "SUBTRACT", z, fields.LIME_CENTER[2])
    lime_distance = math_node(
        nodes, "SQRT",
        math_node(
            nodes, "ADD",
            math_node(
                nodes, "ADD",
                math_node(nodes, "MULTIPLY", lime_dx, lime_dx),
                math_node(nodes, "MULTIPLY", lime_dy, lime_dy)),
            math_node(nodes, "MULTIPLY", lime_dz, lime_dz)))
    lime = smooth_map(
        nodes, links, lime_distance,
        fields.LIME_EDGE_0, fields.LIME_EDGE_1, 1.0, 0.0)
    colour = mix_colour(nodes, links, lime, colour, fields.LIME)

    dark_dx = math_node(nodes, "SUBTRACT", x, fields.DARK_CENTER[0])
    dark_dy = math_node(nodes, "SUBTRACT", y, fields.DARK_CENTER[1])
    dark_dz = math_node(nodes, "SUBTRACT", z, fields.DARK_CENTER[2])
    dark_distance = math_node(
        nodes, "SQRT",
        math_node(
            nodes, "ADD",
            math_node(
                nodes, "ADD",
                math_node(nodes, "MULTIPLY", dark_dx, dark_dx),
                math_node(nodes, "MULTIPLY", dark_dy, dark_dy)),
            math_node(nodes, "MULTIPLY", dark_dz, dark_dz)))
    dark = smooth_map(
        nodes, links, dark_distance,
        fields.DARK_EDGE_0, fields.DARK_EDGE_1, 1.0, 0.0)
    colour = mix_colour(nodes, links, dark, colour, fields.DARK)
    links.new(colour, output.inputs["Colour"])
    return group


def make_roughness_group():
    group, nodes, links, x, y, z, output = new_field_group(
        "Pebble_Roughness_Field", "Value", "NodeSocketFloat")
    angle_a = math_node(
        nodes, "ADD",
        math_node(nodes, "MULTIPLY", x, 6.0),
        math_node(nodes, "MULTIPLY", y, 3.0))
    angle_b = math_node(
        nodes, "SUBTRACT",
        math_node(nodes, "MULTIPLY", y, 5.0),
        math_node(nodes, "MULTIPLY", z, 4.0))
    wave_a = math_node(nodes, "MULTIPLY",
                       math_node(nodes, "SINE", angle_a), fields.ROUGH_SIN_A)
    wave_b = math_node(nodes, "MULTIPLY",
                       math_node(nodes, "SINE", angle_b), fields.ROUGH_SIN_B)
    value = math_node(nodes, "ADD", fields.ROUGH_BASE, wave_a)
    value = math_node(nodes, "ADD", value, wave_b)
    value = math_node(nodes, "MAXIMUM", value, fields.ROUGH_MIN)
    value = math_node(nodes, "MINIMUM", value, fields.ROUGH_MAX)
    links.new(value, output.inputs["Value"])
    return group


def make_metallic_group():
    group, nodes, links, x, y, z, output = new_field_group(
        "Pebble_Metallic_Field", "Value", "NodeSocketFloat")
    metal_plane = math_node(
        nodes, "ADD", x,
        math_node(nodes, "MULTIPLY", y, 0.35))
    metal_plane = math_node(nodes, "SUBTRACT", metal_plane, fields.BAND_OFFSET)
    region = smooth_map(
        nodes, links, metal_plane,
        fields.METAL_EDGE_0, fields.METAL_EDGE_1, 0.0, 1.0)
    scaled = math_node(nodes, "MULTIPLY", region, fields.METAL_AMPLITUDE)
    value = math_node(nodes, "ADD", scaled, fields.METAL_BASE)
    value = math_node(nodes, "MAXIMUM", value, 0.0)
    value = math_node(nodes, "MINIMUM", value, 1.0)
    links.new(value, output.inputs["Value"])
    return group


def make_source_material(groups):
    material = bpy.data.materials.new("Pebble_Source_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    nodes = tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    coordinates = nodes.new("ShaderNodeTexCoord")
    for group, socket, target in (
        (groups["base"], "Colour", "Base Color"),
        (groups["rough"], "Value", "Roughness"),
        (groups["metal"], "Value", "Metallic"),
    ):
        group_node = nodes.new("ShaderNodeGroup")
        group_node.node_tree = group
        tree.links.new(coordinates.outputs["Object"], group_node.inputs["Vector"])
        tree.links.new(group_node.outputs[socket], bsdf.inputs[target])
    return material


def make_emission_material(group, kind, name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    emission = tree.nodes.new("ShaderNodeEmission")
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    group_node = tree.nodes.new("ShaderNodeGroup")
    group_node.node_tree = group
    tree.links.new(coordinates.outputs["Object"], group_node.inputs["Vector"])
    if kind == "colour":
        tree.links.new(group_node.outputs["Colour"], emission.inputs["Color"])
    else:
        combine = tree.nodes.new("ShaderNodeCombineColor")
        value = group_node.outputs["Value"]
        tree.links.new(value, combine.inputs["Red"])
        tree.links.new(value, combine.inputs["Green"])
        tree.links.new(value, combine.inputs["Blue"])
        tree.links.new(combine.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def make_neutral_material():
    material = bpy.data.materials.new("Pebble_Neutral_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    bsdf = next(node for node in material.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.18, 0.18, 0.18, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.6
    bsdf.inputs["Metallic"].default_value = 0.0
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
    normal_map.inputs["Strength"].default_value = 1.0
    tree.links.new(texture(normal, "Baked_Normal").outputs["Color"],
                   normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_pebble():
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=(0.0, 0.0, 0.0))
    pebble = bpy.context.object
    pebble.name = "Pebble_Low"
    pebble.data.name = "Pebble_Low_Mesh"
    subdivision = pebble.modifiers.new("Quad_Sphere", "SUBSURF")
    subdivision.levels = 5
    subdivision.render_levels = 5
    bpy.context.view_layer.objects.active = pebble
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for vertex in pebble.data.vertices:
        direction = vertex.co.normalized()
        vertex.co = (direction.x * 0.46, direction.y * 0.32, direction.z * 0.24)
    for vertex in pebble.data.vertices:
        x, y, z = vertex.co
        bump = 0.028 * math.exp(-((x - 0.16) ** 2 + (y - 0.08) ** 2) / 0.02)
        vertex.co.z += bump
        radius2 = (x - 0.10) ** 2 + (y + 0.04) ** 2
        if z > 0.10 and radius2 < 0.0225:
            vertex.co.z -= 0.065 * math.exp(-radius2 / 0.009)
    pebble.data.update()
    bpy.ops.object.select_all(action="DESELECT")
    pebble.select_set(True)
    bpy.context.view_layer.objects.active = pebble
    bpy.ops.object.shade_smooth()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0), island_margin=0.03,
        area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    return pebble


def make_high(low):
    high = low.copy()
    high.data = low.data.copy()
    high.name = "Pebble_High"
    high.data.name = "Pebble_High_Mesh"
    bpy.context.scene.collection.objects.link(high)
    subdivision = high.modifiers.new("Subdivision_High", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
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
    detail.strength = 0.006
    detail.mid_level = 0.5
    bpy.context.view_layer.objects.active = high
    bpy.ops.object.modifier_apply(modifier=detail.name)
    bpy.ops.object.shade_smooth()
    return high


def triangulate_low(low):
    modifier = low.modifiers.new("Triangulate_Low", "TRIANGULATE")
    modifier.quad_method = "BEAUTY"
    modifier.ngon_method = "BEAUTY"
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_object(obj, path, material=None):
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
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


def make_target_image(name, colorspace):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    image.colorspace_settings.name = colorspace
    return image


def save_image(image):
    path = texture_dir / (image.name + ".png")
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
    scene.cycles.samples = 32
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 6
    scene.render.bake.use_selected_to_active = bool(normal)
    if normal:
        high.select_set(True)
        scene.render.bake.normal_space = "TANGENT"
        scene.render.bake.cage_extrusion = 0.05
        scene.render.bake.max_ray_distance = 0.15
    bpy.ops.object.bake(type=bake_type)
    scene.render.bake.use_selected_to_active = False
    return save_image(image)


def pixels(image):
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(height, width, 4)


def sample_bilinear(array, uv):
    height, width = array.shape[:2]
    x = min(width - 1.0, max(0.0, float(uv[0]) * (width - 1)))
    y = min(height - 1.0, max(0.0, float(uv[1]) * (height - 1)))
    x0 = int(math.floor(x))
    y0 = int(math.floor(y))
    x1 = min(width - 1, x0 + 1)
    y1 = min(height - 1, y0 + 1)
    fx = x - x0
    fy = y - y0
    top = array[y0, x0] * (1.0 - fx) + array[y0, x1] * fx
    bottom = array[y1, x0] * (1.0 - fx) + array[y1, x1] * fx
    return top * (1.0 - fy) + bottom * fy


def srgb_to_linear(values):
    values = np.asarray(values, dtype=np.float32)
    low = values <= 0.04045
    return np.where(low, values / 12.92,
                    ((values + 0.055) / 1.055) ** 2.4).astype(np.float32)


def triangle_samples(low):
    uv_data = low.data.uv_layers.active.data
    vertices = low.data.vertices
    for triangle in low.data.loop_triangles:
        loops = list(triangle.loops)
        positions = [vertices[low.data.loops[index].vertex_index].co
                     for index in loops]
        uvs = [uv_data[index].uv for index in loops]
        for weights in ((1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0),
                        (0.2, 0.4, 0.4),
                        (0.4, 0.2, 0.4)):
            position = Vector((0.0, 0.0, 0.0))
            uv = Vector((0.0, 0.0))
            for weight, point, texel in zip(weights, positions, uvs):
                position += point * weight
                uv += texel * weight
            yield position, uv, triangle.index


def channel_check(low, baked):
    albedo_errors = []
    roughness_errors = []
    metallic_errors = []
    for position, uv, _ in triangle_samples(low):
        colour, roughness, metallic = fields.sample_fields(position)
        baked_colour = srgb_to_linear(
            sample_bilinear(baked["albedo"], uv)[:3])
        albedo_errors.append(float(np.abs(
            np.array(colour, dtype=np.float32) - baked_colour).mean()))
        roughness_errors.append(abs(
            float(roughness) - float(sample_bilinear(baked["roughness"], uv)[0])))
        metallic_errors.append(abs(
            float(metallic) - float(sample_bilinear(baked["metallic"], uv)[0])))
    normal = baked["normal"]
    vectors = normal[..., :3] * 2.0 - 1.0
    lengths = np.sqrt(np.sum(vectors * vectors, axis=2))
    normal_rg_std = float(np.std(normal[..., :2]))
    report = {
        "samples": len(albedo_errors),
        "albedo": {
            "mean": float(np.mean(albedo_errors)),
            "p95": float(np.percentile(albedo_errors, 95)),
            "max": float(np.max(albedo_errors)),
        },
        "roughness": {
            "mean": float(np.mean(roughness_errors)),
            "p95": float(np.percentile(roughness_errors, 95)),
            "max": float(np.max(roughness_errors)),
        },
        "metallic": {
            "mean": float(np.mean(metallic_errors)),
            "p95": float(np.percentile(metallic_errors, 95)),
            "max": float(np.max(metallic_errors)),
        },
        "normal_b_mean": float(normal[..., 2].mean()),
        "normal_b_min": float(normal[..., 2].min()),
        "normal_rg_std": normal_rg_std,
        "normal_length_mean": float(lengths.mean()),
    }
    findings = []
    if report["albedo"]["mean"] > 0.02 or report["albedo"]["p95"] > 0.04:
        findings.append("albedo source-to-bake error exceeds tolerance")
    if report["roughness"]["mean"] > 0.01 or report["roughness"]["p95"] > 0.02:
        findings.append("roughness source-to-bake error exceeds tolerance")
    if report["metallic"]["mean"] > 0.01 or report["metallic"]["p95"] > 0.02:
        findings.append("metallic source-to-bake error exceeds tolerance")
    if report["normal_b_mean"] <= 0.5:
        findings.append("normal Z is not positive")
    if normal_rg_std < 0.01:
        findings.append("normal map is effectively flat")
    report["findings"] = findings
    report["status"] = "pass" if not findings else "fail"
    return report


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

base_group = make_base_colour_group()
rough_group = make_roughness_group()
metal_group = make_metallic_group()
groups = {"base": base_group, "rough": rough_group, "metal": metal_group}

low = make_pebble()
high = make_high(low)
triangulate_low(low)
low.data.calc_loop_triangles()
high.data.calc_loop_triangles()

neutral_material = make_neutral_material()
neutral = low.copy()
neutral.data = low.data.copy()
neutral.name = "Pebble_Neutral"
bpy.context.scene.collection.objects.link(neutral)
export_object(neutral, neutral_path, neutral_material)
bpy.data.objects.remove(neutral, do_unlink=True)

source_material = make_source_material(groups)
low.data.materials.append(source_material)
high.data.materials.append(source_material)

baked_albedo = make_target_image("Pebble_Procedural_Albedo_1024", "sRGB")
baked_roughness = make_target_image("Pebble_Procedural_Roughness_1024", "Non-Color")
baked_metallic = make_target_image("Pebble_Procedural_Metallic_1024", "Non-Color")
baked_normal = make_target_image("Pebble_Procedural_Normal_1024", "Non-Color")

albedo_material = make_emission_material(
    base_group, "colour", "Pebble_Albedo_Bake_Mat")
low.data.materials.clear()
low.data.materials.append(albedo_material)
paths = {"albedo": bake_map(low, high, albedo_material, baked_albedo, "EMIT")}

rough_material = make_emission_material(
    rough_group, "value", "Pebble_Roughness_Bake_Mat")
low.data.materials.clear()
low.data.materials.append(rough_material)
paths["roughness"] = bake_map(low, high, rough_material, baked_roughness, "EMIT")

metal_material = make_emission_material(
    metal_group, "value", "Pebble_Metallic_Bake_Mat")
low.data.materials.clear()
low.data.materials.append(metal_material)
paths["metallic"] = bake_map(low, high, metal_material, baked_metallic, "EMIT")

low.data.materials.clear()
low.data.materials.append(source_material)
paths["normal"] = bake_map(low, high, source_material, baked_normal, "NORMAL",
                           normal=True)

high.hide_render = True
high.hide_set(True)
baked_material = make_baked_material(
    baked_albedo, baked_roughness, baked_metallic, baked_normal)
low.data.materials.clear()
low.data.materials.append(baked_material)

baked = {
    "albedo": pixels(baked_albedo),
    "roughness": pixels(baked_roughness),
    "metallic": pixels(baked_metallic),
    "normal": pixels(baked_normal),
}
checks = channel_check(low, baked)

low.data.calc_loop_triangles()
high.data.calc_loop_triangles()
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
export_object(low, glb_path)

report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "neutral_glb": str(neutral_path),
    "neutral_glb_sha256": sha256_file(neutral_path),
    "resolution": size,
    "field_version": "phase7c-procedural-1",
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
        "samples": 32,
        "margin_px": 6,
        "normal_selected_to_active": True,
        "normal_space": "TANGENT",
        "cage_extrusion": 0.05,
        "max_ray_distance": 0.15,
        "normal_strength": 1.0,
    },
}
(out_dir / "build.json").write_text(json.dumps(report, indent=2))
print("PHASE7_PROCEDURAL_PEBBLE", json.dumps(report, sort_keys=True))
raise SystemExit(0 if checks["status"] == "pass" else 1)
