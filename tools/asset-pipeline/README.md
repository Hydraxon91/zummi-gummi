# Asset pipeline tools

Phase 1a, Phase 1b and Phase 2 of
[`docs/asset-pipeline-roadmap.md`](../../docs/asset-pipeline-roadmap.md), with Phase 3
bake fixtures, a Phase 4 crate material-zone trial, a Phase 5 material-generation pilot
and a Phase 6 crate GLB-delivery trial under `tests/`.

This directory contains the **read-only asset audit**, delivery profiles, provenance
schema, advisory texel-density policy and unified export verification. It does not
generate textures, repair assets, export GLBs, modify the game loader or integrate
anything into Gummy Bears.

## Contents

- `profiles/` — versioned delivery profiles:
  - `opaque_prop.json`
  - `transparent_buddy.json`
  - `mixed_architecture.json` (provisional, bubble house)
- `schemas/` — JSON Schema documents for profiles and provenance.
- `examples/provenance.example.json` — minimal provenance record.
- `schemas/verification-report.schema.json` — Phase 2 report contract.
- `scripts/audit_asset.py` — read-only Blender audit.
- `scripts/density_policy.py` — pure percentile and advisory-policy evaluation.
- `scripts/validate_documents.py` — dependency-free profile/provenance validation.
- `scripts/verification_report.mjs` — pure status, disposition and inventory comparison.
- `scripts/validator.mjs` — pinned Khronos `gltf-validator` adapter.
- `scripts/provision_validator.mjs` — isolated validator provisioning.
- `scripts/verify_asset.mjs` — unified structural/validator/import/preview coordinator.
- `scripts/clean_import.py` — disposable Blender clean-import check.
- `scripts/preview_capture.mjs` and `preview/` — standalone three.js preview harness.
- `tests/` — pure document/policy/report tests, Blender fixtures, synthetic GLBs,
  Phase 3 bake fixtures and the Phase 4 crate material-zone trial.

## Audit

Run against an existing `.blend` from the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/source.blend \
  --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Body \
  --out .dev-shots/audit/body.json \
  --resolution 1024 \
  --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --camera Closest_View
