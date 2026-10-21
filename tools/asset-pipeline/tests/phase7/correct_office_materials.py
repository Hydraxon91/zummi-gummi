"""Colour-correct the Phase 7E scene materials to the approved office palette.

Only base colour is rebalanced. Normal, roughness and metallic channels remain
the raw generated maps. The operation preserves texture contrast and tileability.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--wall", required=True)
parse.add_argument("--floor", required=True)
parse.add_argument("--desk", required=True)
parse.add_argument("--chair", required=True)
parse.add_argument("--cushion", required=True)
parse.add_argument("--rug", required=True)
parse.add_argument("--wallpaper", required=True)
parse.add_argument("--parquet", required=True)
parse.add_argument("--out-dir", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
corrected_dir = out_dir / "corrected"
corrected_dir.mkdir(parents=True, exist_ok=True)
manifest_path = out_dir / "office-materials-final.json"
if manifest_path.exists():
    raise FileExistsError(f"Refusing to overwrite {manifest_path}")

# sRGB target means; generated maps keep their own grain/contrast.
targets = {
    "office_wall_plaster": "#DAD2C2",
    "office_floor_concrete": "#B9B3A8",
    "office_desk_walnut": "#734736",
    "office_chair_oak": "#8D5F3C",
    "office_cushion_red": "#9B3A34",
    "office_rug_grey": "#8F8D88",
    "office_wall_wallpaper": "#D6BF99",
    "office_floor_parquet": "#B4783A",
}
source_base = {
    "office_wall_plaster": Path(args.wall),
    "office_floor_concrete": Path(args.floor),
    "office_desk_walnut": Path(args.desk),
    "office_chair_oak": Path(args.chair),
    "office_cushion_red": Path(args.cushion),
    "office_rug_grey": Path(args.rug),
    "office_wall_wallpaper": Path(args.wallpaper),
    "office_floor_parquet": Path(args.parquet),
}


def hex_srgb(value):
    value = value.lstrip("#")
    return np.array([int(value[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float64)


report = {"materials": {}}
for material_id, source_path in source_base.items():
    image = bpy.data.images.load(str(source_path.resolve()), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    pixels = np.array(image.pixels[:], dtype=np.float64).reshape(-1, 4)
    source_mean = pixels[:, :3].mean(axis=0)
    target = hex_srgb(targets[material_id])
    scale = target / np.maximum(source_mean, 1e-6)
    pixels[:, :3] = np.clip(pixels[:, :3] * scale, 0.0, 1.0)
    image.pixels = pixels.ravel()
    target_path = corrected_dir / (source_path.stem.replace("_basecolor", "_basecolor_corrected") + ".png")
    if target_path.exists():
        raise FileExistsError(f"Refusing to overwrite {target_path}")
    image.filepath_raw = str(target_path)
    image.file_format = "PNG"
    image.save()
    image.colorspace_settings.name = "sRGB"
    check = np.array(image.pixels[:], dtype=np.float64).reshape(-1, 4)[:, :3].mean(axis=0)
    report["materials"][material_id] = {
        "source_basecolor": str(source_path),
        "corrected_basecolor": str(target_path),
        "channels": {
            "basecolor": str(target_path),
            "normal": str(source_path.with_name(source_path.name.replace("_basecolor", "_normal"))),
            "roughness": str(source_path.with_name(source_path.name.replace("_basecolor", "_roughness"))),
            "metallic": str(source_path.with_name(source_path.name.replace("_basecolor", "_metallic"))),
        },
        "source_mean_srgb": source_mean.tolist(),
        "target_mean_srgb": target.tolist(),
        "scale": scale.tolist(),
        "corrected_mean_srgb_after_reload": check.tolist(),
    }

manifest = json.loads(json.dumps(report))
manifest["workflow"] = "stablematerials + per-channel basecolour mean correction"
manifest["targets_hex"] = targets
manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("PHASE7_OFFICE_CORRECTED", manifest_path)
