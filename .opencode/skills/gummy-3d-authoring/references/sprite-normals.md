# Sprite and animated-sprite normals — unvalidated

**Status: unvalidated.** Optional source-asset workflow, not installed tooling or
approved game integration. Follow the main skill's preservation and acceptance rules.

## Choose this only for the right surface

Use inferred normals when an approved sprite/billboard/effect should respond to dynamic
lighting and true geometry normals are unavailable. Do not substitute them for actual
3D surface baking, silhouette/opening fixes or intentionally unlit HUD icons. Painted
highlights may become false relief; these maps are interpretations, not recovered geometry.

Confirm the receiving material supports normal mapping in the sprite's coordinate frame.
Three.js `SpriteMaterial` has no normal-map input; adding an arbitrary property does not
implement lighting. A mesh/shader/material change needs separate implementation approval.
Do not implicitly add a runtime WASM, Rust toolchain, hosted API or credentials.

## 1. Source and preflight

Preserve original artwork, alpha and animation metadata under distinct filenames. Record
rights, dimensions, native display size, frame count/order, pivots, durations, loops and
intended filtering/mipmap settings. Confirm tool/version, local versus hosted execution
and current options; obtain installation/download/cost/privacy approval where needed.

Choose one representative asymmetric sprite/frame first. Include a flat-normal control
and a deliberately inverted-Y candidate to prove the lighting diagnostic distinguishes
them. Do not run a README's commands without reviewing the tool and output paths.

## 2. Generate and inspect a candidate

- Keep native pixel resolution; do not upscale just to smooth the normal map.
- Record OpenGL versus DirectX convention. Normals are linear vector data, not sRGB
  colour: use Non-Color in Blender and inspect the actual three.js data-texture colour
  space. Albedo retains its colour interpretation.
- Use controlled left/right/top/bottom lights and an oblique view. Check recognizable
  features react in the expected direction, without inverted or mirrored relief.
- Inspect alpha silhouettes, halos and transparent-texel filtering against bright/dark
  real backgrounds at native size and close-up. Transparency alone is not acceptance.
- Reject or revise detail that mistakes painted shadows/highlights for surface structure.
  Restore temporary diagnostic lighting/materials afterward.

## 3. Animation and atlas gate

Use explicit cell dimensions when required. Verify colour/normal atlases share layout,
frame dimensions/order and alpha registration. Preserve source pivots and timing
explicitly. Inspect all frames and playback under fixed/moving light for flicker,
frame bleed, anchor drift and inconsistent apparent volume.

SpriteFusion documents row-major output, separate colour/normal/metadata files,
default 100 ms timing for PNG sheets and no exported source loop counts. Verify against
the selected version; never replace source timing/loops with defaults. For nonuniform
or trimmed frames, reconcile placement before accepting a uniform-cell workflow.
Test padding/filtering/mips at actual runtime size, not just a full-size atlas preview.

## 4. Delivery decision

Record input/output hashes, generator settings/version, normal convention, alpha/frame
mapping and capture names with provenance. Rejected maps remain diagnostics, not approved
replacements. Standalone previews do not establish game support. After separately approved
integration use `gummy-game-verification` for shader diagnostics, timed playback, relevant
quality tiers, inspected in-game captures and performance where affected.

## Source reading

[SpriteFusion Sprite Normals](https://github.com/Hugo-Dz/spritefusion-sprite-normals)
documents the optional CLI/WASM generator (MIT). This guide is project-authored; no
upstream code is copied, installed or independently exercised. Documentation does not
establish suitability of inferred relief for a particular asset.
