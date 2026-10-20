"""Prepare a separate evaluated atlas-delivery scene; saved source remains untouched.

Approved authoring operation, disposable background Blender only. Layout is a checkpoint,
not a verified textured delivery. Original UVs and editable source scenes are retained.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy


def sha(data):
    return hashlib.sha256(json.dumps(data, separators=(',', ':')).encode()).hexdigest()


def geometry(mesh):
    return {'vertices': [list(v.co) for v in mesh.vertices], 'faces': [list(p.vertices) for p in mesh.polygons]}


def uv_hash(layer):
    return sha([list(p.uv) for p in layer.data])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int)
    parser.add_argument('--atlas-resolution', type=int, default=4096)
    parser.add_argument('--guide-resolution', type=int, default=1280)
    parser.add_argument('--padding', type=int, default=8, help='requested pack margin at atlas resolution; measured later')
    parser.add_argument('--zones', required=True)
    parser.add_argument('--unwrap', choices=('smart', 'seams'), default='smart')
    parser.add_argument('--fallback-json', help='objects whose charts use per-face islands')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Disposable background Blender with saved source required')
    if args.resolution is not None:
        args.atlas_resolution = args.guide_resolution = args.resolution
    if min(args.atlas_resolution, args.guide_resolution) < 16:
        raise ValueError('Resolution must be >=16')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused delivery directory required')
    source_path = Path(bpy.data.filepath)
    source_sha = hashlib.sha256(source_path.read_bytes()).hexdigest()
    source_scene = bpy.context.scene
    sources = sorted([o for o in source_scene.objects if o.type == 'MESH' and o.visible_get() and not o.hide_render
                      and not o.name.startswith(('REF_', 'DATUM_', 'SRC_', 'DEBUG_'))
                      and not any(c.name == 'Cutters' for c in o.users_collection)], key=lambda o: o.name)
    if not sources:
        raise ValueError('No delivery meshes')
    zones = json.loads(Path(args.zones).read_text())
    fallback = set(json.loads(Path(args.fallback_json).read_text())['objects']) if args.fallback_json else set()
    dg = bpy.context.evaluated_depsgraph_get()
    scene = bpy.data.scenes.new('Atlas_Delivery')
    scene.unit_settings.scale_length = source_scene.unit_settings.scale_length
    targets, inventory, target_zones = [], [], {}
    for source in sources:
        evaluated = source.evaluated_get(dg)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=dg)
        baseline = sha(geometry(mesh))
        if not mesh.uv_layers:
            raise ValueError('Source lacks UVs: ' + source.name)
        original_uv = mesh.uv_layers.active.name
        original_hash = uv_hash(mesh.uv_layers[original_uv])
        if args.unwrap == 'seams':
            edge_uvs = defaultdict(list)
            for polygon in mesh.polygons:
                loops = list(polygon.loop_indices)
                for j, li in enumerate(loops):
                    lj = loops[(j + 1) % len(loops)]
                    key = tuple(sorted((mesh.loops[k].vertex_index,
                                        tuple(round(float(v), 7) for v in mesh.uv_layers[original_uv].data[k].uv))
                                       for k in (li, lj)))
                    edge_uvs[mesh.loops[li].edge_index].append((key, polygon.material_index))
            for index, users in edge_uvs.items():
                mesh.edges[index].use_seam = len(users) != 2 or users[0] != users[1]
        if source.name in fallback:
            for edge in mesh.edges:
                edge.use_seam = True
        target = bpy.data.objects.new('ATLAS__' + source.name, mesh)
        scene.collection.objects.link(target)
        target.matrix_world = source.matrix_world.copy()
        target['source_object'] = source.name
        target['source_uv'] = original_uv
        # Resolved slots include object-level overrides; never edit source materials.
        resolved = [s.material for s in source.material_slots]
        mesh.materials.clear()
        for material in resolved:
            if material is None:
                raise ValueError('Missing source material: ' + source.name)
            copy = material.copy()
            copy['source_material'] = material.name
            target_zones[copy.name] = zones.get(material.name, 'unknown')
            if copy.node_tree:
                tree = copy.node_tree
                source_uv = tree.nodes.new('ShaderNodeUVMap')
                source_uv.uv_map = original_uv
                for node in list(tree.nodes):
                    if node.type == 'GROUP':
                        raise ValueError('Uninspected material group: ' + material.name)
                    if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                        tree.links.new(source_uv.outputs['UV'], node.inputs['Vector'])
                    if node.type == 'NORMAL_MAP' and not node.uv_map:
                        node.uv_map = original_uv
                    if node.type == 'TEX_COORD':
                        for link in list(node.outputs['UV'].links):
                            destination = link.to_socket
                            tree.links.remove(link)
                            tree.links.new(source_uv.outputs['UV'], destination)
            mesh.materials.append(copy)
        layer = mesh.uv_layers.new(name='UV_AI_Atlas')
        mesh.uv_layers.active_index = len(mesh.uv_layers) - 1
        layer.active_render = True
        for p in mesh.polygons:
            p.select = True
        inventory.append({'source_object': source.name, 'delivery_object': target.name,
                          'source_uv': original_uv, 'source_uv_sha256': original_hash,
                          'geometry_sha256': baseline, 'evaluated_face_count': len(mesh.polygons),
                          'matrix_world': [list(row) for row in source.matrix_world]})
        targets.append(target)
    bpy.context.window.scene = scene

    def edit(objects, action):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        try:
            action()
        finally:
            bpy.ops.object.mode_set(mode='OBJECT')

    prop = bpy.ops.uv.unwrap.get_rna_type().properties['method']
    unwrap_method = next(i.identifier for i in prop.enum_items if i.identifier == 'ANGLE_BASED')
    smart = bpy.ops.uv.smart_project.get_rna_type().properties
    margin_method = next(i.identifier for i in smart['margin_method'].enum_items if i.identifier == 'ADD')
    scattered = [t for t in targets if t['source_object'] in fallback]
    regular = [t for t in targets if t['source_object'] not in fallback]
    if scattered:
        edit(scattered, lambda: bpy.ops.uv.unwrap(method=unwrap_method, margin=0))
    if regular:
        edit(regular, lambda: bpy.ops.uv.smart_project(
            angle_limit=math.radians(66), island_margin=0, margin_method=margin_method,
            scale_to_bounds=True))
    props = bpy.ops.uv.pack_islands.get_rna_type().properties
    pack_method = next(i.identifier for i in props['margin_method'].enum_items if i.identifier == 'ADD')
    shape = next(i.identifier for i in props['shape_method'].enum_items if i.identifier == 'CONCAVE')

    def pack():
        bpy.ops.uv.average_islands_scale()
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method=pack_method,
                                margin=args.padding / args.atlas_resolution, shape_method=shape)

    edit(targets, pack)
    for target, item in zip(targets, inventory):
        assert sha(geometry(target.data)) == item['geometry_sha256']
        assert uv_hash(target.data.uv_layers[item['source_uv']]) == item['source_uv_sha256']
        item['atlas_uv_sha256'] = uv_hash(target.data.uv_layers['UV_AI_Atlas'])
    # Resolve relative source paths before saving the NEW file in a child directory.
    for image in bpy.data.images:
        if image.filepath:
            image.filepath = bpy.path.abspath(image.filepath, library=image.library)
    out.mkdir(parents=True)
    file = out / 'raptor_rc_168_atlas_layout.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(file))
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == source_sha
    report = {'source': str(source_path), 'source_sha256': source_sha, 'layout_checkpoint': str(file),
              'scene': scene.name, 'uv': 'UV_AI_Atlas', 'objects': inventory,
              'atlas_resolution': args.atlas_resolution, 'guide_resolution': args.guide_resolution,
              'requested_margin_px': args.padding,
              'unwrap': args.unwrap,
              'geometry_and_original_uv_preserved': True,
              'status': 'layout checkpoint; texture transfer, overlap validation and visual acceptance pending',
              'warnings': ['Smart projection changes delivery UV seams; original UVs are retained',
                           'Native pack success is not padding/overlap verification',
                           'Source scenes retained in file; export only Atlas_Delivery']}
    (out / 'layout_manifest.json').write_text(json.dumps(report, indent=2))
    (out / 'atlas_zones.json').write_text(json.dumps(target_zones, indent=2))
    print('ATLAS_LAYOUT_CHECKPOINT', len(targets), 'objects;', file)


if __name__ == '__main__':
    main()
