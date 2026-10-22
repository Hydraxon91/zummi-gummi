# Asset pipeline tools

Phase 1a, Phase 1b and Phase 2 of
[`docs/asset-pipeline-roadmap.md`](../../docs/asset-pipeline-roadmap.md), with Phase 3
bake fixtures, a Phase 4 crate material-zone trial, a Phase 5 material-generation pilot,
a Phase 6 crate GLB-delivery trial and Phase 7A tool-validation fixtures under `tests/`.

This directory contains the read-only asset audit, delivery profiles, provenance
schema, material runners and export verification. The experimental job-driven Python
entry point below also prepares derived bake candidates and delegates approval-gated
exports. None of these tools modifies the game loader or integrates assets into Gummy Bears.

## Job-driven Python pipeline (experimental)

One entry point, reusable modules, asset choices in JSON:

```bash
python3 tools/asset-pipeline/pipeline.py hybrid --job tools/asset-pipeline/jobs/laptop-hybrid-review.job.json --dry-run
python3 tools/asset-pipeline/pipeline.py hybrid --job tools/asset-pipeline/jobs/laptop-hybrid-review.job.json
python3 tools/asset-pipeline/pipeline.py render --job tools/asset-pipeline/jobs/laptop-hybrid-open-capture.job.json
python3 tools/asset-pipeline/pipeline.py check --job tools/asset-pipeline/jobs/laptop-hybrid-check.job.json
```

Ordinary Python launches disposable background Blender, using `source` in the job;
`--blender` overrides discovery. The same entry point runs inside background Blender
after `--`. `--dry-run` validates the supported field contract without starting Blender
or writing outputs. `schemas/asset-job.schema.json` describes the JSON format;
`pipeline/job.py` performs the dependency-free verb-specific validation. This is not
a general JSON Schema implementation.

Verbs: `inspect`, `uv`, `bake`, `hybrid`, `check`, `render`, `export`, `verify`.
`bake` supports `export:false` for review-only checkpoints. `hybrid` always produces a
review candidate: ordered groups partition selected meshes, `objects:"*"` collects the
remainder, each group has its own bake resolution. Parents and separate opaque versus
transparent material regions are retained; helper joined meshes stay hidden.
`tile_materials` optionally restores exact repeated source base-colour image sampling
and grayscale linear roughness remapping through `TileUV`; height-derived tangent
normals remain baked in `AtlasUV`. This is **not** arbitrary shader conversion: only
Object coordinates through POINT Mapping into FLAT/REPEAT image nodes and linear
Map Range roughness are supported. Unsupported tile graphs fail.

`check` profiles retain the old helpers through adapters rather than changing their
thresholds: `padding`, `coplanar` and `density` enable the existing reports. Padding
and density remain advisory. Coplanar analysis is within each object, not between
objects. `assembly_report` compares retained source objects to output parts at `frames`
using equal vertex counts and bidirectional distances at 1e-5 m tolerance; that is not
proof of vertex identities, normals or topology. Tiny nonzero faces are reported
separately from exact zero-area faces. `render` delegates to `capture_review.py`, including
its frame/evidence handling and state restoration. `verify` currently combines the
custom GLB UV audit and disposable clean import; it is not a replacement for the pinned
Khronos validator and standalone three.js preview in `scripts/verify_asset.mjs`.

