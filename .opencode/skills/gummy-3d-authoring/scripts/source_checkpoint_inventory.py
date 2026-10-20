"""Read-only semantic checkpoint inventory for source provenance comparisons."""
import argparse
from array import array
import hashlib
import json
from pathlib import Path
import sys

import bpy


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def value(v):
    if v is None or isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, bpy.types.ID):
        return {'id_type': v.bl_rna.identifier, 'name': v.name}
    try:
        return [value(x) for x in v]
    except TypeError:
        return str(type(v).__name__)


def properties(item):
    result = {}
    for prop in item.bl_rna.properties:
        if prop.identifier == 'rna_type' or prop.type == 'COLLECTION':
            continue
        if prop.is_readonly:
            continue
        result[prop.identifier] = value(getattr(item, prop.identifier))
    return result


def collection_hash(items, prop, count, kind):
    data = array(kind, [0]) * count
    items.foreach_get(prop, data)
    return hashlib.sha256(data.tobytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    out = Path(args.out)
    if out.exists() or not bpy.app.background:
        raise ValueError('Background Blender and unused report path required')
    report = {'file': bpy.data.filepath, 'meshes': {}, 'objects': {}, 'materials': {},
              'images': {}, 'scenes': {s.name: sorted(o.name for o in s.objects) for s in bpy.data.scenes},
              'limits': ['No rig animation/keyframe comparison',
                         'Modifier ID references compared by name, not evaluated surfaces',
                         'Node groups recorded by reference, not recursively evaluated',
                         'Image bytes compared, not rendered appearance']}
    report['scene_settings'] = {
        s.name: {'render': properties(s.render), 'units': properties(s.unit_settings),
                 'view_settings': properties(s.view_settings),
                 'camera': s.camera.name if s.camera else None,
                 'world': s.world.name if s.world else None,
                 'frame': s.frame_current, 'cursor_location': list(s.cursor.location),
                 'cursor_rotation': list(s.cursor.rotation_euler)} for s in bpy.data.scenes}
    report['collections'] = {c.name: {'objects': sorted(o.name for o in c.objects),
                                    'children': sorted(x.name for x in c.children),
                                    'hide_render': c.hide_render, 'hide_viewport': c.hide_viewport}
                             for c in bpy.data.collections}
    report['cameras'] = {c.name: properties(c) for c in bpy.data.cameras}
    report['lights'] = {c.name: properties(c) for c in bpy.data.lights}
    report['screens'] = {}
    for screen in bpy.data.screens:
        areas = []
        for area in screen.areas:
            space = area.spaces.active
            row = {'type': area.type, 'width': area.width, 'height': area.height}
            if area.type == 'VIEW_3D':
                row.update({'shading': properties(space.shading),
                            'overlay': properties(space.overlay),
                            'view_distance': space.region_3d.view_distance,
                            'view_location': list(space.region_3d.view_location),
                            'view_rotation': list(space.region_3d.view_rotation),
                            'view_perspective': space.region_3d.view_perspective})
            areas.append(row)
        report['screens'][screen.name] = areas
    for mesh in bpy.data.meshes:
        uv = {layer.name: collection_hash(layer.data, 'uv', len(layer.data) * 2, 'f')
              for layer in mesh.uv_layers}
        report['meshes'][mesh.name] = {
            'vertices': len(mesh.vertices), 'edges': len(mesh.edges), 'polygons': len(mesh.polygons),
            'coordinates': collection_hash(mesh.vertices, 'co', len(mesh.vertices) * 3, 'f'),
            'edge_vertices': collection_hash(mesh.edges, 'vertices', len(mesh.edges) * 2, 'i'),
            'loop_vertices': collection_hash(mesh.loops, 'vertex_index', len(mesh.loops), 'i'),
            'polygon_starts': collection_hash(mesh.polygons, 'loop_start', len(mesh.polygons), 'i'),
            'polygon_sizes': collection_hash(mesh.polygons, 'loop_total', len(mesh.polygons), 'i'),
            'face_material_indices': collection_hash(mesh.polygons, 'material_index', len(mesh.polygons), 'i'),
            'smooth': collection_hash(mesh.polygons, 'use_smooth', len(mesh.polygons), 'b'),
            'uv': uv, 'active_uv': mesh.uv_layers.active.name if mesh.uv_layers.active else None,
            'render_uv': [layer.name for layer in mesh.uv_layers if layer.active_render],
            'materials': [m.name if m else None for m in mesh.materials]}
    for ob in bpy.data.objects:
        report['objects'][ob.name] = {
            'type': ob.type, 'data': ob.data.name if ob.data else None,
            'matrix_world': [list(row) for row in ob.matrix_world],
            'matrix_basis': [list(row) for row in ob.matrix_basis],
            'parent': ob.parent.name if ob.parent else None,
            'slots': [(s.link, s.material.name if s.material else None) for s in ob.material_slots],
            'modifiers': [properties(m) for m in ob.modifiers],
            'constraints': [properties(c) for c in ob.constraints],
            'hide_render': ob.hide_render, 'hide_viewport': ob.hide_viewport,
            'display_type': ob.display_type,
            'selected': ob.select_get()}
    for mat in bpy.data.materials:
        graph = None
        if mat.node_tree:
            graph = {'nodes': {n.name: {'type': n.type, 'properties': properties(n),
                                      'inputs': {str(i): value(s.default_value)
                                                 for i, s in enumerate(n.inputs)
                                                 if hasattr(s, 'default_value')}}
                               for n in mat.node_tree.nodes},
                     'links': sorted((link.from_node.name, link.from_socket.identifier,
                                      link.to_node.name, link.to_socket.identifier)
                                     for link in mat.node_tree.links)}
        report['materials'][mat.name] = {'graph': graph, 'properties': properties(mat)}
    for image in bpy.data.images:
        packed = [hashlib.sha256(p.packed_file.data).hexdigest() for p in image.packed_files]
        path = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
        report['images'][image.name] = {'path': image.filepath, 'source': image.source,
                                      'size': list(image.size), 'packed_sha256': packed,
                                      'colorspace': image.colorspace_settings.name,
                                      'external_sha256': hashlib.sha256(path.read_bytes()).hexdigest()
                                      if path and path.is_file() else None}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, sort_keys=True))
    print('SOURCE_INVENTORY', len(report['objects']), 'objects', len(report['meshes']), 'meshes',
          len(report['materials']), 'materials', len(report['images']), 'images')


if __name__ == '__main__':
    main()