```

Use `--objects` with explicit mesh names. `--all-meshes` is available for inspection but
is not the preferred production path. Use `--open-panels` for intentional open surfaces.
Use `--profile path/to/profile.json` to attach a delivery profile. Use `--camera NAME`
to select the closest intended view; the scene camera is never assumed to be that view.
Use `--fail-on error` or `--fail-on warning` when the audit is acting as a gate; the
default is `none`. Use `--force` only when intentionally replacing a report.

The audit is read-only. It does not save the `.blend`, apply modifiers, change UVs,
assign materials, export or render.

### Report contents

- scene units, scale, axes, render engine and dirty state;
- source path and SHA-256 when the source file exists;
- per-object transforms, bounds, dimensions and negative-scale detection;
- evaluated geometry health from `asset_qa`;
- UV layer names, active-render state, bounds, island counts and island area;
- geometric UV overlap, out-of-bounds and degenerate-triangle diagnostics;
- raw UV density measurements from `uv_report`;
- `uv_required` per object, based on whether its materials use image textures;
- advisory camera-projected density by texture resolution and material zone;
- material slots and material/image dependencies from `texture_inventory`;
- shared meshes/materials, visibility and object-linked slots from
  `render_state_audit`;
- missing or unsupported image-source preflight findings;
- dependencies: parents, constraints, modifiers, collections and libraries;
- findings with `error`, `warning` and `info` severities;
- provenance stub with source hash, tool/Blender versions and empty generation/export
  fields.

The audit report is **evidence**, not an acceptance decision. Passing a check does not
approve the asset.

## Texel-density policy

The policy compares measured texture density with the screen density required by an
explicit closest camera:

- for each front-facing triangle inside the view, required density is
  `sqrt(projected_screen_area_px / world_area_m2)`;
- measured density is
  `sqrt(uv_area * texture_width * texture_height / world_area_m2)`;
- the reported ratio is `measured / required`.

Projected screen area naturally accounts for oblique surfaces. A separate UV Jacobian
singular-value ratio reports directional stretching that area alone can hide.

Policy defaults are **advisory**:

- viewport `1920×1080`;
- `1024²`, `2048²` (and fixture-only `4096²`) evaluated independently;
- ratio review range `1.0–2.0` texels per screen pixel;
- density-spread review threshold `p95/p05 > 2.0` within a material zone;
- UV-anisotropy review threshold `p95 > 1.5`;
- small triangles are included and reported separately, never silently discarded;
- no camera, insufficient visible coverage or too few zone samples is `unverified`.

Consistency is evaluated per material zone, not across an entire mixed asset. Thresholds
must be calibrated against the crate and curved test before they are treated as a
delivery gate. A missing UV is only a warning when the object's materials use image
textures; intentionally untextured constant/procedural materials do not require one.

## Diagnostic semantics

| Code | Severity | Meaning |
|---|---|---|
| `geometry_*` | error | Evaluated geometry health failure such as degenerate faces or zero-length edges. |
| `missing_external_image` | error | A required image is missing and has no packed copy. |
| `no_active_uv` | warning | An image-textured mesh has no active render UV. Untextured meshes are exempt. |
| `uv_out_of_bounds`, `uv_outside_single_tile` | warning | UV coordinates leave the 0–1 tile. |
| `uv_degenerate_triangles`, `zero_uv_area_triangles` | warning | UV area is zero or effectively degenerate. |
| `uv_geometric_overlap` | warning | Islands overlap geometrically; raster pixel conflicts are separate. |
| `unsupported_image_source` | warning | UDIM, sequence or movie source; verify static export or bake. |
| `image_has_no_pixels` | warning | Image dimensions are zero. |
| `missing_unused_external_image`, `missing_unconnected_external_image` | warning | Missing image is not required by inspected material outputs. |
| `object_linked_material_slot` | warning | Slot is object-linked; verify export. |
| `unresolved_material_groups` | warning | Node groups are not traversed by the inventory. |
| `texel_density_under`, `texel_density_over` | warning | Camera-relative ratio is outside the advisory range. |
| `texel_density_inconsistent` | warning | Density spread exceeds the advisory limit within a material zone. |
| `texel_density_anisotropic` | warning | Directional UV stretch exceeds the advisory limit. |
| `texel_density_unverified`, `texel_density_zone_unverified` | warning/info | Missing camera, coverage or samples; not a pass. |
| `modifiers_present` | info | Modifiers are present; evaluated geometry was audited. |

`--fail-on error` exits nonzero on errors. `--fail-on warning` also exits nonzero on
warnings. Advisory density warnings should only be made blocking after calibration and
explicit approval.

## Phase 2 export verification

`verify_asset.mjs` combines independent evidence without treating one check as another:

- node and Python GLB inventories;
- the pinned Khronos glTF Validator;
- self-contained dependency and profile-extension checks;
- a disposable Blender clean import;
- a standalone three.js preview and hash-linked captures;
- an advisory resource summary.

Provision the validator once into the gitignored scratch cache:

```bash
node tools/asset-pipeline/scripts/provision_validator.mjs
```

This pins `gltf-validator@2.0.0-dev.3.10` (Apache-2.0), verifies the tarball SHA-1, and
does not create a root `package.json`, game dependency or build step.

Serve the repository and run the coordinator:

```bash
python3 launch.py --no-open --localhost --port 8123
```

```bash
node tools/asset-pipeline/scripts/verify_asset.mjs \
  --glb assets/MSN_Figure/msn.glb \
  --manifest assets/MSN_Figure/asset.json \
  --profile tools/asset-pipeline/profiles/transparent_buddy.json \
  --provenance path/to/provenance.json \
  --out .dev-shots/asset-pipeline/verify-msn \
  --base-url http://localhost:8123 \
  --views front,three_quarter,near,far \
  --lights day,night
