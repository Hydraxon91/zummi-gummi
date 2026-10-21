# Phase 7 — harder benchmarks

Phase 7 will test the pipeline beyond the six-island crate:

- 7A tool validation;
- 7B many-island hard surface;
- 7C curved/organic surface;
- 7D multi-part assembly;
- 7E mixed opaque/glass architecture.

**7A**, **7B**, **7C**, **7D** and **7E** are implemented. 7C and 7D carry
density-review limitations; 7D was accepted by the user after the shade-mount
revision. 7E was accepted with mixed 1024/512 as the default delivery and 512/1024
variants retained.

## 7A — Tool validation

Fixtures are generated into the gitignored
`.dev-shots/asset-pipeline/phase7/` directory.

### Downsampling and orientation

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/make_fixtures.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/fixtures

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/make_silver_512.py -- \
  --basecolor .dev-shots/asset-pipeline/phase7/fixtures/srgb_checker.png \
  --normal .dev-shots/asset-pipeline/phase7/fixtures/normal_tilt.png \
  --roughness .dev-shots/asset-pipeline/phase7/fixtures/dummy_roughness.png \
  --metallic .dev-shots/asset-pipeline/phase7/fixtures/dummy_metallic.png \
  --out-dir .dev-shots/asset-pipeline/phase7/downsample/checker --size 512

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/make_silver_512.py -- \
  --basecolor .dev-shots/asset-pipeline/phase7/fixtures/orientation_quadrants.png \
  --normal .dev-shots/asset-pipeline/phase7/fixtures/normal_tilt.png \
  --roughness .dev-shots/asset-pipeline/phase7/fixtures/dummy_roughness.png \
  --metallic .dev-shots/asset-pipeline/phase7/fixtures/dummy_metallic.png \
  --out-dir .dev-shots/asset-pipeline/phase7/downsample/orientation --size 512

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/check_downsample.py -- \
  --checker .dev-shots/asset-pipeline/phase7/downsample/checker/srgb_checker_512.png \
  --orientation .dev-shots/asset-pipeline/phase7/downsample/orientation/orientation_quadrants_512.png \
  --normal .dev-shots/asset-pipeline/phase7/downsample/checker/normal_tilt_512.png \
  --out .dev-shots/asset-pipeline/phase7/downsample-check.json
```

Result: checker linear mean `0.501961` with zero spread, orientation corners
preserved, normal mean length `0.9978`, normal Z positive.

### Channel negative controls

`verify_export_channels.py` now checks the actual source hash against
`build.json`. `run_channel_negatives.py` corrupts one reference at a time and
requires the verifier to fail:

```bash
python3 tools/asset-pipeline/tests/phase7/run_channel_negatives.py \
  --build .dev-shots/asset-pipeline/phase6/crate-delivery-v4-512silver/build.json \
  --glb .dev-shots/asset-pipeline/phase6/crate-delivery-v4-512silver/crate_phase6_001.glb \
  --blender /Applications/Blender.app/Contents/MacOS/Blender \
  --verifier tools/asset-pipeline/tests/phase6/verify_export_channels.py \
  --out-dir .dev-shots/asset-pipeline/phase7/negatives
```

Result: wrong base colour, metallic, normal and source hash all fail for the
expected reason.

### Planar density fixture

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/make_plane_fixtures.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/plane-grid

/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase7/plane-grid/plane_uv1_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Plane \
  --out .dev-shots/asset-pipeline/phase7/plane-grid/plane-uv1-audit.json \
  --resolution 512 --profile tools/asset-pipeline/tests/phase6/profile_512.json \
  --camera Phase7_Camera --open-panels

/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase7/plane-grid/plane_uv_half_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Plane \
  --out .dev-shots/asset-pipeline/phase7/plane-grid/plane-uv-half-audit.json \
  --resolution 512 --profile tools/asset-pipeline/tests/phase6/profile_512.json \
  --camera Phase7_Camera --open-panels

python3 tools/asset-pipeline/tests/phase7/check_density.py \
  --uv1 .dev-shots/asset-pipeline/phase7/plane-grid/plane-uv1-audit.json \
  --uvhalf .dev-shots/asset-pipeline/phase7/plane-grid/plane-uv-half-audit.json \
  --out .dev-shots/asset-pipeline/phase7/density-check.json
```

Result: UV density `512`/`256 px/m`, projected density `888.889 px/m`,
eight samples per zone, ratios `0.576`/`0.288`. The advisory “under” warning is
expected at 3 m and is not a measurement failure.

