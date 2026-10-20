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

Last reviewed: 2026-10-19. Update this line when the commands, harnesses or coverage below
materially change; `AGENTS.md` remains the policy source.

## Pick checks from the approved change

1. Inspect `git status --short` and the intended diff. Preserve unrelated user work.
2. State the expected outcome and choose observable assertions. Read the current
   `window.__gummy` implementation in `src/app.js` before calling hooks: names,
   parameters and returned fields can change. Do not invent debug methods.
3. Use the existing workflow: committed Node tests, HTTP server, smoke test, debug
   assertions and browser captures. There is no package.json or bundler; use Node's
   built-in test runner, not a new dependency.

## Pure checks

Run the committed species/DNA/save/actor-view/asset checks before touching the browser:

```sh
node --test tests
```

These are deterministic and run in CI. They cover the registry capabilities and
compatibility matrix, genome defaults/combination/clamping, all three reproduction gates,
save validation (including unsupported top-level and genome versions), mixed soft-body/Glass
actor-view queries, the `assets/MSN_Figure/asset.json` GLB manifest and the manifest loader.
Food fixtures cover safety/defaults/claim/respawn/save parity; asset-store tests cover
catalog validation, concurrent loading, error/retry, leases and deduplicated disposal.
Add a test in the same approved scope when the underlying rule changes.

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
modules, the asset manifest and WASM delivery; a pass does not establish simulation or
visual correctness. Use HTTP, not file://. Do not kill an existing user server to
resolve a port conflict.

## Browser regression

With the server running:

```sh
node scripts/browser-regression.mjs
```

It boots `?autostart=1`, seeds randomness, checks the 10-row roster, 8 soft-body
actors, 2 Glass actors, starter lineage, a sibling play start and save/load.
Use `STUDIO=1` to load the Studio Glass prototype and verify 3 meshes/9 bones/10
clips, and `SHOTS=1` to write a capture. The harness uses a temporary browser
profile and `BROWSER_BIN`/`CHROME_BIN` when the browser is not in a standard
location. CI runs the same regression with SwiftShader fallback, 90-second
startup waits, `LOW_QUALITY=1` and a 900×600 viewport, so slow software rendering
does not read as an asset failure. Use the committed `scripts/race-test.mjs` and
`scripts/glass-test.mjs` for deeper Studio/Glass lifecycle passes.

`STUDIO=1` also returns to Meadow after the transition completes and asserts that
`__gummy.assets()` still reports one GLB load with three live leases (one retained
Studio instance and two Meadow instances). Cached GLB bytes are not GPU-memory usage.
For store changes also check independent skeletons/materials, source texture lifetime,
save/load, and source reuse over repeated map switches. For food changes check visibility
on consume/restore and preserve source IDs, balance values and seeded respawn draws.

## Boot, menu and session state

- The app opens on a DOM menu and boots lazily. A harness that is not testing the menu
  must navigate with `?autostart=1` (or click a menu action) and assert
  `window.__gummy.booted`; otherwise it measures the menu and reports nothing.
- Wait for `!!window.__gummy` before asserting DOM or gameplay state. If `app.js` fails or
  loads partially, the static menu still renders, its buttons have no handlers and no page
  error is raised. Treat that as a load failure, not a UI result.
- The menu overlay blocks canvas pointer input, and pausing returns early from the animate
  loop. Dismiss the menu and resume before pointer-driven or frame-based assertions; check
  `paused()` after Escape/Resume, and remember that Return to menu writes an autosave.
- Saves and autosaves live in IndexedDB per browser profile. Delete the harness
  `--user-data-dir` for each run and confirm no orphan browser still holds it, or
  Continue/load assertions read stale state.
- Bursts of `net::ERR_CONNECTION_RESET` while loading the ~20 ES modules are the dev
  server's accept backlog, not the game. `launch.py` sets `request_queue_size = 64`; if
  resets appear, confirm the running server started after that change and restart it
  instead of retrying the test.

## Browser harness pattern

Captures and assertions are driven by a **Node harness that launches the browser and
speaks CDP to it** — not by raw CLI flags. `--headless --screenshot`, `--dump-dom` and
`--virtual-time-budget` against this app hang or return nothing, because the page keeps a
rAF loop alive so virtual time never expires.

Use `scripts/browser-harness.mjs` for browser launch, CDP connection, page setup, waits,
evaluation and screenshots. It uses a temporary profile, resolves Chrome/Chromium through
`BROWSER_BIN`/`CHROME_BIN`, and tears the profile down in `finally`. The committed deep
harnesses share it:

