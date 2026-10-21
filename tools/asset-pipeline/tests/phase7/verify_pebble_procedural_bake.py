"""Verify the Phase 7C procedural pebble bake against source fields and GLB."""

import argparse
import hashlib
import json
import math
import struct
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
import pebble_fields as fields

parse = argparse.ArgumentParser()
parse.add_argument("--glb")
parse.add_argument("--out")
parse.add_argument("--self-test", action="store_true")
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
        temp = tempfile.mkdtemp(prefix="phase7-pebble-procedural-")
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
    return (mae(left, right, channels), mae(left, right[::-1], channels))


def sample_bilinear(array, uv):
    height, width = array.shape[:2]
    x = min(width - 1.0, max(0.0, float(uv[0]) * (width - 1)))
    y = min(height - 1.0, max(0.0, float(uv[1]) * (height - 1)))
    x0 = int(math.floor(x))
    y0 = int(math.floor(y))
    x1 = min(width - 1, x0 + 1)
    y1 = min(height - 1, y0 + 1)
    fx = x - x0
    fy = y - y0
    top = array[y0, x0] * (1.0 - fx) + array[y0, x1] * fx
    bottom = array[y1, x0] * (1.0 - fx) + array[y1, x1] * fx
    return top * (1.0 - fy) + bottom * fy


def srgb_to_linear(values):
    values = np.asarray(values, dtype=np.float32)
    return np.where(
        values <= 0.04045,
        values / 12.92,
        ((values + 0.055) / 1.055) ** 2.4).astype(np.float32)


def linear_to_srgb(values):
    values = np.asarray(values, dtype=np.float32)
    return np.where(
        values <= 0.0031308,
        values * 12.92,
        1.055 * np.power(np.maximum(values, 0.0), 1.0 / 2.4) - 0.055
    ).astype(np.float32)


def run_self_test():
    size = 32
    samples = []
    arrays = {
        "albedo": np.zeros((size, size, 4), dtype=np.float32),
        "roughness": np.zeros((size, size, 4), dtype=np.float32),
        "metallic": np.zeros((size, size, 4), dtype=np.float32),
    }
    for y in range(size):
        for x in range(size):
            u = (x + 0.5) / size
            v = (y + 0.5) / size
            position = Vector((u * 0.8 - 0.4, v * 0.5 - 0.25, 0.08))
            colour, rough, metal = fields.sample_fields(position)
            samples.append({"position": position, "uv": Vector((u, v))})
            arrays["albedo"][y, x, :3] = linear_to_srgb(colour)
            arrays["albedo"][y, x, 3] = 1.0
            arrays["roughness"][y, x, :] = (rough, rough, rough, 1.0)
            arrays["metallic"][y, x, :] = (metal, metal, metal, 1.0)
    pass_errors = source_errors(samples, arrays)
    flipped = {
        key: value[::-1].copy() for key, value in arrays.items()
    }
    flipped_errors = source_errors(samples, flipped)
    swapped = {key: value.copy() for key, value in arrays.items()}
    swapped["albedo"][..., [0, 2]] = swapped["albedo"][..., [2, 0]]
    swapped_errors = source_errors(samples, swapped)
    encoded_errors = source_errors(samples, arrays, decode_srgb=False)
    checks = {
        "direct_albedo": pass_errors["albedo"]["mean"],
        "flipped_albedo": flipped_errors["albedo"]["mean"],
        "swapped_albedo": swapped_errors["albedo"]["mean"],
        "encoded_albedo": encoded_errors["albedo"]["mean"],
    }
    findings = []
    if checks["direct_albedo"] > 0.02:
        findings.append("direct synthetic field check did not pass")
    if checks["flipped_albedo"] <= 0.02:
        findings.append("vertical flip was not detected")
    if checks["swapped_albedo"] <= 0.02:
        findings.append("channel swap was not detected")
    if checks["encoded_albedo"] <= 0.02:
        findings.append("sRGB decode omission was not detected")
    result = {"checks": checks, "findings": findings,
              "status": "pass" if not findings else "fail"}
    print("PHASE7_PROCEDURAL_NEGATIVES_" + result["status"].upper(),
          json.dumps(result, sort_keys=True))
    return 0 if result["status"] == "pass" else 1