### Material-specific UV sets and resolutions

```bash
python3 tools/asset-pipeline/tests/phase7/check_glb_uv_sets.py \
  --glb .dev-shots/asset-pipeline/phase6/crate-delivery-v4-512silver/crate_phase6_001.glb \
  --variant v4 --out .dev-shots/asset-pipeline/phase7/v4-uv-sets.json

python3 tools/asset-pipeline/tests/phase7/check_glb_uv_sets.py \
  --glb .dev-shots/asset-pipeline/phase6/crate-delivery-v6-512silver-trimuv/crate_phase6_001.glb \
  --variant v6 --out .dev-shots/asset-pipeline/phase7/v6-uv-sets.json
```

Result: V4 silver/teal use `TEXCOORD_0` at 512/1024; V6 silver uses
`TEXCOORD_1` at 512 and teal `TEXCOORD_0` at 1024.

### Visual-review filter

`make_visual_review.mjs` now accepts `--views` and `--lights`, so a review can
list only the captures actually inspected instead of claiming all preview
captures were reviewed. A fixture selecting one of 18 captures passes:

```bash
node tools/asset-pipeline/tests/phase4/make_visual_review.mjs \
  --captures .dev-shots/asset-pipeline/phase6/crate-delivery-v4-512silver/verify/preview.json \
  --out .dev-shots/asset-pipeline/phase7/visual-review-filter.json \
  --inspected true --views three_quarter --lights day \
  --notes "Filter fixture: only the selected capture is inspected."
```

## 7A status

**Pass**, with the fixture limitations recorded in
`.dev-shots/asset-pipeline/phase7/7a-summary.json`.

This does not establish arbitrary-asset support.

## 7B — Many-island hard surface

The benchmark is a project-authored beveled equipment case with two recessed
panel assemblies, a U-handle and four rubber feet. Source and GLB are under
`.dev-shots/asset-pipeline/phase7/benchmark/equipment-case-004/`.

Build:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/build_equipment_case.py -- \
  --teal-basecolor .dev-shots/asset-pipeline/phase6/crate-materials/corrected/phase5_stablematerials_crate_teal_seed20261020_basecolor_corrected.png \
  --teal-normal .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_teal_seed20261020_normal.png \
  --teal-roughness .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_teal_seed20261020_roughness.png \
  --silver-basecolor .dev-shots/asset-pipeline/phase6/crate-materials/silver-512/phase5_stablematerials_crate_silver_seed20261020_basecolor_corrected_512.png \
  --silver-normal .dev-shots/asset-pipeline/phase6/crate-materials/silver-512/phase5_stablematerials_crate_silver_seed20261020_normal_512.png \
  --silver-roughness .dev-shots/asset-pipeline/phase6/crate-materials/silver-512/phase5_stablematerials_crate_silver_seed20261020_roughness_512.png \
  --silver-metallic .dev-shots/asset-pipeline/phase6/crate-materials/silver-512/phase5_stablematerials_crate_silver_seed20261020_metallic_512.png \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/equipment-case-004
