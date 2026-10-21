"""Read-only, same-process source/evaluated/candidate comparison.

Never edits meshes, materials or saves a blend. Writes a new diagnostic JSON only.
Run in disposable Blender with --source, --candidate, --mapping and --out.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def area(points):
    a, b, c = points
    u = [b[i]-a[i] for i in range(3)]
    v = [c[i]-a[i] for i in range(3)]
    return .5 * math.hypot(u[1]*v[2]-u[2]*v[1],
                          u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])


def snapshot(obj, evaluated):
    target = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()) if evaluated else obj
    mesh = target.data
    mesh.calc_loop_triangles()
    vertices = [tuple(v.co) for v in mesh.vertices]
    triangles = [tuple(t.vertices) for t in mesh.loop_triangles]
    zero = [i for i, t in enumerate(triangles) if area([vertices[v] for v in t]) == 0.0]
    material_names = [slot.material.get('pipeline_source_material', slot.material.name)
                      if slot.material else None for slot in target.material_slots]
    face_materials = [material_names[mesh.polygons[t.polygon_index].material_index]
                      for t in mesh.loop_triangles]
    uv = {}
    for layer in mesh.uv_layers:
        per_vertex = {}
        for loop in mesh.loops:
            per_vertex.setdefault(loop.vertex_index, set()).add(tuple(layer.data[loop.index].uv))
        uv[layer.name] = {index: sorted(values) for index, values in per_vertex.items()}
    metadata = {
        'object': obj.name, 'mesh_datablock': mesh.name,
        'representation': 'evaluated' if evaluated else 'raw',
        'frame': bpy.context.scene.frame_current,
        'vertices': len(vertices), 'polygons': len(mesh.polygons),
        'triangles': len(triangles), 'zero_area_triangles_double': len(zero),
        'zero_triangle_indices': zero,
        'parent': obj.parent.name if obj.parent else None,
        'matrix_world': [list(row) for row in target.matrix_world],
        'modifiers': [{'name': m.name, 'type': m.type, 'viewport': m.show_viewport,
                       'render': m.show_render,
                       'levels': getattr(m, 'levels', None),
                       'render_levels': getattr(m, 'render_levels', None)} for m in obj.modifiers],
        'material_triangles': dict(Counter(str(m) for m in face_materials)),
        'local_vertices_sha256': digest(vertices),
        'triangle_indices_sha256': digest(triangles),
        'uv_sha256': {name: digest(values) for name, values in uv.items()},
    }
    return {'metadata': metadata, 'vertices': vertices,
            'world': [tuple(target.matrix_world @ v.co) for v in mesh.vertices],
            'triangles': triangles, 'materials': face_materials, 'uv': uv}


def compare(source, candidate):
    left, right = source['world'], candidate['world']
    index_distance = None
    if len(left) == len(right):
        index_distance = max(math.dist(a, b) for a, b in zip(left, right))
    correspondence = index_distance is not None and index_distance <= 1e-5
    result = {'same_vertex_count': len(left) == len(right),
              'index_correspondence_within_1e5_m': correspondence,
              'max_index_world_distance_m': index_distance}
    if correspondence:
        def ownership(data):
            return Counter((tuple(sorted(triangle)), material)
                           for triangle, material in zip(data['triangles'], data['materials']))
        a, b = ownership(source), ownership(candidate)
        uv_reports = {}
        for name, per_vertex in source['uv'].items():
            target = candidate['uv'].get(name)
            if target is None:
                uv_reports[name] = {'status': 'missing'}
                continue
            distances = []
            unmatched_counts = 0
            for vertex, values in per_vertex.items():
                other = target.get(vertex, [])
                if len(values) != len(other):
                    unmatched_counts += 1
                if not other:
                    continue
                distances.extend(min(math.dist(a, b) for b in other) for a in values)
                distances.extend(min(math.dist(b, a) for a in values) for b in other)
            uv_reports[name] = {'exact_equal': per_vertex == target,
                                'max_bidirectional_uv_distance': max(distances, default=0),
                                'vertices_with_different_uv_value_counts': unmatched_counts}
        result.update({'triangle_connectivity_and_materials_equal': a == b,
                       'missing_triangles': sum((a-b).values()),
                       'extra_triangles': sum((b-a).values()),
                       'source_uv_comparison': uv_reports})
    else:
        result['topology_and_uv_status'] = 'unverified: no index correspondence established'
    return result


def triangulated_snapshot(source):
    """Temporary evaluated copy, matching the candidate's declared triangulation."""
    graph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(source.evaluated_get(graph),
                                         preserve_all_data_layers=True, depsgraph=graph)
    temporary = bpy.data.objects.new('_DIAGNOSTIC_ONLY', mesh)
    bpy.context.scene.collection.objects.link(temporary)
    temporary.matrix_world = source.matrix_world
    try:
        modifier = temporary.modifiers.new('DiagnosticTriangulation', 'TRIANGULATE')
        modifier.quad_method = 'BEAUTY'
        modifier.ngon_method = 'BEAUTY'
        bpy.context.view_layer.update()
        result = snapshot(temporary, True)
        result['metadata']['source_object'] = source.name
        result['metadata']['representation'] = 'evaluated_then_BEAUTY_triangulated'
        return result
    finally:
        bpy.data.objects.remove(temporary, do_unlink=True)
        bpy.data.meshes.remove(mesh)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('source', 'candidate', 'mapping', 'out'):
        parser.add_argument('--' + option, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    if not bpy.app.background:
        raise RuntimeError('Disposable background Blender required')
    out = Path(args.out)
    if out.exists():
        raise FileExistsError(out)
    mapping = json.loads(Path(args.mapping).read_text())
    pairs = [(s, p) for group in mapping['groups']
             for s, p in zip(group['source_objects'], group['parts'])]
    if len({s for s, _ in pairs}) != len(pairs) or len({p for _, p in pairs}) != len(pairs):
        raise RuntimeError('Mapping contains duplicate identities')
    frames = [1, 20]
    baseline = {}
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.source).resolve()))
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        baseline[frame] = {s: {'raw': snapshot(bpy.data.objects[s], False),
                              'evaluated': snapshot(bpy.data.objects[s], True),
                              'triangulated': triangulated_snapshot(bpy.data.objects[s])} for s, _ in pairs}
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.candidate).resolve()))
    rows = []
    for frame in frames:
        bpy.context.scene.frame_set(frame)
        for source_name, part_name in pairs:
            source = baseline[frame][source_name]
            retained = snapshot(bpy.data.objects[source_name], True)
            part = snapshot(bpy.data.objects[part_name], False)
            comparison = compare(source['evaluated'], part)
            rows.append({'frame': frame, 'source_raw': source['raw']['metadata'],
                         'source_evaluated': source['evaluated']['metadata'],
                         'source_triangulated': source['triangulated']['metadata'],
                         'retained_source': retained['metadata'], 'candidate': part['metadata'],
                         'retained_source_comparison': compare(source['evaluated'], retained),
                         'matched_triangulation_comparison': compare(source['triangulated'], part),
                         'comparison': comparison})
    report = {'source': args.source, 'candidate': args.candidate, 'frames': frames,
              'source_sha256': hashlib.sha256(Path(args.source).read_bytes()).hexdigest(),
              'candidate_sha256': hashlib.sha256(Path(args.candidate).read_bytes()).hexdigest(),
              'pairs': len(pairs), 'rows': rows,
              'limits': ['Viewport dependency-graph evaluation; render modifier settings inventoried separately',
                         'Index correspondence is reported, never inferred from nearest distance alone',
                         'Triangulation differences are reported, not assumed to be geometry loss']}
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    summary = {'pairs': len(pairs), 'snapshots': len(rows),
               'count_mismatches': sum(not r['comparison']['same_vertex_count'] for r in rows),
               'index_mismatches': sum(not r['comparison']['index_correspondence_within_1e5_m'] for r in rows),
               'topology_material_mismatches': sum(r['comparison'].get('triangle_connectivity_and_materials_equal') is not True for r in rows),
               'matched_triangulation_material_mismatches': sum(r['matched_triangulation_comparison'].get('triangle_connectivity_and_materials_equal') is not True for r in rows),
               'trackpad': [r for r in rows if r['source_raw']['object'] == 'Trackpad']}
    summary['trackpad'] = [{'frame': r['frame'],
                           'raw': {k:r['source_raw'][k] for k in ('vertices','polygons','triangles','zero_area_triangles_double')},
                           'evaluated': {k:r['source_evaluated'][k] for k in ('vertices','polygons','triangles','zero_area_triangles_double')},
                           'output': {k:r['candidate'][k] for k in ('vertices','polygons','triangles','zero_area_triangles_double')},
                           'comparison':r['comparison']} for r in summary['trackpad']]
    print('TRANSFER_DIAGNOSTIC', json.dumps(summary))


if __name__ == '__main__':
    main()
