"""Add a review-only side camera to a copy of a Phase 3 checkpoint."""

import json
import math
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2:
    raise SystemExit("usage: add_review_camera.py -- <out.blend> <camera-name> [distance]")
out = Path(argv[0])
name = argv[1]
distance = float(argv[2]) if len(argv) > 2 else 2.6
if out.exists():
    raise FileExistsError(out)
bpy.ops.object.camera_add(location=(0, -distance, 0.0))
camera = bpy.context.object
camera.name = name
camera.data.name = name + "_Data"
camera.data.lens = 50.0
camera.data.sensor_width = 36.0
camera.rotation_euler = (math.radians(90.0), 0.0, 0.0)
bpy.context.scene.camera = camera
bpy.ops.wm.save_as_mainfile(filepath=str(out))
print("REVIEW_CAMERA", json.dumps({
    "out": str(out),
    "camera": name,
    "location": [0.0, -distance, 0.0],
    "rotation_degrees": [90.0, 0.0, 0.0],
}, sort_keys=True))
