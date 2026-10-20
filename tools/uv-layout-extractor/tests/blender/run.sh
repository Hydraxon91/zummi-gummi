#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BLENDER="${BLENDER:-blender}"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/uv-layout-fixture.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

run_blender() {
  local blend="$1"
  local script="$2"
  shift 2
  "$BLENDER" --background "$blend" --python-exit-code 1 --python "$script" -- "$@"
}

echo "== fixture =="
"$BLENDER" --background --factory-startup --python-exit-code 1 \
  --python "$ROOT/tests/blender/make_fixture.py" -- "$TMP/fixture"

echo "== color layout =="
run_blender "$TMP/fixture/clean_cube.blend" "$ROOT/scripts/uv_color_layout.py" \
  --object FixtureCube --uv UVMap --out "$TMP/color" --resolutions 256 512
python3 "$ROOT/tests/blender/check_png.py" \
  "$TMP/color/256/color_layout.png" "$TMP/color/512/color_layout.png"

echo "== line guide =="
run_blender "$TMP/fixture/clean_cube.blend" "$ROOT/scripts/uv_line_guide.py" \
  --object FixtureCube --uv UVMap --names "$TMP/fixture/names.json" \
  --out "$TMP/guide" --resolutions 256 512
python3 "$ROOT/tests/blender/check_png.py" \
  "$TMP/guide/256/labelled_reference.png" "$TMP/guide/512/labelled_reference.png"
python3 - "$TMP/guide/512/labels.json" <<'PY'
import json
import sys
rows = json.load(open(sys.argv[1]))
assert len(rows) == 6, len(rows)
assert all(row['label_lines'] for row in rows)
print('labels:', len(rows), 'named:', sum(row['status'] == 'named' for row in rows))
PY

echo "== rebind names =="
run_blender "$TMP/fixture/clean_cube.blend" "$ROOT/extras/uv_rebind_names.py" \
  --object FixtureCube --uv UVMap \
  --old-labels "$TMP/guide/512/labels.json" \
  --out "$TMP/rebound.json"
python3 - "$TMP/rebound.json" <<'PY'
import json
import sys
names = json.load(open(sys.argv[1]))
assert len(names) == 6, len(names)
print('rebound names:', len(names))
PY

echo "== clean gate =="
run_blender "$TMP/fixture/clean_cube.blend" "$ROOT/scripts/uv_layout_gate.py" \
  --object FixtureCube --uv UVMap --out "$TMP/gate_clean" --resolution 512

echo "== overlap gate expected FAIL =="
if run_blender "$TMP/fixture/overlap_fixture.blend" "$ROOT/scripts/uv_layout_gate.py" \
  --object OverlapFixture --uv UVMap --out "$TMP/gate_overlap" --resolution 512; then
  echo "overlap fixture unexpectedly passed" >&2
  exit 1
else
  echo "overlap fixture failed as expected"
fi

echo "UV_LAYOUT_FIXTURE_PASS"
