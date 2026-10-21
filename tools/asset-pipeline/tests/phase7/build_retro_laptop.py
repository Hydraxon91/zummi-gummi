"""Build the Phase 7F clamshell laptop test asset.

Inspired by the supplied iBook references. No branded logos, copied wallpaper or
Apple UI assets are used. The lid is a separate hierarchy under a rotatable hinge
empty; a two-key Lid_Open action is exported for glTF viewers.
"""

import argparse
import hashlib
import json
import math
import sys
import uuid
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parents[2] / "scripts"
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from asset_fingerprint import fingerprint_objects
from check_shape_gate import check_approval
from construction_gate import run as run_construction
from check_evidence import validate_evidence_report
from asset_identity import assign_asset_id, get_asset_id, object_ids

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--shape-approval", default="",
                   help="Recorded silhouette approval required before GLB export")
parse.add_argument("--construction-brief", default="",
                   help="Construction-method brief JSON required before GLB export")
parse.add_argument("--candidate-ledger", default="",
                   help="Candidate-ledger JSON required before GLB export")
parse.add_argument("--evidence-report", default="",
                   help="Pose/freshness evidence JSON required before GLB export")
parse.add_argument("--required-views", default="front,side,top,three_quarter")
parse.add_argument("--resolution", type=int, default=1024)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
texture_dir = out_dir / "textures"
texture_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "retro_laptop_source_001.blend"
glb_path = out_dir / "retro_laptop_001.glb"
report_path = out_dir / "build.json"
for path in (source_path, glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
root_collection = bpy.data.collections.new("7F_RetroLaptop")
scene.collection.children.link(root_collection)
review_collection = bpy.data.collections.new("7F_Review")
scene.collection.children.link(review_collection)


def move_to(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def material(name, color, roughness=0.4, metallic=0.0, transmission=0.0,
             emission=None, emission_strength=0.0, ior=1.45):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["IOR"].default_value = ior
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def apply_bevel(obj, width, segments=3, angle=40.0):
    if width <= 0:
        return
    modifier = obj.modifiers.new("Edge_Bevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    modifier.angle_limit = math.radians(angle)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def box(name, dimensions, location, mat, bevel=0.0, segments=3, collection=root_collection):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        apply_bevel(obj, bevel, segments)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40.0))
    move_to(obj, collection)
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), vertices=32,
             bevel=0.0, collection=root_collection):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    if bevel:
        apply_bevel(obj, bevel, 2)
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40.0))
    move_to(obj, collection)
    return obj


def torus(name, major, minor, location, mat, rotation=(0, 0, 0),
          collection=root_collection):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=32, minor_segments=8,
                                     location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.data.materials.append(mat)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40.0))
    move_to(obj, collection)
    return obj


def parent_local(obj, parent):
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    return obj


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ---------------------------------------------------------------- materials
pearl = material("Retro_Pearl", (0.90, 0.89, 0.84), roughness=0.34)
pearl_dark = material("Retro_Pearl_Shadow", (0.68, 0.69, 0.65), roughness=0.42)
tangerine = material("Retro_Tangerine_Trim", (0.90, 0.12, 0.005), roughness=0.20,
                     transmission=0.15, ior=1.46)
tangerine_solid = material("Retro_Tangerine_Solid", (0.95, 0.16, 0.01), roughness=0.30)
key_mat = material("Retro_Keycap", (0.93, 0.92, 0.86), roughness=0.48)
tray_mat = material("Retro_Keyboard_Tray", (0.22, 0.23, 0.22), roughness=0.52)
dark = material("Retro_Dark_Plastic", (0.055, 0.060, 0.065), roughness=0.34)
silver = material("Retro_Hinge_Silver", (0.62, 0.64, 0.66), roughness=0.24, metallic=1.0)
rubber = material("Retro_Rubber", (0.035, 0.038, 0.040), roughness=0.82)
trackpad_mat = material("Retro_Trackpad", (0.55, 0.57, 0.55), roughness=0.30)

