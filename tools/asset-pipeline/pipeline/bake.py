"""Atlas bake: object-coordinate and procedural shading -> glTF-safe UV images."""
from __future__ import annotations

import math
import uuid
from pathlib import Path

import numpy as np

from .common import PipelineError, sha256_file
from .uv import ensure_source_uv, point_image_textures_to_source_uv, smart_unwrap

CHANNELS = ("basecolor", "roughness", "metallic", "normal", "alpha")
SOCKETS = {"basecolor": "Base Color", "roughness": "Roughness",
           "metallic": "Metallic", "alpha": "Alpha"}


def principled(material):
    if material is None or not material.node_tree:
        return None
    return next((node for node in material.node_tree.nodes
                 if node.type == "BSDF_PRINCIPLED"), None)


def raster_triangle(px, py, size):
    """Binary mask of one triangle in pixel space (top-left origin)."""
    mask = np.zeros((size, size), dtype=bool)
    x0, x1 = max(0, min(px)), min(size - 1, max(px))
    y0, y1 = max(0, min(py)), min(size - 1, max(py))
    if x1 < x0 or y1 < y0:
        return mask
    xs = np.arange(x0, x1 + 1)
    ys = np.arange(y0, y1 + 1)
    grid_x, grid_y = np.meshgrid(xs, ys)
    (ax, bx, cx), (ay, by, cy) = px[:3], py[:3]
    denominator = ((by - cy) * (ax - cx) + (cx - bx) * (ay - cy)) or 1e-6
    w0 = ((by - cy) * (grid_x - cx) + (cx - bx) * (grid_y - cy)) / denominator
    w1 = ((cy - ay) * (grid_x - cx) + (ax - cx) * (grid_y - cy)) / denominator
    w2 = 1 - w0 - w1
    inside = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
    mask[y0:y1 + 1, x0:x1 + 1] = inside
    return mask


def duplicate_and_join(objects):
    """Evaluate each source and merge into one atlas mesh with recorded face ranges."""
    import bpy
    import bmesh

    scene = bpy.context.scene
    depsgraph = bpy.context.evaluated_depsgraph_get()
    merged = bmesh.new()
    materials = []
    material_index = {}
    ranges = []
    copies = []
    for source_id, obj in enumerate(objects):
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        # Bake in world space: apply the source transform to the evaluated copy so the
        # merged atlas sits at the origin and parts can be restored to local space later.
        mesh.transform(obj.matrix_world)
        duplicate = bpy.data.objects.new(f"Atlas_{obj.name}", mesh)
        scene.collection.objects.link(duplicate)
        source_layer = next((layer.name for layer in mesh.uv_layers if layer.active_render), None)
        used_slots = {face.material_index for face in mesh.polygons}
        for index, slot in enumerate(duplicate.material_slots):
            if slot.material is None:
                if index not in used_slots:
                    continue  # Boolean evaluation can append an unused null slot.
                raise PipelineError(f"{obj.name}: empty material slot")
            source_material_name = slot.material.get('pipeline_source_material', slot.material.name)
            slot.material = slot.material.copy()
            slot.material['pipeline_source_material'] = source_material_name
            tree = slot.material.node_tree
            if tree is None:
                raise PipelineError(f"{obj.name}: node material required")
            for node in list(tree.nodes):
                if node.type == 'TEX_COORD':
                    if node.outputs['Generated'].is_linked:
                        raise PipelineError(f"{obj.name}: Generated coordinates not yet supported")
                    if node.object is None:
                        node.object = obj
                    if node.outputs['UV'].is_linked:
                        if source_layer is None:
                            raise PipelineError(f"{obj.name}: UV input without a UV layer")
                        uv = tree.nodes.new('ShaderNodeUVMap')
                        uv.uv_map = source_layer
                        for link in list(node.outputs['UV'].links):
                            tree.links.new(uv.outputs['UV'], link.to_socket)
                if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                    if source_layer is None:
                        raise PipelineError(f"{obj.name}: implicit UV texture without a UV layer")
                    uv = tree.nodes.new('ShaderNodeUVMap')
                    uv.uv_map = source_layer
                    tree.links.new(uv.outputs['UV'], node.inputs['Vector'])

        # Triangulate BEFORE merge: the bake triangulates anyway, and ranges recorded
        # on pre-triangulation faces no longer align once triangulation inserts faces.
        # Use the modifier rather than a bmesh round trip: bmesh + custom split normals
        # duplicated vertices, which silently inflates the atlas.
        bpy.ops.object.select_all(action='DESELECT')
        duplicate.select_set(True)
        bpy.context.view_layer.objects.active = duplicate
        modifier = duplicate.modifiers.new('Pipeline_Prep_Triangulate', 'TRIANGULATE')
        modifier.quad_method = 'BEAUTY'
        modifier.ngon_method = 'BEAUTY'
        bpy.ops.object.modifier_apply(modifier=modifier.name)

        # Merge in a deterministic order; bmesh appends, so face ranges are contiguous.
        face_start = len(merged.faces)
        merged.from_mesh(duplicate.data)
        merged.faces.ensure_lookup_table()
        for face in merged.faces[face_start:]:
            material = duplicate.material_slots[face.material_index].material
            if material is None:
                raise PipelineError(f'{obj.name}: face without material')
            if id(material) not in material_index:
                material_index[id(material)] = len(materials)
                materials.append(material)
            face.material_index = material_index[id(material)]
        ranges.append({'source': obj.name, 'face_start': face_start,
                       'face_end': len(merged.faces)})
        copies.append(duplicate)

    atlas_mesh = bpy.data.meshes.new('Asset_Atlas_Mesh')
    merged.to_mesh(atlas_mesh)
    merged.free()
    for material in materials:
        atlas_mesh.materials.append(material)
    atlas = bpy.data.objects.new('Asset_Atlas', atlas_mesh)
    scene.collection.objects.link(atlas)
    for duplicate in copies:
        for collection in list(duplicate.users_collection):
            collection.objects.unlink(duplicate)
        bpy.data.objects.remove(duplicate)
    return atlas, copies, ranges


