---
name: gummy-3d-authoring
description: Create, edit, calibrate, inspect and export Blender assets (3D models, meshes, props, vehicles, characters, GLB files) for Gummy Bears using Blender MCP, with reference-image matching, PBR materials, UVs, texture baking, Geometry Nodes, editable source preservation and multi-angle verification. Use whenever the task involves Blender, MCP for Blender, a 3D model or mesh, materials, textures, baking, geometry nodes, blueprint/reference images, mesh cleanup, or GLB export, even if the user does not name this skill. Asset work does not authorize game integration.
---

# Gummy 3D Authoring

Read the repository's `AGENTS.md`: Agent Behavioral Rules, Destructive Actions, Commits and
Pushes, Tool-Call Discipline, Visual Verification and 3D Asset Authoring. Follow its approval
gates. No game integration unless separately in scope. Repository paths below are relative to
the project root, not this skill directory.

This procedure applies to any Blender asset in the project, not only bears. Character and
species-variant rig/export notes are in "Character and variant authoring" and
"Deformation and export".

Last reviewed: 2026-10-21. Update this line when the commands, scripts or delivery
contract below materially change; `AGENTS.md` remains the policy source.

## Default authoring workflow: live MCP first

Use live Blender MCP as the primary shape-authoring workflow. MCP can execute Python;
the distinction is visually guided, incremental modeling versus blind batch generation,
not Python versus Blender. Choose construction from the requested form and references,
not from whichever existing builder or prototype happens to be available.

1. Inspect the live scene, unsaved state and references; agree on scope, construction,
   dimensions, axes and acceptance criteria before editing.
2. Establish a recoverable checkpoint. Build an editable primary form with small scoped
   changes through MCP: inspect with `look`, edit, then inspect again.
3. Review the silhouette, contact and major sections in neutral multi-angle views and
   obtain silhouette approval before detail or material polish.
4. Add details, UVs and materials only as needed for the approved outcome. Continue
   inspecting affected areas and preserve unrelated geometry and placement.
5. Check mesh health and inspect final multi-angle captures. Numerical checks support
   visual judgment; successful scripts and populated reports do not establish likeness.
6. Bake, export or integrate only when separately in scope; report each delivery state.

Python is appropriate for scoped modeling operations, repetition, measurement, diagnostics,
captures and export. It must not replace inspecting form changes or repeatedly regenerate
the whole asset to avoid looking. Live MCP can also run checks and capture views; headless
Blender is optional, not a prerequisite for verification. Procedural construction is an
explicit method choice to justify and test, not the default for every asset.

For soft goods, prefer an editable quad cage with broad contact, controlled subdivision,
deformation and folds. Test the seat/contact transition first: subtracting a cavity from
a smooth primitive can read as a rigid bowl rather than a yielding fabric form.

## Optional workflows and tools

Load focused references only when the task needs them. Asset-specific trial histories,
revision status and benchmark numbers belong in project reports, not general authoring
instructions. A historical builder is neither a required starting point nor proof that
its construction method suits a new asset.

The experimental unified entry point is `tools/asset-pipeline/pipeline.py`, driven
by JSON jobs (inspect/uv/bake/hybrid/check/render/export/verify). See the pipeline
README for exact supported graph patterns and limitations. `hybrid` keeps source
parts/material classes and combines dedicated panel bakes with repeated UV image
sampling for plain plastics; it is not general shader conversion. Export still
delegates to the existing approval gate. New generic regression fixtures live in
`tools/asset-pipeline/fixtures/`; old phase scripts stay in `tests/`.
Vertex-distance preservation and an inspected Blender candidate are not clean-import
or destination-engine verification. Inherited zero-area geometry remains a delivery
finding, not permission to change a protected source or waive acceptance.

For shared-atlas delivery copies, selectable atlas/guide resolutions and staged publication,
follow [references/atlas-delivery.md](references/atlas-delivery.md). Existing source UVs and
materials stay protected; failed unwraps are diagnostics, not accepted deliveries. The default
generation guide is 1280²; resolution changes do not authorize a different UV layout.

For a paint template or UV wireframe delivery, follow
[references/uv-template-delivery.md](references/uv-template-delivery.md): decode saved images,
record the exact source/UV fingerprint and inspect a same-resolution albedo overlay. A PNG
header or old filename is not evidence that a guide is valid or current.
For island ids, zone/id maps, per-island masks and label manifests, follow
[references/uv-island-export.md](references/uv-island-export.md): render per object, never
merge separate UV spaces, and never invent island part names.

For automatic semantic-naming experiments, use
[references/semantic-uv-prototype.md](references/semantic-uv-prototype.md). The prototype
prepares multi-view, face-grounded evidence and sampled shell pairing; its 24-island vehicle
development benchmark is not a general naming guarantee or an unattended vision service.
For same-asset held-out checks, `scripts/uv_semantic_holdout.py` separates prediction freezing,
numbered capture and scoring; `scripts/test_uv_holdout.py` tests scoring in plain Python.
Keep failed holdout results and do not retune or relabel them into a reported pass.

Additional tools: `scripts/png_report.py` (read-only structural check),
`scripts/test_png_report.py` (pure Python fixtures), `scripts/uv_template_export.py`
(approved background export of template/layer/overlay/manifest) and
`scripts/uv_island_export.py` (per-object id/zone maps, labelled overlay, island manifest
and binary masks with dilation; deterministic ids, non-zero exit on failed validation) and
`scripts/uv_label_review.py` (numbered review sheet plus a proposed-name JSON template; a human
must review it before `--names` is used). Project-local `tools/asset-pipeline/scripts/capture_review.py`
provides staged solid/material/final captures with render-state restoration,
`check_evidence.py` validates pose/frame/hash/fingerprint evidence, `check_interface.py` is an
experimental local signed-surface diagnostic, `construction_gate.py` validates brief/ledger
and source-bound evidence (required by detail/delivery and delivery exporters), `check_shape_gate.py` is a read-only bounds, hinge, modifier and default-scene hygiene
gate, and `export_approved_asset.py` is the gated GLB export entry point.
`reference_sheet.py` crops explicit view rectangles, enforces one shared scale and builds
locked, render-hidden reference planes; it does not detect views or infer dimensions.
`run_comfy_workflow_qwen_image_edit.py` runs job-driven Qwen Image 2.1 image-edit jobs
(UV template as image 1, references after it) against the ComfyUI HTTP API;
`run_comfy_workflow_stable_materials.py` does the same for StableMaterials map sets. Both
are dry-runnable and write a manifest; neither starts or reconfigures ComfyUI.

