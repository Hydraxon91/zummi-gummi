#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../../../.." && pwd)
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}

"$BLENDER" --background --factory-startup --python-exit-code 1 \
  --python "$ROOT/tools/asset-pipeline/tests/blender/audit_fixture.py"
