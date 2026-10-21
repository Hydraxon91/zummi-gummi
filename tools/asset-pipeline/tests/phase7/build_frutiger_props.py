"""Build the Phase 7F beanbag, potted plant and wired mouse companion props."""

import argparse
import hashlib
import json
import math
import sys
import uuid
from pathlib import Path

import bpy
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
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "frutiger_props_source_001.blend"
report_path = out_dir / "build.json"
for path in (source_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
assets = bpy.data.collections.new("7F_FrutigerProps")
scene.collection.children.link(assets)
cutters = bpy.data.collections.new("7F_Cutters")
scene.collection.children.link(cutters)
cutters.hide_viewport = True
cutters.hide_render = True


def move_to(obj, collection):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def material(name, color, roughness=0.6, metallic=0.0, transmission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    return mat


def shade(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40.0))
    obj.select_set(False)


def bevel(obj, width, segments=2):
    mod = obj.modifiers.new("Edge_Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(40.0)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def sphere(name, location, scale, mat, segments=48, rings=24, collection=assets):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings,
                                         radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    shade(obj)
    move_to(obj, collection)
    return obj


def cylinder(name, radius, depth, location, mat, rotation=(0, 0, 0), vertices=32,
             collection=assets):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.data.materials.append(mat)
    shade(obj)
    move_to(obj, collection)
    return obj


def torus(name, major, minor, location, mat, scale=(1, 1, 1), collection=assets):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=48, minor_segments=10,
                                     location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    shade(obj)
    move_to(obj, collection)
    return obj


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_root(root, path):
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in root.children_recursive:
        obj.select_set(True)
    scene.view_layers[0].objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )


def root_empty(name):
    root = bpy.data.objects.new(name, None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.1
    assets.objects.link(root)
    return root


aqua = material("Frutiger_Beanbag_Aqua", (0.055, 0.42, 0.42), roughness=0.86)
seam = material("Frutiger_Beanbag_Seam", (0.025, 0.24, 0.25), roughness=0.8)
pearl = material("Frutiger_Plant_Pot", (0.88, 0.88, 0.82), roughness=0.32)
leaf = material("Frutiger_Leaf", (0.045, 0.30, 0.075), roughness=0.46)
soil = material("Frutiger_Soil", (0.055, 0.032, 0.020), roughness=0.9)
mouse_pearl = material("Frutiger_Mouse_Pearl", (0.88, 0.89, 0.84), roughness=0.36)
tangerine = material("Frutiger_Mouse_Tangerine", (0.95, 0.16, 0.01), roughness=0.34)
cable = material("Frutiger_Mouse_Cable", (0.09, 0.10, 0.10), roughness=0.62)

# Beanbag -------------------------------------------------------------------
bean_root = root_empty("Frutiger_Beanbag_Root")
beanbag = sphere("Frutiger_Beanbag", (0.0, 0.0, 0.23), (0.38, 0.32, 0.23), aqua)
# Flatten the underside so the bag sits on the rug instead of balancing on a point.
bottom_cutter = sphere("Frutiger_Beanbag_Bottom_Cutter", (0.0, 0.0, -0.07),
                       (0.42, 0.36, 0.09), aqua, segments=32, rings=16,
                       collection=cutters)
bottom_cutter.hide_render = True
bpy.context.view_layer.objects.active = beanbag
beanbag.select_set(True)
bottom_boolean = beanbag.modifiers.new("Flat_Bottom", "BOOLEAN")
bottom_boolean.operation = "DIFFERENCE"
bottom_boolean.solver = "EXACT"
bottom_boolean.object = bottom_cutter
bpy.ops.object.modifier_apply(modifier=bottom_boolean.name)
cutter = sphere("Frutiger_Beanbag_Seat_Cutter", (0.0, -0.02, 0.54),
                (0.21, 0.21, 0.18), aqua, segments=40, rings=20, collection=cutters)
cutter.hide_render = True
boolean = beanbag.modifiers.new("Seat_Depression", "BOOLEAN")
boolean.operation = "DIFFERENCE"
boolean.solver = "EXACT"
boolean.object = cutter
bpy.ops.object.modifier_apply(modifier=boolean.name)
beanbag.select_set(False)
beanbag.location.z -= 0.02
bpy.context.view_layer.update()
bevel(beanbag, 0.014, 3)
shade(beanbag)
beanbag.parent = bean_root

# Potted plant --------------------------------------------------------------
plant_root = root_empty("Frutiger_Plant_Root")
bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.100, radius2=0.132,
                                depth=0.22, location=(0.0, 0.0, 0.11))
pot = bpy.context.object
pot.name = "Frutiger_Plant_Pot"
pot.data.name = "Frutiger_Plant_Pot_Mesh"
pot.data.materials.append(pearl)
bevel(pot, 0.008, 2)
shade(pot)
move_to(pot, assets)
pot.parent = plant_root
pot_rim = torus("Frutiger_Plant_Rim", 0.124, 0.010, (0.0, 0.0, 0.218), pearl,
                scale=(1.0, 1.0, 1.0))
pot_rim.parent = plant_root
soil_disc = cylinder("Frutiger_Plant_Soil", 0.108, 0.012, (0.0, 0.0, 0.222),
                     soil, vertices=40)
soil_disc.parent = plant_root
stem = cylinder("Frutiger_Plant_Stem", 0.010, 0.24, (0.0, 0.0, 0.33), leaf,
                vertices=12)
stem.parent = plant_root
leaves = []
for index in range(9):
    angle = math.radians(index * 40.0)
    tilt = math.radians(18.0 + (index % 3) * 7.0)
    length = 0.17 + (index % 4) * 0.018
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1.0,
                                         location=(0.0, 0.0, 0.0))
    blade = bpy.context.object
    blade.name = f"Frutiger_Plant_Leaf_{index}"
    blade.data.name = blade.name + "_Mesh"
    blade.scale = (0.026, 0.009, length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    blade.rotation_euler = (tilt, 0.0, angle)
    blade.location = (0.045 * math.cos(angle), 0.045 * math.sin(angle), 0.34)
    blade.data.materials.append(leaf)
    shade(blade)
    move_to(blade, assets)
    blade.parent = plant_root
    leaves.append(blade)

# Wired mouse ---------------------------------------------------------------
mouse_root = root_empty("Frutiger_Mouse_Root")
mouse = sphere("Frutiger_Mouse_Body", (0.0, 0.0, 0.026), (0.042, 0.062, 0.026),
               mouse_pearl, segments=40, rings=20)
mouse.parent = mouse_root
wheel = cylinder("Frutiger_Mouse_Wheel", 0.009, 0.008, (0.0, 0.025, 0.046),
                 tangerine, rotation=(0, math.radians(90), 0), vertices=24)
wheel.parent = mouse_root
button = box = None
# Simple split button bar.
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, -0.012, 0.046))
button_obj = bpy.context.object
button_obj.name = "Frutiger_Mouse_Button"
button_obj.data.name = "Frutiger_Mouse_Button_Mesh"
button_obj.scale = (0.036, 0.036, 0.003)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
button_obj.data.materials.append(mouse_pearl)
bevel(button_obj, 0.004, 2)
shade(button_obj)
move_to(button_obj, assets)
button_obj.parent = mouse_root

