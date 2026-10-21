# Phase 7 — harder benchmarks

Phase 7 will test the pipeline beyond the six-island crate:

- 7A tool validation;
- 7B many-island hard surface;
- 7C curved/organic surface;
- 7D multi-part assembly;
- 7E mixed opaque/glass architecture.

**7A**, **7B**, **7C**, **7D** and **7E** are implemented. 7B includes a
tileable-versus-baked-atlas comparison; 7C and 7D carry density-review
limitations; 7D was accepted by the user after the shade-mount revision. 7E was
accepted with mixed 1024/512 as the default delivery and 512/1024 variants
retained.

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

Result: corrected linear-light downsampling gives checker linear mean `0.502887`,
encoded sRGB mean `0.737256` (expected `0.735357`), zero spread; orientation corners
are preserved; normal mean length is `0.9978` with positive Z. The deliberately wrong
`--legacy-srgb-average` output gives encoded mean `0.501961` and linear mean
`0.215861`, and the checker fails both tests. This replaces the earlier unsupported
claim that an encoded `0.502` average was linear.

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
panel assemblies, a U-handle and four rubber feet. The tileable baseline is
`equipment-case-010`; the baked-atlas comparison is `equipment-case-atlas-008`.
Both start from the same 1,428-triangle source.

### Geometry revision and flicker

Earlier tileable candidates showed camera-only flicker at the frame and handle
joints. The cause was overlapping joined frame bars, not UV mapping: `Ctrl+J`
does not remove intersecting surfaces, and coincident/near-coincident faces
z-fight. The current source uses single Boolean-cut front/top frames, a slightly
recessed top frame and unioned handle mounts. The user inspected
`equipment-case-010` and found no visible flicker or z-fighting.

The experimental `check_coplanar_overlaps.py` checker is advisory only. Its
counts are not independently calibrated enough to prove or disprove a joint;
hidden overlap is acceptable, while visible flicker is the blocker. Confirm
suspect joints through camera motion, not a still image.

### Tileable baseline

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
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/equipment-case-010
```

Result: **pass with density review**.

- 3 objects, 3 materials, **77 UV islands**, 1,428 triangles; GLB `4,183,272`
  bytes, 2,058 exported vertices, 6 images.
- Topology clean; UVs have zero geometric overlaps, out-of-bounds corners or
  degenerate triangles.
- Minimum inter-island padding at 512: case `6.74 px`, handle `5.53 px`, feet
  `8.16 px`; minimum border margin `0.005404`.
- Khronos validator: 0 errors, **1 warning**
  (`MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` on one primitive) and 4
  unused-tangent/UV infos. Clean import and preview pass. The warning is an
  export-preparation defect in the tileable baseline: the handle mesh was not
  triangulated before tangents were calculated. It is not caused by the atlas.
- Density remains review.

### Baked atlas comparison

`bake_equipment_case_atlas.py` duplicates and flattens the three parts, packs one
`AtlasUV`, triangulates, and bakes base colour, roughness, metallic and tangent
normal into a 1024² atlas (4 px margin, 16 Cycles samples, metallic scale `1.0`).
The original tileable source and materials stay unchanged.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background \
  .dev-shots/asset-pipeline/phase7/benchmark/equipment-case-010/equipment_case_source_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/bake_equipment_case_atlas.py -- \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/equipment-case-atlas-008 \
  --resolution 1024 --margin 4 --samples 16 --metallic-scale 1.0
```

Result: **pass with fidelity tradeoff**.

- 1 object, 1 material, 3 images; 1,428 triangles; GLB `1,982,128` bytes
  (52.6% smaller than tileable), 2,072 exported vertices.
- 90 UV islands; minimum inter-island padding `19.34 px` at 1024 (`9.67 px` at
  512); border `9.67 px`; bake margin 4 px.
- Audit: 0 errors/warnings. Khronos validator: **0 errors / 0 warnings / 0
  infos**. Clean import and preview pass; preview mesh count drops from 5 to 1.
- Matched three.js day captures versus tileable: encoded MAE `0.00128` front,
  `0.00096` three-quarter, `0.00459` near; p95 `0.00530`/`0.00409`/`0.03039`;
  `1.42%`/`0.82%`/`5.25%` of pixels differ by more than 8/255. The difference is
  broad and strongest on the silver frame/handle edges. Front-panel and handle
  close-ups show softer silver grain in the atlas; those close-ups plus back,
  right-side and top captures show no visible UV seam or island cut. This is a
  texel-density tradeoff, not a seam failure: the tileable 512 repeats retain
  more high-frequency detail on large silver runs.
