---
name: Gummy Game Verification
description: Verify Gummy Bears code, physics, map, UI and rendering changes using the existing HTTP smoke test, window.__gummy hooks, local physics harness and inspected screenshots. Use before reporting game changes complete.
---

# Gummy Game Verification

Read `AGENTS.md` sections 9, 12, 13 and 14 and the affected module's callers.
This skill does not authorize implementation, installation, commits or pushes.
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
  fix it. Follow the Known follow-ups rule in `AGENTS.md`.

## Visual and performance checks

- Capture before/after, changed-element close-ups and additional angles, with
  relevant time-of-day, mobile layout and quality tiers. Save scratch files under
  `.dev-shots/` and actually view them before reporting completion.
- Read `PERFORMANCE.md` for the current profiling method. Compare matching camera,
  population, quality, DPR and render settings. Report measured frame times and
  method; headless rAF is not a reliable basis for a 60 fps claim.
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
