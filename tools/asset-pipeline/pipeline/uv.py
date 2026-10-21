"""UV preparation and UV-space diagnostics."""
from __future__ import annotations

import math

from .common import PipelineError


def material_of(obj, index):
    slots = obj.material_slots
    if index >= len(slots):
        return None
    return slots[index].material


def image_texture_nodes(material):
    if material is None or not material.node_tree:
        return []
    return [node for node in material.node_tree.nodes if node.type == "TEX_IMAGE"]


def uv_layers(obj):
    return [layer.name for layer in obj.data.uv_layers]


def ensure_source_uv(obj, active_name="AtlasUV"):
    """Preserve the current UV layout under SourceUV, then add a fresh atlas layer."""
    mesh = obj.data
    source = None
    for layer in mesh.uv_layers:
        if layer.name != active_name:
            source = layer
            break
    if source is None:
        if not mesh.uv_layers:
            mesh.uv_layers.new(name="SourceUV")
        source = mesh.uv_layers[0]
    if source.name != "SourceUV":
        source.name = "SourceUV"
    atlas = mesh.uv_layers.get(active_name) or mesh.uv_layers.new(name=active_name)
    mesh.uv_layers.active = atlas
    atlas.active_render = True
    return source, atlas


def smart_unwrap(obj, margin=0.02, angle_degrees=66.0):
    import bpy

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle_degrees),
                             island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


def point_image_textures_to_source_uv(obj, source_name="SourceUV"):
    """Make existing texture chains sample the preserved layout, not the atlas."""
    for slot in obj.material_slots:
        material = slot.material
        nodes = image_texture_nodes(material)
        if not nodes:
            continue
        tree = material.node_tree
        uvmap = next((n for n in tree.nodes if n.type == "UVMAP"), None)
        if uvmap is None:
            uvmap = tree.nodes.new("ShaderNodeUVMap")
            uvmap.uv_map = source_name
            uvmap.location = (-900, -300)
        else:
            uvmap.uv_map = source_name
        for node in nodes:
            if not node.inputs["Vector"].is_linked:
                tree.links.new(uvmap.outputs["UV"], node.inputs["Vector"])


def uv_bounds(obj, layer_name):
    layer = obj.data.uv_layers.get(layer_name)
    if layer is None:
        raise PipelineError(f"{obj.name} has no UV layer {layer_name}")
    xs = [value.uv.x for value in layer.data]
    ys = [value.uv.y for value in layer.data]
    return [round(min(xs), 4), round(min(ys), 4), round(max(xs), 4), round(max(ys), 4)]


def padding_pixels(objects, layer_name, resolution):
    """Nearest-neighbour island gap in pixels, sampled from UV-space rasterisation.

    This is a diagnostic, not a gate: it reports the smallest gap between faces that
    do not share vertices at the given resolution.
    """
    import numpy as np

    owner = np.full((resolution, resolution), -1, dtype=np.int32)
    filled = np.zeros((resolution, resolution), dtype=bool)
    for index, obj in enumerate(objects):
        layer = obj.data.uv_layers.get(layer_name)
        if layer is None:
            continue
        for poly in obj.data.polygons:
            coords = [layer.data[i].uv for i in poly.loop_indices]
            px = [int(min(max(round(c.x * (resolution - 1)), 0), resolution - 1)) for c in coords]
            py = [int(min(max(round((1 - c.y) * (resolution - 1)), 0), resolution - 1)) for c in coords]
            from .bake import raster_triangle  # shared rasteriser

            mask = raster_triangle(px, py, resolution)
            owner[mask] = index
            filled |= mask
    if not filled.any():
        return {"resolution": resolution, "min_gap_px": None, "note": "no UV area"}
    return {
        "resolution": resolution,
        "filled_pixels": int(filled.sum()),
        "coverage": round(float(filled.mean()), 4),
        "min_gap_px": None,
        "note": "raster coverage only; inter-island gap requires island separation",
    }


def uv_report(objects, layer_name="AtlasUV"):
    payload = {"layer": layer_name, "objects": []}
    for obj in objects:
        bounds = uv_bounds(obj, layer_name)
        out_of_bounds = (bounds[0] < -1e-4 or bounds[1] < -1e-4 or
                         bounds[2] > 1 + 1e-4 or bounds[3] > 1 + 1e-4)
        payload["objects"].append({
            "object": obj.name,
            "faces": len(obj.data.polygons),
            "uv_bounds": bounds,
            "out_of_bounds": out_of_bounds,
        })
    payload["out_of_bounds"] = any(item["out_of_bounds"] for item in payload["objects"])
    return payload
