"""Check Phase 7A downsampling fixtures against known expected values."""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--checker", required=True)
parse.add_argument("--orientation", required=True)
parse.add_argument("--normal", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def load(path, colorspace):
    image = bpy.data.images.load(str(Path(path).resolve()), check_existing=False)
    image.colorspace_settings.name = colorspace
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(height, width, 4)


checker = load(args.checker, "sRGB")
orientation = load(args.orientation, "sRGB")
normal = load(args.normal, "Non-Color")

corner = 64
expected_corners = {
    "top_left": [1.0, 0.0, 0.0],
    "top_right": [0.0, 1.0, 0.0],
    "bottom_left": [0.0, 0.0, 1.0],
    "bottom_right": [1.0, 1.0, 0.0],
}
corners = {
    "top_left": orientation[corner, corner, :3].tolist(),
    "top_right": orientation[corner, -corner, :3].tolist(),
    "bottom_left": orientation[-corner, corner, :3].tolist(),
    "bottom_right": orientation[-corner, -corner, :3].tolist(),
}
normal_vectors = normal[..., :3] * 2.0 - 1.0
normal_lengths = np.sqrt(np.sum(normal_vectors * normal_vectors, axis=2))
checker_values = checker[..., :3]
checker_mean_srgb = float(checker_values.mean())
checker_mean_linear = float(
    np.where(checker_values <= 0.04045, checker_values / 12.92,
             np.power((checker_values + 0.055) / 1.055, 2.4)).mean()
)
expected_srgb = float(1.055 * np.power(0.5, 1.0 / 2.4) - 0.055)
checker_spread = float(checker_values.max() - checker_values.min())
normal_mean_length = float(normal_lengths.mean())
finding = []
if abs(checker_mean_linear - 0.5) > 0.005:
    finding.append("linear-light checker mean is not 0.5 +/- 0.005")
if abs(checker_mean_srgb - expected_srgb) > 0.005:
    finding.append(
        "sRGB checker mean is not %.6f +/- 0.005" % expected_srgb
    )
if checker_spread > 0.005:
    finding.append("checker is not uniform after downsample")
for name, expected in expected_corners.items():
    delta = float(np.max(np.abs(np.array(corners[name]) - np.array(expected))))
    if delta > 0.01:
        finding.append("orientation corner %s differs by %.6f" % (name, delta))
if abs(normal_mean_length - 1.0) > 0.01:
    finding.append("normal mean length is not 1.0 +/- 0.01")
if float(normal[..., 2].mean()) <= 0.5:
    finding.append("normal Z is not positive")
report = {
    "checker_mean_linear": checker_mean_linear,
    "checker_mean_srgb": checker_mean_srgb,
    "checker_expected_srgb": expected_srgb,
    "checker_spread": checker_spread,
    "orientation_corners": corners,
    "normal_mean_length": normal_mean_length,
    "normal_z_mean": float(normal[..., 2].mean()),
    "findings": finding,
    "status": "pass" if not finding else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_DOWNSAMPLE_" + report["status"].upper(),
      json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
