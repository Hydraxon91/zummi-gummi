"""Build the Phase 7B many-island equipment-case benchmark."""

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--teal-basecolor", required=True)
parse.add_argument("--teal-normal", required=True)
parse.add_argument("--teal-roughness", required=True)
parse.add_argument("--silver-basecolor", required=True)
parse.add_argument("--silver-normal", required=True)
parse.add_argument("--silver-roughness", required=True)
parse.add_argument("--silver-metallic", required=True)
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "equipment_case_source_001.blend"
glb_path = out_dir / "equipment_case_001.glb"
if source_path.exists() or glb_path.exists():
    raise FileExistsError("Refusing to overwrite an existing equipment-case output")


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
                        metallic_default=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
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
    normal_node = texture(normal, "Normal")
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_dark_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.018, 0.024, 0.028, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.62
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def box(name, dimensions, location, material, bevel=0.0, segments=1):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel > 0.0:
        modifier = obj.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
        active(obj)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def frame(name, outer_dimensions, inner_dimensions, location, material,
          bevel=0.003):
    """One closed picture-frame solid cut from an outer block.

    The cutter stays hidden in the source as editable construction. The result
    has no overlapping bars at the corners.
    """
    outer = box(name, outer_dimensions, location, material)
    cutter = box(name + "_Cutter", inner_dimensions, location, material)
    for collection in list(cutter.users_collection):
        collection.objects.unlink(cutter)
    cutters.objects.link(cutter)
    cutter.hide_render = True
    active(outer)
    boolean = outer.modifiers.new("Opening", "BOOLEAN")
    boolean.operation = "DIFFERENCE"
    boolean.solver = "EXACT"
    boolean.object = cutter
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    if bevel > 0.0:
        modifier = outer.modifiers.new("Bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        modifier.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return outer


def uv_unwrap(obj):
    active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.02,
                             area_weight=0.0, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def join(objects, name):
    active(objects[0])
    for obj in objects[1:]:
        obj.select_set(True)
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    result.data.name = name + "_Mesh"
    return result


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
cutters = bpy.data.collections.new("Equipment_Cutters")
scene.collection.children.link(cutters)

teal_base = load_image(args.teal_basecolor, "sRGB")
teal_normal = load_image(args.teal_normal, "Non-Color")
teal_roughness = load_image(args.teal_roughness, "Non-Color")
silver_base = load_image(args.silver_basecolor, "sRGB")
silver_normal = load_image(args.silver_normal, "Non-Color")
silver_roughness = load_image(args.silver_roughness, "Non-Color")
silver_metallic = load_image(args.silver_metallic, "Non-Color")
shell = make_image_material("Case_Shell_Teal", teal_base, teal_normal,
                            teal_roughness, metallic=None, metallic_default=0.0)
frame_material = make_image_material("Case_Frame_Silver", silver_base, silver_normal,
                                     silver_roughness, silver_metallic)
dark = make_dark_material("Case_Dark_Rubber")

body = box("Case_Body", (0.82, 0.56, 0.24), (0.0, 0.0, 0.0), shell,
           bevel=0.025, segments=3)

# Front recessed panel: one Boolean-cut frame solid around a dark inner plate.
front_y = -0.285
front_frame = frame(
    "Front_Frame",
    (0.52, 0.02, 0.18),
    (0.46, 0.03, 0.12),
    (0.0, front_y, 0.0),
    frame_material,
)
front_panel = box("Front_Panel", (0.50, 0.008, 0.16), (0.0, -0.283, 0.0), dark, 0.003, 1)

# Top recessed panel, set back from the handle.
top_z = 0.1295
top_frame = frame(
    "Top_Frame",
    (0.52, 0.18, 0.02),
    (0.46, 0.12, 0.03),
    (0.0, 0.0, top_z),
    frame_material,
)
top_panel = box("Top_Panel", (0.50, 0.16, 0.008), (0.0, 0.0, 0.125), dark, 0.003, 1)

body_parts = [body, front_frame, front_panel, top_frame, top_panel]
case = join(body_parts, "Equipment_Case")

# U-shaped handle and two mounting plates on the back half of the top.
curve_data = bpy.data.curves.new("Handle_Curve", "CURVE")
curve_data.dimensions = "3D"
curve_data.resolution_u = 8
curve_data.bevel_depth = 0.018
curve_data.bevel_resolution = 3
curve_data.use_fill_caps = True
spline = curve_data.splines.new("BEZIER")
spline.bezier_points.add(3)
points = [
    (-0.18, 0.0, 0.13),
    (-0.18, 0.0, 0.23),
    (0.18, 0.0, 0.23),
    (0.18, 0.0, 0.13),
]
for index, point in enumerate(points):
    bezier = spline.bezier_points[index]
    bezier.co = point
    bezier.handle_left_type = "AUTO"
    bezier.handle_right_type = "AUTO"
curve = bpy.data.objects.new("Handle_Wire", curve_data)
bpy.context.scene.collection.objects.link(curve)
curve.location = (0.0, -0.20, 0.0)
active(curve)
bpy.ops.object.convert(target="MESH")
handle = bpy.context.object
handle.name = "Equipment_Handle"
handle.data.name = "Equipment_Handle_Mesh"
handle.data.materials.append(frame_material)
for index, x in enumerate((-0.18, 0.18)):
    mount = box("Handle_Mount_%d" % index, (0.06, 0.06, 0.012),
                (x, -0.20, 0.13), frame_material, 0.003, 1)
    active(handle)
    boolean = handle.modifiers.new("Mount_Union_%d" % index, "BOOLEAN")
    boolean.operation = "UNION"
    boolean.solver = "EXACT"
    boolean.object = mount
    bpy.ops.object.modifier_apply(modifier=boolean.name)
    for collection in list(mount.users_collection):
        collection.objects.unlink(mount)
    cutters.objects.link(mount)
    mount.hide_render = True

# The converted curve caps can remain open; close them before UV/export.
active(handle)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.fill_holes(sides=0)
bpy.ops.object.mode_set(mode="OBJECT")

# Four rubber feet.
feet = []
for index, (x, y) in enumerate(((-0.34, -0.20), (0.34, -0.20),
                                (-0.34, 0.20), (0.34, 0.20))):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.04, depth=0.03,
                                        location=(x, y, -0.135))
    foot = bpy.context.object
    foot.name = "Foot_%d" % index
    foot.data.name = "Foot_%d_Mesh" % index
    foot.data.materials.append(dark)
    feet.append(foot)
