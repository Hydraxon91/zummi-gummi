"""Single-component UV proof: evaluated copy, deliberate seams, unwrap, checker, bake, metrics.

Runs against the saved source blend and writes only to the proof output directory.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np


def load(name):
    spec = importlib.util.spec_from_file_location('proof_' + name,
                                                  Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(mesh, layer_name=None):
    h = hashlib.sha256()
    for v in mesh.vertices:
        h.update(('v%.9f,%.9f,%.9f;' % tuple(v.co)).encode())
    for p in mesh.polygons:
        h.update(('p' + ','.join(str(i) for i in p.vertices) + ';').encode())
    if layer_name:
        layer = mesh.uv_layers[layer_name]
        for d in layer.data:
            h.update(('u%.9f,%.9f;' % (d.uv.x, d.uv.y)).encode())
    return h.hexdigest()


def tri_geometry(ob, mesh, layer):
    mesh.calc_loop_triangles()
    rows = []
    for tri in mesh.loop_triangles:
        pts3 = [ob.matrix_world @ mesh.vertices[v].co for v in tri.vertices]
        pts2 = [layer.data[k].uv.copy() for k in tri.loops]
        a3 = ((pts3[1] - pts3[0]).cross(pts3[2] - pts3[0])).length * 0.5
        a2 = abs((pts2[1].x - pts2[0].x) * (pts2[2].y - pts2[0].y) -
                 (pts2[2].x - pts2[0].x) * (pts2[1].y - pts2[0].y)) * 0.5
        rows.append({'face': tri.polygon_index, 'a3': a3, 'a2': a2,
                     'p3': [tuple(p) for p in pts3],
                     'p2': [(p.x, p.y) for p in pts2]})
    return rows


def measure(audit, rows):
    total3 = sum(r['a3'] for r in rows) or 1.0
    total2 = sum(r['a2'] for r in rows) or 1.0
    ratios, angles = [], []
    for r in rows:
        if r['a3'] <= 1e-12 or r['a2'] <= 1e-16:
            continue
        ratios.append((r['a2'] / total2) / (r['a3'] / total3))
        for corner in range(3):
            p3, q3 = r['p3'][corner], r['p3'][(corner + 1) % 3]
            p2, q2 = r['p2'][corner], r['p2'][(corner + 1) % 3]
            v3 = [q3[i] - p3[i] for i in range(3)]
            v2 = [q2[0] - p2[0], q2[1] - p2[1]]
            n3 = math.sqrt(sum(x * x for x in v3)) or 1.0
            n2 = math.hypot(*v2) or 1.0
            # angle between consecutive edges at this corner, 3D vs UV
            w3 = [r['p3'][(corner + 2) % 3][i] - p3[i] for i in range(3)]
            w2 = [r['p2'][(corner + 2) % 3][0] - p2[0],
                  r['p2'][(corner + 2) % 3][1] - p2[1]]
            a = math.degrees(math.acos(max(-1, min(1, sum(v3[i] * w3[i] for i in range(3)) /
                                                    (n3 * (math.sqrt(sum(x * x for x in w3)) or 1.0))))))
            b = math.degrees(math.acos(max(-1, min(1, (v2[0] * w2[0] + v2[1] * w2[1]) /
                                                    (n2 * (math.hypot(*w2) or 1.0))))))
            angles.append(abs(a - b))
    grid, pairs, max_area = {}, 0, 0.0
    sliver_pairs = 0
    prepared = []
    for index, r in enumerate(rows):
        tri = r['p2']
        if r['a2'] <= 1e-16:
            continue
        lo = [min(p[k] for p in tri) for k in (0, 1)]
        hi = [max(p[k] for p in tri) for k in (0, 1)]
        prepared.append((tri, lo, hi, r['a3']))
    for index, (tri, lo, hi, a3) in enumerate(prepared):
        cells = [(x, y) for x in range(int(lo[0] * 64), min(63, int(hi[0] * 64)) + 1)
                 for y in range(int(lo[1] * 64), min(63, int(hi[1] * 64)) + 1)]
        for j in {j for c in cells for j in grid.get(c, [])}:
            other, olo, ohi, oa3 = prepared[j]
            if any(hi[k] <= olo[k] or lo[k] >= ohi[k] for k in (0, 1)):
                continue
            area = audit.overlap(tri, other)
            if area > 1e-12:
                pairs += 1
                max_area = max(max_area, area)
                if min(a3, oa3) < 1e-8:
                    sliver_pairs += 1
        for c in cells:
            grid.setdefault(c, []).append(index)
    ratios.sort()
    return {'triangles': len(rows), 'uv_overlap_pairs_1e12': pairs,
            'uv_overlap_pairs_involving_source_sliver': sliver_pairs,
            'uv_max_overlap_normalized': max_area,
            'relative_density': {'min': ratios[0], 'p05': ratios[len(ratios) // 20],
                                 'median': ratios[len(ratios) // 2],
                                 'p95': ratios[-max(1, len(ratios) // 20)], 'max': ratios[-1]},
            'max_angle_error_degrees': max(angles) if angles else 0.0,
            'extreme_density_triangles': sum(1 for r in ratios if r > 10 or r < 0.1)}


def frame_camera(scene, ob, direction, size_factor=1.6):
    corners = [ob.matrix_world @ __import__('mathutils').Vector(c) for c in ob.bound_box]
    center = sum(corners, start=corners[0] * 0) / 8.0
    size = max((max(c[i] for c in corners) - min(c[i] for c in corners)) for i in range(3))
    cam_data = bpy.data.cameras.new('PROOF_Cam')
    cam = bpy.data.objects.new('PROOF_Cam', cam_data)
    scene.collection.objects.link(cam)
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = size * size_factor
    d = __import__('mathutils').Vector(direction).normalized()
    cam.location = center + d * (size * 4)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def draw_layout(rows, resolution, path):
    px = np.ones((resolution, resolution, 4), dtype=np.float32)
    step = max(1, resolution // 8)
    px[::step, :, :3] = 0.85
    px[:, ::step, :3] = 0.85

    def line(a, b, color):
        count = max(2, int(max(abs(b[0] - a[0]), abs(b[1] - a[1])) * resolution * 2))
        for s in range(count + 1):
            t = s / count
            x = int((a[0] + (b[0] - a[0]) * t) * resolution)
            y = int((a[1] + (b[1] - a[1]) * t) * resolution)
            if 0 <= x < resolution and 0 <= y < resolution:
                px[y, x, :3] = color

    for r in rows:
        for i in range(3):
            line(r['p2'][i], r['p2'][(i + 1) % 3], (0.1, 0.2, 0.6))
    img = bpy.data.images.new('PROOF_UVLayout', resolution, resolution, alpha=False)
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = str(path)
    img.file_format = 'PNG'
    img.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--object', default='Dashboard_Main')
    parser.add_argument('--sharp-angle', type=float, default=60.0)
    parser.add_argument('--resolution', type=int, default=1024)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Background Blender with saved source required')
    out = Path(args.out).resolve()
    if out.exists():
        raise ValueError('Unused proof output required')
    out.mkdir(parents=True)
    audit = load('atlas_audit')
    src = bpy.data.objects[args.object]
    dg = bpy.context.evaluated_depsgraph_get()
    ev = src.evaluated_get(dg)
    temp = ev.to_mesh()
    mesh = temp.copy()
    ev.to_mesh_clear()
    if not mesh.materials:
        for m in src.data.materials:
            mesh.materials.append(m)
    ob = bpy.data.objects.new('PROOF_' + args.object, mesh)
    proof = bpy.data.scenes.new('Proof')
    bpy.context.window.scene = proof
    proof.collection.objects.link(ob)
    for o in bpy.context.scene.collection.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob

    geometry_before = digest(mesh)
    source_uv_before = digest(mesh, 'UVMap')
    layer = mesh.uv_layers.new(name='UV_PROOF')
    mesh.uv_layers.active_index = mesh.uv_layers.find('UV_PROOF')
    layer.active_render = True
    # Deliberate seams: preserve the authored UV discontinuities, plus open and sharp boundaries.
    faces_of_edge = {}
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            faces_of_edge.setdefault(mesh.loops[li].edge_index, []).append(poly.index)
    source_layer = mesh.uv_layers['UVMap']
    edge_uvs = {}
    for poly in mesh.polygons:
        loops = list(poly.loop_indices)
        for i, li in enumerate(loops):
            lj = loops[(i + 1) % len(loops)]
            key = (mesh.loops[li].edge_index,
                   tuple(sorted((mesh.loops[k].vertex_index,
                                 tuple(round(float(v), 7) for v in source_layer.data[k].uv))
                                for k in (li, lj))))
            edge_uvs.setdefault(key, []).append(poly.index)
    seam_edges = {}
    for (edge_index, _), users in edge_uvs.items():
        seam_edges.setdefault(edge_index, []).append(len(users))
    threshold = math.cos(math.radians(args.sharp_angle))
    for edge in mesh.edges:
        users = faces_of_edge.get(edge.index, [])
        authored = len(seam_edges.get(edge.index, [])) != 1
        sharp = (len(users) == 2 and
                 mesh.polygons[users[0]].normal.dot(mesh.polygons[users[1]].normal) < threshold)
        edge.use_seam = len(users) != 2 or authored or sharp
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0.004)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=0.002,
                            margin_method='ADD', shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    layer = mesh.uv_layers['UV_PROOF']
    layer.active_render = True

    rows = tri_geometry(ob, mesh, layer)
    metrics = measure(audit, rows)
    geometry_after = digest(mesh)
    source_uv_after = digest(mesh, 'UVMap')
    uv_bounds = [[min(p[i] for r in rows for p in r['p2']) for i in (0, 1)],
                 [max(p[i] for r in rows for p in r['p2']) for i in (0, 1)]]
    report = {'source': args.source, 'object': args.object, 'evaluated': {
        'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons)},
        'seams': 'authored UV boundaries + open boundaries + face angle > %.0f degrees' % args.sharp_angle,
        'metrics': metrics, 'uv_bounds': uv_bounds,
        'geometry_unchanged': geometry_before == geometry_after,
        'source_uv_unchanged': source_uv_before == source_uv_after,
        'uv_bounds_ok': uv_bounds[0][0] >= -1e-9 and uv_bounds[0][1] >= -1e-9
                        and uv_bounds[1][0] <= 1 + 1e-9 and uv_bounds[1][1] <= 1 + 1e-9}
    checks = (metrics['uv_overlap_pairs_1e12'] == 0 and metrics['max_angle_error_degrees'] < 45
              and metrics['extreme_density_triangles'] == 0 and report['uv_bounds_ok']
              and report['geometry_unchanged'] and report['source_uv_unchanged'])
    report['PASS'] = checks
    (out / 'proof_manifest.json').write_text(json.dumps(report, indent=2))
    print('PROOF_METRICS', json.dumps(report))

    # UV layout image.
    try:
        draw_layout(rows, args.resolution, out / 'proof_uv_layout.png')
    except Exception as exc:  # layout drawing is optional evidence, not a pass condition
        report['uv_layout_error'] = repr(exc)
        print('UV_LAYOUT_ERROR', repr(exc))

    # Save clean proof before any bake helper nodes are added.
    bpy.ops.wm.save_as_mainfile(filepath=str(out / 'component_proof.blend'), copy=True)

    # Checker preview object sharing the mesh.
    checker = bpy.data.images.new('PROOF_Checker', args.resolution, args.resolution, alpha=False)
    px = np.ones((args.resolution, args.resolution, 4), dtype=np.float32)
    cells = 16
    step = max(1, args.resolution // cells)
    yy, xx = np.mgrid[0:args.resolution, 0:args.resolution]
    on = (((xx // step) + (yy // step)) % 2).astype(bool)
    px[on] = (0.85, 0.85, 0.85, 1)
    px[~on] = (0.12, 0.35, 0.7, 1)
    checker.pixels.foreach_set(px.ravel())
    checker.pack()
    mat = bpy.data.materials.new('PROOF_Checker')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    for n in list(nodes):
        nodes.remove(n)
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = checker
    emit = nodes.new('ShaderNodeEmission')
    out_node = nodes.new('ShaderNodeOutputMaterial')
    links.new(tex.outputs['Color'], emit.inputs['Color'])
    links.new(emit.outputs['Emission'], out_node.inputs['Surface'])
    preview = bpy.data.objects.new('PROOF_Preview', mesh)
    proof.collection.objects.link(preview)
    preview.matrix_world = ob.matrix_world.copy()
    if not preview.material_slots:
        raise RuntimeError('Proof mesh lost its source material slot')
    for slot in preview.material_slots:
        slot.link = 'OBJECT'
    preview.material_slots[0].material = mat
    ob.hide_render = True
    world = bpy.data.worlds.new('PROOF_World')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    proof.world = world
    light_data = bpy.data.lights.new('PROOF_Sun', 'SUN')
    light_data.energy = 3.0
    light = bpy.data.objects.new('PROOF_Sun', light_data)
    proof.collection.objects.link(light)
    light.rotation_euler = (math.radians(55), 0, math.radians(30))
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    proof.render.engine = next(e for e in engines if 'EEVEE' in e)
    proof.render.resolution_x = proof.render.resolution_y = 768
    proof.render.image_settings.file_format = 'PNG'
    bpy.context.view_layer.update()
    for label, direction in (('front', (0, -1, 0.1)), ('top', (0, 0.001, 1)),
                             ('threequarter', (-1, -1, 0.7))):
        frame_camera(proof, preview, direction)
        proof.render.filepath = str(out / ('proof_checker_%s.png' % label))
        bpy.ops.render.render(write_still=True)

    # Bake base colour into the new UV layer.
    try:
        ob.hide_render = False
        preview.hide_render = True
        scene = proof
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = 16
        bake_img = bpy.data.images.new('PROOF_Baked_Albedo', args.resolution,
                                       args.resolution, float_buffer=True,
                                       alpha=False)
        materials = [slot.material for slot in ob.material_slots if slot.material]
        for material in materials:
            if not material.use_nodes:
                continue
            node = material.node_tree.nodes.new('ShaderNodeTexImage')
            node.image = bake_img
            material.node_tree.nodes.active = node
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4,
                            use_clear=True)
        bake_img.filepath_raw = str(out / 'proof_baked_albedo.png')
        bake_img.file_format = 'PNG'
        bake_img.save()
        baked = np.array(bake_img.pixels[:]).reshape(-1, 4)
        base = None
        for material in materials:
            if material.use_nodes:
                bsdf = next((n for n in material.node_tree.nodes
                             if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    base = list(bsdf.inputs['Base Color'].default_value)[:3]
                    break
        deltas = []
        for r in rows:
            if r['a2'] <= 1e-16:
                continue
            u = sum(p[0] for p in r['p2']) / 3.0
            v = sum(p[1] for p in r['p2']) / 3.0
            x = min(args.resolution - 1, max(0, int(u * args.resolution)))
            y = min(args.resolution - 1, max(0, int(v * args.resolution)))
            sample = baked[y * args.resolution + x, :3]
            if base is not None:
                deltas.append(float(np.abs(sample - np.array(base)).max()))
        report['bake'] = {'image': 'proof_baked_albedo.png',
                          'mean_face_max_channel_delta': float(np.mean(deltas)) if deltas else None,
                          'max_face_max_channel_delta': float(np.max(deltas)) if deltas else None,
                          'base_color': base, 'note': 'component material has no image texture'}
        bpy.ops.wm.save_as_mainfile(filepath=str(out / 'component_proof_baked.blend'), copy=True)
    except Exception as exc:
        report['bake_error'] = repr(exc)
        print('BAKE_ERROR', repr(exc))

    (out / 'proof_manifest.json').write_text(json.dumps(report, indent=2))
    print('PROOF_DONE', 'PASS' if report['PASS'] else 'FAIL')


if __name__ == '__main__':
    main()