curve = bpy.data.curves.new("Frutiger_Mouse_Cable_Curve", "CURVE")
curve.dimensions = "3D"
curve.resolution_u = 16
curve.bevel_depth = 0.0025
curve.bevel_resolution = 2
spline = curve.splines.new("BEZIER")
points = [(0.0, 0.055, 0.014), (0.03, 0.14, 0.010), (-0.01, 0.24, 0.008),
          (0.04, 0.34, 0.007)]
spline.bezier_points.add(len(points) - 1)
for bezier, co in zip(spline.bezier_points, points):
    bezier.co = co
    bezier.handle_left_type = "AUTO"
    bezier.handle_right_type = "AUTO"
cable_obj = bpy.data.objects.new("Frutiger_Mouse_Cable", curve)
assets.objects.link(cable_obj)
cable_obj.data.materials.append(cable)
bpy.context.view_layer.objects.active = cable_obj
cable_obj.select_set(True)
bpy.ops.object.convert(target="MESH")
cable_obj = bpy.context.object
cable_obj.name = "Frutiger_Mouse_Cable"
cable_obj.data.name = "Frutiger_Mouse_Cable_Mesh"
cable_obj.parent = mouse_root

# Save and export -----------------------------------------------------------
namespace = uuid.uuid5(uuid.NAMESPACE_URL, "gummy-bears/frutiger-props-source/001")
for root in (bean_root, plant_root, mouse_root):
    for obj in [root, *root.children_recursive]:
        if not get_asset_id(obj):
            assign_asset_id(obj, str(uuid.uuid5(namespace, obj.name)))
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

