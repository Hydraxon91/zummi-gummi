# Phase 6 crate delivery trial

This is a crate-only mapping and GLB-delivery trial. It does not touch the house,
the game loader, the species registry or the runtime asset catalog.

## Selected delivery

`crate-delivery-v4-512silver` is the selected crate candidate, recorded in
`selection.json`. It keeps the approved teal/silver look, uses 512² silver and
1024² teal maps, and cuts download bytes by 34.9% versus v3. Density remains a
reviewed limitation, not a clean pass. V3 stays as the baseline; V5 is rejected
for visible softness; V6 is retained as a density experiment.

For future game assets, preserve high-resolution source maps and choose delivery
resolution **per material** from the closest intended gameplay views. Prefer the
simplest UV/material setup that preserves the accepted appearance, then validate
channels, seams, tiling and mips after downsampling. Treat texel-density ranges as
guidance, not a score to optimize against visual quality.

## Accepted inputs

- Phase 4 zone checkpoint: `.dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend`
- Crate-specific StableMaterials, seed `20261020`:
  - teal shell base colour, corrected to the approved palette
  - silver trim base colour, corrected to the approved palette
  - original normal/roughness/metallic maps
- Approved palette: `tools/asset-pipeline/tests/phase5/palette.json`

The teal map is a painted coating, so its generated white metallic map is **not
connected**; the teal material uses constant metallic `0.0`. The silver metallic map
is connected. This is a documented simplification, not a recovered physical value.

## UV mapping

`normalize_uv_islands.py` maps each of the crate's six UV islands independently to
0–1 with a 0.005 margin. This lets each face sample the same tileable texture instead
of sampling a different region of an atlas.

The UV change is intentional:

- geometry remains unchanged;
- six islands remain;
- the UV layout intentionally overlaps in one UV set because the same tileable
  texture is repeated on each face;
- measured UV density is approximately `1023 px/m` at 1024;
- no out-of-bounds or degenerate UV triangles.
- camera-projected density remains a review finding, not an accepted pass (see below).

The overlapping-UV audit warning is expected for this repeated-texture mapping. It is
not an atlas and must not be treated as one.

## Build

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/normalize_uv_islands.py -- \
  --source .dev-shots/asset-pipeline/phase4/material-zones/crate_zones_001.blend \
  --out-dir .dev-shots/asset-pipeline/phase6/crate-uv
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase6/crate-uv/crate_phase6_uv_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/build_crate_delivery.py -- \
  --source .dev-shots/asset-pipeline/phase6/crate-uv/crate_phase6_uv_001.blend \
  --teal-basecolor .dev-shots/asset-pipeline/phase6/crate-materials/corrected/phase5_stablematerials_crate_teal_seed20261020_basecolor_corrected.png \
  --teal-normal .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_teal_seed20261020_normal.png \
  --teal-roughness .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_teal_seed20261020_roughness.png \
  --teal-metallic .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_teal_seed20261020_metallic.png \
  --silver-basecolor .dev-shots/asset-pipeline/phase6/crate-materials/corrected/phase5_stablematerials_crate_silver_seed20261020_basecolor_corrected.png \
  --silver-normal .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_silver_seed20261020_normal.png \
  --silver-roughness .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_silver_seed20261020_roughness.png \
  --silver-metallic .dev-shots/asset-pipeline/phase6/crate-materials/raw/phase5_stablematerials_crate_silver_seed20261020_metallic.png \
  --out-dir .dev-shots/asset-pipeline/phase6/crate-delivery-v3
```

Delivery files:

- `crate_phase6_001.blend`
- `crate_phase6_001.glb`
- `asset.json`
- `provenance.json`

Generate the manifest and provenance:

```bash
node tools/asset-pipeline/tests/phase6/make_manifest.mjs \
  .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.glb \
  .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.blend \
  .dev-shots/asset-pipeline/phase6/crate-delivery-v3 phase6-crate
```

## Verification

```bash
node tools/asset-pipeline/scripts/verify_asset.mjs \
  --glb .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.glb \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/verify \
  --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --manifest .dev-shots/asset-pipeline/phase6/crate-delivery-v3/asset.json \
  --provenance .dev-shots/asset-pipeline/phase6/crate-delivery-v3/provenance.json \
  --visual-review .dev-shots/asset-pipeline/phase6/crate-delivery-v3/visual-review.json \
  --base-url http://localhost:8123 \
  --views front,back,left,right,three_quarter,top,bottom,near,far \
  --lights day,night --width 1440 --height 900
