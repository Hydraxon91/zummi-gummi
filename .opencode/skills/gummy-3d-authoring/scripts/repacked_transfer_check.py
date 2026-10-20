"""Verify repacked category UVs: bake a UV gradient through UVMap, compare at UV_AI_Atlas."""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector
import importlib.util

_spec = importlib.util.spec_from_file_location(
    'transfer_sampling', Path(__file__).with_name('transfer_sampling.py'))
_sampling = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_sampling)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=1024)
    parser.add_argument('--object', help='Exact object name; do not test the whole category')
    parser.add_argument('--no-render', action='store_true')
    parser.add_argument('--margin', type=int, default=4)
    parser.add_argument('--material-policy', help='Explicit object/material-only paint exclusions')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if args.margin < 0:
        raise ValueError('Bake margin must be nonnegative')
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Background Blender with saved category sheet required')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused output required')
    out.mkdir(parents=True)
    objects = [o for o in bpy.context.scene.objects
               if o.type == 'MESH' and 'UV_AI_Atlas' in o.data.uv_layers
               and (args.object is None or o.name == args.object)]
    if not objects:
        raise ValueError('No repacked UV objects')
    policy_exclusions = []
    if args.material_policy:
        policy = json.loads(Path(args.material_policy).read_text())
        if policy.get('schema') != 1:
            raise ValueError('Unsupported material policy schema')
        kept = []
        for ob in objects:
            source_name = ob.get('source_object', ob.name.removeprefix('ATLAS__'))
            rule = policy['objects'].get(source_name)
            if rule is None:
                kept.append(ob)
                continue
            actual = [slot.material.name if slot.material else None for slot in ob.material_slots]
            if rule['treatment'] != 'preserve_existing_material' or actual != rule['materials']:
                raise ValueError('Material policy mismatch on %s: %r' % (ob.name, actual))
            policy_exclusions.append({'object': ob.name, 'source_object': source_name,
                                      'materials': actual, 'status': 'MATERIAL_ONLY_NOT_TESTED'})
        objects = kept
        if not objects:
            raise ValueError('All requested objects are material-only; no paint mapping to test')
    preflight = {'objects': len(objects), 'missing_uvmap': [], 'missing_target': [],
                 'active_layer_forced': 0, 'unreplaced_slots': []}
    for ob in objects:
        mesh = ob.data
        if 'UVMap' not in mesh.uv_layers:
            preflight['missing_uvmap'].append(ob.name)
        if 'UV_AI_Atlas' not in mesh.uv_layers:
            preflight['missing_target'].append(ob.name)
            continue
        target_layer = mesh.uv_layers['UV_AI_Atlas']
        if not target_layer.active_render:
            preflight['active_layer_forced'] += 1
        mesh.uv_layers.active_index = mesh.uv_layers.find('UV_AI_Atlas')
        target_layer.active_render = True
    if preflight['missing_uvmap'] or preflight['missing_target']:
        raise ValueError('UV preflight failed: ' + json.dumps(preflight))
    bake = bpy.data.images.new('UV_GRADIENT_BAKE', args.resolution, args.resolution,
                               float_buffer=True, alpha=False)
    materials = []
    for ob in objects:
        for slot in ob.material_slots:
            if not slot.material:
                preflight['unreplaced_slots'].append('%s:None' % ob.name)
                continue
            material = slot.material.copy()
            material.name = 'GRAD_' + slot.material.name
            slot.link = 'OBJECT'
            slot.material = material
            if slot.material != material or not slot.material.name.startswith('GRAD_'):
                preflight['unreplaced_slots'].append('%s:%s' % (ob.name, material.name))
            materials.append(material)
            nodes, links = material.node_tree.nodes, material.node_tree.links
            uv = nodes.new('ShaderNodeUVMap')
            uv.uv_map = 'UVMap'
            sep = nodes.new('ShaderNodeSeparateXYZ')
            comb = nodes.new('ShaderNodeCombineXYZ')
            comb.inputs['Z'].default_value = 0.5
            links.new(uv.outputs['UV'], sep.inputs['Vector'])
            links.new(sep.outputs['X'], comb.inputs['X'])
            links.new(sep.outputs['Y'], comb.inputs['Y'])
            emit = nodes.new('ShaderNodeEmission')
            emit.name = 'GRAD_EMIT'
            links.new(comb.outputs['Vector'], emit.inputs['Color'])
            output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
            for link in list(output.inputs['Surface'].links):
                links.remove(link)
            links.new(emit.outputs['Emission'], output.inputs['Surface'])
            target = nodes.new('ShaderNodeTexImage')
            target.image = bake
            nodes.active = target
    if preflight['unreplaced_slots']:
        raise ValueError('Material replacement preflight failed: ' +
                         json.dumps(preflight['unreplaced_slots'][:20]))
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    bpy.ops.object.bake(type='EMIT', margin=args.margin, use_clear=True)
    sheet = Path(bpy.data.filepath).stem
    bake.filepath_raw = str(out / ('%s_uv_gradient.png' % sheet))
    bake.file_format = 'PNG'
    bake.save()
    pixels = np.array(bake.pixels[:]).reshape(args.resolution, args.resolution, 4)

    deltas = []
    per_object = {}
    subpixel = 0
    collapsed = 0
    uncovered = 0
    rejected_samples = 0
    weighted_errors = []
    sampled_world_area = 0.0
    total_world_area = 0.0
    for ob in objects:
        mesh = ob.data
        mesh.calc_loop_triangles()
        source = mesh.uv_layers['UVMap']
        target = mesh.uv_layers['UV_AI_Atlas']
        rows = []
        conclusive = 0
        object_subpixel = 0
        object_collapsed = 0
        object_uncovered = 0
        for tri in mesh.loop_triangles:
            world = [ob.matrix_world @ mesh.vertices[v].co for v in tri.vertices]
            world_area = (world[1] - world[0]).cross(world[2] - world[0]).length * 0.5
            total_world_area += world_area
            a = [source.data[k].uv for k in tri.loops]
            b = [target.data[k].uv for k in tri.loops]
            area_px = abs((b[1].x - b[0].x) * (b[2].y - b[0].y) -
                          (b[2].x - b[0].x) * (b[1].y - b[0].y)) * 0.5 * \
                (args.resolution - 1) ** 2
            source_area_px = abs((a[1].x - a[0].x) * (a[2].y - a[0].y) -
                                 (a[2].x - a[0].x) * (a[1].y - a[0].y)) * 0.5 * \
                (args.resolution - 1) ** 2
            if area_px < 1.0:
                if source_area_px >= 1.0:
                    collapsed += 1
                    object_collapsed += 1
                else:
                    subpixel += 1
                    object_subpixel += 1
                continue
            errors = []
            for weights in ((0.6, 0.2, 0.2), (0.2, 0.6, 0.2), (0.2, 0.2, 0.6)):
                correspondence = _sampling.pixel_correspondence(a, b, weights, args.resolution)
                if correspondence is None:
                    rejected_samples += 1
                    continue
                (x, y), expected = correspondence
                errors.append(float(np.abs(pixels[y, x, :2] - np.array(expected)).max()))
            if not errors:
                uncovered += 1
                object_uncovered += 1
                continue
            errors.sort()
            rows.append(max(errors))
            sampled_world_area += world_area
            weighted_errors.append((max(errors), world_area))
            conclusive += 1
        rows.sort()
        if not rows:
            per_object[ob.name] = {'faces': object_subpixel + object_collapsed + object_uncovered,
                                    'conclusive': 0, 'subpixel': object_subpixel,
                                    'collapsed': object_collapsed, 'uncovered': object_uncovered}
            continue
        per_object[ob.name] = {'faces': conclusive + object_subpixel + object_collapsed + object_uncovered,
                               'conclusive': conclusive, 'subpixel': object_subpixel,
                                'collapsed': object_collapsed, 'uncovered': object_uncovered,
                               'median_target': rows[len(rows) // 2],
                               'p95_target': rows[int(len(rows) * 0.95)],
                               'max_target': rows[-1]}
        deltas.extend(rows)
    deltas.sort()
    for row in per_object.values():
        row['verdict'] = ('FAIL' if row['collapsed'] else
                          'INCONCLUSIVE' if row['uncovered'] else
                          'INCONCLUSIVE' if row['conclusive'] / max(1, row['faces']) < 0.5 else
                          'PASS' if row.get('p95_target', float('inf')) <= 0.03 else 'FAIL')
    report = {'objects': len(objects), 'resolution': args.resolution, 'margin': args.margin,
              'material_policy': args.material_policy,
              'material_only_exclusions': policy_exclusions,
              'conclusive_faces': len(deltas),
               'subpixel_faces': subpixel, 'collapsed_faces': collapsed,
              'uncovered_faces': uncovered, 'rejected_sample_locations': rejected_samples,
              'median_uv_delta': deltas[len(deltas) // 2] if deltas else None,
              'p95_uv_delta': deltas[int(len(deltas) * 0.95)] if deltas else None,
              'mean_uv_delta': float(np.mean(deltas)) if deltas else None,
              'max_uv_delta': deltas[-1] if deltas else None,
              'within_0.03_fraction': sum(1 for d in deltas if d <= 0.03) / len(deltas) if deltas else None,
              'sampled_world_area_fraction': sampled_world_area / total_world_area if total_world_area else 0,
              'area_weighted_mean_uv_delta': sum(e * a for e, a in weighted_errors) / sampled_world_area
                  if sampled_world_area else None,
              'preflight': preflight, 'per_object': per_object}
    if preflight['unreplaced_slots']:
        report['FAIL'] = 'unreplaced material slots: %d' % len(preflight['unreplaced_slots'])
    coverage = len(deltas) / max(1, len(deltas) + subpixel + collapsed + uncovered)
    report['conclusive_coverage'] = coverage
    verdicts = {row['verdict'] for row in per_object.values()}
    report['verdict'] = ('FAIL' if (preflight['unreplaced_slots'] or 'FAIL' in verdicts) else
                         'INCONCLUSIVE' if not deltas or 'INCONCLUSIVE' in verdicts else 'PASS')
    report['limits'] = ['Mapping diagnostic only, not original PBR material transfer',
                        'Up to three in-triangle pixel centres; maximum sample error, not full raster coverage',
                        'One-pixel area does not guarantee a raster-covered interior sample',
                        'Squeezed below one pixel is resolution loss, not proof of geometric UV collapse']
    worst = sorted(per_object.items(), key=lambda kv: -kv[1].get('p95_target', 0))[:5]
    for name, row in worst:
        print('WORST', name, json.dumps(row))

    (out / 'transfer_check.json').write_text(json.dumps(report, indent=2))
    print('REPACK_TRANSFER', json.dumps(report))
    if args.no_render:
        return

    # Checker render on the repacked layout.
    checker = bpy.data.images.new('REPACK_CHECKER', args.resolution, args.resolution, alpha=False)
    yy, xx = np.mgrid[0:args.resolution, 0:args.resolution]
    step = max(1, args.resolution // 16)
    on = (((xx // step) + (yy // step)) % 2).astype(bool)
    px = np.ones((args.resolution, args.resolution, 4), dtype=np.float32)
    px[on] = (0.85, 0.85, 0.85, 1)
    px[~on] = (0.1, 0.3, 0.65, 1)
    checker.pixels.foreach_set(px.ravel())
    checker.pack()
    for material in materials:
        nodes, links = material.node_tree.nodes, material.node_tree.links
        emit = next(n for n in nodes if n.type == 'EMISSION' and n.name == 'GRAD_EMIT')
        for link in list(emit.inputs['Color'].links):
            links.remove(link)
        node = nodes.new('ShaderNodeTexImage')
        node.image = checker
        uv = nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'UV_AI_Atlas'
        links.new(uv.outputs['UV'], node.inputs['Vector'])
        links.new(node.outputs['Color'], emit.inputs['Color'])
    world = bpy.data.worlds.new('CHECK_WORLD')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    scene.world = world
    data = bpy.data.lights.new('CHECK_SUN', 'SUN')
    data.energy = 3.0
    light = bpy.data.objects.new('CHECK_SUN', data)
    scene.collection.objects.link(light)
    light.rotation_euler = (math.radians(55), 0, math.radians(30))
    corners = [objects[0].matrix_world @ Vector(c) for c in objects[0].bound_box]
    center = sum(corners, start=corners[0] * 0) / 8.0
    size = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
    cam_data = bpy.data.cameras.new('CHECK_CAM')
    cam = bpy.data.objects.new('CHECK_CAM', cam_data)
    scene.collection.objects.link(cam)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size * 4.5
    d = Vector((-1, -1, 0.6)).normalized()
    cam.location = center + d * size * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = next(e for e in engines if 'EEVEE' in e)
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.filepath = str(out / ('%s_checker_render.png' % sheet))
    bpy.ops.render.render(write_still=True)
    (out / 'transfer_check.json').write_text(json.dumps(report, indent=2))
    print('REPACK_TRANSFER', json.dumps(report))


if __name__ == '__main__':
    main()
