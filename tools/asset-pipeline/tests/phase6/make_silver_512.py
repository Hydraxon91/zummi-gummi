"""Downsample the accepted silver Phase 6 maps to 512 square.

The teal maps stay at 1024. Base colour is resampled in linear space through
Blender; normal vectors are decoded, averaged, renormalised and encoded again.
No source file is modified.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--basecolor", required=True)
parse.add_argument("--normal", required=True)
parse.add_argument("--roughness", required=True)
parse.add_argument("--metallic", required=True)
parse.add_argument("--out-dir", required=True)
parse.add_argument("--size", type=int, default=512)
parse.add_argument("--legacy-srgb-average", action="store_true",
                   help="Reproduce the old raw sRGB average for a negative control")
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
size = args.size


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load(path, colorspace):
    path = Path(path).resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = colorspace
    return image


def pixels(image):
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(height, width, 4)


def area_average(array):
    height, width = array.shape[:2]
    if height % size or width % size:
        raise ValueError("source %dx%d is not divisible by %d" % (width, height, size))
    factor_y = height // size
    factor_x = width // size
    return array.reshape(size, factor_y, size, factor_x, 4).mean(axis=(1, 3))


def srgb_to_linear(values):
    values = np.asarray(values, dtype=np.float32)
    return np.where(values <= 0.04045, values / 12.92,
                    np.power((values + 0.055) / 1.055, 2.4))


def linear_to_srgb(values):
    values = np.asarray(values, dtype=np.float32)
    return np.where(values <= 0.0031308, values * 12.92,
                    1.055 * np.power(values, 1.0 / 2.4) - 0.055)


def normalise_normal(array):
    vectors = array[..., :3] * 2.0 - 1.0
    lengths = np.sqrt(np.sum(vectors * vectors, axis=2, keepdims=True))
    vectors = vectors / np.maximum(lengths, 1e-6)
    encoded = (vectors + 1.0) * 0.5
    result = array.copy()
    result[..., :3] = encoded
    return result, lengths


def save_png(array, path, colorspace, name):
    path = Path(path)
    if path.exists():
        raise FileExistsError(path)
    image = bpy.data.images.new(name, width=size, height=size, alpha=False,
                                float_buffer=False)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(np.ascontiguousarray(array, dtype=np.float32).ravel())
    image.filepath_raw = str(path.resolve())
    image.file_format = "PNG"
    image.save()
    return image


entries = {}
for role, path, colorspace in (
    ("basecolor", args.basecolor, "sRGB"),
    ("normal", args.normal, "Non-Color"),
    ("roughness", args.roughness, "Non-Color"),
    ("metallic", args.metallic, "Non-Color"),
):
    source = load(path, colorspace)
    source_pixels = pixels(source)
    linear_basecolor = role == "basecolor" and not args.legacy_srgb_average
    if linear_basecolor:
        working = source_pixels.copy()
        working[..., :3] = srgb_to_linear(source_pixels[..., :3])
        average = area_average(working)
        average[..., :3] = np.clip(linear_to_srgb(average[..., :3]), 0.0, 1.0)
    else:
        average = area_average(source_pixels)
    normal_stats = None
    if role == "normal":
        average, lengths = normalise_normal(average)
        normal_stats = {
            "source_mean_length": float(lengths.mean()),
            "source_min_length": float(lengths.min()),
            "source_max_length": float(lengths.max()),
        }
    output_path = out_dir / ("%s_%d.png" % (Path(path).stem, size))
    output = save_png(average, output_path, colorspace,
                      "%s_%d" % (Path(path).stem, size))
    reloaded = bpy.data.images.load(str(output_path.resolve()), check_existing=False)
    reloaded.colorspace_settings.name = colorspace
    reloaded_pixels = pixels(reloaded)
    entries[role] = {
        "source": str(Path(path).resolve()),
        "source_sha256": sha256_file(path),
        "source_size": [source.size[0], source.size[1]],
        "output": str(output_path.resolve()),
        "output_sha256": sha256_file(output_path),
        "output_size": [reloaded.size[0], reloaded.size[1]],
        "linear_light_basecolor": linear_basecolor,
        "source_mean_rgba": [float(value) for value in source_pixels.mean(axis=(0, 1))],
        "output_mean_rgba": [float(value) for value in reloaded_pixels.mean(axis=(0, 1))],
        "output_min_rgba": [float(value) for value in reloaded_pixels.min(axis=(0, 1))],
        "output_max_rgba": [float(value) for value in reloaded_pixels.max(axis=(0, 1))],
        "normal_stats": normal_stats,
    }

report = {
    "size": size,
    "legacy_srgb_average": bool(args.legacy_srgb_average),
    "entries": entries,
    "status": "pass",
}
out_path = out_dir / "report.json"
out_path.write_text(json.dumps(report, indent=2))
print("PHASE6_SILVER_512", json.dumps(report, sort_keys=True))
