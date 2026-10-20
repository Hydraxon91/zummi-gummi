"""Explicit object-level sheet trials on independent copies; no source save or detachment.

Requires a complete reviewed policy from uv_allocation_report.py. Outputs are diagnostic,
not accepted textures or guides. Objects with modifiers require a separately approved
evaluated-copy workflow; this tool refuses them rather than silently applying modifiers.
"""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import sys

import bpy


def protected(ob, source_uv):
    m = ob.data
    return hashlib.sha256(json.dumps({
        'vertices': [list(v.co) for v in m.vertices],
        'polygons': [(list(p.vertices), p.material_index, p.use_smooth) for p in m.polygons],
        'uv': [list(v.uv) for v in m.uv_layers[source_uv].data],
        'matrix': [list(row) for row in ob.matrix_world],
        'materials': [(s.link, s.material.name if s.material else None) for s in ob.material_slots]
    }, sort_keys=True).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True)
    parser.add_argument('--policy', required=True)
    parser.add_argument('--target-uv', required=True)
    parser.add_argument('--source-uv', default='UVMap')
    parser.add_argument('--resolution', type=int, default=4096)
    parser.add_argument('--padding', type=float, default=2)
    args = parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    out = Path(args.out)
    if out.exists() or not bpy.app.background or args.padding < 0 or args.target_uv == args.source_uv:
        raise ValueError('Unused output, background Blender and distinct UV layers required')
    source = Path(bpy.data.filepath)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    # Reanalyse the entire current scene, binding every treatment to fresh fingerprints.
    sys.argv = ['allocation', '--', '--out', str(out/'preflight'), '--target-uv', args.target_uv,
                '--source-uv', args.source_uv, '--resolution', str(args.resolution),
                '--policy', args.policy]
    runpy.run_path(str(Path(__file__).with_name('uv_allocation_report.py')), run_name='__main__')
    report = json.loads((out/'preflight/allocation_report.json').read_text())
    plan = report['treatment_plan']
    if not plan['ready_for_trial']:
        raise ValueError('Pending treatments: no trial meshes created')
    originals = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}
    for names in plan['sheets'].values():
        for name in names:
            ob = originals[name]
            if ob.modifiers or args.source_uv not in ob.data.uv_layers or args.target_uv not in ob.data.uv_layers:
                raise ValueError('Trial requires stored meshes without modifiers and both UV layers: '+name)
    saved = []
    for index, (sheet, names) in enumerate(sorted(plan['sheets'].items())):
        scene = bpy.data.scenes.new('DIAGNOSTIC_Sheet_%03d' % index)
        bpy.context.window.scene = scene
        copies = []
        baselines = {}
        for name in names:
            original = originals[name]
            ob = original.copy()
            ob.data = original.data.copy()
            scene.collection.objects.link(ob)
            ob['allocation_source_object'] = name
            baselines[name] = protected(original, args.source_uv)
            ob.data.uv_layers.active_index = ob.data.uv_layers.find(args.target_uv)
            ob.data.uv_layers.active.active_render = True
            ob.select_set(True)
            copies.append(ob)
        bpy.context.view_layer.objects.active = copies[0]
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        rna = bpy.ops.uv.pack_islands.get_rna_type()
        enums = {key: next(i.identifier for i in rna.properties[key].enum_items if i.identifier == wanted)
                 for key, wanted in [('margin_method', 'ADD'), ('shape_method', 'CONCAVE')]}
        bpy.ops.uv.pack_islands(rotate=True, scale=True, margin=args.padding/args.resolution, **enums)
        bpy.ops.object.mode_set(mode='OBJECT')
        for ob, name in zip(copies, names):
            assert protected(ob, args.source_uv) == baselines[name]
            assert protected(originals[name], args.source_uv) == baselines[name]
        assert hashlib.sha256(source.read_bytes()).hexdigest() == sha
        path = out/('sheet_%03d.blend' % index)
        bpy.ops.wm.save_as_mainfile(filepath=str(path), copy=True)
        saved.append({'sheet': sheet, 'objects': names, 'checkpoint': str(path),
                      'protected_fingerprints': baselines})
    (out/'trial_manifest.json').write_text(json.dumps({
        'state': 'DIAGNOSTIC_NOT_ACCEPTED', 'source_sha256': sha, 'sheets': saved,
        'material_only_preserved_in_source': plan['material_only'],
        'limits': ['No source geometry detached or edited', 'Material-only parts remain in original scenes',
                   'No overlap, padding, topology, bake, guide or export acceptance']}, indent=2))
    print('ALLOCATION_TRIAL', len(saved), 'diagnostic sheets; no source file overwritten')


if __name__ == '__main__':
    main()