For requested export verification, use
`tools/asset-pipeline/scripts/verify_asset.mjs` with the workflow in
`tools/asset-pipeline/README.md`. It links node/Python GLB inventories, the pinned
Khronos validator, a disposable clean import and a standalone three.js preview. Validator
conformance, preview compatibility and human visual inspection remain separate claims;
the preview does not modify the game loader or authorize integration.

Fixture passes establish only their tested scope, not arbitrary-asset support or user
acceptance. Preserve high-resolution material sources and choose delivery resolution
from the closest intended views. Atlas size reductions do not prove adequate texel
density, and a successful bake does not prove faithful transfer of every channel.

For the standalone UV sheet renderer, gate and optional per-chart repair workflow, follow
[references/uv-layout-extractor.md](references/uv-layout-extractor.md). Those tools are
external and do not authorize game integration, material transfer or a bake.
The local line-guide CLI accepts `--placements` for explicit reviewed UV rectangles,
per-placement masks and source-object affine mappings; see its README. Raster island
coverage does not establish obstacle clearance. `tools/asset-pipeline/scripts/
process_sticker_sheet.py` supports closed-white-border sticker extraction and optional
colour grading, with saved-colour/alpha fixtures in `test_sticker_processing.py`.
It is not general segmentation; binary-alpha edges still need close-up visual review.

Read [references/asset-workflows.md](references/asset-workflows.md) for hard-surface
modifier/shading choices, UV preparation, asset budgets and the local reporting tools.
Load the focused references when the task needs them:

- [references/assembly-verification.md](references/assembly-verification.md): mandatory
  acceptance loop for assembly edits, structural completeness, connections, neighboring
  clearances and protected-surface preservation. Apply before calling a stage verified.
- [references/pbr-materials.md](references/pbr-materials.md): Principled values, color
  spaces, ORM, normals, alpha, view transforms and glTF material export.
- [references/texture-baking.md](references/texture-baking.md): high-to-low and
  procedural-to-texture baking, cages, map setup and the 5.2.2 bake API split.
- [references/openings-and-glazing.md](references/openings-and-glazing.md): finding an opening's
  rim in a shelled body, building panes from it, sealing and occlusion checks, and the glass
  material choice. Load for windows, windscreens, lenses and grilles.
- [references/geometry-nodes.md](references/geometry-nodes.md): editable parametric
  sources, fields/domains, modifier inputs, instancing and evaluated export.

These are selectively adapted from EL4CTEO/blender-skills for Blender **5.2.2 LTS**;
see [THIRD_PARTY.md](THIRD_PARTY.md) for the pinned source and MIT notice.
This skill and `AGENTS.md` remain authoritative. Helpers never authorize repairs,
applying modifiers, exports or game integration. Do not install the upstream suite,
run its installer, or import its web compression defaults automatically.

- `scripts/asset_qa.py`: read-only evaluated topology and winding diagnostics; strict
  closed-solid default, explicit open-panel mode. No automated report proves correct
  outward/cavity orientation, attachment fit or reference fidelity.
- `scripts/uv_report.py`: read-only world-space texel-density/UV-area report. Does not
  unwrap, pack, modify UVs or certify overlap/padding.
- `scripts/render_state_audit.py`: read-only visibility and material-slot audit — objects
  hidden in the viewport but still rendered, meshes without slots, object-linked slots, and
  shared mesh/material users. Reports state; it does not decide whether a hidden object is
  intentional.
- `scripts/glb_report.py`: standalone standard-library GLB inventory, exported vertex
  and triangle counts, materials and extension requirements. Not a glTF validator.
- `scripts/texture_inventory.py`: read-only resolved slots, image paths/packing/colour spaces,
  UV references and shader dependencies. Explicit targets via `run(objects=["Body"])`.
  Node groups remain unresolved; unconnected images are not deletion candidates.
- `scripts/test_helpers.py`: isolated synthetic regression checks; run only in a
  disposable background Blender, never the user's live scene.

Paths in this section and the supporting workflow are relative to this skill directory,
unlike project paths elsewhere in this skill. Load modules by absolute script path via
`importlib.util.spec_from_file_location` to avoid name collisions; do not execute fetched
remote code in Blender. Report limitations alongside results, not just a pass flag.

## Inspect before editing

1. Call `get_addon_status` and `get_scene_info`. Inspect Blender's current filepath,
   dirty state, target objects, transforms, materials and modifiers. Do not assume
   the active file is the asset mentioned in chat; do not open another file over
   unsaved work without approval.
2. Capture the target with `look`, explicitly passing target names. Establish a
   recoverable checkpoint before destructive edits: save under a new incrementally named
   file (`name_001.blend`, `name_002.blend`, ...) in the approved destination and never
   overwrite an existing one. Do not rely on a saved `.blend` containing unsaved changes.
3. Identify reference landmarks: head/body ratio, shoulder width, arm slope,
   base shape and depth. Distinguish visible measurements from estimates; a single
   front reference does not establish side geometry.