- `scripts/race-test.mjs` — Meadow species/cross-species/birth checks, Studio MSN/Gummy/
  Glass paths, cast filters, interaction, save/load and persistence. Supports `LOOK=alpha`
  and `MOBILE=1`.
- `scripts/glass-test.mjs` — Glass hover, grab/throw/tumble, shelter, family/sibling play,
  visits, births and save/load.

For targeted Glass debugging, use `SCENARIO=drag|growth|social|hover|needs|night`
or `SCENARIO=lifecycle` (the latter retains birth/family/save prerequisites).
The default `SCENARIO=all` runs every group. `SHOTS=0 FAST=1` skips behavioral
surface rebuilds and pauses background rendering after real-time pointer checks;
it does not change physics steps or day length. Keep the normal lane for mesh and
visual acceptance. `GAME_URL=... node scripts/glass-fast-parity.mjs` checks identical
fixed-step actor state/positions and RNG with rebuilds on/off; run for both
`BEHAVIORS=modules` and `BEHAVIORS=legacy` when changing this fast path.
Glass JSON reports contain per-evaluation `timings`. Use targeted checks during
iteration, then the full suite once per engine; repeat reliability samples only
when required and stop at the first failure rather than retrying for green.

Other one-off harnesses belong in the gitignored `.dev-shots/`; import the same helper
instead of duplicating `spawn`/WebSocket setup.

Required structure:

1. `launchBrowser({ port })` and `connectBrowser(launched)`.
2. `openPage({ url, width, height, mobile, initScript })`; wait for `window.__gummy.booted`
   or the harness-specific ready flag before asserting. An unready page looks valid.
3. Use `page.evaluate`, `page.waitFor`, `page.screenshot`, and `browser.send` for CDP
   methods not wrapped by the helper.
4. Read `browser.pageErrors` instead of maintaining a second console listener.
5. Write a JSON report next to the captures and call `await browser.close()` in `finally`.
6. Print one tagged line per result (`STATE`/`PERF`/`INFO`/`TINT`/`ERRORS`/`STOP`) so a
   caller can `grep` them, for example:

```sh
env TAG=g1 node scripts/race-test.mjs 2>&1 | grep -E "INFO|STATE|ERRORS|STOP" | cut -c1-1600
env TAG=g1 LOOK=alpha node scripts/race-test.mjs
env TAG=g1 MOBILE=1 node scripts/race-test.mjs
```

Keep one check per section rather than printing the whole report. A page-under-test may
expose a small `window.__X` API (ready flag, `set()`, material getters) purely so the
harness can pose and probe it deterministically. The portable helper and the two deep
harnesses are committed; scratch captures stay in `.dev-shots/`.

Scratch retention: `node scripts/prune-dev-shots.mjs` is a dry run of `.png`/`.json`
files older than `DAYS` (default 14). `node scripts/prune-dev-shots.mjs --apply` deletes
those candidates. Curated files under `screenshots/` are never considered.

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

## Species / DNA / Glass regression matrix

When the change touches a species definition, genome, save payload or shared actor view,
cover the applicable rows rather than only the happy path:

| Area | Checks |
| --- | --- |
| Registry | bear/Gummy/Glass definitions, capabilities, reciprocal compatibility, fixture registration |
| DNA | defaults, all pair combinations, mutation/clamping, phenotype, material/colour inheritance |
| Reproduction | current gate for every pair, child species/rig/phenotype, deferred hybrid target |
| Save | old save without genome, genome round-trip, future save/genome rejection, Glass optional fields |
| Actor view | mixed soft-body/Glass `all`/`active`/`byUid`/`homeResidents` |
| Asset loader | manifest schema/path validation, GLB resolution, mesh/bone/material/clip count match |
| Meadow | cross-species birth, parent/sibling bonds and play, family lineage UI, visits, shelter/door fade |
| Studio | Glass/Gummy load, 3 meshes/9 bones/10 clips, cast filters, `?race=off` |
| UI | roster rows and family status, save/continue, desktop and mobile |

Use the committed `tests/` for the pure rows; use `scripts/race-test.mjs` and
`scripts/glass-test.mjs` for the browser rows. Re-run both desktop and mobile harness
passes, plus `LOOK=alpha` when the Glass fallback path changes.

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
