"""Propose island names for one object and write a numbered review sheet.

Read-only. Produces <out>/label_review.png and <out>/island_name_template.json.
Review the template, then pass it to uv_island_export.py --names.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector

skill = Path(__file__).with_name('uv_island_export.py')
spec = importlib.util.spec_from_file_location('uv_island_export', skill)
uvx = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uvx)


def args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv')
    parser.add_argument('--resolution', type=int, default=2048)
    parser.add_argument('--out', required=True)
    return parser.parse_args(argv)


def propose(normal, centre, bounds, area_px):
    lo, hi = bounds
    length = max(1e-6, hi.y - lo.y)
    height = max(1e-6, hi.z - lo.z)
    width = max(1e-6, hi.x - lo.x)
    y = (centre.y - lo.y) / length
    z = (centre.z - lo.z) / height
    side = 'left' if centre.x < 0 else 'right'
    nx, ny, nz = abs(normal.x), abs(normal.y), abs(normal.z)
    name = 'unknown'
    if normal.z > 0.7:
        if z > 0.82 and 0.18 <= y <= 0.55:
            name = 'roof'
        elif y < 0.22 and 0.62 <= z <= 0.9:
            name = 'hood'
        elif y > 0.6 and 0.3 <= z <= 0.55:
            name = 'bed_floor'
        elif 0.55 <= y <= 0.65 and z > 0.75:
            name = 'bed_bulkhead'
        elif z < 0.25:
            name = 'underside'
        elif z < 0.55:
            name = 'floor'
        else:
            name = 'body_top'
    elif normal.z < -0.7:
        name = 'inner_skin' if z > 0.25 else 'underside'
    elif nx > 0.75:
        if y > 0.72 and 0.5 <= z <= 0.75:
            name = 'bed_side_%s' % side
        elif 0.2 <= y <= 0.55 and z >= 0.55:
            name = 'door_%s' % side
        elif z < 0.5:
            end = 'f' if y < 0.45 else 'r'
            name = 'fender_%s%s' % (end, 'l' if side == 'left' else 'r')
        else:
            name = 'body_side_%s' % side
    elif normal.y > 0.8:
        if y > 0.92:
            name = 'tailgate'
        elif abs(centre.y) < 0.55:
            name = 'bed_bulkhead'
        else:
            name = 'crossmember'
    elif normal.y < -0.8:
        if y < 0.2:
            name = 'grille' if z > 0.25 else 'bumper_front'
        elif y < 0.35:
            name = 'firewall'
        else:
            name = 'panel_rear'
    if area_px < 200:
        return 'unknown', 'low'
    confidence = 'high' if (area_px > 4000 and max(nx, ny, nz) > 0.8) else (
        'medium' if area_px > 500 else 'low')
    return name, confidence


def main():
    opts = args()
    if not bpy.app.background or not bpy.data.filepath:
        raise SystemExit('Run in disposable background Blender')
    ob = bpy.data.objects[opts.object]
    mesh = ob.data
    uv_name = opts.uv or mesh.uv_layers.active.name
    layer = mesh.uv_layers[uv_name]
    groups = uvx.mesh_islands(mesh, layer)
    resolution = opts.resolution
    records = []
    for faces in groups:
        corners, triangles, area_uv = [], [], 0.0
        normal = Vector()
        for index in faces:
            polygon = mesh.polygons[index]
            points = [layer.data[li].uv for li in polygon.loop_indices]
            corners.extend(points)
            pixels = [(p.x * (resolution - 1), (1 - p.y) * (resolution - 1)) for p in points]
            for i in range(1, len(points) - 1):
                triangles.append((pixels[0][0], pixels[0][1], pixels[i][0], pixels[i][1],
                                  pixels[i + 1][0], pixels[i + 1][1]))
            for i in range(1, len(points) - 1):
                a, b, c = points[0], points[i], points[i + 1]
                area_uv += abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) * 0.5
            normal += polygon.normal * polygon.area
        us = [p.x for p in corners]
        vs = [p.y for p in corners]
        centre = sum((ob.matrix_world @ mesh.polygons[i].center for i in faces), Vector()) / len(faces)
        world_normal = (ob.matrix_world.to_3x3() @ normal).normalized()
        records.append({'faces': faces, 'u_min': min(us), 'v_min': min(vs),
                        'centre': centre, 'normal': world_normal, 'area_uv': area_uv,
                        'corners': corners, 'triangles': triangles})
    records.sort(key=lambda r: (round(r['u_min'], 6), round(r['v_min'], 6),
                                -len(r['faces']), round(r['area_uv'], 9)))
    corners = [ob.matrix_world @ Vector(corner) for corner in ob.bound_box]
    bounds = (Vector((min(v.x for v in corners), min(v.y for v in corners),
                      min(v.z for v in corners))),
              Vector((max(v.x for v in corners), max(v.y for v in corners),
                      max(v.z for v in corners))))
    resolution = opts.resolution
    sheet = np.full((resolution, resolution, 3), 255, dtype=np.uint8)
    template = {}
    summary = []
    for identifier, record in enumerate(records, start=1):
        points = record['corners']
        x0 = max(0, int(math.floor(min(p.x for p in points) * (resolution - 1))) - 1)
        x1 = min(resolution - 1, int(math.ceil(max(p.x for p in points) * (resolution - 1))) + 1)
        y0 = max(0, int(math.floor((1 - max(p.y for p in points)) * (resolution - 1))) - 1)
        y1 = min(resolution - 1, int(math.ceil((1 - min(p.y for p in points)) * (resolution - 1))) + 1)
        _, _, mask = uvx.rasterise(record['triangles'], resolution, resolution, (x0, y0, x1, y1))
        area_px = int(mask.sum())
        if area_px:
            ys, xs = np.nonzero(mask)
            centroid = (x0 + float(xs.mean()), y0 + float(ys.mean()))
        else:
            centroid = ((x0 + x1) / 2, (y0 + y1) / 2)
        name, confidence = propose(record['normal'], record['centre'], bounds, area_px)
        template[str(identifier)] = {'part_name': name, 'confidence': confidence,
                                     'source_object': opts.object,
                                     'world_centroid': [round(v, 4) for v in record['centre']],
                                     'world_normal': [round(v, 3) for v in record['normal']]}
        summary.append({'id': identifier, 'part_name': name, 'confidence': confidence,
                        'world_centroid': [round(v, 4) for v in record['centre']],
                        'world_normal': [round(v, 3) for v in record['normal']],
                        'area_px': area_px, 'centroid_px': [round(v, 1) for v in centroid],
                        'bbox_px': [x0, y0, x1, y1]})
    opts.out = Path(opts.out)
    # Pair inner/outer shell islands: opposing normals, near-identical centroid, similar area.
    used = set()
    for item in summary:
        if item['id'] in used or item['part_name'] in ('unknown',):
            continue
        best = None
        for other in summary:
            if other['id'] == item['id'] or other['id'] in used:
                continue
            if abs(other['area_px'] - item['area_px']) > max(50, item['area_px'] * 0.35):
                continue
            a = template[str(item['id'])]
            b = template[str(other['id'])]
            n1, n2 = Vector(a['world_normal']), Vector(b['world_normal'])
            if n1.dot(n2) > -0.9:
                continue
            distance = (Vector(a['world_centroid']) - Vector(b['world_centroid'])).length
            if distance < 0.06 and (best is None or distance < best[0]):
                best = (distance, other)
        if best:
            other = best[1]
            if item['part_name'] in ('inner_skin', 'underside') and other['part_name'] not in ('inner_skin', 'underside'):
                item['part_name'] = other['part_name']
                template[str(item['id'])]['part_name'] = other['part_name']
                template[str(item['id'])]['surface'] = 'inner'
                other['surface'] = 'outer'
            elif other['part_name'] in ('inner_skin', 'underside'):
                other['part_name'] = item['part_name']
                template[str(other['id'])]['part_name'] = item['part_name']
                template[str(other['id'])]['surface'] = 'inner'
                item['surface'] = 'outer'
            used.update({item['id'], other['id']})
    opts.out.mkdir(parents=True, exist_ok=True)
    # Reuse the verified wireframe as the base; numbers make ids unambiguous.
    base = opts.out / 'uv_wireframe.png'
    if base.exists():
        import struct, zlib
        raw = base.read_bytes()
        pos, blocks = 8, []
        while pos < len(raw):
            size = struct.unpack_from('>I', raw, pos)[0]
            kind = raw[pos + 4:pos + 8]
            if kind == b'IHDR':
                width, height = struct.unpack_from('>II', raw, pos + 8)
            elif kind == b'IDAT':
                blocks.append(raw[pos + 8:pos + 8 + size])
            pos += size + 12
        data = zlib.decompress(b''.join(blocks))
        stride = width * 3 + 1
        rows = []
        for y in range(height):
            rows.append(data[y * stride + 1:(y + 1) * stride])
        sheet = np.frombuffer(b''.join(rows), dtype=np.uint8).reshape(height, width, 3).copy()
    for record, item in zip(records, summary):
        text = str(item['id'])
        cx, cy = item['centroid_px']
        width = item['bbox_px'][2] - item['bbox_px'][0]
        height = item['bbox_px'][3] - item['bbox_px'][1]
        scale = 2 if min(width, height) > 16 else 1
        x, y = int(cx - len(text) * 3 * scale), int(cy - 3 * scale)
        if item['area_px'] >= 16:
            uvx.draw_text(sheet, text, x, y, scale, (0, 0, 0))
    uvx.write_png(opts.out / 'label_review.png', sheet, overwrite=True)
    (opts.out / 'island_name_template.json').write_text(json.dumps(template, indent=2) + '\n')
    print('LABEL_REVIEW', opts.object, 'islands', len(records), 'out', opts.out)
    print('HIGH', sum(1 for s in summary if s['confidence'] == 'high'),
          'MEDIUM', sum(1 for s in summary if s['confidence'] == 'medium'),
          'LOW', sum(1 for s in summary if s['confidence'] == 'low'))


if __name__ == '__main__':
    main()
