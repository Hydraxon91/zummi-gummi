# Asset Pipeline Roadmap

Status: **Phase 3 implemented and verified**, with resource/density checks still advisory;
**Phase 4 crate material-zone trial implemented**; **Phase 5 pilot accepted** (8 candidates,
with corrected ceramic seed `20261021` rejected); **Phase 6 crate-only mapping trial
implemented and v4 512 px silver selected, with density still in review**; house/game
integration remains gated.
Date: 2026-10-20
Owner: Hydraxon

This is a separate roadmap for the Blender → AI-assisted materials → glTF delivery
pipeline. It does not replace the game roadmap in `ROADMAP.md`.

## Objective

Build reusable, engine-neutral asset tooling, with **Gummy Bears / three.js** as the
first delivery target. The tooling must support authored props, characters and
architecture without relying on Qwen to understand arbitrary UV layouts.

**Tools first.** The Frutiger Aero bubble house is the first intended architectural
asset; it is not the starting implementation task.

## Confirmed decisions

- Representative assets: the existing crate and one MSN buddy.
- MSN scope: export correctness and performance only, not texturing.
- Khronos **glTF-Validator is approved**, pinned, and kept outside runtime dependencies.
- Reuse existing Blender audit helpers, GLB inventory and headless screenshot tooling.
- Keep `uv-layout-extractor` focused on UV inspection and guide generation.
- Preserve editable Blender sources; perform destructive processing on copies.
- No game integration, loader changes, commits or pushes without the applicable approval.
- Budgets are provisional until representative scenes are measured.
- The first architectural style target is an original organic bubble house inspired by
  reference image 3.
- The bubble-house shell, glass and emission use procedural Blender materials unless a
  surface specifically needs painted detail. They are converted/baked to glTF-compatible
  PBR for delivery.
- Phases 4–5 are **optional for the house** unless painted detail is requested and approved.
- The spiral staircase is explicitly **deferred** from the first house.

## Reference and copyright policy

Reference image 3 is a night-lit, third-party architectural photograph. It is
**design inspiration only**.

- Do not use it as a Qwen image input.
- Do not use it as a projection source or texture reference.
- Do not copy its geometry, furnishings, lighting or distinctive composition literally.
- Do not commit it to the repository; `inspiration/` remains gitignored.
- The resulting house must be an original design that captures the general style:
  rounded white architecture, blue glazing, cyan light and organic openings.

## Evidence and limitations from the crate experiments

- Qwen can produce useful atlas textures, but does not reliably preserve exact island
  boundaries or associate designs with named islands.
- Manual crop/fill/compositing improved some results; those are **post-processed**, not
  pure-generation successes.
- Brightness-based “coverage” scores are diagnostic only: dark material features can be
  mistaken for gaps.
- Step count, prompt and encoder comparisons were not all controlled. We cannot attribute
  differences solely to one setting.
- Model reloading has not been established as the primary performance bottleneck; stage
  timings and memory evidence are needed.
- Polygon count alone does not determine the texturing strategy.
- Arbitrary island-count cutoffs should not become routing rules.
- Seamless prompting, physical PBR recovery and automatic removal of baked lighting are
  not proven capabilities.

---

# Tooling Phases

## Phase 1a — Profiles, provenance schema and read-only audit

**Goal:** establish explicit asset contracts and trustworthy core measurements before
generation, optimization or export.

### Deliverables

Versioned delivery profiles for:

- opaque props;
- transparent MSN buddies;
- mixed opaque/glass architecture (provisional, used by the house).

A read-only audit covering:

- units, axes, transforms and evaluated bounds;
- evaluated topology and export-relevant geometry counts;
- UV bounds, overlaps, degeneracy and island-size distribution;
- material slots, image dependencies and shader features;
- shared data, modifiers and unresolved dependencies;
- likely export limitations.

Profile fields should include:

- required material channels and supported extensions;
- near/far camera conditions;
- download-size reporting;
- estimated decoded texture and geometry GPU memory;
- material/draw-call counts;
- optional KTX2, Meshopt and Draco variants;
- performance-test conditions and acceptance state.

### Provenance record schema

Define the schema in this phase:

- schema version and asset ID;
- source/checkpoint paths and SHA-256 hashes;
- dimensions, units, axes and transforms;
- authorship, licence and reference rights;
- Blender and tool versions;
- model identities/hashes and ComfyUI workflow hash;
- prompts, negative prompts, seeds and generation settings;
- reference-image hashes;
- generation and processing durations;
- material, mapping, bake and export settings;
- output paths, hashes, sizes and inventories;
- verification results and evidence paths;
- warnings, limitations and acceptance status.

