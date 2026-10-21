"""Build the shell-only retro clamshell candidate.

This stage deliberately omits the screen, keyboard, trackpad, ports and final
materials. It establishes the primary silhouette, section thickness, lid/base
fit, hinge and handle before detail work.
"""

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
source_path = out_dir / "retro_laptop_shell_source_001.blend"
report_path = out_dir / "build.json"
for path in (source_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

root_collection = bpy.data.collections.new("Shell_RetroLaptop")
scene.collection.children.link(root_collection)
review_collection = bpy.data.collections.new("Shell_Review")
scene.collection.children.link(review_collection)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clay(name, color, roughness=0.55):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    return material


base_clay = clay("Shell_Clay_Base", (0.52, 0.53, 0.55))
lid_clay = clay("Shell_Clay_Lid", (0.66, 0.67, 0.69))
handle_clay = clay("Shell_Clay_Handle", (0.40, 0.41, 0.43))
hinge_clay = clay("Shell_Clay_Hinge", (0.30, 0.31, 0.33))


def superellipse_plan(width, depth, exponent, segments):
    points = []
    for index in range(segments):
        angle = 2.0 * math.pi * index / segments
        c = math.cos(angle)
        s = math.sin(angle)
        x = math.copysign(abs(c) ** (2.0 / exponent), c) * width * 0.5
        y = math.copysign(abs(s) ** (2.0 / exponent), s) * depth * 0.5
        points.append((x, y))
    return points


def loft_shell(name, width, depth, center_y, sections, exponent, mat, parent,
               segments=24, subdivision=2):
    """Closed superellipse loft with quad sides and n-gon caps."""
    plan = superellipse_plan(width, depth, exponent, segments)
    mesh = bpy.data.meshes.new(name + "_Mesh")
    obj = bpy.data.objects.new(name, mesh)
    root_collection.objects.link(obj)
    bm = bmesh.new()
    rings = []
    for z, scale in sections:
        rings.append([
            bm.verts.new((x * scale, center_y + y * scale, z))
            for x, y in plan
        ])
    bm.verts.ensure_lookup_table()
    for lower, upper in zip(rings, rings[1:]):
        for index in range(segments):
            nxt = (index + 1) % segments
            bm.faces.new((lower[index], lower[nxt], upper[nxt], upper[index]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()
    obj.data.materials.append(mat)
    obj.parent = parent
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50.0))
    if subdivision:
        modifier = obj.modifiers.new("Shell_Subdivision", "SUBSURF")
        modifier.levels = subdivision
        modifier.render_levels = subdivision
    obj.select_set(False)
    return obj


def cylinder(name, radius, depth, location, mat, parent, rotation=(0, 0, 0),
             vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
                                        location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_Mesh"
    obj.data.materials.append(mat)
    obj.parent = parent
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40.0))
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    root_collection.objects.link(obj)
    return obj


root = bpy.data.objects.new("Shell_Root", None)
root.empty_display_type = "PLAIN_AXES"
root.empty_display_size = 0.12
root_collection.objects.link(root)

# Base: rounded plan with a soft bulge and a slightly smaller top/bottom.
base_shell = loft_shell(
    "Shell_Base", 0.350, 0.310, 0.0,
    ((0.0, 0.90), (0.004, 1.0), (0.028, 1.0), (0.042, 0.985), (0.046, 0.96)),
    4.5, base_clay, root, segments=24, subdivision=2)

# The rear spine fills the hinge area without a visible box.
cylinder("Shell_Base_Rear_Spine", 0.018, 0.300, (0.0, 0.145, 0.034),
         base_clay, root, rotation=(0, math.radians(90), 0), vertices=40)

hinge = bpy.data.objects.new("Shell_Hinge", None)
hinge.empty_display_type = "ARROWS"
hinge.empty_display_size = 0.06
hinge.location = (0.0, 0.150, 0.054)
root_collection.objects.link(hinge)
hinge.parent = root

# Lid: same plan family, thinner and slightly domed on the outer face.
lid_shell = loft_shell(
    "Shell_Lid", 0.350, 0.300, -0.150,
    ((0.0, 0.96), (0.004, 1.0), (0.018, 1.0), (0.024, 0.97)),
    4.5, lid_clay, hinge, segments=24, subdivision=2)

# Hinge barrel and mounts.
cylinder("Shell_Hinge_Barrel", 0.009, 0.120, (0.0, 0.150, 0.054),
         hinge_clay, root, rotation=(0, math.radians(90), 0), vertices=32)
for sign in (-1, 1):
    cylinder(f"Shell_Hinge_Mount_{sign}", 0.013, 0.018,
             (sign * 0.060, 0.145, 0.050), hinge_clay, root,
             rotation=(0, math.radians(90), 0), vertices=32)
    cylinder(f"Shell_Hinge_Cap_{sign}", 0.011, 0.006,
             (sign * 0.064, 0.150, 0.054), handle_clay, root,
             rotation=(0, math.radians(90), 0), vertices=32)

# Hinge control: 0 degrees closed, 110 degrees open.
hinge.rotation_mode = "XYZ"
hinge["open_angle_deg"] = 110.0
hinge["closed_angle_deg"] = 0.0
hinge["default_angle_deg"] = 110.0
hinge.animation_data_create()
action = bpy.data.actions.new("Shell_Lid_Open")
hinge.animation_data.action = action
hinge.rotation_euler = (0.0, 0.0, 0.0)
hinge.keyframe_insert("rotation_euler", frame=1)
hinge.rotation_euler = (math.radians(-110.0), 0.0, 0.0)
hinge.keyframe_insert("rotation_euler", frame=20)
scene.frame_start = 1
scene.frame_end = 20
scene.frame_set(20)

# A neutral review ground; excluded from shape captures by prefix/isolation.
ground_mat = clay("Shell_Clay_Ground", (0.10, 0.11, 0.12), roughness=0.7)
bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, -0.006))
ground = bpy.context.object
ground.name = "Shell_Review_Ground"
ground.data.materials.append(ground_mat)
for collection in list(ground.users_collection):
    collection.objects.unlink(ground)
review_collection.objects.link(ground)

bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

meshes = [obj for obj in root.children_recursive if obj.type == "MESH"]
points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
minimum = [min(point[i] for point in points) for i in range(3)]
maximum = [max(point[i] for point in points) for i in range(3)]
report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "stage": "silhouette",
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
        "location": [round(value, 6) for value in hinge.location],
    },
    "bounds_m": {
        "min": [round(value, 6) for value in minimum],
        "max": [round(value, 6) for value in maximum],
    },
    "dimensions_m": [round(maximum[i] - minimum[i], 6) for i in range(3)],
    "meshes": [obj.name for obj in meshes],
    "modifiers": {
        obj.name: [modifier.type for modifier in obj.modifiers]
        for obj in meshes if obj.modifiers
    },
    "unverified": [
        "reference silhouette fidelity",
        "lid/base perimeter fit",
        "handle integration",
        "keyboard/trackpad/screen/ports not built at this stage",
    ],
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_RETRO_SHELL " + json.dumps({
    "source": str(source_path),
    "sha256": report["source_sha256"],
    "dimensions": report["dimensions_m"],
    "meshes": len(meshes),
}))
