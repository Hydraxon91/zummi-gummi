"""Render review views for the retro clamshell laptop."""
import sys
from pathlib import Path

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out_dir = Path(args[0])
out_dir.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
camera = scene.camera
if camera is None:
    raise RuntimeError("Scene has no review camera")
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1000
scene.render.resolution_y = 850
old_frame = scene.frame_current
old_location = camera.location.copy()
old_rotation = camera.rotation_euler.copy()
old_lens = camera.data.lens
views = (
    ("open_three_quarter", 20, (0.62, -0.72, 0.48), (0.0, -0.02, 0.13), 55),
    ("open_front", 20, (0.0, -0.88, 0.34), (0.0, -0.02, 0.16), 55),
    ("open_back", 20, (0.55, 0.78, 0.44), (0.0, -0.02, 0.14), 55),
    ("keyboard", 20, (0.24, -0.56, 0.42), (0.0, -0.03, 0.08), 80),
    ("hinge", 20, (0.34, 0.24, 0.27), (0.0, 0.11, 0.08), 90),
    ("half_open", 10, (0.62, -0.72, 0.48), (0.0, -0.02, 0.13), 55),
    ("closed_three_quarter", 1, (0.62, -0.72, 0.48), (0.0, -0.02, 0.10), 55),
)
try:
    for name, frame, location, target, lens in views:
        path = out_dir / f"retro_{name}_001.png"
        if path.exists():
            raise FileExistsError(f"Refusing to overwrite {path}")
        scene.frame_set(frame)
        camera.location = location
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.lens = lens
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print(f"RETRO_LAPTOP_VIEW {path}")
finally:
    scene.frame_set(old_frame)
    camera.location = old_location
    camera.rotation_euler = old_rotation
    camera.data.lens = old_lens
