"""Deterministic UV-island identification export for an approved saved asset.

Creates, under --out (default ./out/uv):
  island_manifest.json, id_map.png, id_map_legend.json, zone_map.png,
  labeled_overlay.png, masks/zone_*.png, masks/island_<id>_<part>.png
plus _d<N> dilated variants. Reads only; never saves the .blend or edits UVs.

Usage (background Blender):
  blender --background APPROVED.blend --python-exit-code 1 --python uv_island_export.py -- \
      [--object Body_Shell,Wheel_FL_New] [--uv UVMap] [--resolution 2048] \
      [--dilation 8] [--out out/uv] [--names part_names.json] \
      [--mask-min-area 0] [--allow-overlap]
"""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bpy
import numpy as np
from mathutils import Vector

BACKGROUND = (128, 128, 128)
ZONE_PALETTE = {
    'body_paint': (40, 90, 200), 'plastic_trim': (70, 70, 70), 'rubber': (20, 20, 20),
    'glass': (0, 200, 220), 'metal': (190, 190, 200), 'lights': (240, 210, 40),
    'interior': (140, 90, 55), 'tire': (0, 0, 0), 'unknown': (255, 0, 255),
}
MATERIAL_ZONES = {
    'Body_Paint_Final': 'body_paint', 'Glass_Tinted': 'glass',
    'Tyre_Rubber_Black': 'tire', 'Rim_Metal': 'metal', 'Metal_Grey': 'metal',
    'Chassis_Metal_BlackCoat': 'metal', 'RC_ControlMetal': 'metal',
    'RC_FittingMetal': 'metal', 'Cage_Dark': 'metal', 'Shock_Red': 'metal',
    'Flare_Dark': 'plastic_trim', 'Grille_Dark': 'plastic_trim',
    'RC_FittingDark': 'plastic_trim', 'RC_Fitting_Dark': 'plastic_trim',
    'RC_ControlRubber': 'rubber', 'RC_Hose_Rubber': 'rubber',
    'RC_InteriorPanels': 'interior', 'RC_SeatShell': 'interior', 'RC_HarnessRed': 'interior',
    'Lens_Pale': 'lights', 'RC_AmberMarker': 'lights', 'RC_LampLens': 'lights',
    'RC_LightGuide': 'lights', 'RC_RearLens': 'lights',
}
FONT = {
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.', 'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E': '#####|#....|#....|####.|#....|#....|#####', 'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####', 'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '#####|..#..|..#..|..#..|..#..|..#..|#####', 'J': '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.####|#....|#....|.###.|....#|....#|####.', 'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#', 'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '####.|....#|....#|.###.|....#|....#|####.',
    '4': '...#.|..#..|.#...|#...#|#####|....#|....#', '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '.###.|#....|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|....#|.###.',
    '_': '.....|.....|.....|.....|.....|.....|#####', '-': '.....|.....|.....|#####|.....|.....|.....',
    '.': '.....|.....|.....|.....|.....|.....|..#..', '/': '....#|....#|...#.|..#..|.#...|#....|#....',
}


def chunk(kind, payload):
    return (struct.pack('>I', len(payload)) + kind + payload +
            struct.pack('>I', zlib.crc32(kind + payload) & 0xffffffff))


def write_png(path, pixels, overwrite=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width, channels = pixels.shape
    header = struct.pack('>IIBBBBB', width, height, 8, {1: 0, 2: 4, 3: 2, 4: 6}[channels], 0, 0, 0)
    scanlines = b''.join(b'\0' + row.tobytes() for row in pixels)
    with path.open('wb' if overwrite else 'xb') as handle:
        handle.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) +
                     chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))


def hex_colour(rgb):
    return '#%02x%02x%02x' % tuple(int(v) for v in rgb)


