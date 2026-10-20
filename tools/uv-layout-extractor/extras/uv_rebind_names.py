"""Rebind names to current guide IDs by exact face set.

Use after a repair or repack changes the deterministic ID order. The old labels file
must contain `faces` per island (uv_line_guide.py writes this).
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy


def load_core():
    spec = importlib.util.spec_from_file_location('rebind_core',
                                                  Path(__file__).parent.parent / 'scripts' / 'uv_core.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--object', required=True)
    parser.add_argument('--uv', required=True)
    parser.add_argument('--old-labels', required=True,
                        help='labels.json from a previous uv_line_guide run')
    parser.add_argument('--out', required=True, help='New names JSON')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    if not bpy.app.background:
        raise ValueError('Background Blender only')
    output = Path(args.out)
    if output.exists() and not args.force:
        raise ValueError('Output exists; pass --force to overwrite')
    old = json.loads(Path(args.old_labels).read_text())
    old_names = {frozenset(row['faces']): row['part_name'] for row in old
                 if row.get('faces') and row.get('status') != 'unresolved'
                 and row.get('part_name') not in (None, '', 'UNRESOLVED')}
    core = load_core()
    ob = bpy.context.scene.objects.get(args.object)
    if ob is None or ob.type != 'MESH':
        raise ValueError('Object not found or not a mesh: %s' % args.object)
    layer = ob.data.uv_layers.get(args.uv)
    if layer is None:
        raise ValueError('UV layer not found: %s' % args.uv)
    islands = core.ordered_islands(ob.data, layer)
    names = {}
    unmatched = []
    for island in islands:
        name = old_names.get(frozenset(island['faces']))
        if name:
            names[str(island['id'])] = name
        else:
            unmatched.append(island['id'])
    missing_old = len(old_names) - len(names)
    if not names and not args.allow_partial:
        raise ValueError('No face-set matches; old labels may not contain faces')
    if missing_old and not args.allow_partial:
        raise ValueError('%d old names had no exact face-set match; '
                         'use --allow-partial to write the rest' % missing_old)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(names, indent=2) + '\n')
    print('UV_REBIND_NAMES', json.dumps({'old_named': len(old_names),
                                        'matched': len(names),
                                        'unmatched_current': len(unmatched)}), flush=True)


if __name__ == '__main__':
    main()
