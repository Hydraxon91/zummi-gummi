"""Self-test for capture_review.py state restoration, cleanup and fingerprints.

Run inside Blender:
  blender --background --factory-startup --python-exit-code 1 \
    --python tools/asset-pipeline/tests/phase7/test_capture_review.py
"""

import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parents[3] / "asset-pipeline" / "scripts"
CAPTURE_PATH = SCRIPT_DIR / "capture_review.py"
FINGERPRINT_PATH = SCRIPT_DIR / "asset_fingerprint.py"
GATE_PATH = SCRIPT_DIR / "check_shape_gate.py"
EVIDENCE_PATH = SCRIPT_DIR / "check_evidence.py"
EXPORT_PATH = SCRIPT_DIR / "export_approved_asset.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load_module("capture_review_test", CAPTURE_PATH)
fingerprint = load_module("asset_fingerprint_test", FINGERPRINT_PATH)
gate = load_module("check_shape_gate_test", GATE_PATH)
evidence = load_module("check_evidence_test", EVIDENCE_PATH)
export_guard = load_module("export_approved_asset_test", EXPORT_PATH)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0.0, 0.0, 0.25))
cube = bpy.context.object
cube.name = "Test_Cube"

bpy.ops.object.camera_add(location=(1.5, -1.5, 1.2))
camera = bpy.context.object
camera.name = "Test_Camera"
camera.data.type = "ORTHO"
camera.data.ortho_scale = 1.0
scene = bpy.context.scene
scene.camera = camera

bpy.ops.object.light_add(type="AREA", location=(1.0, -1.0, 2.0))
bpy.context.object.name = "Test_Light"

bpy.ops.mesh.primitive_cube_add(size=0.2, location=(1.0, 0.0, 0.1))
extra = bpy.context.object
extra.name = "Extra_Cube"

bpy.ops.mesh.primitive_cube_add(size=0.2, location=(-1.0, 0.0, 0.1))
hidden = bpy.context.object
hidden.name = "Hidden_Cube"
hidden.hide_render = True

bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0.0, 0.0, 0.25))
animated = bpy.context.object
animated.name = "Anim_Cube"
for obj in (cube, extra, hidden, animated):
    obj["asset_id"] = "test-" + obj.name
scene.frame_set(1)
animated.location.z = 0.25
animated.keyframe_insert("location", frame=1)
scene.frame_set(10)
animated.location.z = 0.75
animated.keyframe_insert("location", frame=10)
scene.frame_set(2)

scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 320
scene.render.resolution_y = 240
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "SINGLE"
scene.display.shading.single_color = (0.4, 0.5, 0.6)
scene.view_settings.exposure = -1.1
scene.frame_set(2)
bpy.ops.object.select_all(action="DESELECT")
cube.select_set(True)
bpy.context.view_layer.objects.active = cube

# Snapshot/restore covers values changed by each preset and by animation.
snapshot = capture.StateSnapshot()
scene.render.engine = "CYCLES"
scene.render.resolution_x = 800
scene.display.shading.light = "STUDIO"
scene.view_settings.exposure = 0.5
scene.frame_set(7)
camera.location = (9.0, 9.0, 9.0)
cube.hide_render = True
snapshot.restore()
assert scene.render.engine == "BLENDER_WORKBENCH"
assert scene.render.resolution_x == 320
assert scene.display.shading.light == "FLAT"
assert abs(scene.view_settings.exposure - (-1.1)) < 1e-6
assert scene.frame_current == 2
assert all(abs(camera.location[i] - value) < 1e-5
           for i, value in enumerate((1.5, -1.5, 1.2)))
assert cube.hide_render is False

before = fingerprint.fingerprint_objects([cube])
cube.location.x += 0.01
bpy.context.view_layer.update()
after = fingerprint.fingerprint_objects([cube])
assert before != after
cube.location.x -= 0.01
bpy.context.view_layer.update()