### Verification

- Known-good and deliberately failing fixtures.
- Coordinate/unit checks.
- Audit leaves source state unchanged.

### Risks

Modifiers, linked data and shader groups can exceed diagnostic coverage. Unknowns must
remain explicit.

### Effort

Approximately **1–2 hands-on days**.

### Deferred

Repairs, automatic routing, texturing and export.

### Decision gate

Approve profile/schema fields and representative assets. No generation or house modeling.

### Implementation (2026-10-20)

- Added `tools/asset-pipeline/` with profiles, JSON Schemas, provenance example,
  read-only Blender audit and validation/tests.
- Profiles: opaque prop, transparent MSN buddy, provisional mixed architecture.
- Audit composes existing project helpers plus UV island/overlap checks.
- Pure tests and a Blender fixture pass: valid cube, bad out-of-bounds UV/no material
  cube, and no-UV cube.
- Crate audit verified with and without the opaque profile; source SHA-256 is unchanged.
- Phase 1a did not include a texel-density policy, routing, export, Qwen generation or
  house modeling.

---

## Phase 1b — Texel-density policy and failing fixtures

**Goal:** make the audit’s density and failure diagnostics trustworthy before they are
used for routing or acceptance.

### Deliverables

- Texel-density policy derived from the approved closest camera, viewport resolution and
  projected surface size, including oblique views.
- A target density **range**, not a universal constant.
- Deliberately failing fixtures for:
  - invalid UVs and out-of-bounds coordinates;
  - degenerate faces and UVs;
  - inconsistent texel density;
  - missing or invalid material/image dependencies;
  - unsupported export features.
- Documented pass/fail/warning behavior for each diagnostic.

### Verification

- Good and bad fixtures produce the expected result.
- Measurements are validated against identifiable geometry.
- The audit does not silently convert uncertainty into a pass.

### Risks

A single diagnostic can be fooled by intentional overlaps or unusual but valid layouts.
The report must preserve uncertainty.

### Effort

Approximately **1 day** (combined Phase 1 effort: ~2–3 days).

### Decision gate

Approve density range, fixture coverage and warning semantics.

Approved 2026-10-20: advisory camera-derived defaults, per-material-zone consistency,
and review/unverified semantics. Blocking use requires later calibration.

### Implementation (2026-10-20)

- Added an advisory camera-projected density policy. An explicit camera is required;
  the scene camera is not assumed to be the closest intended view.
- Compares measured texture density with per-triangle projected screen density,
  including oblique surfaces, and reports directional UV anisotropy separately.
- Evaluates `1024²`, `2048²` and fixture-only `4096²` independently; no resolution is
  mandatory.
- Consistency is checked per material zone, with small triangles reported separately
  rather than discarded.
- Thresholds are advisory: ratio `1.0–2.0`, spread `p95/p05 > 2.0`, anisotropy
  `p95 > 1.5`.
- `no_active_uv` is now conditional on image-textured materials; untextured constant or
  procedural meshes do not warn.
- Export preflight distinguishes required missing images from unused/unconnected ones
  and flags UDIM/sequence/movie sources and zero-pixel images.
- Added pure policy tests and a failing Blender fixture covering under/over density,
  inconsistent density, anisotropy, missing/packed-missing/unsupported images,
  object-linked slots, unresolved groups, degenerate geometry and unverified density
  without a camera.
- Added `--camera` and `--fail-on {none,error,warning}`; default remains non-blocking.
- Crate audit verified with the explicit scene camera; source SHA-256 is unchanged.
- No export, validator, Qwen generation or house modeling yet.

---

## Phase 2 — Unified export-verification report

**Goal:** combine structural, visual and delivery checks without conflating them.

### Deliverables

One report containing:

- exact GLB hash and inventory;
- provenance linkage;
- pinned glTF-Validator version, options and results;
- clean-load, material and texture checks;
- inspected three.js captures;
- download bytes and decoded GPU-memory estimates;
- unresolved warnings and unsupported features.

### Validator policy

- Errors block delivery.
- Warnings and hints receive documented review.
- Passing establishes conformance, not appearance or universal extension support.

### Emissive-extension handling

- Check `KHR_materials_emissive_strength` support through Blender export, glTF-Validator
  and the pinned three.js `GLTFLoader`.
- Record the extension requirement in the profile and GLB inventory.
- If unsupported, use a documented fallback (standard emissive factor / tone-mapped
  emissive) and report the visual trade-off.
