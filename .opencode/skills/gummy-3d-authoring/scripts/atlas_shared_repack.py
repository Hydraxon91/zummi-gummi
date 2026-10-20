"""Shared whole-truck atlas by preserving authored UV charts and globally repacking.

No unwrap: evaluated copies keep their authored UV layout; only island transforms change.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--atlas-resolution', type=int, default=4096)
    parser.add_argument('--padding', type=int, default=2)
    parser.add_argument('--uv', default='UVMap')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Background Blender with saved source required')
    source = Path(bpy.data.filepath)
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused output required')
    exclusions = ('REF_', 'DATUM_', 'SRC_', 'DEBUG_')
    source_scene = bpy.context.scene
    payload, skipped = [], []
    for ob in sorted(source_scene.objects, key=lambda o: o.name):
        if ob.type != 'MESH' or ob.name.startswith(exclusions):
            continue
        if any(c.name == 'Cutters' for c in ob.users_collection):
            continue
        if not ob.visible_get() or ob.hide_render:
            continue
        if args.uv not in ob.data.uv_layers:
            skipped.append({'object': ob.name, 'reason': 'no %s' % args.uv})
            continue
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = ob.evaluated_get(depsgraph)
        temp = evaluated.to_mesh()
        mesh = temp.copy()
        evaluated.to_mesh_clear()
        mesh.materials.clear()
        for slot in ob.material_slots:
            mesh.materials.append(slot.material)
        source_uv = [data.uv.copy() for data in mesh.uv_layers[args.uv].data]
        target = mesh.uv_layers.new(name='UV_AI_Atlas')
        for index, uv in enumerate(source_uv):
            target.data[index].uv = uv
        mesh.uv_layers.active_index = mesh.uv_layers.find('UV_AI_Atlas')
        target.active_render = True
        payload.append((ob.name, mesh, ob.matrix_world.copy()))
    if not payload:
        raise ValueError('No mesh objects copied')
    atlas = bpy.data.scenes.new('SharedAtlas')
    bpy.context.window.scene = atlas
    copied = []
    for name, mesh, matrix in payload:
        copy = bpy.data.objects.new('ATLAS__' + name, mesh)
        copy.matrix_world = matrix
        copy['source_object'] = name
        atlas.collection.objects.link(copy)
        copied.append(copy)
    for ob in bpy.data.objects:
        ob.select_set(False)
    for ob in copied:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = copied[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True,
                            margin_method='ADD', margin=args.padding / args.atlas_resolution,
                            shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    out.mkdir(parents=True)
    checkpoint = out / 'raptor_rc_171_shared_atlas.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint), copy=True)
    islands = 0
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'uvx', Path(__file__).with_name('uv_island_export.py'))
    uvx = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(uvx)
    for ob in copied:
        islands += len(uvx.mesh_islands(ob.data, ob.data.uv_layers['UV_AI_Atlas']))
    manifest = {
        'source': str(source),
        'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'checkpoint': str(checkpoint),
        'method': 'preserve authored UV charts; global pack only; no unwrap',
        'objects_copied': len(copied), 'objects_skipped': skipped,
        'islands': islands, 'atlas_resolution': args.atlas_resolution,
        'padding_px': args.padding, 'margin_method': 'ADD', 'shape_method': 'CONCAVE',
        'note': 'authored chart folds, if any, are preserved and must be reported by audit'
    }
    (out / 'repack_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('SHARED_REPACK', json.dumps({k: manifest[k] for k in
                                      ('objects_copied', 'islands', 'atlas_resolution')}))


if __name__ == '__main__':
    main()
