# Rendering and visual verification

Extracted project procedure; follow the parent skill's evidence stages and
[browser prerequisites](browser-harness.md). Paths are repo-relative.

## Shared masks and coordinate parity

- When the same mask drives CPU placement and a GPU shader, compare samples at several
  **asymmetric** world points, not just at the centre or along one axis. Verify the
  world-to-UV formula, V-axis direction, `flipY`, filtering, wrapping and clamp behaviour
  for both consumers.
- Test both sides of the visible boundary and at least one location where a mirrored or
  offset sample would land on unrelated geometry. Reconcile coordinates before changing
  thresholds, density, alpha or other symptom-level values.
- Keep a debug hook only when it remains useful; otherwise remove temporary probes and
  confirm the restored file with `git diff`.

## Shader compile and render checks

- After adding or changing a shader, inspect renderer program diagnostics or the browser's
  shader/WebGL errors in addition to `Runtime.exceptionThrown` and console logs. A reserved
  GLSL word, missing uniform or invalid varying can leave a material absent without a page
  exception.
- Confirm the material is visible in an inspected capture at the expected location. For a
  debug colour or temporary height change, capture once to prove placement, then restore
  the exact edit and recheck the diff.
- Check relevant quality paths, Toon on/off where supported, and day/night lighting; custom
  shader materials may intentionally bypass a material-conversion toggle.

## Timed behaviour checks

- Verify motion direction, speed, wetting, drying, fades and persistence with timed
  observations or frame sequences under fixed camera, wind, quality and time-of-day
  conditions. A still image does not establish direction or duration.
- Exercise calm, moderate and strong wind, plus at least one reversal where relevant.
  Assert any available `window.__gummy` state at known elapsed times; otherwise save a
  numbered sequence under `.dev-shots/` and inspect the movement.
- For shoreline and blending changes, check the boundary at close range from multiple
  angles with foam present and after it retreats, and confirm there is no seam, gap,
  hard colour step or overgrown bank.

## Captures and unavailable evidence

- Capture before/after, changed-element close-ups and additional angles, with
  relevant time-of-day, mobile layout and quality tiers. Save scratch files under
  `.dev-shots/` and actually view them before reporting completion.
- Capture the baseline before editing; report a missing baseline rather than presenting
  a reconstructed capture as the original state.
- If browser tooling or the required harness is unavailable, distinguish static
  review and smoke checks from behaviour, visual and performance checks not run.

Also inspect sprite/icon edges at native and enlarged sizes over light and dark real
backgrounds, per `AGENTS.md`. A transparent file does not prove absence of backing,
fringe, halo or blend seams. Use [UI/input](ui-input.md) for interactive/layout changes,
[performance](performance.md) for speed claims and the 3D authoring sprite-normal
reference when an approved task changes inferred normals. None substitutes for the others.
