# Extras: per-chart repair

`uv_chart_repair.py` is optional. The core tools only render and validate; this script
edits a disposable copy.

It rebuilds each requested island as an isolated operand, unwraps that operand, fits it
back into the island's original UV footprint, and copies the result back. Other charts
cannot move. After all repairs it can optionally relax and repack the sheet.

## Blender engine

```bash
blender --background body_copy.blend \
  --python-exit-code 1 \
  --python extras/uv_chart_repair.py -- \
  --object Body --uv UVMap \
  --chart 6 --chart 7 --chart 31 \
  --engine blender --method MINIMUM_STRETCH \
  --pack blender \
  --out out/repair
```

## Mio3 engine

Mio3 UV must be installed and enabled.

```bash
blender --background body_copy.blend \
  --python-exit-code 1 \
  --python extras/uv_chart_repair.py -- \
  --object Body --uv UVMap \
  --chart 6 --chart 7 --chart 31 \
  --engine mio3 --method MINIMUM_STRETCH \
  --relax 10 --pack blender \
  --out out/repair
```

`--pack none` is useful when you want to inspect the repaired charts before repacking.
The script never overwrites the input `.blend`; it writes `repair_result.blend` and
`repair_report.json` under `--out`.

It does not remap names. If a repair changes the layout, rebind names by face set before
rerunning the line guide.

## Rebinding names after a layout change

`uv_line_guide.py` writes `faces` into `labels.json`. Use that old file to carry names
onto the new IDs:

```bash
blender --background body_copy.blend \
  --python-exit-code 1 \
  --python extras/uv_rebind_names.py -- \
  --object Body --uv UVMap \
  --old-labels out/guide/1280/labels.json \
  --out names_rebound.json
```

It matches by exact face set. All old names must still exist somewhere in the new layout;
otherwise it stops with a count. `--allow-partial` writes the matches it found.