`export` delegates to `export_approved_asset.py` and requires `gate` paths for
`approval`, `construction_brief`, `candidate_ledger` and `evidence_report`.
No automatic approval or acceptance is generated. Authored tangents are **off by
default**: degenerate UV triangles produce zero-length tangents that glTF validators
reject (`ACCESSOR_VECTOR3_NON_UNIT`). Pass `--tangents` to the exporter, or
`"tangents": true` in a job, only for assets whose UVs are clean; omitted tangents
leave clients to derive tangent space, which the pinned validator reports as
`MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings. Existing phase scripts remain in
`tests/`; new regression fixtures live in `fixtures/`. No old files were moved.

Posed exports need the evaluated transform frozen first: the glTF exporter writes node
rests for object-level animation even with `export_animations=False`, so a frame-20
export can otherwise be byte-identical to frame 1. Clear the animated parents'
`animation_data` and assign their evaluated `matrix_world` before exporting.

Atlas slots are merged by source material identity and a full shader-graph signature
(node inputs, image references and links), so parts sharing one authored material
export as one GLB material and graphs differing only in a scalar input stay separate.
Baked parts also receive a fresh persistent `asset_id` with
`pipeline_source_object` provenance, which is what the delivery gate approves.
Approval records must name the real approver: do not record a user silhouette
acceptance that was not given. Use `user_acceptance: false` and an honest
`approval_basis` when the record covers structural verification only.

Checks:

```bash
python3 tools/asset-pipeline/fixtures/test_pipeline.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 --python tools/asset-pipeline/fixtures/check_atlas_preparation.py
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 --python tools/asset-pipeline/fixtures/check_hybrid_tiles.py
```

Current laptop candidate: `.dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/hybrid-review-005/`.
Open/closed material captures have been inspected; all 96 parts match source per-material
triangle ownership at frames 1 and 20, and frame-1 geometry matches exactly. The
validator-clean test export (`retro_laptop_hybrid_mechanics_test_002.glb`) passes the
structural audit, clean import and three.js preview with tangents omitted; the open-pose
export (`retro_laptop_hybrid_open_test.glb`) is previewed in the same viewer.
**Not delivery-approved:** no gate artifacts exist yet, and the trackpad inherits
exactly zero-area evaluated triangles from the source. No office replacement or game
integration has been published from this candidate. Original source/checkpoints remain
untouched.

## Contents

- `profiles/` — versioned delivery profiles:
  - `opaque_prop.json`
  - `transparent_buddy.json`
  - `mixed_architecture.json` (provisional, bubble house)
- `schemas/` — JSON Schema documents for profiles and provenance.
- `examples/provenance.example.json` — minimal provenance record.
- `schemas/verification-report.schema.json` — Phase 2 report contract.
- `scripts/audit_asset.py` — read-only Blender audit.
- `scripts/capture_review.py` — staged Workbench/material/final captures with state restoration,
  explicit frames, evaluated pose records and bounds-based focus captures.
- `scripts/asset_capture.py` — reusable single-view clay/wire capture of an object
  set with reference-plane visibility and scene-state restoration. Unlike the
  staged CLI it takes objects directly, so a modelling helper can call it. It
  updates the view layer after positioning the camera; without that, matrix-based
  projection checks read a stale identity transform.
- `scripts/reference_sheet.py` — explicit view cropping, shared-scale validation and locked,
  render-hidden Blender reference planes from author-supplied pixel rectangles.
- `scripts/run_comfy_workflow_stable_materials.py` — reusable StableMaterials ComfyUI runner
  driven by a job JSON; dry-run, validation, map download and hash manifest.
- `scripts/run_comfy_workflow_qwen_image_edit.py` — reusable Qwen Image 2.1 image-edit
  ComfyUI runner for UV-template-guided texture and sticker jobs.
- `examples/laptop-plastics-aged.job.json` — aged ivory/tangerine plastic prompts for the
  laptop tooling test.
- `examples/laptop-stickers-qwen.job.json` — UV-template sticker job for the same test.
- `scripts/check_evidence.py` — pose, frame, hash and frame-specific fingerprint validation.
- `scripts/check_interface.py` — experimental local signed-surface interface diagnostic.
- `scripts/construction_gate.py` — construction brief, candidate ledger and evidence validation.
- `scripts/check_shape_gate.py` — read-only bounds, hinge, modifier and scene-hygiene gate.
- `scripts/export_approved_asset.py` — gated GLB export; refuses without matching approval.
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

## Reference sheets

`reference_sheet.py` cuts author-selected views out of a sheet and builds one new
reference `.blend`. It does **not** detect views, infer dimensions or decide that a sheet
is orthographic. Supply rectangles in sheet pixels (top-left origin), a shared origin
pixel per view, and at least one real distance:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/reference_sheet.py -- \
  --sheet path/to/sheet.jpg --views path/to/views.json \
  --out-dir .dev-shots/reference-sheet/raptor-001 \
  --prefix raptor --build .dev-shots/reference-sheet/raptor-001/references_001.blend \
  --new-scene
```

Inspect dimensions before writing rectangles:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/reference_sheet.py -- \
  --sheet path/to/sheet.jpg --inspect
```

`tools/asset-pipeline/examples/reference-views.example.json` is a generic schema example,
not calibrated coordinates for a real sheet. The first calibrated view is the scale
authority; every other calibrated view must agree within 0.5% or the tool refuses the
build. Views marked `visual` are cropped but never built as measurement planes. The
output manifest records the source/crop hashes, pixel rectangles, landmark points,
mm-per-pixel, world origin and resulting dimensions.

Reference planes use emission textures, `show_in_front`, locked transforms,
`hide_render` and a render-hidden `Reference` collection. They are viewport guides, not
renderable content. Temporarily showing them for a comparison capture is a diagnostic
state that must be restored. Keep third-party sheets in gitignored `inspiration/` or
`.dev-shots/`, and do not commit crops unless their rights are cleared.

## StableMaterials via ComfyUI (optional)

If you run ComfyUI with the `P5ina/comfyui-stable-materials` custom node and the
`gvecchio/StableMaterials` model, the shared runner can execute any exported
StableMaterials API workflow without adding another Python script per material set.
The user's local server in these trials is `http://192.168.1.190:8188`; pass
`--base-url` for another machine.

