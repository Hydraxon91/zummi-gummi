---
name: gummy-game-verification
description: Verify Gummy Bears code, physics, map, UI and rendering changes using the existing HTTP smoke test, window.__gummy hooks, local physics harness and inspected screenshots. Use before reporting any game change complete, and whenever the user asks to test, verify, check, profile or screenshot the game, even if they do not name this skill. Blender asset work uses gummy-3d-authoring instead.
---

# Gummy Game Verification

Read `AGENTS.md`: Verification & Self-Test Standards, Commit Discipline, Visual Verification
and Performance Discipline, plus the affected module's callers. This skill does not
authorize implementation, installation, commits or pushes. For Blender asset checks
(topology, reference matching, export) use `gummy-3d-authoring`; use this skill for the
in-game result once integration is approved.
Paths below are relative to the project root, not this skill directory.

## Pick checks from the approved change

1. Inspect `git status --short` and the intended diff. Preserve unrelated user work.
2. State the expected outcome and choose observable assertions. Read the current
   `window.__gummy` implementation in `src/app.js` before calling hooks: names,
   parameters and returned fields can change. Do not invent debug methods.
3. Use the existing workflow: HTTP server, smoke test, debug assertions and browser
   captures. There is no package.json, bundler or general unit-test runner to install.

## HTTP smoke check

Use a known running project server or start one as a separate background tool call:

```sh
python3 launch.py --no-open
```

Read its reported port before running the test as a separate call. For port 8000:

```sh
node scripts/smoke.mjs http://localhost:8000
```

Inspect `scripts/smoke.mjs` for its current coverage. It checks the served shell,
modules and WASM delivery; a pass does not establish simulation or visual correctness.
Use HTTP, not file://. Do not kill an existing user server to resolve a port conflict.

## Behaviour and regression checks

- Drive the served app through a browser and verified `window.__gummy` hooks.
  Record concrete outcomes, console errors and non-finite/bounds failures.
- For physics/rig/solver changes, establish a baseline and rerun the applicable
  local `.selftest.html` checks. This harness is gitignored and not guaranteed to
  exist in another checkout. Inspect it before use; if missing, report that gap
  rather than claiming the 16-check suite passed. Never commit it.
- Shared solver changes need existing-bear regression checks, not just a successful
  new-creature demo. Map changes need state-isolation and relevant collision/nav
  assertions. Verify spawn caps and lifecycle behaviour when those paths change.
- Test only approved scope; discovery of a separate defect is not authorization to
  fix it. Record it under Known follow-ups in `ROADMAP.md`, as the Agent Behavioral Rules in
  `AGENTS.md` require.

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

## Visual and performance checks

- Capture before/after, changed-element close-ups and additional angles, with
  relevant time-of-day, mobile layout and quality tiers. Save scratch files under
  `.dev-shots/` and actually view them before reporting completion.
- Capture the baseline before editing; report a missing baseline rather than presenting
  a reconstructed capture as the original state.
- Read `PERFORMANCE.md` for the current profiling method. Compare matching camera,
  population, quality, DPR and render settings. Report measured frame times and
  method; headless rAF is not a reliable basis for a 60 fps claim.
- Label exploratory measurements as exploratory. Claim an improvement only after
  repeated measurements under matching conditions, reporting variability and sample count.
- Do not assume fewer triangles/draw calls implies a frame-time win. Account for
  grass overdraw, transmission and reflection passes using measured results.
- If browser tooling or the required harness is unavailable, distinguish static
  review and smoke checks from behaviour, visual and performance checks not run.

## Handoff

Report changed files, checks actually run, results and remaining limitations.
Update affected living docs within approved scope. Inspect the final diff/status;
follow `AGENTS.md` commit gates and separate push approval. A smoke-test pass does
not validate behavioural instructions in `AGENTS.md` or skill files: check their
paths, commands, cross-references and consistency directly.

## Maintenance

Keep this procedure grounded in `scripts/smoke.mjs`, `src/app.js`, `PERFORMANCE.md`
and actual verification traces, not copied API assumptions. Revise after real tasks.
Avoid duplicating the full standing contract here.

Skill-authoring rationale: https://agentskills.io/skill-creation/best-practices
OpenCode discovery: https://opencode.ai/v2/docs/skills
