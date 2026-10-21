"""Measure inter-island UV padding for the Phase 7B equipment case."""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy

parse = argparse.ArgumentParser()
parse.add_argument("--objects", nargs="+", required=True)
parse.add_argument("--out", required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


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
        islands.append({"segments": sorted(segments)})
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
    return min(point_segment_distance(a, c, d),
               point_segment_distance(b, c, d),
               point_segment_distance(c, a, b),
               point_segment_distance(d, a, b))


reports = {}
for name in args.objects:
    obj = bpy.data.objects.get(name)
    if obj is None or obj.type != "MESH":
        raise RuntimeError("Mesh object not found: %s" % name)
    layer = obj.data.uv_layers.active
    if layer is None:
        raise RuntimeError("No active UV map: %s" % name)
    islands = find_islands(obj.data, layer)
    best = None
    pair = None
    for left_index, left in enumerate(islands):
        for right_index in range(left_index + 1, len(islands)):
            right = islands[right_index]
            for left_segment in left["segments"]:
                for right_segment in right["segments"]:
                    distance = segment_distance(left_segment, right_segment)
                    if best is None or distance < best:
                        best = distance
                        pair = [left_index, right_index]
    points = [point for island in islands for segment in island["segments"]
              for point in segment]
    border = min(min(point[0], 1.0 - point[0], point[1], 1.0 - point[1])
                 for point in points)
    reports[name] = {
        "island_count": len(islands),
        "min_inter_island_padding_uv": best,
        "min_inter_island_padding_px_1024": None if best is None else best * 1024,
        "min_inter_island_padding_px_512": None if best is None else best * 512,
        "min_inter_island_pair": pair,
        "min_border_margin_uv": border,
    }

out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(reports, indent=2))
print("PHASE7_UV_PADDING", json.dumps(reports, sort_keys=True))