```

Checks:

- `check_equipment_case.py` — material zones, object dimensions and combined bounds.
- `check_uv_padding.py` — island count, inter-island padding and border margin.
- `audit_asset.py` — topology and advisory density.
- `make_manifest.mjs` / `verify_asset.mjs` — manifest, validator, clean import,
  preview and hash-linked visual review.

Result: **pass with density review**.

- 3 objects, 3 materials, **108 UV islands**, 1,580 triangles.
- 0 boundary edges, loose vertices, degenerate faces or winding conflicts.
- 0 geometric UV overlaps, out-of-bounds UVs or degenerate UV triangles.
- Minimum inter-island padding at 512: case `8.44 px`, handle `5.57 px`, feet
  `8.16 px`; minimum border margin `0.00544`.
- Validator: 0 errors / 0 warnings / 4 infos (unused tangents/UVs on dark,
  untextured primitives).
- Clean import, preview and visual review pass.
- GLB `4,215,116` bytes; decoded texture estimate `15,728,640` bytes; 5 draw calls.
- The 2 m review camera reports advisory density under/over and anisotropy
  warnings from mixed 1024/512 maps and Smart UV variation. **Density remains
  review**, not a pass.

Limitations: tileable material mapping only—not a baked non-overlapping atlas;
the handle is intentionally faceted at this benchmark resolution.

## 7C — Curved/organic surface bake

The accepted candidate is `pebble-procedural-004`, selected as
`pass_with_density_review`.

`build_pebble_procedural_bake.py` builds a pole-free quad sphere with an
asymmetric dimple, projects it to an ellipsoid, and freezes the low mesh
triangulation before baking. The low mesh is 12,288 triangles; the high-detail
copy is 49,152 triangles. `pebble_fields.py` defines the analytic source fields
in object-local metres: teal base, coral band, asymmetric lime and dark markers,
smooth roughness variation and a dielectric/metallic transition.

The source is not a UV-space image. The fields are evaluated through shader
groups and baked into the one final atlas, so the six UV islands cannot cut the
pattern.

Bake settings: Cycles, 32 samples, 6 px margin, 1024². Albedo, roughness and
metallic use emission passes; tangent normals use selected-to-active from the
high copy. Normal strength stays `1.0`.

Accepted channel evidence:

- source-to-baked albedo mean `0.00222`, p95 `0.00412`
- roughness mean `0.000807`, p95 `0.00179`
- metallic mean `0.00134`, p95 `0.00267`
- 802 samples across 401 UV-seam edges; seam albedo mean `0.00208`
- baked-to-export albedo/roughness/metallic/normal MAE `0.0`
- normal RG standard deviation `0.01464`, positive Z, length `1.00056`
- negative controls detect vertical flip (`0.0786`), channel swap (`0.346`) and
  missing sRGB decode (`0.205`)

UV and export:

- one `UVMap`, six islands, no overlap/out-of-bounds/degenerate UV triangles
- approximate inter-island padding `12.65 px` at 1024 and `6.32 px` at 512
- border margin `6.31 px`; bake margin `6 px`, below half the island gap
- GLB `1,196,468` bytes, 6,551 exported vertices, 12,288 triangles, 3 images
- material single-sided (`doubleSided: false`), normal scale `1.0`
- Khronos validator 0 errors/warnings; clean import and preview pass

Visual acceptance used 18 day/night captures, eight close-ups, three neutral
shading captures and matched source/baked Blender renders. No UV island cuts or
pole/shading wedges were found. Density remains review: at 1024 the p05 ratio is
`0.399` and p95 `2.193`; at 2048 the p05/p95 are `0.798`/`4.386`.

Commands:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/build_pebble_procedural_bake.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004 \
  --resolution 1024

/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/pebble_procedural_source_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/verify_pebble_procedural_bake.py -- \
  --glb .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/pebble_procedural_001.glb \
  --out .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/channel-check.json

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/verify_pebble_procedural_bake.py -- --self-test
```

Additional 7C checks:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/pebble_procedural_source_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/check_uv_padding_fast.py -- \
  --objects Pebble_Low \
  --out .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/uv-padding-fast.json \
  --step-uv 0.0005

