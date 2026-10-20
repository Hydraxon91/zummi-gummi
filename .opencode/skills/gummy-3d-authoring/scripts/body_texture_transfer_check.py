"""Verify texture transfer on the prototype-3 body layout. Read-only on the source blend."""
import argparse
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector


def base_color_image(material):
    if not material or not material.use_nodes:
        return None, None
    bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf or not bsdf.inputs['Base Color'].links:
        return bsdf, None
    node = bsdf.inputs['Base Color'].links[0].from_node
    return bsdf, node.image if node.type == 'TEX_IMAGE' else None


def srgb_to_linear(value):
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def sample(pixels, width, height, u, v):
    x = min(width - 1, max(0, int(u * width)))
    y = min(height - 1, max(0, int(v * height)))
    return pixels[y * width + x, :3]


def frame(scene, ob, direction, factor=1.35):
    corners = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    center = sum(corners, start=corners[0] * 0) / 8.0
    size = max(max(c[i] for c in corners) - min(c[i] for c in corners) for i in range(3))
    cam_data = bpy.data.cameras.new('TRANSFER_Cam')
    cam = bpy.data.objects.new('TRANSFER_Cam', cam_data)
    scene.collection.objects.link(cam)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size * factor
    d = Vector(direction).normalized()
    cam.location = center + d * size * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--object', default='Body_Shell')
    parser.add_argument('--resolution', type=int, default=1280)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Background Blender with saved source required')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused output required')
    out.mkdir(parents=True)
    src = bpy.data.objects[args.object]
    mesh = src.data
    uv = mesh.uv_layers['UVMap']
    material = next((s.material for s in src.material_slots if s.material), None)
    bsdf, source_image = base_color_image(material)
    if source_image is None:
        raise ValueError('No Base Color image texture on %s' % args.object)
    report = {'source': bpy.data.filepath, 'object': src.name, 'material': material.name,
              'source_image': source_image.name, 'source_size': list(source_image.size),
              'bake_resolution': args.resolution}
    # Bake the surface colour into a new image using the same UV layout.
    bake = bpy.data.images.new('TRANSFER_BAKE', args.resolution, args.resolution,
                               float_buffer=True, alpha=False)
    node = material.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = bake
    material.node_tree.nodes.active = node
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    src.select_set(True)
    bpy.context.view_layer.objects.active = src
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 4
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=8, use_clear=True)
    bake.filepath_raw = str(out / 'body_transfer_baked_1280.png')
    bake.file_format = 'PNG'
    bake.save()
    disk_bake = bpy.data.images.load(str(out / 'body_transfer_baked_1280.png'), check_existing=False)
    baked = np.array(disk_bake.pixels[:]).reshape(-1, 4)
    report['colorspaces'] = {'source': source_image.colorspace_settings.name,
                             'baked_png': disk_bake.colorspace_settings.name}

    mesh.calc_loop_triangles()
    sw, sh = source_image.size
    source_pixels = np.array(source_image.pixels[:]).reshape(-1, 4)
    deltas = []
    for tri in mesh.loop_triangles:
        points = [uv.data[k].uv for k in tri.loops]
        u = sum(p.x for p in points) / 3.0
        v = sum(p.y for p in points) / 3.0
        x = min(args.resolution - 1, max(0, int(u * args.resolution)))
        y = min(args.resolution - 1, max(0, int(v * args.resolution)))
        a = baked[y * args.resolution + x, :3]
        b = np.array([srgb_to_linear(v) for v in sample(source_pixels, sw, sh, u, v)])
        deltas.append(float(np.abs(a - b).max()))
    deltas.sort()
    report['transfer'] = {
        'triangles': len(deltas),
        'mean_max_channel_delta': float(np.mean(deltas)),
        'median_max_channel_delta': deltas[len(deltas) // 2],
        'p95_max_channel_delta': deltas[int(len(deltas) * 0.95)],
        'max_max_channel_delta': deltas[-1],
        'identity_layout': True,
        'comparison': 'source sRGB decoded to linear; baked image linear; per-face UV centroid',
        'note': 'prototype-3 overlay is drawn from this same UVMap; this checks bake/texture fidelity'
    }

    # Render original and baked materials side by side.
    baked_mat = material.copy()
    baked_mat.name = 'TRANSFER_BAKED_MAT'
    bbsdf = next(n for n in baked_mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for link in list(bbsdf.inputs['Base Color'].links):
        baked_mat.node_tree.links.remove(link)
    bnode = baked_mat.node_tree.nodes.new('ShaderNodeTexImage')
    bnode.image = bake
    baked_mat.node_tree.links.new(bnode.outputs['Color'], bbsdf.inputs['Base Color'])
    preview = src.copy()
    preview.data = mesh
    scene.collection.objects.link(preview)
    if not preview.material_slots:
        raise RuntimeError('Body material slot missing')
    for slot in preview.material_slots:
        slot.link = 'OBJECT'
    preview.material_slots[0].material = baked_mat
    world = bpy.data.worlds.new('TRANSFER_World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    scene.world = world
    light_data = bpy.data.lights.new('TRANSFER_Sun', 'SUN')
    light_data.energy = 3.5
    light = bpy.data.objects.new('TRANSFER_Sun', light_data)
    scene.collection.objects.link(light)
    light.rotation_euler = (math.radians(55), 0, math.radians(35))
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scene.render.engine = next(e for e in engines if 'EEVEE' in e)
    scene.render.resolution_x = scene.render.resolution_y = 768
    scene.render.image_settings.file_format = 'PNG'
    bpy.context.view_layer.update()
    for label, direction in (('front', (0, -1, 0.15)), ('threequarter', (-1, -1, 0.6))):
        frame(scene, preview, direction)
        src.hide_render = True
        preview.hide_render = False
        scene.render.filepath = str(out / ('body_baked_%s.png' % label))
        bpy.ops.render.render(write_still=True)
        src.hide_render = False
        preview.hide_render = True
        scene.render.filepath = str(out / ('body_original_%s.png' % label))
        bpy.ops.render.render(write_still=True)
    (out / 'transfer_manifest.json').write_text(json.dumps(report, indent=2))
    print('TRANSFER_METRICS', json.dumps(report['transfer']))


if __name__ == '__main__':
    main()