# ---------------------------------------------------------------- screen art
width, height = 1024, 768
y, x = np.mgrid[0:height, 0:width]
u = x / (width - 1)
v = y / (height - 1)
base = np.stack([
    0.025 + 0.10 * (1.0 - v) + 0.04 * u,
    0.075 + 0.42 * (1.0 - v) + 0.08 * u,
    0.28 + 0.44 * (1.0 - v) + 0.08 * u,
], axis=-1)
wave = np.sin((u * 2.4 + v * 1.7) * math.pi * 2.0) * 0.5 + 0.5
ribbon = np.clip((np.sin((u * 1.3 - v * 2.1) * math.pi * 2.0) + 0.35) * 1.2, 0.0, 1.0)
base[..., 0] += ribbon * 0.06
base[..., 1] += ribbon * 0.16
base[..., 2] += ribbon * 0.20
base *= (0.82 + 0.18 * wave[..., None])
base = np.clip(base, 0.0, 1.0)
base = np.where(base <= 0.04045, base / 12.92,
                ((base + 0.055) / 1.055) ** 2.4)
screen_image = bpy.data.images.new("Retro_Desktop_Art", width=width, height=height,
                                   alpha=False, float_buffer=False)
rgba = np.concatenate([base, np.ones((height, width, 1)),], axis=-1)
screen_image.pixels.foreach_set(rgba.astype(np.float32).ravel())
screen_image.filepath_raw = str(texture_dir / "retro_desktop_art.png")
screen_image.file_format = "PNG"
screen_image.save()
screen_image.pack()

screen_mat = bpy.data.materials.new("Retro_Screen")
screen_mat.use_nodes = True
nodes = screen_mat.node_tree.nodes
links = screen_mat.node_tree.links
bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
tex = nodes.new("ShaderNodeTexImage")
tex.image = screen_image
links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
bsdf.inputs["Emission Strength"].default_value = 0.70
bsdf.inputs["Roughness"].default_value = 0.88
if "Specular IOR Level" in bsdf.inputs:
    bsdf.inputs["Specular IOR Level"].default_value = 0.0

# ---------------------------------------------------------------- base
base_shell = box("RetroLaptop_Base_Shell", (0.350, 0.310, 0.035),
                 (0.0, 0.0, 0.0175), tangerine, bevel=0.016, segments=6)
deck = box("RetroLaptop_Deck", (0.322, 0.282, 0.008), (0.0, 0.0, 0.038),
           pearl, bevel=0.016, segments=4)
# A rear spine softens the hinge transition.
cylinder("RetroLaptop_Rear_Spine", 0.016, 0.300, (0.0, 0.145, 0.035), tangerine,
         rotation=(0, math.radians(90), 0), vertices=40)

# Keyboard tray and keys.
box("RetroLaptop_Keyboard_Tray", (0.230, 0.155, 0.0015), (-0.040, -0.010, 0.0425),
    tray_mat, bevel=0.005, segments=2)
key_objects = []
for row, y_pos in enumerate((-0.060, -0.039, -0.018, 0.003, 0.024)):
    for col, x_pos in enumerate(np.linspace(-0.104, 0.104, 12)):
        key = box(f"RetroLaptop_Key_{row}_{col}", (0.0165, 0.0165, 0.0035),
                  (float(x_pos), y_pos, 0.0455), key_mat, bevel=0.0015, segments=2)
        key_objects.append(key)
spacebar = box("RetroLaptop_Spacebar", (0.105, 0.0165, 0.0035),
               (0.0, -0.081, 0.0455), key_mat, bevel=0.0015, segments=2)
key_objects.append(spacebar)
bpy.ops.object.select_all(action="DESELECT")
for obj in key_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = key_objects[0]
bpy.ops.object.join()
keyboard = bpy.context.object
keyboard.name = "RetroLaptop_Keyboard"
keyboard.data.name = "RetroLaptop_Keyboard_Mesh"
# The iBook keyboard sits left of centre; the trackpad takes the right side.
keyboard.location.x = -0.040

# Speaker grille, power button, trackpad and click bar.
speaker = cylinder("RetroLaptop_Speaker", 0.022, 0.002, (-0.132, 0.045, 0.0430),
                   pearl_dark, vertices=40, bevel=0.001)
torus("RetroLaptop_Speaker_Ring", 0.0135, 0.0014, (-0.132, 0.045, 0.0445),
      dark, rotation=(0, 0, 0))
power = cylinder("RetroLaptop_Power", 0.0085, 0.002, (0.128, 0.083, 0.0430),
                 dark, vertices=32, bevel=0.0008)
torus("RetroLaptop_Power_Ring", 0.0055, 0.0009, (0.128, 0.083, 0.0445),
      tangerine_solid)
