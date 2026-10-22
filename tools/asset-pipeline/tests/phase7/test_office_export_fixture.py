"""Positive fixture for the office-corner export entry point."""
import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

import bpy

SCRIPTS = Path(__file__).resolve().parents[3] / "asset-pipeline" / "scripts"


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


capture = load("office_capture", "capture_review.py")
evidence = load("office_evidence", "check_evidence.py")
identity = load("office_identity", "asset_identity.py")
rootdir = Path(tempfile.mkdtemp(prefix="office-export-fixture-"))
try:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for name in ("7E_Office", "7E_Books", "7E_Lamp", "7E_Frutiger"):
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
    office = bpy.data.collections["7E_Office"]
    root = bpy.data.objects.new("Office_Root", None)
    office.objects.link(root)
    bpy.ops.mesh.primitive_cube_add(size=0.3, location=(0, 0, 0.15))
    cube = bpy.context.object
    cube.name = "Office_Fixture"
    for c in list(cube.users_collection):
        c.objects.unlink(cube)
    office.objects.link(cube)
    cube.parent = root
    cube_id = identity.assign_asset_id(cube)
    pose = bpy.data.objects.new("Office_Pose", None)
    bpy.context.scene.collection.objects.link(pose)
    lamp = bpy.data.objects.new("Office_DeskLamp_Root", None)
    bpy.data.collections["7E_Lamp"].objects.link(lamp)
    bpy.data.objects.new("Office_DeskLamp_Light", None)
    bpy.context.scene.collection.objects.link(bpy.data.objects["Office_DeskLamp_Light"])
    bpy.data.objects.new("Office_Fan_Light", None)
    bpy.context.scene.collection.objects.link(bpy.data.objects["Office_Fan_Light"])
    source = rootdir / "source.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source))

    sys.argv = ["blender", "--", "--out-dir", str(rootdir / "shots"),
                "--preset", "solid", "--targets", "Office_Fixture",
                "--views", "front,side,top,three_quarter", "--frame", "1",
                "--pose-object", "Office_Pose", "--name", "office"]
    capture.main()
    manifest = rootdir / "shots" / "office_captures.json"
    ev = rootdir / "evidence.json"
    sys.argv = ["blender", "--", "--out", str(ev), "--manifest", str(manifest)]
    evidence.main()
    brief = rootdir / "brief.json"
    ledger = rootdir / "ledger.json"
    brief.write_text(json.dumps({
        "target": "office fixture", "target_ids": [cube_id],
        "method": "primitive", "alternative": "none", "controls": ["cube"],
        "risks": ["fixture"], "representative_test": "capture",
        "detail_split": {"geometry": ["cube"], "material": ["none"],
                         "basis": "fixture view"}, "decision": "proceed"}))
    ledger.write_text(json.dumps({"target_ids": [cube_id], "entries": [{
        "attempt": 1, "criterion": "fixture", "hypothesis": "gate passes",
        "changed_control": "none", "outcome": "fixture",
        "kind": "construction", "result": "success"}]}))
    glb = rootdir / "office.glb"
    report = rootdir / "office.json"
    sys.argv = ["blender", "--", "--glb", str(glb), "--report", str(report),
                "--construction-brief", str(brief), "--candidate-ledger", str(ledger),
                "--evidence-report", str(ev)]
    spec = importlib.util.spec_from_file_location(
        "office_export", Path(__file__).resolve().parent / "export_office_corner.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert glb.is_file() and glb.stat().st_size > 0
    assert json.loads(report.read_text())["construction"]["status"] == "pass"
finally:
    shutil.rmtree(rootdir, ignore_errors=True)
print("TEST_OFFICE_EXPORT_FIXTURE pass")
