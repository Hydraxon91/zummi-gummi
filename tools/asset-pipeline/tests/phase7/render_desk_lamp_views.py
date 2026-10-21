"""Render review and interface views for the Phase 7D desk lamp."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--out-dir", required=True)
parser.add_argument("--engine")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)

scene = bpy.context.scene
scene.render.resolution_x = 1100
scene.render.resolution_y = 1100
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
if args.engine:
    scene.render.engine = args.engine
else:
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except TypeError:
            scene.render.engine = "CYCLES"
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 32
else:
    scene.eevee.taa_render_samples = 32

world = bpy.data.worlds.new("Phase7D_Review_World")
world.use_nodes = True
background = next(node for node in world.node_tree.nodes
                  if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.055, 0.06, 0.07, 1.0)
background.inputs["Strength"].default_value = 0.55
scene.world = world

camera_data = bpy.data.cameras.new("Phase7D_Review_Camera")
camera = bpy.data.objects.new("Phase7D_Review_Camera", camera_data)
scene.collection.objects.link(camera)
camera_data.lens = 58
scene.camera = camera


def point_at(target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


key = bpy.data.objects.new("Phase7D_Key", bpy.data.lights.new("Phase7D_Key", "AREA"))
key.data.energy = 500
key.data.size = 3.0
key.location = (2.6, -2.4, 3.5)
key.rotation_euler = (math.radians(25), 0, math.radians(40))
scene.collection.objects.link(key)
fill = bpy.data.objects.new("Phase7D_Fill", bpy.data.lights.new("Phase7D_Fill", "AREA"))
fill.data.energy = 180
fill.data.size = 4.0
fill.location = (-3.0, 1.8, 2.3)
fill.rotation_euler = (math.radians(-30), 0, math.radians(-120))
scene.collection.objects.link(fill)

views = {
    "overall": ((0.58, -0.72, 0.64), (0.0, 0.0, 0.28), 58),
    "base_stem": ((0.22, -0.30, 0.12), (0.0, 0.0, 0.07), 70),
    "pivot_head": ((0.34, -0.38, 0.56), (0.0, 0.0, 0.455), 68),
    "reflector_open": ((0.0, 0.34, 0.455), (0.0, 0.105, 0.455), 62),
    "bottom_pads": ((0.22, -0.22, -0.10), (0.0, 0.0, 0.012), 68),
}
for name, (position, target, lens) in views.items():
    camera.location = position
    camera_data.lens = lens
    point_at(target)
    scene.render.filepath = str(out_dir / ("material_%s.png" % name))
    bpy.ops.render.render(write_still=True)

neutral = bpy.data.materials.new("Phase7D_Neutral_Review")
neutral.use_nodes = True
bsdf = next(node for node in neutral.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (0.18, 0.18, 0.18, 1.0)
bsdf.inputs["Roughness"].default_value = 0.62
bsdf.inputs["Metallic"].default_value = 0.0
bpy.context.view_layer.material_override = neutral
for name, position, target, lens in (
    ("overall", (0.58, -0.72, 0.64), (0.0, 0.0, 0.28), 58),
    ("base_stem", (0.22, -0.30, 0.12), (0.0, 0.0, 0.07), 70),
    ("pivot_head", (0.34, -0.38, 0.56), (0.0, 0.0, 0.455), 68),
):
    camera.location = position
    camera_data.lens = lens
    point_at(target)
    scene.render.filepath = str(out_dir / ("neutral_%s.png" % name))
    bpy.ops.render.render(write_still=True)
bpy.context.view_layer.material_override = None

print("PHASE7_DESK_RENDERS", out_dir)
