"""Render a raw or corrected Phase 5 material with its PBR maps.

This is a material preview, not a game or GLB integration check.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument("--basecolor", required=True)
parser.add_argument("--normal", required=True)
parser.add_argument("--roughness", required=True)
parser.add_argument("--metallic", required=True)
parser.add_argument("--out", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_path = Path(args.out)
out_path.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -0.45
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except TypeError:
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except TypeError:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 32
else:
    scene.eevee.taa_render_samples = 32

bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=1.0)
sphere = bpy.context.object
bpy.ops.object.shade_smooth()
material = bpy.data.materials.new("Phase5_PBR_Preview")
material.use_nodes = True
material.use_backface_culling = True
nodes = material.node_tree.nodes
links = material.node_tree.links
bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")


def image_node(path, colorspace):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = colorspace
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    return node


base = image_node(args.basecolor, "sRGB")
rough = image_node(args.roughness, "Non-Color")
metal = image_node(args.metallic, "Non-Color")
normal = image_node(args.normal, "Non-Color")
normal_map = nodes.new("ShaderNodeNormalMap")
links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
links.new(metal.outputs["Color"], bsdf.inputs["Metallic"])
links.new(normal.outputs["Color"], normal_map.inputs["Color"])
links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
bsdf.inputs["IOR"].default_value = 1.45
sphere.data.materials.append(material)

world = bpy.data.worlds.new("Phase5_Preview_World")
world.use_nodes = True
background = next(node for node in world.node_tree.nodes
                  if node.type == "BACKGROUND")
background.inputs["Color"].default_value = (0.08, 0.09, 0.11, 1.0)
background.inputs["Strength"].default_value = 0.35
scene.world = world

camera_data = bpy.data.cameras.new("Phase5_Preview_Camera")
camera = bpy.data.objects.new("Phase5_Preview_Camera", camera_data)
scene.collection.objects.link(camera)
camera_data.lens = 60
camera.location = (2.0, -3.0, 1.35)
direction = Vector((0, 0, 0)) - camera.location
camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
scene.camera = camera

key = bpy.data.objects.new("Phase5_Key", bpy.data.lights.new("Phase5_Key", "AREA"))
key.data.energy = 220
key.data.size = 5.0
key.location = (3.5, -2.0, 4.0)
key.rotation_euler = (math.radians(30), 0, math.radians(50))
scene.collection.objects.link(key)
fill = bpy.data.objects.new("Phase5_Fill", bpy.data.lights.new("Phase5_Fill", "AREA"))
fill.data.energy = 90
fill.data.size = 5.0
fill.location = (-3.5, 1.0, 2.0)
fill.rotation_euler = (math.radians(-40), 0, math.radians(-110))
scene.collection.objects.link(fill)

scene.render.filepath = str(out_path)
bpy.ops.render.render(write_still=True)
print("PHASE5_PBR_PREVIEW", out_path)
