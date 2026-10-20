# Phase 4 crate material-zone trial

This is a crate-only trial of ordinary Blender material slots and polygon assignments.
It is not a house zone map, automatic segmentation, bake or game integration.

## Build

The accepted Phase 3 crate is opened read-only; the new checkpoint and GLB are written
under a new Phase 4 directory.

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase3/crate/crate_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase4/build_crate_zones.py -- \
  --source .dev-shots/asset-pipeline/phase3/crate/crate_001.blend \
  --out-dir .dev-shots/asset-pipeline/phase4/material-zones
```

The trial uses:

- slot 0, `Crate_Pilot_Mat` (existing checker) on the 48 bevel/edge polygons;
- slot 1, `Crate_Main_Mat` (solid preview colour) on the 6 planar main faces.

It records `zone_build.json` with source/output hashes, dimensions, zone polygon lists and
triangle counts. The source checkpoint hash remains `9948b800…`.

## Export-zone verification

```bash
node tools/asset-pipeline/tests/phase4/verify_zones.mjs \
  --glb .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.glb \
  --build .dev-shots/asset-pipeline/phase4/material-zones/zone_build.json \
  --out .dev-shots/asset-pipeline/phase4/material-zones/zone_verify.json
```

Current result: `pass`. The GLB has two materials and two primitives:
`Crate_Pilot_Mat` 96 triangles (48 polygons) and `Crate_Main_Mat` 12 triangles
(6 polygons), 108 triangles total. The GLB hash matches `zone_build.json`.
The verifier also reads exported positions and classifies each primitive geometrically:

- `Crate_Main_Mat`: 12/12 triangles are axis-aligned and touch one bounding-box face.
- `Crate_Pilot_Mat`: 0/96 triangles are axis-aligned; 96/96 touch at least two
  bounding-box faces.

This checks that the materials remain on the intended surfaces, not only that the
triangle totals match.

## Evaluated mesh and slot checks

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase4/verify_zone_mesh.py -- \
  --out .dev-shots/asset-pipeline/phase4/material-zones/zone_mesh.json
```

Current result: `pass`.

- 2 valid, non-empty slots with the expected names;
- all 54 polygons have valid material indices;
- 6 main polygons and 48 edge polygons match the expected normal classification;
- evaluated mesh: 56 vertices, 108 edges, 54 faces;
- 0 loose vertices, 0 non-manifold edges, 0 flipped faces.

## Invalid-assignment control

```bash
mkdir -p .dev-shots/asset-pipeline/phase4/invalid-zones
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase4/make_invalid_zones.py -- \
  --source .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --out-dir .dev-shots/asset-pipeline/phase4/invalid-zones --polygon 0
```

```bash
node tools/asset-pipeline/tests/phase4/verify_zones.mjs \
  --glb .dev-shots/asset-pipeline/phase4/invalid-zones/crate_zones_invalid_001.glb \
  --out .dev-shots/asset-pipeline/phase4/invalid-zones/zone_verify_invalid.json
```

The invalid fixture moves one bevel quad into the main slot. The verifier fails as
expected: main `14` triangles, edge `94`, `mainTriangles false`, `edgeTriangles false`
and `mainSurface false`; exit code is non-zero. `verify_zone_mesh.py` also fails the same
fixture with `zone_mismatches [0]`, so the Blender-side and export-side controls agree.

## Blender review renders

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase4/render_zones.py -- \
  --out-dir .dev-shots/asset-pipeline/phase4/material-zones/blender
```

The script creates temporary camera/lights and does not save the checkpoint. Six views
were inspected: front, back, left, right, three-quarter and top. The main faces and
bevel strips remain distinct, with no detached faces or holes.

## Unified verification and preview

```bash
node tools/asset-pipeline/tests/phase3/make_manifest.mjs \
  .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.glb \
  .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  .dev-shots/asset-pipeline/phase4/material-zones phase4-crate-zones
```

```bash
node tools/asset-pipeline/scripts/verify_asset.mjs \
  --glb .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.glb \
  --out .dev-shots/asset-pipeline/phase4/material-zones/verify \
  --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --manifest .dev-shots/asset-pipeline/phase4/material-zones/asset.json \
  --provenance .dev-shots/asset-pipeline/phase4/material-zones/provenance.json \
  --base-url http://localhost:8123 \
  --views front,back,left,right,three_quarter,top,bottom,near,far \
  --lights day,night --width 1440 --height 900
```

Create a hash-linked visual-review record only after inspecting the captures:

```bash
node tools/asset-pipeline/tests/phase4/make_visual_review.mjs \
  --captures .dev-shots/asset-pipeline/phase4/material-zones/verify/preview.json \
  --out .dev-shots/asset-pipeline/phase4/material-zones/visual-review.json \
  --inspected true \
  --notes "Inspected 18 day/night captures; main faces and bevel zones are clean."
```

Then rerun `verify_asset.mjs` with
`--visual-review .dev-shots/asset-pipeline/phase4/material-zones/visual-review.json`.

Current result: validator `pass` with zero errors and zero warnings; clean import,
preview and hash-linked visual review `pass`; resources `review` (advisory estimates).
The validator reports one informational `UNUSED_OBJECT` for `TEXCOORD_0` on the
untextured main primitive. That is not an error or warning.

## Current findings

- Source geometry/UV fingerprints, dimensions and source hash are unchanged:
  `56` vertices, `54` polygons, `108` triangles, dimensions `1.0 × 1.0 × 1.0 m`.
- Zone coverage is exact: 6 main faces / 12 triangles, 48 edge faces / 96 triangles.
- Export assignment preservation is verified from GLB primitive counts and exported
  triangle geometry, not inferred from Blender’s polygon material indices alone.
- Evaluated slot validity and mesh health pass: 0 loose vertices, 0 non-manifold edges and
  0 flipped faces.
- The deliberately invalid bevel assignment is rejected by the same verifier.
- Source crate GLB remains `08f9d1eb…`; the new zone GLB is `96695a40…`.
- A second independent build under `material-zones-repro/` produced the same zone GLB
  hash and the same geometry/UV fingerprints; only the `.blend` container differs.
- No house geometry, palette, UV, loader, species registry or runtime integration was
  changed.
