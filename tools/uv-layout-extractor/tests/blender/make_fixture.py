"""Create a clean cube fixture and a deliberately overlapping fixture.

Run in background Blender:
  blender --background --python-exit-code 1 --python make_fixture.py -- OUT_DIR
"""
import bpy
import json
import sys
from pathlib import Path


def set_square(mesh, polygon, u0, v0, size):
    uv = mesh.uv_layers['UVMap']
    coords = [(u0, v0), (u0 + size, v0), (u0 + size, v0 + size), (u0, v0 + size)]
    for li, coord in zip(polygon.loop_indices, coords):
        uv.data[li].uv = coord


def main():
    args = sys.argv[sys.argv.index('--') + 1:]
    out = Path(args[0])
    out.mkdir(parents=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.mesh.primitive_cube_add(size=2)
    cube = bpy.context.object
    cube.name = 'FixtureCube'
    mesh = cube.data
    mesh.uv_layers.new(name='UVMap')
    positions = [(0.03, 0.03), (0.53, 0.03), (0.03, 0.35),
                 (0.53, 0.35), (0.03, 0.67), (0.53, 0.67)]
    for polygon, (u0, v0) in zip(mesh.polygons, positions):
        set_square(mesh, polygon, u0, v0, 0.30)
    bpy.context.view_layer.objects.active = cube
    cube.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'clean_cube.blend'))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new('OverlapMesh')
    verts = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
             (2, 0, 0), (3, 0, 0), (3, 1, 0), (2, 1, 0)]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7)]
    mesh.from_pydata(verts, [], faces)
    mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        set_square(mesh, polygon, 0.1, 0.1, 0.3)
    ob = bpy.data.objects.new('OverlapFixture', mesh)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'overlap_fixture.blend'))

    (out / 'names.json').write_text(json.dumps({
        str(index): ('front panel' if index == 1 else
                     'long wrapped panel name' if index == 2 else 'face_%d' % index)
        for index in range(1, 7)
    }, indent=2))
    (out / 'placements.json').write_text(json.dumps([{
        'id': 'test_badge', 'island': 1,
        'uv_rect': [0.08, 0.08, 0.20, 0.20],
        'source_object': 'FixtureCube', 'source_uv': 'UVMap',
        'source_uv_to_canvas': [1, 0, 0, 0, 1, 0],
    }], indent=2))
    (out / 'placements_invalid.json').write_text(json.dumps([{
        'id': 'outside_island', 'island': 1,
        'uv_rect': [0.4, 0.4, 0.5, 0.5],
        'source_object': 'FixtureCube', 'source_uv': 'UVMap',
        'source_uv_to_canvas': [1, 0, 0, 0, 1, 0],
    }], indent=2))
    print('UV_FIXTURE', out, flush=True)


if __name__ == '__main__':
    main()
