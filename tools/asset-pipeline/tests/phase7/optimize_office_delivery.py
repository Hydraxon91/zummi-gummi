"""Build an optimized Phase 7E delivery copy without modifying the source.

Static meshes are evaluated and merged by material to cut node/draw-call
overhead. Textures are resized in memory only; the accepted source checkpoint
keeps its original maps and hierarchy.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

import bpy

parse = argparse.ArgumentParser()
parse.add_argument("--out-dir", required=True)
parse.add_argument("--mode", choices=("512", "mixed"), required=True)
args = parse.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

out_dir = Path(args.out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
mode = args.mode
source_path = Path(bpy.data.filepath)
if not source_path.exists():
    raise RuntimeError("Open the accepted source checkpoint before optimizing")
export_blend = out_dir / f"office_corner_opt_{mode}.blend"
glb_path = out_dir / f"office_corner_opt_{mode}.glb"
report_path = out_dir / f"optimization-{mode}.json"
for path in (export_blend, glb_path, report_path):
    if path.exists():
        raise FileExistsError(f"Refusing to overwrite {path}")

scene = bpy.context.scene
source_collections = [bpy.data.collections[name] for name in ("7E_Office", "7E_Books", "7E_Lamp")]
export_collection = bpy.data.collections.new("7E_Delivery_Merged")
scene.collection.children.link(export_collection)
export_root = bpy.data.objects.new("Office_Delivery_Root", None)
export_collection.objects.link(export_root)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def image_users(material):
    return [
        node.image for node in material.node_tree.nodes
        if node.type == "TEX_IMAGE" and node.image is not None
    ] if material and material.use_nodes else []


keep_1024 = set()
if mode == "mixed":
    for name in ("Office_Wall_Wallpaper", "Office_Floor_Parquet"):
        material = bpy.data.materials.get(name)
        if material is None:
            raise RuntimeError(f"Missing material {name}")
        keep_1024.update(image.name for image in image_users(material))

resized = []
seen_images = set()
for material in bpy.data.materials:
    for image in image_users(material):
        if image.name in seen_images:
            continue
        seen_images.add(image.name)
        width, height = image.size[:]
        if width <= 512 and height <= 512:
            continue
        if mode == "mixed" and image.name in keep_1024:
            continue
        image.scale(512, 512)
        image.pack()
        resized.append({"name": image.name, "from": [width, height], "to": [512, 512]})

# Evaluate once with modifiers applied, then build a flat export copy.
depsgraph = bpy.context.evaluated_depsgraph_get()
created = []
for collection in source_collections:
    for source in list(collection.objects):
        if source.type != "MESH":
            continue
        evaluated = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(
            evaluated,
            preserve_all_data_layers=True,
            depsgraph=depsgraph,
        )
        if mesh is None:
            raise RuntimeError(f"Could not evaluate {source.name}")
        mesh.name = "Export_" + source.data.name
        materials = [material for material in source.data.materials if material is not None]
        material_indices = [polygon.material_index for polygon in mesh.polygons]
        mesh.materials.clear()
        for material in materials:
            mesh.materials.append(material)
        for polygon, index in zip(mesh.polygons, material_indices):
            polygon.material_index = index if len(materials) > 1 else 0
        duplicate = bpy.data.objects.new("Export_" + source.name, mesh)
        export_collection.objects.link(duplicate)
        duplicate.matrix_world = source.matrix_world
        bpy.context.view_layer.objects.active = duplicate
        bpy.ops.object.select_all(action="DESELECT")
        duplicate.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        created.append((duplicate, materials))

groups = {}
standalone = []
for duplicate, materials in created:
    if len(materials) == 1:
        groups.setdefault(materials[0].name, []).append(duplicate)
    else:
        standalone.append(duplicate)

merged = []
for material_name, objects in sorted(groups.items()):
    material = bpy.data.materials[material_name]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    active = objects[0]
    bpy.context.view_layer.objects.active = active
    if len(objects) > 1:
        bpy.ops.object.join()
    joined = bpy.context.object
    joined.name = "Delivery_" + material_name
    joined.data.name = "Delivery_" + material_name
    joined.data.materials.clear()
    joined.data.materials.append(material)
    for polygon in joined.data.polygons:
        polygon.material_index = 0
    joined.parent = export_root
    merged.append(joined)

for obj in standalone:
    obj.parent = export_root
    merged.append(obj)

for collection in source_collections:
    collection.hide_render = True
    collection.hide_viewport = True

bpy.ops.wm.save_as_mainfile(filepath=str(export_blend))

bpy.ops.object.select_all(action="DESELECT")
export_root.select_set(True)
for obj in merged:
    obj.select_set(True)
scene.view_layers[0].objects.active = export_root
bpy.ops.export_scene.gltf(
    filepath=str(glb_path),
    export_format="GLB",
    use_selection=True,
    export_apply=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_tangents=True,
    export_yup=True,
    export_cameras=False,
    export_lights=False,
)

triangles = 0
vertices = 0
for obj in merged:
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
    vertices += len(obj.data.vertices)

report = {
    "source": str(source_path),
    "source_sha256": sha256_file(source_path),
    "mode": mode,
    "export_blend": str(export_blend),
    "export_blend_sha256": sha256_file(export_blend),
    "glb": str(glb_path),
    "glb_sha256": sha256_file(glb_path),
    "glb_bytes": glb_path.stat().st_size,
    "source_meshes": sum(1 for collection in source_collections for obj in collection.objects if obj.type == "MESH"),
    "delivery_meshes": len(merged),
    "delivery_material_slots": sum(len(obj.data.materials) for obj in merged),
    "delivery_vertices": vertices,
    "delivery_triangles": triangles,
    "resized_images": resized,
    "kept_1024": sorted(keep_1024) if mode == "mixed" else [],
    "materials": sorted({material.name for obj in merged for material in obj.data.materials if material}),
}
report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print("PHASE7_OFFICE_OPTIMIZED", json.dumps({
    "mode": mode,
    "glb": str(glb_path),
    "bytes": report["glb_bytes"],
    "sha256": report["glb_sha256"],
    "delivery_meshes": report["delivery_meshes"],
    "triangles": report["delivery_triangles"],
    "resized_images": len(resized),
}))
