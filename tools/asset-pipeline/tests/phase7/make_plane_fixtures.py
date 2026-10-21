"""Create a planar UV-density fixture with known 1 m and 0.5 m UV spans."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)


def make_checker():
    size = 512
    image = bpy.data.images.new("Phase7_Plane_Checker", width=size, height=size,
                                alpha=False, float_buffer=False)
    image.colorspace_settings.name = "sRGB"
    yy, xx = np.mgrid[0:size, 0:size]
    values = np.zeros((size, size, 4), dtype=np.float32)
    values[..., :3] = ((xx // 16 + yy // 16) % 2)[..., None]
    values[..., 3] = 1.0
    image.pixels.foreach_set(values.ravel())
    image.pack()
    return image


def build(name, uv_scale):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.0, 0.0, 0.0),
                                     rotation=(math.radians(90.0), 0.0, 0.0))
    plane = bpy.context.object
    plane.name = "Plane"
    plane.data.name = "Plane_Mesh"
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.subdivide(number_cuts=1)
    bpy.ops.object.mode_set(mode="OBJECT")
    material = bpy.data.materials.new("Plane_Mat")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = make_checker()
    material.node_tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    material.node_tree.links.new(texture.outputs["Alpha"], bsdf.inputs["Alpha"])
    material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    plane.data.materials.append(material)
    if uv_scale != 1.0:
        layer = plane.data.uv_layers.active
        for loop in plane.data.loops:
            uv = layer.data[loop.index].uv
            uv[0] *= uv_scale
            uv[1] *= uv_scale
    bpy.ops.object.camera_add(location=(0.0, -3.0, 0.0),
                              rotation=(math.radians(90.0), 0.0, 0.0))
    camera = bpy.context.object
    camera.name = "Phase7_Camera"
    camera.data.name = "Phase7_Camera_Data"
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    bpy.context.scene.camera = camera
    bpy.context.scene.render.resolution_x = 1920
    bpy.context.scene.render.resolution_y = 1080
    out = out_dir / ("%s_001.blend" % name)
    if out.exists():
        raise FileExistsError(out)
    bpy.ops.wm.save_as_mainfile(filepath=str(out))
    return out


files = {
    "uv1": str(build("plane_uv1", 1.0)),
    "uvhalf": str(build("plane_uv_half", 0.5)),
}
report = {
    "files": files,
    "expected_texture_px_per_m": {"uv1": 512.0, "uvhalf": 256.0},
    "camera": {"lens_mm": 50.0, "sensor_width_mm": 36.0,
               "distance_m": 3.0, "viewport": [1920, 1080]},
}
(out_dir / "plane-fixtures.json").write_text(json.dumps(report, indent=2))
print("PHASE7_PLANE_FIXTURES", json.dumps(report, sort_keys=True))
