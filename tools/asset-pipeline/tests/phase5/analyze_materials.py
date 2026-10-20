"""Analyze Phase 5 material candidates for dimensions and tiling continuity."""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--out-dir", required=True)
parser.add_argument("files", nargs="+")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)


def load(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return width, height, values.reshape(height, width, 4)


def save_rgb(name, array):
    height, width = array.shape[:2]
    image = bpy.data.images.new(name, width=width, height=height, alpha=False)
    image.colorspace_settings.name = "sRGB"
    rgba = np.ones((height, width, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(array[..., :3], 0.0, 1.0)
    image.pixels.foreach_set(rgba.ravel())
    path = out_dir / (name + ".png")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return path


def seam_metrics(array):
    rgb = array[..., :3]
    height, width = rgb.shape[:2]
    left = rgb[:, 0]
    right = rgb[:, -1]
    top = rgb[0, :]
    bottom = rgb[-1, :]
    edge_x = float(np.mean(np.abs(right - left)))
    edge_y = float(np.mean(np.abs(bottom - top)))
    centre = rgb[:, width // 4:3 * width // 4]
    interior_x = float(np.mean(np.abs(centre[:, 1:] - centre[:, :-1])))
    centre_rows = rgb[height // 4:3 * height // 4, :]
    interior_y = float(np.mean(np.abs(centre_rows[1:, :] - centre_rows[:-1, :])))
    return {
        "edge_difference_x": edge_x,
        "edge_difference_y": edge_y,
        "interior_difference_x": interior_x,
        "interior_difference_y": interior_y,
        "seam_ratio": max(
            edge_x / max(interior_x, 1e-6),
            edge_y / max(interior_y, 1e-6)),
    }


def tiled(array, count=3):
    return np.tile(array, (count, count, 1))


def offset(array):
    shifted = np.roll(array, (array.shape[0] // 2, array.shape[1] // 2), axis=(0, 1))
    return np.tile(shifted, (2, 2, 1))


def fixtures():
    size = 256
    y, x = np.mgrid[0:size, 0:size]
    good = np.zeros((size, size, 4), dtype=np.float32)
    good[..., 0] = 0.35 + 0.08 * np.sin(2 * np.pi * x / size)
    good[..., 1] = 0.55 + 0.08 * np.cos(2 * np.pi * y / size)
    good[..., 2] = 0.70 + 0.05 * np.sin(2 * np.pi * (x + y) / size)
    good[..., 3] = 1.0
    bad = good.copy()
    bad[:, size // 2:, :3] *= 0.35
    good_metrics = seam_metrics(good)
    bad_metrics = seam_metrics(bad)
    save_rgb("fixture_tileable", good)
    save_rgb("fixture_hard_seam", bad)
    return {
        "good": good_metrics,
        "bad": bad_metrics,
        "good_pass": good_metrics["seam_ratio"] <= 1.5,
        "bad_rejected": bad_metrics["seam_ratio"] > 1.5,
    }


report = {"threshold": 1.5, "fixtures": fixtures(), "materials": []}
for file_name in args.files:
    path = Path(file_name)
    width, height, array = load(path)
    metrics = seam_metrics(array)
    tiled_path = save_rgb(path.stem + "_3x3", tiled(array))
    offset_path = save_rgb(path.stem + "_offset", offset(array))
    report["materials"].append({
        "path": str(path),
        "width": width,
        "height": height,
        "dimensions_ok": [width, height] == [1024, 1024],
        "metrics": metrics,
        "metrics_pass": metrics["seam_ratio"] <= 1.5,
        "tiled_preview": str(tiled_path),
        "offset_preview": str(offset_path),
    })
report["status"] = "pass" if (
    report["fixtures"]["good_pass"]
    and report["fixtures"]["bad_rejected"]
    and all(item["dimensions_ok"] and item["metrics_pass"]
            for item in report["materials"])
) else "review"
Path(out_dir / "analysis.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8")
print("PHASE5_ANALYSIS", json.dumps(report, sort_keys=True))