# UV edits and material graph edits must also change the fingerprint.
uv_layer = cube.data.uv_layers.active
assert uv_layer is not None
before_uv = fingerprint.fingerprint_objects([cube])
uv_layer.data[0].uv[0] += 0.01
after_uv = fingerprint.fingerprint_objects([cube])
assert before_uv != after_uv
uv_layer.data[0].uv[0] -= 0.01

mat = bpy.data.materials.new("Test_Material")
mat.use_nodes = True
bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
cube.data.materials.append(mat)
before_material = fingerprint.fingerprint_objects([cube])
bsdf.inputs["Base Color"].default_value = (0.8, 0.2, 0.1, 1.0)
after_material = fingerprint.fingerprint_objects([cube])
assert before_material != after_material

# A modifier operand's transform is part of the dependency state.
bpy.ops.mesh.primitive_cube_add(size=0.2, location=(1.0, 0.0, 0.1))
operand = bpy.context.object
operand.name = "Operand_Cube"
operand["asset_id"] = "test-Operand_Cube"
operand_modifier = cube.modifiers.new("Operand_Test", "BOOLEAN")
operand_modifier.operation = "DIFFERENCE"
operand_modifier.object = operand
before_operand = fingerprint.fingerprint_objects([cube])
operand.location.x += 0.1
bpy.context.view_layer.update()
after_operand = fingerprint.fingerprint_objects([cube])
assert before_operand != after_operand
cube.modifiers.remove(operand_modifier)
bpy.data.objects.remove(operand, do_unlink=True)