box("RetroLaptop_Trackpad_Border", (0.106, 0.066, 0.002), (0.085, -0.116, 0.0425),
    dark, bevel=0.004, segments=2)
box("RetroLaptop_Trackpad", (0.098, 0.058, 0.003), (0.085, -0.116, 0.0435),
    trackpad_mat, bevel=0.005, segments=3)
box("RetroLaptop_Trackpad_Button", (0.098, 0.014, 0.005), (0.085, -0.140, 0.0445),
    tangerine_solid, bevel=0.004, segments=3)

# Rubber feet sit just below the shell; the root is lifted by 6 mm in the scene.
for sx in (-1, 1):
    for sy in (-1, 1):
        cylinder(f"RetroLaptop_Foot_{sx}_{sy}", 0.011, 0.006,
                 (sx * 0.130, sy * 0.115, -0.003), rubber, vertices=24,
                 bevel=0.001)

# Hinge mounts and barrel.
for sx in (-1, 1):
    box(f"RetroLaptop_Hinge_Mount_{sx}", (0.026, 0.032, 0.012),
        (sx * 0.060, 0.143, 0.048), pearl_dark, bevel=0.004, segments=2)
cylinder("RetroLaptop_Hinge_Barrel", 0.010, 0.124, (0.0, 0.150, 0.052),
         silver, rotation=(0, math.radians(90), 0), vertices=32)
for sx in (-1, 1):
    cylinder(f"RetroLaptop_Hinge_Cap_{sx}", 0.012, 0.010,
             (sx * 0.067, 0.150, 0.052), tangerine_solid,
             rotation=(0, math.radians(90), 0), vertices=32, bevel=0.001)

# ---------------------------------------------------------------- lid hierarchy
root = bpy.data.objects.new("RetroLaptop_Root", None)
root.empty_display_type = "PLAIN_AXES"
root.empty_display_size = 0.12
root_collection.objects.link(root)

hinge = bpy.data.objects.new("RetroLaptop_Hinge", None)
hinge.empty_display_type = "ARROWS"
hinge.empty_display_size = 0.06
hinge.location = (0.0, 0.150, 0.049)
root_collection.objects.link(hinge)
hinge.parent = root

# Lid parts are authored in hinge-local coordinates (origin at the hinge axis).
lid_shell = box("RetroLaptop_Lid_Shell", (0.350, 0.305, 0.020),
                (0.0, -0.1525, 0.010), tangerine, bevel=0.010, segments=6)
cutter = box("RetroLaptop_Lid_Cutout", (0.315, 0.270, 0.040),
             (0.0, -0.1525, 0.010), pearl, bevel=0.0, segments=1)
move_to(cutter, review_collection)
cutter.hide_render = True
cutter.hide_viewport = True
bpy.context.view_layer.objects.active = lid_shell
lid_shell.select_set(True)
boolean = lid_shell.modifiers.new("Lid_Screen_Opening", "BOOLEAN")
boolean.operation = "DIFFERENCE"
boolean.solver = "EXACT"
boolean.object = cutter
bpy.ops.object.modifier_apply(modifier=boolean.name)
lid_shell.select_set(False)
apply_bevel(lid_shell, 0.004, 2)

# Rubber inner gasket: closes the lid/base perimeter gap and reads as a dark
# screen surround when the lid is open.
lid_gasket_parts = []
for name, x, y, dims in (
    ("RetroLaptop_Lid_Gasket_Left", -0.170, -0.1525, (0.006, 0.300, 0.006)),
    ("RetroLaptop_Lid_Gasket_Right", 0.170, -0.1525, (0.006, 0.300, 0.006)),
    ("RetroLaptop_Lid_Gasket_Front", 0.0, -0.3025, (0.340, 0.006, 0.006)),
    ("RetroLaptop_Lid_Gasket_Back", 0.0, -0.0025, (0.340, 0.006, 0.006)),
):
    lid_gasket_parts.append(box(name, dims, (x, y, -0.003), rubber,
                                bevel=0.002, segments=2))

lid_inner = box("RetroLaptop_Lid_Inner", (0.335, 0.290, 0.006),
                (0.0, -0.1525, 0.006), pearl, bevel=0.016, segments=3)
lid_back = box("RetroLaptop_Lid_Back", (0.300, 0.260, 0.004),
               (0.0, -0.1525, 0.022), pearl, bevel=0.012, segments=3)