- Verify with a **day capture and a night capture** that distinguishes reflected/transmitted
  glass from emissive trim.

### Additional tooling

Evaluate `gltf-transform inspect` against existing inventory helpers. Add it only if it
fills a useful gap; do not introduce redundant dependencies automatically.

### Compression policy

KTX2, Meshopt and Draco are **optional measured variants**, not automatic defaults.
Include decoder/transcoder overhead, compatibility, visual effects and loading cost.
Loader changes require separate approval.

### Inputs/dependencies

Phase 1a/1b, approved validator provisioning and existing preview/capture tooling.

### Verification

Malformed fixture fails; valid fixture loads; missing maps and unsupported features are
surfaced; captures show the intended asset.

### Risks

Headless rendering is not identical to real-device rendering.

### Effort

Approximately **1–3 days**.

### Deferred

Automatic visual scoring and game registration.

### Decision gate

Approve warning dispositions and any preview-harness or loader changes.

Approved 2026-10-20: unified report, isolated pinned validator, disposable clean import
and a tool-only preview. No game loader or runtime changes.

### Implementation (2026-10-20)

- Added the versioned verification report contract and pure status/disposition helpers.
- Added `verify_asset.mjs` to combine node/Python inventories, validator results,
  dependency/profile checks, clean import, preview captures and resource notes.
- Pinned `gltf-validator@2.0.0-dev.3.10` behind an isolated provisioning script; no root
  `package.json`, game dependency or build step was added.
- Added a disposable factory-startup clean-import check. It excludes importer-only
  `glTF_not_exported`/custom-shape helpers from asset counts and bounds.
- Added a standalone three.js `0.186.1` preview with stock `GLTFLoader`, fixed day/night
  views, shader/resource diagnostics, material/extension inventory and hash-linked PNG
  captures.
- Verified `KHR_materials_emissive_strength` through the validator, preview and an
  original emissive fixture; no fallback is applied automatically.
- Added synthetic valid, malformed, invalid-accessor, external-dependency and
  unsupported-extension GLBs. Valid/emissive/normal paths pass; malformed and invalid
  paths fail; missing evidence remains unverified.
- Did not add `gltf-transform inspect`; the existing node/Python inventories cover the
  current fields. Add it only if a demonstrated gap appears.
- Verified the existing MSN GLB with manifest, provenance, clean import and eight
  day/night captures. A hash-linked visual review records the inspected captures;
  the disposition remains `review` because validator warnings and resource estimates
  are not a clean pass.
- No compression variant, loader change, production asset edit or game integration.

---

## Phase 3 — Thin end-to-end slice, curved-surface test and MSN baseline

**Goal:** prove delivery before investing in AI generation.

### Deliverables: crate slice

Use the existing crate with placeholder/checker textures:

**Blender source → bake if necessary → GLB → provenance → validator → three.js preview → near/far captures.**

### Deliverables: curved-surface UV/bake test

Add a simple curved test asset — for example, a rounded shell patch or cylinder with a
UV seam — to exercise:

- UV distortion and seam placement on a curved surface;
- texel-density variation under perspective;
- bake projection and padding;
- normal/roughness/albedo behavior on a curved shell;
- whether the crate’s flat faces gave false confidence.

This is a test asset, not house construction.

### Verification

- Correct scale, orientation and normals.
- UV orientation, seams and padding; curved-surface distortion inspected.
- Self-contained image/material loading.
- Structural validity.
- Visible destination material.
- Reproducibility from the recorded source.

### MSN export/performance baseline

Inspect the existing buddy’s actual material implementation:

- alpha blending versus transmission;
- double-sided behavior;
- overlapping transparent objects;
- sorting and overdraw;
- bright/dark backgrounds and near/far views.

Do not switch between alpha blending and transmission as an unapproved optimization.

### Performance policy

- Headless timings support **relative comparisons only**.
- Add a hardware-accelerated browser check on the Mac when GPU timing is required; the
  ComfyUI PC is not a render target.
- Record viewport, DPR, renderer settings and representative instance counts.
- Distinguish standalone preview verification from full-game integration.

### Inputs/dependencies

Phases 1a/1b–2, crate, curved test asset and MSN source.

### Risks

A standalone asset preview does not establish full-game cost. A clean flat cube does not
prove curved-surface baking.

### Effort

Approximately **2–4 days** including the curved test and MSN checks.

### Deferred

Qwen, advanced materials, compression optimization and game integration.

### Decision gate