- `equipment-case-atlas-007` is a rejected diagnostic. Its joined mesh was not
  triangulated before export, so the exporter omitted tangents and the validator
  reported `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE`. Triangulating before the
  bake fixes it and keeps the baked tangent space aligned with the export.

The atlas is a comparison candidate, not a replacement delivery. Tileable
remains the accepted baseline because it preserves the closer-view grain; the
atlas is appropriate when bytes and mesh/draw count matter and the closest view
has enough atlas texel density. Density remains review for both paths. Fidelity
evidence is the matched preview comparison and close-ups, not a per-channel
source-to-baked MAE; the atlas textures were not independently sampled against
the source maps. Evidence:
`.dev-shots/asset-pipeline/phase7/benchmark/7b-summary.json` and
`.dev-shots/asset-pipeline/phase7/benchmark/equipment-case-atlas-008/comparison.json`.

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

Post-acceptance revision `office-corner-009` extends the back wall through the
side-wall thickness and the floor to the outer wall faces (`3.78 x 3.18 m`). The chair
uses continuous rear stiles instead of separate rear legs plus back posts, with
22.5 mm apron/stretcher overlaps and apron tops 20 mm inside the seat. The builder also
imports the user's edited lamp hierarchy (root `(0.49528, 1.197138, 0.77)`, `110°`) and
reproduces its world matrices within `2.4e-7`. Chair audit passes with 17 parts and 1,916
evaluated triangles; front, side, under-seat and six-angle orbit captures show no gaps or
flicker. `009` is built but not accepted, and its optimized mixed/512/1024 deliveries
have not been regenerated.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/build_office_corner.py -- \
  --materials-json .dev-shots/asset-pipeline/phase7/benchmark/office-materials-final-003/office-materials-final.json \
  --lamp-glb .dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/office_desk_lamp_edit_001.glb \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/office-corner-009
