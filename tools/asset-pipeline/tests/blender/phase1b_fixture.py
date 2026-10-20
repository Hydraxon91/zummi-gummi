import json
import math
import os
import sys
from pathlib import Path

import bpy
import bmesh

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "tools" / "asset-pipeline" / "scripts"))

import audit_asset  # noqa: E402


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080


def add_camera(name, location):
    bpy.ops.object.camera_add(location=location)
    camera = bpy.context.object
    camera.name = name
    camera.data.name = name + "_Data"
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    camera.data.type = "PERSP"
    return camera


def unwrap(ob):
    for polygon in ob.data.polygons:
        polygon.select = True
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.1519, island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def make_cube(name, with_uv=True, bad_uv=False, material=None,
              location=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name + "_Mesh"
    if not with_uv:
        for layer in list(ob.data.uv_layers):
            ob.data.uv_layers.remove(layer)
    elif bad_uv:
        layer = ob.data.uv_layers.active or ob.data.uv_layers.new(name="UVMap")
        for item in layer.data:
            item.uv = (1.25, 1.25)
    else:
        unwrap(ob)
    if material:
        ob.data.materials.append(material)
    return ob


def make_material(name, image=None, unresolved=False):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    if image is not None:
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
        tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    if unresolved:
        tree.nodes.new("ShaderNodeGroup").name = "Unresolved_Group"
    return mat


def make_image(name, source="GENERATED", filepath=None):
    image = bpy.data.images.new(name, width=8, height=8)
    if source != "GENERATED":
        image.source = source
    if filepath:
        image.filepath = filepath
    return image


def make_packed_missing_image(name):
    path = Path(bpy.app.tempdir) / "phase1b_packed_source.png"
    source = bpy.data.images.new(name + "_Source", width=8, height=8)
    source.filepath_raw = str(path)
    source.file_format = "PNG"
    source.save()
    packed = bpy.data.images.load(str(path))
    packed.name = name
    packed.pack()
    os.remove(path)
    bpy.data.images.remove(source)
    return packed


def make_grid(name, size, uv_scale=(1.0, 1.0), mixed=False, anisotropic=False):
    bpy.ops.mesh.primitive_grid_add(
        x_subdivisions=4, y_subdivisions=4, size=size)
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name + "_Mesh"
    layer = ob.data.uv_layers.active or ob.data.uv_layers.new(name="UVMap")
    for polygon in ob.data.polygons:
        center_x = polygon.center.x
        for loop_index in polygon.loop_indices:
            uv = layer.data[loop_index].uv.copy()
            if mixed and center_x >= 0:
                uv.x *= 0.4
                uv.y *= 0.4
            elif anisotropic:
                uv.x *= 0.5
            else:
                uv.x *= uv_scale[0]
                uv.y *= uv_scale[1]
            layer.data[loop_index].uv = uv
    return ob


def make_degenerate():
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = "Degenerate_Geometry"
    ob.data.name = "Degenerate_Geometry_Mesh"
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    top = max(bm.faces, key=lambda face: face.normal.z)
    center = top.calc_center_median()
    for vert in top.verts:
        vert.co = center
    bm.to_mesh(ob.data)
    bm.free()
    return ob


reset_scene()
main_camera = add_camera("Main_Camera", (0, 0, 6.0))
density_camera = add_camera("Density_Camera", (0, 0, 2.6))
bpy.context.scene.camera = main_camera

image = make_image("Textured_Image")
textured = make_cube("Textured_Cube", material=make_material("Textured_Mat", image))
textured.location.x = -3.0

bad_uv = make_cube("Bad_UV", bad_uv=True, material=None)
bad_uv.location.x = -1.5

no_uv_plain = make_cube(
    "No_UV_Untextured", with_uv=False,
    material=make_material("Plain_Mat"))
no_uv_plain.location.x = 0.0

no_uv_textured = make_cube(
    "No_UV_Textured", with_uv=False,
    material=make_material("No_UV_Mat", make_image("No_UV_Image")))
no_uv_textured.location.x = 1.5

missing_image = make_image(
    "Missing_Image_Texture", source="FILE",
    filepath="/nonexistent/phase1b_missing.png")
missing = make_cube(
    "Missing_Image", material=make_material("Missing_Mat", missing_image))
missing.location.x = 3.0

unsupported_image = make_image(
    "Unsupported_Image_Texture", source="TILED",
    filepath="/nonexistent/phase1b_udim_<UDIM>.png")
unsupported = make_cube(
    "Unsupported_Image", material=make_material("Unsupported_Mat", unsupported_image))
unsupported.location.x = 4.5

packed_image = make_packed_missing_image("Packed_Source")
packed = make_cube(
    "Packed_Image", material=make_material("Packed_Mat", packed_image))
packed.location.x = 6.0

linked = make_cube(
    "Object_Linked", material=make_material("Linked_Mat", make_image("Linked_Image")))
linked.location.x = -3.0
linked.location.y = 2.0
linked.material_slots[0].link = "OBJECT"

grouped = make_cube(
    "Unresolved_Group",
    material=make_material("Group_Mat", make_image("Group_Image"), unresolved=True))
grouped.location.x = -1.5
grouped.location.y = 2.0

degenerate = make_degenerate()
degenerate.location.x = 0.0
degenerate.location.y = 2.0

grid = make_grid("Density_Grid", 1.0)
mixed = make_grid("Density_Mixed", 1.0, mixed=True)
anisotropic = make_grid("Density_Anisotropic", 1.0, anisotropic=True)

profile_path = Path(bpy.app.tempdir) / "phase1b_profile.json"
profile_data = json.loads(
    (ROOT / "tools" / "asset-pipeline" / "profiles" / "opaque_prop.json").read_text())
profile_data["texel_density"]["camera"] = None
profile_data["texel_density"]["texture_resolutions_px"] = [
    [1024, 1024], [2048, 2048], [4096, 4096]]
profile_path.write_text(json.dumps(profile_data))

before_objects = {ob.name for ob in bpy.data.objects}
before_uv = {
    ob.name: tuple(
        (round(float(item.uv.x), 6), round(float(item.uv.y), 6))
        for item in ob.data.uv_layers.active.data
    )
    for ob in bpy.data.objects
    if ob.type == "MESH" and ob.data.uv_layers.active
}

helpers = audit_asset.load_helpers()
main_objects = [
    "Textured_Cube", "Bad_UV", "No_UV_Untextured", "No_UV_Textured",
    "Missing_Image", "Unsupported_Image", "Packed_Image", "Object_Linked",
    "Unresolved_Group", "Degenerate_Geometry",
]
main_report = audit_asset.build_report(
    main_objects, helpers, resolution=128, closed=False,
    profile_path=str(profile_path), camera_name="Main_Camera")
main_codes = {finding["code"] for finding in main_report["summary"]["findings"]}
assert main_report["schema_version"] == audit_asset.REPORT_SCHEMA_VERSION
assert "missing_external_image" in main_codes, main_codes
assert "unsupported_image_source" in main_codes, main_codes
assert "object_linked_material_slot" in main_codes, main_codes
assert "unresolved_material_groups" in main_codes, main_codes
assert "uv_out_of_bounds" in main_codes or "uv_outside_single_tile" in main_codes
assert any(code.startswith("geometry_") for code in main_codes), main_codes
assert main_report["objects"]["No_UV_Untextured"]["uv_required"] is False
assert main_report["objects"]["No_UV_Textured"]["uv_required"] is True
assert not any(
    finding["code"] == "no_active_uv"
    and finding["object"] == "No_UV_Untextured"
    for finding in main_report["summary"]["findings"]
)
assert any(
    finding["code"] == "no_active_uv"
    and finding["object"] == "No_UV_Textured"
    for finding in main_report["summary"]["findings"]
)
packed_record = main_report["inventory"]["images"]["Packed_Source"]
assert packed_record["packed"] is True, packed_record
assert packed_record["external_file_exists"] is False, packed_record
assert not any(
    "Packed_Source" in finding["message"]
    for finding in main_report["summary"]["findings"]
)

density_report = audit_asset.build_report(
    ["Density_Grid"], helpers, resolution=128, closed=False,
    profile_path=str(profile_path), camera_name="Density_Camera")
density = density_report["objects"]["Density_Grid"]["texel_density"]
resolutions = {
    tuple(item["texture_resolution_px"]): item
    for item in density["resolutions"]
}
assert density["status"] == "review", density["status"]
assert "texel_density_under" in resolutions[(1024, 1024)]["zones"][0]["findings"]
assert "texel_density_under" not in resolutions[(2048, 2048)]["zones"][0]["findings"]
assert "texel_density_over" in resolutions[(4096, 4096)]["zones"][0]["findings"]
assert math.isclose(
    resolutions[(1024, 1024)]["overall"]["ratio"]["median"], 0.998,
    rel_tol=0.02), resolutions[(1024, 1024)]["overall"]["ratio"]

mixed_report = audit_asset.build_report(
    ["Density_Mixed"], helpers, resolution=128, closed=False,
    profile_path=str(profile_path), camera_name="Density_Camera")
mixed_codes = {
    finding["code"]
    for finding in mixed_report["summary"]["findings"]
}
assert "texel_density_inconsistent" in mixed_codes, mixed_codes

aniso_report = audit_asset.build_report(
    ["Density_Anisotropic"], helpers, resolution=128, closed=False,
    profile_path=str(profile_path), camera_name="Density_Camera")
aniso_codes = {
    finding["code"]
    for finding in aniso_report["summary"]["findings"]
}
assert "texel_density_anisotropic" in aniso_codes, aniso_codes

no_camera_report = audit_asset.build_report(
    ["Density_Grid"], helpers, resolution=128, closed=False,
    profile_path=str(profile_path), camera_name=None)
assert no_camera_report["summary"]["texel_density_status"] == "unverified"
assert any(
    finding["code"] == "texel_density_unverified"
    for finding in no_camera_report["summary"]["findings"]
)

after_objects = {ob.name for ob in bpy.data.objects}
after_uv = {
    ob.name: tuple(
        (round(float(item.uv.x), 6), round(float(item.uv.y), 6))
        for item in ob.data.uv_layers.active.data
    )
    for ob in bpy.data.objects
    if ob.type == "MESH" and ob.data.uv_layers.active
}
assert before_objects == after_objects, "Audit modified objects"
assert before_uv == after_uv, "Audit modified source UVs"
assert main_report["provenance"]["schema_version"] == "1.0.0"

print("PHASE1B_FIXTURE_PASS", json.dumps({
    "main_codes": sorted(main_codes),
    "density_status": density_report["summary"]["texel_density_status"],
    "density_1024": resolutions[(1024, 1024)]["status"],
    "density_2048": resolutions[(2048, 2048)]["status"],
    "density_4096": resolutions[(4096, 4096)]["status"],
    "mixed_codes": sorted(mixed_codes),
    "aniso_codes": sorted(aniso_codes),
}, sort_keys=True))