Approve captures, curved-surface results and intended instance counts. Blender, bakes and
browser verification stay on the Mac; the RX 9070 XT PC is reserved for ComfyUI generation.

### Implementation (2026-10-20)

- Built a new crate checkpoint with an asymmetric 1024² checker, embedded it in a
  self-contained GLB, generated manifest/provenance, and verified it through validator,
  clean import, preview and all-side captures. Source hash remains unchanged.
- Built a 1 m diameter × 1 m high cylinder fixture with a deliberate UV seam, a preserved
  n-gon source, a triangulated low for both baking and export, a beveled high copy, and
  baked 1024²/2048² albedo, roughness and tangent-space normal maps. Both GLBs pass the
  validator with no warnings.
- Diagnosed the earlier “faint seam” as flat shading plus environment specular. The mesh is
  closed and manifold with no loose vertices, no coincident-vertex groups, no custom
  normals and a zero-normal-delta longitudinal seam. Smooth-by-angle shading and
  front-face culling remove the faceting; flat-colour seam diagnostics are clean.
- Added bake channel checks and negative controls. Albedo/roughness re-sampled errors are
  below threshold at both resolutions; colours spaces and normal reference hashes are
  checked. The source→baked→exported path is matched at the UV samples and at the decoded
  GLB images (albedo/roughness/normal MAE `0.0`). A blue-flipped normal is rejected for
  negative tangent-space Z, and a normal image treated as sRGB is rejected for the wrong
  data colour space.
- Added UV-island connectivity and segment-distance padding checks. The 3-island layout
  has a minimum inter-island gap of `0.054574` UV (55.88 px at 1024², 111.77 px at
  2048²), separate from the image-border margin.
- Scaled bake margins to 16 px at 1024² and 32 px at 2048² so padding no longer fills the
  image edge. The 1024² texture now has a clean black border; the 2048² texture is clean.
- Reproducibility: crate and curved GLBs are byte-identical across independent builds;
  only `.blend` container hashes differ. Geometry, UVs, channel hashes and inventories
  match.
- Density review: the crate is under target at 1024² and mixed at 2048²; the curved
  cylinder shows side/cap density spread and seam anisotropy. Thresholds remain advisory.
- MSN baseline: existing GLB only, headless at 1920×1080 DPR 1, with 1/8/32
  shared-geometry instances, checker backgrounds and day/night views. Geometry
  deduplicates to 3, material to 1, and skeleton counts are 1/22/94. Skeleton independence
  is checked directly: every instance has its own skeletons and no skeleton UUID or bone
  UUID is shared across instances. Transmission, overlap and sorting remain visual review
  items; the three `NODE_SKINNED_MESH_NON_ROOT` validator warnings remain open.
- Browser timings are headless CPU-submission/relative only; no GPU completion or
  full-game FPS is claimed. The RX 9070 XT is ComfyUI-only, not a render target.
- Resource estimates now deduplicate accessor/image storage ranges and separate encoded
  image bytes from decoded RGBA estimates.
- Phase 2 evidence handling was tightened: visual review hashes are required, empty
  captures cannot pass, explicit camera settings are recorded, and decoded texture
  estimates are reported.
- No compression variant, loader change, production asset edit or game integration.

---

## Phase 4 — Manual material zones (optional for the house)

**Goal:** provide explicit, reviewable material intent.

### Deliverables

- Blender material slots and polygon material assignments.
- Zone previews and assignment validation.
- Mapping recommendations.
- Connection to audit and provenance.

**Do not introduce custom face-mapping storage as the primary zone system.**

### House applicability

Optional. The house shell, glass, trim and emission use ordinary procedural Blender
materials. Material-zone generation is only needed if a surface requires painted detail
or if a complex multi-material export benefits from explicit zone review.

### Inputs/dependencies

Audited opaque asset and approved palette. Develop on the crate before applying to
architecture.

### Verification

Valid slot indices, intended face coverage, evaluated/export assignment preservation and
multi-angle inspection.

### Risks

Joining meshes and modifiers can alter material-slot behavior.

### Effort

Approximately **1–2 days** plus per-asset review.

### Deferred

Automatic segmentation and semantic naming.

### Implementation (2026-10-20)

- Opened the accepted Phase 3 crate checkpoint read-only and wrote a new
  `crate_zones_001.blend` / `.glb` pair. Geometry, UVs, dimensions and the source
  checkpoint hash are unchanged.
- Used ordinary Blender material slots: slot 0 keeps the existing checker
  `Crate_Pilot_Mat` on 48 bevel/edge faces; slot 1 adds `Crate_Main_Mat` on the 6 planar
  main faces. No custom face-map storage or runtime system was introduced.