4. State units and axis conventions in the plan (e.g. metres, +Y front, +Z up) and keep
   them for the whole session. Put parts in collections per system and name objects
   clearly (`Wheel_FL`, `Tire_FL`).
5. Inventory shared mesh/material/image users, parents, constraints and modifier dependencies
   before changing data. Print `obj.data.users` and the sharing objects
   (`[o.name for o in bpy.data.objects if o.data is target.data]`) plus each material's users:
   spares and duplicates commonly share a road-wheel or prop mesh, so a transform edit is safe
   while a geometry edit silently reshapes both. Preserve linked users outside the scope; create an
   approved independent copy when needed rather than silently altering another part or its
   placement.

## Locating geometry before you touch it

When the user points at something ("this tube clips the body", "the hood is gone"), identify
it from the capture, not from bounding boxes or proximity.

1. Pick the visible target or cast a ray using the actual capture camera/pixel correspondence.
   Record the object, face/component and world position, then confirm it in an isolation
   capture. The first hit can be an occluder. If the camera cannot be recovered, reproduce
   the view or ask for a marked target; do not invent coordinates or edit a guessed object.
2. Print that object's island inventory before assuming what it is: island count, vertices
   per island, and each island's bounds. One object routinely holds both a detail and a
   structural panel.
3. Only then decide whether to move, trim, hide or rebuild, and record which control the
   next attempt will change.

Worked example from a real session: a "hood detail" object contained a 1,188-vertex island
spanning X ±0.40 / Y −1.14…−0.53 — the raised hood panel itself. Hiding it as "vents"
flattened the hood and the user caught it. An island inventory before hiding would have
prevented the whole detour.

Vertex sampling can detect some defects and measure vertex displacement, but cannot establish
complete surface clearance. Long tube faces can cross a host while both endpoint rings clear
it. Inspect evaluated triangles with BVH/ray or surface tests and captures; interpret intended
joints and containment separately rather than treating an overlap count as the verdict.

## Diagnosing appearance discrepancies

### Material-boundary repair procedure

Identify the visible object and faces using picking/raycast or a restored flat-colour
isolation probe. Record face bands, material regions and shared boundary loops before
editing. Prefer existing rounded loops over face-centre thresholds; create a deliberate
boundary only where none exists. Do not add subdivision to disguise misclassification.
Inspect every affected corner close up and at an oblique angle. Compare geometry and
unrelated assignments (including rear surfaces) before/after. Preserve diagnostic colours
only in explicitly labelled scratch captures; restore source materials in `finally`.

`tools/asset-pipeline/scripts/check_material_boundaries.py` (repo-relative) is a read-only
advisory helper. Inside Blender use `snapshot(obj)` and `analyze(current, baseline,
allowed_faces)` with stable mesh indexing; alternatively pass snapshot JSON to its CLI.
It reports material regions, separating edges, endpoints/branches, single-face regions
and out-of-scope assignment changes. It cannot certify likeness, smooth curves or visual
correctness: even a closed toothed boundary can pass, and intentional accents can trigger
warnings. Tests: `python3 tools/asset-pipeline/tests/phase7/test_material_boundaries.py`.

### Generated-material colour gate

StableMaterials (and similar generators) is known to follow surface detail and tiling
more reliably than prompt colour. **Colour drift is an expected limitation, not a failed
prompt.** Raw base colour is therefore a candidate, never a delivery.

1. Inspect the raw base colour, a 3×3 repeat and a 50% offset. Record seam/tiling,
   stain/lighting and content findings separately from colour.
2. Compare the mean against an approved target palette. Record a review entry. Correct
   **only** when the failure is classified `colour_only`; do not use colour correction to
   disguise a seam, stain, lighting or texture-content defect.
3. Use the established deterministic correction (`tools/asset-pipeline/tests/phase5/
   review_colour.py`) with the explicit palette and review record. It applies bounded
   luminance modulation and replaces chroma while preserving generated detail; raw files
   and normal/roughness/height/metallic maps remain untouched.
4. Re-inspect the corrected tile and offset preview. Wire only the corrected base colour
   plus the reviewed detail maps; preserve stable alpha/transmission and do not alter
   unrelated channels to make the colour pass.
5. Record the raw/corrected hashes, review classification, correction report and
   limitations. A corrected map is not pure-generation evidence.

Rendered and viewport appearances can disagree for reasons unrelated to the material. Before
editing shader values, establish what a capture is actually showing.

1. Separate the visibility switches. `hide_set()` is viewport-only; `hide_viewport` (the monitor
   icon) is also viewport-only in 5.2.2 and does not prevent rendering. `hide_render` is the render
   switch. Reference planes, datum markers and superseded sources are routinely hidden in the
   viewport and still appear in every render and `look` capture. Reference and construction
   collections must set `hide_render = True`, and a render-only appearance problem starts with an
   audit of objects that are viewport-hidden but renderable.
2. Confirm the object and its slots, not just the material datablock: slot count, each slot's
   material, and `slot.link`. Object-linked slots override the mesh and can differ between users
   of the same mesh.
3. Map visible faces to slots with a probe: distinct flat colours on slots 0/1/2, a close-up
   render, then one colour on every slot. Geometry that keeps its old colour does not belong to
   that object at all. Restore the original materials in `finally`.
4. Judge metals under neutral lighting: Base Color tints their specular reflection, while the
   environment and roughness strongly affect appearance. Coatings need separate consideration.
5. If an edit changes nothing, treat that as evidence you are not editing what you are looking at.
   Re-establish object, slot and render path before the next attempt (see Regression stop).

## Capturing views

- Framing targets does not imply isolation. Use `capture_review.py --isolate` with explicit
  targets for host/attachment checks and inspect the image. Add `--focus-targets` and
  `--focus-view` for a bounds-based interface close-up; do not guess a camera distance.
