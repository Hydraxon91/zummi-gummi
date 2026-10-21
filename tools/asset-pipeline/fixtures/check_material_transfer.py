"""Multi-material regression fixture. Run in disposable factory-startup Blender.

Covers two failures the earlier single-material fixtures could not see:
1. Material compaction inside restore_assembly must preserve per-face identity.
2. The legacy sequence (remap, then clear slots) silently collapses every face
   onto slot 0; the second half proves this fixture detects that defect instead
   of passing on an unchanged result.
"""
import sys
from pathlib import Path

import bpy
import bmesh

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.bake import duplicate_and_join, merge_equivalent_materials, restore_assembly

bpy.ops.wm.read_factory_settings(use_empty=True)

root = bpy.data.objects.new('FixtureRoot', None)
bpy.context.scene.collection.objects.link(root)


def source_material(name, color):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*color, 1.0)
    return material


palette = [source_material(f'Fixture_{index}', color)
           for index, color in enumerate(((0.8, 0.1, 0.1),
                                          (0.1, 0.7, 0.2),
                                          (0.2, 0.2, 0.9)))]

# One object carrying three distinct materials in three face bands.
bpy.ops.mesh.primitive_cube_add(location=(-2, 0, 0))
multi = bpy.context.object
multi.name = 'Fixture_Multi'
multi.parent = root
multi.data.uv_layers[0].name = 'StickerDecal'
bm = bmesh.new()
bm.from_mesh(multi.data)
bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=3, use_grid_fill=True)
bm.to_mesh(multi.data)
bm.free()
for material in palette:
    multi.data.materials.append(material)
band = len(multi.data.polygons) // 3
for index, face in enumerate(multi.data.polygons):
    face.material_index = min(index // max(band, 1), 2)
expected_bands = [face.material_index for face in multi.data.polygons]

# A second single-material sibling so mixed slot counts are exercised too.
bpy.ops.mesh.primitive_cube_add(location=(2, 0, 0))
single = bpy.context.object
single.name = 'Fixture_Single'
single.parent = root
single.data.uv_layers[0].name = 'StickerDecal'
single.data.materials.append(palette[2])

sources = [multi, single]
atlas, _, ranges = duplicate_and_join(sources)
bpy.context.view_layer.update()

def material_identity(slot_material):
    return slot_material.get('pipeline_source_material', slot_material.name)

expected = {}
for obj, span in zip(sources, ranges):
    expected[obj.name] = [material_identity(atlas.material_slots[face.material_index].material)
                          for face in atlas.data.polygons[span['face_start']:span['face_end']]]
assert set(expected['Fixture_Multi']) == {'Fixture_0', 'Fixture_1', 'Fixture_2'}, \
    sorted(set(expected['Fixture_Multi']))

parts, _ = restore_assembly(atlas, sources, ranges)
by_name = {part.name: part for part in parts}

for obj in sources:
    part = by_name['Atlas_' + obj.name]
    actual = [material_identity(part.material_slots[face.material_index].material)
              for face in part.data.polygons]
    assert actual == expected[obj.name], (
        f'{obj.name}: material identity changed on restore '
        f'({sorted(set(actual))} vs {sorted(set(expected[obj.name]))})')
    used = {face.material_index for face in part.data.polygons}
    assert used == set(range(len(part.data.materials))), (obj.name, used)
    assert len(part.data.materials) == len(set(expected[obj.name]))

# Band geometry still follows the same material regions (not just the same count).
part = by_name['Atlas_Fixture_Multi']
restored_bands = [face.material_index for face in part.data.polygons]
compacted = sorted(set(expected['Fixture_Multi']))
assert [compacted.index(value) for value in expected['Fixture_Multi']] == restored_bands, \
    'Multi-material face order changed'
assert len(expected_bands) == len(multi.data.polygons)

# Negative control: two faces on slots 0 and 2 compact to 0 and 1. The pre-fix
# ordering (remap, clear, re-append) resets both indices to 0, so this control
# fails on the old code and passes only with the fixed write-back order.
def compact(mesh, clear_before_write):
    used = sorted({face.material_index for face in mesh.polygons})
    remap = {old: new for new, old in enumerate(used)}
    materials = [mesh.materials[index] for index in used]
    targets = [remap[face.material_index] for face in mesh.polygons]
    if clear_before_write:
        mesh.materials.clear()
        for material in materials:
            mesh.materials.append(material)
        for face, index in zip(mesh.polygons, targets):
            face.material_index = index
        return targets
    for face, index in zip(mesh.polygons, targets):
        face.material_index = index
    mesh.materials.clear()
    for material in materials:
        mesh.materials.append(material)
    return targets


def two_band_mesh():
    mesh = bpy.data.meshes.new('LegacyCompactionControl')
    mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                      (2, 0, 0), (3, 0, 0), (3, 1, 0), (2, 1, 0)],
                     [], [(0, 1, 2, 3), (4, 5, 6, 7)])
    mesh.update()
    for material in palette:
        mesh.materials.append(material)
    mesh.polygons[0].material_index = 0
    mesh.polygons[1].material_index = 2
    return mesh


