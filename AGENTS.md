# AGENTS.md — Gummy Bears Development Guide

Gummy Bears is a browser game: ES-module JavaScript + **three.js**, with soft-body
jelly physics running on **Box3D** compiled to WebAssembly. There is no bundler, no
`package.json` and no build step — the app is served over HTTP by `launch.py` and
loaded straight from `index.html`. This guide is the standing contract for any agent
working in this repo.

## 1. Agent Behavioral Rules

- **No hallucinated code:** locate and read the current target before proposing or
  editing it; inspect its callers and helpers rather than relying on chat memory. A
  file already read this session need not be re-read solely because a new turn
  started, but re-read after an interruption, unexpected working-tree changes, or any
  reason to doubt its contents.
- **Root-cause debugging:** do not "band-aid" errors with arbitrary null-checks,
  blanket `?:` fallbacks or empty `try/catch`. Trace the fault to its origin (a physics
  step, a WASM bridge call, a nav-mesh footprint, a shader uniform, a map-state field)
  and fix it there.
- **Log potential bugs as you find them.** If you notice a latent defect or a
  plausible edge-case bug while reading or changing code, record it in the
  **Known follow-ups** section of `ROADMAP.md` in the same task — include the
  trigger, the affected file/state and whether it is fixed, deferred or needs a
  decision. Do not leave it only in chat or silently work around it.
- **Style alignment:** mirror the existing syntax, formatting and pattern choices in
  `src/`. Match the surrounding file; do not introduce a new idiom for one change.
- **Hypothesis verification:** before proposing a fix, state the expected behavior, the
  actual behavior, and the evidence that proves your theory — a `window.__gummy` result,
  a console error, a screenshot, or the exact code block.

## 2. Repo Location & Paths

- The repo is exactly **`/Users/hydraxon/Documents/GitHub/GummyBearTest`** — lowercase
  `hydraxon`, capital `GitHub`. **`~/Documents/GitHub/GummyBearTest`** is equivalent and
  preferred inside commands.
- **Never invent or guess a path.** In particular do **not** use misspelled variants such
  as `/Users/draxon/...` or `.../Github/GummyBearTest`. macOS is usually case-insensitive,
  so a wrong-cased path may still *appear* to work — that does not make it correct.
- Prefer `~`-relative paths and run commands from the repo root instead of `cd`-ing into a
  guessed directory. If you are unsure where you are, check with `pwd` or
  `git rev-parse --show-toplevel` before acting.
- Do not operate on worktrees, temp copies or other checkouts of this project unless the
  user explicitly names one.

## 3. Session Rules (apply to every task)

- **Plan gate.** For any task that changes code, config or data: give a short plan first
  (files, decisions, any deviation from `ROADMAP.md`), then wait for an explicit OK before
  implementing. A decision that can change existing results is the user's: put it in the
  plan and wait — never choose it silently.
- **Live progress.** For multi-step tasks, use the todo tool when available to keep the
  sidebar current. Use short, outcome-based items; mark the current item in progress and
  update on completion, blockers or scope changes. Keep pending approval distinct from
  active work. Skip todos for simple questions or single-step tasks.
- **After context compaction:** before resuming edits, confirm the approved scope,
  decisions, pending approvals, verification results and next action. Run
  `git status --short` and re-read files involved in unfinished edits. Treat a summary as
  navigation, not proof of current source or authorization. If a required decision or
  approval is missing or ambiguous, ask rather than reconstruct it.
- **Keep tool output small:** use grep/head/line ranges and `git status --short`; never
  dump whole files or full logs. Avoid routine narration and printed step checklists;
  provide concise updates at meaningful results, blockers or the call-budget boundary.
- **Stop and report** if ~30 tool calls pass without a plan or a result. If an assigned
  time or tool-call limit is approaching, stop at a clean point and report what remains. Do
  not invent remaining-token counts or treat an unspecified budget as nearly exhausted.
- **Flow:** plan → wait for OK → implement → verify → report.
- **Stop after completing the requested task.** Summarize what you did and what you found,
  then wait for the next instruction. Do not start the next task or begin the next item on
  a list unless asked, even if it seems like the obvious next step. An approved work chunk
  counts as one task: finish all its steps, then stop.
- **Avoid over-deliberation:** plan once, then act. Do not re-plan or second-guess a chosen
  approach more than once before executing unless new information genuinely changes the
  picture. Reserve deep reasoning for genuinely ambiguous or destructive decisions. This
  never overrides the 6–7 attempt limit in Approved Work Chunks or the regression stop in 3D
  Asset Authoring.