def id_colour(index):
    if not isinstance(index, int) or not 1 <= index <= 0xffffff:
        raise ValueError('Island ids must be positive 24-bit integers')
    # Odd multiplication permutes the entire 24-bit space without collisions.
    # Zero is otherwise unused, so swap the reserved background colour to black.
    packed = (index * 0x9e3779) & 0xffffff
    rgb = ((packed >> 16) & 255, (packed >> 8) & 255, packed & 255)
    if rgb == BACKGROUND:
        rgb = (0, 0, 0)
    return rgb


def normalise(name):
    out = []
    for character in name.lower():
        out.append(character if character.isalnum() else '_')
    return '_'.join(part for part in ''.join(out).split('_') if part) or 'unnamed'


def island_material(ob, faces):
    indices = {ob.data.polygons[i].material_index for i in faces}
    if len(indices) != 1:
        raise ValueError('UV island spans multiple material slots; split zone coverage is required: ' + ob.name)
    index = next(iter(indices))
    material = ob.material_slots[index].material if index < len(ob.material_slots) else None
    return index, material.name if material else None


def side_from_name(name):
    lowered = name.lower()
    for token, side in (('_fl', 'left'), ('_fr', 'right'), ('_rl', 'left'), ('_rr', 'right'),
                        ('_left', 'left'), ('_right', 'right'), ('_front', 'front'),
                        ('_rear', 'rear'), ('_top', 'top'), ('_bottom', 'bottom')):
        if token in lowered:
            return side
    return None


def mesh_islands(mesh, layer):
    parent = list(range(len(mesh.polygons)))

    def find(index):
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    edges = defaultdict(list)
    uv = layer.data
    for polygon in mesh.polygons:
        loops = list(polygon.loop_indices)
        for i, li in enumerate(loops):
            lj = loops[(i + 1) % len(loops)]
            key = (mesh.loops[li].edge_index,
                   tuple(sorted((mesh.loops[k].vertex_index,
                                 tuple(round(float(v), 7) for v in uv[k].uv))
                                for k in (li, lj))))
            edges[key].append(polygon.index)
    for users in edges.values():
        for other in users[1:]:
            parent[find(other)] = find(users[0])
    groups = defaultdict(list)
    for polygon in mesh.polygons:
        groups[find(polygon.index)].append(polygon.index)
    return list(groups.values())


def uv_triangles(mesh, layer, resolution):
    mesh.calc_loop_triangles()
    result = defaultdict(list)
    for tri in mesh.loop_triangles:
        points = [layer.data[k].uv for k in tri.loops]
        result[tri.polygon_index].append(tuple(value for p in points
                                              for value in (p.x * (resolution - 1),
                                                            (1 - p.y) * (resolution - 1))))
    return result


def rasterise(triangles, width, height, bbox):
    """Filled pixel set for triangles, returned as (x0, y0, bool array) in image space."""
    x_min, y_min, x_max, y_max = bbox
    w, h = x_max - x_min + 1, y_max - y_min + 1
    mask = np.zeros((h, w), dtype=bool)
    ys, xs = np.mgrid[y_min:y_max + 1, x_min:x_max + 1]
    px, py = xs + 0.5, ys + 0.5
    for ax, ay, bx, by, cx, cy in triangles:
        denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(denominator) < 1e-12:
            continue
        w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / denominator
        w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / denominator
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-9) & (w1 >= -1e-9) & (w2 >= -1e-9)
        mask |= inside
    return x_min, y_min, mask


def dilate(mask, radius):
    if radius <= 0:
        return mask
    result = mask.copy()
    for _ in range(radius):
        grown = result.copy()
        grown[1:, :] |= result[:-1, :]
        grown[:-1, :] |= result[1:, :]
        grown[:, 1:] |= result[:, :-1]
        grown[:, :-1] |= result[:, 1:]
        result = grown
    return result


def draw_text(canvas, text, x, y, scale, colour):
    height, width, _ = canvas.shape
    next_x = x
    for character in text.upper():
        glyph = FONT.get(character)
        if glyph is None:
            next_x += 4 * scale
            continue
        rows = glyph.split('|')
        for gy, row in enumerate(rows):
            for gx, value in enumerate(row):
                if value != '#':
                    continue
                x0 = next_x + gx * scale
                y0 = y + gy * scale
                if 0 <= x0 < width - scale and 0 <= y0 < height - scale:
                    canvas[y0:y0 + scale, x0:x0 + scale] = colour
        next_x += 6 * scale
    return next_x


