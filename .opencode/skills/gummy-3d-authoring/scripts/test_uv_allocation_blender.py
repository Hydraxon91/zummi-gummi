"""Disposable fixture for complete accounting, thin/degenerate/missing-UV detection."""
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
    if out.exists() or not bpy.app.background:
        raise ValueError('Unused output and disposable background Blender required')
    scene = bpy.data.scenes.new('AllocationFixtures')
    bpy.context.window.scene = scene
    for name in ('Broad', 'Needle', 'Zero', 'NoUV'):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(0, 0, 0), (1, 0, 0), (0, 1, 0)], [], [(0, 1, 2)])
        ob = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(ob)
        if name == 'NoUV':
            continue
        for layer in ('Authored', 'Packed'):
            uv = mesh.uv_layers.new(name=layer)
            points = [(0, 0), (1, 0), (0, 1)]
            if layer == 'Packed' and name == 'Needle':
                points = [(0, 0), (1, 0), (1, .00001)]
            elif layer == 'Packed' and name == 'Zero':
                points = [(0, 0)]*3
            for item, point in zip(uv.data, points):
                item.uv = point
    out.mkdir(parents=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'fixture.blend'))
    sys.argv = ['allocation', '--', '--out', str(out/'report'), '--target-uv', 'Packed',
                '--source-uv', 'Authored', '--resolution', '4096']
    runpy.run_path(str(Path(__file__).with_name('uv_allocation_report.py')), run_name='__main__')
    report = json.loads((out/'report/allocation_report.json').read_text())
    objects = report['objects']
    assert set(objects) == {'Broad', 'Needle', 'Zero', 'NoUV'}
    assert objects['Broad']['totals']['thin'] == 0
    assert objects['Needle']['totals']['thin'] == 1
    assert objects['Needle']['totals']['zero_area'] == 0
    assert objects['Zero']['totals']['zero_area'] == 1
    assert objects['NoUV']['flags'] == ['MISSING_TARGET_UV']
    assert len(report['treatment_plan']['pending']) == 4
    assert not report['treatment_plan']['ready_for_trial']
    image = bpy.data.images.load(str(out/'report/chart_overview.png'))
    assert list(image.size) == [960, 160]
    policy = json.loads((out/'report/treatment_template.json').read_text())
    for name, rule in policy['objects'].items():
        rule['treatment'] = ('main_sheet' if name == 'Broad' else
                             'additional_sheet' if name == 'Needle' else 'preserve_existing_material')
        rule['sheet'] = 'details'
    (out/'reviewed_fixture_policy.json').write_text(json.dumps(policy))
    sys.argv = ['trial', '--', '--out', str(out/'trial'), '--policy',
                str(out/'reviewed_fixture_policy.json'), '--target-uv', 'Packed', '--source-uv', 'Authored']
    runpy.run_path(str(Path(__file__).with_name('uv_allocation_trial.py')), run_name='__main__')
    trial = json.loads((out/'trial/trial_manifest.json').read_text())
    assert len(trial['sheets']) == 2
    assert set(trial['material_only_preserved_in_source']) == {'Zero', 'NoUV'}
    assert all(Path(s['checkpoint']).is_file() for s in trial['sheets'])
    assert set(scene.objects) == {bpy.data.objects[name] for name in ('Broad', 'Needle', 'Zero', 'NoUV')}
    print('ALLOCATION_FIXTURES PASS: broad/thin/zero/missing; all pending; saved PNG decoded')
    print('ALLOCATION_TRIAL_FIXTURES PASS: explicit two sheets, two material-only, source objects retained')


if __name__ == '__main__':
    main()
