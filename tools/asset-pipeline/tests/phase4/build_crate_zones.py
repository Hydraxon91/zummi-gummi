"""Build a Phase 4 crate checkpoint with explicit material zones.

The source crate is opened read-only. This writes a new checkpoint and GLB under
the approved Phase 4 scratch directory, uses ordinary Blender material slots, and
preserves the source geometry and UVs.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy

TOOL = "asset-pipeline-phase4-zones"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out-dir", required=True)
    return parser.parse_args(argv)


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
    if layer is None:
        return None
    digest = hashlib.sha256()
    for loop in mesh.loops:
        uv = layer.data[loop.index].uv
        digest.update(struct.pack("<2f", uv[0], uv[1]))
    return digest.hexdigest()


def solid_material(name, colour, roughness):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = next(node for node in material.node_tree.nodes
                if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def main():
    args = parse_args()
    source = Path(args.source).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if Path(bpy.data.filepath).resolve() != source:
        raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
    crate = bpy.data.objects.get("Crate_Body")
    if crate is None or crate.type != "MESH":
        raise RuntimeError("Crate_Body mesh not found")
    if not crate.data.uv_layers.active:
        raise RuntimeError("Crate_Body has no active UV map")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = out_dir / "crate_zones_001.blend"
    glb = out_dir / "crate_zones_001.glb"
    if checkpoint.exists() or glb.exists():
        raise FileExistsError("Refusing to overwrite an existing Phase 4 crate output")

    source_geometry = mesh_fingerprint(crate.data)
    source_uv = uv_fingerprint(crate.data)
    source_dimensions = [round(float(value), 6) for value in crate.dimensions]
    source_materials = [slot.material.name if slot.material else None
                        for slot in crate.material_slots]

    edge_material = crate.data.materials[0] if crate.data.materials else None
    if edge_material is None:
        raise RuntimeError("Crate_Body has no source material to preserve")
    main_material = solid_material("Crate_Main_Mat", (0.94, 0.30, 0.08), 0.38)
    crate.data.materials.clear()
    crate.data.materials.append(edge_material)
    crate.data.materials.append(main_material)

    main_faces = []
    edge_faces = []
    for polygon in crate.data.polygons:
        is_main = max(abs(value) for value in polygon.normal) > 0.999
        polygon.material_index = 1 if is_main else 0
        (main_faces if is_main else edge_faces).append(polygon.index)

    if len(main_faces) != 6 or len(edge_faces) != 48:
        raise RuntimeError(
            "Unexpected zone coverage: %d main, %d edge" % (
                len(main_faces), len(edge_faces)))
    if mesh_fingerprint(crate.data) != source_geometry:
        raise RuntimeError("Material assignment changed the mesh fingerprint")
    if uv_fingerprint(crate.data) != source_uv:
        raise RuntimeError("Material assignment changed the UV fingerprint")
    if [round(float(value), 6) for value in crate.dimensions] != source_dimensions:
        raise RuntimeError("Material assignment changed the crate dimensions")

    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
    crate.data.calc_loop_triangles()
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
        export_yup=True,
    )
    report = {
        "tool": TOOL,
        "source": str(source),
        "source_sha256": sha256_file(source),
        "source_geometry_sha256": source_geometry,
        "source_uv_sha256": source_uv,
        "source_dimensions": source_dimensions,
        "source_materials": source_materials,
        "checkpoint": str(checkpoint),
        "glb": str(glb),
        "glb_sha256": sha256_file(glb),
        "zones": {
            "main": {
                "material": main_material.name,
                "slot": 1,
                "polygons": main_faces,
                "polygon_count": len(main_faces),
                "triangles": sum(
                    len(crate.data.polygons[index].vertices) - 2
                    for index in main_faces),
            },
            "edge": {
                "material": edge_material.name,
                "slot": 0,
                "polygons": edge_faces,
                "polygon_count": len(edge_faces),
                "triangles": sum(
                    len(crate.data.polygons[index].vertices) - 2
                    for index in edge_faces),
            },
        },
        "geometry_sha256": mesh_fingerprint(crate.data),
        "uv_sha256": uv_fingerprint(crate.data),
        "dimensions": [round(float(value), 6) for value in crate.dimensions],
        "vertices": len(crate.data.vertices),
        "polygons": len(crate.data.polygons),
        "triangles": len(crate.data.loop_triangles),
    }
    (out_dir / "zone_build.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    print("PHASE4_CRATE_ZONES", json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
