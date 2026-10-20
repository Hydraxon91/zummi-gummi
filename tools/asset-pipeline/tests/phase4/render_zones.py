"""Render review views of the Phase 4 material-zone checkpoint.

The checkpoint is opened read-only; temporary camera and lights are not saved.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--out-dir", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)

crate = bpy.data.objects["Crate_Body"]
scene = bpy.context.scene
scene.render.resolution_x = 800
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "CYCLES"
if scene.render.engine == "CYCLES":
    scene.cycles.samples = 16
else:
    scene.eevee.taa_render_samples = 16

world = bpy.data.worlds.new("Phase4_Review_World")
world.use_nodes = True
background = next(node for node in world.node_tree.nodes
                  if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.06, 0.07, 0.09, 1.0)
background.inputs["Strength"].default_value = 0.45
scene.world = world

camera_data = bpy.data.cameras.new("Phase4_Review_Camera")
camera = bpy.data.objects.new("Phase4_Review_Camera", camera_data)
scene.collection.objects.link(camera)
camera_data.lens = 55
scene.camera = camera


def point_at(target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


key = bpy.data.objects.new("Phase4_Key", bpy.data.lights.new("Phase4_Key", "AREA"))
key.data.energy = 650
key.data.size = 4.0
key.location = (3.5, -3.0, 5.0)
key.rotation_euler = (math.radians(28), 0, math.radians(42))
scene.collection.objects.link(key)
fill = bpy.data.objects.new("Phase4_Fill", bpy.data.lights.new("Phase4_Fill", "AREA"))
fill.data.energy = 250
fill.data.size = 5.0
fill.location = (-4.0, 2.5, 3.0)
fill.rotation_euler = (math.radians(-32), 0, math.radians(-120))
scene.collection.objects.link(fill)

views = {
    "front": (0.0, -2.6, 0.35),
    "back": (0.0, 2.6, 0.35),
    "left": (-2.6, 0.0, 0.35),
    "right": (2.6, 0.0, 0.35),
    "three_quarter": (2.0, -2.0, 1.55),
    "top": (0.0, 0.0, 3.0),
}
for name, position in views.items():
    camera.location = position
    point_at((0.0, 0.0, 0.0))
    scene.render.filepath = str(out_dir / ("zone_%s.png" % name))
    bpy.ops.render.render(write_still=True)
print("PHASE4_ZONE_RENDERS", out_dir)
