"""Detect coplanar overlapping triangles in one mesh.

This catches the failure mode where separate frame bars or panels share a plane
and render as z-fighting even though their object counts look valid. Adjacent
coplanar triangles sharing an edge are not overlaps.
"""

import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

parse = argparse.ArgumentParser()
parse.add_argument("--object", required=True)
parse.add_argument("--out", required=True)
parse.add_argument("--tolerance", type=float, default=1e-6)
parse.add_argument("--epsilon", type=float, default=1e-9)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

obj = bpy.data.objects[args.object]
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.triangulate(bm, faces=list(bm.faces))
bm.faces.ensure_lookup_table()
bm.verts.ensure_lookup_table()
matrix = obj.matrix_world

# Connected-component ids: only overlaps between separate mesh islands are
# delivery defects; internal triangulation of one solid is not.
component = {}
next_component = 0
for face in bm.faces:
    if face.index in component:
        continue
    stack = [face]
    component[face.index] = next_component
    while stack:
        current = stack.pop()
        for edge in current.edges:
            for linked in edge.link_faces:
                if linked.index not in component:
                    component[linked.index] = next_component
                    stack.append(linked)
    next_component += 1

triangles = []
for face in bm.faces:
    points = [matrix @ vert.co for vert in face.verts]
    if len(points) != 3:
        continue
    a = np.array(points[0], dtype=np.float64)
    b = np.array(points[1], dtype=np.float64)
    c = np.array(points[2], dtype=np.float64)
    normal = np.cross(b - a, c - a)
    length = np.linalg.norm(normal)
    if length < 1e-12:
        continue
    normal /= length
    triangles.append({
        "index": face.index,
        "component": component[face.index],
        "points": [a, b, c],
        "normal": normal,
        "offset": float(np.dot(normal, a)),
        "center": (a + b + c) / 3.0,
    })


def project(points, normal):
    axis = int(np.argmax(np.abs(normal)))
    if axis == 0:
        return np.array([[point[1], point[2]] for point in points])
    if axis == 1:
        return np.array([[point[0], point[2]] for point in points])
    return np.array([[point[0], point[1]] for point in points])


def orientation(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def point_strictly_inside(point, triangle, epsilon):
    signs = [
        orientation(triangle[0], triangle[1], point),
        orientation(triangle[1], triangle[2], point),
        orientation(triangle[2], triangle[0], point),
    ]
    return all(value > epsilon for value in signs) or all(value < -epsilon for value in signs)


def segments_cross(a, b, c, d, epsilon):
    o1 = orientation(a, b, c)
    o2 = orientation(a, b, d)
    o3 = orientation(c, d, a)
    o4 = orientation(c, d, b)
    return (o1 * o2 < -epsilon) and (o3 * o4 < -epsilon)


def triangles_overlap(first, second, epsilon):
    for point in first:
        if point_strictly_inside(point, second, epsilon):
            return True
    for point in second:
        if point_strictly_inside(point, first, epsilon):
            return True
    for index in range(3):
        a = first[index]
        b = first[(index + 1) % 3]
        for other_index in range(3):
            c = second[other_index]
            d = second[(other_index + 1) % 3]
            if segments_cross(a, b, c, d, epsilon):
                return True
    return False


pairs = []
for first_index in range(len(triangles)):
    first = triangles[first_index]
    for second_index in range(first_index + 1, len(triangles)):
        second = triangles[second_index]
        if first["component"] == second["component"]:
            continue
        if abs(float(np.dot(first["normal"], second["normal"]))) < 0.9999:
            continue
        if abs(first["offset"] - second["offset"]) > args.tolerance:
            continue
        first_2d = project(first["points"], first["normal"])
        second_2d = project(second["points"], second["normal"])
        if triangles_overlap(first_2d, second_2d, args.epsilon):
            pairs.append({
                "a": first["index"],
                "b": second["index"],
                "center_a": [round(float(value), 6) for value in first["center"]],
                "center_b": [round(float(value), 6) for value in second["center"]],
            })
bm.free()

report = {
    "object": args.object,
    "source": bpy.data.filepath,
    "triangles": len(triangles),
    "components": next_component,
    "tolerance": args.tolerance,
    "epsilon": args.epsilon,
    "coplanar_overlap_count": len(pairs),
    "coplanar_overlaps": pairs[:50],
    "status": "pass" if not pairs else "fail",
}
out = Path(args.out)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2))
print("COPLANAR_CHECK_" + report["status"].upper(), json.dumps({
    "object": args.object,
    "triangles": len(triangles),
    "components": next_component,
    "overlaps": len(pairs),
    "top": pairs[:5],
}))
raise SystemExit(0 if not pairs else 1)
