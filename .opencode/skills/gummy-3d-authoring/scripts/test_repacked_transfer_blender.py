"""Disposable Blender fixtures: rotated UV mapping must pass; stacked mapping must fail."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

import bpy


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    root = Path(args.out).resolve()
    if root.exists() or not bpy.app.background:
        raise ValueError('Unused output and background Blender required')
    root.mkdir(parents=True)
    spec = importlib.util.spec_from_file_location(
        'checker', Path(__file__).with_name('repacked_transfer_check.py'))
    checker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(checker)
    for label in ('rotated', 'stacked', 'subpixel', 'squeezed', 'mixed'):
        broken = label == 'stacked'
        scene = bpy.data.scenes.new(label)
        bpy.context.window.scene = scene
        mesh = bpy.data.meshes.new(label)
        mesh.from_pydata([(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                          (2, 0, 0), (3, 0, 0), (3, 1, 0), (2, 1, 0)], [],
                         [(0, 1, 2, 3), (4, 5, 6, 7)])
        mesh.update()
        ob = bpy.data.objects.new(label, mesh)
        scene.collection.objects.link(ob)
        for name in ('UVMap', 'UV_AI_Atlas'):
            mesh.uv_layers.new(name=name)
        for face in mesh.polygons:
            left = 0.1 if face.index == 0 else 0.6
            source = [(left, .15), (left + .3, .15), (left + .3, .65), (left, .65)]
            target = ([(.1, .1), (.9, .1), (.9, .9), (.1, .9)] if broken else
                      [(v, 1 - u) for u, v in source])
            if label == 'mixed':
                target = [(.8, .8), (.95, .8), (.95, .95), (.8, .95)]
            if label == 'subpixel':
                source = [(u * .0001, v * .0001) for u, v in source]
                target = [(u * .0001, v * .0001) for u, v in target]
            elif label == 'squeezed':
                target = [(u * .0001, v * .0001) for u, v in target]
            for li, uv, dest in zip(face.loop_indices, source, target):
                mesh.uv_layers['UVMap'].data[li].uv = uv
                mesh.uv_layers['UV_AI_Atlas'].data[li].uv = dest
        mat = bpy.data.materials.new(label)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Metallic'].default_value = 1
        mesh.materials.append(mat)
        if label == 'mixed':
            good = bpy.data.meshes.new('many_good')
            vertices, faces = [], []
            for i in range(100):
                x, y = i % 10, i // 10
                start = len(vertices)
                vertices.extend([(x, y, 2), (x + .8, y, 2),
                                 (x + .8, y + .8, 2), (x, y + .8, 2)])
                faces.append(tuple(range(start, start + 4)))
            good.from_pydata(vertices, [], faces)
            good.update()
            for name in ('UVMap', 'UV_AI_Atlas'):
                good.uv_layers.new(name=name)
            for poly in good.polygons:
                u, v = .02 + (poly.index % 10) * .065, .02 + (poly.index // 10) * .065
                coords = [(u, v), (u + .05, v), (u + .05, v + .05), (u, v + .05)]
                for li, coord in zip(poly.loop_indices, coords):
                    good.uv_layers['UVMap'].data[li].uv = coord
                    good.uv_layers['UV_AI_Atlas'].data[li].uv = coord
            good.materials.append(mat)
            companion = bpy.data.objects.new('many_good', good)
            scene.collection.objects.link(companion)
        bpy.ops.wm.save_as_mainfile(filepath=str(root / (label + '.blend')))
        sys.argv = ['fixture', '--', '--out', str(root / label), '--resolution', '256',
                    '--no-render']
        if label != 'mixed':
            sys.argv.extend(['--object', label])
        checker.main()
        report = json.loads((root / label / 'transfer_check.json').read_text())
        expected = {'rotated': 'PASS', 'stacked': 'FAIL',
                    'subpixel': 'INCONCLUSIVE', 'squeezed': 'FAIL', 'mixed': 'FAIL'}[label]
        assert report['verdict'] == expected, (label, report)
        assert report['conclusive_faces'] + report['subpixel_faces'] + report['collapsed_faces'] == (
            204 if label == 'mixed' else 4)
        if label == 'mixed':
            assert report['p95_uv_delta'] < .03, report
            assert report['per_object']['many_good']['verdict'] == 'PASS'
            assert report['per_object']['mixed']['verdict'] == 'FAIL'
        if label == 'subpixel':
            assert report['area_weighted_mean_uv_delta'] is None
            assert report['sampled_world_area_fraction'] == 0
        if label == 'rotated':
            assert report['area_weighted_mean_uv_delta'] < .01
            assert report['sampled_world_area_fraction'] == 1
        print('FIXTURE_OK', label, expected, report['p95_uv_delta'])
    print('REPACK_FIXTURES_PASS')


if __name__ == '__main__':
    main()
