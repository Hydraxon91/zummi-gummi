"""Verify the Phase 7C pebble bake against source and exported GLB images."""

import argparse
import hashlib
import json
import struct
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--glb", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def read_glb(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB")
    offset = 12
    doc = None
    binary = None
    while offset + 8 <= len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + size]
        offset += size
        if kind == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
    return doc, binary


def image_source(doc, info):
    if not info:
        return None
    index = info.get("index")
    if index is None:
        return None
    return doc["textures"][index].get("source")


def image_bytes(doc, binary, index):
    image = doc["images"][index]
    view = doc["bufferViews"][image["bufferView"]]
    start = int(view.get("byteOffset", 0))
    return image, binary[start:start + int(view["byteLength"])]


def load_image(path_or_bytes, name, colorspace):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        temp = tempfile.mkdtemp(prefix="phase7-pebble-")
        path = Path(temp) / (name + ".png")
        path.write_bytes(path_or_bytes)
        image = bpy.data.images.load(str(path), check_existing=False)
        image.pack()
    else:
        image = bpy.data.images.load(str(path_or_bytes), check_existing=False)
    image.colorspace_settings.name = colorspace
    return image


def pixels(image):
    width, height = image.size
    values = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(height, width, 4)


def mae(left, right, channels):
    return float(np.mean(np.abs(left[..., :channels] - right[..., :channels])))


def orientation(left, right, channels):
    direct = mae(left, right, channels)
    flipped = mae(left, right[::-1], channels)
    return direct, flipped


def sample(array, uv):
    size = array.shape[0]
    x = min(size - 1, max(0, int(round(uv[0] * (size - 1)))))
    y = min(size - 1, max(0, int(round(uv[1] * (size - 1)))))
    return array[y, x]


low = bpy.data.objects.get("Pebble_Low")
if low is None:
    raise RuntimeError("Pebble_Low not found")
baked_names = {
    "albedo": "Pebble_Albedo_1024",
    "roughness": "Pebble_Roughness_1024",
    "metallic": "Pebble_Metallic_1024",
    "normal": "Pebble_Normal_1024",
}
baked = {role: pixels(bpy.data.images[name]) for role, name in baked_names.items()}
source = {
    "albedo": pixels(bpy.data.images["Source_Albedo"]),
    "roughness": pixels(bpy.data.images["Source_Roughness"]),
    "metallic": pixels(bpy.data.images["Source_Metallic"]),
}
uv_layer = low.data.uv_layers.active
source_errors = {"albedo": [], "roughness": [], "metallic": []}
for loop in low.data.loops:
    uv = tuple(uv_layer.data[loop.index].uv)
    source_errors["albedo"].append(
        float(np.abs(sample(source["albedo"], uv)[:3]
                     - sample(baked["albedo"], uv)[:3]).mean()))
    source_errors["roughness"].append(
        abs(float(sample(source["roughness"], uv)[0])
            - float(sample(baked["roughness"], uv)[0])))
    source_errors["metallic"].append(
        abs(float(sample(source["metallic"], uv)[0])
            - float(sample(baked["metallic"], uv)[0])))

doc, binary = read_glb(args.glb)
material = (doc.get("materials") or [{}])[0]
pbr = material.get("pbrMetallicRoughness", {})
refs = {
    "albedo": image_source(doc, pbr.get("baseColorTexture")),
    "metallic_roughness": image_source(doc, pbr.get("metallicRoughnessTexture")),
    "normal": image_source(doc, material.get("normalTexture")),
}
exported = {}
for role, index in refs.items():
    if index is None:
        continue
    image, data = image_bytes(doc, binary, index)
    exported[role] = {
        "name": image.get("name"),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "image": load_image(data, role, "sRGB" if role == "albedo" else "Non-Color"),
    }

findings = []
albedo_direct = albedo_flip = roughness_direct = metallic_direct = None
normal_direct = normal_flip = None
if not {"albedo", "metallic_roughness", "normal"} <= set(exported):
    findings.append("GLB is missing a required texture")
else:
    albedo_direct, albedo_flip = orientation(
        baked["albedo"], pixels(exported["albedo"]["image"]), 3)
    mr = pixels(exported["metallic_roughness"]["image"])
    roughness_direct = mae(baked["roughness"][..., :1], mr[..., 1:2], 1)
    metallic_direct = mae(baked["metallic"][..., :1], mr[..., 2:3], 1)
    normal_direct, normal_flip = orientation(
        baked["normal"], pixels(exported["normal"]["image"]), 3)
    if albedo_direct > 0.02:
        findings.append("exported albedo differs from baked albedo")
    if roughness_direct > 0.01:
        findings.append("exported roughness differs from baked roughness")
    if metallic_direct > 0.01:
        findings.append("exported metallic differs from baked metallic")
    if normal_direct > 0.02:
        findings.append("exported normal differs from baked normal")

normal = baked["normal"]
normal_vectors = normal[..., :3] * 2.0 - 1.0
normal_lengths = np.sqrt(np.sum(normal_vectors * normal_vectors, axis=2))
normal_rg_std = float(np.std(normal[..., :2]))
if float(normal[..., 2].mean()) <= 0.5:
    findings.append("normal Z is not positive")
if normal_rg_std < 0.01:
    findings.append("normal map is effectively flat")
if float(np.mean(source_errors["albedo"])) > 0.02:
    findings.append("albedo source-to-bake MAE exceeds 0.02")
if float(np.mean(source_errors["roughness"])) > 0.02:
    findings.append("roughness source-to-bake MAE exceeds 0.02")
if float(np.mean(source_errors["metallic"])) > 0.02:
    findings.append("metallic source-to-bake MAE exceeds 0.02")

report = {
    "glb": str(Path(args.glb).resolve()),
    "glb_sha256": hashlib.sha256(Path(args.glb).read_bytes()).hexdigest(),
    "baked_images": {role: name for role, name in baked_names.items()},
    "exported_images": {
        role: {key: value for key, value in item.items() if key != "image"}
        for role, item in exported.items()
    },
    "source_to_baked_mae": {
        "albedo": float(np.mean(source_errors["albedo"])),
        "roughness": float(np.mean(source_errors["roughness"])),
        "metallic": float(np.mean(source_errors["metallic"])),
    },
    "baked_to_export_mae": {
        "albedo": albedo_direct,
        "albedo_vertical_flip": albedo_flip,
        "roughness": roughness_direct,
        "metallic": metallic_direct,
        "normal": normal_direct,
        "normal_vertical_flip": normal_flip,
    },
    "normal_b_mean": float(normal[..., 2].mean()),
    "normal_b_min": float(normal[..., 2].min()),
    "normal_rg_std": normal_rg_std,
    "normal_length_mean": float(normal_lengths.mean()),
    "findings": findings,
    "status": "pass" if not findings else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_PEBBLE_CHANNELS_" + report["status"].upper(),
      json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
