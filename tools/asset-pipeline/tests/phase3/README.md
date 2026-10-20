# Phase 3 fixtures

These scripts exercise the pipeline with synthetic assets. They are not house assets,
reference-fidelity evidence or game integration.

## Crate

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/uv-texture-pilot/simple_crate_002_unwrapped.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/build_crate.py -- \
  --source .dev-shots/uv-texture-pilot/simple_crate_002_unwrapped.blend \
  --out-dir .dev-shots/asset-pipeline/phase3/crate
```

This writes a new `crate_001.blend` checkpoint and self-contained `crate_001.glb` with an
asymmetric 1024² checker. The original crate is opened read-only.

## Curved cylinder

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/build_curved.py -- \
  --out-dir .dev-shots/asset-pipeline/phase3/curved
```

The fixture is a closed 1 m diameter × 1 m high cylinder with a deliberate UV seam. A
beveled high copy is baked into 1024² and 2048² albedo, roughness and tangent-space normal
maps. The low is triangulated before export so tangents are portable. Both GLBs are
self-contained and validator-clean.

The current captures retain a faint vertical seam line at one side. Treat it as a review
item, not a clean pass.

## Manifest and provenance

```bash
node tools/asset-pipeline/tests/phase3/make_manifest.mjs \
  path/to/asset.glb path/to/source.blend path/to/out-dir asset.id
```

## Review camera and density

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/source.blend --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/add_review_camera.py -- \
  path/to/review.blend Review_Camera 4.0
```

Then run `audit_asset.py` with `--camera Review_Camera`. The camera is a review artifact,
not part of the exported GLB or its provenance.

## MSN baseline

```bash
python3 launch.py --no-open --localhost --port 8123
```

```bash
PREVIEW_BASE_URL=http://localhost:8123 \
  node tools/asset-pipeline/tests/phase3/run_msn_baseline.mjs \
  .dev-shots/asset-pipeline/phase3/msn-baseline
```

The baseline uses the existing `assets/MSN_Figure/msn.glb` read-only, 1/8/32 shared-geometry
instances and a checker backdrop. Headless timings are relative only. No RX 9070 XT or
full-game benchmark has been recorded.

## Current findings

- Crate: validator pass, embedded 1024² checker, clean import/preview pass, density review.
  At a 4 m side camera the 1024² ratio is `p05 0.451` / `p95 1.272`; at 2048² it is
  `p05 0.902` / `p95 2.544`.
- Curved: validator pass at 1024² and 2048², clean import/preview pass, residual seam line.
  At 1024² the side/cap ratio is `p05 0.537` / `p95 4.018`; at 2048² it is
  `p05 1.074` / `p95 8.035`. UV anisotropy p95 is `1.57` at both resolutions.
- MSN: validator review with three `NODE_SKINNED_MESH_NON_ROOT` warnings; transparency and
  overlap remain a visual review item. Headless 20-frame averages were `0.17`, `0.64` and
  roughly `0.2`, `0.6` and `2` ms/frame at 1/8/32 instances, with a
  WebKit/WebKit-WebGL headless renderer. These are CPU-submission/relative numbers only,
  not real frame rates or GPU completion time.
