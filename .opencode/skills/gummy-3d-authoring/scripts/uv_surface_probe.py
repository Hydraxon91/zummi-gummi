"""Experimental read-only surface/UV correspondence and multi-view evidence.

Run in disposable background Blender. Does not save the source or change live state.
This prepares evidence for semantic naming; geometry measurements are not semantic truth.
"""
import argparse
from collections import Counter, defaultdict
import colorsys
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def helper(name):
    spec = importlib.util.spec_from_file_location('probe_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def groups(mesh, uv):
    """Connected faces across matching, vertex-associated UV edge endpoints."""
    parent = list(range(len(mesh.polygons)))
    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    edges = defaultdict(list)
    for p in mesh.polygons:
        ids = list(p.loop_indices)
        for j, li in enumerate(ids):
            lj = ids[(j + 1) % len(ids)]
            endpoints = tuple(sorted((mesh.loops[k].vertex_index,
                                      tuple(round(float(v), 7) for v in uv.data[k].uv)) for k in (li, lj)))
            edges[(mesh.loops[li].edge_index, endpoints)].append(p.index)
    for faces in edges.values():
        for face in faces[1:]:
            parent[root(face)] = root(faces[0])
    result = defaultdict(list)
    for p in mesh.polygons:
        result[root(p.index)].append(p.index)
    return list(result.values())


def fingerprint(mesh, uv):
    doc = {'vertices': [list(v.co) for v in mesh.vertices],
           'faces': [list(p.vertices) for p in mesh.polygons],
           'uv': [list(d.uv) for d in uv.data]}
    return hashlib.sha256(json.dumps(doc, separators=(',', ':')).encode()).hexdigest()


def analyse(ob, uv_name, limit, thickness):
    mesh = ob.data
    uv = mesh.uv_layers[uv_name]
    uvx = helper('uv_island_export')
    found = groups(mesh, uv)
    # Preserve existing ids only if the corrected adjacency agrees with the exporter.
    old = uvx.mesh_islands(mesh, uv)
    if {frozenset(f) for f in found} != {frozenset(f) for f in old}:
        raise ValueError('Corrected UV connectivity differs; id migration needs a decision')
    mesh.calc_loop_triangles()
    uv_areas = defaultdict(float)
    for tri in mesh.loop_triangles:
        a, b, c = [uv.data[k].uv for k in tri.loops]
        uv_areas[tri.polygon_index] += abs((b - a).cross(c - a)) * 0.5
    # Reproduce legacy ordering without reusing fan triangulation for measurements.
    def legacy_order(faces):
        points = [uv.data[k].uv.copy() for f in faces for k in mesh.polygons[f].loop_indices]
        area = 0.0
        for f in faces:
            ps = [uv.data[k].uv for k in mesh.polygons[f].loop_indices]
            for i in range(1, len(ps) - 1):
                area += abs((ps[i] - ps[0]).cross(ps[i + 1] - ps[0])) * 0.5
        return (round(min(p.x for p in points), 6), round(min(p.y for p in points), 6),
                -len(faces), round(area, 9))
    found.sort(key=legacy_order)
    face_id = {f: i for i, faces in enumerate(found, 1) for f in faces}
    vertices = [ob.matrix_world @ v.co for v in mesh.vertices]
    tris = [tuple(t.vertices) for t in mesh.loop_triangles]
    bvh = BVHTree.FromPolygons(vertices, tris, all_triangles=True)
    tri_to_face = [t.polygon_index for t in mesh.loop_triangles]
    # Geometry segmentation is independent of UV seams.
    geo = list(range(len(mesh.polygons)))
    def root(i):
        while geo[i] != i:
            geo[i] = geo[geo[i]]
            i = geo[i]
        return i
    edges = defaultdict(list)
    for p in mesh.polygons:
        for e in p.edge_keys:
            edges[e].append(p.index)
    for faces in edges.values():
        if len(faces) == 2 and mesh.polygons[faces[0]].normal.dot(mesh.polygons[faces[1]].normal) > 0.8660254:
            geo[root(faces[1])] = root(faces[0])
    directions = [Vector(v) for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0),
                                     (0, -1, 0), (0, 0, 1), (0, 0, -1))]
    extent = max((a - b).length for a in vertices for b in vertices[:1]) * 3 + 1
    samples = defaultdict(list)
    pair_area = defaultdict(Counter)
    visible_area = defaultdict(float)
    for index, tri in enumerate(mesh.loop_triangles):
        a, b, c = [vertices[v] for v in tri.vertices]
        cross = (b - a).cross(c - a)
        area = cross.length * 0.5
        if area < 1e-12:
            continue
        point = (a + b + c) / 3
        normal = cross.normalized()
        island = face_id[tri.polygon_index]
        sample = {'point': point, 'normal': normal, 'area': area, 'face': tri.polygon_index}
        samples[island].append(sample)
        # Cast through the material thickness, not between region centroids.
        hit, other_normal, other, distance = bvh.ray_cast(point - normal * 1e-5, -normal, thickness)
        if other is not None and other_normal.dot(normal) < -0.8:
            target = face_id[tri_to_face[other]]
            if target != island:
                pair_area[island][target] += area
        for direction in directions:
            if direction.dot(normal) < 0.4:
                continue
            hit, _, face, _ = bvh.ray_cast(point + direction * extent, -direction, extent + 0.001)
            if hit is not None and (hit - point).length < 0.0001:
                visible_area[island] += area
                break
    records = []
    for i, faces in enumerate(found, 1):
        ss = samples[i]
        area = sum(s['area'] for s in ss)
        if not area:
            continue
        centre = sum((s['point'] * s['area'] for s in ss), Vector()) / area
        normal = sum((s['normal'] * s['area'] for s in ss), Vector()).normalized()
        ps = [vertices[v] for f in faces for v in mesh.polygons[f].vertices]
        pairs = [{'id': other, 'coverage': round(value / area, 5)}
                 for other, value in pair_area[i].most_common(3)]
        records.append({'id': i, 'faces': faces, 'world_area': area,
                        'uv_area': sum(uv_areas[f] for f in faces),
                        'centroid': list(centre), 'normal': list(normal),
                        'bounds': [[min(p[k] for p in ps) for k in range(3)],
                                   [max(p[k] for p in ps) for k in range(3)]],
                        'axis_visible_fraction': visible_area[i] / area,
                        'thickness_pairs': pairs,
                        'geometric_regions': dict(Counter(str(root(f)) for f in faces))})
    records.sort(key=lambda r: (-r['uv_area'], r['id']))
    chosen = records[:limit]
    return records, chosen, samples, bvh, tri_to_face, face_id


