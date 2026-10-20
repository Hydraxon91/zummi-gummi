"""Review Phase 5 basecolour against approved targets and correct colour.

The correction applies bounded luminance modulation and replaces chroma with
the target colour. Raw files are never overwritten.
"""

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("--run-dir", required=True)
parser.add_argument("--palette", required=True)
parser.add_argument("--review", required=True)
parser.add_argument("--out-dir", required=True)
parser.add_argument("--report", required=True)
parser.add_argument("--threshold", type=float, default=0.08)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

run_dir = Path(args.run_dir)
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
palette = json.loads(Path(args.palette).read_text(encoding="utf-8"))
review = json.loads(Path(args.review).read_text(encoding="utf-8"))
summary = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
review_by_key = {
    (entry["material"], entry["seed"]): entry
    for entry in review.get("entries", [])
}


def hex_rgb(value):
    value = value.lstrip("#")
    return np.array([int(value[index:index + 2], 16) / 255.0
                     for index in (0, 2, 4)], dtype=np.float32)


def load_srgb(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    pixels = values.reshape(height, width, 4)
    # Blender exposes byte-image pixels as sRGB values in bottom-up row order.
    return image, width, height, pixels, pixels[..., :3].copy()


def write_png(name, rgb_srgb):
    height, width = rgb_srgb.shape[:2]
    # Source rows are bottom-up; PNG rows are top-down.
    pixels = np.flipud(np.rint(
        np.clip(rgb_srgb, 0.0, 1.0) * 255.0).astype(np.uint8))
    rows = b"".join(b"\x00" + pixels[row].tobytes() for row in range(height))

    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(
        b"IDAT", zlib.compress(rows, 9)) + chunk(b"IEND", b"")
    path = out_dir / (name + ".png")
    path.write_bytes(data)
    return path


reviews = []
for result in summary.get("results", []):
    if result.get("status") != "success":
        continue
    material = result["material"]
    if material not in palette:
        continue
    source = Path(result["files"]["basecolor"]["path"])
    target = hex_rgb(palette[material]["target"])
    image, width, height, linear, srgb = load_srgb(source)
    mean = srgb.reshape(-1, 3).mean(axis=0)
    delta = float(np.linalg.norm(mean - target))
    color_pass = delta <= args.threshold
    review_entry = review_by_key.get((material, result.get("seed")))
    review_allows = bool(
        review_entry
        and review_entry.get("classification") == "colour_only"
        and review.get("inspected")
    )
    corrected_path = None
    corrected_mean = None
    corrected_delta = None
    orientation = None
    if not color_pass and not review_allows:
        colour_status = "review_required"
    elif not color_pass:
        luminance = (
            0.2126 * srgb[..., 0]
            + 0.7152 * srgb[..., 1]
            + 0.0722 * srgb[..., 2]
        )
        mean_luminance = float(luminance.mean())
        modulation = np.clip(luminance / max(mean_luminance, 1e-5), 0.94, 1.06)
        modulation = modulation / max(float(modulation.mean()), 1e-5)
        corrected = target[None, None, :] * modulation[..., None]
        corrected_path = write_png(source.stem + "_corrected", corrected)
        _, _, _, _, corrected_srgb = load_srgb(corrected_path)
        corrected_mean = corrected_srgb.reshape(-1, 3).mean(axis=0)
        corrected_delta = float(np.linalg.norm(corrected_mean - target))
        colour_status = "corrected"
        source_luminance = (
            0.2126 * srgb[..., 0]
            + 0.7152 * srgb[..., 1]
            + 0.0722 * srgb[..., 2]
        )
        corrected_luminance = (
            0.2126 * corrected_srgb[..., 0]
            + 0.7152 * corrected_srgb[..., 1]
            + 0.0722 * corrected_srgb[..., 2]
        )
        direct = float(np.corrcoef(
            source_luminance.ravel(), corrected_luminance.ravel())[0, 1])
        flipped = float(np.corrcoef(
            source_luminance.ravel(), np.flipud(corrected_luminance).ravel())[0, 1])
        orientation = {
            "direct_correlation": round(direct, 6),
            "flipped_correlation": round(flipped, 6),
            "status": "pass" if direct > flipped else "fail",
        }
    else:
        colour_status = "pass"
    luminance = (
        0.2126 * srgb[..., 0]
        + 0.7152 * srgb[..., 1]
        + 0.0722 * srgb[..., 2]
    )
    reviews.append({
        "material": material,
        "seed": result.get("seed"),
        "source": str(source),
        "target": palette[material]["target"],
        "target_note": palette[material].get("note", ""),
        "mean_srgb": [round(float(value), 6) for value in mean],
        "delta_rgb": round(delta, 6),
        "corrected_mean_srgb": (
            [round(float(value), 6) for value in corrected_mean]
            if corrected_mean is not None else None),
        "corrected_delta_rgb": (
            round(corrected_delta, 6) if corrected_delta is not None else None),
        "threshold": args.threshold,
        "colour_status": colour_status,
        "corrected": str(corrected_path) if corrected_path else None,
        "review_classification": (
            review_entry.get("classification") if review_entry else None),
        "review_other_findings": (
            review_entry.get("other_findings", []) if review_entry else []),
        "review_notes": review_entry.get("notes", "") if review_entry else "",
        "orientation": orientation,
        "saved_colour_verified": (
            corrected_delta is not None and corrected_delta <= args.threshold),
        "detail_luminance_std": round(float(luminance.std()), 6),
    })
    print("PHASE5_COLOUR", json.dumps(reviews[-1], sort_keys=True))

report = {
    "run_dir": str(run_dir),
    "palette": str(args.palette),
    "review": str(args.review),
    "threshold": args.threshold,
    "orientation": "Blender pixels are sRGB values in bottom-up rows; corrected PNG rows are flipped to top-down.",
    "note": "Target palette approved for the current pilot. Correction is gated by a recorded colour-only review, applies bounded luminance modulation and is not pure-generation evidence.",
    "reviews": reviews,
    "status": "review" if any(item["colour_status"] != "pass" for item in reviews) else "pass",
}
Path(args.report).write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PHASE5_COLOUR_REPORT", args.report)
