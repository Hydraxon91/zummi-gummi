"""Build the Phase 6 crate delivery with approved teal and silver materials.

The Phase 4 zone checkpoint is opened read-only. This writes a new checkpoint
and self-contained GLB with direct UV-mapped, image-based PBR materials; no
procedural graph is exported.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

parser = argparse.ArgumentParser()
parser.add_argument("--source", required=True)
parser.add_argument("--teal-basecolor", required=True)
parser.add_argument("--teal-normal", required=True)
parser.add_argument("--teal-roughness", required=True)
parser.add_argument("--teal-metallic", required=True)
parser.add_argument("--silver-basecolor", required=True)
parser.add_argument("--silver-normal", required=True)
parser.add_argument("--silver-roughness", required=True)
parser.add_argument("--silver-metallic", required=True)
parser.add_argument("--silver-uv", default=None,
                    help="Optional secondary UV map used only by the silver material")
parser.add_argument("--out-dir", required=True)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

source = Path(args.source).resolve()
if not source.is_file():
    raise FileNotFoundError(source)
if Path(bpy.data.filepath).resolve() != source:
    raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
checkpoint = out_dir / "crate_phase6_001.blend"
glb = out_dir / "crate_phase6_001.glb"
if checkpoint.exists() or glb.exists():
    raise FileExistsError("Refusing to overwrite an existing Phase 6 crate output")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mesh_fingerprint(mesh):
    digest = hashlib.sha256()
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3f", *vertex.co))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<I", len(polygon.vertices)))
        for vertex_index in polygon.vertices:
            digest.update(struct.pack("<I", vertex_index))
    return digest.hexdigest()


def uv_fingerprint(mesh):
    layer = mesh.uv_layers.active
    digest = hashlib.sha256()
    for loop in mesh.loops:
        uv = layer.data[loop.index].uv
        digest.update(struct.pack("<2f", uv[0], uv[1]))
    return digest.hexdigest()


def load_image(path, colorspace):
    image = bpy.data.images.load(str(Path(path).resolve()), check_existing=False)
    image.colorspace_settings.name = colorspace
    image.pack()
    return image


def make_material(name, basecolor, normal, roughness, metallic=None,
                  metallic_default=0.0, uv_map=None):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    uv_node = None
    if uv_map:
        uv_node = nodes.new("ShaderNodeUVMap")
        uv_node.uv_map = uv_map

    def texture(image, label):
        node = nodes.new("ShaderNodeTexImage")
        node.name = label
        node.image = image
        if uv_node is not None:
            links.new(uv_node.outputs["UV"], node.inputs["Vector"])
        return node

    links.new(texture(basecolor, "BaseColor").outputs["Color"],
              bsdf.inputs["Base Color"])
    links.new(texture(roughness, "Roughness").outputs["Color"],
              bsdf.inputs["Roughness"])
    if metallic is not None:
        links.new(texture(metallic, "Metallic").outputs["Color"],
                  bsdf.inputs["Metallic"])
    else:
        bsdf.inputs["Metallic"].default_value = metallic_default
    normal_node = texture(normal, "Normal")
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    return material


crate = bpy.data.objects.get("Crate_Body")
if crate is None or crate.type != "MESH":
    raise RuntimeError("Crate_Body mesh not found")
if len(crate.data.materials) != 2:
    raise RuntimeError("Expected two Phase 4 material slots")
if not crate.data.uv_layers.active:
    raise RuntimeError("Crate_Body has no active UV map")
if args.silver_uv and crate.data.uv_layers.get(args.silver_uv) is None:
    raise RuntimeError("Silver UV map not found: %s" % args.silver_uv)

source_geometry = mesh_fingerprint(crate.data)
source_uv = uv_fingerprint(crate.data)
source_dimensions = [round(float(value), 6) for value in crate.dimensions]
source_materials = [slot.material.name if slot.material else None
                    for slot in crate.material_slots]

teal_base = load_image(args.teal_basecolor, "sRGB")
teal_normal = load_image(args.teal_normal, "Non-Color")
teal_roughness = load_image(args.teal_roughness, "Non-Color")
teal_metallic = load_image(args.teal_metallic, "Non-Color")
silver_base = load_image(args.silver_basecolor, "sRGB")
silver_normal = load_image(args.silver_normal, "Non-Color")
silver_roughness = load_image(args.silver_roughness, "Non-Color")
silver_metallic = load_image(args.silver_metallic, "Non-Color")

teal = make_material(
    "Crate_Teal_Mat", teal_base, teal_normal, teal_roughness,
    metallic=None, metallic_default=0.0)
silver = make_material(
    "Crate_Silver_Mat", silver_base, silver_normal, silver_roughness,
    silver_metallic, uv_map=args.silver_uv)
crate.data.materials[0] = silver
crate.data.materials[1] = teal
crate.data.calc_loop_triangles()

if mesh_fingerprint(crate.data) != source_geometry:
    raise RuntimeError("Material assignment changed the mesh fingerprint")
if uv_fingerprint(crate.data) != source_uv:
    raise RuntimeError("Material assignment changed the UV fingerprint")
if [round(float(value), 6) for value in crate.dimensions] != source_dimensions:
    raise RuntimeError("Material assignment changed the crate dimensions")

bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
bpy.ops.object.select_all(action="DESELECT")
crate.select_set(True)
bpy.context.view_layer.objects.active = crate
bpy.ops.export_scene.gltf(
    filepath=str(glb),
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
)

texture_paths = {
    "teal_basecolor": args.teal_basecolor,
    "teal_normal": args.teal_normal,
    "teal_roughness": args.teal_roughness,
    "teal_metallic": args.teal_metallic,
    "silver_basecolor": args.silver_basecolor,
    "silver_normal": args.silver_normal,
    "silver_roughness": args.silver_roughness,
    "silver_metallic": args.silver_metallic,
}
report = {
    "source": str(source),
    "source_sha256": sha256_file(source),
    "source_materials": source_materials,
    "checkpoint": str(checkpoint),
    "glb": str(glb),
    "glb_sha256": sha256_file(glb),
    "checkpoint_sha256": sha256_file(checkpoint),
    "zones": {
        "main": {"slot": 1, "material": teal.name, "polygons": 6},
        "edge": {"slot": 0, "material": silver.name, "polygons": 48},
    },
    "silver_uv_map": args.silver_uv,
    "textures": {
        key: {
            "path": str(Path(value).resolve()),
            "sha256": sha256_file(value),
        }
        for key, value in texture_paths.items()
    },
    "teal_metallic_treatment": (
        "Generated teal metallic map not connected; painted teal uses constant "
        "metallic 0.0. The map remains recorded as source evidence."),
    "geometry_sha256": mesh_fingerprint(crate.data),
    "uv_sha256": uv_fingerprint(crate.data),
    "dimensions": [round(float(value), 6) for value in crate.dimensions],
    "vertices": len(crate.data.vertices),
    "polygons": len(crate.data.polygons),
    "triangles": len(crate.data.loop_triangles),
}
(out_dir / "build.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print("PHASE6_CRATE", json.dumps(report, sort_keys=True))
