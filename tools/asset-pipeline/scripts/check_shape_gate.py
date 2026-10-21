"""Read-only shape-stage gate for Blender assets.

Checks scene hygiene, target bounds, hinge presence, editable-modifier state,
freshness of a capture manifest and recorded stage approval. It does not repair
geometry or replace visual/reference acceptance.
"""

import argparse
import datetime
import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from asset_fingerprint import fingerprint_objects
from asset_identity import object_ids
from construction_gate import run as run_construction
from check_evidence import validate_evidence_report


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--prefix", default="")
    parser.add_argument("--objects", default="")
    parser.add_argument("--expected", default="",
                        help="Expected X,Y,Z dimensions in metres")
    parser.add_argument("--tolerance", type=float, default=0.01)
    parser.add_argument("--hinge", default="")
    parser.add_argument("--stage", choices=("silhouette", "detail", "delivery"),
                        default="silhouette")
    parser.add_argument("--review-manifest", default="",
                        help="Capture manifest whose fingerprint must still match")
    parser.add_argument("--approval", default="",
                        help="Recorded approval required for detail/delivery")
    parser.add_argument("--required-views", default="front,side,top,three_quarter",
                        help="Views that must exist in the review manifest")
    parser.add_argument("--record-approval", default="",
                        help="Write an approval after a clean gate")
    parser.add_argument("--approved-by", default="")
    parser.add_argument("--note", default="")
    parser.add_argument("--construction-brief", default="",
                        help="Optional construction-method brief JSON")
    parser.add_argument("--candidate-ledger", default="",
                        help="Optional candidate-ledger JSON")
    parser.add_argument("--evidence-report", default="",
                        help="Optional pose/evidence check JSON")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def targets(args):
    if args.objects:
        names = [name.strip() for name in args.objects.split(",") if name.strip()]
        objects = [bpy.data.objects[name] for name in names]
    else:
        objects = [obj for obj in bpy.context.scene.objects
                   if obj.type == "MESH" and obj.visible_get()
                   and not obj.hide_render
                   and not any("Review" in collection.name or "Cutter" in collection.name
                               for collection in obj.users_collection)
                   and (not args.prefix or obj.name.startswith(args.prefix))]
    if not objects:
        raise RuntimeError("No target meshes matched")
    return objects


def bounds(objects):
    points = [obj.matrix_world @ Vector(corner)
              for obj in objects for corner in obj.bound_box]
    minimum = [min(point[i] for point in points) for i in range(3)]
    maximum = [max(point[i] for point in points) for i in range(3)]
    return minimum, maximum


def check_review_manifest(path, fingerprint, names, errors, required_views=None,
                          ids=None):
    manifest_path = Path(path)
    if not manifest_path.is_file():
        errors.append(f"review manifest not found: {path}")
        return {"path": str(manifest_path), "status": "missing"}
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    result = {
        "path": str(manifest_path),
        "status": "fresh",
        "manifest_fingerprint": manifest.get("fingerprint"),
        "targets": manifest.get("targets"),
        "target_ids": manifest.get("target_ids"),
        "views": [],
        "captures": 0,
    }
    manifest_frame = manifest.get("settings", {}).get("frame")
    compared_fingerprint = fingerprint
    if isinstance(manifest_frame, int) and manifest_frame != bpy.context.scene.frame_current:
        original_frame = bpy.context.scene.frame_current
        try:
            bpy.context.scene.frame_set(manifest_frame)
            bpy.context.view_layer.update()
            frame_objects = [bpy.data.objects[name] for name in names
                             if bpy.data.objects.get(name) is not None]
            if len(frame_objects) == len(names):
                compared_fingerprint = fingerprint_objects(frame_objects)
            result["fingerprint_frame"] = manifest_frame
        finally:
            bpy.context.scene.frame_set(original_frame)
            bpy.context.view_layer.update()
    if manifest.get("fingerprint") != compared_fingerprint:
        result["status"] = "stale"
        errors.append("review manifest fingerprint does not match the current source")
    if ids is not None:
        if not manifest.get("target_ids"):
            result["status"] = "stale"
            errors.append("review manifest has no persistent target IDs")
        elif sorted(manifest.get("target_ids", [])) != sorted(ids):
            result["status"] = "stale"
            errors.append("review manifest target IDs do not match the current targets")
    elif sorted(manifest.get("targets", [])) != sorted(names):
        result["status"] = "stale"
        errors.append("review manifest target list does not match the current targets")
    seen_views = set()
    for capture in manifest.get("captures", []):
        view = capture.get("view")
        if view:
            seen_views.add(view)
            result["views"].append(view)
        path_value = capture.get("path")
        if not path_value or not Path(path_value).is_file():
            result["status"] = "stale"
            errors.append(f"review capture is missing: {path_value}")
            continue
        if sha256_file(path_value) != capture.get("sha256"):
            result["status"] = "stale"
            errors.append(f"review capture hash is stale: {path_value}")
        result["captures"] += 1
    if required_views:
        missing = sorted(set(required_views) - seen_views)
        if missing:
            result["status"] = "stale"
            errors.append(f"review manifest is missing required views: {missing}")
    return result