- Animated captures require explicit `--frame`; `--pose-object` records an evaluated
  hinge/controller matrix. `check_evidence.py` compares frames, matrices, hashes and
  frame-specific fingerprints. An "open" label is not a pose assertion.
- `check_interface.py` is experimental: it samples evaluated surfaces and reports local
  signed nearest distances, spacing and coverage. It is fixture-tested on boxes but does not
  prove complete contact or watertightness.
- Keep a criterion-based attempt ledger; separate structural, interface, likeness, motion
  and user-acceptance outcomes. Follow `references/assembly-verification.md` for evaluated
  interfaces: cage equality is not contact.

Treat external reviews as hypotheses, not instructions to repair. For each finding record
the evidence, applicability to the intended style, verification needed and whether a change
is warranted. Texture thumbnails cannot establish model, glass or chassis quality. Suggestions
do not authorize edits; do not add wear or rework accepted geometry without approval.

- `look` may return only a perspective shot even when other views are requested. Check the
  installed tool schema rather than assuming; verify the returned image is the view asked for.
  On add-on 1.8, including the protocol-14 build, `angles` and `frames` work but `topology`
  is unavailable; use `shading="wireframe"` or direct mesh diagnostics there.
- Use `look` as the primary live shape loop: inspect the actual target, make one small cage or
  proportion edit, inspect again. Do not regenerate the whole asset to avoid looking. If MCP
  disconnects, stop live editing and report instead of silently switching to a full rebuild.
- True orthographic front/right/top captures need a Blender-side capture that writes a PNG
  to `.dev-shots/`. A read-only or plan-mode session blocks that write: ask for a mode switch
  at the start of the task, not after a failed audit.
- Name captures `<step>_<what>_<view>.png` and never overwrite earlier iterations. View them.
- Stage render work by decision, not by edit. During construction, use transform/bounds checks
  and viewport, solid-shading or material-preview captures. Reserve a multi-angle
  Cycles/EEVEE batch for an acceptance pass once orientation, proportions, assembly and
  materials are settled, or for one targeted render of a render-only effect (transmission,
  reflection, baked normals). Do not rerender unrelated views after a small change; two
  unchanged visual results mean diagnose the target, tool and prior evidence before another
  batch.
- Capture the baseline before editing. If no baseline is available, report that gap;
  do not present a reconstructed image as a before capture.

## Reference calibration (before modeling)

1. Record real target dimensions (e.g. wheelbase, overall width/length, tyre diameter,
   ride height). Ask the user for any that are unknown and mark estimates as estimates.
