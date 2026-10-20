"""Build the Phase 3 curved-surface bake fixture.

A 1 m diameter x 1 m cylinder with a UV seam is baked from a beveled high copy
to 1024 and 2048 albedo/roughness/normal sets. The low object is exported only;
the high object and source material remain in the checkpoint for inspection.
"""

import argparse
import json
import sys
from pathlib import Path

import bpy

TOOL = "asset-pipeline-phase3-curved"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--resolutions", default="1024,2048")
    return parser.parse_args(argv)


def make_cylinder(name):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=64, radius=0.5, depth=1.0, end_fill_type="NGON",
        location=(0, 0, 0))
    ob = bpy.context.object
    ob.name = name
    ob.data.name = name + "_Mesh"
    return ob


def make_source_material():
    material = bpy.data.materials.new("Curved_Source_Mat")
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    wave = tree.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 4.0
    wave.inputs["Distortion"].default_value = 0.0
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.05, 0.55, 0.80, 1.0)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (0.95, 0.35, 0.65, 1.0)
    middle = ramp.color_ramp.elements.new(0.5)
    middle.color = (0.98, 0.88, 0.16, 1.0)
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 9.0
    noise.inputs["Detail"].default_value = 3.0
    roughness = tree.nodes.new("ShaderNodeMapRange")
    roughness.inputs["From Min"].default_value = 0.0
    roughness.inputs["From Max"].default_value = 1.0
    roughness.inputs["To Min"].default_value = 0.18
    roughness.inputs["To Max"].default_value = 0.82
    tree.links.new(coordinates.outputs["Object"], wave.inputs["Vector"])
    tree.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(coordinates.outputs["Object"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], roughness.inputs["Value"])
    tree.links.new(roughness.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def make_target_image(name, resolution, color_space):
    image = bpy.data.images.new(
        name, width=resolution, height=resolution, alpha=False)
    image.colorspace_settings.name = color_space
    return image


def save_image(image, folder):
    path = folder / (image.name + ".png")
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    image.pack()
    return path


def bake_map(low, high, material, image, bake_type, folder, normal=False):
    nodes = material.node_tree.nodes
    target = nodes.get("Bake_Target")
    if target is None:
        target = nodes.new("ShaderNodeTexImage")
        target.name = "Bake_Target"
    target.image = image
    target.select = True
    nodes.active = target
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.cycles.device = "CPU"
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 16
    scene.render.bake.use_selected_to_active = bool(normal)
    if normal:
        high.select_set(True)
        scene.render.bake.normal_space = "TANGENT"
        scene.render.bake.cage_extrusion = 0.08
        scene.render.bake.max_ray_distance = 0.2
    else:
        scene.render.bake.use_pass_direct = False
        scene.render.bake.use_pass_indirect = False
        scene.render.bake.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)
    scene.render.bake.use_selected_to_active = False
    return save_image(image, folder)


def make_export_material(albedo, roughness, normal):
    material = bpy.data.materials.new("Curved_Export_Mat")
    material.use_nodes = True
    tree = material.node_tree
    bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    def texture(image, label):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.name = label + "_Image"
        node.image = image
        return node
    albedo_node = texture(albedo, "Albedo")
    roughness_node = texture(roughness, "Roughness")
    normal_node = texture(normal, "Normal")
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    tree.links.new(albedo_node.outputs["Color"], bsdf.inputs["Base Color"])
    tree.links.new(roughness_node.outputs["Color"], bsdf.inputs["Roughness"])
    tree.links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.0
    return material


def triangulate_for_export(low):
    if low.modifiers.get("Export_Triangulate"):
        return
    modifier = low.modifiers.new("Export_Triangulate", "TRIANGULATE")
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def export_low(low, path):
    triangulate_for_export(low)
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_tangents=True,
        export_yup=True,
    )


def main():
    args = parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = out_dir / "textures"
    texture_dir.mkdir(exist_ok=True)
    checkpoint = out_dir / "curved_001.blend"
    if checkpoint.exists():
        raise FileExistsError("Refusing to overwrite an existing Phase 3 curved checkpoint")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"
    low = make_cylinder("Curved_Low")
    high = low.copy()
    high.data = low.data.copy()
    high.name = "Curved_High"
    high.data.name = "Curved_High_Mesh"
    bpy.context.collection.objects.link(high)
    bpy.context.view_layer.objects.active = high
    high.select_set(True)
    bevel = high.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    high.hide_render = False
    source = make_source_material()
    low.data.materials.clear()
    low.data.materials.append(source)
    resolutions = [int(value) for value in args.resolutions.split(",") if value]
    outputs = []
    for resolution in resolutions:
        low.data.materials[0] = source
        albedo = make_target_image("Curved_Albedo_%s" % resolution, resolution, "sRGB")
        roughness = make_target_image(
            "Curved_Roughness_%s" % resolution, resolution, "Non-Color")
        normal = make_target_image(
            "Curved_Normal_%s" % resolution, resolution, "Non-Color")
        albedo_path = bake_map(low, high, source, albedo, "DIFFUSE", texture_dir)
        roughness_path = bake_map(low, high, source, roughness, "ROUGHNESS", texture_dir)
        normal_path = bake_map(
            low, high, source, normal, "NORMAL", texture_dir, normal=True)
        export_material = make_export_material(albedo, roughness, normal)
        low.data.materials[0] = export_material
        glb = out_dir / ("curved_%s.glb" % resolution)
        export_low(low, glb)
        outputs.append({
            "resolution": resolution,
            "glb": str(glb),
            "albedo": str(albedo_path),
            "roughness": str(roughness_path),
            "normal": str(normal_path),
            "material": export_material.name,
        })
    high.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint))
    low.data.calc_loop_triangles()
    high.data.calc_loop_triangles()
    print("PHASE3_CURVED", json.dumps({
        "tool": TOOL,
        "checkpoint": str(checkpoint),
        "low": low.name,
        "high": high.name,
        "dimensions": [round(float(value), 6) for value in low.dimensions],
        "uv_map": low.data.uv_layers.active.name if low.data.uv_layers.active else None,
        "vertices": len(low.data.vertices),
        "triangles": len(low.data.loop_triangles),
        "high_triangles": len(high.data.loop_triangles),
        "outputs": outputs,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
