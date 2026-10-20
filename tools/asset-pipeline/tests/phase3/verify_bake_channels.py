"""Validate the curved bake against its source images, UV layout and exported GLB.

Run this script from Blender with the saved checkpoint loaded. It deliberately
does not trust the generated bake_checks.json for the measured errors: it
re-samples the checkpoint images in Blender and reports new numbers.

With --glb it also decodes the embedded images and checks the source -> baked ->
exported channel path, including the inter-island UV padding in pixels.
"""

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

parse = argparse.ArgumentParser()
parse.add_argument("--resolution", type=int, default=1024)
parse.add_argument("--normal-image", default=None)
parse.add_argument("--normal-colorspace", default=None)
parse.add_argument("--albedo-colorspace", default=None)
parse.add_argument("--glb", default=None)
parse.add_argument("--checks", default=None)
parse.add_argument("--out", default=None)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

size = args.resolution
low = bpy.data.objects["Curved_Low"]
uv_layer = low.data.uv_layers.active
assert uv_layer is not None


def pixels(image):
    values = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(values)
    return values.reshape(size, size, 4)


def sample(array, uv):
    x = min(size - 1, max(0, int(round(uv[0] * (size - 1)))))
    y = min(size - 1, max(0, int(round(uv[1] * (size - 1)))))
    return array[y, x]


def read_glb(path):
    data = Path(path).read_bytes()
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


def extract_glb_images(path):
    doc, binary = read_glb(path)
    material = (doc.get("materials") or [{}])[0]
    pbr = material.get("pbrMetallicRoughness", {})
    references = {
        "albedo": image_source(doc, pbr.get("baseColorTexture")),
        "roughness": image_source(doc, pbr.get("metallicRoughnessTexture")),
        "normal": image_source(doc, material.get("normalTexture")),
    }
    images = doc.get("images", [])
    views = doc.get("bufferViews", [])
    output = {}
    for role, index in references.items():
        if index is None or index >= len(images):
            continue
        image = images[index]
        view_index = image.get("bufferView")
        if view_index is None or view_index >= len(views):
            continue
        view = views[view_index]
        start = int(view.get("byteOffset", 0))
        end = start + int(view["byteLength"])
        output[role] = {
            "name": image.get("name") or "%s_image" % role,
            "image_index": index,
            "bytes": binary[start:end],
            "mime_type": image.get("mimeType"),
        }
    return doc, output


def load_exported_images(glb_path):
    doc, extracted = extract_glb_images(glb_path)
    loaded = {}
    with tempfile.TemporaryDirectory(prefix="phase3-export-") as temp:
        for role, item in extracted.items():
            suffix = ".jpg" if item.get("mime_type") == "image/jpeg" else ".png"
            path = Path(temp) / ("%s%s" % (role, suffix))
            path.write_bytes(item["bytes"])
            image = bpy.data.images.load(str(path), check_existing=False)
            image.colorspace_settings.name = (
                "sRGB" if role == "albedo" else "Non-Color")
            image.pack()
            loaded[role] = image
    return doc, extracted, loaded


