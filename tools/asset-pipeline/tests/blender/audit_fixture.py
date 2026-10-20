import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools" / "asset-pipeline" / "scripts"))

import audit_asset  # noqa: E402


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"


def make_cube(name, with_material=True, bad_uv=False, with_uv=True):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name + "_Mesh"
    if not with_uv:
        for layer in list(ob.data.uv_layers):
            ob.data.uv_layers.remove(layer)
    else:
        if not ob.data.uv_layers:
            ob.data.uv_layers.new(name="UVMap")
        uv_layer = ob.data.uv_layers.active
        uv_layer.name = "UVMap"
        if bad_uv:
            for loop in uv_layer.data:
                loop.uv = (1.25, 1.25)
        else:
            # A simple non-overlapping unwrap without relying on editor context.
            for polygon in ob.data.polygons:
                polygon.select = True
            bpy.context.view_layer.objects.active = ob
            ob.select_set(True)
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.02)
            bpy.ops.object.mode_set(mode="OBJECT")

    if with_material:
        mat = bpy.data.materials.new(name + "_Mat")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        image = bpy.data.images.new(name + "_Tex", width=8, height=8)
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        ob.data.materials.append(mat)
    return ob


reset_scene()
fixture = make_cube("Fixture_Cube", with_material=True, bad_uv=False)
bad = make_cube("Bad_Cube", with_material=False, bad_uv=True)
bad.location.x = 2.0
no_uv = make_cube("No_UV_Cube", with_material=False, with_uv=False)
no_uv.location.x = 4.0

before_uv = tuple(
    (float(loop.uv.x), float(loop.uv.y))
    for loop in fixture.data.uv_layers["UVMap"].data
)
before_objects = {ob.name for ob in bpy.data.objects}

helpers = audit_asset.load_helpers()
report = audit_asset.build_report(
    ["Fixture_Cube", "Bad_Cube", "No_UV_Cube"], helpers, resolution=64,
    closed=True, profile_path=None)

assert report["schema_version"] == audit_asset.REPORT_SCHEMA_VERSION
assert report["summary"]["objects"] == 3
assert report["objects"]["Fixture_Cube"]["uv"]["layers"]
assert report["objects"]["Fixture_Cube"]["material_slots"]
assert report["objects"]["Bad_Cube"]["material_slots"] == []
assert report["objects"]["No_UV_Cube"]["uv"]["layers"] == []
assert report["summary"]["findings_total"] > 0

codes = {finding["code"] for finding in report["summary"]["findings"]}
assert "mesh_without_material_slots" in codes, codes
assert "no_active_uv" in codes, codes
assert "uv_outside_single_tile" in codes or "uv_out_of_bounds" in codes, codes

after_uv = tuple(
    (float(loop.uv.x), float(loop.uv.y))
    for loop in fixture.data.uv_layers["UVMap"].data
)
assert before_uv == after_uv, "Audit modified source UVs"
assert {ob.name for ob in bpy.data.objects} == before_objects, "Audit modified objects"
assert report["provenance"]["status"] == "audit_only"
assert report["provenance"]["generation"] is None

print("PHASE1A_FIXTURE_PASS", json.dumps({
    "objects": report["summary"]["objects"],
    "errors": report["summary"]["errors"],
    "warnings": report["summary"]["warnings"],
    "codes": sorted(codes),
}, sort_keys=True))
