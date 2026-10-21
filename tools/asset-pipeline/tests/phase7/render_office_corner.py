"""Render review views for the Phase 7E office-corner benchmark."""

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--samples", type=int, default=48)
parse.add_argument("--width", type=int, default=1000)
parse.add_argument("--height", type=int, default=850)
parse.add_argument("--hide-collections", default="")
parse.add_argument("--views", default="all")
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
hidden = []
for name in (value for value in args.hide_collections.split(",") if value):
    collection = bpy.data.collections.get(name)
    if collection is None:
        raise RuntimeError(f"Missing collection {name}")
    collection.hide_render = True
    collection.hide_viewport = True
    hidden.append(name)
scene = bpy.context.scene
camera = scene.camera
if camera is None:
    raise RuntimeError("Scene has no review camera")
scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.render.resolution_x = args.width
scene.render.resolution_y = args.height
scene.render.resolution_percentage = 100

views = (
    ("interior", (5.0, -6.0, 4.2), (0.0, 0.45, 1.15), 5.9),
    ("exterior", (4.0, 6.0, 3.7), (0.0, 0.5, 1.25), 5.9),
    ("window", (1.9, -1.6, 2.3), (0.0, 1.59, 1.6), 2.8),
    ("lamp", (1.7, -2.2, 1.8), (0.30, 0.55, 1.0), 1.35),
    ("books", (1.0, -2.8, 2.4), (-1.55, -0.35, 1.0), 2.35),
    ("chair", (1.55, -2.45, 1.85), (-0.05, -0.10, 0.62), 1.95),
    ("laptop", (1.20, -1.90, 1.80), (-0.25, 1.10, 0.95), 1.55),
    ("beanbag", (1.95, -1.85, 1.55), (0.95, 0.25, 0.25), 1.45),
    ("plant", (2.20, -1.55, 1.45), (1.35, 1.15, 0.32), 1.05),
    ("chair_side", (1.55, -0.90, 0.95), (-0.05, 0.60, 0.55), 1.65),
    ("chair_under", (1.20, -1.45, 0.50), (-0.05, 0.52, 0.30), 1.15),
    ("rug", (1.75, -2.15, 2.55), (-0.05, 0.28, 0.24), 2.55),
    ("fan", (2.20, -2.55, 3.10), (0.10, 0.42, 2.28), 1.80),
    ("top", (0.0, -0.10, 6.00), (0.0, 0.09, 0.0), 5.8),
)
if args.views != "all":
    wanted = {value for value in args.views.split(",") if value}
    unknown = wanted - {name for name, *_ in views}
    if unknown:
        raise RuntimeError(f"Unknown views: {sorted(unknown)}")
    views = tuple(view for view in views if view[0] in wanted)

loc = camera.location.copy()
rot = camera.rotation_euler.copy()
scale = camera.data.ortho_scale
camera.data.type = "ORTHO"
try:
    for name, location, target, ortho_scale in views:
        path = out_dir / f"7e_{name}_001.png"
        if path.exists():
            raise FileExistsError(f"Refusing to overwrite {path}")
        camera.location = location
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = ortho_scale
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        print(f"PHASE7_OFFICE_VIEW {path}")
finally:
    camera.location = loc
    camera.rotation_euler = rot
    camera.data.ortho_scale = scale
