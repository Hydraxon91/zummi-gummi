#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
FIXTURES=${FIXTURES:-$ROOT/.dev-shots/asset-pipeline/fixtures}
OUT=${OUT:-$ROOT/.dev-shots/asset-pipeline/phase2-reports}
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}

node --test "$ROOT/tools/asset-pipeline/tests/phase2.test.mjs"
node "$ROOT/tools/asset-pipeline/tests/phase2/build_fixtures.mjs" "$FIXTURES"
mkdir -p "$OUT"

run_case() {
  name=$1
  expected=$2
  node "$ROOT/tools/asset-pipeline/scripts/verify_asset.mjs" \
    --glb "$FIXTURES/$name.glb" \
    --out "$OUT/$name" \
    --skip-clean-import \
    --skip-preview >/dev/null
  node "$ROOT/tools/asset-pipeline/tests/phase2/assert_disposition.mjs" \
    "$OUT/$name/report.json" "$expected"
}

run_case valid unverified
run_case invalid-accessor fail
run_case external fail
run_case unsupported unverified
run_case malformed fail

if node "$ROOT/tools/asset-pipeline/scripts/verify_asset.mjs" \
  --glb "$FIXTURES/malformed.glb" \
  --out "$OUT/malformed-strict" \
  --skip-clean-import \
  --skip-preview \
  --strict >/dev/null; then
  echo "strict mode accepted a failing report" >&2
  exit 1
fi

if [ -x "$BLENDER" ]; then
  "$BLENDER" --background --factory-startup --python-exit-code 1 \
    --python "$ROOT/tools/asset-pipeline/scripts/clean_import.py" -- \
    --glb "$ROOT/assets/MSN_Figure/msn.glb" \
    --out "$OUT/clean-import-msn.json" >/dev/null
  node -e "const r=require(process.argv[1]); if (r.status !== 'pass') process.exit(1)" \
    "$OUT/clean-import-msn.json"
  echo "clean import: pass"
fi

if [ -n "${PREVIEW_BASE_URL:-}" ]; then
  node "$ROOT/tools/asset-pipeline/scripts/verify_asset.mjs" \
    --glb "$ROOT/assets/MSN_Figure/msn.glb" \
    --manifest "$ROOT/assets/MSN_Figure/asset.json" \
    --profile "$ROOT/tools/asset-pipeline/profiles/transparent_buddy.json" \
    --out "$OUT/msn-preview" \
    --base-url "$PREVIEW_BASE_URL" \
    --views front,three_quarter,near,far \
    --lights day,night >/dev/null
  node "$ROOT/tools/asset-pipeline/tests/phase2/assert_disposition.mjs" \
    "$OUT/msn-preview/report.json" review
fi

echo "PHASE2_FIXTURE_PASS"
