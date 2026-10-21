"""Generate Phase 7A known-good and deliberately failing fixtures."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
size = 1024


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_image(name, array, colorspace):
    path = out_dir / (name + ".png")
    if path.exists():
        raise FileExistsError(path)
    height, width = array.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=False,
                                float_buffer=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(np.ascontiguousarray(array, dtype=np.float32).ravel())
    image.filepath_raw = str(path.resolve())
    image.file_format = "PNG"
    image.save()
    return path


def rgba(rgb):
    array = np.zeros((size, size, 4), dtype=np.float32)
    array[..., :3] = rgb
    array[..., 3] = 1.0
    return array


# Two-by-two black/white checker: correct linear area-average -> uniform 0.5.
yy, xx = np.mgrid[0:size, 0:size]
checker = np.zeros((size, size, 4), dtype=np.float32)
checker[..., 0] = ((xx + yy) % 2).astype(np.float32)
checker[..., 1] = checker[..., 0]
checker[..., 2] = checker[..., 0]
checker[..., 3] = 1.0

# Asymmetric quadrant marker for orientation checks.
orientation = rgba((1.0, 1.0, 1.0))
orientation[:size // 2, :size // 2, :3] = (1.0, 0.0, 0.0)
orientation[:size // 2, size // 2:, :3] = (0.0, 1.0, 0.0)
orientation[size // 2:, :size // 2, :3] = (0.0, 0.0, 1.0)
orientation[size // 2:, size // 2:, :3] = (1.0, 1.0, 0.0)

normal = rgba((0.6, 0.7, 0.9472135901))
normal_gradient = np.zeros((size, size, 4), dtype=np.float32)
normal_gradient[..., 3] = 1.0
normal_gradient[:size // 2, :, :3] = (0.5, 0.5, 1.0)
normal_gradient[size // 2:, :, :3] = (0.6, 0.7, 0.9472135901)
flipped_normal = normal_gradient[::-1].copy()

roughness = rgba((0.5, 0.5, 0.5))
metallic = rgba((1.0, 1.0, 1.0))

files = {
    "checker_basecolor": write_image("srgb_checker", checker, "sRGB"),
    "orientation_basecolor": write_image("orientation_quadrants", orientation, "sRGB"),
    "normal_tilt": write_image("normal_tilt", normal, "Non-Color"),
    "normal_gradient": write_image("normal_gradient", normal_gradient, "Non-Color"),
    "flipped_normal": write_image("flipped_normal", flipped_normal, "Non-Color"),
    "dummy_roughness": write_image("dummy_roughness", roughness, "Non-Color"),
    "dummy_metallic": write_image("dummy_metallic", metallic, "Non-Color"),
}

report = {
    "size": size,
    "expected": {
        "checker_linear_mean": 0.5,
        "checker_encoded_srgb_mean": 0.7353569831,
        "orientation_corners_linear": {
            "top_left": [1.0, 0.0, 0.0],
            "top_right": [0.0, 1.0, 0.0],
            "bottom_left": [0.0, 0.0, 1.0],
            "bottom_right": [1.0, 1.0, 0.0],
        },
        "normal_length": 1.0,
    },
    "files": {
        key: {
            "path": str(path.resolve()),
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
            "dimensions": [size, size],
        }
        for key, path in files.items()
    },
}
(out_dir / "fixtures.json").write_text(json.dumps(report, indent=2))
print("PHASE7_FIXTURES", json.dumps(report, sort_keys=True))