```

Export-channel check:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/verify_export_channels.py -- \
  --glb .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.glb \
  --build .dev-shots/asset-pipeline/phase6/crate-delivery-v3/build.json \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/export-channels.json
```

Density review:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/add_review_camera.py -- \
  .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_density_001.blend \
  Phase6_Density_Camera 3.0
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_density_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Crate_Body \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/density-audit.json \
  --resolution 1024 --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --camera Phase6_Density_Camera

/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase6/add_density_camera.py -- \
  .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_density_3q_001.blend \
  Phase6_Density_3Q 3.2
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_density_3q_001.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Crate_Body \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/density-audit-3q.json \
  --resolution 1024 --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --camera Phase6_Density_3Q
```

Close-up and far seam/mip captures:

```bash
node tools/asset-pipeline/scripts/preview_capture.mjs \
  --base-url http://localhost:8123 \
  --asset .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.glb \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/closeups \
  --views three_quarter --lights day,night --margin 0.45 \
  --width 1440 --height 900

node tools/asset-pipeline/scripts/preview_capture.mjs \
  --base-url http://localhost:8123 \
  --asset .dev-shots/asset-pipeline/phase6/crate-delivery-v3/crate_phase6_001.glb \
  --out .dev-shots/asset-pipeline/phase6/crate-delivery-v3/mips \
  --views far --lights day,night --far-factor 3.2 \
  --width 1440 --height 900
