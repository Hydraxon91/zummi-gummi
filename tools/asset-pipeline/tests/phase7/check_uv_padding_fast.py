"""Approximate inter-island UV padding for high-density atlases.

Samples points along island boundary segments and uses a per-island KD-tree.
The sampling step is reported; this is not an exact segment-to-segment solve.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import kdtree

parser = argparse.ArgumentParser()
parser.add_argument("--objects", nargs="+", required=True)
parser.add_argument("--out", required=True)
parser.add_argument("--step-uv", type=float, default=0.0005)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def find_islands(mesh, layer):
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
                return tuple(layer.data[index].uv)
        return None

    edge_faces = {}
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for index, left in enumerate(loops):
            right = loops[(index + 1) % len(loops)]
            key = tuple(sorted((mesh.loops[left].vertex_index,
                                mesh.loops[right].vertex_index)))
            edge_faces.setdefault(key, []).append((polygon.index, left, right))

    for (vertex_a, vertex_b), faces in edge_faces.items():
        if len(faces) != 2:
            continue
        (face_a, left_a, right_a), (face_b, left_b, right_b) = faces
        uv_a = [loop_uv((left_a, right_a), vertex_a),
                loop_uv((left_a, right_a), vertex_b)]
        uv_b = [loop_uv((left_b, right_b), vertex_a),
                loop_uv((left_b, right_b), vertex_b)]
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
    for polygon_indices in groups.values():
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
        islands.append(sorted(segments))
    return islands


def sampled_points(segments, step):
    points = []
    for start, end in segments:
        length = math.hypot(end[0] - start[0], end[1] - start[1])
        count = max(1, int(math.ceil(length / step)))
        for index in range(count + 1):
            factor = index / count
            points.append((start[0] + (end[0] - start[0]) * factor,
                           start[1] + (end[1] - start[1]) * factor))
    return points


reports = {}
for name in args.objects:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError("Mesh object not found: %s" % name)
    layer = obj.data.uv_layers.active
    if layer is None:
        raise RuntimeError("No active UV map: %s" % name)
    islands = find_islands(obj.data, layer)
    points_per_island = [sampled_points(island, args.step_uv) for island in islands]
    trees = []
    for points in points_per_island:
        tree = kdtree.KDTree(len(points))
        for index, point in enumerate(points):
            tree.insert((point[0], point[1], 0.0), index)
        tree.balance()
        trees.append(tree)

    best = None
    pair = None
    for left_index, left_points in enumerate(points_per_island):
        for right_index in range(left_index + 1, len(points_per_island)):
            right_tree = trees[right_index]
            for point in left_points:
                _, _, distance = right_tree.find((point[0], point[1], 0.0))
                if best is None or distance < best:
                    best = distance
                    pair = [left_index, right_index]
            left_tree = trees[left_index]
            for point in points_per_island[right_index]:
                _, _, distance = left_tree.find((point[0], point[1], 0.0))
                if best is None or distance < best:
                    best = distance
                    pair = [left_index, right_index]

    all_points = [point for points in points_per_island for point in points]
    border = min(min(point[0], 1.0 - point[0], point[1], 1.0 - point[1])
                 for point in all_points)
    reports[name] = {
        "method": "sampled_segment_points_kdtree",
        "sample_step_uv": args.step_uv,
        "island_count": len(islands),
        "min_inter_island_padding_uv": best,
        "min_inter_island_padding_px_1024": None if best is None else best * 1024,
        "min_inter_island_padding_px_512": None if best is None else best * 512,
        "min_inter_island_pair": pair,
        "min_border_margin_uv": border,
        "min_border_margin_px_1024": border * 1024,
    }

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(reports, indent=2))
print("PHASE7_UV_PADDING_APPROX", json.dumps(reports, sort_keys=True))
