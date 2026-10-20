"""Experimental profile-driven vehicle proposals from a uv_surface_probe report.

Uses area-weighted triangle measurements and semantic landmarks, not island ids.
Benchmark files are used only AFTER predictions are frozen. No model/UV edits or .blend saves.
Captures still require agent/operator visual interpretation; no unattended vision API is bundled.
"""
import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
import numpy as np
from mathutils import Vector


def load(name):
    spec = importlib.util.spec_from_file_location('semantic_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def axes(profile):
    result = [Vector(profile[key]) for key in ('right_axis', 'rear_axis', 'up_axis')]
    if any(abs(v.length - 1) > 1e-6 for v in result):
        raise ValueError('Unit axes required')
    if any(abs(result[i].dot(result[j])) > 1e-6 for i, j in ((0, 1), (0, 2), (1, 2))):
        raise ValueError('Orthogonal axes required')
    return result


def project(v, basis):
    return [Vector(v).dot(axis) for axis in basis]


def bounds(ob, basis):
    points = [project(ob.matrix_world @ Vector(p), basis) for p in ob.bound_box]
    return [[min(p[k] for p in points) for k in range(3)],
            [max(p[k] for p in points) for k in range(3)]]


def classify(record, basis, body, marks):
    x, y, z = project(record['centroid'], basis)
    nx, ny, nz = project(record['normal'], basis)
    # World AABB is not a general rotated-frame surface measurement. Project all its corners.
    lo, hi = record['bounds']
    corners = [project((a, b, c), basis) for a in (lo[0], hi[0]) for b in (lo[1], hi[1]) for c in (lo[2], hi[2])]
    rlo = [min(p[k] for p in corners) for k in range(3)]
    rhi = [max(p[k] for p in corners) for k in range(3)]
    height = body[1][2] - body[0][2]
    length = body[1][1] - body[0][1]
    cab_front = sum(p[1] for p in marks['windshield']) / 2
    cab_rear = sum(p[1] for p in marks['rear_window']) / 2
    floor_ceiling = body[0][2] + height * 0.25
    evidence = []
    if abs(nz) > 0.7 and z < floor_ceiling:
        # Full landmark extents define conservative intervals, not a guessed firewall
        # at the midpoint of a sloping windshield. Crossing an interval is unresolved.
        if rhi[1] < marks['windshield'][0][1]:
            region = 'front'
        elif rlo[1] >= marks['windshield'][0][1] and rhi[1] <= marks['rear_window'][0][1]:
            region = 'cab'
        elif rlo[1] > marks['rear_window'][1][1]:
            region = 'bed'
        else:
            return None, ['floor spans a landmark transition; requires sampled region coverage']
        name = region + '_floor' + ('_inner' if nz > 0 and region != 'bed' else
                                    '_underside' if nz < 0 else '')
        evidence.append('entire floor bounds within conservative %s interval; window extents are proxies, not measured firewall planes' % region)
    elif abs(nz) > 0.7 and rhi[2] > marks['windshield'][1][2] and rlo[1] < cab_front:
        name = 'upper_body_shell' + ('_inner' if nz < 0 else '')
        evidence.append('surface spans front upper shell and cab roof: not a roof-only island')
    elif abs(nz) > 0.7 and marks['hood_source'][0][1] - 0.02 <= y <= marks['hood_source'][1][1] + 0.02:
        if marks['hood_source'][0][2] - 0.02 <= z <= marks['hood_source'][1][2] + 0.02:
            name = 'hood' + ('_inner' if nz < 0 else '')
            evidence.append('height and longitudinal range match preserved named hood source')
        else:
            return None, ['horizontal surface outside hood-source height range']
    elif abs(nz) > 0.7 and y > cab_rear:
        name = 'bed_rail_top' if nz > 0 else 'bed_rail_underside'
        evidence.append('upper horizontal bed perimeter; above bed floor')
    elif abs(nx) > 0.7:
        side = 'right' if x > 0 else 'left'
        name = ('bed_side_' if y > cab_rear else 'side_panel_') + side
        if nx * x < 0:
            name += '_inner'
        evidence.append('lateral surface; named-wheel axis convention; outward versus inward normal')
    elif abs(ny) > 0.7:
        if y > body[1][1] - length * 0.08:
            name = 'tailgate' + ('_inner' if ny < 0 else '')
            evidence.append('vertical surface at physical tail, not every rear-facing surface')
        elif abs(y - cab_rear) < length * 0.05:
            name = 'cab_rear_panel' + ('_inner' if ny < 0 else '')
            evidence.append('vertical surface at rear-window landmark')
        elif y < cab_front:
            name = 'front_fascia' + ('_inner' if ny > 0 else '')
            evidence.append('front vertical shell, not a separate grille or bumper')
        else:
            return None, ['vertical surface lacks a matching landmark']
    else:
        return None, ['mixed orientation: insufficient evidence']
    return name, evidence


def classify_sampled(mesh, matrix, record, basis, body, marks, threshold=0.9):
    """Three interior barycentric samples per true triangle, weighted by world area.

    Coverage measures this rule's surface assignments, not probability of correctness.
    A mixed island is left unknown with its component fractions explicitly retained.
    """
    faces = set(record['faces'])
    mesh.calc_loop_triangles()
    regions = defaultdict(float)
    total, count = 0.0, 0
    for tri in mesh.loop_triangles:
        if tri.polygon_index not in faces:
            continue
        a, b, c = [matrix @ mesh.vertices[i].co for i in tri.vertices]
        cross = (b - a).cross(c - a)
        area = cross.length * 0.5
        if area < 1e-12:
            continue
        normal = cross.normalized()
        for weights in ((2/3, 1/6, 1/6), (1/6, 2/3, 1/6), (1/6, 1/6, 2/3)):
            point = a * weights[0] + b * weights[1] + c * weights[2]
            sample = {'centroid': list(point), 'normal': list(normal),
                      'bounds': [list(point), list(point)]}
            name, _ = classify(sample, basis, body, marks)
            regions[name or 'unknown'] += area / 3
            count += 1
        total += area
    fractions = [{'part_name': name, 'area_fraction': value / total}
                 for name, value in sorted(regions.items(), key=lambda item: (-item[1], item[0]))] if total else []
    dominant = fractions[0] if fractions else {'part_name': 'unknown', 'area_fraction': 0}
    accepted = dominant['part_name'] != 'unknown' and dominant['area_fraction'] >= threshold
    name = dominant['part_name'] if accepted else None
    return name, {'regions': fractions, 'sample_count': count, 'world_area': total,
                  'dominant_fraction': dominant['area_fraction'], 'required_fraction': threshold,
                  'mixed_or_unresolved': not accepted,
                  'method': 'three barycentric interior points per loop triangle; world-area weighting',
                  'limits': 'finite samples and rule-derived labels, not semantic certainty or calibrated confidence'}


def validate_skin_pairs(records, names):
    """Reciprocal, area-covered thickness samples corroborate or reject proposals."""
    by_id = {r['id']: r for r in records}
    checks = []
    def base(name):
        changed = True
        while changed:
            changed = False
            for suffix in ('_inner', '_underside', '_top', '_mixed'):
                if name.endswith(suffix):
                    name = name[:-len(suffix)]
                    changed = True
        return name
    for r in records:
        if not r['thickness_pairs']:
            continue
        mate = r['thickness_pairs'][0]
        other = by_id[mate['id']]
        if r['id'] >= other['id'] or mate['coverage'] < 0.6 or not other['thickness_pairs']:
            continue
        reverse = other['thickness_pairs'][0]
        if reverse['id'] != r['id'] or reverse['coverage'] < 0.6:
            continue
        a, b = names[str(r['id'])], names[str(other['id'])]
        if a['status'] == 'unknown' or b['status'] == 'unknown':
            continue
        agree = base(a['part_name']) == base(b['part_name'])
        checks.append({'ids': [r['id'], other['id']], 'consistent': agree,
                       'sampled_coverage': [mate['coverage'], reverse['coverage']]})
        for entry in (a, b):
            entry['evidence'].append('reciprocal thickness pairing ' + ('consistent' if agree else 'CONFLICT'))
        if not agree:
            for rid in (r['id'], other['id']):
                names[str(rid)]['part_name'] = 'unknown_%d' % rid
                names[str(rid)]['status'] = 'unknown'
    return checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', required=True)
    parser.add_argument('--profile', required=True)
    parser.add_argument('--benchmark')
    parser.add_argument('--out', required=True)
    parser.add_argument('--resolution', type=int, default=1280)
    parser.add_argument('--all-islands', action='store_true')
    parser.add_argument('--sampled-threshold', type=float, default=0.6)
    parser.add_argument('--label-style', choices=('full', 'id'), default='full')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Disposable background Blender required')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused output directory required')
    doc = json.loads(Path(args.evidence).read_text())
    profile = json.loads(Path(args.profile).read_text())
    ob = bpy.data.objects[doc['object']]
    probe = load('uv_surface_probe')
    assert probe.fingerprint(ob.data, ob.data.uv_layers[doc['uv']]) == doc['fingerprint']
    basis = axes(profile)
    body = bounds(ob, basis)
    marks = {role: bounds(bpy.data.objects[name], basis) for role, name in profile['landmarks'].items()}
    subset = ({r['id'] for r in doc['islands']} if args.all_islands
              else set(doc['benchmark_ids']))
    names, reasons = {}, {}
    mesh = ob.data
    for r in doc['islands']:
        if r['id'] not in subset:
            name, why = None, ['outside requested island scope']
        else:
            name, why = classify(r, basis, body, marks)
            if name is None:
                sampled, info = classify_sampled(mesh, ob.matrix_world, r, basis, body,
                                                 marks, threshold=args.sampled_threshold)
                if sampled:
                    name = sampled
                    why = ['centroid rule unresolved: ' + (why[0] if why else 'no evidence'), info]
                else:
                    regions = info.get('regions') or []
                    if regions and regions[0]['part_name'] != 'unknown':
                        name = regions[0]['part_name'] + '_mixed'
                        why = ['mixed surface below %.2f dominant threshold' % args.sampled_threshold,
                               info]
                    else:
                        name = 'mixed_surface'
                        why = ['no dominant sampled region', info]
        names[str(r['id'])] = {'part_name': name or 'unknown_%d' % r['id'],
                               'status': 'automatic_proposal' if name else 'unknown',
                               'source_object': ob.name, 'evidence': why,
                               'surface_pair_evidence': r['thickness_pairs']}
        reasons[r['id']] = why
    pair_checks = validate_skin_pairs(doc['islands'], names)
    # Predictions are frozen before the optional benchmark is read.
    frozen = hashlib.sha256(json.dumps(names, sort_keys=True).encode()).hexdigest()
    benchmark = json.loads(Path(args.benchmark).read_text()) if args.benchmark else None
    evaluation = None
    if benchmark:
        old = load('uv_label_review')
        comparisons = []
        old_bounds = [Vector(v) for v in bounds(ob, [Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))])]
        for r in doc['islands']:
            expected = benchmark['labels'].get(str(r['id']))
            if expected is None:
                continue
            baseline, _ = old.propose(Vector(r['normal']), Vector(r['centroid']), old_bounds,
                                      int(r['uv_area'] * args.resolution ** 2))
            actual = names[str(r['id'])]['part_name']
            comparisons.append({'id': r['id'], 'expected': expected, 'predicted': actual,
                                'baseline': baseline, 'correct': actual == expected,
                                'baseline_correct': baseline == expected})
        evaluation = {'kind': 'small visually-assessed development benchmark, not held-out generalization',
                      'count': len(comparisons), 'correct': sum(v['correct'] for v in comparisons),
                      'baseline_correct': sum(v['baseline_correct'] for v in comparisons),
                      'comparisons': comparisons}
    out.mkdir(parents=True)
    (out / 'proposed_names.json').write_text(json.dumps(names, indent=2))
    report = {'fingerprint': doc['fingerprint'], 'prediction_sha256': frozen,
              'profile': profile, 'evaluation': evaluation, 'sampled_skin_pair_checks': pair_checks,
              'automatic_proposals': sum(n['status'] == 'automatic_proposal' for n in names.values()),
              'unknown': sum(n['status'] == 'unknown' for n in names.values()),
              'limitations': ['No external vision API: an agent/operator inspects the multi-view evidence',
                              'Prototype only: no general naming guarantee or unattended all-asset service',
                              'Landmarks and axes are explicit project profile data',
                              'A world AABB projected into an oblique frame can overestimate bounds; use axis-aligned profile axes for this prototype']}
    (out / 'evaluation.json').write_text(json.dumps(report, indent=2))
    # Build a new labelled atlas at exactly one resolution; never reuse a differently-sized PNG.
    uvx = load('uv_island_export')
    mesh = ob.data
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers[doc['uv']]
    owner = {face: r['id'] for r in doc['islands'] for face in r['faces']}
    res = args.resolution
    sheet = np.full((res, res, 3), 255, dtype=np.uint8)
    masks = {}
    for t in mesh.loop_triangles:
        i = owner[t.polygon_index]
        points = [(uv.data[k].uv.x * (res - 1), (1 - uv.data[k].uv.y) * (res - 1)) for k in t.loops]
        x0 = max(0, int(min(p[0] for p in points)))
        y0 = max(0, int(min(p[1] for p in points)))
        x1 = min(res - 1, int(np.ceil(max(p[0] for p in points))))
        y1 = min(res - 1, int(np.ceil(max(p[1] for p in points))))
        tri = tuple(v for p in points for v in p)
        _, _, local = uvx.rasterise([tri], res, res, (x0, y0, x1, y1))
        masks.setdefault(i, np.zeros((res, res), dtype=bool))[y0:y1 + 1, x0:x1 + 1] |= local
    for i, mask in masks.items():
        eroded = mask.copy()
        eroded[1:] &= mask[:-1]
        eroded[:-1] &= mask[1:]
        eroded[:, 1:] &= mask[:, :-1]
        eroded[:, :-1] &= mask[:, 1:]
        sheet[mask & ~eroded] = 0
    skips = []
    used = np.zeros((res, res), dtype=bool)
    for r in doc['islands']:
        i = r['id']
        if i not in subset:
            continue
        text = ('%d:%s' % (i, names[str(i)]['part_name'])
                if args.label_style == 'full' else '%d' % i)
        mask = masks[i]
        ys, xs = np.nonzero(mask)
        w, h = len(text) * 6, 7
        centre = (xs.mean(), ys.mean()) if len(xs) else (0, 0)
        placed = False
        # Prefer the centroid, but for a concave region search readable positions inside it.
        candidates = [(int(centre[0] - w / 2), int(centre[1] - h / 2))]
        candidates.extend((int(x), int(y)) for y in range(4, res - h - 4, 8)
                          for x in range(4, res - w - 4, 8)
                          if mask[y + h // 2, x + w // 2])
        candidates.sort(key=lambda xy: (xy[0] + w / 2 - centre[0]) ** 2 + (xy[1] + h / 2 - centre[1]) ** 2)
        for x, y in candidates:
            if x < 0 or y < 0 or x + w >= res or y + h >= res:
                continue
            if mask[y:y + h, x:x + w].all() and not used[y:y + h, x:x + w].any():
                sheet[y:y + h, x:x + w] = 255
                uvx.draw_text(sheet, text, x, y, 1, (0, 0, 0))
                used[max(0, y - 2):y + h + 2, max(0, x - 2):x + w + 2] = True
                placed = True
                break
        if not placed:
            skips.append(i)
    uvx.write_png(out / 'semantic_overlay.png', sheet)
    entries = sorted(((int(k), v['part_name']) for k, v in names.items()))
    legend = np.full((res, res, 3), 255, dtype=np.uint8)
    per_column = (len(entries) + 1) // 2
    for index, (island, part) in enumerate(entries):
        column, row = divmod(index, per_column)
        uvx.draw_text(legend, '%d: %s' % (island, part),
                      12 + column * (res // 2), 14 + row * 8, 1, (0, 0, 0))
    uvx.write_png(out / 'legend.png', legend)
    (out / 'legend.txt').write_text('\n'.join('%d: %s' % e for e in entries) + '\n')
    (out / 'label_skips.json').write_text(json.dumps(skips))
    assert probe.fingerprint(mesh, uv) == doc['fingerprint']
    print('SEMANTIC_PROTOTYPE', report['automatic_proposals'], 'proposals;', report['unknown'], 'unknown')
    if evaluation:
        print('BENCHMARK', evaluation['correct'], '/', evaluation['count'], 'baseline', evaluation['baseline_correct'])
    print('LABEL_SKIPS', skips)


if __name__ == '__main__':
    main()