2. Measure what each reference sheet actually encodes, and check that the sheets agree
   with each other. Report disagreements as numbers (e.g. "same tyre diameter, wheelbase
   differs by 21%").
3. Pick one sheet as the dimensional authority; the others stay faithful proportional
   guides. Never non-uniformly scale a reference to force agreement: it distorts the
   drawing (circles become ellipses). Conflicting sheets are the user's decision: present
   the numbers and options and wait.
4. Scale and place the planes uniformly so all views share one origin and scale, keep them
   in a `Reference` collection, and lock them after calibration. Recalibration requires
   reporting the discrepancy, obtaining approval, and rechecking dependent measurements.
5. Measure geometry from physical silhouettes and named structural landmarks, never from
   livery, paint colours or decal boundaries. Visually confirm each landmark on the
   reference before measuring; report obscured or ambiguous landmarks as uncertain rather
   than substituting a colour boundary. Record landmark names/endpoints, reference view,
   pixel coordinates, pixel-to-unit scale and uncertainty. State whether a measurement is
   projected or established by explicit dimensions; perspective images do not imply a
   uniform pixel-to-unit scale across different depths.
6. State the noise of any measurement taken from images (silhouette masks, edge scans) and do
   not tune below it. Validate a measuring script on a known case before trusting its
   numbers; a wrong sampling position or a mask that catches unrelated parts gives
   confident but false results.

## Direct comparison with reference planes

- When calibrated reference planes are available, capture reference-only, reference plus
  model edges, and solid-model views with identical aligned orthographic framing before
  and after every silhouette-changing step and before accepting the stage.
- Hide unrelated reference planes to avoid overlapping drawings. Use see-through or
  wireframe overlays, and inspect the captures to confirm the reference stays textured
  and readable beneath the model edges. Material Preview may ignore X-ray; full wireframe
  may hide the reference texture. A toggle is not evidence that the overlay works.
- Compare both upper and lower contours, openings, and fixed structural landmarks. For
  vehicles, explicitly check cab/window openings, wheel arches, door depth, rocker height
  against axle centres, and body-to-chassis relationships. Do not move unrelated parts to
  conceal a mismatch.
- Distinguish physical edges from paint boundaries, shadows, cage tubing, spare tyres and
  other overlapping components. Confirm feature identity visually before measuring.
- Report measured offsets and uncertainty. Agreement at sparse landmarks or sampled top
  heights does not establish whole-profile fidelity. Preserving image aspect proves only
  that the plane adds no aspect distortion, not that the source image or calibration is
  correct.
- Preserve reference calibration and restore temporary object visibility and viewport
  settings after captures. Report any intentionally retained comparison setup.

## Build protocol

### Construction-method gate

Before a primary form or change of construction method, complete
[references/construction-brief.md](references/construction-brief.md). Choose from geometric
drivers, compare the main alternative and test the difficult section/interface first.
Reuse the brief for incremental edits; do not repeat it before every vertex movement.
Changing methods does not reset the criterion's attempt budget. The brief must also decide
which details are geometry and which are texture/material at the closest intended view.
This documented gate is not automated builder enforcement or a validated pattern library.

Work in stages: **blockout → construction → detail → UVs → materials**. Verify proportions,
openings and assembly in neutral solid views before adding bevel detail, paint or lighting.
Do not use polish to conceal weak construction. Plan major paintable panels, trim, glass,
material boundaries and seams for the intended delivery before multiplying components.

Classify the form first (fabricated hard surface, moulded product, or soft goods) and pass a
shape gate before detail: primary silhouette, major sections, thickness and contact only,
inspected in neutral front/side/top/three-quarter captures. Use `capture_review.py` for those
cheap checks and `check_shape_gate.py` for bounds/hinge/scene hygiene. Capture manifests carry
source fingerprints; approvals require fresh four-view evidence and are revalidated for
detail/delivery. Materials, keys, bezels, seams and delivery exports come after the shell
reads correctly.

Prove one representative difficult part, including its interfaces, evaluated topology, UVs
and requested export, before replicating it. Inspect modifier-generated bevel corners,
Boolean walls, coincident/split surfaces, sliver triangles and generated UVs: a healthy base
mesh does not establish healthy evaluated geometry. Preserve good existing parts; a rebuild
is a proposed design choice, not an automatic response to a diagnostic failure.

1. One system or part per step (chassis, wheels, suspension, cage, body). Report and wait
   for the user's go before the next one, unless an approved chunk says otherwise.
2. Prefer primitives and modifiers (Mirror, Bevel, Solidify, Array, Subdivision Surface,
   Boolean) for mechanical forms. For moulded and soft forms, deliberate cage, edge-loop and
   proportional edits are appropriate when they establish the silhouette; avoid hand-wound
   faces and primitive stacking that substitutes for the required form. Model symmetric parts
   as one half plus a Mirror modifier with clipping on.
3. Join section loops with Bridge Edge Loops. Do not hand-wind faces or build custom
   rim/flare strips in generator code. Where a surface will later be smoothed, subdivided,
   remeshed or boolean-cut as a solid, build it as a closed manifold solid. Intentional
   open panels may be smoothed or subdivided, but must not be treated as closed volumes.
4. Cut openings (wheel arches, windows) with closed Boolean cutters kept unapplied in dedicated
   collections. Inspect existing collection-boolean consumers before adding operands; never
   put a new cutter into a shared collection merely because it is named `Cutters`. Apply only
   when approved. Build flares and trim separately so their edits do not reshape the shell.
   Glazed openings follow [references/openings-and-glazing.md](references/openings-and-glazing.md):
   the pane is built from the opening's rim loop, not floated over it.
5. When salvaging a model, keep the parts that match the references. Hide, do not delete,
   a replaced shape and use it as a size guide.
6. Match the silhouette in solid shading before polishing glass or lighting. Keep
   construction objects, modifiers or reproducible parameters editable. Avoid repeatedly
   deleting and rebuilding the only model.
7. Change only the requested region. For percentage edits, record the baseline
   dimensions/parameters and preserve unrelated regions. Applied unions make isolated
   edits harder: preserve the source operands before applying them.
8. Temporary hiding for isolation is diagnostic state: restore it in `finally`. Superseding
   or excluding geometry from delivery requires a component inventory, preserved source and
   silhouette/completeness checks; do not confuse temporary isolation with asset removal.

## Fitting attachments to host surfaces

- Fit trim and flares to the approved host surface; do not reshape that surface merely to
  accommodate a convenient primitive without explicit approval.
- Size structural joints against the bevel radius and reach the host member's centre or
  deeper; a nominal overlap smaller than the combined bevel opens a visible gap. Align a
  continuous stile with its leg, and use a Boolean-cut solid where joined objects would
  leave visible intersecting faces. Hidden overlap is acceptable; visible flicker is not.
- Measure the actual interface on evaluated geometry. A torus's full axial bounds do not
  describe its cross-section everywhere. Compare attachment and host surfaces locally,
  not just global X ranges or object bounds. Validate image/UV axes and local-to-world
  transforms against visually identifiable landmarks before trusting measurements.
- Test both floating gaps and host material breaking through the attachment. Include the
  full visible arc, ends and transitions. Missing samples remain unverified; do not narrow
  the sampling region merely to obtain a pass. Document any geometrically justified
  exclusions and report sampling limits alongside visual close-ups.
- Preserve symmetry: build mirrored fittings from one source unless reference evidence
  requires asymmetry. Do not introduce different left/right radii through independent
  fits without justification.

## Mesh health gate (after every step)

- Report non-manifold edges, loose vertices and flipped faces on the evaluated target.
  Intended closed solids must have 0 of all three before continuing. For intentional open
  panels, reference planes and construction geometry, report expected boundary edges
  separately; unexpected non-manifold edges, loose vertices and flipped faces must be 0.
  A single object may contain disconnected shells, and Boolean success does not prove a
  single watertight volume. A closed shell can still contain openings: window rims are
  interior loops between outer skin, inner skin and cut wall, so `boundary_edges: 0` is not
  evidence that the body has no windows.
- Verify consistent face winding numerically and inspect each closed component's intended
  orientation with Face Orientation captures. Blue marks front faces and red back faces;
  interpret them relative to the intended material volume, including cavity walls.
  Signed volume is supporting evidence only: a positive total does not prove every face
  points correctly. Do not use per-face ray tests as proof of orientation on open or
  concave meshes. For open panels, state the intended front side; reference planes looking
  red from behind are not defective. Report any orientation that could not be verified.
- Never run Recalculate Normals on an open panel without comparing Face Orientation before
  and after. It can pick the wrong side for a whole island.
- When a Smooth or other modifier is in play, compare evaluated geometry with that modifier
  enabled and disabled in world units. Report maximum vertex displacement only when vertex
  correspondence is established; otherwise report sampled surface distances with the
  sampling method and its limits. Report movement at fixed landmarks (roof, arches, lower
  edge) in mm, and stay within the tolerance the user set. Unapplied modifiers stay toggleable.
- Report evaluated, not only source, counts. Optimise after the shape is acceptable: smooth
  shading does not add polygons, flat shading is not synonymous with low-poly, and the
  silhouette must be re-inspected after reduction. Budget triangles, material primitives and
  exported vertices, not Blender polygon count alone. Do not invent a universal triangle
  budget; ask the user for one if none is given.

## Geometry transfer verification

Apply before accepting a join, split, bake preparation, topology conversion or export,
and before attributing a candidate failure to the source asset.

1. **Compare equivalent representations.** Label raw source mesh, evaluated source,
   bake candidate and re-imported export separately. Record source filepath, exact
   object and mesh datablock names, coordinate space, frame/pose, modifier configuration
   and whether each count is raw or evaluated. Compare matching evaluated states;
   bevels/subdivision and export UV/normal splits can legitimately increase counts.
   Raw-versus-evaluated count growth is not evidence of duplicated geometry.
2. **Resolve contradictions before repairs.** If a summary says all counts match but
   a named part disagrees, invalidate that diagnostic and stop edits, rebuilds and
   architectural changes. Produce the summary and per-part evidence from the same
   captured snapshot and exact identities, not separate queries with ambiguous name
   matching. Check stale datablocks, aliases, grouping and evaluation state before
   proposing a fix. Correct the report and withdraw unsupported earlier claims.
3. **Prove ownership through each operation.** Do not assume face or vertex ranges
   survive join, triangulation or modifier evaluation. Verify source-to-candidate
   ownership before and after every topology-changing step. Detect missing faces,
   foreign faces, duplicated parts and loss of material boundaries. Record any supported
   one-to-many mapping explicitly; index ranges require demonstrated order stability.
4. **Use independent preservation checks.** Equal counts plus zero nearest distance
   do not prove identical meshes: coincident duplicates can satisfy both. Verify vertex
   multiplicity or explicit correspondence, face connectivity, face/material ownership,
   UV correspondence, transforms and parents. Report point-distance bounds separately
   from topology and identity claims. Explain legitimate representation differences
   rather than inventing a vertex/face-count multiplier or offset as an acceptance guard
   (for example, `source_faces * 1.5 + 8` has no geometric justification).
5. **Exercise realistic fixtures.** Test bevel and subdivision modifiers, multiple
   materials, named UV layers, overlapping coordinates and animated parents, including
   their interaction in one fixture. Use known-good fixtures and deliberately duplicated,
   misassigned or missing outputs that must fail. Two separated unmodified cubes cannot
   establish arbitrary-assembly support. Validate diagnostic units and tolerances on
   those controls before treating a reported failure as an asset defect.
6. **Establish source responsibility.** Reproduce the suspected defect independently
   on the evaluated source at the same pose before requesting or performing a source
   repair. Classify the finding as inherited, introduced by the pipeline, or uncertain.
   A failed candidate or an unvalidated helper is not authorization to change a clean
   source. Correct the pipeline first when it introduced the defect; unresolved
   responsibility blocks source repair, not merely delivery.

These checks supplement the mesh-health gate; they do not replace visual, interface,
motion, material-transfer or user-acceptance evidence, and do not reset attempt limits.

## Regression stop

Follow `AGENTS.md` section 5: up to seven evidence-driven attempts, with a progress review at
six. After two unchanged failures, validate the target and diagnostic before editing again.
A new defect class stops the current edit chain: restore the last good scoped checkpoint and
explain the alternative before proceeding within approved scope. Do not reset the attempt
count by changing strategy names. Preserve unrelated work; reopening a whole `.blend` needs
approval if it discards changes. If restoration is unsafe, stop and report.

The budget permits investigation, not moving goalposts. Threshold changes, overlap/collapse
exceptions and geometry exclusions require explicit approval. Never convert uncertainty to
a confident semantic label to obtain zero unknowns, or apply a tool already judged unsuitable.

## Painting-guide and verification contract

- Preserve recognisable, contiguous main-panel charts. Thousands of fragments are not a
  substitute for the requested painting template. Keep small mechanical detail on separate
  sheets where approved, and distinguish artist outlines from triangulation diagnostics.
- Every island needs a stable ID for the delivered layout and an evidence-backed part name,
  or an explicitly unresolved tag. Put readable names inside major islands and use numbered
  leader-line callouts for tiny islands. No silently skipped tags; verify correspondence with
  the manifest, maps and masks. A populated name field or a rule-coverage score does not
  establish semantic correctness.
- Treat IDs as layout-derived. A repack or re-unwrap can reorder them; store island face
  sets and rebind names by exact face set after the layout changes. Preserve prior review
  state rather than silently reusing ID-keyed names.
- Report geometric overlaps and raster pixel conflicts separately. Adjacent-face sub-pixel
  slivers are not the same as texture collisions; do not call a guide clean from a triangle
  test alone, or generation-ready from a render alone.
- When both are requested, deliver the line guide and colored sheet as two views of the same
  layout. The colored sheet is a layout visualization, not an albedo, bake or material-
  transfer proof.
- Repair charts on a disposable copy with isolated operands fitted back into their original
  footprint. A full-sheet repack can improve coverage but will move labels and IDs; recheck
  label placement and rebind names afterward.
- Validate helper units, coordinate mapping, selection isolation and failure detection on
  known-good and deliberately failing fixtures before using results to accept or alter assets.
  One-off scripts remain experimental until their assumptions and limitations are tested.
- Use asymmetric test patterns, per-object and area-weighted errors, and matched before/after
  views. Report thin/sliver geometry separately without silently excluding it. Check both tail
  errors and coverage; a good median or a distant checker render cannot establish a pass.
- A gradient bake tests mapping only. It does not prove original albedo, roughness, metallic,
  tangent-space normals, transparency or coat survived. Verify required channels and material
  behaviour separately; classification as inherited degeneracy is explanation, not acceptance.
- Record actual saved image dimensions: declaring a 4096 atlas in metadata does not deliver a
  4096 image. Inspect saved guides against the user's readability reference before completion.
- When the user pauses Blender for headroom, do documentation/CPU-only work within scope;
  do not restart Blender or rendering without permission.

## Inspect the result

After a meaningful shape change, inspect front, back, left, right and three-quarter views;
add top and close-up views when useful. Compare against the reference rather than declaring
success from tool output. Use explicit targets so unrelated objects do not spoil framing.
Judge transmission, highlights and colour in separate material/rendered views. Keep a
clearly named shared material colour input when easy recolouring is required. Do not alter
unrelated lighting or cameras to conceal shape defects.

## Blender Python gotchas

- Query installed API/tool capabilities rather than guessing arguments or enums.
  Look shader nodes up by type (e.g. `BSDF_PRINCIPLED`), not localized names.
- Set rendered colour through shader inputs; `material.diffuse_color` alone only
  controls viewport colour.
- `bpy.ops` depends on mode, active object, selection and editor context. Establish
  those preconditions explicitly; prefer direct data access when practical. Do not
  swallow context errors with empty exception handlers.
- Do not parallelise dependent operations against the same live Blender scene.
- Make temporary capture setup exception-safe: restore visibility, display modes, selection,
  active object, overlays and shading in `finally`, even when capture fails. Use verified
  orthographic views or a tested camera-framing helper rather than repeated guessed
  perspective rotations. Inspect the capture before claiming the intended framing worked.
- BMesh element references become invalid after `bm.free()` or deletion of those elements;
  topology changes can invalidate retained references/indices. Copy coordinates or collect
  indices while valid, and refresh index/lookup tables after topology edits. `bm.to_mesh()`
  writes a mesh but does not itself free the BMesh.
- Scripts are not transactions: an exception can follow successful earlier edits. Inspect
  the actual scene before retrying, avoid double-applying changes, and restore temporary
  selection, visibility, material overrides and render/bake settings in `finally`.
- A UV layer reference captured before a UV add-on operator can become stale. Re-fetch
  `ob.data.uv_layers[name]` before copying or auditing; otherwise reads can raise
  `IndexError` or return old data.
- `uv.pack_islands` can reorder islands. Treat IDs, label placement and names as invalid
  after a pack; recompute islands and rebind names by face set.
- `autounwrap.smart_uv` has a blocking `execute` path for scripts, but the organic
  `autounwrap.unwrap` path is modal/panel-only. Do not fake a scripted call to a panel-only
  operator; report it and use a supported fallback.
- `bmesh.ops.create_cube(size=s)` has full side length `s` and spans ±s/2; object `scale`
  multiplies that. Decide the intended span, then verify evaluated world dimensions after
  updating the view layer/depsgraph before building anything on top of it.
- `v.co` is local. On a rotated or offset object, edit through `matrix_world` (or
  `matrix_world.inverted()`); a local Z change does not move the object vertically in world
  space. Moving a cylinder along its local Z slides it along its own axis.
- Keep one coordinate space per build script. A rim authored at world X 0.65 on an object
  sitting at X 0.53 lands 0.65 m outboard. Build one instance, print its world bounding box
  against the target, then replicate — do not rebuild all four and discover it afterwards.
- `hide_set` is viewport-only: hidden objects still evaluate into booleans and modifiers, but
  are excluded from `visible_get()` and from an export built on visible objects.
- Prefer complete connected components, isolated copies or closed operands for cuts. Partial
  face operations can leave T-junctions/open boundaries; verify selection, closure and neighboring
  topology and run the health check immediately. They are not inherently invalid in every case.
- A beveled curve with `use_fill_caps` can still produce coincident cap-rim vertices. Inspect
  evaluated boundaries and weld/fill only where approved and necessary; preserve intentional holes.
- Keep MCP local-only. Do not enable paid generators/download integrations without
  approval or use Blender scripting to bypass repository file-edit requirements.

## Asset libraries (Poly Haven, Sketchfab, Poly Pizza)

Exercised in the pond-scene trials (2026-10-19–20, Blender 5.2.2, addon 1.8): Poly Haven
models/HDRIs/textures, Sketchfab static and skinned animated models, and Poly Pizza static
and animated models. This is sample coverage, not blanket asset or exporter certification.
Follow [references/asset-libraries.md](references/asset-libraries.md) for provider-specific
arguments, transform preservation, animation checks and resource safeguards. Treat each
new library asset as untrusted until checked:

- Record source, asset id, author and licence beside the import. Check compatibility and meet
  each asset's attribution/redistribution obligations; different licences may coexist when compatible.
- Inventory the exact objects created by each import. Measure evaluated descendant-mesh
  bounds, not empty bounds; preserve imported scale and axis conversions under a placement
  controller rather than overwriting them. Validate one instance before duplication.
- A library asset is not evidence of reference fidelity. Do not substitute it for a part the
  user calibrated against a reference sheet without approval, and do not let a download
  stand in for a requested silhouette.
- Keep downloads inside the project's approved asset folder. `inspiration/` and third-party
  caches are never committed.
- Report the import as a separate delivery state: present in the scene is not integrated,
  textured, or verified in-game.
- `generate_3d` is a paid, single-object generator, not a scene builder. Confirm the target,
  provider and credit cost before using it; generated output still needs reference, topology,
  material, export and in-game checks.

## Character and variant authoring

Treat a new species/variant as a rig and delivery contract, not only a new silhouette.

1. Decide whether the variant shares an existing rig or needs its own. Reuse the source
   skeleton and clip names when the proportions and deformation allow it; duplicate only
   with an explicit reason.
2. Keep one authoritative editable source. Name the `.blend` checkpoint and record it in
   the asset manifest; local ignored checkpoints are not backups.
3. Preserve the rest pose and root motion contract before export. Check unweighted vertices
   and test representative bends, twists, squash and stretch from several views.
4. Keep variant materials parameterized (colour, transmission, roughness, coat) rather
   than duplicating the rig for each look. Export only the intended meshes and slots.
5. Write the asset manifest beside the delivery: tracked file, hash, scale/axis, bounds,
   mesh/skin/clip/material inventory, extensions, source and rights. Run
   `node scripts/glb-inventory.mjs <asset>.glb` and `node --test tests`; a matching
   game-side loader check is separate evidence. `src/assets.js` validates the manifest and
   runtime counts; `assets/README.md` documents the schema.
6. Add the species entry with `asset` and `assetManifest`; start from
   `docs/species-template.md`. For Glass/Gummy/Bear, record which runtime path the asset
   uses: skinned GLB, 24-body metaball, or a future authored hybrid. Do not promise
   runtime mesh blending.

## Deformation and export (only when requested)

- Physics bodies, deformation controls/bones and the visible surface are separate.
  Do not assume 24 physics spheres require 24 bones. Inspect the current runtime:
  the bear baseline uses sphere physics and a generated metaball surface, not an
  authored skinned mesh. A new rendering path needs explicit approval.
- For a skinned asset, inspect unweighted vertices and test representative bends,
  twists and compression from several views. Automatic weights are a starting
  point, not a verified result. Restore the intended rest pose before export.
- Export only intended objects to the approved path. Check scale, axis conversion,
  origin, normals, material support and required extensions. Blender is Z-up;
  glTF is Y-up: verify conversion rather than adding an untested extra rotation.
- Check rendered material coverage; missing material slots must be intentional, not unnoticed
  default grey. Rebuilt or replaced objects start with zero slots, so check the object's slot
  list after every rebuild, not the material datablock. Require valid UVs where textures/bakes
  or the destination need them, not on every untextured mesh. Inspect islands, checker
  distortion, overlap and padding at the intended resolution; a UV layer or successful
  automatic unwrap alone does not establish suitability.
- Blender procedural graphs generally do not transfer faithfully to glTF/FBX. Preserve original
  graphs and bake required channels where unsupported. Newly generated noise is a replacement,
  not a transfer of the original appearance. Compare source and baked materials under matching
  lighting, cameras and view transform.
- Separate per-object material copies when distinct bake images need them, unless an intentional
  shared atlas is used. Prepare active image targets in every relevant material; resolve missing-target
  warnings before claiming complete coverage. Set colour/data spaces before baking and saving.
- A colour bake does not transfer procedural roughness, metallic, bump or coat. Bake required
  channels too, or obtain approval for a documented simplification; do not silently replace their
  drivers with constants. Save/reload images deliberately and inspect the connected maps.
- For self-contained packaging, re-import in a disposable scene with original texture paths
  unavailable. Inspect resolved images, actual material connections and rendered appearance—not
  just image-node counts. Embedding depends on exporter/importer support; a Blender round trip
  does not prove destination-engine support. If unverified, say so and offer a relative-path
  texture bundle rather than promising the FBX alone is sufficient.
- Quads/ngons triangulate on glTF export; UV/normal discontinuities can increase
  vertex counts. Record exported stats and validate the GLB with Khronos's validator
  when available. Its browser tool processes files locally; no new project package
  is required. If unavailable, report that validation is outstanding.
- Structural validation does not prove appearance. When integration is approved,
  inspect in the project's pinned three.js runtime with the real lighting/materials.
  Keep Blender/MCP out of runtime dependencies. Record source/reference provenance;
  do not assume a recreated branded character grants redistribution rights.

## Cleanup and reuse

- Before cleanup, propose exact keep/move/delete sets, destination collision handling and
  rationale. Preserve accepted source checkpoints and important baseline/verification captures;
  retaining only the newest files or a fixed capture count is not sufficient justification.
  Follow the project's deletion approval gate and verify the resulting inventory afterward.
- Reusable guidance is a separate copied/generalized deliverable. Keep this project's adapted
  skill, instructions and local resources intact unless replacing them or adding an external
  dependency is explicitly requested and approved.
- When extracting tooling, remove project object names, material-zone maps, evidence
  fingerprints, absolute paths and project `.blend` assets; keep a small shared core and
  thin CLIs rather than shipping the project-specific exporter.
- Ship generic clean and deliberately failing fixtures, including a gate PASS/FAIL case,
  PNG structural checks and name-rebinding coverage.
- Decide the licence after provenance review. Do not bundle GPL or paid add-on code;
  optional tools such as Mio3 remain external and documented as optional.

## Step report format

Keep each step report short and in the same shape:

1. What changed (objects, modifiers) and what was deliberately left untouched.
2. Health: non-manifold edges, loose vertices, flipped faces, evaluated tri/vertex counts.
   For UV work, also report geometric overlaps, raster pixel conflicts, out-of-bounds UVs
   and degenerate triangles; name residual slivers instead of saying only "clean".
3. Dimensions versus reference in mm, with the measurement noise.
4. Files: saved path and dirty state, or "live scene only", or exported path.
5. Captures viewed (paths), and anything that could not be verified.

Then stop and wait. Say explicitly when the result is live-only or not integrated. Do not
claim visual acceptance on the user's behalf.

## Sources

- MCP image/inspection modes: https://www.mcp-for-blender.com/docs/tools/look
- MCP Python and scripting pitfalls: https://www.mcp-for-blender.com/docs/tools/execute-blender-code
- Blender operator context: https://docs.blender.org/api/current/info_gotchas_operators.html
- Blender glTF export: https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html
- Structural validation: https://github.com/KhronosGroup/glTF-Validator

The silhouette-first, scoped-percentage-edit and capture-retention requirements
are project policies informed by the MSN figurine iterations. The calibration, build
protocol, health gate and regression stop come from the Raptor RC truck test. They are
project policies, not universal API rules.
Consult documentation matching the installed Blender version before using examples.
