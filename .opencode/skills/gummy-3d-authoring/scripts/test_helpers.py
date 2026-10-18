"""Synthetic fixtures ONLY: run in a disposable --background --factory-startup Blender."""
import importlib.util
import json
import math
from pathlib import Path
import struct

import bmesh
import bpy


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    if not bpy.app.background or bpy.data.filepath:
        raise RuntimeError('Tests require an unsaved disposable background Blender')
    qa, uv, glb = [load(name) for name in ('asset_qa', 'uv_report', 'glb_report')]
    created = []

    def mesh(name, vertices, faces):
        data = bpy.data.meshes.new(name)
        data.from_pydata(vertices, [], faces)
        ob = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(ob)
        created.append(ob)
        return ob

    def report(ob, closed=True):
        return qa.run([ob.name], closed=closed)

    try:
        cube = mesh('QA_FixtureCube', [], [])
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=2)
        bm.to_mesh(cube.data)
        bm.free()
        assert report(cube)['health_pass']
        bm = bmesh.new()
        bm.from_mesh(cube.data)
        bm.faces.ensure_lookup_table()
        bm.faces[0].normal_flip()
        bm.to_mesh(cube.data)
        assert report(cube)['objects'][cube.name]['winding_conflicts'] > 0
        bm.faces[0].normal_flip()
        bm.to_mesh(cube.data)
        bm.free()
        assert report(cube)['health_pass']
        bevel = cube.modifiers.new('FixtureBevel', 'BEVEL')
        bevel.width = 0.1
        assert report(cube)['objects'][cube.name]['vertices'] > 8
        cube.modifiers.remove(bevel)
        cube.scale.x = -1
        bpy.context.view_layer.update()
        assert not report(cube)['health_pass']
        cube.scale.x = 1
        plane = mesh('QA_FixturePlane', [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)], [(0, 1, 2, 3)])
        layer = plane.data.uv_layers.new()
        for item, coord in zip(layer.uv, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            item.vector = coord
        bpy.context.view_layer.update()
        assert not report(plane)['health_pass']
        assert report(plane, closed=False)['health_pass']
        assert report(plane, closed=False)['objects'][plane.name]['boundary_edges'] == 4
        baseline = (len(bpy.data.objects), len(bpy.data.meshes), list(plane.scale))
        unit_scale = bpy.context.scene.unit_settings.scale_length
        density = uv.run([plane.name], [1024, 1024])['objects'][plane.name]['density_px_per_m']
        assert math.isclose(density, 1024 / unit_scale, rel_tol=1e-6)
        plane.scale = (2, 2, 2)
        bpy.context.view_layer.update()
        density = uv.run([plane.name], [1024, 1024])['objects'][plane.name]['density_px_per_m']
        assert math.isclose(density, 512 / unit_scale, rel_tol=1e-6)
        plane.scale = (1, 1, 1)
        assert uv.run([cube.name], [1024, 1024])['objects'][cube.name]['uv_map'] is None
        assert baseline == (len(bpy.data.objects), len(bpy.data.meshes), list(plane.scale))
        try:
            bpy.context.scene.unit_settings.scale_length = 0.01
            density = uv.run([plane.name], [1024, 1024])['objects'][plane.name]['density_px_per_m']
            assert math.isclose(density, 102400, rel_tol=1e-6)
        finally:
            bpy.context.scene.unit_settings.scale_length = unit_scale
        for item in layer.uv:
            item.vector = (0, 0)
        assert uv.run([plane.name], [1024, 1024])['objects'][plane.name]['zero_uv_area_triangles'] == 2
        loose = mesh('QA_FixtureLoose', [(0, 0, 0)], [])
        assert not report(loose)['health_pass']

        def pack(doc):
            payload = json.dumps(doc).encode()
            payload += b' ' * (-len(payload) % 4)
            return struct.pack('<4sIIII', b'glTF', 2, 20 + len(payload), len(payload), 0x4E4F534A) + payload

        doc = {'asset': {'version': '2.0'}, 'accessors': [{'count': 3}],
               'meshes': [{'primitives': [{'attributes': {'POSITION': 0}}]}],
               'nodes': [{'mesh': 0}, {'mesh': 0}], 'extensionsRequired': ['TEST_extension']}
        result = glb.inspect_bytes(pack(doc))
        assert result['unique_mesh_primitive_triangles'] == 1
        assert result['all_node_instance_triangles'] == 2
        assert result['extensions_required'] == ['TEST_extension']
        doc['meshes'][0]['primitives'][0]['indices'] = 0
        assert glb.inspect_bytes(pack(doc))['unique_mesh_primitive_triangles'] == 1
        del doc['meshes'][0]['primitives'][0]['indices']
        for invalid in (b'', pack(doc)[:-1], b'bad!' + pack(doc)[4:]):
            try:
                glb.inspect_bytes(invalid)
            except ValueError:
                pass
            else:
                raise AssertionError('Malformed GLB was accepted')
        doc['meshes'][0]['primitives'][0]['mode'] = 1
        assert glb.inspect_bytes(pack(doc))['unique_mesh_primitive_triangles'] is None
        print('GUMMY_HELPERS_PASS: closed/open/loose meshes, evaluated modifier, reflected winding, '
              'UV density/scale/missing UV, no object/mesh leaks, GLB counts/instances/extensions/malformed input/non-triangles')
    finally:
        for ob in created:
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            bpy.data.meshes.remove(data)


if __name__ == '__main__':
    main()