```

Useful options:

- `--manifest path/to/asset.json` to verify a tracked inventory and hash;
- `--visual-review path/to/review.json` to link inspected captures and hashes;
- `--skip-clean-import` and `--skip-preview` for structural-only passes;
- `--validator-dir DIR` to point at an explicitly provisioned validator;
- `--clip NAME`, `--width`/`--height`, `--fov`, `--near-factor`, `--far-factor` and
  `--margin` for explicit preview framing;
- `--strict` to exit nonzero when the disposition is `fail`.

The report is `report.json` in `--out`, with `node-inventory.json`,
`python-inventory.json`, `validator.json`, `clean-import.json`, `preview.json` and
hash-linked PNG captures beside it. The JSON contract is
`schemas/verification-report.schema.json`.

Sections are `identity`, `structure`, `validator`, `dependencies`, `clean_import`,
`preview`, `visual` and `resources`.

Sections use `pass`, `review`, `fail`, `unverified` and `not_run`. Errors block; warnings
and unverified sections prevent a clean pass. A capture being written does not prove it
was inspected, so `visual` remains `review` until a separate human or approved visual
check records its evidence.

A visual review is a small JSON record with `inspected`, `reviewer`, `notes`, optional
`status` (`pass`, `review` or `fail`) and a `captures` list of `{path, sha256}` entries.
Every entry needs a hash, every hash must match a current capture, and an inspected review
with no current captures is `not_run`. Unknown or stale evidence fails; omitting a current
capture remains a review item rather than a pass. Use `status: "review"` to keep a real
residual defect visible instead of recording a clean pass.

The preview is a **standalone tool-only page** using the pinned three.js `0.186.1` and
its stock `GLTFLoader`. It loads the GLB, records material/extension/inventory data and
captures fixed views under day and night lighting. It does not modify `src/assets.js`,
the game loader, species registry or runtime scene. Unsupported required extensions are
surfaced for review; no automatic material fallback is applied.

The Blender clean import runs in `--factory-startup` and excludes importer-only
`glTF_not_exported`/custom-shape helper objects. A clean import establishes decoded
inventory and material/image state, not conformance or appearance.

### Phase 2 fixtures

```bash
tools/asset-pipeline/tests/phase2/run.sh
```

The fixture suite checks valid, malformed, invalid-accessor, external-dependency and
unsupported-extension GLBs, the validator adapter and report dispositions. With
`PREVIEW_BASE_URL=http://localhost:8123`, it also runs the MSN preview path and expects a
`review` disposition.

## Phase 3 fixture generation

The Phase 3 scripts are under `tests/phase3/`:

- `build_crate.py` — copies the existing crate into a new checkpoint, applies an
  asymmetric checker material and exports `crate_001.glb`.
- `build_curved.py` — builds a 1 m × 1 m cylinder, preserves the n-gon source,
  triangulates the low before baking/export, bevels a high copy, bakes
  albedo/roughness/normal at 1024² and 2048² and writes `curved_1024.glb` /
  `curved_2048.glb`.
- `inspect_curved.py` — reports seam, UV-island, topology, sharp-edge and split-normal
  diagnostics.
- `verify_bake_channels.py` — re-samples source/baked channels, validates colours spaces,
  normal reference hashes, UV border padding and negative controls.
- `make_inverted_normal.py` — creates a deliberate bad-normal fixture.
- `export_flat_variants.py` — exports flat-colour and flat-plus-normal seam diagnostics.
- `make_manifest.mjs` — generates `asset.json` and `provenance.json` from an exported GLB.
- `add_review_camera.py` — adds a review-only side camera to a copy of a checkpoint for
  density evaluation.
- `run_msn_baseline.mjs` — captures 1/8/32 shared-geometry MSN instances against a checker
  backdrop at 1920×1080 and records relative headless timings.

Build examples:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background .dev-shots/uv-texture-pilot/simple_crate_002_unwrapped.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/build_crate.py -- \
  --source .dev-shots/uv-texture-pilot/simple_crate_002_unwrapped.blend \
  --out-dir .dev-shots/asset-pipeline/phase3/crate
```

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase3/build_curved.py -- \
  --out-dir .dev-shots/asset-pipeline/phase3/curved_final
```

The Phase 3 run is evidence, not game readiness. The crate passed validator and preview
checks with a 1024² embedded checker. The curved asset passed validator, clean-import and
preview checks at both resolutions; its earlier line was diagnosed as flat-shading plus
environment specular, not a UV/normal seam. The final 1024² bake uses a 16 px margin and
the 2048² bake uses 32 px. MSN remains a review result because of its three validator
warnings and because the headless timings are CPU-submission only.