def triangle_health(triangles, source_areas, resolution, source_uv_areas=None,
                    uv_epsilon=1e-16, source_uv_epsilon=1e-12,
                    area_epsilon=1e-12, sliver_epsilon=1e-9):
    """Classify zero-area UV triangles: inherited source-UV, source-zero, sliver, or new collapse."""
    scale = float((resolution - 1) ** 2)
    collapsed = source_zero = source_sliver = source_uv_zero = 0
    for index, (flat, area3d) in enumerate(zip(triangles, source_areas)):
        uva = abs((flat[2] - flat[0]) * (flat[5] - flat[1]) -
                  (flat[4] - flat[0]) * (flat[3] - flat[1])) * 0.5 / scale
        if uva <= uv_epsilon:
            inherited = (source_uv_areas is not None and index < len(source_uv_areas)
                         and source_uv_areas[index] <= source_uv_epsilon)
            if inherited:
                source_uv_zero += 1
            elif area3d <= area_epsilon:
                source_zero += 1
            elif area3d <= sliver_epsilon:
                source_sliver += 1
            else:
                collapsed += 1
    return collapsed, source_zero, source_sliver, source_uv_zero


def render_outputs(records, out, resolution, dilation, mask_min_area, per_object):
    groups = defaultdict(list)
    for record in records:
        groups[record['object']].append(record)
    written = 0
    conflicts = set()
    all_labels = []
    out.mkdir(parents=True, exist_ok=True)
    jobs = [(out, records)]
    if per_object:
        jobs += [(out / '_per_object' / normalise(name), group) for name, group in groups.items()]
    for target, group in jobs:
        target.mkdir(parents=True, exist_ok=True)
        masks_dir = target / 'masks'
        masks_dir.mkdir(exist_ok=True)
        islands_dir = masks_dir / 'islands'
        islands_dir.mkdir(exist_ok=True)
        id_map = np.zeros((resolution, resolution, 3), dtype=np.uint8)
        id_map[:, :] = BACKGROUND
        zone_map = np.zeros_like(id_map)
        zone_map[:, :] = BACKGROUND
        wire = np.full((resolution, resolution, 3), 255, dtype=np.uint8)
        labeled = np.full((resolution, resolution, 3), 255, dtype=np.uint8)
        zone_union = {name: np.zeros((resolution, resolution), dtype=bool) for name in ZONE_PALETTE}
        object_ids = np.full((resolution, resolution), -1, dtype=np.int32)
        current_object = None
        labels = []
        legend = []
        for record in group:
            if record['object'] != current_object:
                object_ids.fill(-1)
                current_object = record['object']
            x0, y0, x1, y1 = record['px']
            _, _, mask = rasterise(record['triangles'], resolution, resolution, (x0, y0, x1, y1))
            if not mask.any():
                # Degenerate/sub-pixel island: keep a one-pixel marker so every island has a mask.
                mx = int(round(((record['u_min'] + record['u_max']) * 0.5) * (resolution - 1))) - x0
                my = int(round((1 - (record['v_min'] + record['v_max']) * 0.5) * (resolution - 1))) - y0
                mx = min(max(mx, 0), mask.shape[1] - 1)
                my = min(max(my, 0), mask.shape[0] - 1)
                mask[my, mx] = True
                record['single_pixel'] = True
            record['area_px'] = int(mask.sum())
            ys, xs = np.nonzero(mask)
            record['centroid_px'] = (float(xs.mean() + x0), float(ys.mean() + y0))
            region = object_ids[y0:y1 + 1, x0:x1 + 1]
            prior = region[mask]
            for other in np.unique(prior[prior >= 0]):
                if int(other) != record['id']:
                    conflicts.add(tuple(sorted((int(other), record['id']))))
            region[mask] = record['id']
            id_map[y0:y1 + 1, x0:x1 + 1][mask] = record['colour']
            zone_map[y0:y1 + 1, x0:x1 + 1][mask] = np.array(ZONE_PALETTE[record['zone']], np.uint8)
            zone_union[record['zone']][y0:y1 + 1, x0:x1 + 1] |= mask
            wire[y0:y1 + 1, x0:x1 + 1][mask] = (255, 255, 255)
            eroded = mask.copy()
            eroded[1:, :] &= mask[:-1, :]
            eroded[:-1, :] &= mask[1:, :]
            eroded[:, 1:] &= mask[:, :-1]
            eroded[:, :-1] &= mask[:, 1:]
            wire[y0:y1 + 1, x0:x1 + 1][mask & ~eroded] = (0, 0, 0)
            labeled[y0:y1 + 1, x0:x1 + 1][mask & ~eroded] = (0, 0, 0)
            legend.append({'colour': hex_colour(record['colour']), 'id': record['id'],
                           'part_name': record['part_name']})
            if record['area_px'] < mask_min_area:
                record['mask_skipped_small'] = True
                continue
            name = 'island_%04d_%s' % (record['id'], record['part_name'])
            canvas = np.zeros((resolution, resolution), dtype=bool)
            canvas[y0:y1 + 1, x0:x1 + 1] = mask
            write_png(islands_dir / (name + '.png'), (canvas * 255).astype(np.uint8)[:, :, None])
            if dilation:
                grown = np.zeros((resolution, resolution), dtype=bool)
                region = np.zeros((mask.shape[0] + 2 * dilation, mask.shape[1] + 2 * dilation), dtype=bool)
                region[dilation:dilation + mask.shape[0], dilation:dilation + mask.shape[1]] = mask
                dilated = dilate(region, dilation)
                gx0, gy0 = max(0, x0 - dilation), max(0, y0 - dilation)
                gx1 = min(resolution - 1, x0 + mask.shape[1] - 1 + dilation)
                gy1 = min(resolution - 1, y0 + mask.shape[0] - 1 + dilation)
                grown[gy0:gy1 + 1, gx0:gx1 + 1] = dilated[gy0 - (y0 - dilation):gy1 - (y0 - dilation) + 1,
                                                         gx0 - (x0 - dilation):gx1 - (x0 - dilation) + 1]
                write_png(islands_dir / ('%s_d%d.png' % (name, dilation)),
                          (grown * 255).astype(np.uint8)[:, :, None])
            else:
                write_png(islands_dir / ('%s_d0.png' % name), (canvas * 255).astype(np.uint8)[:, :, None])
            written += 2
            del canvas
            text = record['part_name'][:24]
            size = 1 if record['area_px'] < 20000 else 2
            text_width = len(text) * 6 * size
            if text_width > record['px'][2] - record['px'][0] or 7 * size > record['px'][3] - record['px'][1]:
                record['label_skipped'] = True
                continue
            cx, cy = record['centroid_px']
            x, y = int(cx - text_width / 2), int(cy - 3 * size)
            pad = size + 1
            labeled[max(0, y - pad):y + 8 * size + pad, max(0, x - pad):x + text_width + pad] = (255, 255, 255)
            draw_text(labeled, text, x, y, size, (0, 0, 0))
            labels.append({'id': record['id'], 'part_name': record['part_name'],
                           'position': [x, y], 'scale': size})
        all_labels.extend(labels)
        write_png(target / 'uv_wireframe.png', wire)
        write_png(target / 'id_map.png', id_map)
        write_png(target / 'zone_map.png', zone_map)
        write_png(target / 'labeled_overlay.png', labeled)
        (target / 'id_map_legend.json').write_text(json.dumps(legend, separators=(',', ':')) + '\n')
        for zone, union in zone_union.items():
            if not union.any():
                continue
            write_png(masks_dir / ('zone_%s.png' % zone), (union * 255).astype(np.uint8)[:, :, None])
            write_png(masks_dir / ('zone_%s_dilated.png' % zone),
                      (dilate(union, dilation) * 255).astype(np.uint8)[:, :, None])
            written += 2
    return written, conflicts, all_labels


