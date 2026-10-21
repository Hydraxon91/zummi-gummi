"""Positive and negative checks for the construction-gated export path."""

import importlib.util
import hashlib
import json
import shutil
import sys
import tempfile
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parents[3] / "asset-pipeline" / "scripts"


def load_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, SCRIPT_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load_module("export_guard_capture", "capture_review.py")
shape_gate = load_module("export_guard_shape_gate", "check_shape_gate.py")
evidence = load_module("export_guard_evidence", "check_evidence.py")
export = load_module("export_guard_export", "export_approved_asset.py")
identity = load_module("export_guard_identity", "asset_identity.py")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(size=0.2, location=(0.0, 0.0, 0.1))
root = bpy.context.object
root.name = "Export_Root"
other = root.copy()
other.data = root.data.copy()
other.name = "Other_Existing_Target"
bpy.context.scene.collection.objects.link(other)
other.location.x = 0.5
root_id = identity.assign_asset_id(root)
other_id = identity.assign_asset_id(other)
pose = bpy.data.objects.new("Export_Pose", None)
bpy.context.scene.collection.objects.link(pose)
pose.location = (0.0, 0.0, 0.0)
pose.keyframe_insert("location", frame=1)
pose.location.z = 0.1
pose.keyframe_insert("location", frame=20)
bpy.context.scene.frame_set(1)

root_dir = Path(tempfile.mkdtemp(prefix="export-guard-test-"))
source_path = root_dir / "source.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(source_path))

