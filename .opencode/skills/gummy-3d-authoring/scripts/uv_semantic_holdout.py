"""Freeze, capture and score new same-asset islands without tuning the classifier.

freeze/capture: disposable background Blender on the approved saved source.
score: standard Python; labels must be authored after freezing, from numbered evidence.
No source edits, source saves, overwritten outputs, vision API calls or model uploads.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(name):
    spec = importlib.util.spec_from_file_location('holdout_' + name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_frozen(folder):
    folder = Path(folder)
    path = folder / 'frozen_predictions.json'
    expected = (folder / 'frozen_predictions.sha256').read_text().strip()
    if digest(path) != expected:
        raise ValueError('Frozen predictions were changed')
    return json.loads(path.read_text())


def select_varied(records, excluded, count):
    """Round-robin geometry strata, no predicted/expected names used."""
    from collections import defaultdict
    eligible = [r for r in records if r['id'] not in excluded]
    if not eligible:
        return []
    low = min(r['centroid'][1] for r in records)
    span = max(r['centroid'][1] for r in records) - low
    buckets = defaultdict(list)
    for r in eligible:
        normal = r['normal']
        axis = max(range(3), key=lambda i: abs(normal[i]))
        orientation = ('xyz'[axis] + ('+' if normal[axis] >= 0 else '-')) if abs(normal[axis]) >= 0.7 else 'mixed'
        depth = min(2, int(3 * (r['centroid'][1] - low) / max(span, 1e-12)))
        buckets[(orientation, depth)].append(r)
    for bucket in buckets.values():
        bucket.sort(key=lambda r: (-r['uv_area'], r['id']))
    selected = []
    while buckets and len(selected) < count:
        for key in sorted(list(buckets)):
            selected.append(buckets[key].pop(0))
            if not buckets[key]:
                del buckets[key]
            if len(selected) >= count:
                break
    return selected


def freeze(args):
    import bpy
    if not bpy.app.background or not bpy.data.filepath:
        raise ValueError('Disposable background Blender on a saved source required')
    folder = Path(args.run)
    if folder.exists():
        raise ValueError('Unused run directory required')
    evidence = json.loads(Path(args.evidence).read_text())
    development = json.loads(Path(args.development).read_text())
    profile = json.loads(Path(args.profile).read_text())
    semantic, probe = load('uv_semantic_vehicle'), load('uv_surface_probe')
    ob = bpy.data.objects[evidence['object']]
    if probe.fingerprint(ob.data, ob.data.uv_layers[evidence['uv']]) != evidence['fingerprint']:
        raise ValueError('Evidence does not match source geometry/UVs')
    excluded = {int(k) for k in development['labels']}
    previous = []
    for path in args.previous_run:
        prior = read_frozen(path)
        if prior['fingerprint'] != evidence['fingerprint']:
            raise ValueError('Previous holdout uses different geometry/UV ids')
        excluded.update(prior['selected_ids'])
        previous.append({'path': str(path), 'sha256': digest(Path(path) / 'frozen_predictions.json')})
    selected = (select_varied(evidence['islands'], excluded, args.count) if args.selection == 'stratified' else
                sorted((r for r in evidence['islands'] if r['id'] not in excluded),
                       key=lambda r: (-r['uv_area'], r['id']))[:args.count])
    if not selected or any(r['id'] in excluded for r in selected):
        raise ValueError('Empty or contaminated holdout')
    basis = semantic.axes(profile)
    body = semantic.bounds(ob, basis)
    marks = {role: semantic.bounds(bpy.data.objects[name], basis)
             for role, name in profile['landmarks'].items()}
    chosen = {r['id'] for r in selected}
    names = {}
    for r in evidence['islands']:
        coverage = None
        if r['id'] in chosen and args.sampled:
            name, coverage = semantic.classify_sampled(ob.data, ob.matrix_world, r, basis, body, marks)
            reasons = ['sampled surface coverage; mixed or insufficient support abstains']
        else:
            name, reasons = semantic.classify(r, basis, body, marks) if r['id'] in chosen else (None, [])
        names[str(r['id'])] = {'part_name': name or 'unknown_%d' % r['id'],
                                'status': 'automatic_proposal' if name else 'unknown',
                                'evidence': reasons, 'surface_coverage': coverage}
    checks = semantic.validate_skin_pairs(evidence['islands'], names)
    doc = {'schema': 1, 'source': bpy.data.filepath, 'source_sha256': digest(bpy.data.filepath),
           'fingerprint': evidence['fingerprint'], 'object': ob.name, 'uv': evidence['uv'],
           'evidence_path': str(Path(args.evidence).resolve()), 'evidence_sha256': digest(args.evidence),
           'profile_path': str(Path(args.profile).resolve()), 'profile_sha256': digest(args.profile),
           'classifier_sha256': digest(Path(__file__).with_name('uv_semantic_vehicle.py')),
           'development_sha256': digest(args.development), 'excluded_ids': sorted(excluded),
            'selection': args.selection, 'previous_runs': previous, 'sampled': args.sampled,
            'selection_rule': 'geometry orientation and longitudinal thirds round-robin, largest area within buckets' if args.selection == 'stratified' else 'decreasing UV area',
           'selected_ids': [r['id'] for r in selected],
           'predictions': {str(r['id']): names[str(r['id'])] for r in selected},
           'pair_checks': checks,
           'limitations': ['Same-asset region holdout, not cross-model generalization',
                           'Labels must be inspected separately; no classifier tuning after freeze']}
    folder.mkdir(parents=True)
    path = folder / 'frozen_predictions.json'
    path.write_text(json.dumps(doc, indent=2))
    (folder / 'frozen_predictions.sha256').write_text(digest(path) + '\n')
    print('HOLDOUT_FROZEN', len(selected), 'islands;', 'ids', doc['selected_ids'])
    print('Predictions sealed; do not inspect them before labelling the numbered captures')


def capture(args):
    import bpy
    import numpy as np
    from mathutils import Vector
    doc = read_frozen(args.run)
    if not bpy.app.background or digest(bpy.data.filepath) != doc['source_sha256']:
        raise ValueError('Disposable background Blender on frozen source required')
    if digest(doc['evidence_path']) != doc['evidence_sha256']:
        raise ValueError('Evidence changed since freeze')
    out = Path(args.out)
    if out.exists():
        raise ValueError('Unused capture directory required')
    out.mkdir(parents=True)
    evidence = json.loads(Path(doc['evidence_path']).read_text())
    # Do not read the predictions when selecting or drawing evidence.
    selected = set(doc['selected_ids'])
    ob = bpy.data.objects[doc['object']]
    probe, uvx, png = load('uv_surface_probe'), load('uv_island_export'), load('png_report')
    original = probe.fingerprint(ob.data, ob.data.uv_layers[doc['uv']])
    if original != doc['fingerprint']:
        raise ValueError('Live source differs from freeze')
    records, _, samples, bvh, tri_to_face, face_id = probe.analyse(ob, doc['uv'], 98, 0.02)
    chosen = [r for r in records if r['id'] in selected]
    views = probe.capture(ob, chosen, samples, bvh, tri_to_face, face_id, out, args.resolution)
    scene = bpy.context.scene
    camera = scene.camera
    tiles, isolation = [], []
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.hide_render = True
    material = bpy.data.materials.new('Holdout_Isolation')
    material.diffuse_color = (0.1, 0.7, 0.85, 1)
    for r in chosen:
        vertex_ids = sorted({v for face in r['faces'] for v in ob.data.polygons[face].vertices})
        remap = {v: k for k, v in enumerate(vertex_ids)}
        positions = [ob.matrix_world @ ob.data.vertices[v].co for v in vertex_ids]
        faces = [tuple(remap[v] for v in ob.data.polygons[face].vertices) for face in r['faces']]
        mesh = bpy.data.meshes.new('Holdout_Island_%d' % r['id'])
        mesh.from_pydata(positions, [], faces)
        mesh.materials.append(material)
        isolated = bpy.data.objects.new(mesh.name, mesh)
        scene.collection.objects.link(isolated)
        lo = Vector([min(v[k] for v in positions) for k in range(3)])
        hi = Vector([max(v[k] for v in positions) for k in range(3)])
        centre = (lo + hi) * 0.5
        span = max((hi - lo).length, 0.05)
        camera.data.ortho_scale = span * 1.2
        normal = Vector(r['normal']).normalized()
        if normal.length < 0.1:
            normal = Vector((0, 0, 1))
        direction = (normal + Vector((0.12, -0.08, 0.1))).normalized()
        camera.location = centre + direction * span * 4
        camera.rotation_euler = (centre - camera.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        scene.render.filepath = str(out / ('island_%d_isolated.png' % r['id']))
        bpy.ops.render.render(write_still=True)
        w, h, c, rows = png.decode(Path(scene.render.filepath).read_bytes())
        pixels = np.frombuffer(b''.join(rows), dtype=np.uint8).reshape(h, w, c)[:, :, :3].copy()
        uvx.draw_text(pixels, 'island_%d' % r['id'], 10, 10, 2, (255, 255, 255))
        uvx.write_png(out / ('island_%d_numbered.png' % r['id']), pixels)
        tiles.append(pixels)
        isolation.append({'id': r['id'], 'source_faces': r['faces'], 'world_bounds': [list(lo), list(hi)],
                          'camera_matrix_world': [list(row) for row in camera.matrix_world]})
        isolated.hide_render = True
    while len(tiles) % 4:
        tiles.append(np.full_like(tiles[0], 40))
    sheet = np.concatenate([np.concatenate(tiles[i:i + 4], axis=1) for i in range(0, len(tiles), 4)], axis=0)
    uvx.write_png(out / 'isolated_contact.png', sheet)
    (out / 'capture_manifest.json').write_text(json.dumps({'fingerprint': original, 'views': views,
                                                         'isolation': isolation}, indent=2))
    assert probe.fingerprint(ob.data, ob.data.uv_layers[doc['uv']]) == original
    print('HOLDOUT_CAPTURE_PASS', len(chosen), 'isolated islands;', out)


def score(doc, labels):
    expected_ids = {str(i) for i in doc['selected_ids']}
    if len(expected_ids) != len(doc['selected_ids']) or expected_ids & {str(i) for i in doc['excluded_ids']}:
        raise ValueError('Duplicate or development-contaminated holdout ids')
    if set(doc['predictions']) != expected_ids:
        raise ValueError('Prediction ids do not match selected islands')
    if set(labels['labels']) != expected_ids:
        raise ValueError('Annotations must cover every selected id, including unresolved regions')
    rows = []
    for i in doc['selected_ids']:
        key = str(i)
        truth = labels['labels'][key]
        actual = doc['predictions'][key]
        resolved = truth['status'] == 'resolved'
        if truth['status'] not in ('resolved', 'unresolved') or (resolved and not truth.get('part_name')):
            raise ValueError('Invalid annotation')
        rows.append({'id': i, 'expected': truth.get('part_name'), 'predicted': actual['part_name'],
                     'resolved': resolved, 'abstained': actual['status'] == 'unknown',
                     'correct': actual['part_name'] == truth.get('part_name') if resolved else None})
    resolved = [r for r in rows if r['resolved']]
    return {'kind': 'same-asset unscored-region holdout; no post-freeze tuning',
            'total': len(rows), 'resolved': len(resolved), 'unresolved': len(rows) - len(resolved),
            'correct_exact': sum(r['correct'] for r in resolved),
            'wrong_named': sum(not r['correct'] and not r['abstained'] for r in resolved),
            'abstained_resolved': sum(r['abstained'] for r in resolved),
            'unresolved_named': sum(not r['abstained'] for r in rows if not r['resolved']),
            'comparisons': rows,
            'limitations': ['Exact semantic names, not a hidden coarse-category score',
                            'Unresolved visual evidence is excluded from accuracy, never counted correct',
                            'Single asset; assessment by agent, not independent external annotators']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('freeze', 'capture', 'score'))
    parser.add_argument('--run', required=True)
    parser.add_argument('--evidence')
    parser.add_argument('--development')
    parser.add_argument('--profile')
    parser.add_argument('--count', type=int, default=12)
    parser.add_argument('--selection', choices=('largest', 'stratified'), default='largest')
    parser.add_argument('--previous-run', action='append', default=[])
    parser.add_argument('--sampled', action='store_true')
    parser.add_argument('--resolution', type=int, default=512)
    parser.add_argument('--out')
    parser.add_argument('--labels')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    args = parser.parse_args(argv)
    if args.mode == 'freeze':
        freeze(args)
    elif args.mode == 'capture':
        capture(args)
    else:
        doc = read_frozen(args.run)
        if digest(Path(__file__).with_name('uv_semantic_vehicle.py')) != doc['classifier_sha256']:
            raise ValueError('Classifier changed after predictions were frozen; do not retune this holdout')
        if digest(doc['profile_path']) != doc['profile_sha256']:
            raise ValueError('Profile changed after freeze')
        labels = json.loads(Path(args.labels).read_text())
        if labels['frozen_predictions_sha256'] != digest(Path(args.run) / 'frozen_predictions.json'):
            raise ValueError('Annotations refer to different predictions')
        report = score(doc, labels)
        report['frozen_predictions_sha256'] = labels['frozen_predictions_sha256']
        report['annotations_sha256'] = digest(args.labels)
        with Path(args.out).open('x') as handle:
            json.dump(report, handle, indent=2)
        print('HOLDOUT_SCORE', {k: v for k, v in report.items() if k != 'comparisons'})


if __name__ == '__main__':
    main()