bezel = box("RetroLaptop_Bezel", (0.270, 0.210, 0.002),
            (0.0, -0.1525, 0.0015), pearl, bevel=0.004, segments=2)
gasket = box("RetroLaptop_Screen_Gasket", (0.248, 0.188, 0.0012),
             (0.0, -0.1525, 0.0009), dark, bevel=0.002, segments=2)

# Screen plane, normal -Z so it faces the user when the lid is open.
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, -0.1525, 0.0002),
                                 rotation=(math.pi, 0.0, 0.0))
screen = bpy.context.object
screen.name = "RetroLaptop_Screen"
screen.data.name = "RetroLaptop_Screen_Mesh"
screen.scale = (0.240, 0.180, 1.0)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
screen.data.materials.append(screen_mat)
move_to(screen, root_collection)

# Wide integrated carry handle on the outer lid face.
handle_parts = []
for x in (-0.085, 0.085):
    handle_parts.append(box(
        f"RetroLaptop_Handle_Post_{x}", (0.018, 0.014, 0.062),
        (x, -0.270, 0.055), tangerine_solid, bevel=0.005, segments=3))
handle_parts.append(box(
    "RetroLaptop_Handle_Top", (0.188, 0.014, 0.018),
    (0.0, -0.270, 0.095), tangerine_solid, bevel=0.005, segments=3))

for obj in (lid_shell, lid_inner, lid_back, bezel, gasket, screen, *handle_parts, *lid_gasket_parts):
    parent_local(obj, hinge)

# Hinge control: direct rotation plus a small exported action.
hinge.rotation_mode = "XYZ"
hinge["open_angle_deg"] = 110.0
hinge["hinge_axis"] = "local X"
hinge["closed_angle_deg"] = 0.0
hinge["default_angle_deg"] = 110.0
hinge.animation_data_create()
action = bpy.data.actions.new("Lid_Open")
hinge.animation_data.action = action
hinge.rotation_euler = (0.0, 0.0, 0.0)
hinge.keyframe_insert("rotation_euler", frame=1)
hinge.rotation_euler = (math.radians(-110.0), 0.0, 0.0)
hinge.keyframe_insert("rotation_euler", frame=20)
scene.frame_start = 1
scene.frame_end = 20
scene.frame_set(20)

# Parent base parts to the root for a clean hierarchy.
for obj in (base_shell, deck, keyboard):
    obj.parent = root
for obj in bpy.data.objects:
    if (obj.name.startswith("RetroLaptop_") and obj.parent is None
            and obj.type == "MESH" and root_collection in obj.users_collection):
        obj.parent = root

# ---------------------------------------------------------------- review setup
ground_mat = material("Retro_Review_Ground", (0.10, 0.11, 0.12), roughness=0.65)
bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, -0.006))
ground = bpy.context.object
ground.name = "Retro_Review_Ground"
ground.data.materials.append(ground_mat)
move_to(ground, review_collection)

camera_data = bpy.data.cameras.new("Retro_Review_Camera")
camera = bpy.data.objects.new("Retro_Review_Camera", camera_data)
review_collection.objects.link(camera)
camera.location = (0.62, -0.72, 0.48)
camera.rotation_euler = (Vector((0.0, -0.02, 0.13)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera_data.lens = 55
scene.camera = camera

for name, location, energy, size in (
    ("Retro_Key", (0.65, -0.75, 1.15), 80.0, 0.70),
    ("Retro_Fill", (-0.75, -0.45, 0.70), 40.0, 0.80),
    ("Retro_Rim", (0.0, 0.85, 0.95), 55.0, 0.60),
):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    review_collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0.0, -0.02, 0.10)) - light.location).to_track_quat("-Z", "Y").to_euler()

world = bpy.data.worlds.new("Retro_Review_World")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.04, 0.045, 0.055, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35
scene.world = world
scene.render.engine = "CYCLES"
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 850
scene.render.resolution_percentage = 100
try:
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
except TypeError:
    pass
scene.view_settings.exposure = -1.05

