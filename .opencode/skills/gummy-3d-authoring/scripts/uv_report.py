"""Read-only evaluated world-space UV density. Import in Blender."""
import math

import bpy
from mathutils import Vector


def run(objects, resolution):
    if bpy.context.mode != 'OBJECT':
        raise ValueError('Run in Object mode; the helper will not change user mode')
    if not objects:
        raise ValueError('Explicit mesh object names are required')
    if len(resolution) != 2 or any(not math.isfinite(x) or x <= 0 for x in resolution):
        raise ValueError('Resolution must contain two positive finite dimensions')
    targets = [bpy.data.objects[name] for name in objects]
    if any(ob.type != 'MESH' for ob in targets):
        raise ValueError('All targets must be meshes')
    unit_scale = bpy.context.scene.unit_settings.scale_length
    dg = bpy.context.evaluated_depsgraph_get()
    results = {}
    for ob in targets:
        evaluated = ob.evaluated_get(dg)
        me = evaluated.to_mesh()
        try:
            me.calc_loop_triangles()
            layer = me.uv_layers.active
            if layer is None:
                results[ob.name] = {'uv_map': None, 'density_px_per_m': None}
                continue
            area_world = area_uv = 0.0
            zero_world = zero_uv = 0
            densities = []
            for tri in me.loop_triangles:
                a, b, c = [evaluated.matrix_world @ me.vertices[i].co for i in tri.vertices]
                world = (b - a).cross(c - a).length * 0.5 * unit_scale ** 2
                a, b, c = [Vector(layer.uv[i].vector) for i in tri.loops]
                ab, ac = b - a, c - a
                uv = abs(ab.x * ac.y - ab.y * ac.x) * 0.5
                area_world += world
                area_uv += uv
                zero_world += world <= 1e-16
                zero_uv += uv <= 1e-16
                if world > 1e-16:
                    densities.append(math.sqrt(uv * resolution[0] * resolution[1] / world))
            outside = sum(not (0 <= item.vector.x <= 1 and 0 <= item.vector.y <= 1)
                          for item in layer.uv)
            results[ob.name] = {
                'uv_map': layer.name, 'surface_area_m2': area_world,
                'summed_uv_area': area_uv,
                'density_px_per_m': math.sqrt(area_uv * resolution[0] * resolution[1] / area_world)
                if area_world > 1e-16 else None,
                'triangle_density_min': min(densities) if densities else None,
                'triangle_density_max': max(densities) if densities else None,
                'zero_world_area_triangles': zero_world, 'zero_uv_area_triangles': zero_uv,
                'uv_corners_outside_0_1': outside,
            }
        finally:
            evaluated.to_mesh_clear()
    return {'resolution': list(resolution), 'metres_per_blender_unit': unit_scale,
            'objects': results,
            'unverified': ['UV overlap, padding, anisotropic stretching and island orientation',
                           'per-material texture resolutions, UDIMs and bake suitability'],
            'note': 'Summed UV area counts stacked islands repeatedly; it is not atlas coverage.'}
