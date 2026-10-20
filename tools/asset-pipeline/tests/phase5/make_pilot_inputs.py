"""Create the Phase 5 project-authored canvas and style reference.

The style reference is an existing project screenshot. The canvas is a neutral
empty edit target, not a UV layout or third-party image.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--out-dir", required=True)
parser.add_argument("--style-source", required=True)
parser.add_argument("--size", type=int, default=1024)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
size = args.size

canvas_path = out_dir / "canvas_1024.png"
style_path = out_dir / "style_reference_1024.png"
if canvas_path.exists() or style_path.exists():
    raise FileExistsError("Refusing to overwrite existing Phase 5 input images")
canvas = bpy.data.images.new("Phase5_Canvas", width=size, height=size, alpha=False)
pixels = np.empty((size, size, 4), dtype=np.float32)
pixels[..., :3] = 0.62
pixels[..., 3] = 1.0
canvas.pixels.foreach_set(pixels.ravel())
canvas.filepath_raw = str(canvas_path)
canvas.file_format = "PNG"
canvas.save()
canvas.colorspace_settings.name = "sRGB"

style_source = Path(args.style_source)
style_image = bpy.data.images.load(str(style_source), check_existing=False)
style_image.scale(size, size)
style_image.filepath_raw = str(style_path)
style_image.file_format = "PNG"
style_image.save()
style_image.colorspace_settings.name = "sRGB"

def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = {
    "canvas": {
        "path": str(canvas_path),
        "sha256": sha256(canvas_path),
        "size": [size, size],
        "note": "Neutral empty edit target; not a UV layout.",
    },
    "style_reference": {
        "path": str(style_path),
        "sha256": sha256(style_path),
        "size": [size, size],
        "source": str(style_source),
        "source_sha256": sha256(style_source),
        "rights": "Project-authored game screenshot; reference only.",
    },
}
(out_dir / "inputs.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("PHASE5_INPUTS", json.dumps(manifest, sort_keys=True))
