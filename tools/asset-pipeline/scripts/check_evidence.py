"""Validate pose-aware capture evidence against the current Blender source.

This is an evidence check, not visual acceptance. It verifies manifest hashes, targets,
frames, recorded controller matrices and final-source fingerprints. It does not prove
contact, likeness or that an "open" pose is functionally adequate.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))
from asset_fingerprint import fingerprint_objects
from asset_identity import get_asset_id, resolve_ids


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--manifest", action="append", required=True)
    parser.add_argument("--min-pose-delta", type=float, default=1e-4)
    parser.add_argument("--expect-frames", default="")
    return parser.parse_args(
        sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def matrix_delta(first, second):
    return max(abs(float(first[row][column]) - float(second[row][column]))
               for row in range(4) for column in range(4))


def current_pose(name):
    obj = bpy.data.objects.get(name)
    if obj is None:
        return None
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [list(row) for row in evaluated.matrix_world]


def build_report(manifest_paths, expect_frames="", min_pose_delta=1e-4,
                 output_path=None):
    errors = []
    warnings = []
    manifests = []
    original_frame = bpy.context.scene.frame_current
    try:
        for manifest_arg in manifest_paths:
            manifest_path = Path(manifest_arg)
            entry = {"path": str(manifest_path), "status": "pass", "errors": []}
            manifests.append(entry)
            if not manifest_path.is_file():
                entry["status"] = "fail"
                entry["errors"].append("manifest not found")
                errors.append(f"manifest not found: {manifest_path}")
                continue
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            entry["manifest_sha256"] = sha256_file(manifest_path)
            entry["frame"] = manifest.get("settings", {}).get("frame")
            entry["pose"] = manifest.get("pose")
            entry["targets"] = manifest.get("targets", [])
            entry["target_ids"] = manifest.get("target_ids", [])

            pose = manifest.get("pose")
            if not pose:
                entry["status"] = "fail"
                entry["errors"].append("manifest has no recorded pose")
                errors.append(f"manifest has no recorded pose: {manifest_path}")
            else:
                entry["pose_object"] = pose.get("object")
                entry["pose_frame"] = pose.get("frame")
                if pose.get("frame") != entry["frame"]:
                    entry["status"] = "fail"
                    entry["errors"].append("pose frame differs from capture frame")
                    errors.append(f"pose frame differs from capture frame: {manifest_path}")

            for capture in manifest.get("captures", []):
                path_value = capture.get("path")
                if not path_value or not Path(path_value).is_file():
                    entry["status"] = "fail"
                    entry["errors"].append(f"capture missing: {path_value}")
                    errors.append(f"capture missing: {path_value}")
                    continue
                if sha256_file(path_value) != capture.get("sha256"):
                    entry["status"] = "fail"
                    entry["errors"].append(f"capture hash stale: {path_value}")
                    errors.append(f"capture hash stale: {path_value}")

            frame = entry["frame"]
            if not isinstance(frame, int):
                entry["status"] = "fail"
                entry["errors"].append("capture frame is missing")
                errors.append(f"capture frame is missing: {manifest_path}")
                continue
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()

            names = manifest.get("targets", [])
            target_ids = manifest.get("target_ids", [])
            if target_ids:
                if len(target_ids) != len(names):
                    entry["status"] = "fail"
                    entry["errors"].append("target names and asset_ids have different lengths")
                    errors.append(
                        f"target names and asset_ids have different lengths: {manifest_path}")
                    objects = []
                else:
                    objects = resolve_ids(target_ids, bpy.data.objects, errors,
                                          label=str(manifest_path))
                    if len(objects) != len(target_ids):
                        entry["status"] = "fail"
                        entry["errors"].append("target asset_id resolution failed")
                entry["resolved_targets"] = [obj.name for obj in objects]
            else:
                warnings.append(f"legacy name-only target evidence: {manifest_path}")
                missing = [name for name in names if bpy.data.objects.get(name) is None]
                if missing:
                    entry["status"] = "fail"
                    entry["errors"].append(f"targets missing: {missing}")
                    errors.append(f"targets missing: {missing}")
                objects = [bpy.data.objects[name] for name in names
                           if bpy.data.objects.get(name) is not None]
                if len(objects) != len(names):
                    entry["status"] = "fail"
            if objects:
                fingerprint = fingerprint_objects(objects)
                entry["current_fingerprint"] = fingerprint
                if fingerprint != manifest.get("fingerprint"):
                    entry["status"] = "fail"
                    entry["errors"].append("source fingerprint no longer matches")
                    errors.append(
                        f"source fingerprint no longer matches: {manifest_path}")

            if pose:
                live_pose = current_pose(pose.get("object", ""))
                if live_pose is None:
                    entry["status"] = "fail"
                    entry["errors"].append("pose object missing")
                    errors.append(f"pose object missing: {pose.get('object')}")
                else:
                    delta = matrix_delta(live_pose, pose.get("matrix_world", live_pose))
                    entry["pose_delta"] = round(delta, 9)
                    if delta > min_pose_delta:
                        entry["status"] = "fail"
                        entry["errors"].append("recorded pose no longer matches")
                        errors.append(f"recorded pose no longer matches: {manifest_path}")
    finally:
        bpy.context.scene.frame_set(original_frame)
        bpy.context.view_layer.update()

    if len(manifests) >= 2:
        reference = manifests[0].get("pose")
        for candidate in manifests[1:]:
            pose = candidate.get("pose")
            if not reference or not pose:
                errors.append("cannot compare poses without recorded matrices")
                continue
            if reference.get("object") != pose.get("object"):
                errors.append("manifests use different pose objects")
            if reference.get("frame") == pose.get("frame"):
                errors.append("manifests use the same frame")
            if not reference.get("matrix_world") or not pose.get("matrix_world"):
                errors.append("manifest pose matrix is missing")
                continue
            delta = matrix_delta(reference.get("matrix_world", []),
                                 pose.get("matrix_world", []))
            if delta < min_pose_delta:
                errors.append("recorded poses are not distinct")
            candidate["pose_delta_from_first"] = round(delta, 9)

    expected = [int(value) for value in expect_frames.split(",") if value.strip()]
    if expected:
        actual = sorted(entry.get("frame") for entry in manifests
                        if isinstance(entry.get("frame"), int))
        if actual != sorted(expected):
            errors.append(
                f"capture frames {actual} do not match expected {sorted(expected)}")

    report = {
        "tool": "check_evidence.py",
        "blend": bpy.data.filepath,
        "source_sha256": (sha256_file(bpy.data.filepath)
                          if bpy.data.filepath and Path(bpy.data.filepath).is_file()
                          else None),
        "status": "pass" if not errors else "fail",
        "errors": errors,
        "warnings": warnings,
        "manifests": manifests,
        "fingerprints": sorted({
            manifest.get("current_fingerprint")
            for manifest in manifests if manifest.get("current_fingerprint")
        }),
        "scope": "pose and freshness evidence only; not visual, contact or likeness approval",
    }
    if output_path is not None:
        output_path = Path(output_path)
        if output_path.exists():
            raise FileExistsError(f"Refusing to overwrite {output_path}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def validate_target_coverage(manifests, expected_targets, support_objects, errors,
                             expected_ids=None, support_ids=None):
    """Coverage across manifests; support objects must be explicitly declared."""
    if (not isinstance(support_objects, list) or
            not all(isinstance(name, str) and name for name in support_objects)):
        errors.append("support_objects must be a list of object names")
        return
    if expected_ids is not None:
        expected = set(expected_ids)
        actual = {asset_id for entry in manifests
                  for asset_id in entry.get("target_ids", []) if asset_id}
        missing = sorted(expected - actual)
        extra = sorted(actual - expected - set(support_ids or []))
        noun = "asset_id"
    else:
        expected = set(expected_targets)
        actual = {name for entry in manifests for name in entry.get("targets", [])}
        missing = sorted(expected - actual)
        extra = sorted(actual - expected - set(support_objects))
        noun = "target"
    if missing:
        errors.append(f"evidence target coverage missing: {missing}")
    if extra:
        errors.append(f"evidence {noun}s not exported or declared support: {extra}")


def validate_evidence_report(evidence_path, errors, expected_targets=None,
                             expected_ids=None):
    path = Path(evidence_path)
    if not path.is_file():
        errors.append(f"evidence report not found: {evidence_path}")
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        manifest_paths = [entry.get("path") for entry in data.get("manifests", [])
                          if isinstance(entry, dict) and entry.get("path")]
        if not manifest_paths:
            errors.append("evidence report has no manifest paths")
            return None
        report = build_report(manifest_paths)
        support_names = data.get("support_objects", [])
        support_ids = data.get("support_ids")
        if expected_ids is not None and support_ids is None:
            support_ids = []
            for name in support_names:
                obj = bpy.data.objects.get(name)
                if obj is None:
                    errors.append(f"support object not found: {name}")
                    continue
                asset_id = get_asset_id(obj)
                if not asset_id:
                    errors.append(f"support object has no asset_id: {name}")
                else:
                    support_ids.append(asset_id)
        if expected_targets is not None or expected_ids is not None:
            coverage_errors = []
            validate_target_coverage(
                report["manifests"], expected_targets or [],
                support_names, coverage_errors, expected_ids, support_ids)
            report["errors"].extend(coverage_errors)
            if coverage_errors:
                report["status"] = "fail"
    except (OSError, ValueError, KeyError) as exc:
        errors.append(f"evidence revalidation failed: {exc}")
        return None
    if report["status"] != "pass":
        errors.extend(f"evidence revalidation: {error}" for error in report["errors"])
    return report


def main():
    args = parse_args()
    report = build_report(args.manifest, args.expect_frames, args.min_pose_delta,
                          args.out)
    print("EVIDENCE_CHECK " + json.dumps({
        "out": str(Path(args.out)),
        "status": report["status"],
        "errors": report["errors"],
    }))
    if report["status"] != "pass":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