```bash
python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
  --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json \
  --base-url http://192.168.1.190:8188 \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-001
```

Validate the job and write the API graph without contacting ComfyUI:

```bash
python3 tools/asset-pipeline/scripts/run_comfy_workflow_stable_materials.py \
  --job tools/asset-pipeline/examples/laptop-plastics-aged.job.json \
  --out-dir .dev-shots/laptop-material-dry --dry-run
```

The job JSON supplies the template path, prompts, negative prompt, seeds, mode, steps,
size and output prefix. The runner infers the five `SaveImage` maps, refuses overwrite,
records the template hash, prompt IDs, downloaded map hashes and failures, and does not
start, restart, free or reconfigure ComfyUI. Raw maps are not a bake or game delivery.

StableMaterials colour drift is expected. Inspect the raw base colour and 3×3/offset
previews, record a colour-only review, then run the established bounded correction before
wiring it into Blender. Raw files and the normal/roughness/height/metallic channels are
left untouched:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase5/review_colour.py -- \
  --run-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-003 \
  --palette tools/asset-pipeline/examples/laptop-plastic-palette.json \
  --review .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-003/colour-review.json \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-003/corrected \
  --report .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/aged-plastic-003/colour-review-report.json
```

The review record is required. A correction applies bounded luminance modulation and
replaces chroma; it is not permission to hide a seam, stain, lighting or content defect.

Hardware note: earlier API attempts failed at `LoadStableMaterials` despite 15.77 GB
reported free. Subsequent UI history proves this same 16 GB server can run both loader
modes at 1024² with 4 generation steps and CFG 7.5. The laptop job now matches the
successful Standard-loader/4-step settings. The earlier loader failure's cause is
unresolved; it does not establish a larger-GPU requirement. Loader mode and generation
step count are separate settings. The runner does not clear cached models.

The reusable runner's pure checks:

```bash
python3 tools/asset-pipeline/tests/phase7/test_comfy_stable_materials_runner.py
```

## Qwen Image 2.1 image edit via ComfyUI (optional)

Sticker processing: `scripts/process_sticker_sheet.py` provides Blender-side
`process(raw_path, output_path, crops, saturation=1.0, contrast=1.0)`.
Crops are top-left pixel rectangles; output paths must be new. Extraction uses a
closed white die-cut border and fills enclosed shading, avoiding grey-key holes.
It is not a general background remover; binary-alpha edges require visual review.
Colour grading is optional, affects coloured artwork only, and preserves the raw PNG.
The laptop `_050` candidate uses saturation 1.5 / contrast 1.15; it remains pale
under the existing review lighting, so this is not a complete contrast fix.
Synthetic alpha and saved-colour controls run with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python-exit-code 1 --python tools/asset-pipeline/tests/phase7/test_sticker_processing.py
```

The official `image_qwen_image_2_1_image_edit` subgraph treats image 1 as the edit
canvas and images 2–10 as references. The shared runner drives it from a job JSON, so a
UV-guided sticker or texture set needs no new script. The API template is patched by node
class, not by node id.

```bash
python3 tools/asset-pipeline/scripts/run_comfy_workflow_qwen_image_edit.py \
  --job tools/asset-pipeline/examples/laptop-stickers-qwen.job.json \
  --base-url http://192.168.1.190:8188 \
  --out-dir .dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/materials/laptop-stickers-001
```

Validate the job and write the patched graph without contacting ComfyUI (`--dry-run`).
The job supplies the template, steps, CFG, reference resolution, seeds, filename prefix
and one entry per sample with an ordered image list; image 1 is the canvas. The runner
uploads images, records prompt IDs for successes *and* failures, scans every output node
for images, downloads and hashes them, and writes `run-manifest.json`. It does not start,
restart, free or reconfigure ComfyUI, and it does not start a prompt enhancer.

UV-guided generation does not place the artwork reliably on its own: the model's
position drifts and can leave a sprite under the trackpad or across a material boundary.
Treat the raw output as artwork, then composite it into the UV layout at explicit world
rectangles before wiring it into a material. Raw output is not a delivered texture.

```bash
python3 tools/asset-pipeline/tests/phase7/test_comfy_qwen_image_edit_runner.py
```

## Shape review

Camera names denote camera positions: front is −Y, right/side +X, top +Z, all
looking toward the target. Z is up in horizontal views. Front screen-right is +X;
right-view screen-right is +Y. This is not automatic reference-sheet registration.

Ledger entries require `kind: construction|repair` and `result: success|failure`
beside existing fields. Attempt numbers are unique within each criterion. Legacy
prose-only entries need explicit classification; text is never guessed. After seven
failed repairs, any further repair needs a `continuations` entry with `criterion`,
`approval` (user-decision reference), `hypothesis`, `scope`, `checks` and positive
integer `additional_attempts`. Every additional repair consumes that allowance;
history is never reset. Recorded approval is not authenticated permission. Diagnosis
after two unchanged failures and review at six remain procedural responsibilities.