## 4. Destructive Actions, Commits and Pushes

Before **any destructive action** (file deletions, large refactors, module restructuring,
touching `vendor/box3d/` or the WASM wrapper, dependency/version changes), **committing**,
**or pushing to remote**, you must:

1. Explicitly propose the plan.
2. Explain your reasoning.
3. Wait — the only acceptable confirmation is an explicit **`y`**, **`yes`**, or direct
   written approval from the user. Do not treat follow-up questions, clarifications or
   silence as implied consent.

An approved work chunk pre-authorizes only the specific actions it enumerates; the
individually gated items below still need separate approval.

## 5. Approved Work Chunks (Batched Execution)

The user may approve a **work chunk**: an ordered, explicitly listed set of steps (from
`ROADMAP.md` or stated in chat). A chunk replaces per-step check-ins with a single
end-of-chunk review.

While executing an approved chunk:

1. Perform the listed steps in order, without pausing for confirmation between them.
2. After each step, verify it works (load the app / run the smoke test / run the
   applicable self-test check) before moving on.
3. **If a step fails, diagnose the root cause and try to fix it.** If the fix is in scope,
   apply it and re-verify. Allow up to **seven evidence-driven fix attempts per failing step**;
   six attempts trigger a progress review, not an obligation to exhaust the budget. After two
   unchanged failures, re-establish the target and validate the diagnostic before another edit.
   A fix that introduces a new failure counts as a failed attempt. If you are stuck, the seventh
   attempt fails, or the fix needs something outside the chunk, stop and report with evidence — do
   not commit failing work unless asked.
4. Do not expand scope, refactor unrelated code, or touch anything not enumerated.
5. Follow the approved-chunk row in Commit Discipline for commits, and report at the
   chunk boundary. Do not start the next chunk until instructed.

**Covered by an approved chunk** (when enumerated): creating/editing files, adding a new
`src/*.js` module and wiring it into `index.html`/imports, and running the app, smoke test
and self-test checks. In an approved 3D asset step this also covers incremental `.blend`
checkpoint saves under new filenames (never overwriting an existing file).

**Still individually gated, even inside a chunk:** file deletions, large refactors,
three.js version or other dependency changes, rebuilding or swapping `vendor/box3d/`
WASM, CI/CD workflow changes, `git push`, and anything not listed in the chunk.

## 6. Fix-Classification Gate

Before implementing a fix — whether from a review finding or a bug reported directly —
classify it first:

- **Mechanical fix:** the correct behavior is unambiguous and the change is localized
  (a missing null check, an off-by-one, a clamp that's missing, a wrong constant). Proceed
  normally under the existing commit/approval rules.
- **Design decision wearing a bug-fix costume:** fixing it requires deciding behavior that
  was never specified, or reopens a decision that was previously deferred or recorded
  (`ROADMAP.md`, a `FIXME`/comment noting "out of scope"). Signs this applies: the fix could
  reasonably go two or more ways with real tradeoffs, it touches a shared mechanism (the
  physics step, the metaball surface build, the nav mesh, map/world state, the bear rig),
  or a comment/doc already flagged the question as unresolved.

For the second category: **do not implement a default resolution and move on.** Stop and
present the actual tradeoff — the possible behaviors, which documented decision it reopens,
and your recommendation — and wait for an explicit decision. When in doubt, ask rather than
assume "mechanical".

## 7. Architecture & Tech-Stack Locks

Gummy Bears is offline-first, browser-first, and deliberately dependency-light. Keep the
existing stack and structure.

- **Do not swap the core stack.** Three.js stays the renderer and Box3D stays the physics
  engine. The soft-body Bear/Gummy path stays the metaball/surface-nets surface plus the
  24-body rig. Glass is the documented exception: a skinned GLB with a rigid Box3D sphere
  adapter, not a metaball body. Future hybrids are authored assets registered as species,
  not runtime mesh blends. Diagnose problems inside the current representation rather than
  replacing a library. If the only remedy you can see is an architectural substitution,
  stop, report the evidence and await instruction.
- **Three.js is pinned on purpose.** `index.html` loads `three@0.186.1` from the CDN via an
  import map (`scripts/smoke.mjs` asserts this). Do not bump the version or switch to a
  vendored copy without explicit approval.
- **No unsolicited dependencies or build tooling.** There is no `package.json` and no
  bundler. Do not add one, or add any npm/runtime dependency, unless explicitly requested.
  Node runs `scripts/smoke.mjs`, the committed `tests/` suite via its built-in test runner,
  and local CDP harnesses; do not introduce a third-party test framework for that.
- **Box3D WASM is vendored and pinned** (`vendor/box3d/box3d.js`, `box3d.wasm`,
  `LICENSE`). The wrapper (`scripts/box3d_wrapper.c`) is built by
  `scripts/build-box3d.sh` (needs cmake + Emscripten) into `vendor/box3d/`. The prebuilt
  module is checked in; only touch the wrapper/build when the task explicitly requires it,
  and call that out as a **Major Infrastructure Change** and await confirmation.
- **Respect module ownership.** `src/app.js` owns the renderer, surface, input, UI,
  fireworks and the loop; `field.js` the meadow/pond/grass/props/nav; `sky.js` the
  day/night sky; `launcher.js` the cannon; `world.js` the map registry + per-map state;
  `navmesh.js` navigation; `trees.js`/`bushes.js`/`homes.js`/`studiohouse.js`/`backdrop.js`/
  `horizon.js`/`wind.js`/`fieldshape.js` their named systems. The species layer is split:
  `species.js` is the capability/asset registry, `dna.js` is pure genetics,
  `actorsave.js` owns actor save validation/versioning and collection registration while
  `save.js` owns the save envelope and storage, `actorrecord.js` owns the shared saved-actor
  shape, `assets.js`
  validates manifests and loads manifested GLBs, `npc.js` is the read-only soft-body/Glass
  actor view, `glass.js` owns the Glass Meadow adapter, `msn.js` owns the Studio prototype,
  and `msnrig.js`/`buddyrig.js` own rig data. `behavior.js` owns the shared life decisions,
  `behaviorprofiles.js` owns per-species balance/schedule data, `family.js` owns relations,
  households, lineage, skills, history and schedules, and `interactions.js` owns the shared
  interaction/pair/task protocol. `life.js` remains the age/mating rules; the soft-body host
  is `ai.js`. Put new logic in the matching module rather than growing `app.js`. See the
  target split in `ROADMAP.md`.
  `foodtypes.js` owns food defaults/safety; `food.js` owns placed-source state.
  `floratypes.js` owns tree/bush/rock/home-style definitions; `mapcontent.js` owns
  authored lots and starter populations; `field.js` composes them. `assetstore.js`
  owns catalog source caching/leases; `assets.js` remains the manifest validator/loader.
  Consumers clone skeletons/materials and must not dispose shared geometry/textures.
  Use `assets/catalog.json` IDs, not new loader caches.

  | Actor | Representation | Hot-path owner |
  | --- | --- | --- |
  | Bear / Gummy | 24-body Box3D + metaball surface | `app.js` / `life.js` / `ai.js` |
  | Glass | Skinned GLB + rigid Box3D sphere | `glass.js` / `msn.js` |
  | Future hybrid | Authored asset registered as a species | new species entry; no runtime blend |
- **Performance-shaped structures are not incidental.** Grass/tree/foliage batching,
  instancing, the coarse occupancy mask, and the "no per-frame CPU branch loops" rules are
  load-bearing. Do not reintroduce per-frame per-blade or per-foliage CPU work.
- **Reuse existing helpers before writing new ones.** Search for an existing utility,
  control or debug hook that already does the job; prefer it over a local reimplementation.

## 8. Anti-Churn & Code Preservation

- **Strict scope containment:** do not refactor, rewrite or "clean up" working code outside
  the immediate scope of the assigned task. If you notice messy code or technical debt
  nearby, point it out in chat — do not touch it "while you're in there".
- **No style conversions for aesthetics:** if existing code is functional and matches the
  surrounding style, leave it alone. Do not change working syntax unless aligning newly
  written code to it.
- **Reusable copies must not replace project guidance.** Extracting a universal skill or
  workflow means copying and generalizing it separately. Preserve this project's adapted
  instructions and local resources; replacing them with an adapter or adding an external
  folder dependency requires explicit approval for that change.
- **Preserve the app at every step:** the game must stay loadable. Do not leave the working
  tree in a temporarily broken state at the end of a turn; if you must stop mid-check, say
  so first and name the file and change still to be reverted.
- **Never dump a whole feature in one shot.** Work file-by-file / component-by-component
  rather than pasting monolithic files.

## 9. Verification & Self-Test Standards

There is no third-party unit-test framework. Pure modules use Node's built-in test runner
and plain assertions; stateful and visual behavior is verified by loading the served app
and driving it.

- **Committed pure checks cover the species layer.** `node --test tests` runs the registry,
  gene definitions, DNA, actor save versions/collections, save-validation, actor-view,
  asset-manifest and loader checks. A change to species capabilities, genes, save shape,
  `npc.js` or the asset contract updates these tests in the same scope.
- **The browser regression is the committed behavior check.** With a served build,
  `node scripts/browser-regression.mjs` checks the roster, species counts, lineage, sibling
  play start, parent/child lesson and skill gain, family meal and hunger/history, cross-
  species social, history panel, save/load and the family map/save round trip; `STUDIO=1`
  adds the Studio GLB inventory and the family restore check. It uses a temporary browser
  profile and a configurable `BROWSER_BIN`/`CHROME_BIN`. CI runs the same command in a
  separate blocking job after the smoke test, with SwiftShader fallback enabled. Deeper
  passes use `scripts/race-test.mjs` (desktop, `MOBILE=1`, `LOOK=alpha`) and
  `scripts/glass-test.mjs` through the same portable harness.
- **The committed check is the smoke test.** `scripts/smoke.mjs` boots from a running
  `launch.py` server and asserts the page shell, source modules, licenses, the wasm MIME
  type/magic/exports and 404 handling. Run it as:

  ```bash
  python3 launch.py --no-open
  ```

  ```bash
  node scripts/smoke.mjs http://localhost:8000
  ```

  Start the server in the background as its own call, read the port it reports, then run the
  smoke test as a separate call (use that port in place of 8000). CI runs this on every push
  to `main` and every PR (`.github/workflows/smoke.yml`).
- **Drive behavior through the debug API.** `src/app.js` exposes `window.__gummy` — e.g.
  `stats()`, `sim(sec)`, `bench(frames)`, `fieldInfo()`, `map()`, `setMap()`, `setTime()`,
  `navPath()`, `world()`, `launcher*()`, `start()`, `menu(open)`, `pause(v)`, `paused()`,
  `returnToMenu()`, and camera helpers. Prefer asserting against these over eyeballing the
  scene. Extend `window.__gummy` when new behavior needs a hook.
- **Wait for the module before asserting UI or menu state.** The menu markup ships in
  `index.html`, so a failed or partial module load leaves static DOM with **no handlers**:
  the menu looks normal, buttons do nothing and no console error appears. In a browser
  harness, wait for `window.__gummy` before treating DOM state as evidence. Harnesses that
  do not test the menu should navigate to `?autostart=1` (or click a menu action) and assert
  `__gummy.booted`; otherwise they silently measure the menu. The menu overlay blocks
  canvas pointer input and pausing freezes the animate loop, so dismiss or resume before
  pointer-driven or frame-based checks.
- **A burst of `ERR_CONNECTION_RESET` on module loads is the dev server, not the game.**
  First paint requests ~20 ES modules at once; `launch.py` raises the accept backlog to 64
  for exactly this. If resets return, confirm the running server started after that change
  and restart it; do not record it as an app regression or paper over it with retries.
- **Browser profiles and IndexedDB are test state.** Saves and autosaves persist per browser
  profile, so delete the harness `--user-data-dir` per run and confirm no orphan browser
  still holds it before asserting Continue/load behavior. A leftover autosave makes those
  assertions lie.
- **The smoke test is HTTP-only.** It does not boot the game, exercise the menu or run
  gameplay, so a pass is not evidence for those paths.
- **Shared masks require coordinate parity.** When CPU placement and GPU shading share a
  canvas or data mask, verify world-to-texture mapping, V-axis direction, `flipY`, filtering
  and clamping at asymmetric world points and on both sides of the boundary before tuning
  thresholds. Pointing both consumers at the same texture does not prove they sample
  matching locations.
- **Inspect shader compilation and rendering, not only page errors.** Check renderer
  program diagnostics and console output after the first render, then confirm the material
  is actually visible in a capture. Restore temporary diagnostic colours or geometry
  exactly and verify the restored diff before reporting.
- **Verify motion and persistence over time.** Drift direction and speed, wetting and
  drying, fades and transitions require timed assertions or frame sequences under fixed
  wind, quality and camera conditions. A still image establishes appearance, not direction
  or duration.
- **Keep the physics self-test green.** The "16-check" headless self-test (NaN/bounds,
  bounce counting, pour, head pull/stretch, upright hang, press squash, snap-back, throws,
  release launch, surface validity, vertex limits, bear ceiling) lives in a local,
  gitignored `.selftest.html` harness — do not commit it, and do not treat it as part of
  the repo. Run it (or the applicable subset) before reporting physics work done.
- **New behavior ships with a way to verify it.** Add or extend a self-test check and/or a
  `window.__gummy` hook in the same scope as the change, unless told to defer.
- **Match the check to the layer:** pure species/DNA/save/actor-view logic uses
  `node --test tests`; served-shell/import/tooling changes use the smoke test; actor,
  map, physics and UI behavior uses a browser harness or `__gummy` assertions; visual
  changes use inspected captures; shipped assets use `asset.json` plus the in-game load.
  A smoke pass is not evidence for a behavior or visual claim.
- **Verification is not approval.** Passing the smoke test or a green self-test does not
  authorize a commit, push or tag; those follow Commit Discipline.

## 10. Documentation & Code Sync

- **A change updates the living docs that describe it, in the same change.** If you alter
  behavior, the map/world model, the physics rig or solver, layout rules, controls, tooling
  or performance characteristics, update the affected doc(s) as part of that same approved
  scope and commit.
- **Living docs (keep current):** `README.md`, `ROADMAP.md`, `PERFORMANCE.md`,
  `screenshots/README.md`, `AGENTS.md`, `assets/README.md`, `docs/species-template.md`,
  and the project skills under `.opencode/skills/*/SKILL.md` when a command, harness or
  verification procedure changes.
- **`ROADMAP.md` status is updated at phase boundaries,** not per intermediate step. Keep
  phase tables, the "Status" list and "Tuning defaults" consistent with reality.
- **Historical records are immutable:** `snapshots/*.zip`, dated screenshot sets and
  published notes are never rewritten to match new code; only forward-looking docs are kept
  in sync.
- **Scope note:** updating a doc your change invalidates is part of that change, not "scope
  creep" — but inventing new docs or rewriting unrelated ones is still out of scope. If you
  can't update a doc in scope, say so and record it rather than leaving it wrong.

## 11. Tool-Call Discipline

- **Real tool calls only.** Never write tool-call markup or parameter blocks into a message
  as text. If a call returned no output, or a file/log it should have produced is missing,
  treat it as not executed and re-issue it as a proper call.
- **Keep dependent operations sequential.** Read each result before acting on it.
  Independent read-only searches/reads may run in parallel; otherwise do not batch edits or
  dependent build/git operations.
- **Use the edit/write tools for every file change.** Never modify source through bash (no
  `sed -i`, `perl -pi`, `echo >`, or heredocs). Bash is for running the app/server, the
  smoke test and self-test, `git`, and search.
- **Keep bash commands short** — one command per call, no heredocs, no nested quoting. Start
  `launch.py` in the background and run the smoke test in a separate call.
- **Temporary break-and-restore checks are separate steps.** Make the break, run the check,
  and restore by reversing the exact edit, each as its own call; confirm the restore with
  `git diff` on that file.
- **After a dropped call, or when the user says "continue", verify state before acting.**
  Run `git status --short` and re-read every file you were mid-edit on.
- **Tear down verification processes at the end of a pass.** Stop the headless browser,
  capture harness and any temporary static server you started before reporting; do not leave
  orphaned headless Chrome/Brave instances or temp servers holding GPU, CPU or battery. A
  long-lived server is only acceptable while work is actively in progress, and the process
  still running must be named in the report. Check with `pgrep -fl` before finishing, and
  name any server you intentionally leave up (for example the user's `launch.py`).

## 12. Commit Discipline

This table is the authoritative commit workflow; approval to edit files alone is not an
approved work chunk.

| Work mode | Commit authorization and order |
| --- | --- |
| Ad-hoc task / approved edit scope | Verify → show `git status`, intended diff/stat, verification evidence and proposed message → wait for explicit commit approval → commit. One approval covers one commit. |
| Explicitly approved work chunk (ordered steps, as defined above) | Verify the steps → inspect `git status`, intended diff and recent log → create atomic commits without another commit confirmation → report results, status/stat and commit list at the chunk boundary. Do not commit failing work unless asked. |
| Push, in any mode | Propose the push and wait for its own explicit approval. A commit or chunk approval does not authorize pushing. |

- **Monitor CI after code pushes.** After a push containing code, tooling or CI changes,
  identify the `Smoke test` workflow run for the pushed HEAD and watch it to completion
  within a bounded timeout. Report success, failure, cancellation or pending explicitly. A
  successful `git push` is not evidence that CI passed. On failure, inspect and report the
  failing step; fixes remain separately approval-gated.
- **Documentation-only pushes don't need a CI wait.** Apply this exception only when the
  push changes no code, tests or tooling. Ordinary prose and screenshot/capture notes
  qualify. **`AGENTS.md` is behavioral tooling**, not ordinary prose: validate its
  cross-references and described commands before pushing, and do not describe a smoke-test
  pass as validation of it. Still investigate any unexpected failure.
- **One commit per logical change.** Stage only the files required for that change; keep
  every commit loadable; don't bundle unrelated fixes "while you're in there". Do not churn
  code to force a perfect split — prefer an honest slightly-broader grouping over a
  revert/restore dance.
- **Message style:** a short imperative subject, using the existing convention (`docs:`,
  `ci:`, or a plain `Add ...`). The subject should describe the one thing, not summarize
  everything.

## 13. Visual Verification

- **Define acceptance before editing.** Identify required features, protected state or
  geometry, affected interfaces and the evidence needed to pass. Verify every affected
  criterion and neighboring system, not an arbitrary audit of unrelated work.
- **Match evidence to each claim.** Report topology, reference fidelity, structural
  completeness, connectivity and preservation separately when applicable. Bounds do not
  prove unchanged surfaces; topology does not prove attachment; a hero render does not
  prove complete construction. Name inspected evidence, failures and uncertainty; obscured,
  unsampled or uninspected regions remain unverified.
- **Gate progression on all acceptance criteria.** A green script cannot override a failed
  reference or functional comparison. Retain failed checkpoints only as clearly labeled
  recovery/debug states, never accepted deliveries. Existing regression-stop rules apply.
- For any UI, visual or scene change, capture screenshots from the running app (headless
  Chrome is the established path; `scripts/` and `README.md`/`PERFORMANCE.md` describe the
  method) and **view them before reporting the task complete**.
- **Builder agent: shoot more than one capture per visual pass.** A single hero frame is
  not enough — capture before/after of the change, the changed element in close-up, one or
  two other angles, and the relevant time-of-day or quality tier (dawn/day/dusk/night, UI
  and UI-hidden). Name them `<step>_<what>_<view>.png` (e.g. `x3_no_backdrop_flowers.png`).
- Screenshots do not replace semantic success checks: assert the outcome through
  `window.__gummy` as well, and report anything you could not verify.
- **A smoke or syntax pass is not a visual fix.** Do not report a rendering issue as fixed
  based only on source inspection or passing checks. Name the inspected captures, timed
  assertions and quality/time-of-day conditions that passed, and state what remains
  unverified.
- **Write scratch captures to the gitignored `.dev-shots/` directory** in the project root
  so the user can watch progress. It is never committed; `/tmp` is not a substitute. Only
  curated, intentional captures belong under `screenshots/`, matching the existing set and
  `screenshots/README.md`. Review scratch retention with
  `node scripts/prune-dev-shots.mjs`; it is a dry run unless `--apply` is passed, and it
  never touches `screenshots/`.
- `inspiration/` is gitignored third-party reference material. Never commit it or copy its
  assets into the app.

## 14. Performance Discipline

- **Grass fill/geometry is the dominant GPU cost**, followed by draw-call submission; DPR
  and grass density are the largest levers. The Meadow-detail controls (canopy fullness,
  leaf size, grass coverage, draw distance) and quality tiers are the first response.
- **Do not claim a 60 fps result from a headless run.** Headless uses forced-sync probes
  (`readPixels`, or the `renderProbe` `gl.finish` path) and the compositor caps rAF well
  below real refresh rates — state the method and the frame time, not a frame rate.
- **Re-profile before claiming a performance win**, and record meaningful changes in
  `PERFORMANCE.md` (method, before/after, the retention rule for older numbers).
- **Use `scripts/perf-profile.mjs` for the unified Meadow.** Start `launch.py`, then run it;
  `LOW_QUALITY=1` measures the CI graphics profile. Discard the first probe samples as GPU
  ramp and compare rows from the same session, not across a contended machine.
- Keep the scene's batching/instancing structure; measure, don't guess.

## 15. 3D Asset Authoring

- **Respect resource pauses.** If the user closes Blender for GPU/CPU headroom, do not
  launch live or background Blender, baking or rendering until they authorize resuming.
- **Keep acceptance fixed.** Extra attempts do not authorize looser thresholds, overlap or
  collapsed-UV exceptions, geometry exclusions, or confident names for unresolved regions.
  Propose any acceptance change and obtain approval before using it to publish a delivery.
- **Coverage is not correctness.** Object counts, populated names and successful exports
  establish inventory only. Report structural, visual, semantic and transfer verification
  separately; diagnostic or exception-bearing output is not automatically accepted delivery.
- **Validate diagnostics before repairing assets.** Establish units, coordinate spaces,
  tolerances and expected results on known-good and deliberately failing fixtures. A failed
  helper may indicate a tool defect, not a mesh defect. Reusing the same core calculation is
  not independent verification. Keep experimental helpers distinct from supported tooling.
- **The same scope and approval rules apply to Blender.** Inspect the live file path,
  unsaved state, scene inventory and target objects before editing. Establish a
  recoverable checkpoint before destructive work (a new, incrementally named `.blend`,
  e.g. `name_001.blend`); never silently overwrite a saved asset, clear the scene or change
  unrelated cameras, lights and materials. State units and axis conventions in the plan.
- **Keep source editable.** Preserve source geometry/parameters before applying
  destructive booleans, remeshing or decimation. Use a separate export/evaluated copy
  where appropriate. A requested change to one part must not silently reshape others.
- **Check shared data before edits.** Inventory mesh, material and image users, parents,
  constraints and modifier dependencies. Make an approved independent copy when necessary;
  changing one part must not silently change linked parts or their placement.
- **Calibrate references before modeling.** Record the real target dimensions, measure what
  each reference sheet actually encodes, pick one sheet as the dimensional authority and
  never non-uniformly scale a reference to force agreement. If sheets conflict, that is the
  user's decision (see the Fix-Classification Gate): present the numbers and wait.
  Use visually confirmed structural landmarks and physical silhouettes, not livery, paint
  colours or decal boundaries, for geometry measurements. Lock calibrated references;
  recalibration requires reporting the discrepancy, approval and rechecking dependent
  measurements.
- **Use reference planes for direct comparison.** When calibrated reference planes are
  available, compare the model against them in aligned orthographic views before and after
  each silhouette-changing step. Use a verified see-through or wireframe overlay so both
  model edges and reference features remain visible; hide unrelated reference planes to
  prevent overlapping drawings. Inspect the resulting capture: enabling an X-ray setting
  alone does not prove transparency works. Compare upper and lower silhouettes, openings
  and fixed structural landmarks, not only overall bounds or sampled top heights. Preserve
  reference calibration and restore temporary visibility settings.
- **Fit mating parts without reshaping unrelated geometry.** When trim, flares or other
  attachments must follow an existing surface, verify both gaps and excessive penetration
  across the complete interface, including endpoints. Do not reshape an approved host
  surface merely to accommodate a convenient primitive without explicit approval. Global
  bounds and sparse samples do not establish a correct fit.
- **Validate measurement coordinates before trusting results.** Verify image/UV axes and
  local-to-world transforms against visually identifiable landmarks. Never substitute a
  bounding range for the actual surface being tested. Missing samples are unverified
  regions, not passes; exclude them only with a documented geometric reason.
- **Reference fidelity before optimisation.** Establish the silhouette and proportions
  first. Reduce geometry only while preserving the approved appearance; do not equate
  low-poly with flat shading or choose an arbitrary minimum triangle count.
- **Build for clean topology, one system per step.** Model symmetric parts as one half plus
  Mirror, as closed manifold solids where solid geometry is intended, using modifiers and
  unapplied boolean cutters rather than hand-edited vertices or hand-wound faces.
  Report non-manifold edges, loose vertices
  and flipped faces after every step; all three must be 0 for intended closed solids before
  continuing. Report intentional boundaries on open panels, references and construction
  geometry separately; unexpected non-manifold edges, loose vertices and flipped faces
  must still be 0. Check consistent winding and component orientation with Face Orientation
  captures; positive signed volume alone does not prove correct normals.
- **Regression recovery.** A new defect class requires stopping the current edit chain and
  safely restoring the last good scoped checkpoint before an evidence-based alternative.
  Preserve unrelated live changes; reopening a whole `.blend` requires approval if it would
  discard them. If safe restoration is blocked, stop and report. Attempts follow section 5;
  do not keep patching a failing generator or reset the count by renaming the approach.
- **Locate the target before editing it.** When a change is aimed at something visible,
  confirm the object/component using picking or a raycast tied to the actual capture camera,
  then inspect an isolation capture. Record the object, face/component and world position;
  the first hit may be an occluder, not the target. If camera/pixel correspondence is unknown,
  reproduce the view or ask for a marked target. Names, bounds and proximity alone do not
  establish identity; do not invent coordinates to satisfy this check.
- **Distinguish isolation from replacement.** Temporary diagnostic hiding is allowed within
  scope and must be restored in `finally`. Before deleting, superseding or excluding an
  object from delivery, print its island inventory and identify structural surfaces versus
  details. Preserve the source and verify silhouette and structural completeness afterward.
- **Handle partial-mesh boundaries deliberately.** Prefer complete connected components,
  isolated copies or closed boolean operands. Partial cuts can leave T-junctions or open
  boundaries; verify selection, closure and neighboring topology, then immediately run the
  manifold/loose/flipped check. Do not assume either failure or safety from the operation alone.
- **One coordinate space per build.** State whether coordinates are local or world before
  writing geometry, and never mix them: `v.co` is local, `matrix_world` is not, and a rotated
  object's local Z is not world Z. Build one instance, print its world bounding box against
  the target, then replicate.
- **Locked dimensions are asserts.** After every geometry step, print the locked values
  (roof, nose, tail, wheel size and position, track, overall bounding box) and compare them
  with the locked baseline. A transient pass during editing is still a failure.
- **Two unchanged failures trigger diagnosis, not blind retries.** Reconfirm the visible
  target, material/UV path and measuring tool before a third edit. Continue within section 5's
  seven-attempt ceiling only with new evidence and a stated hypothesis; report attempts and
  remaining uncertainty. More attempts never relax acceptance or authorize unsuitable tools.
- **Report on a call budget.** At twenty tool calls in one turn, post one line: done,
  blocked, next. Do not keep working past it silently.
- **Scripts are not transactions.** After an exception, inspect which edits already ran
  before retrying. Restore temporary diagnostics and state in `finally`; do not rerun a
  partly applied script blindly or treat a failed call as proof that nothing changed.
- **Cleanup requires an explicit manifest.** Propose the exact keep/move/delete sets,
  collision handling and rationale before approval. Preserve accepted checkpoints and
  important baseline/verification evidence; recency or a fixed capture count alone is not
  a retention policy. Inspect destinations and verify the resulting inventory afterward.
- **Bake and export faithfully.** A new noise texture is a replacement, not a bake of the
  original shader. Preserve source graphs, transfer all required channels and compare under
  matching conditions; simplifications require approval. Verify self-contained exports in
  a clean import with original texture paths unavailable, inspect connected maps and view
  the result. A Blender round trip does not prove support in the destination engine.
- **UV guides are deliveries too.** Export from the exact final object/UV layer, record source
  and UV/albedo fingerprints, decode the saved PNG and view an aligned albedo overlay. Header
  recognition, filenames and successful writes do not prove validity or correspondence. Keep
  readable artist boundaries separate from topology overlays; preserve older files explicitly.
- **Asset-library integrations are unvalidated.** Poly Haven, Sketchfab and Poly Pizza are
  enabled in the Blender MCP addon but have not been exercised in this project. Treat them as
  untrusted: record source, author and licence for every imported asset, verify scale, axis
  and origin on import, and do not substitute a library asset for a reference-faithful part
  without approval. A downloaded library item is not evidence of likeness.
- **Inspect, don't infer success.** View front/back, both sides and three-quarter
  captures for shape changes; use neutral solid shading as well as material/rendered
  views. Check topology and, when applicable, rig weights/deformation. A successful
  script or boolean is not proof of likeness, watertightness or good deformation. State the
  noise of any measurement taken from reference images and do not tune below it. Save
  scratch captures under `.dev-shots/` as described in Visual Verification. True orthographic
  captures need a PNG written there; if the session is read-only, ask for a mode switch
  before starting rather than after a failed audit.
- **Every shipped asset has a manifest.** Record the tracked file, SHA-256, byte size,
  scale/axis, bounds, mesh/skin/clip/material inventory, extensions, source and rights
  beside the asset (for example `assets/MSN_Figure/asset.json` and its README), and keep
  `node --test tests` passing against it. A GLB that loads is not a verified delivery.
- **Editable source is not delivery.** The tracked GLB and manifest are reproducible
  deliverables; local `.blend` checkpoints are not backups. Record the authoritative
  checkpoint and keep an external copy, or add a zipped snapshot with explicit approval.
- **Generated assets need a preflight.** `generate_3d` may cost a credit and creates one
  object, not a scene. Confirm the target, provider and cost before using it; generation
  is not topology, material, reference or in-game verification.
- **Separate delivery states.** Report whether work exists only in the live scene,
  is saved to a `.blend`, is exported, or is verified in-game. Asset authoring does
  not authorize game integration. Measure evaluated/exported triangles and vertices,
  check export material support, and validate exports before claiming game readiness.
- **Blender scripting exception to Tool-Call Discipline:** Blender MCP Python may edit the
  approved scene and save/export approved assets. Repository source/config/document
  edits still use file-edit tools; MCP is not an alternative filesystem editor.
- **Load the relevant project skill:** `gummy-3d-authoring` for Blender/asset work;
  `gummy-game-verification` for game verification. Skills supply procedures, not
  additional authorization, and do not override this guide.
