"""Validate Blender sRGB decoding and PNG row orientation before colour review."""

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--out-dir", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)


def write_png(path, rgb):
    height, width = rgb.shape[:2]
    pixels = np.rint(np.clip(rgb, 0.0, 1.0) * 255.0).astype(np.uint8)
    rows = b"".join(b"\x00" + pixels[row].tobytes() for row in range(height))

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(
        b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b""))


size = 16
image = np.zeros((size, size, 3), dtype=np.float32)
image[:] = [0.5, 0.5, 0.5]
image[0, 0] = [1.0, 0.0, 0.0]
image[-1, -1] = [0.0, 0.0, 1.0]
image[0, -1] = [0.0, 1.0, 0.0]
image[-1, 0] = [1.0, 1.0, 0.0]
path = out_dir / "colour_orientation_fixture.png"
write_png(path, image)

loaded = bpy.data.images.load(str(path), check_existing=False)
loaded.colorspace_settings.name = "sRGB"
values = np.empty(size * size * 4, dtype=np.float32)
loaded.pixels.foreach_get(values)
pixels = values.reshape(size, size, 4)[..., :3]


def corner(name, row, column):
    value = pixels[row, column]
    return {"name": name, "value": [round(float(v), 6) for v in value]}


middle = pixels[size // 2, size // 2]
checks = {
    "sRGB_values": abs(float(middle[0]) - 0.501961) <= 0.01,
    "bottom_up_rows": (
        np.allclose(pixels[0, 0], [1, 1, 0], atol=0.01)
        and np.allclose(pixels[0, size - 1], [0, 0, 1], atol=0.01)
        and np.allclose(pixels[size - 1, 0], [1, 0, 0], atol=0.01)
        and np.allclose(pixels[size - 1, size - 1], [0, 1, 0], atol=0.01)
    ),
}
report = {
    "fixture": str(path),
    "corners_blender_array": [
        corner("array_00", 0, 0),
        corner("array_0_last", 0, size - 1),
        corner("array_last_0", size - 1, 0),
        corner("array_last_last", size - 1, size - 1),
    ],
    "middle": [round(float(v), 6) for v in middle],
    "checks": checks,
    "status": "pass" if all(checks.values()) else "fail",
}
(out_dir / "colour-orientation.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8")
print("COLOUR_ORIENTATION", json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
