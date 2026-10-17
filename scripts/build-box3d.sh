#!/usr/bin/env bash
# Builds Box3D (pinned v0.1.0 — MIT) and the Gummy Bears C wrapper into
# vendor/box3d/{box3d.js,box3d.wasm}. Requires cmake + emscripten.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/.box3d-build"
SRC="$BUILD/box3d"

if [ ! -d "$SRC" ]; then
  mkdir -p "$BUILD"
  git clone --depth 1 --branch v0.1.0 https://github.com/erincatto/box3d.git "$SRC"
fi

emcmake cmake -S "$SRC" -B "$BUILD/cmake" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBOX3D_SAMPLES=OFF -DBOX3D_UNIT_TESTS=OFF -DBOX3D_BENCHMARKS=OFF -DBOX3D_DOCS=OFF \
  -DBOX3D_DISABLE_SIMD=OFF
cmake --build "$BUILD/cmake" -j 8

mkdir -p "$ROOT/vendor/box3d"
emcc "$ROOT/scripts/box3d_wrapper.c" \
  -I"$SRC/include" "$BUILD/cmake/src/libbox3d.a" \
  -O3 -msimd128 \
  -o "$ROOT/vendor/box3d/box3d.js" \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBox3D \
  -sALLOW_MEMORY_GROWTH=1 -sENVIRONMENT=web \
  -sEXPORTED_RUNTIME_METHODS=HEAPF32,HEAP32,HEAPU8 \
  -sEXPORTED_FUNCTIONS=_malloc,_free,_g3_init,_g3_shutdown,_g3_step,_g3_static_box,_g3_static_box_rot,_g3_static_sphere,_g3_sphere,_g3_joint,_g3_destroy,_g3_read,_g3_apply_forces,_g3_apply_impulses,_g3_set_positions,_g3_set_velocities,_g3_wake,_g3_body_count \
  -sASSERTIONS=0 -sSTACK_SIZE=1048576

cp "$SRC/LICENSE" "$ROOT/vendor/box3d/LICENSE"
ls -lh "$ROOT/vendor/box3d/"