```


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

## 7F — Retro laptop and Frutiger props

Status: **prototype exploration, not accepted**. The laptop, beanbag, plant and mouse are
shape-stage experiments for the workflow described below; no game integration or delivery is
authorized.

### Shape-first review tools

Enforced delivery paths and explicit benchmark exemptions are listed in
[`ENFORCEMENT.md`](ENFORCEMENT.md).

- `tools/asset-pipeline/scripts/capture_review.py` — independent, exception-safe staged
  captures. Presets are `solid` (Workbench), `material` (fast Eevee/Cycles) and `final`.
  It restores render settings, camera, frame, shading/sample state, world, selection and
  hidden-object state in `finally`, removes temporary cameras/lights/worlds, refuses
  overwrites and writes a hash-linked manifest with a source fingerprint. Use `--isolate`
  for an asset-only review; `--frame` is mandatory for animated scenes, `--pose-object`
  records an evaluated controller matrix, and `--focus-targets`/`--focus-view` add a
  bounds-based close-up.
- `tools/asset-pipeline/scripts/check_evidence.py` — verifies capture hashes, persistent
  target IDs, explicit frames, recorded controller matrices, the saved source hash and the
  source fingerprint at each manifest frame. When expected IDs are supplied, the union of
  revalidated manifest IDs must cover every selected mesh; additional IDs require explicit
  `support_objects`/`support_ids`. Legacy name-only evidence remains readable but cannot
  authorize the enforced paths. It compares two or more poses but does not prove visual or
  contact acceptance.
- `tools/asset-pipeline/scripts/asset_identity.py` — persistent `asset_id` custom-property
  helper plus migration CLI (`--objects`/`--prefix`/`--all-meshes`, optional `--save`).
  Duplicate or missing IDs are errors. Tests: `test_asset_identity.py`.
- `tools/asset-pipeline/scripts/check_interface.py` — **experimental** local signed
  nearest-surface diagnostic over sampled evaluated triangles. It reports sample count,
  spacing, minimum signed distance, minimum absolute distance and missing samples; it does
  not prove complete coverage or watertight contact. Fixture-tested on touching, separated
  and intersecting boxes plus a deliberately unsupported cap-shrinkage case.
- `tools/asset-pipeline/scripts/construction_gate.py` — validates a construction brief
  (including the geometry/material split), candidate ledger and evidence report, including
  manifest hashes, the saved source hash and source `.blend`. `check_shape_gate.py` at
  detail/delivery, the canonical exporter, office exporter and the two prototype builders
  require these inputs and revalidate evidence before writing. The gate does not judge
  method suitability or likeness.
- `tools/asset-pipeline/scripts/asset_fingerprint.py` — deterministic source fingerprint
  over transforms, mesh and UV data, material graphs, modifiers, constraints and custom
  properties. External image bytes, linked files and render-only state are outside it.
- `tools/asset-pipeline/scripts/check_shape_gate.py` — read-only bounds, hinge,
  editable-modifier and default-scene hygiene check. `--review-manifest` rejects stale
  captures and evaluates the source at the manifest frame; `--stage detail`/`delivery`
  requires a matching recorded silhouette approval. Detail/delivery construction inputs are
  delegated to `construction_gate.py`; silhouette-stage inputs remain optional. It does not
  judge likeness.
- `tools/asset-pipeline/tests/phase7/test_capture_review.py` — self-test for snapshot
  restoration, success and exception cleanup (including a forced render-operator
  exception), animated-frame framing, material-preset temp data cleanup, UV/material/
  transform/modifier-operand fingerprint changes, stale capture rejection, deleted-capture
  approval invalidation, pose/evidence checks, bounds-based focus capture and the detail
  approval gate. It passes. Approvals require a fresh manifest with
  front/side/top/three-quarter captures and store the manifest and capture hashes; deleting
  or editing evidence invalidates them. Approvals now record and validate their review frame.
- `tools/asset-pipeline/tests/phase7/test_export_guard.py` — positive GLB export fixture plus
  negatives for unsaved geometry, changed saved source, stale source hash, swapped target
  IDs, fresh evidence for another *existing* target, replacement with the old name/new ID,
  duplicate IDs, missing coverage, undeclared extra targets and support-only substitution.
  It passes; declared support targets are accepted. A rename resolves by ID but stale
  name-bearing evidence blocks rather than redirecting.
- `tools/asset-pipeline/tests/phase7/test_office_export_fixture.py` — positive fixture through
  the actual office-corner exporter, with IDs, brief/ledger and evidence. It passes.
  Laptop and Frutiger builders assign stable IDs but still need executed positive GLB
  fixtures; that regeneration task remains open. Approval records now carry target IDs;
  brief/ledger target IDs are validated when enforced callers supply the current set.
- `tools/asset-pipeline/scripts/check_material_boundaries.py` — read-only advisory material
  region/boundary report with current-vs-baseline assignment and geometry changes. It cannot
  prove visual correctness; tests are `test_material_boundaries.py`.

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/capture_review.py -- \
  --out-dir .dev-shots/review --preset solid --prefix Asset_ \
  --views front,side,top,three_quarter --isolate

/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/check_shape_gate.py -- \
  --out .dev-shots/review/shape-gate.json --prefix Asset_ \
  --hinge Asset_Hinge --stage silhouette \
  --review-manifest .dev-shots/review/asset_captures.json

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_capture_review.py

/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/check_evidence.py -- \
  --out .dev-shots/review/evidence.json \
  --manifest .dev-shots/review/closed_captures.json \
  --manifest .dev-shots/review/open_captures.json --expect-frames 1,20

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_interface_check.py

python3 tools/asset-pipeline/tests/phase7/test_construction_gate.py

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_export_guard.py
```

`build_retro_laptop.py` and `build_frutiger_props.py` now save their source and refuse to
write a GLB without a matching `--shape-approval` plus construction brief, candidate ledger
and evidence report. Use `export_approved_asset.py` for the gated export; it also requires
those inputs and binds evidence to the current source `.blend`. The block was verified on
`retro-laptop-014`: the source was saved, the GLB was not written, and the export gate
rejected the old evidence-free approval. A negative test confirms the canonical exporter
rejects an invocation that omits construction evidence.

### Laptop prototype

- `retro-laptop-013` corrects the layout toward the reference: 4:3 screen, white bezel,
  left-offset keyboard, right-offset trackpad, thicker orange shell and a wide handle.