root = Path(tempfile.mkdtemp(prefix="capture-review-test-"))
try:
    success_dir = root / "success"
    sys.argv = [
        "blender", "--",
        "--out-dir", str(success_dir),
        "--preset", "solid",
        "--prefix", "Test_",
        "--views", "front,side,top,three_quarter",
        "--name", "fixture",
        "--frame", "2",
        "--pose-object", "Anim_Cube",
        "--focus-targets", "Test_Cube,Extra_Cube",
        "--focus-view", "side",
        "--isolate",
    ]
    capture.main()
    manifest = json.loads((success_dir / "fixture_captures.json").read_text())
    assert len(manifest["captures"]) == 5
    assert manifest["fingerprint"]
    assert manifest["restored"] is True
    assert manifest["pose"]["object"] == "Anim_Cube"
    assert manifest["settings"]["focus_targets"] == ["Extra_Cube", "Test_Cube"]
    assert any(capture["view"] == "focus_side" for capture in manifest["captures"])
    assert scene.camera is camera
    assert scene.render.resolution_x == 320
    assert scene.display.shading.light == "FLAT"
    assert abs(scene.view_settings.exposure - (-1.1)) < 1e-6
    assert scene.frame_current == 2
    assert bpy.data.objects.get("Review_Capture_Camera") is None
    assert bpy.data.collections.get("Review_Capture_Lights") is None
    assert extra.hide_render is False
    assert hidden.hide_render is True

    open_dir = root / "open"
    sys.argv = [
        "blender", "--",
        "--out-dir", str(open_dir),
        "--preset", "solid",
        "--prefix", "Test_",
        "--views", "front,side,top,three_quarter",
        "--frame", "10",
        "--pose-object", "Anim_Cube",
        "--name", "fixture_open",
        "--isolate",
    ]
    capture.main()
    evidence_out = root / "evidence-pass.json"
    sys.argv = [
        "blender", "--",
        "--out", str(evidence_out),
        "--manifest", str(success_dir / "fixture_captures.json"),
        "--manifest", str(open_dir / "fixture_open_captures.json"),
        "--expect-frames", "2,10",
    ]
    evidence.main()
    evidence_report = json.loads(evidence_out.read_text())
    assert evidence_report["status"] == "pass", evidence_report
    assert evidence_report["manifests"][1]["pose_delta_from_first"] > 0.1

    same_pose_out = root / "evidence-same-pose.json"
    sys.argv = [
        "blender", "--",
        "--out", str(same_pose_out),
        "--manifest", str(success_dir / "fixture_captures.json"),
        "--manifest", str(success_dir / "fixture_captures.json"),
    ]
    try:
        evidence.main()
    except SystemExit:
        pass
    same_pose_report = json.loads(same_pose_out.read_text())
    assert same_pose_report["status"] == "fail"
    assert any("same frame" in error for error in same_pose_report["errors"])

    cube.location.x += 0.01
    bpy.context.view_layer.update()
    stale_evidence_out = root / "evidence-stale.json"
    sys.argv = [
        "blender", "--",
        "--out", str(stale_evidence_out),
        "--manifest", str(success_dir / "fixture_captures.json"),
        "--manifest", str(open_dir / "fixture_open_captures.json"),
    ]
    try:
        evidence.main()
    except SystemExit:
        pass
    stale_evidence_report = json.loads(stale_evidence_out.read_text())
    assert stale_evidence_report["status"] == "fail"
    assert any("fingerprint no longer matches" in error
               for error in stale_evidence_report["errors"])
    cube.location.x -= 0.01
    bpy.context.view_layer.update()

    # The requested frame must be applied before bounds are measured.
    animated_dir = root / "animated"
    sys.argv = [
        "blender", "--",
        "--out-dir", str(animated_dir),
        "--preset", "solid",
        "--prefix", "Anim_",
        "--views", "front",
        "--frame", "10",
        "--name", "anim",
        "--isolate",
    ]
    capture.main()
    animated_manifest = json.loads((animated_dir / "anim_captures.json").read_text())
    animated_min = animated_manifest["bounds"]["min"][2]
    animated_max = animated_manifest["bounds"]["max"][2]
    assert abs(animated_min - 0.6) < 1e-4, animated_manifest["bounds"]
    assert abs(animated_max - 0.9) < 1e-4, animated_manifest["bounds"]
    assert scene.frame_current == 2

    failure_dir = root / "failure"
    failure_dir.mkdir()
    (failure_dir / "fixture_side_solid.png").write_bytes(b"pre-existing")
    sys.argv = [
        "blender", "--",
        "--out-dir", str(failure_dir),
        "--preset", "solid",
        "--prefix", "Test_",
        "--views", "front,side",
        "--frame", "2",
        "--name", "fixture",
        "--isolate",
    ]
    try:
        capture.main()
    except FileExistsError:
        pass
    else:
        raise AssertionError("capture_review did not refuse an existing capture")
    assert scene.camera is camera
    assert scene.render.resolution_x == 320
    assert scene.display.shading.light == "FLAT"
    assert abs(scene.view_settings.exposure - (-1.1)) < 1e-6
    assert scene.frame_current == 2
    assert bpy.data.objects.get("Review_Capture_Camera") is None
    assert bpy.data.collections.get("Review_Capture_Lights") is None
    assert extra.hide_render is False
    assert hidden.hide_render is True

    # A render operator exception must still restore the scene and remove temp data.
    forced_dir = root / "forced-render-error"
    original_render = capture.render_still

    def forced_render_error():
        raise RuntimeError("forced render exception")

    capture.render_still = forced_render_error
    sys.argv = [
        "blender", "--",
        "--out-dir", str(forced_dir),
        "--preset", "solid",
        "--prefix", "Test_",
        "--views", "front",
        "--frame", "2",
        "--name", "fixture",
        "--isolate",
    ]
    try:
        capture.main()
    except RuntimeError:
        pass
    else:
        raise AssertionError("capture_review did not propagate the render exception")
    finally:
        capture.render_still = original_render
    assert scene.camera is camera
    assert scene.render.resolution_x == 320
    assert scene.frame_current == 2
    assert bpy.data.objects.get("Review_Capture_Camera") is None
    assert bpy.data.collections.get("Review_Capture_Lights") is None
    assert extra.hide_render is False
    assert hidden.hide_render is True

    # Material preset: temporary lights/world must not survive, and the scene engine
    # and original world must be restored.
    scene.world = None
    light = bpy.data.objects.get("Test_Light")
    if light is not None:
        bpy.data.objects.remove(light, do_unlink=True)
    material_dir = root / "material"
    sys.argv = [
        "blender", "--",
        "--out-dir", str(material_dir),
        "--preset", "material",
        "--prefix", "Test_",
        "--views", "three_quarter",
        "--frame", "2",
        "--name", "fixture",
        "--isolate",
    ]
    capture.main()
    assert scene.render.engine == "BLENDER_WORKBENCH"
    assert scene.world is None, scene.world
    assert bpy.data.objects.get("Review_Capture_Camera") is None
    assert bpy.data.collections.get("Review_Capture_Lights") is None
    assert bpy.data.worlds.get("Review_Capture_World") is None
    assert extra.hide_render is False
    assert hidden.hide_render is True

    silhouette_out = root / "gate-silhouette.json"
    sys.argv = [
        "blender", "--",
        "--out", str(silhouette_out),
        "--prefix", "Test_",
        "--stage", "silhouette",
        "--review-manifest", str(success_dir / "fixture_captures.json"),
    ]
    gate.main()
    silhouette_report = json.loads(silhouette_out.read_text())
    assert not silhouette_report["errors"]
    assert silhouette_report["status"] in ("pass", "review")

    brief_path = root / "brief.json"
    ledger_path = root / "ledger.json"
    brief_path.write_text(json.dumps({
        "target": "test fixture",
        "target_ids": [cube["asset_id"]],
        "method": "lofted cage",
        "alternative": "stacked primitives",
        "controls": ["ring table"],
        "risks": ["cap shrinkage"],
        "representative_test": "closed rim",
        "detail_split": {
            "geometry": ["closed rim"],
            "material": ["test colour"],
            "basis": "fixture review view",
        },
        "decision": "proceed",
    }))
    ledger_path.write_text(json.dumps({"target_ids": [cube["asset_id"]], "entries": [{
        "attempt": 1,
        "criterion": "closed rim",
        "hypothesis": "shared seam",
        "changed_control": "seam ring",
        "outcome": "thin seam",
        "kind": "construction", "result": "success",
    }]}))
    construction_out = root / "gate-construction.json"
    sys.argv = [
        "blender", "--",
        "--out", str(construction_out),
        "--prefix", "Test_",
        "--stage", "silhouette",
        "--review-manifest", str(success_dir / "fixture_captures.json"),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_out),
    ]
    gate.main()
    construction_report = json.loads(construction_out.read_text())
    assert construction_report["construction"]["status"] == "pass"
    assert construction_report["status"] in ("pass", "review")

    # A changed source must invalidate the old capture manifest.
    cube.location.x += 0.01
    bpy.context.view_layer.update()
    stale_out = root / "gate-stale.json"
    sys.argv = [
        "blender", "--",
        "--out", str(stale_out),
        "--prefix", "Test_",
        "--stage", "silhouette",
        "--review-manifest", str(success_dir / "fixture_captures.json"),
    ]
    try:
        gate.main()
    except SystemExit:
        pass
    stale_report = json.loads(stale_out.read_text())
    assert stale_report["status"] == "fail"
    assert any("fingerprint does not match" in error for error in stale_report["errors"])
    cube.location.x -= 0.01
    bpy.context.view_layer.update()

    # A matching recorded silhouette approval unlocks detail; a missing one does not.
    approval_path = root / "approval.json"
    record_out = root / "gate-record.json"
    sys.argv = [
        "blender", "--",
        "--out", str(record_out),
        "--prefix", "Test_",
        "--stage", "silhouette",
        "--review-manifest", str(success_dir / "fixture_captures.json"),
        "--record-approval", str(approval_path),
        "--approved-by", "test-fixture",
        "--note", "test fixture reviewed front and side captures",
    ]
    gate.main()
    assert approval_path.is_file()
    approval_data = json.loads(approval_path.read_text())
    assert approval_data["review_manifest"] == str((success_dir / "fixture_captures.json").resolve())
    assert approval_data["review_manifest_sha256"]
    assert set(approval_data["reviewed_views"]) == {
        "front", "side", "top", "three_quarter", "focus_side"}
    approved_out = root / "gate-detail-approved.json"
    sys.argv = [
        "blender", "--",
        "--out", str(approved_out),
        "--prefix", "Test_",
        "--stage", "detail",
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_out),
    ]
    gate.main()
    approved_report = json.loads(approved_out.read_text())
    assert not approved_report["errors"]
    assert approved_report["status"] in ("pass", "review")

    # Approval recorded from an open-pose manifest must remain valid while the
    # current frame is closed; the gate evaluates the approval at its own frame.
    open_approval_path = root / "approval-open.json"
    record_open_out = root / "gate-record-open.json"
    sys.argv = [
        "blender", "--",
        "--out", str(record_open_out),
        "--prefix", "Test_",
        "--stage", "silhouette",
        "--review-manifest", str(open_dir / "fixture_open_captures.json"),
        "--record-approval", str(open_approval_path),
        "--approved-by", "test-fixture",
        "--note", "open-pose approval fixture",
    ]
    gate.main()
    open_approval = json.loads(open_approval_path.read_text())
    assert open_approval["frame"] == 10, open_approval
    open_detail_out = root / "gate-detail-open-approval.json"
    sys.argv = [
        "blender", "--",
        "--out", str(open_detail_out),
        "--prefix", "Test_",
        "--stage", "detail",
        "--approval", str(open_approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_out),
    ]
    gate.main()
    assert scene.frame_current == 2
    open_detail_report = json.loads(open_detail_out.read_text())
    assert not open_detail_report["errors"], open_detail_report
    assert open_detail_report["status"] in ("pass", "review")

    # Deleting a reviewed capture must invalidate the recorded approval.
    (success_dir / "fixture_front_solid.png").unlink()
    invalidated_out = root / "gate-detail-invalidated.json"
    sys.argv = [
        "blender", "--",
        "--out", str(invalidated_out),
        "--prefix", "Test_",
        "--stage", "detail",
        "--approval", str(approval_path),
        "--construction-brief", str(brief_path),
        "--candidate-ledger", str(ledger_path),
        "--evidence-report", str(evidence_out),
    ]
    try:
        gate.main()
    except SystemExit:
        pass
    invalidated_report = json.loads(invalidated_out.read_text())
    assert invalidated_report["status"] == "fail"
    assert any("review capture is missing" in error
               for error in invalidated_report["errors"])

    detail_out = root / "gate-detail.json"
    sys.argv = [
        "blender", "--",
        "--out", str(detail_out),
        "--prefix", "Test_",
        "--stage", "detail",
    ]
    try:
        gate.main()
    except SystemExit:
        pass
    detail_report = json.loads(detail_out.read_text())
    assert detail_report["status"] == "fail"
    assert any("requires a recorded silhouette approval" in error
               for error in detail_report["errors"])

    # The canonical export path must reject an invocation that omits construction
    # evidence, even if the old approval arguments are present.
    sys.argv = [
        "blender", "--",
        "--root", "Test_Cube",
        "--glb", str(root / "blocked.glb"),
        "--report", str(root / "blocked-export.json"),
        "--approval", str(approval_path),
    ]
    try:
        export_guard.main()
    except SystemExit:
        pass
    else:
        raise AssertionError("export guard accepted an invocation without construction evidence")
finally:
    shutil.rmtree(root, ignore_errors=True)

print("TEST_CAPTURE_REVIEW pass")