def emission_variant(material, socket_name, image):
    """Copy the material and drive an Emission shader from one Principled input."""
    temp = material.copy()
    temp.name = f"BAKE_{socket_name}_{material.name}"[:60]
    tree = temp.node_tree
    base = principled(temp)
    output = next(node for node in tree.nodes if node.type == "OUTPUT_MATERIAL")
    emission = tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    source = base.inputs[socket_name]
    if source.is_linked:
        tree.links.new(source.links[0].from_socket, emission.inputs["Color"])
    else:
        value = source.default_value
        if isinstance(value, float):
            emission.inputs["Color"].default_value = (value, value, value, 1.0)
        else:
            emission.inputs["Color"].default_value = (value[0], value[1], value[2], 1.0)
    for link in list(output.inputs["Surface"].links):
        tree.links.remove(link)
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])
    tex = tree.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-600, 400)
    tex.select = True
    tree.nodes.active = tex
    return temp


def new_image(name, resolution, colorspace):
    import bpy

    image = bpy.data.images.new(name, width=resolution, height=resolution, alpha=True)
    image.colorspace_settings.name = colorspace
    return image


def configure_bake(scene, samples, margin):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.device = "CPU"
    settings = scene.render.bake
    settings.margin = margin
    settings.use_clear = True
    settings.use_selected_to_active = False
    settings.target = "IMAGE_TEXTURES"


def bake_channel(atlas, channel, image, samples, margin):
    import bpy

    scene = bpy.context.scene
    configure_bake(scene, samples, margin)
    bpy.ops.object.select_all(action="DESELECT")
    atlas.select_set(True)
    bpy.context.view_layer.objects.active = atlas
    original = [slot.material for slot in atlas.material_slots]

    if channel == "normal":
        targets = []
        for material in original:
            if material is None or not material.node_tree:
                continue
            node = material.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            node.select = True
            material.node_tree.nodes.active = node
            targets.append((material, node))
        scene.render.bake.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
        for material, node in targets:
            material.node_tree.nodes.remove(node)
        return

    temporary = []
    for index, material in enumerate(original):
        if material is None or principled(material) is None:
            continue
        temp = emission_variant(material, SOCKETS[channel], image)
        atlas.material_slots[index].material = temp
        temporary.append((index, temp))
    try:
        bpy.ops.object.bake(type="EMIT")
    finally:
        for index, temp in temporary:
            atlas.material_slots[index].material = original[index]
        for _, temp in temporary:
            bpy.data.materials.remove(temp)


