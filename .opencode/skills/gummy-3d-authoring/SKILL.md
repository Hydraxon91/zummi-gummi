---
name: Gummy 3D Authoring
description: Create, edit, inspect and export Blender assets for Gummy Bears using Blender MCP, with reference matching, editable source preservation and multi-angle verification. Asset work does not authorize game integration.
---

# Gummy 3D Authoring

Read the repository's `AGENTS.md`, especially sections 4, 11, 13 and 15.
Follow its approval gates. No game integration unless separately in scope.
Repository paths below are relative to the project root, not this skill directory.

## Inspect before editing

1. Call `get_addon_status` and `get_scene_info`. Inspect Blender's current filepath,
   dirty state, target objects, transforms, materials and modifiers. Do not assume
   the active file is the asset mentioned in chat; do not open another file over
   unsaved work without approval.
2. Capture the target with `look`, explicitly passing target names. Establish a
   recoverable checkpoint before destructive edits using the approved destination.
   Do not rely on a saved `.blend` containing unsaved changes.
3. Identify reference landmarks: head/body ratio, shoulder width, arm slope,
   base shape and depth. Distinguish visible measurements from estimates; a single
   front reference does not establish side geometry.

## Model and iterate

1. Match the silhouette in solid shading before polishing glass or lighting.
   Keep construction objects, modifiers or reproducible parameters editable.
   Avoid repeatedly deleting and rebuilding the only model.
2. Change only the requested region. For percentage edits, record the baseline
   dimensions/parameters and preserve unrelated regions. Applied unions make isolated
   edits harder: preserve the source operands before applying them.
3. After a meaningful shape change, inspect front, back, left, right and
   three-quarter views; add top/close-up views when useful. Compare against the
   reference rather than declaring success from tool output. Use explicit targets
   so unrelated objects do not spoil framing.
4. Use material/rendered views separately to judge transmission, highlights and
   colour. Keep a clearly named shared material colour input when easy recolouring
   is required. Do not alter unrelated lighting or cameras to conceal shape defects.
5. Use `look` topology inspection where supported by the installed tool schema,
   or query mesh data for boundary/non-manifold edges, connected components and
   normals. A single object may contain disconnected shells. Boolean success does
   not prove a single watertight volume.
6. Optimise after the shape is acceptable. Smooth shading does not add polygons;
   flat shading is not synonymous with low-poly. Inspect the silhouette after
   reduction. Budget triangles, material primitives and exported vertices, not
   Blender polygon count alone. Do not invent a universal triangle budget.

## Blender Python gotchas

- Query installed API/tool capabilities rather than guessing arguments or enums.
  Look shader nodes up by type (e.g. `BSDF_PRINCIPLED`), not localized names.
- Set rendered colour through shader inputs; `material.diffuse_color` alone only
  controls viewport colour.
- `bpy.ops` depends on mode, active object, selection and editor context. Establish
  those preconditions explicitly; prefer direct data access when practical. Do not
  swallow context errors with empty exception handlers.
- Do not parallelise dependent operations against the same live Blender scene.
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

## Evidence and handoff

Save distinct before/after and multi-angle scratch captures in `.dev-shots/`;
do not overwrite every iteration with the same filenames. View the captures.
Report verified dimensions, geometry counts, material colour control and exact
saved/exported paths. Say explicitly when the result is live-only or not integrated.
Do not claim visual acceptance on the user's behalf.

## Sources

- MCP image/inspection modes: https://www.mcp-for-blender.com/docs/tools/look
- MCP Python and scripting pitfalls: https://www.mcp-for-blender.com/docs/tools/execute-blender-code
- Blender operator context: https://docs.blender.org/api/current/info_gotchas_operators.html
- Blender glTF export: https://docs.blender.org/manual/en/latest/addons/scene_gltf2.html
- Structural validation: https://github.com/KhronosGroup/glTF-Validator

The silhouette-first, scoped-percentage-edit and capture-retention requirements
are project policies informed by the MSN figurine iterations, not universal API rules.
Consult documentation matching the installed Blender version before using examples.