def find_uv_islands(mesh, layer):
    parent = list(range(len(mesh.polygons)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left, right):
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    def loop_uv(loop_index, vertex_index):
        for index in loop_index:
            if mesh.loops[index].vertex_index == vertex_index:
                return tuple(layer.data[index].uv)
        return None

    edge_faces = {}
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, left in enumerate(loops):
            right = loops[(index + 1) % len(loops)]
            left_vertex = mesh.loops[left].vertex_index
            right_vertex = mesh.loops[right].vertex_index
            key = (min(left_vertex, right_vertex), max(left_vertex, right_vertex))
            edge_faces.setdefault(key, []).append((polygon.index, (left, right)))

    for (vertex_a, vertex_b), faces in edge_faces.items():
        if len(faces) != 2:
            continue
        (face_a, loops_a), (face_b, loops_b) = faces
        uv_a = [loop_uv(loops_a, vertex_a), loop_uv(loops_a, vertex_b)]
        uv_b = [loop_uv(loops_b, vertex_a), loop_uv(loops_b, vertex_b)]
        if any(value is None for value in uv_a + uv_b):
            continue
        if all(abs(left[0] - right[0]) <= 1e-6
               and abs(left[1] - right[1]) <= 1e-6
               for left, right in zip(uv_a, uv_b)):
            union(face_a, face_b)

    groups = {}
    for polygon in mesh.polygons:
        groups.setdefault(find(polygon.index), []).append(polygon.index)
    islands = []
    for root, polygon_indices in groups.items():
        segments = set()
        for polygon_index in polygon_indices:
            loops = list(mesh.polygons[polygon_index].loop_indices)
            for index, left in enumerate(loops):
                right = loops[(index + 1) % len(loops)]
                uv_a = tuple(layer.data[left].uv)
                uv_b = tuple(layer.data[right].uv)
                if uv_a == uv_b:
                    continue
                order = (uv_a, uv_b) if uv_a < uv_b else (uv_b, uv_a)
                segments.add(order)
        islands.append({
            "id": len(islands),
            "polygons": polygon_indices,
            "segments": sorted(segments),
        })
    for island in islands:
        points = [point for segment in island["segments"] for point in segment]
        island["bounds"] = [
            min(point[0] for point in points),
            min(point[1] for point in points),
            max(point[0] for point in points),
            max(point[1] for point in points),
        ]
    return islands


def point_segment_distance(point, start, end):
    px, py = point
    ax, ay = start
    bx, by = end
    dx = bx - ax
    dy = by - ay
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def segment_distance(left, right):
    a, b = left
    c, d = right
    return min(
        point_segment_distance(a, c, d),
        point_segment_distance(b, c, d),
        point_segment_distance(c, a, b),
        point_segment_distance(d, a, b),
    )


def inter_island_padding(mesh, layer):
    islands = find_uv_islands(mesh, layer)
    best = None
    pair = None
    for left_index, left in enumerate(islands):
        for right in islands[left_index + 1:]:
            for left_segment in left["segments"]:
                for right_segment in right["segments"]:
                    distance = segment_distance(left_segment, right_segment)
                    if best is None or distance < best:
                        best = distance
                        pair = [left["id"], right["id"]]
    border = min(
        min(point[0], 1.0 - point[0], point[1], 1.0 - point[1])
        for island in islands for segment in island["segments"] for point in segment)
    return islands, best or 0.0, pair, border


def image_mae(left, right, channels=3):
    return float(np.mean(np.abs(left[..., :channels] - right[..., :channels])))


def image_mae_best_orientation(left, right, channels=3):
    direct = image_mae(left, right, channels)
    flipped = image_mae(left, right[::-1], channels)
    if flipped < direct:
        return flipped, True
    return direct, False


source_albedo = bpy.data.images["Source_Albedo_%s" % size]
source_roughness = bpy.data.images["Source_Roughness_%s" % size]
baked_albedo = bpy.data.images["Curved_Albedo_%s" % size]
baked_roughness = bpy.data.images["Curved_Roughness_%s" % size]
normal = bpy.data.images["Curved_Normal_%s" % size]
checks_path = Path(args.checks) if args.checks else (
    Path(bpy.data.filepath).parent / "bake_checks.json")
checks = json.loads(checks_path.read_text(encoding="utf-8"))
checks_entry = next(
    item for item in checks if item.get("resolution") == size)
expected_normal_hash = checks_entry.get("hashes", {}).get("normal")
normal_path = Path(args.normal_image) if args.normal_image else Path(
    checks_entry["paths"]["normal"])
actual_normal_hash = hashlib.sha256(normal_path.read_bytes()).hexdigest()
if args.normal_image:
    normal = bpy.data.images.load(args.normal_image, check_existing=False)
normal.colorspace_settings.name = args.normal_colorspace or "Non-Color"

source_a = pixels(source_albedo)
source_r = pixels(source_roughness)
baked_a = pixels(baked_albedo)
baked_r = pixels(baked_roughness)
normal_pixels = pixels(normal)

uvs = [tuple(loop.uv) for loop in uv_layer.data]
albedo_errors = []
roughness_errors = []
for uv in uvs:
    albedo_errors.append(np.abs(
        sample(source_a, uv)[:3] - sample(baked_a, uv)[:3]).mean())
    roughness_errors.append(abs(
        float(sample(source_r, uv)[0]) - float(sample(baked_r, uv)[0])))

cap_samples = []
side_samples = []
for polygon in low.data.polygons:
    target = cap_samples if abs(polygon.normal.z) > 0.5 else side_samples
    for loop_index in polygon.loop_indices:
        target.append(tuple(uv_layer.data[loop_index].uv))
cap = np.array([sample(normal_pixels, uv)[:3] for uv in cap_samples])
side = np.array([sample(normal_pixels, uv)[:3] for uv in side_samples])
islands, island_padding, island_pair, island_border = inter_island_padding(
    low.data, uv_layer)
expected_albedo_space = args.albedo_colorspace or "sRGB"

normal_vectors = normal_pixels[..., :3] * 2.0 - 1.0
normal_lengths = np.sqrt(np.sum(normal_vectors * normal_vectors, axis=2))
findings = []
if np.mean(albedo_errors) > 0.02:
    findings.append("albedo MAE exceeds 0.02")
if np.mean(roughness_errors) > 0.005:
    findings.append("roughness MAE exceeds 0.005")
if baked_albedo.colorspace_settings.name != expected_albedo_space:
    findings.append("albedo colours space is not %s" % expected_albedo_space)
if baked_roughness.colorspace_settings.name != "Non-Color":
    findings.append("roughness colours space is not Non-Color")
if normal.colorspace_settings.name != "Non-Color":
    findings.append("normal colours space is not Non-Color")
if island_border < 0.02:
    findings.append("UV border margin is below 0.02")
if island_padding < 0.005:
    findings.append("inter-island UV padding is below 0.005")
if float(np.std(normal_pixels[..., :2])) < 0.01:
    findings.append("normal map is flat")
if float(np.mean(normal_pixels[..., 2])) <= 0.5:
    findings.append("normal map faces into the surface (tangent-space Z is not positive)")
if float(np.min(normal_pixels[..., 2])) <= 0.0:
    findings.append("normal map has non-positive tangent-space Z samples")
if not expected_normal_hash:
    findings.append("bake checks have no normal-map reference hash")
elif actual_normal_hash != expected_normal_hash:
    findings.append("normal map does not match the recorded reference hash")

export_channels = None
if args.glb:
    doc, extracted, exported = load_exported_images(args.glb)
    if not {'albedo', 'roughness', 'normal'} <= set(exported):
        findings.append("exported GLB does not contain albedo, roughness and normal images")
    else:
        export_a = pixels(exported["albedo"])
        export_r = pixels(exported["roughness"])
        export_n = pixels(exported["normal"])
        albedo_direct, albedo_flip = image_mae_best_orientation(baked_a, export_a)
        roughness_direct, roughness_flip = image_mae_best_orientation(
            baked_r[..., :1], export_r[..., 1:2], channels=1)
        normal_direct, normal_flip = image_mae_best_orientation(
            normal_pixels, export_n)
        source_to_export_albedo = np.mean([
            np.abs(sample(source_a, uv)[:3] - sample(export_a, uv)[:3]).mean()
            for uv in uvs])
        source_to_export_roughness = np.mean([
            abs(float(sample(source_r, uv)[0]) - float(sample(export_r, uv)[1]))
            for uv in uvs])
        export_channels = {
            "glb": str(args.glb),
            "images": {
                role: {
                    "name": item["name"],
                    "image_index": item["image_index"],
                    "sha256": hashlib.sha256(item["bytes"]).hexdigest(),
                    "bytes": len(item["bytes"]),
                }
                for role, item in extracted.items()
            },
            "baked_to_export_albedo_mae": albedo_direct,
            "baked_to_export_albedo_vertical_flip": albedo_flip,
            "baked_to_export_roughness_mae": roughness_direct,
            "baked_to_export_roughness_vertical_flip": roughness_flip,
            "baked_to_export_normal_mae": normal_direct,
            "baked_to_export_normal_vertical_flip": normal_flip,
            "source_to_export_albedo_mae": float(source_to_export_albedo),
            "source_to_export_roughness_mae": float(source_to_export_roughness),
            "exported_normal_b_mean": float(export_n[..., 2].mean()),
        }
        if albedo_direct > 0.02:
            findings.append("exported albedo differs from the baked albedo")
        if roughness_direct > 0.01:
            findings.append("exported roughness differs from the baked roughness")
        if normal_direct > 0.02:
            findings.append("exported normal differs from the baked normal")
        if float(source_to_export_albedo) > 0.02:
            findings.append("exported albedo differs from the source albedo")
        if float(source_to_export_roughness) > 0.005:
            findings.append("exported roughness differs from the source roughness")
        if float(export_n[..., 2].mean()) <= 0.5:
            findings.append("exported normal map faces into the surface")

report = {
    "resolution": size,
    "albedo_mae": float(np.mean(albedo_errors)),
    "roughness_mae": float(np.mean(roughness_errors)),
    "min_uv_border_margin": float(island_border),
    "min_inter_island_padding_uv": float(island_padding),
    "min_inter_island_padding_px": float(island_padding * size),
    "min_inter_island_pair": island_pair,
    "uv_island_count": len(islands),
    "uv_islands": [
        {
            "id": island["id"],
            "polygon_count": len(island["polygons"]),
            "bounds": [float(value) for value in island["bounds"]],
            "segment_count": len(island["segments"]),
        }
        for island in islands
    ],
    "colorspaces": {
        "albedo": baked_albedo.colorspace_settings.name,
        "roughness": baked_roughness.colorspace_settings.name,
        "normal": normal.colorspace_settings.name,
    },
    "normal_rg_std": float(np.std(normal_pixels[..., :2])),
    "normal_b_mean": float(normal_pixels[..., 2].mean()),
    "normal_b_min": float(normal_pixels[..., 2].min()),
    "normal_vector_length_mean": float(normal_lengths.mean()),
    "normal_side_r_mean": float(side[..., 0].mean()),
    "normal_side_g_mean": float(side[..., 1].mean()),
    "normal_cap_r_mean": float(cap[..., 0].mean()),
    "normal_sha256": actual_normal_hash,
    "normal_reference_sha256": expected_normal_hash,
    "normal_hash_match": actual_normal_hash == expected_normal_hash,
    "export_channels": export_channels,
    "findings": findings,
    "status": "fail" if findings else "pass",
}
if args.out:
    with open(args.out, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
print("BAKE_CHANNELS_" + report["status"].upper(), json.dumps(report, sort_keys=True))
raise SystemExit(1 if findings else 0)
