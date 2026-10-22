"""Small read-only base/evaluated diagnostics and operand-preserving Boolean setup.

Coordinates and volumes are mesh-local Blender units, not world-space capacity.
Winding/volume do not certify outward normals or reference fidelity.
"""
import bmesh
import bpy


def mesh_health(mesh):
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        remaining = set(bm.faces)
        components = []
        while remaining:
            stack = [remaining.pop()]
            faces = set(stack)
            while stack:
                for edge in stack.pop().edges:
                    for face in edge.link_faces:
                        if face in remaining:
                            remaining.remove(face)
                            faces.add(face)
                            stack.append(face)
            edges = {e for f in faces for e in f.edges}
            closed = all(len(e.link_faces) == 2 for e in edges)
            origin = next(iter(faces)).verts[0].co.copy()
            volume = 0.0
            for face in faces:
                vs = [v.co - origin for v in face.verts]
                for k in range(1, len(vs) - 1):
                    volume += vs[0].dot(vs[k].cross(vs[k + 1])) / 6.0
            components.append({'closed': closed, 'signed_volume': volume if closed else None})
        return {
            'verts': len(bm.verts), 'tris': sum(len(f.verts) - 2 for f in bm.faces),
            'boundary_edges': sum(e.is_boundary for e in bm.edges),
            'nonmanifold_edges': sum(len(e.link_faces) > 2 for e in bm.edges),
            'wire_edges': sum(e.is_wire for e in bm.edges),
            'loose_verts': sum(not v.link_edges for v in bm.verts),
            'winding_conflicts': sum(e.is_manifold and not e.is_contiguous for e in bm.edges),
            'degenerate_faces': sum(f.calc_area() < 1e-10 for f in bm.faces),
            'islands': len(components), 'components': components,
            'island_volumes': [c['signed_volume'] for c in components],
        }
    finally:
        bm.free()


def health(obj):
    if obj.type != 'MESH' or bpy.context.mode != 'OBJECT':
        raise ValueError('Mesh diagnostics require a mesh in Object mode')
    base = mesh_health(obj.data)
    evaluated = None
    try:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        if mesh is None:
            raise RuntimeError('Evaluation produced no mesh')
        result = mesh_health(mesh)
    except Exception as exc:
        raise RuntimeError(f'Evaluated health failed for {obj.name}: {exc}') from exc
    finally:
        if evaluated is not None:
            evaluated.to_mesh_clear()
    # Legacy flat fields are explicitly BASE, never an evaluated-health verdict.
    return dict(base, object=obj.name, base=base, evaluated=result,
                eval_verts=result['verts'], eval_tris=result['tris'],
                coordinate_space='mesh-local Blender units; volume units cubed',
                modifiers=[m.type for m in obj.modifiers])


def boolean(target, cutter, op='UNION'):
    """Add an editable Boolean; never apply it or remove either operand."""
    if target is cutter or target.type != 'MESH' or cutter.type != 'MESH':
        raise ValueError('Boolean requires two distinct mesh objects')
    mod = target.modifiers.new(name=f'BOOL_{op}', type='BOOLEAN')
    try:
        mod.operation = op
        mod.solver = 'EXACT'
        mod.object = cutter
    except Exception:
        target.modifiers.remove(mod)
        raise
    return target
