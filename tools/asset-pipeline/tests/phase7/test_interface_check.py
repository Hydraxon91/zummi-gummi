"""Fixtures for the experimental interface checker."""

import importlib.util
import json
import shutil
import sys
import tempfile
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parents[3] / "asset-pipeline" / "scripts"
CHECK_PATH = SCRIPT_DIR / "check_interface.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check = load_module("check_interface_test", CHECK_PATH)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 0.5))
a = bpy.context.object
a.name = "Fixture_A"
bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, 0.0, 1.5))
b = bpy.context.object
b.name = "Fixture_B"

root = Path(tempfile.mkdtemp(prefix="interface-check-test-"))
try:
    cases = [
        ("contact", 1.5, "contact"),
        ("separated", 1.55, "separated"),
        ("intersection", 1.45, "intersection"),
    ]
    for label, z, expect in cases:
        b.location.z = z
        bpy.context.view_layer.update()
        output = root / f"{label}.json"
        sys.argv = [
            "blender", "--",
            "--out", str(output),
            "--a", "Fixture_A",
            "--b", "Fixture_B",
            "--samples", "4",
            "--tolerance", "0.001",
            "--expect", expect,
            "--label", label,
        ]
        check.main()
        report = json.loads(output.read_text())
        assert report["status"] == "pass", report
        assert report["summary"]["samples"] > 0
        if expect == "contact":
            assert report["summary"]["min_abs"] <= 0.001, report
        elif expect == "separated":
            assert report["summary"]["min_signed"] > 0.001, report
        else:
            assert report["summary"]["min_signed"] < -0.001, report

    # Deliberately failing cap-shrinkage fixture: touching cage faces, no support loops
    # or creases. Subdivision must open a measurable gap that the checker detects.
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0.0, 0.0, 0.25))
    cap_a = bpy.context.object
    cap_a.name = "Cap_Unsupported_A"
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(0.0, 0.0, 0.75))
    cap_b = bpy.context.object
    cap_b.name = "Cap_Unsupported_B"
    for obj in (cap_a, cap_b):
        modifier = obj.modifiers.new("Unsupported_Subdivision", "SUBSURF")
        modifier.levels = 2
        modifier.render_levels = 2
    bpy.context.view_layer.update()
    cap_out = root / "cap-shrinkage.json"
    sys.argv = [
        "blender", "--",
        "--out", str(cap_out),
        "--a", "Cap_Unsupported_A",
        "--b", "Cap_Unsupported_B",
        "--samples", "4",
        "--tolerance", "0.001",
        "--expect", "separated",
        "--label", "cap-shrinkage",
    ]
    check.main()
    cap_report = json.loads(cap_out.read_text())
    assert cap_report["status"] == "pass", cap_report
    assert cap_report["summary"]["min_signed"] > 0.001, cap_report
finally:
    shutil.rmtree(root, ignore_errors=True)

print("TEST_INTERFACE_CHECK pass")
