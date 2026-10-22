"""Disposable Blender fixtures; never run in the user's live scene."""
import importlib.util
from pathlib import Path
import bpy
import bmesh
from mathutils import Matrix

path = Path(__file__).resolve().parents[2] / 'scripts/mesh_diagnostics.py'
spec = importlib.util.spec_from_file_location('mesh_diagnostics_test', path)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

# Concave L prism: area 3, height 1. Concave n-gons exercise the original bug.
ring = [(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]
verts = [(x, y, z) for z in (0, 1) for x, y in ring]
faces = [tuple(reversed(range(6))), tuple(range(6, 12))]
faces += [(i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6) for i in range(6)]
mesh = bpy.data.meshes.new('L_prism')
mesh.from_pydata(verts, [], faces)
obj = bpy.data.objects.new('Fixture', mesh)
bpy.context.scene.collection.objects.link(obj)
for transform in (Matrix.Identity(4), Matrix.Translation((4, -7, 10)),
                  Matrix.Rotation(0.73, 4, 'Y')):
    for v, co in zip(mesh.vertices, verts):
        from mathutils import Vector
        v.co = transform @ Vector(co)
    mesh.update()
    result = qa.health(obj)
    assert abs(result['base']['island_volumes'][0] - 3) < 1e-5, result
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    assert abs(bm.calc_volume(signed=True) - 3) < 1e-5
    bm.free()

bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.reverse_faces(bm, faces=list(bm.faces))
bm.to_mesh(mesh)
bm.free()
assert qa.health(obj)['base']['island_volumes'][0] < 0
bm = bmesh.new()
bm.from_mesh(mesh)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[0]], context='FACES')
bm.to_mesh(mesh)
bm.free()
assert qa.health(obj)['base']['boundary_edges'] > 0
modifier = obj.modifiers.new('Close with thickness', 'SOLIDIFY')
modifier.thickness = 0.1
report = qa.health(obj)
assert report['base']['boundary_edges'] > 0
assert report['evaluated']['boundary_edges'] == 0
obj.modifiers.remove(modifier)

bad = bpy.data.meshes.new('degenerate')
bad.from_pydata([(0, 0, 0), (1, 0, 0), (2, 0, 0), (8, 8, 8)], [], [(0, 1, 2)])
assert qa.mesh_health(bad)['degenerate_faces'] == 1
assert qa.mesh_health(bad)['loose_verts'] == 1

class BrokenEvaluation:
    type = 'MESH'
    name = 'Deliberately broken'
    data = mesh
    def evaluated_get(self, graph):
        raise RuntimeError('fixture evaluation failure')
try:
    qa.health(BrokenEvaluation())
except RuntimeError as exc:
    assert 'fixture evaluation failure' in str(exc)
else:
    raise AssertionError('Evaluation failure was hidden')

bpy.ops.mesh.primitive_cube_add()
host = bpy.context.object
bpy.ops.mesh.primitive_cube_add(location=(0.5, 0, 0))
cutter = bpy.context.object
before = [v.co.copy() for v in host.data.vertices]
qa.boolean(host, cutter, 'DIFFERENCE')
assert cutter.name in bpy.data.objects and len(host.modifiers) == 1
assert all(a == b.co for a, b in zip(before, host.data.vertices))
assert qa.health(host)['evaluated']['boundary_edges'] == 0
host.modifiers.clear()
group = host.vertex_groups.new(name='top')
group.add([v.index for v in host.data.vertices if v.co.z > 0], 1.0, 'REPLACE')
mask = host.modifiers.new('Generated open panel', 'MASK')
mask.vertex_group = group.name
result = qa.health(host)
assert result['base']['boundary_edges'] == 0
assert result['evaluated']['boundary_edges'] == 4
print('TEST_MESH_DIAGNOSTICS pass')