## Documents

```bash
python3 tools/asset-pipeline/scripts/validate_documents.py
```

## Tests

Pure document tests:

```bash
python3 -m unittest discover -s tools/asset-pipeline/tests -p 'test_*.py'
```

Blender fixture:

```bash
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
  tools/asset-pipeline/tests/blender/run.sh
```

The Blender fixtures run two passes:

- Phase 1a: valid cube, bad out-of-bounds-UV/no-material cube, untextured no-UV cube and
  image-textured no-UV cube; checks the changed no-UV semantics and source preservation.
- Phase 1b: known-size grids with a fixed camera, under/over/consistent density,
  directional anisotropy, missing, packed-missing and unsupported images,
  object-linked slots, unresolved groups and degenerate geometry; checks the expected
  findings and confirms that source UVs and objects are unchanged.

## Helper dependencies

The audit imports existing project helpers from:

- `.opencode/skills/gummy-3d-authoring/scripts/`
- `tools/uv-layout-extractor/scripts/`

It does not modify or vendor those helpers. Use `--helper-dir` only if the helper
directory is relocated; the extractor path is derived from the repository root.

## Limits

- Geometric UV overlap is not a raster pixel-conflict check.
- Density checks use front-facing triangles inside the current view; occlusion and
  transparent backfaces are not tested.
- Density consistency uses material groups as zones, not semantic material zones.
- Modifiers and UVs are observed through the current depsgraph; nothing is applied.
- Node groups are not traversed by the texture inventory.
- Density thresholds are advisory until calibrated; they do not establish acceptance.
- Bake channel checks cover this fixture's source/baked albedo, roughness and normal
  images; they do not establish universal bake correctness or rendered appearance.
- Phase 2 does not export or repair assets, change the loader or integrate into the game.
- Validator conformance is not appearance, gameplay or universal extension support.
- Preview captures are standalone three.js evidence, not full-game performance.
- The preview uses the pinned three.js CDN import map; offline loading is unverified.
- Phase 3 browser timings are headless CPU-submission/relative numbers; no GPU completion
  timing or full-game FPS is claimed. The RX 9070 XT PC is ComfyUI-only and is not a
  rendering test target.
- Decoded texture-memory estimates are reported, but renderer allocation, compression
  ratios and transfer cost remain unverified.
- Resource estimate ranges are deduplicated accessor/image storage; the geometry/image
  split is not a GPU-buffer budget.
- `gltf-transform inspect` is intentionally not added; existing inventories cover the
  current fields, and a new dependency needs a demonstrated gap.
- The Phase 4 crate trial validates ordinary material slots, exported surface assignment
  and evaluated mesh health. It does not establish house zone boundaries, automatic
  segmentation, texture baking or game integration.
- The Phase 5 pilot’s colour correction is a documented post-process, not pure
  generation. The palette and eight candidates are accepted; 2048² StableMaterials
  generation exceeds the 16 GB test GPU.
- The Phase 6 crate trial uses direct image-based UV mapping, not a new bake. Its
  normalized UVs intentionally overlap for repeated tiling and are not an atlas.
- Phase 6 embedded base colour, normal, packed roughness and packed metallic match the
  source maps with MAE 0.0, and the sampler repeats. Camera-projected density remains a
  review finding: thin silver trim is over the advisory range and the teal zone is
  under-sampled; 2048 increases the trim over-density.
- Phase 6 selected v4 512 px silver for the crate. It reduces download bytes by 34.9% and
  decoded texture storage by 37.5%, but its trim density p95 remains `2.407` / `2.138`
  against the advisory `2.0` ceiling. A 256 px candidate clears p95 but softens the
  close-up; a 512 + independent trim UV 0.8 candidate clears p95 while retaining grain,
  but lowers the median below the advisory floor and adds `TEXCOORD_1`. Visual grain and
  close/far seams pass; density is still review.
- Future assets should preserve high-resolution sources and choose delivery resolution
  per material from the closest intended views, not one global resolution.
- No compression variant, house modeling or game integration.