def fingerprint_at_frame(names, frame, errors):
    original_frame = bpy.context.scene.frame_current
    try:
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        objects = [bpy.data.objects[name] for name in names
                   if bpy.data.objects.get(name) is not None]
        if len(objects) != len(names):
            missing = sorted(set(names) - {obj.name for obj in objects})
            errors.append(f"approval targets missing at frame {frame}: {missing}")
            return None
        return fingerprint_objects(objects)
    finally:
        bpy.context.scene.frame_set(original_frame)
        bpy.context.view_layer.update()


def check_approval(path, fingerprint, names, stage, errors, required_views,
                   ids=None):
    approval_path = Path(path)
    if not approval_path.is_file():
        errors.append(f"approval not found: {path}")
        return {"path": str(approval_path), "status": "missing"}
    approval = json.loads(approval_path.read_text(encoding="utf-8"))
    result = {
        "path": str(approval_path),
        "status": "accepted",
        "stage": approval.get("stage"),
        "approved_by": approval.get("approved_by"),
        "fingerprint": approval.get("fingerprint"),
        "target_ids": approval.get("target_ids"),
        "review_manifest": approval.get("review_manifest"),
    }
    if approval.get("status") != "pass":
        result["status"] = "rejected"
        errors.append("recorded approval is not a pass")
    if approval.get("stage") not in (("silhouette", "detail") if stage == "delivery"
                                      else ("silhouette",)):
        result["status"] = "rejected"
        errors.append(f"recorded approval stage {approval.get('stage')} is not valid for {stage}")
    approval_frame = approval.get("frame", bpy.context.scene.frame_current)
    result["frame"] = approval_frame
    if not isinstance(approval_frame, int):
        result["status"] = "rejected"
        errors.append("recorded approval frame is not an integer")
    else:
        approved_fingerprint = fingerprint_at_frame(names, approval_frame, errors)
        result["current_fingerprint"] = approved_fingerprint
        if approved_fingerprint != approval.get("fingerprint"):
            result["status"] = "stale"
            errors.append(
                f"recorded approval fingerprint does not match the source at frame {approval_frame}")
    if ids is not None:
        if not approval.get("target_ids"):
            result["status"] = "stale"
            errors.append("recorded approval has no persistent target IDs")
        elif sorted(approval.get("target_ids", [])) != sorted(ids):
            result["status"] = "stale"
            errors.append("recorded approval target IDs do not match the current targets")
    elif sorted(approval.get("targets", [])) != sorted(names):
        result["status"] = "stale"
        errors.append("recorded approval target list does not match the current targets")
    if not approval.get("approved_by"):
        result["status"] = "rejected"
        errors.append("recorded approval has no approved_by")
    if not approval.get("note"):
        result["status"] = "rejected"
        errors.append("recorded approval has no review note")

    manifest_path = approval.get("review_manifest")
    if not manifest_path:
        result["status"] = "rejected"
        errors.append("recorded approval has no review evidence")
    else:
        manifest_path = Path(manifest_path)
        if not manifest_path.is_file():
            result["status"] = "stale"
            errors.append(f"approval review manifest is missing: {manifest_path}")
        elif sha256_file(manifest_path) != approval.get("review_manifest_sha256"):
            result["status"] = "stale"
            errors.append("approval review manifest hash is stale")
        else:
            result["review"] = check_review_manifest(
                manifest_path, fingerprint, names, errors, required_views, ids)
            if result["review"]["status"] != "fresh":
                result["status"] = "stale"
    return result


