"""Experimental local interface diagnostic for two evaluated meshes.

Samples evaluated triangles on both objects and reports nearest-surface signed distances.
This is a local estimate, not a watertight contact proof. Signed distance uses the nearest
normal on the other mesh; concave/ambiguous regions remain unverified.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--a", required=True)
    parser.add_argument("--b", required=True)
    parser.add_argument("--samples", type=int, default=4,
                        help="Barycentric substeps per triangle edge")
    parser.add_argument("--tolerance", type=float, default=0.0005)
    parser.add_argument("--expect", choices=("contact", "separated", "intersection"),
                        default="")
    parser.add_argument("--label", default="")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def evaluated_world_mesh(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    matrix = evaluated.matrix_world
    vertices = [matrix @ vertex.co for vertex in mesh.vertices]
    triangles = [tuple(polygon.vertices) for polygon in mesh.polygons
                 if len(polygon.vertices) == 3]
    triangles.extend(
        (polygon.vertices[0], polygon.vertices[index], polygon.vertices[index + 1])
        for polygon in mesh.polygons if len(polygon.vertices) > 3
        for index in range(1, len(polygon.vertices) - 1))
    area = sum(
        (vertices[tri[1]] - vertices[tri[0]]).cross(
            vertices[tri[2]] - vertices[tri[0]]).length * 0.5
        for tri in triangles)
    return vertices, triangles, area


def sample_points(vertices, triangles, steps):
    points = []
    for a, b, c in triangles:
        pa, pb, pc = vertices[a], vertices[b], vertices[c]
        for i in range(steps):
            for j in range(steps - i):
                wa = (i + 0.5) / steps
                wb = (j + 0.5) / steps
                wc = 1.0 - wa - wb
                if wc < 0.0:
                    continue
                points.append(pa * wa + pb * wb + pc * wc)
    return points


def signed_samples(points, bvh):
    values = []
    for point in points:
        location, normal, index, distance = bvh.find_nearest(point)
        if location is None:
            values.append(None)
            continue
        values.append(float((point - location).dot(normal)))
    return values


def summarize(values, area, triangle_count):
    valid = [value for value in values if value is not None]
    if not valid:
        return {"samples": 0, "missing": len(values)}
    absolute = sorted(abs(value) for value in valid)
    return {
        "samples": len(valid),
        "missing": len(values) - len(valid),
        "min_signed": round(min(valid), 9),
        "max_signed": round(max(valid), 9),
        "min_abs": round(absolute[0], 9),
        "median_abs": round(absolute[len(absolute) // 2], 9),
        "inside_samples": sum(1 for value in valid if value < 0.0),
        "contact_samples": sum(1 for value in valid if abs(value) <= 1e-6),
        "surface_area": round(area, 9),
        "triangles": triangle_count,
        "sample_spacing": round(math.sqrt(area / max(1, len(valid))), 9),
    }


def main():
    args = parse_args()
    output_path = Path(args.out)
    if output_path.exists():
        raise FileExistsError(f"Refusing to overwrite {output_path}")
    a = bpy.data.objects.get(args.a)
    b = bpy.data.objects.get(args.b)
    if a is None or b is None:
        raise RuntimeError("Both --a and --b objects must exist")
    if args.samples < 1:
        raise RuntimeError("--samples must be at least 1")

    a_vertices, a_triangles, a_area = evaluated_world_mesh(a)
    b_vertices, b_triangles, b_area = evaluated_world_mesh(b)
    a_bvh = BVHTree.FromPolygons(a_vertices, a_triangles)
    b_bvh = BVHTree.FromPolygons(b_vertices, b_triangles)
    a_points = sample_points(a_vertices, a_triangles, args.samples)
    b_points = sample_points(b_vertices, b_triangles, args.samples)
    a_to_b = signed_samples(a_points, b_bvh)
    b_to_a = signed_samples(b_points, a_bvh)
    values = [value for value in a_to_b + b_to_a if value is not None]
    signed = summarize(values, a_area + b_area, len(a_triangles) + len(b_triangles))
    signed["a_to_b"] = summarize(a_to_b, a_area, len(a_triangles))
    signed["b_to_a"] = summarize(b_to_a, b_area, len(b_triangles))

    errors = []
    if not values:
        errors.append("no valid nearest-surface samples")
    status = "pass"
    if args.expect:
        if args.expect == "contact" and signed.get("min_abs", 1e9) > args.tolerance:
            errors.append("expected contact but no sampled surface is within tolerance")
        elif args.expect == "separated" and signed.get("min_signed", -1e9) <= args.tolerance:
            errors.append("expected separation but sampled surfaces are not clear")
        elif args.expect == "intersection" and signed.get("min_signed", 1e9) >= -args.tolerance:
            errors.append("expected intersection but no sampled surface penetrates")
        if errors:
            status = "fail"

    report = {
        "tool": "check_interface.py",
        "status": status,
        "label": args.label,
        "a": args.a,
        "b": args.b,
        "expect": args.expect or None,
        "tolerance": args.tolerance,
        "samples_per_triangle_edge": args.samples,
        "summary": signed,
        "errors": errors,
        "scope": ("experimental local signed estimate; no complete-coverage or "
                  "watertight-contact claim"),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("INTERFACE_CHECK " + json.dumps({
        "out": str(output_path), "status": status,
        "min_signed": signed.get("min_signed"),
        "min_abs": signed.get("min_abs"),
        "errors": errors,
    }))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
