"""Disposable Blender fixture: repair folded UVs, preserve geometry and original UVs."""
import argparse
import json
from pathlib import Path
import runpy
import sys

import bpy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    out = Path(args.out)
    if not bpy.app.background or out.exists():
        raise ValueError('Disposable background Blender and unused directory required')
    scene = bpy.data.scenes.new('FoldedUVFixture')
    bpy.context.window.scene = scene
    mesh = bpy.data.meshes.new('FoldedPanel')
    mesh.from_pydata([(-1, 0, 0), (0, 0, 0), (1, 0, 0),
                      (-1, 1, 0), (0, 1, 0), (1, 1, 0)], [],
                     [(0, 1, 4, 3), (1, 2, 5, 4)])
    layer = mesh.uv_layers.new(name='UVMap')
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            v = mesh.vertices[mesh.loops[li].vertex_index].co
            layer.data[li].uv = ((1-abs(v.x))*.4+.1, v.y*.6+.1)
    ob = bpy.data.objects.new('FoldedPanel', mesh)
    scene.collection.objects.link(ob)
    out.mkdir(parents=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'fixture.blend'))
    sys.argv = ['repair', '--', '--object', ob.name, '--out', str(out/'trial'), '--repair-chart', '1', '--triangulated-copy']
    helpers = runpy.run_path(str(Path(__file__).with_name('paint_unwrap_copy.py')), run_name='__main__')
    report = json.loads((out/'trial/unwrap_report.json').read_text())
    assert report['before']['uv_validation']['overlaps'] == [[1, 1]]
    assert report['uv_preflight'] == 'PASS', report['after']['uv_validation']
    assert report['geometry_and_authored_uv_preserved']
    assert len(report['after']['charts']) == 1
    assert report['triangulated_copy']
    warped = bpy.data.meshes.new('WarpedQuad')
    warped.from_pydata([(0, 0, 0), (2, 0, 0), (2, 1, .3), (0, 1, 0)], [], [(0, 1, 2, 3)])
    uv = warped.uv_layers.new(name='Authored')
    for item, point in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        item.uv = point
    frozen, provenance = helpers['triangle_copy'](warped)
    assert len(frozen.polygons) == 2 and provenance == [0, 0]
    # Independent geometric checks: each frozen triangle uses the exact saved source
    # triangle's corner positions; interpolated centres therefore lie on that triangle.
    warped.calc_loop_triangles()
    for tri, poly in zip(warped.loop_triangles, frozen.polygons):
        old = [warped.vertices[i].co.copy() for i in tri.vertices]
        new = [frozen.vertices[i].co.copy() for i in poly.vertices]
        assert old == new
        assert sum(old[1:], old[0].copy()) / 3 == sum(new[1:], new[0].copy()) / 3
    print('TRIANGLE_COPY_FIXTURE PASS: warped quad freezes exact evaluated triangle surfaces')
    conflict = bpy.data.meshes.new('ConflictingInternalDiagonals')
    conflict.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [],
                         [(0, 1, 2, 3), (0, 1, 2, 3)])
    try:
        helpers['triangle_copy'](conflict)
    except ValueError as error:
        assert 'topology regression' in str(error)
    else:
        raise AssertionError('Conflicting internal diagonal must be rejected')
    print('TRIANGLE_COPY_FAILING_FIXTURE PASS: introduced non-manifold edge rejected')
    print('PAINT_COPY_FIXTURE PASS: known folded chart detected/repaired, original UV and geometry protected')


if __name__ == '__main__':
    main()
