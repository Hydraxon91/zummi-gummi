---
name: gummy-3d-authoring
description: Create, edit, calibrate, inspect and export Blender assets (3D models, meshes, props, vehicles, characters, GLB files) for Gummy Bears using Blender MCP, with reference-image matching, PBR materials, UVs, texture baking, Geometry Nodes, editable source preservation and multi-angle verification. Use whenever the task involves Blender, MCP for Blender, a 3D model or mesh, materials, textures, baking, geometry nodes, blueprint/reference images, mesh cleanup, or GLB export, even if the user does not name this skill. Asset work does not authorize game integration.
---

# Gummy 3D Authoring

Read the repository's `AGENTS.md`: Agent Behavioral Rules, Destructive Actions, Commits and
Pushes, Tool-Call Discipline, Visual Verification and 3D Asset Authoring. Follow its approval
gates. No game integration unless separately in scope. Repository paths below are relative to
the project root, not this skill directory.

This procedure applies to any Blender asset in the project, not only bears. Bear-specific
rig/export notes are in "Deformation and export".

## Supporting workflows and tools

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
- `scripts/glb_report.py`: standalone standard-library GLB inventory, exported vertex
  and triangle counts, materials and extension requirements. Not a glTF validator.
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

## Capturing views

- `look` may return only a perspective shot even when other views are requested. Check the
  installed tool schema rather than assuming; verify the returned image is the view asked for.
- True orthographic front/right/top captures need a Blender-side capture that writes a PNG
  to `.dev-shots/`. A read-only or plan-mode session blocks that write: ask for a mode switch
  at the start of the task, not after a failed audit.
- Name captures `<step>_<what>_<view>.png` and never overwrite earlier iterations. View them.
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

1. One system or part per step (chassis, wheels, suspension, cage, body). Report and wait
   for the user's go before the next one, unless an approved chunk says otherwise.
2. Prefer primitives and modifiers (Mirror, Bevel, Solidify, Array, Subdivision Surface,
   Boolean) over editing individual vertices. Model symmetric parts as one half plus a
   Mirror modifier with clipping on.
3. Join section loops with Bridge Edge Loops. Do not hand-wind faces or build custom
   rim/flare strips in generator code. Where a surface will later be smoothed, subdivided,
   remeshed or boolean-cut as a solid, build it as a closed manifold solid. Intentional
   open panels may be smoothed or subdivided, but must not be treated as closed volumes.
4. Cut openings (wheel arches, windows) with Boolean cutters kept unapplied, in a hidden
   `Cutters` collection. Apply only when approved. Build flares and trim as separate
   objects so edits to the shell never touch them.
5. When salvaging a model, keep the parts that match the references. Hide, do not delete,
   a replaced shape and use it as a size guide.
6. Match the silhouette in solid shading before polishing glass or lighting. Keep
   construction objects, modifiers or reproducible parameters editable. Avoid repeatedly
   deleting and rebuilding the only model.
7. Change only the requested region. For percentage edits, record the baseline
   dimensions/parameters and preserve unrelated regions. Applied unions make isolated
   edits harder: preserve the source operands before applying them.

## Fitting attachments to host surfaces

- Fit trim and flares to the approved host surface; do not reshape that surface merely to
  accommodate a convenient primitive without explicit approval.
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
  single watertight volume.
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

## Regression stop

If a fix introduces a new defect class, or the same step fails twice, restore the last
checkpoint, report the evidence and propose an alternative (often a rebuild with the Build
protocol). Preserve unrelated live changes during restoration; reopening a whole `.blend`
requires approval if it would discard them. If safe restoration is blocked, stop and report
instead of discarding work. Clean topology metrics do not justify further attempts after
the two-failure limit; a fit or visual verification failure counts even when mesh health
is green. Do not keep patching on top of a failing generator. Do not apply
a tool the agent itself has judged unsuitable (e.g. voxel remesh on a thin open panel) just to be able
to report progress.

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
- Keep MCP local-only. Do not enable paid generators/download integrations without
  approval or use Blender scripting to bypass repository file-edit requirements.

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
- Quads/ngons triangulate on glTF export; UV/normal discontinuities can increase
  vertex counts. Record exported stats and validate the GLB with Khronos's validator
  when available. Its browser tool processes files locally; no new project package
  is required. If unavailable, report that validation is outstanding.
- Structural validation does not prove appearance. When integration is approved,
  inspect in the project's pinned three.js runtime with the real lighting/materials.
  Keep Blender/MCP out of runtime dependencies. Record source/reference provenance;
  do not assume a recreated branded character grants redistribution rights.

## Step report format

Keep each step report short and in the same shape:

1. What changed (objects, modifiers) and what was deliberately left untouched.
2. Health: non-manifold edges, loose vertices, flipped faces, evaluated tri/vertex counts.
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