# Delivery is gated on a recorded silhouette review of the complete prop set.
if not args.shape_approval:
    print("PHASE7_FRUTIGER_PROPS_BLOCKED " + json.dumps({
        "reason": "shape approval required",
        "source": str(source_path),
        "next": "review, record approval, then run export_approved_asset.py",
    }))
    raise SystemExit(2)
all_meshes = []
for root in (bean_root, plant_root, mouse_root):
    for obj in [root, *root.children_recursive]:
        if obj.type == "MESH" and obj not in all_meshes:
            all_meshes.append(obj)
approval_errors = []
approval_report = check_approval(
    args.shape_approval,
    fingerprint_objects(all_meshes),
    sorted(obj.name for obj in all_meshes),
    "detail",
    approval_errors,
    [value.strip() for value in args.required_views.split(",") if value.strip()],
    [get_asset_id(obj) for obj in all_meshes],
)
if approval_errors:
    print("PHASE7_FRUTIGER_PROPS_BLOCKED " + json.dumps({
        "reason": "approval validation failed",
        "approval": approval_report,
        "errors": approval_errors,
    }))
    raise SystemExit(1)

construction_report = None
if not (args.construction_brief and args.candidate_ledger and args.evidence_report):
    print("PHASE7_FRUTIGER_PROPS_BLOCKED " + json.dumps({
        "reason": "construction brief, candidate ledger and evidence report required",
        "source": str(source_path),
    }))
    raise SystemExit(2)
construction_report = run_construction(
    args.construction_brief, args.candidate_ledger, args.evidence_report,
    str(source_path), [get_asset_id(obj) for obj in all_meshes])
if construction_report["errors"]:
    print("PHASE7_FRUTIGER_PROPS_BLOCKED " + json.dumps({
        "reason": "construction gate failed",
        "construction": construction_report,
        "errors": construction_report["errors"],
    }))
    raise SystemExit(1)

evidence_errors = []
ids_by_name = object_ids(all_meshes, evidence_errors)
expected_ids = [ids_by_name[obj.name] for obj in all_meshes
                if ids_by_name.get(obj.name)]
evidence_recheck = validate_evidence_report(
    args.evidence_report, evidence_errors, [obj.name for obj in all_meshes],
    expected_ids)
if evidence_errors:
    print("PHASE7_FRUTIGER_PROPS_BLOCKED " + json.dumps({
        "reason": "evidence revalidation failed",
        "evidence_recheck": evidence_recheck,
        "errors": evidence_errors,
    }))
    raise SystemExit(1)

exports = {}
for root, filename in (
    (bean_root, "beanbag_001.glb"),
    (plant_root, "plant_001.glb"),
    (mouse_root, "mouse_001.glb"),
):
    path = out_dir / filename
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")
    export_root(root, path)
    meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    exports[root.name] = {
        "glb": str(path),
        "glb_sha256": sha256_file(path),
        "glb_bytes": path.stat().st_size,
        "meshes": len(meshes),
        "bounds_m": {
            "min": [round(min(point[i] for point in points), 6) for i in range(3)],
            "max": [round(max(point[i] for point in points), 6) for i in range(3)],
        },
    }

report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "construction": construction_report,
    "evidence_recheck": evidence_recheck,
    "assets": exports,
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_FRUTIGER_PROPS " + json.dumps(exports))