feet = join(feet, "Equipment_Feet")
active(feet)
triangulate = feet.modifiers.new("Triangulate_For_Tangents", "TRIANGULATE")
bpy.ops.object.modifier_apply(modifier=triangulate.name)

for obj in (case, handle, feet):
    uv_unwrap(obj)

# Boolean frame openings leave n-gons; triangulate the case so tangents can export.
active(case)
triangulate_case = case.modifiers.new("Triangulate_For_Tangents", "TRIANGULATE")
bpy.ops.object.modifier_apply(modifier=triangulate_case.name)

# Smooth only the curved/hard-surface bevels; keep small plates readable.
for obj in (case, handle):
    active(obj)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(30.0))

bpy.ops.object.select_all(action="DESELECT")
for obj in (case, handle, feet):
    obj.select_set(True)
bpy.context.view_layer.objects.active = case
cutters.hide_viewport = True
cutters.hide_render = True
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
)

# Report source inventory before saving the JSON.
def objectinfo(obj):
    obj.data.calc_loop_triangles()
    return {
        "name": obj.name,
        "type": obj.type,
        "vertices": len(obj.data.vertices),
        "polygons": len(obj.data.polygons),
        "triangles": len(obj.data.loop_triangles),
        "uv_maps": [layer.name for layer in obj.data.uv_layers],
        "materials": [slot.material.name if slot.material else None
                      for slot in obj.material_slots],
        "dimensions": [round(float(value), 6) for value in obj.dimensions],
    }


report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "objects": [objectinfo(obj) for obj in (case, handle, feet)],
    "textures": {
        "teal_basecolor": {"path": str(Path(args.teal_basecolor).resolve()),
                           "sha256": sha256_file(args.teal_basecolor)},
        "teal_normal": {"path": str(Path(args.teal_normal).resolve()),
                        "sha256": sha256_file(args.teal_normal)},
        "teal_roughness": {"path": str(Path(args.teal_roughness).resolve()),
                           "sha256": sha256_file(args.teal_roughness)},
        "silver_basecolor": {"path": str(Path(args.silver_basecolor).resolve()),
                             "sha256": sha256_file(args.silver_basecolor)},
        "silver_normal": {"path": str(Path(args.silver_normal).resolve()),
                          "sha256": sha256_file(args.silver_normal)},
        "silver_roughness": {"path": str(Path(args.silver_roughness).resolve()),
                             "sha256": sha256_file(args.silver_roughness)},
        "silver_metallic": {"path": str(Path(args.silver_metallic).resolve()),
                            "sha256": sha256_file(args.silver_metallic)},
    },
}
(out_dir / "build.json").write_text(json.dumps(report, indent=2))
print("PHASE7_EQUIPMENT_CASE", json.dumps(report, sort_keys=True))