- Validated zone coverage and export preservation: 54 polygons / 108 triangles total,
  6 main polygons (12 triangles) and 48 edge polygons (96 triangles). The GLB contains two
  materials and two primitives with those exact counts.
- Checked the exported surfaces, not only the counts: all 12 main triangles are
  axis-aligned and touch one bounding-box face; none of the 96 edge triangles are
  axis-aligned and all touch at least two bounding-box faces.
- Evaluated slot/mesh checks pass: two valid non-empty slots, all polygon indices valid,
  no zone mismatches, 0 loose vertices, 0 non-manifold edges and 0 flipped faces.
- A deliberately invalid bevel-to-main assignment is rejected by both the Blender mesh
  check (`zone_mismatches [0]`) and the export check (`mainSurface false`, main 14
  triangles, edge 94); both negative controls exit non-zero.
- Validator passes with zero errors/warnings; one informational `UNUSED_OBJECT` for
  `TEXCOORD_0` on the untextured main primitive remains. Clean import, preview and
  hash-linked visual review pass. Resource estimates remain advisory.
- A second independent build produced the same zone GLB hash and the same geometry/UV
  fingerprints; only the `.blend` container differs.
- Crate-only trial. No house geometry, palette, UV, loader, game registry or runtime
  integration changed.

### Decision gate

Crate trial ready for review; house zone boundaries and material intent still require a
separate approval before applying this to architecture.

---

## Phase 5 — Reusable AI-generated materials (optional for the house)

**Goal:** generate reusable material candidates with reproducible settings and verified
tiling.

### Deliverables

- ComfyUI API workflow and recorded settings;
- source/reference provenance;
- material candidates;
- offset and repeated-tile previews;
- generation and cleanup timings.

Use ordinary Blender materials when clean color, glass or emission is sufficient.

### House applicability

Optional. Qwen Image 2.1, StableMaterials or another approved material model is used
only for a specifically justified painted detail or surface graphic. The shell, glazing,
cyan trim and emission remain procedural source materials, then converted for glTF.

### Proposed numeric pilot criteria

Approve these before execution:

- Test **3 material types × 3 seeds** at 1024.
- At least **2 of 3 candidates per material** pass visual review.
- Accepted files decode at exactly the requested dimensions.
- Zero visible labels or watermarks.
- Inspect **3×3 tiling and 50% offset previews**.
- Zero visible boundary seams at intended close-up scale.
- Provisional seam diagnostic: boundary discontinuity no greater than **1.5× comparable
  interior transitions**, validated on known-good/bad fixtures first.
- Metrics cannot override failed visual inspection.
- Provisional time targets: **≤5 minutes generation per 1024 candidate** and **≤10 minutes
  cleanup per accepted material**.

### Inputs/dependencies

Phase 4, rights-cleared style references, working ComfyUI and approved compute budget.

### Verification

Inspect tile continuity, material scale, style consistency and obvious baked lighting.

### Risks

Material models do not guarantee tiling or prompt colour. Image statistics cannot
certify shadow-free physical albedo. A colour correction can preserve texture detail
while still leaving non-colour defects; those require separate review.

### Effort

Approximately **2–4 days** plus generation.

### Deferred

Automatic delighting and physically correct PBR recovery.

### Decision gate

Approved 2026-10-20: palette, teal 3/3, ceramic 2/3 and silver 3/3. Ceramic seed
`20261021` remains rejected; residual mottling and weak brushed direction are accepted
for this pilot.

### Implementation (2026-10-20)

- Added StableMaterials Standard **50-step** generation at native **1024²**. The local
  node was patched to expose `width`/`height`; 2048² exceeds the 16 GB card and is out of
  scope. Nine native 1024 candidates (3 materials × 3 seeds) completed sequentially at
  about 15 seconds each with no repeat of the earlier AIMDO cache-cleanup crash.
- StableMaterials follows surface detail and tiling more reliably than prompt colour.
  Raw teal, ceramic and silver samples all missed their target palettes; all nine were
  corrected after the sRGB/orientation check.
- Added a bounded **review → script correction** loop: structured appearance/colour
  findings are separated into colour-only failures and non-colour failures. A
  deterministic script applies bounded luminance modulation, replaces chroma with the
  approved target, writes a new file and rechecks the colour delta and vertical
  orientation. Raw maps are never overwritten; normal/height/roughness/metallic remain
  unchanged and still require their own verification.