def triangle_samples(low):
    uv_data = low.data.uv_layers.active.data
    vertices = low.data.vertices
    for triangle in low.data.loop_triangles:
        loops = list(triangle.loops)
        points = [vertices[low.data.loops[index].vertex_index].co
                  for index in loops]
        uvs = [uv_data[index].uv for index in loops]
        for weights in ((1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0),
                        (0.2, 0.4, 0.4),
                        (0.4, 0.2, 0.4)):
            point = Vector((0.0, 0.0, 0.0))
            uv = Vector((0.0, 0.0))
            for weight, position, texel in zip(weights, points, uvs):
                point += position * weight
                uv += texel * weight
            yield point, uv, triangle.index


def seam_samples(low):
    uv_data = low.data.uv_layers.active.data
    vertices = low.data.vertices
    triangles = []
    for triangle in low.data.loop_triangles:
        nodes = []
        for loop_index in triangle.loops:
            vertex_index = low.data.loops[loop_index].vertex_index
            nodes.append({
                "vertex": vertex_index,
                "uv": uv_data[loop_index].uv.copy(),
                "position": vertices[vertex_index].co.copy(),
            })
        triangles.append(nodes)
    edges = {}
    for triangle_index, nodes in enumerate(triangles):
        for corner in range(3):
            left = nodes[corner]
            right = nodes[(corner + 1) % 3]
            opposite = nodes[(corner + 2) % 3]
            key = tuple(sorted((left["vertex"], right["vertex"])))
            edges.setdefault(key, []).append(
                (triangle_index, left, right, opposite))
    samples = []
    for key, entries in edges.items():
        if len(entries) != 2:
            continue

        def uv_for(entry, vertex):
            for node in (entry[1], entry[2]):
                if node["vertex"] == vertex:
                    return tuple(node["uv"])
            return None

        first_uv = [uv_for(entries[0], vertex) for vertex in key]
        second_uv = [uv_for(entries[1], vertex) for vertex in key]
        if any(value is None for value in first_uv + second_uv):
            continue
        if all(abs(left[0] - right[0]) <= 1e-6
               and abs(left[1] - right[1]) <= 1e-6
               for left, right in zip(first_uv, second_uv)):
            continue
        for triangle_index, left, right, opposite in entries:
            point = (left["position"] * 0.45 + right["position"] * 0.45
                     + opposite["position"] * 0.10)
            uv = (left["uv"] * 0.45 + right["uv"] * 0.45
                  + opposite["uv"] * 0.10)
            samples.append({
                "edge": key,
                "triangle": triangle_index,
                "position": point,
                "uv": uv,
            })
    return samples


def metrics(values):
    if not values:
        return {"mean": None, "p95": None, "max": None, "count": 0}
    return {
        "mean": float(np.mean(values)),
        "p95": float(np.percentile(values, 95)),
        "max": float(np.max(values)),
        "count": len(values),
    }


def source_errors(samples, baked, decode_srgb=True):
    albedo = []
    roughness = []
    metallic = []
    for sample in samples:
        colour, rough, metal = fields.sample_fields(sample["position"])
        actual = sample_bilinear(baked["albedo"], sample["uv"])
        actual_colour = srgb_to_linear(actual[:3]) if decode_srgb else actual[:3]
        albedo.append(float(np.abs(
            np.array(colour, dtype=np.float32) - actual_colour).mean()))
        roughness.append(abs(float(rough)
                               - float(sample_bilinear(baked["roughness"],
                                                       sample["uv"])[0])))
        metallic.append(abs(float(metal)
                              - float(sample_bilinear(baked["metallic"],
                                                      sample["uv"])[0])))
    return {
        "albedo": metrics(albedo),
        "roughness": metrics(roughness),
        "metallic": metrics(metallic),
    }


if args.self_test:
    raise SystemExit(run_self_test())


low = bpy.data.objects.get("Pebble_Low")
if low is None:
    raise RuntimeError("Pebble_Low not found")
low.data.calc_loop_triangles()

baked_names = {
    "albedo": "Pebble_Procedural_Albedo_1024",
    "roughness": "Pebble_Procedural_Roughness_1024",
    "metallic": "Pebble_Procedural_Metallic_1024",
    "normal": "Pebble_Procedural_Normal_1024",
}
baked = {
    key: pixels(bpy.data.images[name])
    for key, name in baked_names.items()
}

all_samples = [
    {"position": position, "uv": uv, "triangle": triangle}
    for position, uv, triangle in triangle_samples(low)
]
seams = seam_samples(low)

