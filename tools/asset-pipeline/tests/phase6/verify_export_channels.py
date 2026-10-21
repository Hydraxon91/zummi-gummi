"""Compare embedded GLB PBR channels with the source maps used by Phase 6.

The GLB is decoded directly. Source and embedded PNGs are loaded through Blender
with the same colour-space assumptions, then compared as pixels. For the packed
metallic-roughness texture, G is roughness and B is metallic; factors are applied
before comparison.
"""

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
parse.add_argument("--build", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

build = json.loads(Path(args.build).read_text(encoding="utf-8"))
glb_path = Path(args.glb).resolve()
if not glb_path.is_file():
    raise FileNotFoundError(glb_path)


def read_glb(path):
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("not a GLB: %s" % path)
    version, length = struct.unpack_from("<II", data, 4)
    if version != 2 or length != len(data):
        raise ValueError("unsupported or truncated GLB: %s" % path)
    offset = 12
    doc = None
    binary = None
    while offset + 8 <= len(data):
        chunk_size, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_size]
        offset += chunk_size
        if chunk_type == 0x4E4F534A and doc is None:
            doc = json.loads(chunk.decode("utf-8"))
        elif chunk_type == 0x004E4942 and binary is None:
            binary = chunk
    if doc is None or binary is None:
        raise ValueError("GLB has no JSON or BIN chunk: %s" % path)
    return doc, binary


def image_source(doc, texture_info):
    if not texture_info:
        return None
    index = texture_info.get("index")
    textures = doc.get("textures", [])
    if index is None or index >= len(textures):
        return None
    return textures[index].get("source")


def image_bytes(doc, binary, image_index):
    image = doc["images"][image_index]
    view_index = image.get("bufferView")
    if view_index is None:
        raise ValueError("image %d has no bufferView" % image_index)
    view = doc["bufferViews"][view_index]
    start = int(view.get("byteOffset", 0))
    end = start + int(view["byteLength"])
    return image, binary[start:end]


def load_image(path_or_bytes, name, colorspace):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        temp_dir = tempfile.mkdtemp(prefix="phase6-channel-")
        path = Path(temp_dir) / (name + ".png")
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


def orientation_mae(left, right, channels):
    direct = mae(left, right, channels)
    flipped = mae(left, right[::-1], channels)
    return direct, flipped


def source_path(role):
    item = build["textures"][role]
    return Path(item["path"])


def source_sha(role):
    return build["textures"][role]["sha256"]


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


doc, binary = read_glb(glb_path)
materials = doc.get("materials", [])
images = doc.get("images", [])
textures = doc.get("textures", [])
samplers = doc.get("samplers", [])