- Approved colour targets: teal `#2FA7A0`, ceramic `#E8E1D4`, silver `#B9BEC2`.
  Corrected means are within `0.012` RGB of target. This is labelled
  **AI/agent-reviewed, script-corrected**, not pure-generation evidence.
- A colour/orientation fixture established that Blender exposes byte-image pixels as
  sRGB values in bottom-up rows; corrected PNG rows are flipped to top-down. The
  corrected-to-source luminance correlation remains above `0.98` with direct
  correlation, and below `0.18` when vertically flipped.
- Corrected seam review: **8/9 pass** the self-validated `1.5` threshold; the ceramic
  seed `20261021` fails at `1.581` and shows visible tile boundaries after correction.
  It is rejected rather than accepted. The raw sample had passed the metric, so this is
  a correction side effect and a reminder that statistics do not replace inspection.
- 3×3 tiling and 50% offset previews were generated. Raw/corrected PBR sphere renders
  show the intended colour shift, but residual mottling and repetition remain
  visual-review items; no material is accepted.
- SDXL with `SeamlessTile` + `MakeCircularVAE` generated at 1024², but the first seed
  contained an unwanted object. It remains a comparison path, not an accepted result.
- No house geometry, procedural palette, game loader or runtime integration changed.

---

## Phase 6 — Mapping, baking and GLB delivery

**Goal:** convert reviewed materials into faithful, reproducible web assets.

### Deliverables

- editable Blender material/mapping setup;
- UV or object-space mapping where suitable;
- required baked texture channels;
- self-contained GLB;
- provenance and asset manifest;
- unified verification report.

### House applicability

Required even when the house uses procedural source materials: glTF does not transfer
Blender procedural graphs directly. Convert/bake the shell, glass, trim and emission to
compatible PBR channels on an export copy.

### Verification

- matched source-versus-bake captures;
- correct color spaces, channel packing and normal convention;
- seams, padding and mip behavior;
- camera-derived texture density;
- near/far inspection;
- clean import and validator;
- three.js rendering checks on the Mac; GPU timing only when measured;
- day/night captures distinguishing glass and emission.

### Web delivery experiments

Compare baseline against justified compression variants:

- transferred bytes;
- loading/decode cost;
- decoded GPU memory;
- visible artifacts;
- extension and loader requirements.

### Risks

Triplanar axis blends, curved-surface stretching, bake errors and compression artifacts.
Albedo-derived height/roughness is an artistic approximation, not recovered physical truth.

### Effort

Approximately **3–6 days** plus per-asset work.

### Deferred

Automatic game integration and silent shader simplification.

### Implementation (2026-10-20, crate-only trial)

- Generated crate-specific StableMaterials at 1024², seed `20261020`: teal painted
  shell and silver trim, both colour-corrected to the approved palette. Teal's
  generated metallic map was treated as constant `0.0` because it is a painted coating;
  silver keeps its metallic map. This simplification is recorded in the build report.
- Normalized the six crate UV islands independently to 0–1 so each face samples the same
  tileable texture. Geometry, transforms and dimensions are unchanged; UVs are
  intentionally overlapping for repeated mapping. The audit reports that intentional
  overlap plus an unverified camera-density warning.
- Built `crate_phase6_001.blend` / `.glb` with two materials, two primitives, 108
  triangles and six embedded 1024² images. Validator passes with zero errors/warnings;
  clean import, preview and hash-linked visual review pass. Resource estimates remain
  advisory.
- Embedded base colour, normal, packed roughness and packed metallic channels match the
  source maps with **MAE 0.0**; the base-colour sampler repeats. Teal metallic is
  constant zero through `metallicFactor: 0.0`.
- Camera-projected density is a **review finding**, not a pass. At a 3.0 m front view /
  1024, the silver trim p95 is `4.813` and the teal zone has only two samples
  (`unverified`, minimum four). At 3.2 m three-quarter, silver p05/p95 is
  `0.893` / `4.276`, and teal still has three samples. At 2048 the silver p95 rises to
  `9.626` / `8.552`, so resolution alone is not a fix. The 1.0–2.0 target remains
  advisory and view-dependent.
