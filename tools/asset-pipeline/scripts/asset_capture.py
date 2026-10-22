"""Reusable solid/material capture of an object set, with state restoration.

Blender-side helper. Import by absolute path; it is not a standalone CLI.

The helper renders the requested objects with optional clay/wire override,
reference-plane visibility and a temporary review rig, then restores the scene
render settings, camera, world and visibility state on success or failure. It
does not judge whether the returned image demonstrates anything, and it does not
save the .blend.
"""

import math
import os

import bpy
from mathutils import Vector

VIEWS = ("front", "back", "side", "side_left", "top", "bottom", "three_quarter")


def _material(name, base, rough=0.4):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*base, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def _emission(name, color, strength=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1.0)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat


def _aim(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def _review_rig(center):
    collection = bpy.data.collections.new("Review_Capture_Rig")
    bpy.context.scene.collection.children.link(collection)
    try:
        for name, offset, energy, size in (
            ("Review_Key", (0.9, -1.1, 1.25), 55.0, 0.9),
            ("Review_Fill", (-1.1, -0.8, 0.65), 22.0, 1.2),
            ("Review_Rim", (-0.2, 1.3, 1.0), 38.0, 1.0),
        ):
            data = bpy.data.lights.new(name, "AREA")
            data.energy = energy
            data.size = size
            light = bpy.data.objects.new(name, data)
            collection.objects.link(light)
            light.location = Vector(center) + Vector(offset)
            _aim(light, center)
    except Exception:
        for light in list(collection.objects):
            data = light.data
            bpy.data.objects.remove(light, do_unlink=True)
            if data is not None and data.users == 0:
                bpy.data.lights.remove(data)
        bpy.data.collections.remove(collection)
        raise
    return collection


def _camera(view, center, scale, res, ortho=True, lens=85.0):
    if view not in VIEWS:
        raise ValueError(view)
    data = bpy.data.cameras.new("Review_Capture_Camera")
    obj = bpy.data.objects.new("Review_Capture_Camera", data)
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.camera = obj
    center = Vector(center)
    data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        data.ortho_scale = scale
    else:
        data.lens = lens
    if view == "front":
        obj.location = center + Vector((0, -3, 0))
        obj.rotation_euler = (math.pi / 2, 0, 0)
    elif view == "back":
        obj.location = center + Vector((0, 3, 0))
        obj.rotation_euler = (math.pi / 2, 0, math.pi)
    elif view == "side":
        obj.location = center + Vector((3, 0, 0))
        obj.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    elif view == "side_left":
        obj.location = center + Vector((-3, 0, 0))
        obj.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    elif view == "top":
        obj.location = center + Vector((0, 0, 3))
        obj.rotation_euler = (0, 0, 0)
    elif view == "bottom":
        obj.location = center + Vector((0, 0, -3))
        obj.rotation_euler = (math.pi, 0, 0)
    else:
        obj.location = center + Vector((0.62, -0.80, 0.38))
        _aim(obj, center)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    return obj


def render_view(path, view, center, scale, *, objects, res=(1100, 825),
                engine="EEVEE", clay=True, show=None, wire=False,
                transparent=False, samples=48, target=None, lens=85.0,
                reference_objects=(), reference_collection=None):
    """Render one view and restore scene state.

    objects: meshes to render. show: optional reference object to reveal.
    reference_objects/reference_collection: hidden for the capture and restored.
    engine: "EEVEE", "CYCLES" or "CURRENT" (leave the scene engine unchanged).
    """
    if view not in VIEWS:
        raise ValueError(view)
    scene = bpy.context.scene
    path = os.path.abspath(path)
    if os.path.exists(path):
        raise RuntimeError(f"refusing to overwrite capture: {path}")
    snapshot = StateSnapshot()
    meshes = [obj for obj in objects if obj.type == "MESH"]
    slot_state = [(slot, slot.material) for obj in meshes for slot in obj.material_slots]
    added_slots = []
    reference_states = {name: bpy.data.objects[name].hide_render
                        for name in reference_objects if name in bpy.data.objects}
    reference_group = (bpy.data.collections.get(reference_collection)
                       if reference_collection else None)
    reference_group_state = reference_group.hide_render if reference_group else None
    wire_copies = []
    temporary_materials = []
    rig = None
    camera = None
    review_world = None
    try:
        for name in reference_states:
            bpy.data.objects[name].hide_render = True
        if reference_group is not None:
            reference_group.hide_render = True
        if show and show in bpy.data.objects:
            bpy.data.objects[show].hide_render = False
            if reference_group is not None:
                reference_group.hide_render = False

        if wire:
            dark = _emission("Review_Wire", (0.06, 0.02, 0.12))
            temporary_materials.append(dark)
            for obj in meshes:
                duplicate = obj.copy()
                duplicate.data = obj.data.copy()
                scene.collection.objects.link(duplicate)
                modifier = duplicate.modifiers.new("wire", "WIREFRAME")
                modifier.thickness = 0.00055
                modifier.use_replace = True
                duplicate.data.materials.clear()
                duplicate.data.materials.append(dark)
                wire_copies.append(duplicate)
            for obj in meshes:
                obj.hide_render = True
        elif clay:
            clay_material = _material("Review_Clay", (0.52, 0.55, 0.60), rough=0.45)
            temporary_materials.append(clay_material)
            for obj in meshes:
                if not obj.material_slots:
                    obj.data.materials.append(clay_material)
                    added_slots.append(obj)
                else:
                    for slot in obj.material_slots:
                        slot.material = clay_material

        if engine == "EEVEE":
            scene.render.engine = "BLENDER_EEVEE"
            scene.eevee.taa_render_samples = samples
        elif engine == "CYCLES":
            scene.render.engine = "CYCLES"
            scene.cycles.samples = samples
            scene.cycles.use_denoising = True
            scene.cycles.device = "CPU"
        elif engine != "CURRENT":
            raise ValueError(engine)
        scene.view_settings.view_transform = "AgX" if clay and not wire else "Standard"
        scene.view_settings.look = "None"
        scene.render.film_transparent = transparent
        scene.render.image_settings.file_format = "PNG"

        review_world = scene.world.copy() if scene.world else bpy.data.worlds.new(
            "Review_Capture_World")
        scene.world = review_world
        review_world.use_nodes = True
        background = next(n for n in review_world.node_tree.nodes
                          if n.type == "BACKGROUND")
        if wire:
            background.inputs[0].default_value = (0.02, 0.02, 0.03, 1)
            background.inputs[1].default_value = 0.0
        else:
            background.inputs[0].default_value = (0.05, 0.055, 0.065, 1)
            background.inputs[1].default_value = 1.0

        if not wire:
            rig = _review_rig(center)
        camera = _camera(view, center, scale, res, ortho=(view != "three_quarter"),
                         lens=lens)
        if target:
            _aim(camera, target)
            bpy.context.view_layer.update()
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print("CAPTURE", path)
    finally:
        try:
            for slot, material in slot_state:
                slot.material = material
            for obj in added_slots:
                obj.data.materials.clear()
            for duplicate in wire_copies:
                data = duplicate.data
                bpy.data.objects.remove(duplicate, do_unlink=True)
                if data.users == 0:
                    bpy.data.meshes.remove(data)
            for name, hidden in reference_states.items():
                bpy.data.objects[name].hide_render = hidden
            if reference_group is not None and reference_group_state is not None:
                reference_group.hide_render = reference_group_state
            for material in temporary_materials:
                bpy.data.materials.remove(material)
            if camera is not None:
                data = camera.data
                bpy.data.objects.remove(camera, do_unlink=True)
                if data.users == 0:
                    bpy.data.cameras.remove(data)
            if rig is not None:
                for light in list(rig.objects):
                    data = light.data
                    bpy.data.objects.remove(light, do_unlink=True)
                    if data is not None and data.users == 0:
                        bpy.data.lights.remove(data)
                bpy.data.collections.remove(rig)
        finally:
            try:
                snapshot.restore()
            finally:
                if review_world is not None:
                    bpy.data.worlds.remove(review_world)
    return path


def _load_capture_review():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().with_name("capture_review.py")
    spec = importlib.util.spec_from_file_location("asset_capture_review_state", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


StateSnapshot = _load_capture_review().StateSnapshot