def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object')
    parser.add_argument('--uv')
    parser.add_argument('--resolution', type=int, help='shorthand for both resolutions')
    parser.add_argument('--atlas-resolution', type=int, default=4096)
    parser.add_argument('--guide-resolution', type=int, default=1280)
    parser.add_argument('--layout', choices=('atlas', 'composite'), default='atlas')
    parser.add_argument('--dilation', type=int, default=8)
    parser.add_argument('--out', default='out/uv')
    parser.add_argument('--names')
    parser.add_argument('--zones')
    parser.add_argument('--per-object', action='store_true')
    parser.add_argument('--mask-min-area', type=int, default=16)
    parser.add_argument('--allow-overlap', action='store_true')
    parser.add_argument('--allow-collapsed', action='store_true')
    return parser.parse_args(argv)


def export_into(args):
    if not bpy.app.background or not bpy.data.filepath:
        raise SystemExit('Run in disposable background Blender on an approved saved asset')
    resolution = args.guide_resolution
    out = Path(args.out)
    if out.exists() and any(out.iterdir()):
        raise SystemExit('Refusing to write into non-empty %s' % out)
    exclusions = ('REF_', 'DATUM_', 'SRC_', 'DEBUG_')
    if args.object:
        objects = [bpy.data.objects[name.strip()] for name in args.object.split(',')]
    else:
        objects = [o for o in bpy.context.scene.objects if o.type == 'MESH'
                   and o.visible_get() and not o.hide_render
                   and not o.name.startswith(exclusions)
                   and not any(c.name == 'Cutters' for c in o.users_collection)]
    objects.sort(key=lambda o: o.name)
    overrides = json.loads(Path(args.names).read_text()) if args.names else {}
    if args.zones:
        MATERIAL_ZONES.update(json.loads(Path(args.zones).read_text()))
    warnings = []
    multi_island = set()
    if len(objects) > 1:
        warnings.append('combined sheet is a composite of %d objects with independent 0-1 UV spaces; '
                        'cross-object stacking is expected. Use --object or --per-object for a true atlas.'
                        % len(objects))
    records = []
    world_centroids = []
    for ob in objects:
        mesh = ob.data
        uv_name = args.uv or (mesh.uv_layers.active.name if mesh.uv_layers else None)
        if not uv_name or uv_name not in mesh.uv_layers:
            warnings.append('%s: no UV layer %r' % (ob.name, uv_name))
            continue
        layer = mesh.uv_layers[uv_name]
        triangle_map = uv_triangles(mesh, layer, resolution)
        mesh.calc_loop_triangles()
        source_area = defaultdict(list)
        source_uv_area = defaultdict(list)
        source_layer = (mesh.uv_layers['UVMap']
                        if uv_name != 'UVMap' and 'UVMap' in mesh.uv_layers else None)
        for tri in mesh.loop_triangles:
            a, b, c = [ob.matrix_world @ mesh.vertices[k].co for k in tri.vertices]
            source_area[tri.polygon_index].append(
                ((b - a).cross(c - a)).length * 0.5)
            if source_layer is not None:
                pts = [source_layer.data[k].uv for k in tri.loops]
                source_uv_area[tri.polygon_index].append(
                    abs((pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
                        (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y)) * 0.5)
        groups = mesh_islands(mesh, layer)
        for faces in groups:
            slot_index, material_name = island_material(ob, faces)
            corners = []
            triangles = []
            source_areas = []
            source_uv_areas = []
            world = []
            for index in faces:
                polygon = mesh.polygons[index]
                points = [layer.data[li].uv for li in polygon.loop_indices]
                corners.extend(points)
                triangles.extend(triangle_map[index])
                source_areas.extend(source_area[index])
                if source_layer is not None:
                    source_uv_areas.extend(source_uv_area[index])
                world.append(ob.matrix_world @ polygon.center)
            us = [p.x for p in corners]
            vs = [p.y for p in corners]
            area_uv = (sum(abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5
                          for ax, ay, bx, by, cx, cy in triangles) /
                       float((resolution - 1) ** 2)) if triangles else 0.0
            collapsed_uv, source_zero, source_sliver, source_uv_zero = triangle_health(
                triangles, source_areas, resolution,
                source_uv_areas if source_layer is not None else None)
            u_min, u_max, v_min, v_max = min(us), max(us), min(vs), max(vs)
            x_min = max(0, int(math.floor(u_min * (resolution - 1))) - 1)
            x_max = min(resolution - 1, int(math.ceil(u_max * (resolution - 1))) + 1)
            y_min = max(0, int(math.floor((1 - v_max) * (resolution - 1))) - 1)
            y_max = min(resolution - 1, int(math.ceil((1 - v_min) * (resolution - 1))) + 1)
            records.append({
                'object': ob.name, 'mesh': mesh.name, 'uv': uv_name,
                'material': material_name, 'material_slot_index': slot_index, 'faces': faces,
                'u_min': u_min, 'u_max': u_max, 'v_min': v_min, 'v_max': v_max,
                'px': (x_min, y_min, x_max, y_max),
                'triangles': triangles,
                'zero_source_triangles': source_zero,
                'source_sliver_triangles': source_sliver,
                'source_uv_zero_triangles': source_uv_zero,
                'collapsed_uv_triangles': collapsed_uv,
                'centroid_uv': (sum(us) / len(us), sum(vs) / len(vs)),
                'world': sum(world, Vector()) / len(world),
                'area_uv': area_uv,
            })
    records.sort(key=lambda r: (r['object'], round(r['u_min'], 6), round(r['v_min'], 6),
                                -len(r['faces']), round(r['area_uv'], 9)))
    for name in sorted(multi_island):
        warnings.append('object %s: multiple islands, no face-group names; the object name is used for each island'
                        % name)
    for identifier, record in enumerate(records, start=1):
        record['id'] = identifier
        record['colour'] = id_colour(identifier)
        name = normalise(record['object'])
        source = 'object'
        override = overrides.get(str(identifier)) or overrides.get(record['object'])
        if override:
            name = override.get('part_name', name)
            source = 'override'
        record['part_name'] = name
        record['part_name_source'] = source
        if len({r['faces'][0] for r in records if r['object'] == record['object']}) > 1 and source == 'object':
            multi_island.add(record['object'])
        zone = MATERIAL_ZONES.get(record['material'])
        if override and override.get('zone'):
            zone = override['zone']
        if zone is None:
            zone = 'unknown'
            warnings.append('island %d (%s): material %r has no zone mapping' %
                            (identifier, record['object'], record['material']))
        record['zone'] = zone
        side = side_from_name(record['object'])
        if side is None:
            x, y, z = record['world']
            side = 'left' if x < -0.05 else 'right' if x > 0.05 else (
                'front' if y < -0.3 else 'rear' if y > 0.5 else 'top' if z > 0.8 else 'n/a')
        if override and override.get('side'):
            side = override['side']
        record['side'] = side
        if record['zone'] not in ZONE_PALETTE:
            raise SystemExit('Unknown zone %r' % record['zone'])

    # Mirrored pairs: nearest world-space mirror about X with matching zone and area.
    for record in records:
        record['mirrored_of'] = None
    for record in records:
        candidates = []
        target = Vector((-record['world'].x, record['world'].y, record['world'].z))
        for other in records:
            if other is record or other['zone'] != record['zone']:
                continue
            if abs(other['area_uv'] - record['area_uv']) > max(1e-6, record['area_uv'] * 0.05):
                continue
            distance = (other['world'] - target).length
            if distance < 0.02:
                candidates.append((distance, other['id']))
        if candidates:
            record['mirrored_of'] = min(candidates)[1]

    check_spec = importlib.util.spec_from_file_location('atlas_checks', Path(__file__).with_name('uv_atlas_checks.py'))
    checks = importlib.util.module_from_spec(check_spec)
    check_spec.loader.exec_module(checks)
    atlas_check = checks.validate(records, resolution)
    collapsed_total = sum(r['collapsed_uv_triangles'] for r in records)
    source_zero_total = sum(r['zero_source_triangles'] for r in records)
    source_sliver_total = sum(r.get('source_sliver_triangles', 0) for r in records)
    source_uv_zero_total = sum(r.get('source_uv_zero_triangles', 0) for r in records)
    explained_degenerate = atlas_check['degenerate_triangles'] == (
        collapsed_total + source_zero_total + source_sliver_total + source_uv_zero_total)
    if (atlas_check['out_of_bounds'] or (collapsed_total and not args.allow_collapsed)
            or not explained_degenerate
            or (args.layout == 'atlas' and atlas_check['overlaps'] and not args.allow_overlap)):
        raise ValueError('Atlas preflight failed: ' + json.dumps({
            **atlas_check, 'collapsed_uv_triangles': collapsed_total,
            'source_zero_triangles': source_zero_total,
            'source_sliver_triangles': source_sliver_total,
            'source_uv_zero_triangles': source_uv_zero_total,
            'degenerate_triangles_explained': explained_degenerate}))
    if atlas_check['overlaps'] and args.allow_overlap:
        warnings.append('explicitly allowed overlap island pairs: %r' % atlas_check['overlaps'])
    if collapsed_total and args.allow_collapsed:
        warnings.append('explicitly allowed collapsed UV triangles: %d across %d islands'
                        % (collapsed_total, sum(1 for r in records if r['collapsed_uv_triangles'])))

    written, conflicts, labels = render_outputs(records, out, resolution, args.dilation,
                                                args.mask_min_area, args.per_object)
    skipped = sum(1 for r in records if r.get('mask_skipped_small'))
    warnings.extend('island %d rasterised empty' % r['id'] for r in records if not r.get('area_px'))
    warnings.extend('island %d is sub-pixel; mask is a single marker pixel' % r['id']
                    for r in records if r.get('single_pixel'))
    manifest = {
        'source': bpy.data.filepath,
        'resolution': [resolution, resolution],
        'atlas_resolution': args.atlas_resolution,
        'atlas_images_written': args.atlas_resolution == resolution,
        'atlas_resolution_note': 'images and masks are written at guide resolution; atlas_resolution is requested metadata unless it equals the guide resolution',
        'layout': args.layout, 'geometric_preflight': atlas_check,
        'overlaps_allowed': bool(args.allow_overlap and atlas_check['overlaps']),
        'collapsed_allowed': bool(args.allow_collapsed and collapsed_total),
        'dilation': args.dilation,
        'v_axis': 'flipped: y=(1-v)*(height-1), image origin top-left',
        'id_order': 'sorted by (source_object, u_min, v_min, -face_count, uv_area)',
        'islands': [{
            'id': r['id'], 'part_name': r['part_name'], 'part_name_source': r['part_name_source'],
            'source_object': r['object'], 'uv_layer': r['uv'], 'material_slot': r['material'],
            'material_slot_index': r['material_slot_index'],
            'side': r['side'], 'zone': r['zone'],
            'bbox_px': [r['px'][0], r['px'][1], r['px'][2], r['px'][3]],
            'centroid_px': ([round(v, 2) for v in r['centroid_px']]
                            if 'centroid_px' in r else None),
            'area_px': r.get('area_px', 0), 'mirrored_of': r['mirrored_of'],
            'label_skipped': r.get('label_skipped', False),
            'mask_skipped_small': r.get('mask_skipped_small', False),
            'single_pixel': r.get('single_pixel', False),
            'source_zero_area_triangles': r.get('zero_source_triangles', 0),
            'source_sliver_triangles': r.get('source_sliver_triangles', 0),
            'source_uv_zero_triangles': r.get('source_uv_zero_triangles', 0),
            'collapsed_uv_triangles': r.get('collapsed_uv_triangles', 0),
        } for r in records],
        'zones': {name: list(rgb) for name, rgb in ZONE_PALETTE.items()},
        'labels': labels,
        'overlapping_ids': [list(pair) for pair in sorted(conflicts)],
        'warnings': warnings,
        'unverified': ['semantic part names beyond object/material names', 'padding and bake quality',
                       'cross-object UV stacking (separate textures)', 'mask compositing in a target engine'],
    }
    (out / 'island_manifest.json').write_text(json.dumps(manifest, separators=(',', ':')) + '\n')

    out_of_bounds = [r['id'] for r in records
                     if not (0 <= r['u_min'] <= 1 and 0 <= r['v_min'] <= 1
                             and 0 <= r['u_max'] <= 1 and 0 <= r['v_max'] <= 1)]
    missing_names = [r['id'] for r in records if not r['part_name']]
    missing_zones = [r['id'] for r in records if r['zone'] not in ZONE_PALETTE]
    expected = sum(len(mesh_islands(o.data, o.data.uv_layers[args.uv or o.data.uv_layers.active.name]))
                   for o in objects if o.data.uv_layers)
    print('UV_ISLAND_EXPORT')
    print('  objects', len(objects), 'islands', len(records), 'expected', expected)
    print('  out_of_bounds_islands', len(out_of_bounds), out_of_bounds[:10])
    print('  preflight_overlap_pairs', len(atlas_check['overlaps']), atlas_check['overlaps'][:10])
    print('  render_conflicts', len(conflicts), sorted(conflicts)[:10])
    print('  preflight_collapsed_uv', collapsed_total, 'inherited_source_uv', source_uv_zero_total,
          'source_zero', source_zero_total, 'source_slivers', source_sliver_total)
    print('  missing_names', len(missing_names), 'missing_zones', len(missing_zones))
    print('  masks_written', written, 'mask_skipped_small', skipped)
    print('  labels_drawn', len(labels), 'labels_skipped', sum(1 for r in records if r.get('label_skipped')))
    print('  images_written_at', [resolution, resolution], 'atlas_requested', args.atlas_resolution)
    print('  v_axis', manifest['v_axis'])
    print('  warnings', len(warnings))
    for warning in warnings[:10]:
        print('  WARNING', warning)
    for problem, count in (('out-of-bounds', len(out_of_bounds)), ('missing names', len(missing_names)),
                           ('missing zones', len(missing_zones)), ('island count mismatch', 0 if len(records) == expected else 1)):
        if count:
            print('  VALIDATION FAIL:', problem, count)
    if conflicts and not args.allow_overlap:
        print('  VALIDATION FAIL: overlapping islands', len(conflicts))
    if out_of_bounds or missing_names or missing_zones or len(records) != expected or (conflicts and not args.allow_overlap):
        raise SystemExit(1)
    exceptions = bool((atlas_check['overlaps'] and args.allow_overlap) or
                      (collapsed_total and args.allow_collapsed))
    print('  PASS_WITH_EXCEPTIONS' if exceptions else '  PASS')


def main():
    args = parse_args()
    if args.resolution is not None:
        args.atlas_resolution = args.guide_resolution = args.resolution
    if min(args.atlas_resolution, args.guide_resolution) < 16 or args.dilation < 0:
        raise ValueError('Resolution must be >=16 and dilation nonnegative')
    target = Path(args.out).resolve()
    if target.exists():
        raise ValueError('Unused final output directory required')
    stage = target.with_name(target.name + '.staging')
    if stage.exists():
        raise ValueError('Existing staging directory must be inspected; not overwritten')
    stage.mkdir(parents=True)
    args.out = str(stage)
    try:
        export_into(args)
        stage.rename(target)
    except BaseException as exc:
        (stage / 'FAILED.txt').write_text(type(exc).__name__ + ': ' + str(exc))
        raise
    print('PUBLISHED', target)


if __name__ == '__main__':
    main()
