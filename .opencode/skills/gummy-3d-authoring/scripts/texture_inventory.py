"""Read-only material/image dependency inventory; explicit Blender mesh targets."""
from pathlib import Path

import bpy


def upstream(socket):
    nodes, pending = set(), [link.from_node for link in socket.links]
    while pending:
        node = pending.pop()
        if node in nodes:
            continue
        nodes.add(node)
        pending.extend(link.from_node for item in node.inputs for link in item.links)
    return nodes


def run(objects):
    if not objects:
        raise ValueError('Explicit mesh names are required')
    targets = [bpy.data.objects[name] for name in objects]
    if any(ob.type != 'MESH' for ob in targets):
        raise ValueError('All targets must be meshes')
    materials, slots, referenced, connected = {}, {}, set(), set()
    for ob in targets:
        slots[ob.name] = [{'link': s.link, 'material': s.material.name if s.material else None}
                          for s in ob.material_slots]
        for slot in ob.material_slots:
            mat = slot.material
            if mat is None or mat.name in materials:
                continue
            tree = mat.node_tree
            nodes = list(tree.nodes) if tree else []
            outputs = [n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output]
            live = set()
            for output in outputs:
                for socket in output.inputs:
                    live.update(upstream(socket))
            images = []
            for node in nodes:
                if node.type != 'TEX_IMAGE' or node.image is None:
                    continue
                image = node.image
                referenced.add(image.name)
                if node in live:
                    connected.add(image.name)
                coords = upstream(node.inputs['Vector'])
                images.append({'node': node.name, 'image': image.name,
                               'output_dependency': node in live,
                               'explicit_uv_maps': sorted(n.uv_map for n in coords if n.type == 'UVMAP'),
                               'coordinate_nodes': sorted({n.type for n in coords})})
            channels = []
            for node in nodes:
                if node.type != 'BSDF_PRINCIPLED':
                    continue
                for name in ('Base Color', 'Roughness', 'Metallic', 'Normal'):
                    socket = node.inputs[name]
                    channels.append({'shader': node.name, 'input': name,
                                     'shader_output_dependency': node in live,
                                     'linked': socket.is_linked,
                                     'images': sorted({n.image.name for n in upstream(socket)
                                                       if n.type == 'TEX_IMAGE' and n.image})})
            materials[mat.name] = {'images': images, 'channels': channels,
                                   'groups_unresolved': sorted(n.name for n in nodes if n.type == 'GROUP')}
    images = {}
    for image in bpy.data.images:
        path = bpy.path.abspath(image.filepath, library=image.library) if image.filepath else None
        packed = bool(image.packed_file) or bool(image.packed_files)
        images[image.name] = {'source': image.source, 'path': image.filepath,
                              'resolved_path': path, 'packed': packed,
                              'external_file_exists': Path(path).is_file()
                              if path and image.source == 'FILE' else None,
                              'size': list(image.size), 'color_space': image.colorspace_settings.name}
    return {'slots': slots, 'materials': materials, 'images': images,
            'active_render_uv': {ob.name: [uv.name for uv in ob.data.uv_layers if uv.active_render]
                                 for ob in targets},
            'images_not_connected_to_inspected_outputs': sorted(set(images) - connected),
            'images_not_referenced_by_inspected_materials': sorted(set(images) - referenced),
            'unverified': ['Node groups are not traversed; dependencies are conservative, not shader evaluation',
                           'AO has no dedicated Principled input: inspect graph and exported occlusion channel',
                           'Implicit UVs, mapping transforms and evaluated modifier UVs need surface inspection',
                           'UDIM/sequence paths are not expanded; missing-file checks apply only to FILE images',
                           'Unconnected means relative to these targets, never safe to delete',
                           'No pixel, bake-quality, exporter or rendered-appearance validation']}
