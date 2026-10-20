# Phase 3 fixtures

These scripts exercise the pipeline with synthetic assets. They are not house assets,
reference-fidelity evidence or game integration.

The RX 9070 XT PC is reserved for ComfyUI generation. Blender, bakes and browser
verification stay on the Mac.

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
asymmetric 1024² checker. The original crate is opened read-only and its hash remains
unchanged.

## Curved cylinder

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/build_curved.py -- \
  --out-dir .dev-shots/asset-pipeline/phase3/curved_final
```

The fixture is a closed 1 m diameter × 1 m high cylinder with a deliberate longitudinal
UV seam and a packed 3-island layout. The editable n-gon source is kept hidden in the
checkpoint. A triangulated low copy is used for both the bake and the export, so tangents
and topology are the same. A beveled high copy is baked into 1024² and 2048² albedo,
roughness and tangent-space normal maps.

Bake margins scale with resolution: 16 px at 1024² and 32 px at 2048². The 1024² UV
border is about 28 px, so the earlier fixed 32 px margin filled the image edge and made the
padding look ragged. The scaled margin leaves a clean black border without clipping any
island. Both GLBs are self-contained and validator-clean.

### Seam diagnosis

The earlier “faint seam” was not a UV/normal discontinuity:

- The cylinder was flat shaded; `shade_smooth_by_angle` now smooths the side and keeps
  the cap rims sharp.
- The actual longitudinal seam is at Blender +Y. It has `uv_delta_max 0.909569` and
  `normal_delta_max 0.0`; its two corners share the same normal.
- A flat-colour diagnostic with no normal map and a flat-colour + normal-map diagnostic
  both show a smooth back-side seam. The central vertical highlight in the normal-only
  view is environment specular, not a seam.
- The mesh has 128 vertices, 0 loose vertices, 0 non-manifold edges, 0 coincident-vertex
  groups and 0 custom normals. It is a normal closed 64-sided cylinder.

Run the diagnostics with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/curved_001.blend --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/inspect_curved.py -- Curved_Low
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/curved_001.blend --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/export_flat_variants.py -- path/to/out-dir
```

## Bake channel checks

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/curved_001.blend --factory-startup --python-exit-code 2 \
  --python tools/asset-pipeline/tests/phase3/verify_bake_channels.py -- \
  --resolution 1024 --glb path/to/curved_1024.glb \
  --out path/to/bake_channels_1024.json
```

The checker re-samples the checkpoint images against `Source_Albedo_*` and
`Source_Roughness_*`, checks colours spaces, non-flat normals, the normal-map reference
hash, the UV border margin, UV-island connectivity and inter-island padding. With `--glb`
it also decodes the embedded images and compares the baked images with the exported GLB
images. It does not trust the generated bake JSON for the measured error.

Current results:

- 1024²: albedo MAE `0.008894`, roughness MAE `0.0`, UV border `0.027287`.
- 2048²: albedo MAE `0.010020`, roughness MAE `0.000249`, UV border `0.027287`.
- Both: albedo `sRGB`, roughness/normal `Non-Color`, normal RG std `0.0666` / `0.0725`.
- Both: 3 UV islands; minimum inter-island padding `0.054574` UV
  (55.88 px at 1024², 111.77 px at 2048²), pair `[0, 2]`.
- Both: baked-to-exported albedo/roughness/normal MAE `0.0`, no vertical flip; source-to-
  exported albedo MAE equals the source-to-baked error above.

Negative controls:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/curved_001.blend --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/make_inverted_normal.py -- \
  path/to/textures/Curved_Normal_1024.png path/to/Curved_Normal_1024_inverted_blue.png \
  --mode blue
```

Run the checker with `--normal-image .../Curved_Normal_1024_inverted_blue.png`; it fails
because tangent-space Z is no longer positive (`normal_b_mean` near `0.012`), not only
because the reference hash changed. Run it with `--normal-colorspace sRGB` on the valid
image; it fails because the normal image is treated as colour data. Both negative controls
exit non-zero.

## Manifest and provenance

```bash
node tools/asset-pipeline/tests/phase3/make_manifest.mjs \
  path/to/asset.glb path/to/source.blend path/to/out-dir asset.id
```

## Reproducibility

Build each fixture twice into separate directories. The crate and curved GLBs are
byte-identical across runs; only the `.blend` container hash differs because of Blender
metadata. For the final curved run:

- `curved_1024.glb`: `925df105d65e7fab55acbc7428ff95c93e009c7c7ad32d01ff6d744cbcceab55`
- `curved_2048.glb`: `ae7ee88b9cf5a28c4e44cdbe49ed4afefaaa7d3fbd156d7acc6b54537e265c9c`
- `crate_001.glb`: `08f9d1eb9424c982f55911d24cfc1cc9a295d2f8f9d2d8062d1af0138b49a5ad`

Compare inventories and `bake_checks.json` hashes, not `.blend` file hashes.

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
  .dev-shots/asset-pipeline/phase3/msn-baseline-headless
```

The baseline uses the existing `assets/MSN_Figure/msn.glb` read-only, 1/8/32 shared-geometry
instances and a checker backdrop at 1920×1080, DPR 1. It runs headless. Timings are CPU
submission/relative only, not GPU completion or full-game FPS. No 9070 XT render benchmark
is required or implied.

## Current findings

- Crate: validator pass, embedded 1024² checker, clean import/preview pass, density review.
  At a 4 m side camera the 1024² ratio is `p05 0.451` / `p95 1.272`; at 2048² it is
  `p05 0.902` / `p95 2.544`.
- Curved: validator pass at 1024² and 2048², clean import/preview pass, visual pass on all
  inspected views. Density remains review: at 1024² the side/cap ratio is
  `p05 0.488` / `p95 3.654`; at 2048² `p05 0.977` / `p95 7.309`; UV anisotropy p95
  `1.57` at both.
- MSN: validator review with three `NODE_SKINNED_MESH_NON_ROOT` warnings. Material flags
  are `transmission 1`, `ior 1.45`, `thickness 0`, `side DoubleSide`, `transparent false`,
  `depthWrite true`, `depthTest true`. Geometry deduplicates to 3 across 1/8/32;
  materials deduplicate to 1. Skeleton counts are 1/22/94 for 1/8/32 instances.
  The baseline now checks skeleton independence directly: every instance has its own
  skeletons and no skeleton UUID or bone UUID is shared between instances
  (`sharedSkeletonCount 0`, `sharedBoneCount 0`). Headless 20-frame submission averages
  were about `0.16`, `0.51` and `1.77` ms at 1/8/32 instances.