fixed_mesh = two_band_mesh()
assert compact(fixed_mesh, clear_before_write=True) == [0, 1]
assert [face.material_index for face in fixed_mesh.polygons] == [0, 1], 'fixed compaction lost a band'

legacy_mesh = two_band_mesh()
compact(legacy_mesh, clear_before_write=False)
legacy = [face.material_index for face in legacy_mesh.polygons]
assert legacy == [0, 0], legacy

# Equivalent slots from two cloned copies must merge; a different material must not.
merge_mesh = bpy.data.meshes.new('MergeFixture')
merge_mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                        (0, 2, 0), (1, 2, 0), (1, 3, 0), (0, 3, 0)],
                       [], [(0, 1, 2, 3), (4, 5, 6, 7)])
merge_mesh.update()
clone_a = palette[0].copy()
clone_b = palette[0].copy()
clone_a['pipeline_source_material'] = 'Shared'
clone_b['pipeline_source_material'] = 'Shared'
other = palette[1].copy()
other['pipeline_source_material'] = 'Other'
for material in (clone_a, clone_b, other):
    merge_mesh.materials.append(material)
merge_mesh.polygons[0].material_index = 0
merge_mesh.polygons[1].material_index = 1
assert merge_equivalent_materials(merge_mesh) == 1, 'equivalent slots did not merge'
assert len(merge_mesh.materials) == 2, len(merge_mesh.materials)
assert [face.material_index for face in merge_mesh.polygons] == [0, 0], 'merge remap lost faces'
merge_mesh.polygons[1].material_index = 1
assert merge_equivalent_materials(merge_mesh) == 0, 'different materials must not merge'

# A copy that differs only in a scalar input must not merge, even when its source
# name, images and alpha linkage are identical.
scalar_mesh = bpy.data.meshes.new('ScalarFixture')
scalar_mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                         (0, 2, 0), (1, 2, 0), (1, 3, 0), (0, 3, 0)],
                        [], [(0, 1, 2, 3), (4, 5, 6, 7)])
scalar_mesh.update()
plain = palette[0].copy()
plain['pipeline_source_material'] = 'Scalar'
varied = palette[0].copy()
varied['pipeline_source_material'] = 'Scalar'
shader = next(node for node in varied.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
shader.inputs['Coat Weight'].default_value = 0.75
for material in (plain, varied):
    scalar_mesh.materials.append(material)
scalar_mesh.polygons[0].material_index = 0
scalar_mesh.polygons[1].material_index = 1
assert merge_equivalent_materials(scalar_mesh) == 0, \
    'materials differing in a scalar input must not merge'

print('MATERIAL_TRANSFER_OK', {'multi_faces': len(part.data.polygons),
                               'materials': [part.material_slots[index].material.name
                                             for index in range(len(part.data.materials))],
                               'merged_slots': 1})
