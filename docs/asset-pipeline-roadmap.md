# Asset Pipeline Roadmap

Status: **Phase 2 implemented**; Phase 3 next.
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
- Add a real-GPU browser check on an agreed machine.
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

Approve captures, curved-surface results, intended instance counts and real-GPU test
environment.

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

### Decision gate

Approve zone boundaries and material intent.

---

## Phase 5 — Reusable Qwen albedo materials (optional for the house)

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

Optional. Qwen is used only for a specifically justified painted detail or surface
graphic. The shell, glazing, cyan trim and emission remain procedural source materials,
then converted for glTF.

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

Qwen does not guarantee tiling. Image statistics cannot certify shadow-free physical
albedo.

### Effort

Approximately **2–4 days** plus generation.

### Deferred

Automatic delighting and physically correct PBR recovery.

### Decision gate

Approve style, pilot thresholds and acceptable intervention time.

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
- three.js rendering and real-GPU checks;
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

### Decision gate

Approve material fidelity, simplifications, delivery budgets and integration scope.

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

**Gate:** inspected captures, validator, clean import and real-GPU check.

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

- **Phase 3** is the next implementation step.
- No house modeling, Qwen generation or game integration at this stage.
- No commit or push without explicit approval.
- Validator provisioning is approved; loader/runtime changes remain separate.
- Compression variants, automatic segmentation, projection texturing and UDIM are
  separately approved experiments.
- The night-lit reference photograph remains design inspiration only.

## Next action

Phase 2 is implemented under `tools/asset-pipeline/`. Begin **Phase 3** next:
the crate end-to-end slice, curved-surface UV/bake test and MSN baseline.

Density thresholds remain advisory; no compression variant, loader change, generation
or house modeling has started.