all_errors = source_errors(all_samples, baked)
seam_errors = source_errors(seams, baked)
dimple_samples = [
    sample for sample in all_samples
    if (sample["position"].x - 0.10) ** 2
    + (sample["position"].y + 0.04) ** 2 < 0.0225
    and sample["position"].z > 0.10
]

normal = baked["normal"]
normal_vectors = normal[..., :3] * 2.0 - 1.0
normal_lengths = np.sqrt(np.sum(normal_vectors * normal_vectors, axis=2))
normal_rg_std = float(np.std(normal[..., :2]))

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
        "image": load_image(
            data, role, "sRGB" if role == "albedo" else "Non-Color"),
    }

findings = []
albedo_direct = albedo_flip = roughness_direct = metallic_direct = None
normal_direct = normal_flip = None
if not {"albedo", "metallic_roughness", "normal"} <= set(exported):
    findings.append("GLB is missing a required texture")
else:
    albedo_direct, albedo_flip = orientation(
        baked["albedo"], pixels(exported["albedo"]["image"]), 3)
    metallic_roughness = pixels(exported["metallic_roughness"]["image"])
    roughness_direct = mae(
        baked["roughness"][..., :1], metallic_roughness[..., 1:2], 1)
    metallic_direct = mae(
        baked["metallic"][..., :1], metallic_roughness[..., 2:3], 1)
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

if material.get("doubleSided", False):
    findings.append("material is exported double-sided")
normal_texture = material.get("normalTexture", {})
normal_scale = float(normal_texture.get("scale", 1.0))
if abs(normal_scale - 1.0) > 1e-6:
    findings.append("normal texture scale is not 1.0")

for channel in ("albedo", "roughness", "metallic"):
    errors = all_errors[channel]
    if channel == "albedo":
        if errors["mean"] > 0.02 or errors["p95"] > 0.04:
            findings.append("albedo source-to-bake error exceeds tolerance")
    elif errors["mean"] > 0.01 or errors["p95"] > 0.02:
        findings.append(f"{channel} source-to-bake error exceeds tolerance")

for channel in ("albedo", "roughness", "metallic"):
    errors = seam_errors[channel]
    if channel == "albedo":
        if errors["mean"] > 0.02 or errors["p95"] > 0.04:
            findings.append("albedo seam-pair error exceeds tolerance")
    elif errors["mean"] > 0.01 or errors["p95"] > 0.02:
        findings.append(f"{channel} seam-pair error exceeds tolerance")

if not seams:
    findings.append("no UV seam samples were found")
if not dimple_samples:
    findings.append("no dimple samples were found")
if float(normal[..., 2].mean()) <= 0.5:
    findings.append("normal Z is not positive")
if float(normal[..., 2].min()) <= 0.0:
    findings.append("normal Z includes a non-positive value")
if normal_rg_std < 0.01:
    findings.append("normal map is effectively flat")
if not 0.98 <= float(normal_lengths.mean()) <= 1.02:
    findings.append("normal length is outside tolerance")

report = {
    "glb": str(Path(args.glb).resolve()),
    "glb_sha256": hashlib.sha256(Path(args.glb).read_bytes()).hexdigest(),
    "field_version": "phase7c-procedural-1",
    "baked_images": baked_names,
    "baked_colorspaces": {
        key: bpy.data.images[name].colorspace_settings.name
        for key, name in baked_names.items()
    },
    "exported_images": {
        role: {key: value for key, value in item.items() if key != "image"}
        for role, item in exported.items()
    },
    "coverage": {
        "triangles": len(low.data.loop_triangles),
        "triangle_samples": len(all_samples),
        "dimple_samples": len(dimple_samples),
        "uv_seam_samples": len(seams),
        "uv_seam_edges": len({sample["edge"] for sample in seams}),
    },
    "source_to_baked": {
        "all": all_errors,
        "uv_seam_pairs": seam_errors,
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
    "material": {
        "double_sided": bool(material.get("doubleSided", False)),
        "normal_scale": normal_scale,
        "maps": sorted(pbr.keys()) + sorted(
            key for key in material.keys() if key == "normalTexture"),
    },
    "findings": findings,
    "status": "pass" if not findings else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("PHASE7_PROCEDURAL_CHANNELS_" + report["status"].upper(),
      json.dumps(report, sort_keys=True))
raise SystemExit(0 if report["status"] == "pass" else 1)