def capture(ob, chosen, samples, bvh, tri_to_face, face_id, out, resolution):
    """Workbench diagnostic copies only, in a disposable process. No source writes."""
    scene = bpy.context.scene
    source = ob.data
    for obj in scene.objects:
        obj.hide_render = True
    mesh = source.copy()
    clone = bpy.data.objects.new('Probe_Body', mesh)
    scene.collection.objects.link(clone)
    clone.matrix_world = ob.matrix_world.copy()
    selected = {r['id'] for r in chosen}
    mesh.materials.clear()
    palette = [(0.35, 0.35, 0.35)] + [colorsys.hsv_to_rgb((i * 0.6180339) % 1, 0.65, 0.9) for i in sorted(selected)]
    slots = {i: j + 1 for j, i in enumerate(sorted(selected))}
    for i, color in enumerate(palette):
        mat = bpy.data.materials.new('Probe_%d' % i)
        mat.diffuse_color = (*color, 1)
        mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.material_index = slots.get(face_id[polygon.index], 0)
    try:
        scene.render.engine = 'BLENDER_WORKBENCH'
    except TypeError as exc:
        raise RuntimeError('Workbench diagnostic engine unavailable: ' + str(exc))
    shade = scene.display.shading
    shade.light = next(e.identifier for e in shade.bl_rna.properties['light'].enum_items if e.identifier == 'STUDIO')
    shade.color_type = next(e.identifier for e in shade.bl_rna.properties['color_type'].enum_items if e.identifier == 'MATERIAL')
    shade.show_shadows = True
    shade.show_cavity = True
    scene.render.resolution_x = scene.render.resolution_y = resolution
    scene.render.resolution_percentage = 100
    camera_data = bpy.data.cameras.new('Probe_Camera')
    camera_data.type = next(e.identifier for e in camera_data.bl_rna.properties['type'].enum_items if e.identifier == 'ORTHO')
    camera = bpy.data.objects.new('Probe_Camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    all_points = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    centre = sum(all_points, Vector()) / len(all_points)
    radius = max((p - centre).length for p in all_points)
    camera_data.ortho_scale = radius * 2.25
    png, uvx = helper('png_report'), helper('uv_island_export')
    views = {'front': (0, -1, 0), 'rear': (0, 1, 0), 'left': (-1, 0, 0),
             'right': (1, 0, 0), 'top': (0, 0, 1), 'bottom': (0, 0, -1),
             'front_quarter': (-1, -1, 0.7), 'rear_quarter': (1, 1, 0.8)}
    evidence = []
    tiles = []
    for name, direction in views.items():
        camera.location = centre + Vector(direction).normalized() * radius * 4
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        path = out / ('probe_' + name + '.png')
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        w, h, channels, rows = png.decode(path.read_bytes())
        pixels = np.frombuffer(b''.join(rows), dtype=np.uint8).reshape(h, w, channels)[:, :, :3].copy()
        labels = []
        for record in chosen:
            candidates = sorted(samples[record['id']], key=lambda s: -s['area'])
            for s in candidates:
                uv = world_to_camera_view(scene, camera, s['point'])
                if not (0.02 < uv.x < 0.95 and 0.02 < uv.y < 0.95):
                    continue
                # Orthographic ray through this exact projected surface point.
                forward = camera.rotation_euler.to_matrix() @ Vector((0, 0, -1))
                origin = s['point'] - forward * radius * 5
                hit, _, index, _ = bvh.ray_cast(origin, forward, radius * 6)
                if index is None or face_id[tri_to_face[index]] != record['id']:
                    continue
                x, y = int(uv.x * (w - 1)), int((1 - uv.y) * (h - 1))
                text = str(record['id'])
                pixels[max(0, y - 2):y + 16, max(0, x - 2):x + len(text) * 12 + 2] = 255
                uvx.draw_text(pixels, text, x, y, 2, (0, 0, 0))
                labels.append({'id': record['id'], 'face': tri_to_face[index], 'pixel': [x, y],
                               'world_point': list(hit)})
                break
        uvx.draw_text(pixels, name, 12, 12, 2, (0, 0, 0))
        uvx.write_png(out / ('labelled_' + name + '.png'), pixels)
        tiles.append(pixels)
        evidence.append({'view': name, 'camera_matrix_world': [list(row) for row in camera.matrix_world], 'labels': labels})
    sheet = np.concatenate([np.concatenate(tiles[i:i + 4], axis=1) for i in (0, 4)], axis=0)
    uvx.write_png(out / 'multiview_contact.png', sheet)
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', default='UVMap')
    parser.add_argument('--out', required=True)
    parser.add_argument('--limit', type=int, default=24)
    parser.add_argument('--thickness', type=float, default=0.02, help='maximum shell thickness in world Blender units')
    parser.add_argument('--resolution', type=int, default=512)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Run only in disposable background Blender on an approved saved source')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused output directory required')
    ob = bpy.data.objects[args.object]
    before = fingerprint(ob.data, ob.data.uv_layers[args.uv])
    records, chosen, samples, bvh, tri_to_face, face_id = analyse(ob, args.uv, args.limit, args.thickness)
    out.mkdir(parents=True)
    evidence = capture(ob, chosen, samples, bvh, tri_to_face, face_id, out, args.resolution)
    assert fingerprint(ob.data, ob.data.uv_layers[args.uv]) == before
    doc = {'source': bpy.data.filepath, 'source_sha256': hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest(),
           'object': ob.name, 'uv': args.uv, 'fingerprint': before, 'islands': records,
           'benchmark_ids': [r['id'] for r in chosen], 'views': evidence,
           'unverified': ['Semantic names not supplied by this geometry probe',
                          'Visibility is six-axis sampled; thickness coverage is triangle-centroid sampled',
                          'Captures isolate the host, not the assembled truck; normals/source modifiers need interpretation']}
    (out / 'surface_evidence.json').write_text(json.dumps(doc, indent=2))
    print('SURFACE_PROBE_PASS', len(records), 'islands;', len(chosen), 'benchmarked;', out)
    for r in chosen:
        print('REGION', r['id'], 'centre', [round(v, 3) for v in r['centroid']],
              'visibility', round(r['axis_visible_fraction'], 3), 'pair', r['thickness_pairs'][:1])


if __name__ == '__main__':
    main()
