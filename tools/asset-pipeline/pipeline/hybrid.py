"""Split-panel baking with exact repeated XY image sampling for plain plastics.

Supported tile source: Object -> POINT Mapping -> FLAT/REPEAT image base colour,
plus grayscale roughness through a linear Map Range. Unsupported graphs fail.
Height-derived tangent normals remain baked, not replaced by generated normals.
"""
from pathlib import Path

from .common import PipelineError, resolve_path


def tile_recipe(material, override=None):
    from .bake import principled
    shader = principled(material)
    base = shader.inputs['Base Color']
    if not base.is_linked or len(base.links) != 1:
        raise PipelineError(f'{material.name}: direct image base colour required for tiling')
    image = base.links[0].from_node
    if image.type != 'TEX_IMAGE' or image.projection != 'FLAT' or image.extension != 'REPEAT':
        raise PipelineError(f'{material.name}: FLAT/REPEAT image required')
    mapping = image.inputs['Vector'].links[0].from_node
    if mapping.type != 'MAPPING' or mapping.vector_type != 'POINT':
        raise PipelineError(f'{material.name}: POINT Mapping required')
    coordinate = mapping.inputs['Vector'].links[0]
    if coordinate.from_node.type != 'TEX_COORD' or coordinate.from_socket.name != 'Object':
        raise PipelineError(f'{material.name}: Object coordinates required')
    roughness = shader.inputs['Roughness']
    remap = roughness.links[0].from_node
    if remap.type != 'MAP_RANGE' or remap.interpolation_type != 'LINEAR':
        raise PipelineError(f'{material.name}: linear roughness Map Range required')
    rough_image = remap.inputs['Value'].links[0].from_node
    if rough_image.type != 'TEX_IMAGE':
        raise PipelineError(f'{material.name}: roughness image required')
    if rough_image.inputs['Vector'].links[0].from_node != mapping:
        raise PipelineError('Base colour and roughness must share their mapping')
    if shader.inputs['Alpha'].is_linked:
        raise PipelineError('Tile alpha must be a constant; sticker materials must use a dedicated panel bake')
    base_image = image.image
    base_source = image.image.filepath or image.image.name
    if override and override.get('base'):
        # A colour-gated base map must replace the raw generated one, otherwise the
        # rebuild below silently keeps the drifted colours.
        path = resolve_path(override['base'])
        if not path.is_file():
            raise PipelineError(f'{material.name}: tile override map not found: {path}')
        import bpy
        base_image = bpy.data.images.load(str(path), check_existing=True)
        base_image.colorspace_settings.name = 'sRGB'
        base_source = str(path)
    return {'base': base_image, 'base_source': base_source,
            'rough': rough_image.image, 'mapping': mapping,
            'reference': coordinate.from_node.object, 'remap': remap,
            'alpha': shader.inputs['Alpha'].default_value}


