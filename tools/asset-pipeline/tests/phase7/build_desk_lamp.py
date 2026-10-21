"""Build the Phase 7D multi-part desk-lamp benchmark.

The lamp keeps its parts separate, shares teal/silver image materials, adds
rubber pads and bakes one analytic reflector to a non-overlapping atlas.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import desk_lamp_fields as fields

parse = argparse.ArgumentParser()
parse.add_argument("--teal-basecolor", required=True)
parse.add_argument("--teal-normal", required=True)
parse.add_argument("--teal-roughness", required=True)
parse.add_argument("--silver-basecolor", required=True)
parse.add_argument("--silver-normal", required=True)
parse.add_argument("--silver-roughness", required=True)
parse.add_argument("--silver-metallic", required=True)
parse.add_argument("--out-dir", required=True)
parse.add_argument("--resolution", type=int, default=1024)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
texture_dir = out_dir / "textures"
texture_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "desk_lamp_source_001.blend"
export_path = out_dir / "desk_lamp_export_001.blend"
glb_path = out_dir / "desk_lamp_001.glb"
for path in (source_path, export_path, glb_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

size = args.resolution


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_image(path, colorspace):
    image = bpy.data.images.load(str(Path(path).resolve()), check_existing=False)
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def make_image_material(name, basecolor, normal, roughness, metallic=None,
                        metallic_default=0.0, double_sided=False):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = not double_sided
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    def texture(image, label):
        node = nodes.new("ShaderNodeTexImage")
        node.name = label
        node.image = image
        return node

    links.new(texture(basecolor, "BaseColor").outputs["Color"],
              bsdf.inputs["Base Color"])
    links.new(texture(roughness, "Roughness").outputs["Color"],
              bsdf.inputs["Roughness"])
    if metallic is not None:
        links.new(texture(metallic, "Metallic").outputs["Color"],
                  bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = metallic_default
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(texture(normal, "Normal").outputs["Color"],
              normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_rubber():
    material = bpy.data.materials.new("Lamp_Rubber")
    material.use_nodes = True
    material.use_backface_culling = True
    bsdf = next(node for node in material.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.012, 0.016, 0.018, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.78
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def uv_smart(obj, margin=0.02):
    active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0), island_margin=margin,
        area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def box(name, dimensions, location, material, bevel=0.0, rotation=(0.0, 0.0, 0.0),
        smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        modifier.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        bpy.ops.object.shade_smooth()
    uv_smart(obj)
    return obj


def cylinder(name, radius, depth, location, material, rotation=(0.0, 0.0, 0.0),
             vertices=48, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=location,
        rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if smooth:
        bpy.ops.object.shade_smooth()
    uv_smart(obj)
    return obj


def make_shade(material):
    rings = [
        (0.000, 0.022),
        (0.015, 0.032),
        (0.035, 0.050),
        (0.065, 0.068),
        (0.090, 0.078),
        (0.100, 0.080),
    ]
    segments = 64
    bm = bmesh.new()
    ring_verts = []
    for y, radius in rings:
        ring = []
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            ring.append(bm.verts.new((radius * math.cos(angle), y,
                                      radius * math.sin(angle))))
        ring_verts.append(ring)
    back_center = bm.verts.new((0.0, 0.0, 0.0))
    for index in range(segments):
        nxt = (index + 1) % segments
        bm.faces.new((back_center, ring_verts[0][nxt], ring_verts[0][index]))
    for ring_index in range(len(rings) - 1):
        lower = ring_verts[ring_index]
        upper = ring_verts[ring_index + 1]
        for index in range(segments):
            nxt = (index + 1) % segments
            bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new("DeskLamp_Shade_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("DeskLamp_Shade", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (0.0, 0.060, 0.455)
    obj.data.materials.append(material)
    solid = obj.modifiers.new("Shade_Thickness", "SOLIDIFY")
    solid.thickness = 0.003
    solid.offset = 1.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    bpy.ops.object.shade_smooth()
    uv_smart(obj, 0.03)
    return obj


def make_reflector():
    radius = fields.RADIUS
    rings = 24
    segments = 64
    bm = bmesh.new()
    center = bm.verts.new((0.0, -0.006, 0.0))
    ring_verts = []
    for ring in range(1, rings + 1):
        ratio = ring / rings
        r = radius * ratio
        y = -0.006 * (1.0 - ratio * ratio)
        verts = []
        for index in range(segments):
            angle = 2.0 * math.pi * index / segments
            verts.append(bm.verts.new((r * math.cos(angle), y,
                                       r * math.sin(angle))))
        ring_verts.append(verts)
    for index in range(segments):
        nxt = (index + 1) % segments
        bm.faces.new((center, ring_verts[0][nxt], ring_verts[0][index]))
    for ring in range(len(ring_verts) - 1):
        lower = ring_verts[ring]
        upper = ring_verts[ring + 1]
        for index in range(segments):
            nxt = (index + 1) % segments
            bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    if sum(face.normal.y for face in bm.faces) < 0.0:
        bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new("DeskLamp_Reflector_Mesh")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("DeskLamp_Reflector", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (0.0, 0.105, 0.455)
    solid = obj.modifiers.new("Reflector_Thickness", "SOLIDIFY")
    solid.thickness = 0.002
    solid.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=solid.name)
    bpy.ops.object.shade_smooth()
    uv_smart(obj, 0.03)
    return obj


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
    separate = nodes.new("ShaderNodeSeparateXYZ")
    links.new(group_input.outputs["Vector"], separate.inputs[0])
    return (group, nodes, links, separate.outputs["X"], separate.outputs["Y"],
            separate.outputs["Z"], group_output)


def reflector_radius(nodes, x, z):
    squared = math_node(
        nodes, "ADD",
        math_node(nodes, "MULTIPLY", x, x),
        math_node(nodes, "MULTIPLY", z, z))
    distance = math_node(nodes, "SQRT", squared)
    value = math_node(nodes, "DIVIDE", distance, fields.RADIUS)
    return math_node(nodes, "MINIMUM", math_node(nodes, "MAXIMUM", value, 0.0), 1.0)


def make_reflector_fields_group():
    group, nodes, links, x, y, z, output = new_field_group(
        "Lamp_Reflector_Fields", "Colour", "NodeSocketColor")
    group.interface.new_socket("Roughness", in_out="OUTPUT",
                               socket_type="NodeSocketFloat")
    group.interface.new_socket("Metallic", in_out="OUTPUT",
                               socket_type="NodeSocketFloat")
    radius = reflector_radius(nodes, x, z)
    center = smooth_map(
        nodes, links, radius,
        fields.CENTER_EDGE_0, fields.CENTER_EDGE_1, 1.0, 0.0)
    ring = math_node(
        nodes, "MULTIPLY", radius, fields.RING_FREQUENCY)
    ring = math_node(nodes, "SINE", ring)
    ring = math_node(nodes, "MULTIPLY", ring, 0.5)
    ring = math_node(nodes, "ADD", ring, 0.5)
    angle = math_node(nodes, "ARCTAN2", z, x)
    wedge = math_node(nodes, "COSINE",
                      math_node(nodes, "SUBTRACT", angle, fields.WEDGE_ANGLE))
    wedge = math_node(nodes, "MAXIMUM", wedge, 0.0)
    wedge = smooth_map(
        nodes, links, wedge, fields.WEDGE_EDGE_0, fields.WEDGE_EDGE_1, 0.0, 1.0)
    dark_factor = math_node(nodes, "MULTIPLY", wedge, 0.35)
    colour = mix_colour(nodes, links, dark_factor, fields.SILVER, fields.DARK)
    colour = mix_colour(nodes, links, center, colour, fields.GOLD)
    links.new(colour, output.inputs["Colour"])

    rough = math_node(nodes, "MULTIPLY", ring, fields.ROUGH_RING)
    rough = math_node(nodes, "ADD", rough, fields.ROUGH_BASE)
    wedge_rough = math_node(nodes, "MULTIPLY", wedge, fields.ROUGH_WEDGE)
    rough = math_node(nodes, "ADD", rough, wedge_rough)
    rough = math_node(nodes, "MAXIMUM", rough, fields.ROUGH_MIN)
    rough = math_node(nodes, "MINIMUM", rough, fields.ROUGH_MAX)
    links.new(rough, output.inputs["Roughness"])

    center_metal = math_node(nodes, "MULTIPLY", center, fields.METAL_CENTER)
    metal = math_node(nodes, "SUBTRACT", fields.METAL_BASE, center_metal)
    metal = math_node(nodes, "MAXIMUM", metal, 0.0)
    metal = math_node(nodes, "MINIMUM", metal, 1.0)
    links.new(metal, output.inputs["Metallic"])
    return group


def make_source_material(group):
    material = bpy.data.materials.new("Lamp_Reflector_Source_Mat")
    material.use_nodes = True
    material.use_backface_culling = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    node = tree.nodes.new("ShaderNodeGroup")
    node.node_tree = group
    tree.links.new(coordinates.outputs["Object"], node.inputs["Vector"])
    for socket, target in (("Colour", "Base Color"),
                           ("Roughness", "Roughness"),
                           ("Metallic", "Metallic")):
        tree.links.new(node.outputs[socket], bsdf.inputs[target])
    return material


def make_emission_material(group, output_name, kind, name):
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
        tree.links.new(group_node.outputs[output_name], emission.inputs["Color"])
    else:
        combine = tree.nodes.new("ShaderNodeCombineColor")
        value = group_node.outputs[output_name]
        tree.links.new(value, combine.inputs["Red"])
        tree.links.new(value, combine.inputs["Green"])
        tree.links.new(value, combine.inputs["Blue"])
        tree.links.new(combine.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def make_baked_material(albedo, roughness, metallic):
    material = bpy.data.materials.new("Lamp_Reflector_Baked")
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
    return material


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


def bake_map(obj, material, image, bake_type):
    nodes = material.node_tree.nodes
    target = nodes.get("Bake_Target")
    if target is None:
        target = nodes.new("ShaderNodeTexImage")
        target.name = "Bake_Target"
    target.image = image
    target.select = True
    nodes.active = target
    active(obj)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 4
    scene.render.bake.use_selected_to_active = False
    bpy.ops.object.bake(type=bake_type)
    return save_image(image)


def pixels(image):
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(height, width, 4)


def srgb_to_linear(values):
    values = np.asarray(values, dtype=np.float32)
    return np.where(
        values <= 0.04045,
        values / 12.92,
        ((values + 0.055) / 1.055) ** 2.4).astype(np.float32)


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


def triangle_samples(obj):
    uv_data = obj.data.uv_layers.active.data
    vertices = obj.data.vertices
    for triangle in obj.data.loop_triangles:
        loops = list(triangle.loops)
        points = [vertices[obj.data.loops[index].vertex_index].co for index in loops]
        uvs = [uv_data[index].uv for index in loops]
        for weights in ((1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0),
                        (0.2, 0.4, 0.4)):
            point = Vector((0.0, 0.0, 0.0))
            uv = Vector((0.0, 0.0))
            for weight, position, texel in zip(weights, points, uvs):
                point += position * weight
                uv += texel * weight
            yield point, uv


def channel_check(obj, baked):
    albedo_errors = []
    roughness_errors = []
    metallic_errors = []
    for position, uv in triangle_samples(obj):
        colour, rough, metal = fields.sample_fields(position)
        albedo_errors.append(float(np.abs(
            np.array(colour, dtype=np.float32)
            - srgb_to_linear(sample_bilinear(baked["albedo"], uv)[:3])).mean()))
        roughness_errors.append(abs(
            float(rough) - float(sample_bilinear(baked["roughness"], uv)[0])))
        metallic_errors.append(abs(
            float(metal) - float(sample_bilinear(baked["metallic"], uv)[0])))
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
    }
    findings = []
    if report["albedo"]["mean"] > 0.02 or report["albedo"]["p95"] > 0.04:
        findings.append("albedo source-to-bake error exceeds tolerance")
    if report["roughness"]["mean"] > 0.01 or report["roughness"]["p95"] > 0.02:
        findings.append("roughness source-to-bake error exceeds tolerance")
    if report["metallic"]["mean"] > 0.01 or report["metallic"]["p95"] > 0.02:
        findings.append("metallic source-to-bake error exceeds tolerance")
    report["findings"] = findings
    report["status"] = "pass" if not findings else "fail"
    return report


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

teal_base = load_image(args.teal_basecolor, "sRGB")
teal_normal = load_image(args.teal_normal, "Non-Color")
teal_roughness = load_image(args.teal_roughness, "Non-Color")
silver_base = load_image(args.silver_basecolor, "sRGB")
silver_normal = load_image(args.silver_normal, "Non-Color")
silver_roughness = load_image(args.silver_roughness, "Non-Color")
silver_metallic = load_image(args.silver_metallic, "Non-Color")
teal = make_image_material("Lamp_Teal", teal_base, teal_normal, teal_roughness,
                           metallic=None, metallic_default=0.0, double_sided=True)
silver = make_image_material("Lamp_Silver", silver_base, silver_normal,
                             silver_roughness, silver_metallic,
                             double_sided=False)
rubber = make_rubber()

parts = []
parts.append(box("DeskLamp_Base", (0.24, 0.16, 0.035), (0.0, 0.0, 0.0215),
                 teal, bevel=0.008, smooth=False))
for index, (x, y) in enumerate(((-0.09, -0.06), (0.09, -0.06),
                                 (-0.09, 0.06), (0.09, 0.06))):
    parts.append(cylinder("DeskLamp_Pad_%d" % (index + 1), 0.015, 0.006,
                          (x, y, 0.003), rubber, vertices=32, smooth=False))
parts.append(cylinder("DeskLamp_Stem", 0.012, 0.410, (0.0, 0.0, 0.235),
                      silver, vertices=48))
parts.append(cylinder("DeskLamp_Collar", 0.022, 0.017, (0.0, 0.0, 0.0455),
                      silver, vertices=48))
parts.append(box("DeskLamp_Yoke", (0.100, 0.060, 0.035), (0.0, 0.0, 0.442),
                 silver, bevel=0.004, smooth=False))
for index, x in enumerate((-0.055, 0.055)):
    parts.append(box("DeskLamp_Yoke_Arm_%d" % (index + 1),
                     (0.012, 0.050, 0.050), (x, 0.0, 0.455), silver,
                     bevel=0.002, smooth=False))
parts.append(cylinder("DeskLamp_Pivot", 0.015, 0.150, (0.0, 0.0, 0.455),
                      silver, rotation=(0.0, math.pi / 2.0, 0.0), vertices=48))
for index, x in enumerate((-0.078, 0.078)):
    parts.append(cylinder("DeskLamp_Pivot_Cap_%d" % (index + 1), 0.020, 0.012,
                          (x, 0.0, 0.455), silver,
                          rotation=(0.0, math.pi / 2.0, 0.0), vertices=32))
parts.append(box("DeskLamp_Head_Arm", (0.032, 0.050, 0.026),
                 (0.0, 0.005, 0.455), silver, bevel=0.004, smooth=False))
parts.append(box("DeskLamp_Bracket", (0.050, 0.040, 0.040),
                 (0.0, 0.015, 0.455), silver, bevel=0.004, smooth=False))
parts.append(cylinder("DeskLamp_Shade_Neck", 0.014, 0.030,
                      (0.0, 0.048, 0.455), silver,
                      rotation=(math.pi / 2.0, 0.0, 0.0), vertices=32))
parts.append(cylinder("DeskLamp_Shade_Mount", 0.032, 0.004,
                      (0.0, 0.061, 0.455), silver,
                      rotation=(math.pi / 2.0, 0.0, 0.0), vertices=48))
parts.append(make_shade(teal))
parts.append(make_reflector())
for index, x in enumerate((-0.080, 0.080)):
    parts.append(cylinder("DeskLamp_Base_Screw_%d" % (index + 1), 0.007, 0.010,
                          (x, 0.0, 0.043), silver, vertices=24))
for index, angle in enumerate((math.radians(90.0), math.radians(210.0),
                               math.radians(330.0))):
    x = 0.052 * math.cos(angle)
    z = 0.052 * math.sin(angle)
    parts.append(box("DeskLamp_Reflector_Spoke_%d" % (index + 1),
                     (0.020, 0.005, 0.005), (x, 0.105, 0.455 + z), silver,
                     bevel=0.0, rotation=(0.0, -angle, 0.0), smooth=False))

root = bpy.data.objects.new("DeskLamp_Root", None)
bpy.context.scene.collection.objects.link(root)
for obj in parts:
    obj.parent = root

field_group = make_reflector_fields_group()
source_material = make_source_material(field_group)
reflector = bpy.data.objects["DeskLamp_Reflector"]
reflector.data.materials.clear()
reflector.data.materials.append(source_material)
active(reflector)
bpy.ops.object.modifier_add(type="TRIANGULATE")
reflector.modifiers[-1].quad_method = "BEAUTY"
reflector.modifiers[-1].ngon_method = "BEAUTY"
bpy.ops.object.modifier_apply(modifier=reflector.modifiers[-1].name)
reflector.data.calc_loop_triangles()

baked_albedo = make_target_image("Lamp_Reflector_Albedo_1024", "sRGB")
baked_roughness = make_target_image("Lamp_Reflector_Roughness_1024", "Non-Color")
baked_metallic = make_target_image("Lamp_Reflector_Metallic_1024", "Non-Color")

albedo_material = make_emission_material(
    field_group, "Colour", "colour", "Lamp_Reflector_Albedo_Bake")
reflector.data.materials.clear()
reflector.data.materials.append(albedo_material)
paths = {"albedo": bake_map(reflector, albedo_material, baked_albedo, "EMIT")}

rough_material = make_emission_material(
    field_group, "Roughness", "value", "Lamp_Reflector_Roughness_Bake")
reflector.data.materials.clear()
reflector.data.materials.append(rough_material)
paths["roughness"] = bake_map(reflector, rough_material, baked_roughness, "EMIT")

metal_material = make_emission_material(
    field_group, "Metallic", "value", "Lamp_Reflector_Metallic_Bake")
reflector.data.materials.clear()
reflector.data.materials.append(metal_material)
paths["metallic"] = bake_map(reflector, metal_material, baked_metallic, "EMIT")

baked_material = make_baked_material(baked_albedo, baked_roughness, baked_metallic)
reflector.data.materials.clear()
reflector.data.materials.append(baked_material)
baked = {
    "albedo": pixels(baked_albedo),
    "roughness": pixels(baked_roughness),
    "metallic": pixels(baked_metallic),
}
checks = channel_check(reflector, baked)

# Freeze triangulation before export so normal-mapped parts receive tangents.
for obj in parts:
    if obj.name == "DeskLamp_Reflector":
        continue
    active(obj)
    modifier = obj.modifiers.new("Triangulate_Export", "TRIANGULATE")
    modifier.quad_method = "BEAUTY"
    modifier.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.calc_loop_triangles()

bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

# Independent export copy: separate meshes and a separate root, same transforms.
export_root = bpy.data.objects.new("DeskLamp_Export_Root", None)
scene.collection.objects.link(export_root)
export_parts = []
for obj in parts:
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    duplicate.name = "Export_" + obj.name
    duplicate.data.name = "Export_" + obj.data.name
    scene.collection.objects.link(duplicate)
    duplicate.parent = export_root
    export_parts.append(duplicate)

bpy.ops.object.select_all(action="DESELECT")
export_root.select_set(True)
for obj in export_parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = export_parts[0]
bpy.ops.wm.save_as_mainfile(filepath=str(export_path))
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
    "export_blend": str(export_path),
    "export_blend_sha256": sha256_file(export_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "resolution": size,
    "parts": [
        {
            "name": obj.name,
            "vertices": len(obj.data.vertices),
            "polygons": len(obj.data.polygons),
            "triangles": len(obj.data.loop_triangles),
            "location": [round(float(value), 6) for value in obj.location],
            "materials": [slot.material.name for slot in obj.material_slots
                          if slot.material],
        }
        for obj in parts
    ],
    "bake": checks,
    "textures": {
        key: {"path": str(path), "sha256": sha256_file(path)}
        for key, path in paths.items()
    },
    "bake_settings": {
        "engine": "CYCLES",
        "samples": 32,
        "margin_px": 4,
        "channels": ["albedo EMIT", "roughness EMIT", "metallic EMIT"],
        "normal_bake": False,
    },
}
(out_dir / "build.json").write_text(json.dumps(report, indent=2))
print("PHASE7_DESK_LAMP", json.dumps(report, sort_keys=True))
raise SystemExit(0 if checks["status"] == "pass" else 1)