# ---------------------------------------------------------------- save/export
# glTF tangents need triangles; this also removes the cylinder-cap tangent warnings.
for obj in [item for item in root.children_recursive if item.type == "MESH"]:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    triangulate = obj.modifiers.new("Tangents_Triangulate", "TRIANGULATE")
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
bpy.ops.object.select_all(action="DESELECT")
# Stable IDs are part of the source and must exist before capture/approval.
namespace = uuid.uuid5(uuid.NAMESPACE_URL, "gummy-bears/retro-laptop-source/001")
for obj in [root, *root.children_recursive]:
    if not get_asset_id(obj):
        assign_asset_id(obj, str(uuid.uuid5(namespace, obj.name)))

bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

# Delivery is gated on a recorded silhouette review of this exact source.
if not args.shape_approval:
    print("PHASE7_RETRO_LAPTOP_BLOCKED " + json.dumps({
        "reason": "shape approval required",
        "source": str(source_path),
        "next": "review, record approval, then run export_approved_asset.py",
    }))
    raise SystemExit(2)
approval_meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
approval_errors = []
approval_report = check_approval(
    args.shape_approval,
    fingerprint_objects(approval_meshes),
    sorted(obj.name for obj in approval_meshes),
    "detail",
    approval_errors,
    [value.strip() for value in args.required_views.split(",") if value.strip()],
    [get_asset_id(obj) for obj in approval_meshes],
)
if approval_errors:
    print("PHASE7_RETRO_LAPTOP_BLOCKED " + json.dumps({
        "reason": "approval validation failed",
        "approval": approval_report,
        "errors": approval_errors,
    }))
    raise SystemExit(1)

construction_report = None
if not (args.construction_brief and args.candidate_ledger and args.evidence_report):
    print("PHASE7_RETRO_LAPTOP_BLOCKED " + json.dumps({
        "reason": "construction brief, candidate ledger and evidence report required",
        "source": str(source_path),
    }))
    raise SystemExit(2)
construction_report = run_construction(
    args.construction_brief, args.candidate_ledger, args.evidence_report,
    str(source_path), [get_asset_id(obj) for obj in approval_meshes])
if construction_report["errors"]:
    print("PHASE7_RETRO_LAPTOP_BLOCKED " + json.dumps({
        "reason": "construction gate failed",
        "construction": construction_report,
        "errors": construction_report["errors"],
    }))
    raise SystemExit(1)

evidence_errors = []
ids_by_name = object_ids(approval_meshes, evidence_errors)
expected_ids = [ids_by_name[obj.name] for obj in approval_meshes
                if ids_by_name.get(obj.name)]
evidence_recheck = validate_evidence_report(
    args.evidence_report, evidence_errors, [obj.name for obj in approval_meshes],
    expected_ids)
if evidence_errors:
    print("PHASE7_RETRO_LAPTOP_BLOCKED " + json.dumps({
        "reason": "evidence revalidation failed",
        "evidence_recheck": evidence_recheck,
        "errors": evidence_errors,
    }))
    raise SystemExit(1)

bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for obj in root.children_recursive:
    obj.select_set(True)
scene.view_layers[0].objects.active = root
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
    export_animations=True,
)

root.select_set(False)
def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        [min(point[i] for point in points) for i in range(3)],
        [max(point[i] for point in points) for i in range(3)],
    )

mesh_objects = [obj for obj in root.children_recursive if obj.type == "MESH"]
bounds = world_bounds(mesh_objects)
report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "glb_bytes": glb_path.stat().st_size,
    "construction": construction_report,
    "evidence_recheck": evidence_recheck,
    "units": "metres",
    "up": "+Z",
    "front": "-Y",
    "hinge": {
        "object": hinge.name,
        "axis": "local X",
        "closed_angle_deg": 0,
        "default_angle_deg": 110,
        "action": action.name,
        "frames": [1, 20],
        "world_location": list(hinge.location),
    },
    "bounds_m": {
        "min": [round(value, 6) for value in bounds[0]],
        "max": [round(value, 6) for value in bounds[1]],
    },
    "dimensions_m": [round(bounds[1][i] - bounds[0][i], 6) for i in range(3)],
    "mesh_objects": len(mesh_objects),
    "materials": sorted({mat.name for obj in mesh_objects for mat in obj.data.materials if mat}),
    "screen_art": str(texture_dir / "retro_desktop_art.png"),
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_RETRO_LAPTOP " + json.dumps({
    "glb": str(glb_path),
    "bytes": report["glb_bytes"],
    "sha256": report["glb_sha256"],
    "dimensions": report["dimensions_m"],
    "meshes": report["mesh_objects"],
}))
