"""Experimental scoped paint-UV copy and chart audit. Never overwrites the source.

Prepare an evaluated object copy with a separate target UV layer. A repair run unwraps
only explicitly chosen charts through isolated temporary operands, then repacks the
copy. Geometry and authored UVs are fingerprint protected; no material transfer needed.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from collections import Counter

import bpy
import bmesh


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def protected(mesh, layer):
    return hashlib.sha256(json.dumps({
        'vertices': [list(v.co) for v in mesh.vertices],
        'edges': [list(e.vertices) for e in mesh.edges],
        'faces': [(list(f.vertices), f.use_smooth) for f in mesh.polygons],
        'source_uv': [list(p.uv) for p in mesh.uv_layers[layer].data]
    }, sort_keys=True).encode()).hexdigest()


def triangle_copy(source):
    """Freeze the exact evaluated loop triangles, including corner UVs and normals."""
    source.calc_loop_triangles()
    triangles = list(source.loop_triangles)
    mesh = bpy.data.meshes.new(source.name + '_FrozenTriangles')
    mesh.from_pydata([v.co.copy() for v in source.vertices], [],
                     [tuple(t.vertices) for t in triangles])
    mesh.update()
    for mat in source.materials:
        mesh.materials.append(mat)
    original_loops = [li for tri in triangles for li in tri.loops]
    for layer in source.uv_layers:
        target = mesh.uv_layers.new(name=layer.name)
        for item, li in zip(target.data, original_loops):
            item.uv = layer.data[li].uv.copy()
    for poly, tri in zip(mesh.polygons, triangles):
        old = source.polygons[tri.polygon_index]
        poly.use_smooth = old.use_smooth
        poly.material_index = old.material_index
        assert tuple(poly.vertices) == tuple(tri.vertices)
    mesh.normals_split_custom_set([source.corner_normals[li].vector.copy() for li in original_loops])
    assert [tuple(v.co) for v in mesh.vertices] == [tuple(v.co) for v in source.vertices]
    for layer in source.uv_layers:
        assert [tuple(v.uv) for v in mesh.uv_layers[layer.name].data] == [tuple(layer.data[li].uv) for li in original_loops]
    def edge_uses(item):
        counts = Counter()
        for face in item.polygons:
            vertices = list(face.vertices)
            counts.update(tuple(sorted(pair)) for pair in zip(vertices, vertices[1:]+vertices[:1]))
        return counts
    old_uses, new_uses = edge_uses(source), edge_uses(mesh)
    introduced = [edge for edge, count in new_uses.items() if count > 2 and old_uses[edge] <= 2]
    if introduced:
        raise ValueError('Triangle-copy topology regression: %d new non-manifold edges; no unwrap or checkpoint save performed' % len(introduced))
    return mesh, [t.polygon_index for t in triangles]


def audit(ob, layer_name, uvx, checks):
    mesh = ob.data
    layer = mesh.uv_layers[layer_name]
    groups = uvx.mesh_islands(mesh, layer)
    triangles = uvx.uv_triangles(mesh, layer, 4096)
    records = [{'id': i+1, 'triangles': [t for f in faces for t in triangles[f]]}
               for i, faces in enumerate(groups)]
    bm = bmesh.new()
    bm.from_mesh(mesh)
    health = {'boundary_edges': sum(e.is_boundary for e in bm.edges),
              'nonmanifold_nonboundary_edges': sum(not e.is_manifold and not e.is_boundary for e in bm.edges),
              'loose_vertices': sum(not v.link_edges for v in bm.verts),
              'inconsistent_winding_edges': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
              'orientation_limits': 'No visual outward/cavity normals verification; UV-only operations'}
    bm.free()
    result = checks.validate(records, 4096, max_pairs=10000)
    return {'uv_validation': result, 'health': health, 'charts': [
        {'id': i+1, 'faces': faces, 'triangles': len(records[i]['triangles'])}
        for i, faces in enumerate(groups)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--source-uv', default='UVMap')
    parser.add_argument('--target-uv', default='UV_AI_Atlas')
    parser.add_argument('--out', required=True)
    parser.add_argument('--repair-chart', type=int, action='append')
    parser.add_argument('--triangulated-copy', action='store_true',
                        help='Freeze existing evaluated loop triangles; no surface movement')
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    out = Path(args.out)
    if not bpy.app.background or out.exists() or args.source_uv == args.target_uv:
        raise ValueError('Background Blender, distinct UV layers and unused output required')
    source_file = Path(bpy.data.filepath)
    source_sha = hashlib.sha256(source_file.read_bytes()).hexdigest()
    original = bpy.context.scene.objects[args.object]
    if original.type != 'MESH' or args.source_uv not in original.data.uv_layers:
        raise ValueError('Explicit mesh and source UV required')
    mesh = bpy.data.meshes.new_from_object(original.evaluated_get(bpy.context.evaluated_depsgraph_get()), preserve_all_data_layers=True, depsgraph=bpy.context.evaluated_depsgraph_get())
    source_polygons = None
    if args.triangulated_copy:
        mesh, source_polygons = triangle_copy(mesh)
    baseline = protected(mesh, args.source_uv)
    if args.target_uv not in mesh.uv_layers:
        points = [p.uv.copy() for p in mesh.uv_layers[args.source_uv].data]
        mesh.uv_layers.new(name=args.target_uv)
        for p, uv in zip(mesh.uv_layers[args.target_uv].data, points):
            p.uv = uv
    scene = bpy.data.scenes.new('DIAGNOSTIC_PaintUnwrap')
    scene.unit_settings.system = bpy.context.scene.unit_settings.system
    scene.unit_settings.scale_length = bpy.context.scene.unit_settings.scale_length
    bpy.context.window.scene = scene
    ob = bpy.data.objects.new(args.object, mesh)
    ob.matrix_world = original.matrix_world.copy()
    ob['source_object'] = original.get('source_object', original.name)
    scene.collection.objects.link(ob)
    target = mesh.uv_layers[args.target_uv]
    mesh.uv_layers.active_index = mesh.uv_layers.find(args.target_uv)
    target.active_render = True
    uvx = module('paint_uvx', 'uv_island_export.py')
    checks = module('paint_checks', 'uv_atlas_checks.py')
    before = audit(ob, args.target_uv, uvx, checks)
    out.mkdir(parents=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'baseline.blend'), copy=True)
    for chart_id in args.repair_chart or []:
        chart = next(c for c in before['charts'] if c['id'] == chart_id)
        # An independent operand ensures unwrap cannot move any other chart's UVs.
        faces = chart['faces']
        vertices = sorted({v for f in faces for v in mesh.polygons[f].vertices})
        local = {v: i for i, v in enumerate(vertices)}
        temp = bpy.data.meshes.new('ChartOperand')
        temp.from_pydata([mesh.vertices[v].co.copy() for v in vertices], [],
                         [[local[v] for v in mesh.polygons[f].vertices] for f in faces])
        temp.uv_layers.new(name='OperandUV')
        for f, old in zip(temp.polygons, faces):
            for li, original_li in zip(f.loop_indices, mesh.polygons[old].loop_indices):
                temp.uv_layers.active.data[li].uv = target.data[original_li].uv
        operand = bpy.data.objects.new('ChartOperand', temp)
        scene.collection.objects.link(operand)
        for item in scene.objects:
            item.select_set(False)
        operand.select_set(True)
        bpy.context.view_layer.objects.active = operand
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        rna = bpy.ops.uv.unwrap.get_rna_type()
        method = next(i.identifier for i in rna.properties['method'].enum_items if i.identifier == 'CONFORMAL')
        bpy.ops.uv.unwrap(method=method, margin=0)
        bpy.ops.object.mode_set(mode='OBJECT')
        for f, old in zip(temp.polygons, faces):
            for li, original_li in zip(f.loop_indices, mesh.polygons[old].loop_indices):
                target.data[original_li].uv = temp.uv_layers.active.data[li].uv
        # Unlink temporary construction only; source and saved checkpoints are retained.
        scene.collection.objects.unlink(operand)
    if args.repair_chart:
        for item in scene.objects:
            item.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        rna = bpy.ops.uv.pack_islands.get_rna_type()
        enums = {key: next(i.identifier for i in rna.properties[key].enum_items if i.identifier == wanted)
                 for key, wanted in [('margin_method', 'ADD'), ('shape_method', 'CONCAVE')]}
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=8/1280, **enums)
        bpy.ops.object.mode_set(mode='OBJECT')
    assert protected(mesh, args.source_uv) == baseline
    assert ob.matrix_world == original.matrix_world
    assert hashlib.sha256(source_file.read_bytes()).hexdigest() == source_sha
    # One neutral preview material on the copy only; original graphs are untouched.
    mat = bpy.data.materials.new('PaintGenerationPreview')
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (.55, .55, .55, 1)
    mesh.materials.clear()
    mesh.materials.append(mat)
    for f in mesh.polygons:
        f.material_index = 0
    after = audit(ob, args.target_uv, uvx, checks)
    validation = after['uv_validation']
    passed = not (validation['overlaps'] or validation['out_of_bounds'] or validation['degenerate_triangles'] or validation['truncated'])
    report = {'source': str(source_file), 'source_sha256': source_sha,
              'copy_object': ob.name, 'protected_sha256': baseline,
              'geometry_and_authored_uv_preserved': True,
              'triangulated_copy': args.triangulated_copy,
              'triangle_source_polygons': source_polygons,
              'surface_preservation': 'Exact source loop-triangle vertex indices, coordinates and authored corner UVs asserted; topology may be triangulated',
              'repaired_charts': args.repair_chart or [], 'before': before, 'after': after,
              'uv_preflight': 'PASS' if passed else 'FAIL',
              'delivery': 'DIAGNOSTIC_ONLY; guide readability, labels and mapping not accepted'}
    (out/'unwrap_report.json').write_text(json.dumps(report, indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'paint_copy.blend'), copy=True)
    print('PAINT_UNWRAP', ob.name, 'charts', len(after['charts']), 'preflight', report['uv_preflight'], json.dumps(validation))


if __name__ == '__main__':
    main()