- Selected the 512 px silver candidate (`crate-delivery-v4-512silver`) on 2026-10-20,
  recorded in `tools/asset-pipeline/tests/phase6/selection.json`; v3 remains the
  baseline. Silver base colour, normal, roughness and metallic are downsampled;
  normal vectors are renormalised. The GLB falls from `6,281,824` to `4,091,852` bytes
  (−34.9%) and decoded texture estimate from `25,165,824` to `15,728,640` bytes
  (−37.5%). Embedded channels still match the 512 sources with **MAE 0.0**; close-up
  grain remains visible and far/seam captures stay clean. Silver density improves from
  p95 `4.813` / `4.276` to `2.407` / `2.138` at 512, but remains above the advisory
  `2.0` ceiling and its p05 falls below `1.0`, so density is still **review**.
- Tested two further candidates. `crate-delivery-v5-256silver` uses 256 px silver maps:
  `3,445,652` bytes, p95 `1.203` / `1.069`, but visibly softer bevel grain and a median
  of `0.519` / `0.435`. `crate-delivery-v6-512silver-trimuv` keeps 512 px silver maps
  and adds `UVMap_Silver`, scaled to `0.8`, used only by the silver material
  (`TEXCOORD_1`): `4,093,332` bytes, p95 `1.925` / `1.710`, median `0.831` / `0.696`.
  V6 is the only candidate with p95 inside the advisory ceiling while retaining 512
  detail, but its median/p05 fall below the advisory floor and it adds a second UV set.
  The validator reports two `UNUSED_OBJECT` infos for the per-primitive UV attributes
  (`TEXCOORD_0` on silver, `TEXCOORD_1` on teal), with zero errors/warnings. V4 is the
  selected candidate; V5 is rejected for visible softness; V6 is retained as a density
  experiment. No candidate satisfies both p05 >= 1.0 and p95 <= 2.0.
- Close-up (1.3 m, `margin 0.45`) and far (9.15 m, `farFactor 3.2`) day/night captures
  show no clamp border, hard texture seam or visible mip bleed. Inter-island atlas
  padding is not applicable because the six islands intentionally overlap; the UVs keep
  a 0.005 texture-edge margin.
- Rejected two earlier iterations: the original atlas UV mapping produced different face
  colours, and the normalized version with the white teal metallic map was too reflective.
- No additional bake was performed because the source materials are already image-based.
  This trial validates direct mapping, export channel packing and GLB delivery, not bake
  fidelity.
- No house geometry, loader, species registry, asset catalog or game integration changed.

### Delivery-resolution rule for future assets (selected 2026-10-20)

- Preserve high-resolution generated source maps; deliver a separate evaluated copy.
- Choose delivery resolution **per material** using the closest intended gameplay views,
  not one global resolution for the whole asset.
- Prefer the simplest UV/material setup that preserves the accepted appearance.
- Validate base colour, normal, roughness, metallic, seams, tiling and mip behaviour after
  downsampling; density ranges are guidance, not a score to optimize against visual quality.
- Keep the unselected candidates and their evidence when they explain a rejected tradeoff.

### Decision gate

V4 is selected for the crate. Density remains a reviewed limitation, not an accepted pass.
House application and game integration remain separately gated.

---

## Phase 7 — Harder benchmarks and generalization

**Goal:** test assumptions beyond the six-island crate.

### Deliverables

Benchmarks covering:

- many-island hard surface;
- curved/organic geometry;
- multi-material assembly;
- mixed opaque/glass architecture.

Document supported and experimental cases.

### House role

The bubble house becomes the first real architectural trial once the tooling foundation
is validated. Its modeling is a separately approved task.

### Inputs/dependencies

Validated earlier phases and approved benchmark assets.

### Verification

Run the complete pipeline; inspect relevant surfaces; record manual intervention,
generation time, export correctness and web-delivery cost.

### Risks

One successful asset does not establish arbitrary-object support.

### Effort

Approximately **3–6 days**, excluding major asset authoring.

### Deferred

Automatic routing until benchmarks justify rules.

### Decision gate

Approve benchmark sources and acceptance results.

---

## Phase 8 — Optional expansion

Each option begins with a feasibility experiment and separate approval.

| Option | Deliverables | Verification / main risk | Rough effort |
| --- | --- | --- | --- |
| Projection texturing | Camera-linked edits, visibility-aware projection and bake | Cross-view consistency, occlusion coverage and seams | 1–2+ weeks |
| Automatic segmentation | Proposed Blender material assignments | Face-grounded review; hidden surfaces remain uncertain | 1–2+ weeks |
| UDIM authoring | Multi-tile source workflow and supported delivery conversion | Tile correspondence, missing maps and destination compatibility | 3–7 days |
| Other engine profiles | Destination-specific export/QA adapters | Actual destination renderer validation | 2–5 days each |

Standard glTF delivery must not assume native UDIM support.

---