findings = []
material_reports = {}
for material in materials:
    name = material.get("name", "unnamed")
    pbr = material.get("pbrMetallicRoughness", {})
    key = "teal" if "teal" in name.lower() else "silver" if "silver" in name.lower() else None
    if key is None:
        findings.append("unexpected material name %s" % name)
        continue
    metallic_factor = float(pbr.get("metallicFactor", 1.0))
    roughness_factor = float(pbr.get("roughnessFactor", 1.0))
    base_factor = pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0])
    base_ref = image_source(doc, pbr.get("baseColorTexture"))
    normal_ref = image_source(doc, material.get("normalTexture"))
    mr_ref = image_source(doc, pbr.get("metallicRoughnessTexture"))
    if base_ref is None or normal_ref is None or mr_ref is None:
        findings.append("%s is missing baseColor, normal or metallicRoughness texture" % name)
        continue

    roles = {}
    for role, index in (("basecolor", base_ref), ("normal", normal_ref),
                        ("metallic_roughness", mr_ref)):
        image, data = image_bytes(doc, binary, index)
        roles[role] = {
            "index": index,
            "name": image.get("name"),
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "image": load_image(data, "%s_%s" % (key, role),
                                "sRGB" if role == "basecolor" else "Non-Color"),
        }

    source_hashes = {}
    for role in ("basecolor", "normal", "roughness", "metallic"):
        role_name = key + "_" + role
        actual = sha256_file(source_path(role_name))
        expected = source_sha(role_name)
        source_hashes[role] = {
            "expected": expected,
            "actual": actual,
            "match": actual == expected,
        }
        if actual != expected:
            findings.append("%s %s source hash does not match build.json" % (name, role))

    src_base = load_image(source_path(key + "_basecolor"), key + "_basecolor_src", "sRGB")
    src_normal = load_image(source_path(key + "_normal"), key + "_normal_src", "Non-Color")
    src_roughness = load_image(source_path(key + "_roughness"),
                               key + "_roughness_src", "Non-Color")
    src_metallic = load_image(source_path(key + "_metallic"),
                              key + "_metallic_src", "Non-Color")

    src_base_px = pixels(src_base)
    src_normal_px = pixels(src_normal)
    src_rough_px = pixels(src_roughness)
    src_metal_px = pixels(src_metallic)
    exp_base_px = pixels(roles["basecolor"]["image"])
    exp_normal_px = pixels(roles["normal"]["image"])
    exp_mr_px = pixels(roles["metallic_roughness"]["image"])

    if exp_base_px.shape[:2] != src_base_px.shape[:2]:
        findings.append("%s baseColor dimensions differ" % name)
    if exp_normal_px.shape[:2] != src_normal_px.shape[:2]:
        findings.append("%s normal dimensions differ" % name)
    if exp_mr_px.shape[:2] != src_rough_px.shape[:2]:
        findings.append("%s metallic-roughness dimensions differ" % name)

    base_direct, base_flip = orientation_mae(src_base_px, exp_base_px, 3)
    normal_direct, normal_flip = orientation_mae(src_normal_px, exp_normal_px, 3)
    exp_rough = exp_mr_px[..., 1:2] * roughness_factor
    exp_metal = exp_mr_px[..., 2:3] * metallic_factor
    rough_direct, rough_flip = orientation_mae(src_rough_px[..., :1], exp_rough, 1)
    metal_direct, metal_flip = orientation_mae(src_metal_px[..., :1], exp_metal, 1)
    expected_metal = None
    if key == "teal":
        expected_metal = np.zeros_like(exp_metal)
        metal_direct, metal_flip = orientation_mae(expected_metal, exp_metal, 1)
    else:
        expected_metal = src_metal_px[..., :1]

    sampler = None
    if pbr.get("baseColorTexture", {}).get("index") is not None:
        texture = textures[pbr["baseColorTexture"]["index"]]
        if texture.get("sampler") is not None:
            sampler = samplers[texture["sampler"]] if texture["sampler"] < len(samplers) else None
    wrap_ok = sampler is None or (
        sampler.get("wrapS", 10497) == 10497 and sampler.get("wrapT", 10497) == 10497)

    if base_direct > 0.01:
        findings.append("%s baseColor MAE %.6f exceeds 0.01" % (name, base_direct))
    if normal_direct > 0.01:
        findings.append("%s normal MAE %.6f exceeds 0.01" % (name, normal_direct))
    if rough_direct > 0.005:
        findings.append("%s roughness MAE %.6f exceeds 0.005" % (name, rough_direct))
    if metal_direct > 0.005:
        findings.append("%s metallic MAE %.6f exceeds 0.005" % (name, metal_direct))
    if not wrap_ok:
        findings.append("%s baseColor sampler does not repeat" % name)
    if material.get("doubleSided", False):
        findings.append("%s is double-sided" % name)
    if material.get("alphaMode", "OPAQUE") != "OPAQUE":
        findings.append("%s is not opaque" % name)
    if len(base_factor) != 4 or any(abs(float(value) - 1.0) > 1e-6 for value in base_factor):
        findings.append("%s baseColorFactor is not neutral" % name)

    material_reports[name] = {
        "source_key": key,
        "metallic_factor": metallic_factor,
        "roughness_factor": roughness_factor,
        "base_color_factor": base_factor,
        "source_hashes": source_hashes,
        "basecolor": {
            **{key_: value for key_, value in roles["basecolor"].items() if key_ != "image"},
            "source": str(source_path(key + "_basecolor")),
            "source_sha256": source_sha(key + "_basecolor"),
            "mae": base_direct,
            "vertical_flip_mae": base_flip,
        },
        "normal": {
            **{key_: value for key_, value in roles["normal"].items() if key_ != "image"},
            "source": str(source_path(key + "_normal")),
            "source_sha256": source_sha(key + "_normal"),
            "mae": normal_direct,
            "vertical_flip_mae": normal_flip,
        },
        "roughness": {
            "channel": "metallicRoughness.G",
            "source": str(source_path(key + "_roughness")),
            "source_sha256": source_sha(key + "_roughness"),
            "mae": rough_direct,
            "vertical_flip_mae": rough_flip,
        },
        "metallic": {
            "channel": "metallicRoughness.B",
            "source": str(source_path(key + "_metallic")),
            "source_sha256": source_sha(key + "_metallic"),
            "expected": "constant 0.0 (painted teal)" if key == "teal" else "source metallic map",
            "mae": metal_direct,
            "vertical_flip_mae": metal_flip,
        },
        "sampler_repeat": wrap_ok,
    }

report = {
    "glb": str(glb_path),
    "glb_sha256": hashlib.sha256(glb_path.read_bytes()).hexdigest(),
    "material_count": len(materials),
    "image_count": len(images),
    "texture_count": len(textures),
    "materials": material_reports,
    "findings": findings,
    "status": "fail" if findings else "pass",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE6_EXPORT_CHANNELS_" + report["status"].upper(),
      json.dumps({key: value for key, value in report.items() if key != "materials"},
                 sort_keys=True))
raise SystemExit(1 if findings else 0)