def repeated_plastics(parts, sources, material_names, directory, overrides=None):
    import bpy
    import numpy as np
    from mathutils import Matrix, Euler, Vector
    from .bake import principled, save_image

    overrides = overrides or {}
    recipes = {name: tile_recipe(bpy.data.materials[name], overrides.get(name))
               for name in material_names}
    rough_images = {}
    for name, recipe in recipes.items():
        source = recipe['rough']
        pixels = np.array(source.pixels[:], dtype=np.float32).reshape(-1, 4)
        if np.max(np.ptp(pixels[:, :3], axis=1)) > 1/255 + 1e-6:
            raise PipelineError('Only grayscale roughness sources are supported')
        remap = recipe['remap']
        low, high = [remap.inputs[key].default_value for key in ('From Min', 'From Max')]
        to_low, to_high = [remap.inputs[key].default_value for key in ('To Min', 'To Max')]
        if low == high:
            raise PipelineError('Degenerate roughness Map Range')
        value = (pixels[:, 0] - low) / (high - low)
        if remap.clamp:
            value = np.clip(value, 0, 1)
        value = to_low + value * (to_high - to_low)
        result = np.ones_like(pixels)
        result[:, :3] = value[:, None]
        target = bpy.data.images.new('TileRough_' + name, width=source.size[0], height=source.size[1], alpha=False)
        target.colorspace_settings.name = 'Non-Color'
        target.pixels = result.reshape(-1).tolist()
        rough_images[name] = target
        save_image(target, Path(directory) / ('tile_roughness_' + name + '.png'))

    touched = []
    for part, source in zip(parts, sources):
        layer = part.data.uv_layers.new(name='TileUV')
        for face in part.data.polygons:
            material = part.material_slots[face.material_index].material
            name = material.get('pipeline_source_material') if material else None
            if name not in recipes:
                continue
            recipe = recipes[name]
            mapping = recipe['mapping']
            transform = Matrix.LocRotScale(Vector(mapping.inputs['Location'].default_value),
                                           Euler(mapping.inputs['Rotation'].default_value).to_quaternion(),
                                           Vector(mapping.inputs['Scale'].default_value))
            reference = recipe['reference'] or source
            world_to_texture = transform @ reference.matrix_world.inverted() @ part.matrix_world
            for loop in face.loop_indices:
                position = world_to_texture @ part.data.vertices[part.data.loops[loop].vertex_index].co
                layer.data[loop].uv = position.xy
        for slot in part.material_slots:
            material = slot.material
            name = material.get('pipeline_source_material') if material else None
            if name not in recipes or material.get('pipeline_tiled'):
                continue
            recipe = recipes[name]
            tree = material.node_tree
            shader = principled(material)
            uv = tree.nodes.new('ShaderNodeUVMap')
            uv.uv_map = 'TileUV'
            base = tree.nodes.new('ShaderNodeTexImage')
            base.image = recipe['base']
            rough = tree.nodes.new('ShaderNodeTexImage')
            rough.image = rough_images[name]
            tree.links.new(uv.outputs['UV'], base.inputs['Vector'])
            tree.links.new(uv.outputs['UV'], rough.inputs['Vector'])
            tree.links.new(base.outputs['Color'], shader.inputs['Base Color'])
            tree.links.new(rough.outputs['Color'], shader.inputs['Roughness'])
            for link in list(shader.inputs['Alpha'].links):
                tree.links.remove(link)
            shader.inputs['Alpha'].default_value = recipe['alpha']
            material['pipeline_tiled'] = True
            touched.append(material.name)
    return {'materials': touched, 'tile_uv': 'TileUV',
            'base_sources': {name: recipe['base_source'] for name, recipe in recipes.items()},
            'normal_policy': 'Original height-derived normals baked in AtlasUV'}


def bake_hybrid(objects, job, out_dir):
    import bpy
    from .bake import bake_atlas
    groups = job.get('groups', [])
    by_name = {obj.name: obj for obj in objects}
    tile_spec = job.get('tile_materials', [])
    if isinstance(tile_spec, dict):
        overrides = {name: (spec if isinstance(spec, dict) else {})
                     for name, spec in tile_spec.items()}
        tile_names = sorted(overrides)
    else:
        overrides = {}
        tile_names = list(tile_spec)
    assigned = set()
    reports = []
    roots = []
    all_parts = []
    for index, group in enumerate(groups):
        selected = group['objects']
        if selected == '*':
            selected = sorted(set(by_name) - assigned)
        if any(name not in by_name or name in assigned for name in selected):
            raise PipelineError('Hybrid groups must partition the selected source objects exactly once')
        assigned.update(selected)
        sources = [by_name[name] for name in selected]
        directory = Path(out_dir) / f'group-{index}'
        _, report = bake_atlas(sources, directory, resolution=group['resolution'],
                               margin=job.get('margin', 8), samples=job.get('samples', 8))
        parts = [bpy.data.objects[name] for name in report['parts']]
        report['repeated_plastics'] = repeated_plastics(
            parts, sources, tile_names, directory, overrides)
        roots.extend(bpy.data.objects[name] for name in report['assembly_roots'])
        all_parts.extend(parts)
        reports.append(report)
    if assigned != set(by_name):
        raise PipelineError('Hybrid groups do not cover all selected objects')
    container = bpy.data.objects.new(job.get('root_name', 'Hybrid_Root'), None)
    bpy.context.scene.collection.objects.link(container)
    for root in roots:
        world = root.matrix_world.copy()
        root.parent = container
        root.matrix_world = world
    # Parts with no source parent are not assembly roots, so they would stay outside the
    # container and be missed by capture and export. Adopt them explicitly.
    for part in all_parts:
        if part.parent is not None:
            continue
        world = part.matrix_world.copy()
        part.parent = container
        part.matrix_world = world
    return container, reports
