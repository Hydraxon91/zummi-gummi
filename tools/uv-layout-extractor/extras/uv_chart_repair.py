"""Optional per-chart UV repair on a disposable Blender copy.

Run this on a copy, not the editable source. Each requested island is rebuilt as an
isolated operand, unwrapped, fitted back into its original footprint, and copied back.
Other charts cannot move. Mio3 UV is optional; Blender's own unwrap is the fallback.
"""
import argparse
import bmesh
import bpy
import importlib.util
import json
import math
import sys
from pathlib import Path

import numpy as np


def load_parent(name):
    spec = importlib.util.spec_from_file_location('uv_repair_' + name,
                                                  Path(__file__).parent.parent / 'scripts' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fit_uvs(operand, old_bounds, margin=0.98):
    mesh = operand.data
    layer = mesh.uv_layers.active
    us = [item.uv.x for item in layer.data]
    vs = [item.uv.y for item in layer.data]
    new_min_u, new_max_u = min(us), max(us)
    new_min_v, new_max_v = min(vs), max(vs)
    old_min_u, old_min_v, old_max_u, old_max_v = old_bounds
    new_w, new_h = new_max_u - new_min_u, new_max_v - new_min_v
    old_w, old_h = old_max_u - old_min_u, old_max_v - old_min_v
    if new_w <= 0 or new_h <= 0:
        raise ValueError('Operand unwrap produced degenerate UV bounds')
    scale = min(old_w / new_w, old_h / new_h) * margin
    old_cu, old_cv = (old_min_u + old_max_u) / 2, (old_min_v + old_max_v) / 2
    new_cu, new_cv = (new_min_u + new_max_u) / 2, (new_min_v + new_max_v) / 2
    for item in layer.data:
        item.uv = (old_cu + (item.uv.x - new_cu) * scale,
                   old_cv + (item.uv.y - new_cv) * scale)


def audit(mesh, layer, core, checks, resolution=4096):
    islands = core.ordered_islands(mesh, layer, resolution)
    triangles = core.uv_triangles(mesh, layer, resolution)
    records = [{'id': island['id'],
                'triangles': [t for f in island['faces'] for t in triangles[f]]}
               for island in islands]
    return checks.validate(records, resolution, max_pairs=10000), len(islands)


def select_faces(ob, faces):
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    if bpy.context.object is not None and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for item in bpy.context.view_layer.objects:
        if item is not None:
            item.select_set(item == ob)
    bpy.context.tool_settings.mesh_select_mode = (False, False, True)
    bpy.context.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(ob.data)
    keep = set(faces)
    for face in bm.faces:
        face.select = face.index in keep
    bmesh.update_edit_mesh(ob.data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--chart', type=int, action='append', required=True)
    parser.add_argument('--engine', choices=['blender', 'mio3'], default='blender')
    parser.add_argument('--method', choices=['MINIMUM_STRETCH', 'ANGLE_BASED', 'CONFORMAL'],
                        default='MINIMUM_STRETCH')
    parser.add_argument('--relax', type=int, default=0,
                        help='Optional Mio3 relax iterations after repair')
    parser.add_argument('--pack', choices=['none', 'blender'], default='blender')
    parser.add_argument('--margin', type=float, default=8 / 1280)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Background Blender only; run on a disposable copy')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused output directory required')
    out.mkdir(parents=True)
    core, checks = load_parent('uv_core'), load_parent('uv_atlas_checks')
    ob = bpy.context.scene.objects.get(args.object)
    if ob is None or ob.type != 'MESH':
        raise ValueError('Object not found or not a mesh: %s' % args.object)
    layer = ob.data.uv_layers.get(args.uv)
    if layer is None:
        raise ValueError('UV layer not found: %s' % args.uv)
    core.require_single_tile(ob.data, layer)
    islands = core.ordered_islands(ob.data, layer)
    by_id = {island['id']: island for island in islands}
    before, before_islands = audit(ob.data, layer, core, checks)
    report = {'object': ob.name, 'uv': layer.name, 'engine': args.engine,
              'method': args.method, 'relax': args.relax, 'pack': args.pack,
              'charts': args.chart, 'before': before,
              'islands_before': before_islands, 'repaired': []}

    for chart_id in args.chart:
        island = by_id.get(chart_id)
        if island is None:
            raise ValueError('Chart %d not found' % chart_id)
        faces = island['faces']
        old_bounds = (min(layer.data[li].uv.x for f in faces
                          for li in ob.data.polygons[f].loop_indices),
                      min(layer.data[li].uv.y for f in faces
                          for li in ob.data.polygons[f].loop_indices),
                      max(layer.data[li].uv.x for f in faces
                          for li in ob.data.polygons[f].loop_indices),
                      max(layer.data[li].uv.y for f in faces
                          for li in ob.data.polygons[f].loop_indices))
        vertices = sorted({v for f in faces for v in ob.data.polygons[f].vertices})
        local = {v: i for i, v in enumerate(vertices)}
        temp = bpy.data.meshes.new('ChartOperand_%d' % chart_id)
        temp.from_pydata([ob.data.vertices[v].co.copy() for v in vertices], [],
                         [[local[v] for v in ob.data.polygons[f].vertices] for f in faces])
        temp.uv_layers.new(name='OperandUV')
        for f, old in zip(temp.polygons, faces):
            for li, original_li in zip(f.loop_indices, ob.data.polygons[old].loop_indices):
                temp.uv_layers.active.data[li].uv = layer.data[original_li].uv
        operand = bpy.data.objects.new('ChartOperand_%d' % chart_id, temp)
        bpy.context.scene.collection.objects.link(operand)
        for item in bpy.context.view_layer.objects:
            if item is not None:
                item.select_set(item == operand)
        bpy.context.view_layer.objects.active = operand
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        if args.engine == 'mio3':
            result = bpy.ops.uv.mio3_unwrap(method=args.method, axis='BOTH',
                                            keep_position=False, keep_scale=False,
                                            keep_rotate=False, merge_uv=False)
        else:
            result = bpy.ops.uv.unwrap(method=args.method, margin=0.0)
        bpy.ops.object.mode_set(mode='OBJECT')
        if result != {'FINISHED'}:
            raise RuntimeError('Unwrap failed on chart %d: %s' % (chart_id, result))
        fit_uvs(operand, old_bounds)
        layer = ob.data.uv_layers.get(args.uv)
        if layer is None:
            raise RuntimeError('UV layer disappeared during repair: %s' % args.uv)
        for f, old in zip(temp.polygons, faces):
            for li, original_li in zip(f.loop_indices, ob.data.polygons[old].loop_indices):
                layer.data[original_li].uv = temp.uv_layers.active.data[li].uv
        bpy.data.objects.remove(operand, do_unlink=True)
        bpy.data.meshes.remove(temp)
        ob.data.calc_loop_triangles()
        after_one, _ = audit(ob.data, layer, core, checks)
        report['repaired'].append({'id': chart_id, 'faces': len(faces),
                                   'after': after_one})
        print('UV_CHART_REPAIR', chart_id, 'faces', len(faces), flush=True)

    if args.relax:
        if args.engine != 'mio3':
            raise ValueError('--relax requires --engine mio3')
        select_faces(ob, [f for chart_id in args.chart for f in by_id[chart_id]['faces']])
        bpy.ops.uv.mio3_relax(method='DEFAULT', keep_pin=True, keep_boundary=True,
                              relax_x=True, relax_y=True, strength=1.0,
                              iterations=args.relax)
        bpy.ops.object.mode_set(mode='OBJECT')
        layer = ob.data.uv_layers.get(args.uv)

    if args.pack == 'blender':
        bpy.context.view_layer.objects.active = ob
        for item in bpy.context.view_layer.objects:
            if item is not None:
                item.select_set(item == ob)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        rna = bpy.ops.uv.pack_islands.get_rna_type()
        enums = {key: next(i.identifier for i in rna.properties[key].enum_items
                           if i.identifier == wanted)
                 for key, wanted in [('margin_method', 'ADD'), ('shape_method', 'CONCAVE')]}
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=args.margin, **enums)
        bpy.ops.object.mode_set(mode='OBJECT')
        layer = ob.data.uv_layers.get(args.uv)

    if layer is None:
        raise RuntimeError('UV layer disappeared during repair: %s' % args.uv)
    ob.data.calc_loop_triangles()
    after, after_islands = audit(ob.data, layer, core, checks)
    report['after'] = after
    report['islands_after'] = after_islands
    (out / 'repair_report.json').write_text(json.dumps(report, indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'repair_result.blend'), copy=True)
    print('UV_CHART_REPAIR_RESULT', json.dumps({
        'before': before, 'after': after, 'islands_before': before_islands,
        'islands_after': after_islands}), flush=True)


if __name__ == '__main__':
    main()