/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/pebble_procedural_source_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/render_pebble_compare.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/compare
```

The earlier UV-space candidates under `pebble-003`, `pebble-004` and
`pebble-007` remain failed diagnostics; `7c-failure.json` records that history.
They are not the accepted 7C result.

Limitations: synthetic benchmark only; density remains review; padding is an
approximate sampled-segment measurement; no game integration, catalog entry or
loader change; no commit or push.

## 7D — Multi-part desk lamp

Accepted candidate: `desk-lamp-005`, status `accepted_with_density_review`.
Summary: `.dev-shots/asset-pipeline/phase7/benchmark/desk-lamp-005/7d-summary.json`.

The lamp has 24 separate mesh parts, one root hierarchy and four materials:
teal image maps on the base/shade, silver image maps on the structure and
fasteners, constant rubber on four pads, and one analytic procedural reflector
baked to a six-island atlas. The source and export copies are separate 24-part
checkpoints.

The first bracket revision merged the rectangular head arm into the teal shade.
The accepted revision pulls the bracket back and adds a silver shade neck and
round mount plate, so the metal-to-teal boundary is a visible mechanical joint.
Assembly verification reports all expected interfaces overlapping, all 24 parts
connected, a `6.15 mm` reflector-to-shade clearance with zero intersections, and
zero material or source/export-copy mismatches.

Reflector bake (`desk_lamp_fields.py`, 1024², Cycles 32 samples, 4 px margin):
source-to-baked albedo mean `0.00174`/p95 `0.00237`, roughness
`0.00251`/`0.00669`, metallic `0.00164`/`0.00285`; the 264 seam-pair samples pass
and baked-to-export MAE is `0.0`. Reflector UV padding is `8.49 px` at 1024
(`4.25 px` at 512), border `4.25 px`; the 4 px bake margin is below half the
island gap.

Export: `5,415,096` bytes, 18,570 vertices, 10,648 triangles, 4 materials,
8 images. Khronos validator reports 0 errors/0 warnings/9 unused-tangent/UV infos
on untextured/simple parts; clean import passes. Final verification did not rerun
the 18-view preview; visual acceptance is the user-approved 005 interface and
overall renders.

Density remains review: 18 warnings across the 24 objects. The shade’s 1024 p95
is `3.411`, the base `4.225`, and small silver/rubber parts reach much higher
advisory ratios. This is not a density pass.

Known finding: two small dark triangular marks remain on the shade in Blender
Eevee close-ups; their cause was not resolved and they were accepted with the
lamp. They are not independently verified in the GLB preview.

## 7E — Mixed opaque/glass office corner

Candidate: `office-corner-006`, status `accepted`. Mixed 1024/512 is the default,
with 512 and 1024 variants retained. Summary:
`.dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/7e-summary.json`.

The room is a 3.6 x 3.0 m cutaway with 2.7 m walls. The desk is against the rear
wall under a transmission-glass window; the chair tucks under the desk; the
bookcase is against the left wall with 29 books; an oval grey wool rug, open book
and four-blade ceiling fan/light complete the set. Wallpaper is applied only to
room-facing wall faces, with plaster on the exterior and cut edges.

Scene-specific StableMaterials maps were generated at 1024² and base colours
mean-corrected to the office palette. Six generated sets are used: floral
wallpaper seed `20261022`, herringbone parquet seed `20261023`, walnut desk seed
`20261023`, oak chair seed `20261021`, red cushion seed `20261021` and grey rug
seed `20261021`. Raw maps, rejected plain plaster/concrete predecessors and the
corrected channels remain under `office-materials-*` and
`office-materials-final-003`.

The accepted lamp transform is saved in `build_office_corner.py`: location
`(0.49528, 1.197138, 0.77)`, rotation `110°`. A 12 W warm point light is parented
to the lamp root and a 35 W point light to the fan hub; neither point light is
exported. The fan globe is exported with `KHR_materials_emissive_strength`.

Original export: `32,060,220` bytes, `202` mesh objects / `207` primitives, `33,522`
vertices, `18,916` triangles, `21` materials and `27` images. Extensions used:
`KHR_materials_transmission`, `KHR_materials_ior` and
`KHR_materials_emissive_strength`. Validator reports 0 errors/0 warnings and 295
unused-tangent/UV infos on the unmerged build. Clean import passes; the standalone
three.js preview passes with 414 draw calls and no GL error.

The selected optimized delivery evaluates and merges static meshes by material in
an export-only collection. Wallpaper and parquet stay at 1024²; furniture maps drop
to 512². Result: `16,062,484` bytes, 24 meshes / 29 primitives, 39,433 vertices,
21 materials, 27 images and 58 preview draw calls, with 0 errors/warnings and 31
unused-tangent/UV infos. A 512²-everywhere variant is `10,518,536` bytes with the same
58 calls and visibly softer wallpaper. Evidence:
`delivery-opt-002/selection.json` and `mixed-manifest/verify/report.json`.

Eight Blender views under `render-checks/final-003/` were inspected: interior,
exterior, window, lamp, books, chair, rug and fan. Day and night preview captures
confirm transmission glass and the emissive fan globe.

Limitations: texel density was not audited; the delivered GLB does not export the
lamp/fan point lights (the fan globe is emissive); no mesh compression. Game loader,
catalog, species and scene integration remain out of scope.

Build/export/verify commands:

```bash
python3 tools/asset-pipeline/tests/phase7/generate_office_materials.py \
  --template tools/asset-pipeline/tests/phase5/api/stablematerials_text_pbr_template.json \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/office-materials-004 \
  --seeds 20261022 --material office_wall_wallpaper

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/build_office_corner.py -- \
  --materials-json .dev-shots/asset-pipeline/phase7/benchmark/office-materials-final-003/office-materials-final.json \
  --lamp-glb .dev-shots/asset-pipeline/phase7/benchmark/desk-lamp-005/desk_lamp_001.glb \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006

/Applications/Blender.app/Contents/MacOS/Blender --background \
  .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/office_corner_source_003.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/render_office_corner.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/render-checks/final-003
```

Optimized delivery (export-only merge, mixed textures):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/office_corner_source_003.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/optimize_office_delivery.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/delivery-opt-002 \
  --mode mixed
```
