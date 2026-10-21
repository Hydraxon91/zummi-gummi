"""Synthetic Object-XY -> repeated UV transfer, with a failing projection control."""
import sys
import tempfile
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline.hybrid import repeated_plastics, tile_recipe
from pipeline.common import PipelineError

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_cube_add(location=(2, -3, 1))
source = bpy.context.object
source.rotation_euler.z = .4
material = bpy.data.materials.new('FixturePlastic')
material.use_nodes = True
tree = material.node_tree
shader = next(n for n in tree.nodes if n.type == 'BSDF_PRINCIPLED')
shader.inputs['Alpha'].default_value = .9
coordinates = tree.nodes.new('ShaderNodeTexCoord')
mapping = tree.nodes.new('ShaderNodeMapping')
mapping.inputs['Scale'].default_value = (8, 8, 8)
tree.links.new(coordinates.outputs['Object'], mapping.inputs['Vector'])
base = tree.nodes.new('ShaderNodeTexImage')
base.image = bpy.data.images.new('FixtureBase', width=4, height=4)
rough = tree.nodes.new('ShaderNodeTexImage')
rough.image = bpy.data.images.new('FixtureRough', width=4, height=4)
rough.image.colorspace_settings.name = 'Non-Color'
pixels = np.ones((16, 4), dtype=np.float32)
pixels[:, :3] = np.linspace(0, 1, 16)[:, None]
rough.image.pixels = pixels.reshape(-1).tolist()
remap = tree.nodes.new('ShaderNodeMapRange')
remap.inputs['To Min'].default_value = .3
remap.inputs['To Max'].default_value = .44
tree.links.new(mapping.outputs['Vector'], base.inputs['Vector'])
tree.links.new(mapping.outputs['Vector'], rough.inputs['Vector'])
tree.links.new(base.outputs['Color'], shader.inputs['Base Color'])
tree.links.new(rough.outputs['Color'], remap.inputs['Value'])
tree.links.new(remap.outputs['Result'], shader.inputs['Roughness'])
source.data.materials.append(material)
part = source.copy()
part.data = source.data.copy()
bpy.context.scene.collection.objects.link(part)
part.data.materials[0] = material.copy()
part.data.materials[0]['pipeline_source_material'] = material.name
bpy.context.view_layer.update()
with tempfile.TemporaryDirectory(prefix='hybrid-tile-fixture-') as directory:
    repeated_plastics([part], [source], [material.name], directory)
    layer = part.data.uv_layers['TileUV']
    for loop in part.data.loops:
        expected = source.data.vertices[loop.vertex_index].co.xy * 8
        assert (layer.data[loop.index].uv - expected).length < 1e-4
    result = part.data.materials[0]
    p = next(n for n in result.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    assert p.inputs['Base Color'].links[0].from_node.image == base.image
    r = p.inputs['Roughness'].links[0].from_node.image
    actual = np.array(r.pixels[:]).reshape(-1, 4)[:, 0]
    expected = .3 + .14*np.linspace(0, 1, 16)
    assert np.max(np.abs(actual-expected)) < 1/255 + 1e-6
    assert not p.inputs['Alpha'].is_linked and abs(p.inputs['Alpha'].default_value-.9) < 1e-6
    assert source.data.uv_layers.get('TileUV') is None
    base.projection = 'BOX'
    try:
        tile_recipe(material)
    except PipelineError:
        pass
    else:
        raise AssertionError('Unsupported projection was accepted')
print('HYBRID_TILES_PASS: transformed source coordinates, source image identity, roughness remap, alpha, rejection control')
