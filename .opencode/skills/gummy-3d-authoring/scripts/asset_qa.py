"""Read-only evaluated mesh diagnostics. Import in Blender; explicit targets only."""
import bmesh
import bpy


def run(objects, closed=True):
    if bpy.context.mode != 'OBJECT':
        raise ValueError('Run in Object mode; the helper will not change user mode')
    if not objects:
        raise ValueError('Explicit mesh object names are required')
    targets = [bpy.data.objects[name] for name in objects]
    if any(ob.type != 'MESH' for ob in targets):
        raise ValueError('All targets must be meshes')
    dg = bpy.context.evaluated_depsgraph_get()
    results = {}
    for ob in targets:
        bm = bmesh.new()
        try:
            bm.from_object(ob, dg)
            bm.transform(ob.matrix_world)
            bm.normal_update()
            bm.verts.ensure_lookup_table()
            bm.verts.index_update()
            metrics = {
                'vertices': len(bm.verts),
                'triangles': sum(len(f.verts) - 2 for f in bm.faces),
                'boundary_edges': sum(e.is_boundary for e in bm.edges),
                'wire_edges': sum(e.is_wire for e in bm.edges),
                'multi_face_edges': sum(len(e.link_faces) > 2 for e in bm.edges),
                'loose_vertices': sum(not v.link_edges for v in bm.verts),
                'zero_length_edges': sum(e.calc_length() <= 1e-9 for e in bm.edges),
                'degenerate_faces': sum(f.calc_area() <= 1e-14 for f in bm.faces),
                'winding_conflicts': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
            }
            # Inspect signed volume per connected component, not just the whole object.
            remaining = set(bm.verts)
            components = []
            while remaining:
                stack = [remaining.pop()]
                vertices = set(stack)
                while stack:
                    for edge in stack.pop().link_edges:
                        for vertex in edge.verts:
                            if vertex in remaining:
                                remaining.remove(vertex)
                                vertices.add(vertex)
                                stack.append(vertex)
                faces = {f for v in vertices for f in v.link_faces}
                edges = {e for v in vertices for e in v.link_edges}
                is_closed = bool(faces) and all(e.is_manifold for e in edges)
                # Translate to a component-local origin to reduce cancellation at large offsets.
                origin = next(iter(vertices)).co.copy()
                volume = 0.0
                for face in faces:
                    coords = [v.co - origin for v in face.verts]
                    for i in range(1, len(coords) - 1):
                        volume += coords[0].dot(coords[i].cross(coords[i + 1])) / 6
                components.append({'closed': is_closed,
                                   'signed_volume_blender_units_cubed': volume if is_closed else None})
            errors = [key for key in ('wire_edges', 'multi_face_edges', 'loose_vertices',
                                      'zero_length_edges', 'degenerate_faces', 'winding_conflicts')
                      if metrics[key]]
            if not bm.faces:
                errors.append('no_faces')
            if closed and metrics['boundary_edges']:
                errors.append('unexpected_boundaries')
            if any(c['closed'] and c['signed_volume_blender_units_cubed'] <= 0 for c in components):
                errors.append('nonpositive_component_volume_needs_orientation_review')
            results[ob.name] = dict(metrics, components=components, errors=errors,
                                    scale=list(ob.scale), negative_world_determinant=ob.matrix_world.determinant() < 0)
        finally:
            bm.free()
    return {'health_pass': all(not r['errors'] for r in results.values()),
            'closed_required': closed, 'objects': results,
            'threshold_units': 'world Blender units; length 1e-9, area 1e-14',
            'unverified': ['outward/cavity orientation (inspect Face Orientation)',
                           'z-fighting, attachment gaps and penetration',
                           'duplicate vertices, UV overlap, weights, reference fidelity']}
