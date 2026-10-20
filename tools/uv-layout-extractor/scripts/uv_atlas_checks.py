"""Pure 2D atlas validation. Positive intersection area, not shared edges, is overlap."""
import math
from collections import defaultdict


def cross(a, b, c):
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def intersection_area(subject, clip):
    if cross(*clip) < 0:
        clip = list(reversed(clip))
    polygon = list(subject)
    for i, a in enumerate(clip):
        b = clip[(i + 1) % 3]
        output = []
        for j, end in enumerate(polygon):
            start = polygon[j - 1]
            ds, de = cross(a, b, start), cross(a, b, end)
            if (ds >= 0) != (de >= 0):
                t = ds / (ds - de)
                output.append((start[0] + t * (end[0] - start[0]),
                               start[1] + t * (end[1] - start[1])))
            if de >= 0:
                output.append(end)
        polygon = output
        if not polygon:
            return 0.0
    return abs(sum(polygon[i - 1][0] * p[1] - p[0] * polygon[i - 1][1]
                   for i, p in enumerate(polygon))) * 0.5


def validate(records, resolution, max_pairs=32):
    grid, triangles, conflicts = defaultdict(list), [], set()
    outside, degenerate = set(), 0
    for record in records:
        for flat in record['triangles']:
            tri = [(flat[k] / (resolution - 1), 1 - flat[k + 1] / (resolution - 1))
                   for k in (0, 2, 4)]
            if not all(math.isfinite(v) and 0 <= v <= 1 for p in tri for v in p):
                outside.add(record['id'])
                continue
            if abs(cross(*tri)) * 0.5 <= 1e-16:
                degenerate += 1
                continue
            lo = [min(p[k] for p in tri) for k in (0, 1)]
            hi = [max(p[k] for p in tri) for k in (0, 1)]
            cells = [(x, y) for x in range(int(lo[0] * 64), min(63, int(hi[0] * 64)) + 1)
                     for y in range(int(lo[1] * 64), min(63, int(hi[1] * 64)) + 1)]
            candidates = {j for cell in cells for j in grid[cell]}
            for j in candidates:
                other_id, other, other_lo, other_hi = triangles[j]
                pair = tuple(sorted((record['id'], other_id)))
                if pair in conflicts:
                    continue
                if any(hi[k] <= other_lo[k] or lo[k] >= other_hi[k] for k in (0, 1)):
                    continue
                if intersection_area(tri, other) > 1e-12:
                    conflicts.add(pair)
                    if len(conflicts) >= max_pairs:
                        return {'overlaps': sorted(conflicts), 'truncated': True,
                                'out_of_bounds': sorted(outside),
                                'degenerate_triangles': degenerate}
            j = len(triangles)
            triangles.append((record['id'], tri, lo, hi))
            for cell in cells:
                grid[cell].append(j)
    return {'overlaps': sorted(conflicts), 'truncated': False,
            'out_of_bounds': sorted(outside), 'degenerate_triangles': degenerate}