def save_image(image, path):
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return {"path": str(path), "bytes": Path(path).stat().st_size,
            "sha256": sha256_file(path)}


def compose_orm(roughness, metallic, path):
    """glTF metallicRoughness: R=1 (AO), G=roughness, B=metallic."""
    size = roughness.size[0]
    rough = np.array(roughness.pixels[:], dtype=np.float32).reshape(size, size, 4)
    metal = np.array(metallic.pixels[:], dtype=np.float32).reshape(size, size, 4)
    import bpy

    image = bpy.data.images.new("Atlas_ORM", width=size, height=size, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    pixels = np.ones((size, size, 4), dtype=np.float32)
    pixels[:, :, 1] = rough[:, :, 0]
    pixels[:, :, 2] = metal[:, :, 0]
    image.pixels = pixels.reshape(-1).tolist()
    image.filepath_raw = str(path)
    image.file_format = "PNG"
    image.save()
    return image, {"path": str(path), "bytes": Path(path).stat().st_size,
                   "sha256": sha256_file(path)}


def build_atlas_material(images, alpha_mode, source=None):
    import bpy

    material = source.copy() if source is not None else bpy.data.materials.new("Atlas_PBR")
    material.name = 'Atlas_' + source.name if source is not None else 'Atlas_PBR'
    material.use_nodes = True
    tree = material.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    shader = tree.nodes.new("ShaderNodeBsdfPrincipled")
    if source is not None:
        original = principled(source)
        baked_sockets = {'Base Color', 'Roughness', 'Metallic', 'Normal', 'Alpha'}
        for socket in original.inputs:
            if (socket.is_unavailable or socket.name in baked_sockets or
                    not hasattr(socket, 'default_value')):
                continue
            if socket.is_linked:
                raise PipelineError(f'{source.name}: non-baked linked input {socket.name} needs explicit support')
            shader.inputs[socket.name].default_value = socket.default_value
    tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    uv_node = tree.nodes.new('ShaderNodeUVMap')
    uv_node.uv_map = 'AtlasUV'

    def image_node(image, colorspace, location):
        node = tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        node.image.colorspace_settings.name = colorspace
        node.location = location
        tree.links.new(uv_node.outputs['UV'], node.inputs['Vector'])
        return node

    base = image_node(images["basecolor"], "sRGB", (-700, 300))
    tree.links.new(base.outputs["Color"], shader.inputs["Base Color"])

    if "alpha" in images and alpha_mode != 'opaque':
        tree.links.new(base.outputs['Alpha'], shader.inputs['Alpha'])
        try:
            material.surface_render_method = "DITHERED"
        except AttributeError:
            pass
        for attribute, value in (("blend_method", "BLEND"), ("shadow_method", "HASHED")):
            try:
                setattr(material, attribute, value)
            except (AttributeError, TypeError):
                pass

    orm = image_node(images["orm"], "Non-Color", (-700, 0))
    separate = tree.nodes.new("ShaderNodeSeparateColor")
    separate.location = (-450, 0)
    tree.links.new(orm.outputs["Color"], separate.inputs["Color"])
    tree.links.new(separate.outputs["Green"], shader.inputs["Roughness"])
    tree.links.new(separate.outputs["Blue"], shader.inputs["Metallic"])

    normal_tex = image_node(images["normal"], "Non-Color", (-700, -300))
    normal_map = tree.nodes.new("ShaderNodeNormalMap")
    normal_map.uv_map = 'AtlasUV'
    normal_map.location = (-450, -300)
    tree.links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    tree.links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def material_signature(material):
    """Stable identity of a material's evaluated shader graph.

    Name, image set and alpha linkage are not enough: two copies can differ in a
    scalar input while sharing all three. This records every node's inputs, image
    reference and links, so only genuinely equivalent graphs merge.
    """
    tree = material.node_tree
    source_name = material.get('pipeline_source_material', material.name)
    if tree is None:
        return (source_name, (), ())
    nodes = []
    for node in sorted(tree.nodes, key=lambda item: item.name):
        values = []
        for socket in node.inputs:
            if socket.is_unavailable or not hasattr(socket, 'default_value'):
                continue
            value = socket.default_value
            try:
                values.append(tuple(round(float(item), 6) for item in value))
            except TypeError:
                values.append(round(float(value), 6))
        image = node.image.name if node.type == 'TEX_IMAGE' and node.image else None
        nodes.append((node.name, node.type, image, tuple(values)))
    links = tuple(sorted(
        (link.from_node.name, link.from_socket.name,
         link.to_node.name, link.to_socket.name) for link in tree.links))
    return (source_name, tuple(nodes), links)


def merge_equivalent_materials(mesh):
    """Collapse atlas slots that represent the same source material.

    Materials are cloned per source object, so two parts that share one authored
    material would otherwise export as two identical GLB materials. Slots merge only
    when their full shader graph signature agrees.
    """
    def signature(material):
        return material_signature(material)

    slots = list(mesh.materials)
    if len(slots) < 2:
        return 0
    positions = {}
    unique = []
    remap = []
    for material in slots:
        key = signature(material)
        if key not in positions:
            positions[key] = len(unique)
            unique.append(material)
        remap.append(positions[key])
    if len(unique) == len(slots):
        return 0
    indices = [remap[face.material_index] for face in mesh.polygons]
    mesh.materials.clear()
    for material in unique:
        mesh.materials.append(material)
    for face, index in zip(mesh.polygons, indices):
        face.material_index = index
    return len(slots) - len(unique)


def restore_assembly(atlas, sources, ranges):
    """Split by recorded source face identity, restoring local spaces and parents."""
    import bpy
    import bmesh

    parents = {}
    def parent_copy(source):
        if source is None:
            return None
        if source in parents:
            return parents[source]
        if source.type != 'EMPTY':
            raise PipelineError(f'{source.name}: mesh-parent assemblies need explicit support')
        clone = source.copy()
        clone.name = 'Atlas_' + source.name
        bpy.context.scene.collection.objects.link(clone)
        world = source.matrix_world.copy()
        clone.parent = parent_copy(source.parent)
        clone.matrix_world = world
        parents[source] = clone
        return clone

    result = []
    for source, span in zip(sources, ranges):
        bm = bmesh.new()
        try:
            bm.from_mesh(atlas.data)
            bm.faces.ensure_lookup_table()
            start, end = span['face_start'], span['face_end']
            if end > len(bm.faces):
                raise PipelineError('Recorded face range exceeds atlas face count')
            rejected = [bm.faces[index] for index in range(len(bm.faces))
                        if not start <= index < end]
            bmesh.ops.delete(bm, geom=rejected, context='FACES')
            loose = [v for v in bm.verts if not v.link_faces]
            if loose:
                bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.transform(source.matrix_world.inverted() @ atlas.matrix_world)
            mesh = bpy.data.meshes.new('Atlas_' + source.data.name)
            bm.to_mesh(mesh)
        finally:
            bm.free()
        for slot in atlas.material_slots:
            mesh.materials.append(slot.material)
        # Compact to the slots this part actually uses, preserving material identity.
        # Clearing the slot list resets every polygon index to 0, so the remapped
        # indices must be held aside and written back after the new slots exist.
        used = sorted({face.material_index for face in mesh.polygons})
        remap = {old: new for new, old in enumerate(used)}
        materials = [mesh.materials[index] for index in used]
        targets = [remap[face.material_index] for face in mesh.polygons]
        mesh.materials.clear()
        for material in materials:
            mesh.materials.append(material)
        for face, index in zip(mesh.polygons, targets):
            face.material_index = index
        if len(materials) > 1:
            used_after = {face.material_index for face in mesh.polygons}
            if used_after != set(range(len(materials))):
                raise PipelineError(f'{source.name}: material compaction lost a used slot')
        obj = bpy.data.objects.new('Atlas_' + source.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        # A baked part is a new object, so it needs its own identity for the shape
        # gate to bind an approval to; the source link is recorded alongside it.
        obj['asset_id'] = str(uuid.uuid4())
        obj['pipeline_source_object'] = source.name
        source_id = source.get('asset_id')
        if source_id:
            obj['pipeline_source_asset_id'] = str(source_id)
        obj.parent = parent_copy(source.parent)
        obj.matrix_world = source.matrix_world.copy()
        result.append(obj)
    # Keep the joined atlas as an explicit non-delivery bake helper.
    atlas.hide_render = True
    atlas.hide_set(True)
    return result, list(parents.values())


def bake_atlas(objects, out_dir, resolution=2048, margin=8, samples=8,
               alpha=True, unwrap_margin=0.02):
    """Bake objects into one atlas. Returns the atlas object plus a report."""
    import bpy

    out_dir = Path(out_dir)
    texture_dir = out_dir / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)
    atlas, copies, ranges = duplicate_and_join(objects)
    # Preserve named source layers (e.g. StickerDecal) and their node bindings.
    # Source and destination layouts must never be renamed into one another.
    if atlas.data.uv_layers.get('AtlasUV') is not None:
        raise PipelineError('Source already has AtlasUV; choose a distinct target layout')
    atlas_uv = atlas.data.uv_layers.new(name='AtlasUV')
    atlas.data.uv_layers.active = atlas_uv
    atlas_uv.active_render = True
    smart_unwrap(atlas, margin=unwrap_margin)

    bpy.ops.object.select_all(action="DESELECT")
    atlas.select_set(True)
    bpy.context.view_layer.objects.active = atlas
    modifier = atlas.modifiers.new("Atlas_Triangulate", "TRIANGULATE")
    modifier.quad_method = "BEAUTY"
    modifier.ngon_method = "BEAUTY"
    bpy.ops.object.modifier_apply(modifier=modifier.name)

    requested = list(CHANNELS) if alpha else [c for c in CHANNELS if c != "alpha"]
    specs = {"basecolor": "sRGB", "roughness": "Non-Color",
             "metallic": "Non-Color", "normal": "Non-Color", "alpha": "Non-Color"}
    images = {channel: new_image(f"Atlas_{channel}", resolution, specs[channel])
              for channel in requested}

    baked = {}
    for channel in requested:
        bake_channel(atlas, channel, images[channel], samples, margin)
        baked[channel] = save_image(images[channel], texture_dir / f"atlas_{channel}.png")

    if 'alpha' in images:
        # glTF requires alpha in base-colour A, not a separate scalar image.
        base_pixels = np.array(images['basecolor'].pixels[:], dtype=np.float32).reshape(-1, 4)
        alpha_pixels = np.array(images['alpha'].pixels[:], dtype=np.float32).reshape(-1, 4)
        base_pixels[:, 3] = alpha_pixels[:, 0]
        images['basecolor'].pixels = base_pixels.reshape(-1).tolist()
        baked['basecolor'] = save_image(images['basecolor'], texture_dir / 'atlas_basecolor.png')

    if "roughness" in images and "metallic" in images:
        orm_image, orm_report = compose_orm(images["roughness"], images["metallic"],
                                            texture_dir / "atlas_orm.png")
        images["orm"] = orm_image
        baked["orm"] = orm_report

    original_materials = [slot.material for slot in atlas.material_slots]
    alpha_modes = []
    for index, source_material in enumerate(original_materials):
        if source_material is None:
            alpha_modes.append('opaque')
            continue
        original = principled(source_material)
        is_opaque = (not original.inputs['Alpha'].is_linked and
                     original.inputs['Alpha'].default_value >= 1.0)
        alpha_modes.append('opaque' if is_opaque else 'blend')
        atlas.material_slots[index].material = build_atlas_material(
            images, alpha_modes[-1], source=source_material)
    merged = merge_equivalent_materials(atlas.data)
    parts, parents = restore_assembly(atlas, objects, ranges)

    report = {
        "atlas_object": atlas.name,
        "resolution": resolution,
        "margin_px": margin,
        "samples": samples,
        "channels": baked,
        "uv_layer": atlas.data.uv_layers['AtlasUV'].name,
        "source_uv": [layer.name for layer in atlas.data.uv_layers if layer.name != 'AtlasUV'],
        "faces": len(atlas.data.polygons),
        "vertices": len(atlas.data.vertices),
        "materials": [slot.material.name if slot.material else None for slot in atlas.material_slots],
        "parts": [part.name for part in parts],
        "assembly_roots": [p.name for p in parents if p.parent is None],
        "source_objects": [obj.name for obj in objects],
        "duplicates": len(copies),
        "alpha_mode": ("blend" if "blend" in alpha_modes else "opaque"),
        "alpha_modes": sorted(set(alpha_modes)),
    }
    return atlas, report
