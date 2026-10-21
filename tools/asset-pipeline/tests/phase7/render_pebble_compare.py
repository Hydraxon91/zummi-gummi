"""Render matched procedural-source and baked-material pebble views."""

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

low = bpy.data.objects["Pebble_Low"]
source_material = bpy.data.materials["Pebble_Source_Mat"]
baked_material = bpy.data.materials["Pebble_Baked_Mat"]

source = low.copy()
source.data = low.data.copy()
source.name = "Pebble_Source_Render"
source.data.name = "Pebble_Source_Render_Mesh"
source.data.materials.clear()
source.data.materials.append(source_material)
bpy.context.scene.collection.objects.link(source)
source.hide_render = True

scene = bpy.context.scene
scene.render.resolution_x = 900
scene.render.resolution_y = 900
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
    scene.cycles.samples = 32
else:
    scene.eevee.taa_render_samples = 32

world = bpy.data.worlds.new("Phase7C_Compare_World")
world.use_nodes = True
background = next(node for node in world.node_tree.nodes
                  if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.055, 0.06, 0.07, 1.0)
background.inputs["Strength"].default_value = 0.55
scene.world = world

camera_data = bpy.data.cameras.new("Phase7C_Compare_Camera")
camera = bpy.data.objects.new("Phase7C_Compare_Camera", camera_data)
scene.collection.objects.link(camera)
camera_data.lens = 60
scene.camera = camera


def point_at(target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


key = bpy.data.objects.new("Phase7C_Key", bpy.data.lights.new("Phase7C_Key", "AREA"))
key.data.energy = 450
key.data.size = 3.0
key.location = (2.8, -2.5, 4.0)
key.rotation_euler = (math.radians(25), 0, math.radians(40))
scene.collection.objects.link(key)
fill = bpy.data.objects.new("Phase7C_Fill", bpy.data.lights.new("Phase7C_Fill", "AREA"))
fill.data.energy = 180
fill.data.size = 4.0
fill.location = (-3.2, 2.0, 2.4)
fill.rotation_euler = (math.radians(-30), 0, math.radians(-120))
scene.collection.objects.link(fill)

views = {
    "top": (0.0, 0.0, 2.3),
    "three_quarter": (1.7, -1.7, 1.25),
}
for view, position in views.items():
    camera.location = position
    point_at((0.0, 0.0, 0.0))
    low.hide_render = True
    source.hide_render = False
    scene.render.filepath = str(out_dir / ("source_%s.png" % view))
    bpy.ops.render.render(write_still=True)
    low.hide_render = False
    source.hide_render = True
    scene.render.filepath = str(out_dir / ("baked_%s.png" % view))
    bpy.ops.render.render(write_still=True)

bpy.data.objects.remove(source, do_unlink=True)
print("PHASE7C_COMPARE_RENDERS", out_dir)