try:
    closed_dir = root_dir / "closed"
    sys.argv = [
        "blender", "--", "--out-dir", str(closed_dir), "--preset", "solid",
        "--prefix", "Export_", "--views", "front,side,top,three_quarter",
        "--frame", "1", "--pose-object", "Export_Pose", "--name", "closed",
    ]
    capture.main()
    open_dir = root_dir / "open"
    sys.argv = [
        "blender", "--", "--out-dir", str(open_dir), "--preset", "solid",
        "--prefix", "Export_", "--views", "front,side,top,three_quarter",
        "--frame", "20", "--pose-object", "Export_Pose", "--name", "open",
    ]
    capture.main()

    evidence_path = root_dir / "evidence.json"
    sys.argv = [
        "blender", "--", "--out", str(evidence_path),
        "--manifest", str(closed_dir / "closed_captures.json"),
        "--manifest", str(open_dir / "open_captures.json"),
        "--expect-frames", "1,20",
    ]
    evidence.main()

    approval_path = root_dir / "approval.json"
    approval_out = root_dir / "approval-gate.json"
    sys.argv = [
        "blender", "--", "--out", str(approval_out), "--prefix", "Export_",
        "--stage", "silhouette",
        "--review-manifest", str(closed_dir / "closed_captures.json"),
        "--record-approval", str(approval_path),
        "--approved-by", "export-fixture",
        "--note", "positive export fixture",
    ]
    shape_gate.main()

    brief_path = root_dir / "brief.json"
    ledger_path = root_dir / "ledger.json"
    brief_path.write_text(json.dumps({
        "target": "export fixture cube",
        "target_ids": [root_id],
        "method": "primitive root",
        "alternative": "none for this fixture",
        "controls": ["root transform"],
        "risks": ["fixture only"],
        "representative_test": "closed review",
        "detail_split": {
            "geometry": ["root cube"],
            "material": ["none"],
            "basis": "fixture review distance",
        },
        "decision": "proceed",
    }))
    ledger_path.write_text(json.dumps({"target_ids": [root_id], "entries": [{
        "attempt": 1,
        "criterion": "export fixture",
        "hypothesis": "gate accepts complete evidence",
        "changed_control": "none",
        "outcome": "fixture",
    }]}))

    bpy.context.scene.frame_set(1)
    glb_path = root_dir / "positive.glb"
    export_report = root_dir / "positive-export.json"
    sys.argv = [
        "blender", "--", "--root", "Export_Root",
        "--glb", str(glb_path), "--report", str(export_report),
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_path),
    ]
    export.main()
    assert glb_path.is_file() and glb_path.stat().st_size > 0
    report = json.loads(export_report.read_text())
    assert report["construction"]["status"] == "pass", report

    # Fresh, internally valid evidence for another EXISTING object must not authorize root.
    other_dir = root_dir / "other"
    sys.argv = ["blender", "--", "--out-dir", str(other_dir), "--preset", "solid",
                "--targets", other.name, "--views", "front,side,top,three_quarter",
                "--frame", "1", "--pose-object", "Export_Pose", "--name", "other"]
    capture.main()
    other_evidence = root_dir / "other-evidence.json"
    sys.argv = ["blender", "--", "--out", str(other_evidence), "--manifest",
                str(other_dir / "other_captures.json")]
    evidence.main()
    fresh_errors = []
    assert evidence.validate_evidence_report(other_evidence, fresh_errors)["status"] == "pass"
    assert not fresh_errors
    wrong_glb = root_dir / "wrong-existing-target.glb"
    sys.argv = ["blender", "--", "--root", "Export_Root", "--glb", str(wrong_glb),
                "--report", str(root_dir / "wrong-export.json"), "--approval", str(approval_path),
                "--construction-brief", str(brief_path), "--candidate-ledger", str(ledger_path),
                "--evidence-report", str(other_evidence)]
    try:
        export.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export accepted fresh evidence for another existing target")
    assert not wrong_glb.exists()
    coverage_errors = []
    checked = evidence.validate_evidence_report(
        other_evidence, coverage_errors, [root.name], [root_id])
    assert checked["status"] == "fail" and any("coverage missing" in e for e in coverage_errors)

    # Renaming resolves by identity, but name-bearing fingerprints make old evidence
    # stale rather than silently authorizing the renamed object.
    root.name = "Export_Root_Renamed"
    rename_errors = []
    renamed = evidence.validate_evidence_report(
        evidence_path, rename_errors, ["Export_Root_Renamed"], [root_id])
    assert renamed["status"] == "fail"
    assert any("fingerprint" in error for error in rename_errors), rename_errors
    assert not any("asset_id is missing" in error for error in rename_errors)
    root.name = "Export_Root"

    # A replacement object with the old name but a new identity is not covered.
    root.name = "Export_Root_Original"
    replacement = root.copy(); replacement.data = root.data.copy()
    replacement.name = "Export_Root"
    bpy.context.scene.collection.objects.link(replacement)
    replacement_id = identity.assign_asset_id(replacement)
    replacement_errors = []
    replacement_report = evidence.validate_evidence_report(
        evidence_path, replacement_errors, ["Export_Root"], [replacement_id])
    assert replacement_report["status"] == "fail"
    assert any("coverage missing" in error for error in replacement_errors)
    bpy.data.objects.remove(replacement, do_unlink=True)
    root.name = "Export_Root"

    # Duplicate identities are ambiguous and must be rejected.
    other["asset_id"] = root_id
    duplicate_errors = []
    identity.object_ids([root, other], duplicate_errors)
    assert any("duplicate asset_id" in error for error in duplicate_errors)
    other["asset_id"] = other_id

    for targets, supports, expected_error in [
        ([root.name], [], False),
        ([], [], True),
        ([root.name, other.name], [], True),
        ([root.name, other.name], [other.name], False),
        ([other.name], [other.name], True),
    ]:
        errors = []
        evidence.validate_target_coverage([{"targets": targets}], [root.name], supports, errors)
        assert bool(errors) == expected_error, (targets, supports, errors)
    support_id_errors = []
    evidence.validate_target_coverage(
        [{"target_ids": [root_id, other_id]}], [root.name], [],
        support_id_errors, [root_id], [other_id])
    assert not support_id_errors, support_id_errors

    # Unsaved geometry changes must fail current-source evidence revalidation.
    root.location.x += 0.02
    bpy.context.view_layer.update()
    unsaved_glb = root_dir / "unsaved.glb"
    unsaved_report = root_dir / "unsaved-export.json"
    sys.argv = [
        "blender", "--", "--root", "Export_Root",
        "--glb", str(unsaved_glb), "--report", str(unsaved_report),
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_path),
    ]
    try:
        export.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export accepted unsaved geometry changes")
    assert not unsaved_glb.exists()
    root.location = (0.0, 0.0, 0.1)
    bpy.context.view_layer.update()

    # Swapping a target manifest must fail immediate revalidation.
    closed_data = json.loads((closed_dir / "closed_captures.json").read_text())
    swapped_manifest = root_dir / "swapped-target-captures.json"
    closed_data["targets"] = ["Other_Existing_Target"]
    closed_data["target_ids"] = [other_id]
    swapped_manifest.write_text(json.dumps(closed_data))
    swapped_evidence = json.loads(evidence_path.read_text())
    for entry in swapped_evidence.get("manifests", []):
        if entry.get("path", "").endswith("closed_captures.json"):
            entry["path"] = str(swapped_manifest)
            entry["manifest_sha256"] = hashlib.sha256(
                swapped_manifest.read_bytes()).hexdigest()
    swapped_target_path = root_dir / "swapped-target-evidence.json"
    swapped_target_path.write_text(json.dumps(swapped_evidence))
    target_glb = root_dir / "swapped-target.glb"
    target_report = root_dir / "swapped-target-export.json"
    sys.argv = [
        "blender", "--", "--root", "Export_Root",
        "--glb", str(target_glb), "--report", str(target_report),
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(swapped_target_path),
    ]
    try:
        export.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export accepted swapped target evidence")
    assert not target_glb.exists()

    # Changed geometry/saved source must block a second export.
    root.location.x += 0.05
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
    blocked_glb = root_dir / "changed.glb"
    blocked_report = root_dir / "changed-export.json"
    sys.argv = [
        "blender", "--", "--root", "Export_Root",
        "--glb", str(blocked_glb), "--report", str(blocked_report),
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_path),
    ]
    try:
        export.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export accepted changed source geometry")
    assert not blocked_glb.exists()

    # Restore the source so the next failure isolates swapped evidence, not geometry.
    root.location.x -= 0.05
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path))
    bpy.context.scene.frame_set(1)

    # Swap the evidence source hash to a different source and ensure it is rejected.
    swapped = json.loads(evidence_path.read_text())
    swapped["source_sha256"] = "0" * 64
    swapped_path = root_dir / "swapped-evidence.json"
    swapped_path.write_text(json.dumps(swapped))
    swapped_glb = root_dir / "swapped.glb"
    swapped_report = root_dir / "swapped-export.json"
    sys.argv = [
        "blender", "--", "--root", "Export_Root",
        "--glb", str(swapped_glb), "--report", str(swapped_report),
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(swapped_path),
    ]
    try:
        export.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export accepted swapped evidence")
    assert not swapped_glb.exists()
finally:
    shutil.rmtree(root_dir, ignore_errors=True)

print("TEST_EXPORT_GUARD pass")