def main():
    args = parse_args()
    output_path = Path(args.out)
    if output_path.exists():
        raise FileExistsError(f"Refusing to overwrite {output_path}")
    objects = targets(args)
    minimum, maximum = bounds(objects)
    dimensions = [maximum[i] - minimum[i] for i in range(3)]
    names = [obj.name for obj in objects]
    fingerprint = fingerprint_objects(objects)
    errors = []
    warnings = []

    construction = None
    evidence_recheck = None
    expected_ids = None
    if (args.evidence_report or args.record_approval
            or args.stage in ("detail", "delivery")):
        ids_by_name = object_ids(objects, errors)
        expected_ids = [ids_by_name[name] for name in names if ids_by_name.get(name)]
    construction_inputs = (args.construction_brief, args.candidate_ledger,
                           args.evidence_report)
    if args.stage in ("detail", "delivery") and not all(construction_inputs):
        errors.append(f"{args.stage} stage requires construction brief, candidate ledger "
                      "and evidence report")
    if any(construction_inputs):
        if not args.construction_brief or not args.candidate_ledger:
            errors.append("construction gate requires --construction-brief and "
                          "--candidate-ledger together")
        else:
            construction = run_construction(
                args.construction_brief, args.candidate_ledger,
                args.evidence_report or None, bpy.data.filepath or None,
                expected_ids)
            errors.extend(f"construction gate: {error}"
                          for error in construction["errors"])
        if args.evidence_report:
            evidence_recheck = validate_evidence_report(
                args.evidence_report, errors, names, expected_ids)

    default_cube = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name == "Cube"
        and max(obj.dimensions) > 1.5
    ]
    if default_cube:
        errors.append("default 2 m Cube remains in the scene; review camera can be inside it")

    expected = []
    if args.expected:
        expected = [float(value) for value in args.expected.split(",")]
        if len(expected) != 3:
            raise RuntimeError("--expected needs X,Y,Z")
        deltas = [dimensions[i] - expected[i] for i in range(3)]
        if any(abs(delta) > args.tolerance for delta in deltas):
            errors.append(
                "dimensions outside tolerance: " + json.dumps({
                    "actual": [round(value, 4) for value in dimensions],
                    "expected": expected,
                    "delta": [round(value, 4) for value in deltas],
                    "tolerance": args.tolerance,
                }))
    else:
        deltas = None

    hinge = None
    if args.hinge:
        hinge_obj = bpy.data.objects.get(args.hinge)
        if hinge_obj is None:
            errors.append(f"missing hinge object {args.hinge}")
        else:
            hinge = {
                "name": hinge_obj.name,
                "rotation_mode": hinge_obj.rotation_mode,
                "rotation_euler": [round(value, 4) for value in hinge_obj.rotation_euler],
                "custom_open_angle": hinge_obj.get("open_angle_deg"),
                "has_action": bool(hinge_obj.animation_data and hinge_obj.animation_data.action),
                "has_driver": bool(hinge_obj.animation_data and hinge_obj.animation_data.drivers),
            }

    required_views = [value.strip() for value in args.required_views.split(",") if value.strip()]
    review = None
    if args.review_manifest:
        review = check_review_manifest(
            args.review_manifest, fingerprint, names, errors, required_views,
            expected_ids)
    approval = None
    if args.stage in ("detail", "delivery"):
        if not args.approval:
            errors.append(f"{args.stage} stage requires a recorded silhouette approval")
        else:
            approval = check_approval(
                args.approval, fingerprint, names, args.stage, errors, required_views,
                expected_ids)
    if args.record_approval:
        if not args.review_manifest:
            errors.append("--record-approval requires --review-manifest evidence")
        if not args.note:
            errors.append("--record-approval requires a review note")
        if not args.approved_by:
            errors.append("--record-approval requires --approved-by")

    modifiers = {
        obj.name: [modifier.type for modifier in obj.modifiers]
        for obj in objects if obj.modifiers
    }
    if args.stage in ("silhouette", "detail") and not modifiers:
        warnings.append("no editable modifiers on the target meshes; source may already be applied")

    status = "fail" if errors else ("review" if warnings else "pass")
    report = {
        "tool": "check_shape_gate.py",
        "stage": args.stage,
        "blend": bpy.data.filepath,
        "fingerprint": fingerprint,
        "targets": names,
        "bounds": {
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
            "dimensions": [round(value, 6) for value in dimensions],
            "expected": expected or None,
            "delta": [round(value, 6) for value in deltas] if deltas else None,
            "tolerance": args.tolerance,
        },
        "hinge": hinge,
        "modifiers": modifiers,
        "default_cube_present": bool(default_cube),
        "review": review,
        "approval": approval,
        "construction": construction,
        "evidence_recheck": evidence_recheck,
        "errors": errors,
        "warnings": warnings,
        "status": status,
        "unverified": [
            "reference silhouette fidelity",
            "joint gaps and penetration",
            "visible z-fighting and camera-motion artifacts",
        ],
    }

    if args.record_approval:
        if errors:
            print("SHAPE_GATE " + json.dumps({"status": "fail", "errors": errors}))
            raise SystemExit(1)
        if review is None or review.get("status") != "fresh":
            print("SHAPE_GATE " + json.dumps({
                "status": "fail",
                "errors": ["record approval requires a fresh review manifest"],
            }))
            raise SystemExit(1)
        review_path = Path(args.review_manifest).resolve()
        review_data = json.loads(review_path.read_text(encoding="utf-8"))
        review_frame = review_data.get("settings", {}).get("frame",
                                                          bpy.context.scene.frame_current)
        review_fingerprint = fingerprint_at_frame(names, review_frame, errors)
        if review_fingerprint is None or errors:
            print("SHAPE_GATE " + json.dumps({
                "status": "fail",
                "errors": errors or ["could not fingerprint approval source at review frame"],
            }))
            raise SystemExit(1)
        capture_hashes = {
            capture["view"]: capture["sha256"]
            for capture in review_data.get("captures", [])
            if capture.get("view") and capture.get("sha256")
        }
        approval_path = Path(args.record_approval)
        if approval_path.exists():
            raise FileExistsError(f"Refusing to overwrite {approval_path}")
        approval_path.parent.mkdir(parents=True, exist_ok=True)
        approval_path.write_text(json.dumps({
            "stage": args.stage,
            "status": "pass",
            "fingerprint": review_fingerprint,
            "frame": review_frame,
            "current_fingerprint": fingerprint,
            "targets": names,
            "target_ids": expected_ids,
            "approved_by": args.approved_by,
            "note": args.note,
            "review_manifest": str(review_path),
            "review_manifest_sha256": sha256_file(review_path),
            "reviewed_views": sorted(capture_hashes),
            "capture_hashes": capture_hashes,
            "warnings": warnings,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }, indent=2) + "\n", encoding="utf-8")
        report["recorded_approval"] = str(approval_path)

    path = Path(args.out)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("SHAPE_GATE " + json.dumps({
        "status": report["status"],
        "errors": errors,
        "warnings": warnings,
        "dimensions": report["bounds"]["dimensions"],
        "fingerprint": fingerprint[:12],
    }))
    if report["status"] == "fail":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
