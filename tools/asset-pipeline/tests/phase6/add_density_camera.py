"""Add a review-only three-quarter camera to a copy of the Phase 6 crate.

The camera is a verification artifact only; it is never part of the delivery.
"""

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    raise SystemExit(
        "usage: add_density_camera.py -- <out.blend> <camera-name> [distance]")
out = Path(argv[0])
name = argv[1]
distance = float(argv[2]) if len(argv) > 2 else 3.2
if out.exists():
    raise FileExistsError(out)

# Symmetric three-quarter direction, slightly above the crate centre.
direction = Vector((0.62, -0.72, 0.31)).normalized()
location = direction * distance
bpy.ops.object.camera_add(location=location)
camera = bpy.context.object
camera.name = name
camera.data.name = name + "_Data"
camera.data.lens = 50.0
camera.data.sensor_width = 36.0
camera.rotation_euler = (Vector((0.0, 0.0, 0.0)) - location).to_track_quat(
    "-Z", "Y").to_euler()
bpy.context.scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print("PHASE6_DENSITY_CAMERA", json.dumps({
    "out": str(out),
    "camera": name,
    "location": [float(value) for value in location],
    "rotation_degrees": [math.degrees(value) for value in camera.rotation_euler],
    "distance": distance,
    "lens_mm": camera.data.lens,
}, sort_keys=True))
