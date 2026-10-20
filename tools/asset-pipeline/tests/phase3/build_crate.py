"""Build a new crate checkpoint with an asymmetric checker material and export GLB.

The source crate is opened read-only; the checkpoint and GLB are written under
the approved Phase 3 scratch directory.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy
import numpy as np

TOOL = "asset-pipeline-phase3-crate"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--resolution", type=int, default=1024)
    return parser.parse_args(argv)


def checker_pixels(size):
    y, x = np.mgrid[0:size, 0:size]
    pixels = np.zeros((size, size, 4), dtype=np.float32)
    # Asymmetric 8x8 checker; quadrant tints make face orientation visible.
    cell = size // 8
    checker = ((x // cell) + (y // cell)) % 2
    pixels[..., 0] = np.where(checker == 0, 0.16, 0.82)
    pixels[..., 1] = np.where(checker == 0, 0.18, 0.80)
    pixels[..., 2] = np.where(checker == 0, 0.20, 0.78)
    top = y < size // 2
    left = x < size // 2
    pixels[..., 0] += np.where(top & left, 0.24, 0.0)
    pixels[..., 1] += np.where((~top) & left, 0.22, 0.0)
    pixels[..., 2] += np.where(top & (~left), 0.26, 0.0)
    pixels[..., 1] += np.where((~top) & (~left), 0.18, 0.0)
    # Strong diagonal marker, not symmetric under a 180-degree flip.
    diagonal = np.abs((x - y) % size)
    pixels[..., 0] = np.where(diagonal < size * 0.025, 0.95, pixels[..., 0])
    pixels[..., 1] = np.where(diagonal < size * 0.025, 0.25, pixels[..., 1])
    pixels[..., 2] = np.where(diagonal < size * 0.025, 0.12, pixels[..., 2])
    # Border exposes seam/padding failures.
    border = 18
    edge = (x < border) | (y < border) | (x >= size - border) | (y >= size - border)
    pixels[edge] = [0.02, 0.02, 0.02, 1.0]
    # Top-left corner marker.
    marker = (x < size * 0.14) & (y > size * 0.86)
    pixels[marker] = [0.98, 0.92, 0.08, 1.0]
    pixels[..., 3] = 1.0
    return np.clip(pixels, 0.0, 1.0)


def make_material(image):
    material = bpy.data.materials.get("Crate_Pilot_Mat")
    if material is None:
        material = bpy.data.materials.new("Crate_Pilot_Mat")
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next((node for node in tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if bsdf is None:
        bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
        output = next((node for node in tree.nodes
                       if node.type == "OUTPUT_MATERIAL"), None)
        if output is None:
            output = tree.nodes.new("ShaderNodeOutputMaterial")
        tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    texture = next((node for node in tree.nodes
                    if node.type == "TEX_IMAGE" and node.image == image), None)
    if texture is None:
        texture = tree.nodes.new("ShaderNodeTexImage")
        texture.image = image
    tree.links.new(texture.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.55
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    source = Path(args.source).resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if Path(bpy.data.filepath).resolve() != source:
        raise RuntimeError("Opened .blend does not match --source: %s" % bpy.data.filepath)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    crate = bpy.data.objects.get("Crate_Body")
    if crate is None or crate.type != "MESH":
        raise RuntimeError("Crate_Body mesh not found")
    if not crate.data.uv_layers.active:
        raise RuntimeError("Crate_Body has no active UV map")
    size = args.resolution
    pixels = checker_pixels(size)
    image = bpy.data.images.get("Crate_Checker_1024")
    if image is None:
        image = bpy.data.images.new(
            "Crate_Checker_1024", width=size, height=size, alpha=True)
    else:
        if image.size[:] != (size, size):
            bpy.data.images.remove(image)
            image = bpy.data.images.new(
                "Crate_Checker_1024", width=size, height=size, alpha=True)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    image.colorspace_settings.name = "sRGB"
    material = make_material(image)
    if not crate.data.materials:
        crate.data.materials.append(material)
    else:
        crate.data.materials[0] = material
    checkpoint = out_dir / "crate_001.blend"
    glb = out_dir / "crate_001.glb"
    if checkpoint.exists() or glb.exists():
        raise FileExistsError("Refusing to overwrite an existing Phase 3 crate output")
    crate.data.calc_loop_triangles()
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
        export_yup=True,
    )
    print("PHASE3_CRATE", json.dumps({
        "tool": TOOL,
        "source": str(source),
        "checkpoint": str(checkpoint),
        "glb": str(glb),
        "resolution": [size, size],
        "uv_map": crate.data.uv_layers.active.name,
        "material": material.name,
        "dimensions": [round(float(value), 6) for value in crate.dimensions],
        "vertices": len(crate.data.vertices),
        "triangles": len(crate.data.loop_triangles),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
