"""Disposable background Blender fixtures: staging, resolutions and cross-object rejection."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

import bpy


def load(name):
    spec = importlib.util.spec_from_file_location('pipeline_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if not bpy.app.background or bpy.data.filepath:
        raise ValueError('Unsaved disposable background Blender required')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    exporter, png = load('uv_island_export'), load('png_report')
    def plane(name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(0,0,0),(1,0,0),(1,1,0),(0,1,0)], [], [(0,1,2,3)])
        uv = mesh.uv_layers.new(name='UVMap')
        for loop, coord in zip(uv.data, ((0,0),(1,0),(1,1),(0,1))):
            loop.uv = coord
        ob = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(ob)
        mat = bpy.data.materials.new(name + 'Material')
        mesh.materials.append(mat)
        exporter.MATERIAL_ZONES[mat.name] = 'body_paint'
        return ob
    a = plane('Pipeline_A')
    before = [tuple(p.uv) for p in a.data.uv_layers.active.data]
    with tempfile.TemporaryDirectory(prefix='atlas-fixtures-') as folder:
        root = Path(folder)
        bpy.ops.wm.save_as_mainfile(filepath=str(root/'source.blend'))
        def run(name, options):
            sys.argv = ['blender', '--', '--out', str(root/name)] + options
            exporter.main()
            return root/name
        result = run('separate', ['--atlas-resolution','64','--guide-resolution','32'])
        doc = json.loads((result/'island_manifest.json').read_text())
        assert doc['atlas_resolution'] == 64 and doc['resolution'] == [32,32]
        assert doc['atlas_images_written'] is False
        assert png.inspect(result/'id_map.png')['width'] == 32
        assert not (root/'separate.staging').exists()
        result = run('shorthand', ['--resolution','48'])
        doc = json.loads((result/'island_manifest.json').read_text())
        assert doc['atlas_resolution'] == 48 and doc['resolution'] == [48,48]
        assert doc['atlas_images_written'] is True
        b = plane('Pipeline_B')
        b.location.x = 3  # Different world position, identical atlas coordinates.
        bpy.context.view_layer.update()
        try:
            run('collision', ['--resolution','32'])
        except ValueError as exc:
            assert 'Atlas preflight failed' in str(exc)
        else:
            raise AssertionError('Cross-object UV overlap was silently accepted')
        assert not (root/'collision').exists()
        assert (root/'collision.staging'/'FAILED.txt').exists()
        assert not (root/'collision.staging'/'id_map.png').exists()
        assert before == [tuple(p.uv) for p in a.data.uv_layers.active.data]
    print('ATLAS_PIPELINE_FIXTURES_PASS: staged publication, split/shorthand resolutions, '
          'cross-object rejection before image output, original UV unchanged')


if __name__ == '__main__':
    main()