- The live MCP shell candidate `retro-laptop-shell-007` removes the handle, thickens and
  flattens the lid section, lowers the hinge and adds a clean raised bezel with a blank
  screen panel. A Boolean screen recess was rejected: after Subsurf it produced degenerate
  faces, and before Subsurf it produced a teardrop recess, so the bezel is a separate clean
  mesh. Open/closed `look` views and evaluated health checks pass; it remains shell-only.
  Saved evidence photos are under `retro-laptop-shell-007/photos-open`,
  `photos-closed`, `photos-material-open` and `photos-material-closed`.
- `retro-laptop-shell-008` applies the side-profile correction from the additional
  reference photos: the base top seam is 4 mm higher at the rear and lower at the front,
  the lid bottom is wedged to match, the lid depth is extended to the base depth, and the
  hinge is raised to the new rear seam. Closed profiles are flush in width; the seam is a
  shallow wedge with a 1 mm gap. Screen/bezel dressing is temporarily hidden for this
  shape-only checkpoint and must be re-seated after approval. Photos are in
  `retro-laptop-shell-008/photos-open` and `photos-closed`; structural gate passes.
- `retro-laptop-shell-014` is the latest side-profile pass: the base underside now curves
  up at the ends, the lid crown varies around its perimeter, and the seam is matched with
  a 0.8 mm overlap at flush outer widths. Photos are in `photos-open-002` and
  `photos-closed`; structural gate passes. The `009–013` checkpoints are retained
  iterations. A dark seam line remains and still needs visual acceptance.
- `retro-laptop-shell-020` added a thin seam gasket band to fill the rounded-edge groove.
  It is retained but rejected: the band was not seated on the base and read as a floating
  ring. `retro-laptop-shell-021` discards the visible band (the object is retained hidden
  as `Rejected_Seam_Gasket`), adds a support fan and perimeter-only crease to the base top
  and lid bottom caps, and seats the lid bottom on the evaluated base surface. The lid
  bottom is 0.35–1.4 mm from the base and its perimeter sits about 0.7 mm inside the base
  edge; base/lid health and the structural gate pass. Photos are in `photos-open` and
  `photos-closed`. `014–020` remain retained iterations.
- Review update: shell 021 is user-accepted with reservations. Earlier cage-ring equality
  and unsigned nearest distances did not prove evaluated contact. Animated review commands
  now require explicit `--frame`; add `--pose-object Shell_Hinge` to record the evaluated
  controller matrix. Compare pose matrices before accepting open/closed labels. Structural
  gate PASS is not visual approval. The experimental interface checker is implemented and
  fixture-tested on touching, separated and intersecting boxes; it remains a local estimate,
  not a contact guarantee.
- The subdivided moulded-shell workflow test is preserved under
  `.dev-shots/asset-pipeline/phase7/benchmark/moulded-shell-pattern-001/`. Shared seam
  support rings plus perimeter creases keep the closed rim thin under level-2 subdivision;
  closed health is clean, the local interface minimum absolute distance is about
  `0.000004 m` with `1 mm` local penetration, and closed/intermediate/open evidence passes.
  This is one manual pattern test, not a pattern library or likeness approval. A support-removed negative
  variant with a `2 mm` seam gap is detected as separated; a separate box fixture isolates
  unsupported cap shrinkage and opens an `81 mm` gap.
- Earlier prototypes exposed two workflow bugs: a factory-startup **2 m default cube** made
  the review camera render a wall, and imported glTF empties use **quaternion rotation**, so
  setting Euler angles silently did nothing. Both are fixed in the builders.
- On add-on 1.8/protocol 14, `look` angles/frames work but `topology` is still unavailable;
  use wireframe or direct mesh checks.

### Beanbag and props

- `frutiger-props-002` adds a flat underside and seat depression, but the beanbag still reads
  as a symmetrical moulded bowl. It needs a quad cage with folds, asymmetry and a softer seat
  transition; Boolean subtraction is not the right primary method.
- The plant and wired mouse remain prototype props.
- `capture_review.py --isolate` is required because the standalone prop source places all
  assets at the origin.

### Boundary

This is a workflow and shape-gate trial. It does not establish reference fidelity or acceptance
for the laptop, beanbag, plant or mouse, and it does not authorize game integration.