`scripts/mesh_diagnostics.py` reports separate `base` and `evaluated` health.
Legacy flat fields are base-only. Signed volume is mesh-local Blender units cubed,
not world-space liquid capacity; open components have no reported volume. Evaluation
failures raise rather than substituting base results. This does not certify outward
normals, self-intersections or attachment fit. Its `boolean(target, cutter, op)`
adds an unapplied modifier and retains both operands. Callers manage visibility
and inspect the evaluated result; this changes the can-local helper's old
apply-and-delete behaviour deliberately.

Additional disposable fixture commands (never run these in the live scene):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/asset-pipeline/tests/phase7/test_mesh_diagnostics.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/asset-pipeline/tests/phase7/test_asset_capture.py
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python tools/asset-pipeline/tests/phase7/test_phase4_capture.py
```

Capture evidence goes under `.dev-shots/asset-pipeline/phase4-tool-repair/`.
`test_asset_capture.py` exercises the tracked helper with named reference objects,
successful and failed renders, invalid views and wire mode. It checks projection
orientation and restores world contents, materials, collections and visibility.
Set `CAN_HELPER` to an explicit can-local `cantools.py` path to additionally test
the ignored adapter; otherwise only tracked capture tooling is exercised.
Helper gates constrain their entry points, not arbitrary MCP Python.

Use staged captures during construction; do not run a multi-angle final render batch after
every edit. `capture_review.py` snapshots and restores render state, supports `solid`,
`material` and `final` presets, can isolate target meshes, refuses overwrites and writes a
hash-linked manifest. `check_shape_gate.py` checks bounds, hinge presence, editable modifiers
and whether a factory-startup 2 m cube remains in the scene.

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
  --hinge Asset_Hinge --stage silhouette
```

The gate is structural only; inspect the captures for silhouette and reference likeness.
Captures include a deterministic source fingerprint. `--review-manifest` rejects stale
captures after source edits. `--stage detail` requires a matching recorded silhouette
approval; record one only after inspecting the shape captures:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/check_shape_gate.py -- \
  --out .dev-shots/review/shape-gate.json --prefix Asset_ --stage silhouette \
  --review-manifest .dev-shots/review/asset_captures.json \
  --record-approval .dev-shots/review/silhouette-approval.json \
  --approved-by "your-name" --note "Reviewed front/side/top/three-quarter"
```

Export only through the approved path:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background asset.blend \
  --factory-startup --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/export_approved_asset.py -- \
  --root Asset_Root --glb out/asset.glb --report out/export.json \
  --approval .dev-shots/review/silhouette-approval.json \
  --construction-brief .dev-shots/review/construction-brief.json \
  --candidate-ledger .dev-shots/review/candidate-ledger.json \
  --evidence-report .dev-shots/review/evidence.json
```

The prototype builders save their source and intentionally block GLB export until
`--shape-approval` and construction brief/ledger/evidence inputs are supplied, or
`export_approved_asset.py` is used. The canonical exporter, office exporter and
detail/delivery shape gate require all four inputs, bind evidence to the current source
`.blend` and revalidate the capture manifests before writing. A missing, stale or swapped
construction report blocks the GLB.

Run the tooling self-tests with:

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_capture_review.py

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_interface_check.py

python3 tools/asset-pipeline/tests/phase7/test_construction_gate.py

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_export_guard.py
```

Approvals require a fresh review manifest with the default views
`front,side,top,three_quarter`; the gate stores manifest and capture hashes and
revalidates them for detail/delivery. A failed gate exits nonzero. Fingerprints cover
transforms, mesh/UV data, material graphs, modifiers, constraints and custom properties;
external image bytes, linked files and render-only state remain outside that coverage.

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

Reference-sheet checks:

```bash
python3 tools/asset-pipeline/tests/phase7/test_reference_sheet.py

/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/tests/phase7/test_reference_sheet_blender.py
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
- Phase 7A validates downsampling/orientation, source-hash and channel negatives, planar
  density and material-specific UV exports. Phase 7B adds a 108-island equipment case with
  clean topology, 5.57 px minimum padding at 512, validator/clean-import/preview passes and
  a density-review limitation. Phase 7C passes with a procedural 3D source baked to a
  six-island atlas: source-to-baked channels and 802 seam-pair samples pass, visual
  review found no island cuts, and density remains review. It does not establish
  arbitrary-asset support. Phase 7D adds a 24-part desk lamp accepted with density
  review. Phase 7E renders a mixed opaque/glass office corner with wallpaper,
  herringbone parquet, transmission glazing and an emissive fan/light; it is accepted
  with a 16.1 MB/58-call mixed delivery and 512/1024 variants retained.
- No compression variant, house modeling or game integration.
