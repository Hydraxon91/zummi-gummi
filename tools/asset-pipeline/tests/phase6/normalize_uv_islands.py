"""Normalize each crate UV island to 0-1 for consistent tileable mapping.

The source checkpoint is opened read-only. The new checkpoint preserves
geometry and material slots but intentionally changes UV coordinates.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--out-dir", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
if not source.is_file():
    raise FileNotFoundError(source)
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
checkpoint = out_dir / "crate_phase6_uv_001.blend"
if checkpoint.exists():
    raise FileExistsError("Refusing to overwrite an existing normalized UV checkpoint")

crate = bpy.data.objects.get("Crate_Body")
if crate is None or crate.type != "MESH":
    raise RuntimeError("Crate_Body mesh not found")
mesh = crate.data
uv_layer = mesh.uv_layers.active
if uv_layer is None:
    raise RuntimeError("Crate_Body has no active UV map")


def mesh_fingerprint():
    digest = hashlib.sha256()
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3f", *vertex.co))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<I", len(polygon.vertices)))
        for vertex_index in polygon.vertices:
            digest.update(struct.pack("<I", vertex_index))
    return digest.hexdigest()


def find_islands():
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

    def loop_uv(loops, vertex_index):
        for index in loops:
            if mesh.loops[index].vertex_index == vertex_index:
                return tuple(uv_layer.data[index].uv)
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
    return list(groups.values())


source_geometry = mesh_fingerprint()
islands = find_islands()
if len(islands) != 6:
    raise RuntimeError("Expected 6 UV islands, found %d" % len(islands))

margin = 0.005
for polygon_indices in islands:
    loops = []
    for polygon_index in polygon_indices:
        loops.extend(mesh.polygons[polygon_index].loop_indices)
    us = [uv_layer.data[index].uv[0] for index in loops]
    vs = [uv_layer.data[index].uv[1] for index in loops]
    u_min, u_max = min(us), max(us)
    v_min, v_max = min(vs), max(vs)
    u_span = max(u_max - u_min, 1e-6)
    v_span = max(v_max - v_min, 1e-6)
    for index in loops:
        uv = uv_layer.data[index].uv
        uv[0] = margin + (uv[0] - u_min) / u_span * (1.0 - 2.0 * margin)
        uv[1] = margin + (uv[1] - v_min) / v_span * (1.0 - 2.0 * margin)

if mesh_fingerprint() != source_geometry:
    raise RuntimeError("UV normalization changed the mesh fingerprint")
bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
print("PHASE6_UV_NORMALIZED", json.dumps({
    "source": str(source),
    "checkpoint": str(checkpoint),
    "islands": len(islands),
    "geometry_sha256": source_geometry,
    "margin": margin,
}, sort_keys=True))
