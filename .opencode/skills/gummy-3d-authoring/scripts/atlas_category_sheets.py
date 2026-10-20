"""Build category delivery sheets by preserving authored UV charts and repacking per category."""
import argparse
import hashlib
import importlib.util
import json
from fnmatch import fnmatch
from pathlib import Path
import sys

import bpy


def category_for(ob, zones):
    name = ob.name
    if name.startswith('Glass_') or any(p in name for p in
            ('Lens', 'Lamp', 'Marker', 'Headlamp', 'Projector', 'LightGuide')):
        return 'glass_lights'
    if name.startswith(('Dashboard', 'Dash_', 'Gauge_', 'Console_', 'Cockpit_', 'Interior_',
                        'Seat_', 'Harness_', 'Radio_', 'Equipment_', 'Shifter_', 'Steering_',
                        'Pedal', 'RearWindow_Seal')):
        return 'interior'
    if name.startswith(('Wheel_', 'Tyre_', 'Rim_', 'Hub_', 'Brake_', 'Spare_Wheel')):
        return 'wheels'
    if name.startswith(('Chassis_', 'Coils', 'Reservoir', 'Suspension', 'Axle', 'Shock',
                        'Cage_', 'Bed_', 'Carrier_', 'Tow', 'Bumper', 'Frame')):
        return 'chassis'
    areas = {}
    for poly in ob.data.polygons:
        areas[poly.material_index] = areas.get(poly.material_index, 0.0) + poly.area
    index = max(areas, key=areas.get) if areas else 0
    material = ob.material_slots[index].material if index < len(ob.material_slots) else None
    zone = zones.MATERIAL_ZONES.get(material.name if material else '', 'unknown')
    if zone == 'body_paint':
        return 'body'
    if zone == 'interior':
        return 'interior'
    if zone in ('glass', 'lights'):
        return 'glass_lights'
    if zone in ('tire', 'rubber'):
        return 'wheels'
    if zone == 'metal':
        return 'wheels' if any(fnmatch(ob.name, p) for p in ('Rim_*', 'Wheel_*', 'Tyre_*')) else 'chassis'
    return 'trim'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--category')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--atlas-resolution', type=int, default=4096)
    parser.add_argument('--padding', type=int, default=2)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Background Blender with saved source required')
    source = Path(bpy.data.filepath)
    exclusions = ('REF_', 'DATUM_', 'SRC_', 'DEBUG_')
    spec = importlib.util.spec_from_file_location(
        'zones', Path(__file__).with_name('uv_island_export.py'))
    zones = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(zones)
    groups = {}
    current = bpy.context.scene
    for ob in sorted(current.objects, key=lambda o: o.name):
        if ob.type != 'MESH' or ob.name.startswith(exclusions):
            continue
        if any(c.name == 'Cutters' for c in ob.users_collection):
            continue
        if not ob.visible_get() or ob.hide_render or 'UVMap' not in ob.data.uv_layers:
            continue
        groups.setdefault(category_for(ob, zones), []).append(ob)
    groups.pop('body', None)  # body guide already delivered separately
    if args.list:
        print('CATEGORIES', json.dumps({k: [o.name for o in v] for k, v in groups.items()}))
        return
    if args.category not in groups:
        raise ValueError('Unknown/empty category %r; have %r' % (args.category, sorted(groups)))
    objects = groups[args.category]
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused output required')
    payload = []
    for ob in objects:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = ob.evaluated_get(depsgraph)
        temp = evaluated.to_mesh()
        mesh = temp.copy()
        evaluated.to_mesh_clear()
        mesh.materials.clear()
        for slot in ob.material_slots:
            mesh.materials.append(slot.material)
        source_uv = [data.uv.copy() for data in mesh.uv_layers['UVMap'].data]
        target = mesh.uv_layers.new(name='UV_AI_Atlas')
        for index, uv in enumerate(source_uv):
            target.data[index].uv = uv
        mesh.uv_layers.active_index = mesh.uv_layers.find('UV_AI_Atlas')
        target.active_render = True
        payload.append((ob.name, mesh, ob.matrix_world.copy()))
    scene = bpy.data.scenes.new('Category_' + args.category)
    bpy.context.window.scene = scene
    copied = []
    for name, mesh, matrix in payload:
        copy = bpy.data.objects.new('ATLAS__' + name, mesh)
        copy.matrix_world = matrix
        copy['source_object'] = name
        scene.collection.objects.link(copy)
        copied.append(copy)
    for ob in bpy.data.objects:
        ob.select_set(False)
    for ob in copied:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = copied[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='ADD',
                            margin=args.padding / args.atlas_resolution,
                            shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    out.mkdir(parents=True)
    checkpoint = out / ('%s_sheet.blend' % args.category)
    bpy.ops.wm.save_as_mainfile(filepath=str(checkpoint), copy=True)
    spec = importlib.util.spec_from_file_location(
        'uvx', Path(__file__).with_name('uv_island_export.py'))
    uvx = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(uvx)
    islands = sum(len(uvx.mesh_islands(o.data, o.data.uv_layers['UV_AI_Atlas']))
                  for o in copied)
    manifest = {'source': str(source),
                'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'category': args.category, 'checkpoint': str(checkpoint),
                'method': 'preserve authored UV charts; pack within category; no unwrap',
                'objects': [o.name for o in copied], 'islands': islands,
                'atlas_resolution': args.atlas_resolution, 'padding_px': args.padding}
    (out / 'category_manifest.json').write_text(json.dumps(manifest, indent=2))
    print('CATEGORY_SHEET', args.category, len(copied), 'objects', islands, 'islands')


if __name__ == '__main__':
    main()