# First Architectural Asset: Frutiger Aero Bubble House

## Role in the project

An original architectural asset inspired primarily by **reference image 3**. It
exercises rounded geometry, mixed materials, glazing and day/night appearance.

**Do not begin construction before the tooling foundation is validated.**

## Proposed scope

Exterior-only, with shallow interior backing behind windows — not furnished rooms.

### Design direction

- flowing pearl-white shell;
- asymmetrical two-storey composition;
- upper rounded pod and curved balcony;
- large horizontal oval window;
- recessed entrance;
- circular portholes;
- blue glazing, cyan surrounds and restrained emission;
- pale metallic rails.

### Provisional dimensions

Approximately **8 m wide × 6 m deep × 6 m tall**.

These are proposed design dimensions, not calibrated measurements from the perspective
image. Confirm scale against Gummy Bears before modeling.

### Material strategy

- shell and trim: parameterized procedural Blender materials;
- glazing: separately evaluated alpha/transmission approach;
- cyan accents: emission verified without assuming bloom;
- Qwen only for specifically justified graphics or surface details;
- no baked reflections or shadows in albedo;
- convert/bake procedural source materials for GLB delivery.

## House authoring stages

### A. Inspect and checkpoint

Inspect live Blender state, preserve unrelated work and establish new incremental
checkpoints.

**Gate:** approved source, collection and destination paths.

### B. Blockout

Build lower volume, upper pod, balcony and canopy with editable geometry/modifiers.

**Evidence:** front/back, both sides, top and three-quarter captures.

**Gate:** approve silhouette, proportions and entrance arrangement.

### C. Shell and openings

Construct wall thickness, actual window/door openings and deep reveals. Preserve cutters
and editable sources.

**Gate:** topology health, complete rear/side construction, sound joins and clearances.

### D. Glazing and trim

Fit panes to opening rims; add portholes, cyan surrounds and balcony rails.

Test one representative window before replication.

**Gate:** no floating trim, visible gaps or excessive penetration; approve glazing
behavior.

### E. Placeholder GLB trial

Use the established export-verification pipeline with simple materials.

**Gate:** correct scale, normals, material slots, self-contained loading and validator
pass.

### F. Materials and UVs

Refine materials, unwrap where required and bake unsupported appearance on an export copy.

**Gate:** camera-derived density, seams/padding, matched source/export appearance.

### G. Web delivery verification

Inspect close/distant day/night views and transparent overlaps. Report bytes, GPU-memory
estimates, materials and geometry. Include a night capture that distinguishes glass from
emission.

**Gate:** inspected captures, validator, clean import and a documented Mac browser check;
GPU timing is reported only when actually measured.

## Explicitly deferred from the first house

- furnished interiors;
- spiral staircase;
- aquarium contents;
- animated bubbles;
- landscaping set;
- extensive transmission effects;
- game registration and placement;
- automatic collision/navigation integration.

## Effort

Approximately **4–7 hands-on days after tooling is ready**, subject to blockout and
construction reviews.

## Approval boundaries

Pause after blockout, shell construction and materials. Modeling approval does not
authorize game integration, dependency changes, commits or pushes.

---

# Approval gates and deferred work

- **Phase 4** is implemented for the crate only; house application remains a separate
  decision.
- **Phase 5** is accepted; corrected ceramic seed `20261021` remains rejected.
- **Phase 6** selected v4 512 px silver for the crate; channels are verified and density
  remains a reviewed limitation. House application and game integration remain separate
  decisions.
- No house modeling or game integration at this stage.
- No commit or push without explicit approval.
- Validator provisioning is approved; loader/runtime changes remain separate.
- Compression variants, automatic segmentation, projection texturing and UDIM are
  separately approved experiments.
- The night-lit reference photograph remains design inspiration only.

## Next action

Phase 3 is implemented under `tools/asset-pipeline/tests/phase3/`; the crate-only Phase 4
trial is under `tools/asset-pipeline/tests/phase4/`; the Phase 5 pilot is accepted under
`tools/asset-pipeline/tests/phase5/`; the Phase 6 crate delivery trial is under
`tools/asset-pipeline/tests/phase6/`. V4 512 px silver is selected; embedded channels
pass with MAE 0.0 and density remains a reviewed limitation. V5 (256) is softer; V6
(512 + independent trim UV 0.8) is retained as a density experiment. Review
`selection.json`, `candidate-comparison.json`, close-ups, density audits and verification
evidence. House application and game integration remain separately gated.

Density thresholds remain advisory; no compression variant, loader change or house
modeling has started.
