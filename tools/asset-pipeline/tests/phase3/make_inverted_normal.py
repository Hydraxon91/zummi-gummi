"""Create a deliberately inverted normal-map fixture from a baked PNG."""

import argparse
import sys
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("source")
parser.add_argument("out")
parser.add_argument("--mode", choices=("blue", "rg"), default="blue")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
source = Path(args.source)
out = Path(args.out)
image = bpy.data.images.load(str(source), check_existing=False)
width, height = image.size
values = np.empty(width * height * 4, dtype=np.float32)
image.pixels.foreach_get(values)
values = values.reshape(height, width, 4)
if args.mode == "blue":
    # A forward tangent-space normal has positive Z (blue > 0.5).
    values[..., 2] = 1.0 - values[..., 2]
else:
    # OpenGL/DirectX-style tangent-space X/Y convention flip.
    values[..., 0] = 1.0 - values[..., 0]
    values[..., 1] = 1.0 - values[..., 1]
inverted = bpy.data.images.new(
    "Inverted_Normal", width=width, height=height, alpha=True)
inverted.colorspace_settings.name = "Non-Color"
inverted.pixels.foreach_set(values.ravel())
inverted.filepath_raw = str(out)
inverted.file_format = "PNG"
inverted.save()
print("INVERTED_NORMAL", args.mode, out)