```

Current result:

- identity, structure, validator, dependencies, clean import, preview and visual review: **pass**
- validator: 0 errors / 0 warnings
- 2 materials, 2 primitives, 108 triangles
- 6 embedded images at 1024²
- embedded base colour, normal, packed roughness and packed metallic: **MAE 0.0**
- sampler repeat: **pass**
- resources: review (advisory estimates only)
- camera-projected density: **review**, not a pass

### 512 px silver candidate (v4)

`make_silver_512.py` downsamples only the silver base colour, normal, roughness
and metallic maps to 512². The normal vectors are decoded, area-averaged,
renormalised and encoded again; the source 1024² files remain untouched. The
metallic source is constant white, so it has no spatial detail to preserve.

Build output is `crate-delivery-v4-512silver/`. It uses the same six normalized
UV islands, teal 1024² maps and silver 512² maps.

- Download: `6,281,824` → `4,091,852` bytes (**−34.9%**)
- Decoded texture estimate: `25,165,824` → `15,728,640` bytes (**−37.5%**)
- Validator: **0 errors / 0 warnings**
- Embedded channels: **MAE 0.0**; sampler repeat
- Visual review and close/far captures: **pass**; brushed grain remains visible
- Density at 512: front silver p05/median/p95 `0.502` / `1.039` / `2.407`;
  three-quarter `0.446` / `0.870` / `2.138`
- Density at 1024 baseline: front p95 `4.813`; three-quarter p95 `4.276`

The 512 maps more than halve the trim p95, but the advisory `1.0–2.0` range is
still not clean: p95 remains above 2.0 and p05 falls below 1.0 because the bevel
strips are thin and view-dependent. This is a memory/quality improvement, not a
clean density pass. The 512 tiling seam ratio is `0.983`; the analysis helper
reports `dimensions_ok: false` only because it expects 1024², while its seam
metrics pass.

Build the candidate with the same build command, substituting the four
`silver-512/..._512.png` paths. The 512 density audit uses
`tools/asset-pipeline/tests/phase6/profile_512.json`, which sets the advisory
texture resolution to 512 for the silver trim; teal remains evaluated at 1024.

### 256 px and independent trim UV candidates

Two further candidates were tested without changing v3 or v4:

- `crate-delivery-v5-256silver` uses 256² silver maps and the original UV map.
- `crate-delivery-v6-512silver-trimuv` keeps 512² silver maps and adds
  `UVMap_Silver`, a second UV map used only by the silver material and scaled
  to `0.8`. The export carries silver textures on `TEXCOORD_1`; teal remains on
  `TEXCOORD_0`.

| Candidate | GLB bytes | Silver p05/median/p95, front | p05/median/p95, 3Q | Visual |
| --- | ---: | --- | --- | --- |
| v3 1024 | 6,281,824 | 1.004 / 2.078 / 4.813 | 0.893 / 1.741 / 4.276 | pass |
| v4 512 | 4,091,852 | 0.502 / 1.039 / 2.407 | 0.446 / 0.870 / 2.138 | pass |
| v5 256 | 3,445,652 | 0.251 / 0.519 / 1.203 | 0.223 / 0.435 / 1.069 | pass, visibly softer at 1.3 m |
| v6 512 + UV 0.8 | 4,093,332 | 0.401 / 0.831 / 1.925 | 0.357 / 0.696 / 1.710 | pass |

V6 is the only candidate with silver p95 inside the advisory `2.0` ceiling while
retaining 512² detail, but its median and p05 fall below the advisory `1.0`
floor. V5 saves another ~16% of GLB bytes over v4 but visibly softens the bevel
grain. V4 remains the simplest 512 candidate with the best-centered density.
The independent silver UV scale is verified in `trim-uv-check.json`: silver span
ratio `0.800`, teal max delta `0.0`.

V6 exports both UV attributes on both primitives. The validator reports two
`UNUSED_OBJECT` **infos** (`TEXCOORD_0` on silver, `TEXCOORD_1` on teal), with
zero errors and zero warnings. This is an exporter-level extra attribute, not a
material or rendering failure.

The 256 audit uses `profile_256.json`. V6’s silver density uses a review copy
with `UVMap_Silver` active; the teal result from that copy is ignored because
teal still renders with `UVMap`.

## Findings

- `crate-delivery-v1` (original UV atlas) showed different face colours because the
  tileable texture sampled different atlas regions. Not accepted.
- `crate-delivery-v2` normalized UVs but connected the white teal metallic map, making
  the shell reflective and uneven. Not accepted.
- `crate-delivery-v3` normalizes UVs, uses constant metallic `0.0` for the painted teal
  and keeps the 1024² silver maps. It is the baseline delivery.
- `crate-delivery-v4-512silver` is the selected delivery: same UVs and teal maps,
  512² silver maps. It keeps the v3 baseline available for comparison; its density
  remains a reviewed limitation.
- Embedded base colour, normal, roughness and metallic channels match the source maps
  with **MAE 0.0**; the base-colour sampler repeats. Teal metallic is constant zero
  through `metallicFactor: 0.0`.
- Camera-projected density is view-dependent. At 3.0 m front / 1024, the silver trim
  p95 is `4.813` (over the advisory `1.0–2.0` range) and the teal zone has only two
  samples (`unverified`, minimum four). At 3.2 m three-quarter, the silver p05/p95 are
  `0.893` / `4.276`, and the teal zone still has only three samples (`unverified`).
  At 2048 the silver p95 rises to `9.626` / `8.552`, so higher resolution is not a fix.
  This remains a density review finding, not an accepted density pass.
- Close-up (1.3 m, `margin 0.45`) and far (9.15 m, `farFactor 3.2`) day/night captures
  show no clamp border, hard texture seam or visible mip bleed. This is inspected
  visual evidence, not a numeric seam metric.
- Inter-island atlas padding is not applicable because the six islands intentionally
  overlap; the normalized UVs keep a 0.005 texture-edge margin.
- No additional bake was performed: the source materials are already image-based, so
  this trial tests direct UV mapping, channel packing on export, and GLB delivery. It
  does **not** establish bake fidelity.
- Do not integrate this GLB into the game or asset catalog without separate approval.

Evidence:

- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/verify/report.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/verify/captures/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/blender/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/audit.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/build.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/export-channels.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/density-audit.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/density-audit-3q.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/closeups/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/mips/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v3/verification-summary.json`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v4-512silver/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v5-256silver/`
- `.dev-shots/asset-pipeline/phase6/crate-delivery-v6-512silver-trimuv/`
- `.dev-shots/asset-pipeline/phase6/crate-materials/silver-512/`
- `.dev-shots/asset-pipeline/phase6/crate-materials/silver-256/`
- `.dev-shots/asset-pipeline/phase6/candidate-comparison.json`
- `tools/asset-pipeline/tests/phase6/selection.json`
