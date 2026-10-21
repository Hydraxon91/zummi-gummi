"""Read-only advisory diagnostics. JSON input: vertices, faces, materials (face slots).

Usage: python3 check_material_boundaries.py current.json [--baseline old.json]
          [--allowed-faces 1,2,3]
Stable face/vertex ordering is required for comparison. This is not visual acceptance.
Inside Blender, snapshot(obj) captures local mesh data without editing the scene.
"""
import argparse
import json
from collections import defaultdict


def snapshot(obj):
    return dict(vertices=[list(v.co) for v in obj.data.vertices],
                faces=[list(p.vertices) for p in obj.data.polygons],
                materials=[p.material_index for p in obj.data.polygons])


def analyze(data, baseline=None, allowed_faces=()):
    faces, slots = data['faces'], data['materials']
    if len(faces) != len(slots):
        raise ValueError('one material slot required per face')
    edges = defaultdict(list)
    for i, face in enumerate(faces):
        for a, b in zip(face, face[1:] + face[:1]):
            edges[tuple(sorted((a, b)))].append(i)
    adjacent = defaultdict(set)
    boundaries = defaultdict(list)
    for edge, owners in edges.items():
        for a in owners:
            adjacent[a].update(b for b in owners if b != a and slots[b] == slots[a])
        if len(owners) == 2 and slots[owners[0]] != slots[owners[1]]:
            pair = tuple(sorted((slots[owners[0]], slots[owners[1]])))
            boundaries[pair].append(edge)
    seen, regions = set(), []
    for i in range(len(faces)):
        if i in seen:
            continue
        stack, component = [i], []
        seen.add(i)
        while stack:
            a = stack.pop()
            component.append(a)
            for b in adjacent[a] - seen:
                seen.add(b)
                stack.append(b)
        regions.append(dict(slot=slots[i], faces=sorted(component)))
    boundary_report = []
    for pair, es in boundaries.items():
        degrees = defaultdict(int)
        for a, b in es:
            degrees[a] += 1
            degrees[b] += 1
        boundary_report.append(dict(slots=pair, edges=es,
                                    endpoints=[v for v, d in degrees.items() if d == 1],
                                    branches=[v for v, d in degrees.items() if d > 2]))
    comparison = None
    if baseline is not None:
        comparable = baseline['faces'] == faces and len(baseline['materials']) == len(slots)
        comparison = dict(geometry_changed=baseline['vertices'] != data['vertices'] or
                          baseline['faces'] != faces, assignments_comparable=comparable,
                          outside_scope_changes=None)
        if comparable:
            allowed = set(allowed_faces)
            comparison['outside_scope_changes'] = [i for i, (a, b) in enumerate(
                zip(baseline['materials'], slots)) if a != b and i not in allowed]
    return dict(regions=regions, boundaries=boundary_report,
                single_face_regions=[r for r in regions if len(r['faces']) == 1],
                nonmanifold_edges=[e for e, fs in edges.items() if len(fs) > 2],
                comparison=comparison,
                limitation='Advisory only: intentional islands/open boundaries may be valid; '
                'closed toothed boundaries can pass. Inspect captures and intended loops.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input')
    parser.add_argument('--baseline')
    parser.add_argument('--allowed-faces', default='')
    args = parser.parse_args()
    def load(path):
        with open(path) as stream:
            return json.load(stream)
    print(json.dumps(analyze(load(args.input), load(args.baseline) if args.baseline else None,
                             [int(v) for v in args.allowed_faces.split(',') if v]), indent=2))
