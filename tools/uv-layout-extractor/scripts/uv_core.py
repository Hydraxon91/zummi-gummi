"""Small shared core for UV island extraction, rasterisation and PNG output.

This module deliberately contains no project-specific object names, material maps
or naming rules. It is the only shared dependency of the public tools.
"""
import math
import re
import struct
import zlib
from collections import defaultdict
from pathlib import Path

import numpy as np


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
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    height, width, channels = pixels.shape
    header = struct.pack('>IIBBBBB', width, height, 8, {1: 0, 2: 4, 3: 2, 4: 6}[channels], 0, 0, 0)
    scanlines = b''.join(b'\0' + row.tobytes() for row in pixels)
    with path.open('wb' if overwrite else 'xb') as handle:
        handle.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) +
                     chunk(b'IDAT', zlib.compress(scanlines, 9)) + chunk(b'IEND', b''))


def mesh_islands(mesh, layer):
    """Connected UV islands. Faces join only through an edge with identical UVs."""
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
    """Flattened pixel-space triangles per polygon, origin top-left, V flipped."""
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


def line(canvas, a, b, colour, width=1):
    a, b = np.array(a), np.array(b)
    count = max(2, int(np.max(np.abs(b - a))) * 2 + 1)
    points = np.rint(np.linspace(a, b, count)).astype(int)
    height, width_px = canvas.shape[:2]
    for dy in range(-(width // 2), width - width // 2):
        for dx in range(-(width // 2), width - width // 2):
            x, y = points[:, 0] + dx, points[:, 1] + dy
            valid = (x >= 0) & (x < width_px) & (y >= 0) & (y < height)
            canvas[y[valid], x[valid]] = colour


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


def uv_bounds(mesh, layer):
    us = [item.uv.x for item in layer.data]
    vs = [item.uv.y for item in layer.data]
    return min(us), min(vs), max(us), max(vs)


def ordered_islands(mesh, layer, resolution=1280):
    """Islands in deterministic guide-ID order: u_min, v_min, -faces, then area."""
    groups = mesh_islands(mesh, layer)
    triangles = uv_triangles(mesh, layer, resolution)
    scored = []
    for faces in groups:
        points = [layer.data[li].uv for f in faces for li in mesh.polygons[f].loop_indices]
        tris = [t for f in faces for t in triangles[f]]
        area = sum(abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5
                   for ax, ay, bx, by, cx, cy in tris) / float((resolution - 1) ** 2)
        scored.append(((round(min(p.x for p in points), 6),
                        round(min(p.y for p in points), 6),
                        -len(faces), round(area, 9)),
                       {'faces': faces, 'u_min': min(p.x for p in points),
                        'v_min': min(p.y for p in points), 'area_uv': area}))
    scored.sort(key=lambda item: item[0])
    result = []
    for identifier, (_, record) in enumerate(scored, start=1):
        record['id'] = identifier
        result.append(record)
    return result


def require_single_tile(mesh, layer, epsilon=1e-6):
    u0, v0, u1, v1 = uv_bounds(mesh, layer)
    if u0 < -epsilon or v0 < -epsilon or u1 > 1 + epsilon or v1 > 1 + epsilon:
        raise ValueError('UVs extend outside the single 0-1 tile: '
                         'u %.6f..%.6f, v %.6f..%.6f' % (u0, u1, v0, v1))
    return u0, v0, u1, v1


def text_width(text, scale):
    return len(text) * 6 * scale


def wrap_candidates(text, scale, max_width):
    """Best 1-, 2- and 3-line splits at spaces or underscores that fit."""
    from itertools import combinations
    tokens = re.split(r'(?<=[_\s])', text)
    tokens = [token for token in tokens if token]
    result = []
    for count in (1, 2, 3):
        if count > len(tokens):
            break
        best = None
        for splits in combinations(range(1, len(tokens)), count - 1):
            bounds = (0,) + splits + (len(tokens),)
            lines = [''.join(tokens[a:b]).strip(' _') for a, b in zip(bounds, bounds[1:])]
            widths = [text_width(item, scale) for item in lines]
            if max(widths) <= max_width and (best is None or max(widths) < best[0]):
                best = (max(widths), lines)
        if best:
            result.append(best[1])
    return result
