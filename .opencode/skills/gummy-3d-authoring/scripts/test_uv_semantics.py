"""Synthetic checks only; disposable --background --factory-startup Blender."""
from pathlib import Path
import importlib.util

import bpy
from mathutils import Vector


def load(name):
    spec = importlib.util.spec_from_file_location('test_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if not bpy.app.background or bpy.data.filepath:
        raise ValueError('Unsaved disposable background Blender only')
    probe, semantic = load('uv_surface_probe'), load('uv_semantic_vehicle')
    mesh = bpy.data.meshes.new('ThinShellFixture')
    mesh.from_pydata([(x, y, z) for z in (0, 0.004) for x, y in ((0, 0), (1, 0), (1, 1), (0, 1))],
                     [], [(3, 2, 1, 0), (4, 5, 6, 7)])
    ob = bpy.data.objects.new('ThinShellFixture', mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (2, -4, 1)
    ob.scale = (2, 1, 3)
    uv = mesh.uv_layers.new(name='UVMap')
    for i, point in enumerate(((0, 0), (0.4, 0), (0.4, 0.4), (0, 0.4),
                               (0.6, 0.6), (1, 0.6), (1, 1), (0.6, 1))):
        uv.data[i].uv = point
    bpy.context.view_layer.update()
    before = probe.fingerprint(mesh, uv)
    records, _, _, _, _, _ = probe.analyse(ob, 'UVMap', 2, 0.02)
    assert len(records) == 2
    assert all(abs(r['world_area'] - 2) < 1e-6 for r in records)
    assert all(r['thickness_pairs'][0]['coverage'] > 0.999 for r in records)
    assert all(r['thickness_pairs'][0]['id'] != r['id'] for r in records)
    assert probe.fingerprint(mesh, uv) == before
    names = {'1': {'part_name': 'hood', 'status': 'automatic_proposal', 'evidence': []},
             '2': {'part_name': 'hood_inner', 'status': 'automatic_proposal', 'evidence': []}}
    assert semantic.validate_skin_pairs(records, names)[0]['consistent']
    names['2']['part_name'] = 'tailgate'
    assert not semantic.validate_skin_pairs(records, names)[0]['consistent']
    assert all(v['status'] == 'unknown' for v in names.values())

    # UV coordinates with the same flattened numbers but different endpoint pairs.
    adjacent = bpy.data.meshes.new('EndpointFixture')
    adjacent.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (2, 0, 0), (2, 1, 0)],
                        [], [(0, 1, 2, 3), (1, 4, 5, 2)])
    layer = adjacent.uv_layers.new(name='UVMap')
    for i, point in enumerate(((0, 0), (0.1, 0.2), (0.3, 0.4), (0, 1),
                               (0.1, 0.3), (1, 0), (1, 1), (0.2, 0.4))):
        layer.data[i].uv = point
    assert len(probe.groups(adjacent, layer)) == 2
    exporter = load('uv_island_export')
    assert len(exporter.mesh_islands(adjacent, layer)) == 2
    # Positive control: identical endpoints across a shared edge MUST join.
    layer.data[4].uv = layer.data[1].uv
    layer.data[7].uv = layer.data[2].uv
    assert len(exporter.mesh_islands(adjacent, layer)) == 1
    # Concave U: its central opening must remain empty, unlike a vertex fan.
    concave = bpy.data.meshes.new('ConcaveFixture')
    outline = [(0, 0), (3, 0), (3, 3), (2, 3), (2, 1), (1, 1), (1, 3), (0, 3)]
    concave.from_pydata([(x, y, 0) for x, y in outline], [], [tuple(range(8))])
    cuv = concave.uv_layers.new(name='UVMap')
    for item, (x, y) in zip(cuv.data, outline):
        item.uv = (x / 3, y / 3)
    tris = exporter.uv_triangles(concave, cuv, 31)[0]
    _, _, mask = exporter.rasterise(tris, 31, 31, (0, 0, 30, 30))
    assert not mask[5, 15] and mask[25, 15]

    basis = semantic.axes({'right_axis': [-1, 0, 0], 'rear_axis': [0, 1, 0], 'up_axis': [0, 0, 1]})
    body = [[-1, -2, 0], [1, 2, 2]]
    marks = {'windshield': [[-0.5, -0.5, 1.4], [0.5, 0, 1.8]],
             'rear_window': [[-0.5, 0.5, 1.3], [0.5, 0.6, 1.7]],
             'hood_source': [[-0.5, -1.8, 1.0], [0.5, -0.8, 1.2]]}
    # Tall side-panel bounds must not cause a roof/upper-shell classification.
    r = {'centroid': [0.8, -0.4, 1.1], 'normal': [1, 0, 0],
         'bounds': [[0.7, -1.5, 0.5], [0.9, 0.5, 1.9]]}
    assert semantic.classify(r, basis, body, marks)[0] == 'side_panel_left'
    r['normal'] = [-1, 0, 0]
    assert semantic.classify(r, basis, body, marks)[0] == 'side_panel_left_inner'
    r = {'centroid': [0, -1.3, 1.1], 'normal': [0, 0, 1],
         'bounds': [[-0.4, -1.8, 1], [0.4, -0.8, 1.2]]}
    assert semantic.classify(r, basis, body, marks)[0] == 'hood'
    r['normal'] = [0, 0, -1]
    assert semantic.classify(r, basis, body, marks)[0] == 'hood_inner'
    for low, high, region in ((-1.5, -0.8, 'front'), (-0.4, 0.4, 'cab'), (0.8, 1.5, 'bed')):
        floor = {'centroid': [0, (low + high) / 2, 0.1], 'normal': [0, 0, 1],
                 'bounds': [[-0.3, low, 0.1], [0.3, high, 0.1]]}
        assert semantic.classify(floor, basis, body, marks)[0] == region + '_floor' + ('' if region == 'bed' else '_inner')
        floor['normal'] = [0, 0, -1]
        assert semantic.classify(floor, basis, body, marks)[0] == region + '_floor_underside'
    floor['bounds'] = [[-0.3, -0.8, 0.1], [0.3, 0.2, 0.1]]
    assert semantic.classify(floor, basis, body, marks)[0] is None
    coverage_mesh = bpy.data.meshes.new('MixedFloorFixture')
    coverage_mesh.from_pydata([(-0.3, y, 0.1) for y in (-1.5, -0.9)] +
                             [(0.3, y, 0.1) for y in (-0.9, -1.5)] +
                             [(-0.3, y, 0.1) for y in (-0.3, 0.3)] +
                             [(0.3, y, 0.1) for y in (0.3, -0.3)],
                             [], [(3, 2, 1, 0), (7, 6, 5, 4)])
    from mathutils import Matrix
    name, coverage = semantic.classify_sampled(coverage_mesh, Matrix.Identity(4), {'faces': [1]}, basis, body, marks)
    assert name == 'cab_floor_inner' and abs(coverage['dominant_fraction'] - 1) < 1e-6
    name, coverage = semantic.classify_sampled(coverage_mesh, Matrix.Identity(4), {'faces': [0, 1]}, basis, body, marks)
    assert name is None and coverage['mixed_or_unresolved']
    assert coverage['sample_count'] == 12
    assert all(abs(r['area_fraction'] - 0.5) < 1e-6 for r in coverage['regions'])
    print('UV_SEMANTICS_FIXTURES_PASS: floor regions and boundary abstention; endpoint connectivity, nonuniform world areas, '
          'sampled opposing skins, unchanged UV/geometry, profile axes, sides and hood surfaces')


if __name__ == '__main__':
    main()
