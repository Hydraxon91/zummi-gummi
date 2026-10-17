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
  dump whole files or full logs. Do not narrate progress or print step checklists.
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
  picture. Reserve deep reasoning for genuinely ambiguous or destructive decisions.

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
   apply it and re-verify. If you are stuck, or the fix needs something outside the chunk,
   stop and report with evidence — do not commit failing work unless asked.
4. Do not expand scope, refactor unrelated code, or touch anything not enumerated.
5. Follow the approved-chunk row in Commit Discipline for commits, and report at the
   chunk boundary. Do not start the next chunk until instructed.

**Covered by an approved chunk** (when enumerated): creating/editing files, adding a new
`src/*.js` module and wiring it into `index.html`/imports, and running the app, smoke test
and self-test checks.

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

- **Do not swap the core stack.** Three.js stays the renderer, Box3D stays the physics
  engine, and the metaball/surface-nets surface plus the 24-body rig stay the simulation
  approach. Diagnose problems inside the current stack rather than replacing a library.
  If the only remedy you can see is an architectural substitution, stop, report the
  evidence and await instruction.
- **Three.js is pinned on purpose.** `index.html` loads `three@0.186.1` from the CDN via an
  import map (`scripts/smoke.mjs` asserts this). Do not bump the version or switch to a
  vendored copy without explicit approval.
- **No unsolicited dependencies or build tooling.** There is no `package.json` and no
  bundler. Do not add one, or add any npm/runtime dependency, unless explicitly requested.
  Node is used only to run `scripts/smoke.mjs`.
- **Box3D WASM is vendored and pinned** (`vendor/box3d/box3d.js`, `box3d.wasm`,
  `LICENSE`). The wrapper (`scripts/box3d_wrapper.c`) is built by
  `scripts/build-box3d.sh` (needs cmake + Emscripten) into `vendor/box3d/`. The prebuilt
  module is checked in; only touch the wrapper/build when the task explicitly requires it,
  and call that out as a **Major Infrastructure Change** and await confirmation.
- **Respect module ownership.** `src/app.js` owns the renderer, surface, input, UI,
  fireworks and the loop; `field.js` the meadow/pond/grass/props/nav; `sky.js` the
  day/night sky; `launcher.js` the cannon; `world.js` the map registry + per-map state;
  `navmesh.js` navigation; `trees.js`/`bushes.js`/`homes.js`/`studiohouse.js`/`backdrop.js`/
  `horizon.js`/`wind.js`/`fieldshape.js` their named systems. Put new logic in the matching
  module rather than growing `app.js`. See the target split in `ROADMAP.md`.
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
- **Preserve the app at every step:** the game must stay loadable. Do not leave the working
  tree in a temporarily broken state at the end of a turn; if you must stop mid-check, say
  so first and name the file and change still to be reverted.
- **Never dump a whole feature in one shot.** Work file-by-file / component-by-component
  rather than pasting monolithic files.

## 9. Verification & Self-Test Standards

There is no unit-test framework. Verification is done by loading the served app and
driving it.

- **The committed check is the smoke test.** `scripts/smoke.mjs` boots from a running
  `launch.py` server and asserts the page shell, source modules, licenses, the wasm MIME
  type/magic/exports and 404 handling. Run it as:

  ```bash
  python3 launch.py --no-open &
  node scripts/smoke.mjs http://localhost:8000
  ```

  Start the server as its own call and run the smoke test as a separate call. CI runs this
  on every push to `main` and every PR (`.github/workflows/smoke.yml`).
- **Drive behavior through the debug API.** `src/app.js` exposes `window.__gummy` — e.g.
  `stats()`, `sim(sec)`, `bench(frames)`, `fieldInfo()`, `map()`, `setMap()`, `setTime()`,
  `navPath()`, `world()`, `launcher*()` and camera helpers. Prefer asserting against these
  over eyeballing the scene. Extend `window.__gummy` when new behavior needs a hook.
- **Keep the physics self-test green.** The "16-check" headless self-test (NaN/bounds,
  bounce counting, pour, head pull/stretch, upright hang, press squash, snap-back, throws,
  release launch, surface validity, vertex limits, bear ceiling) lives in a local,
  gitignored `.selftest.html` harness — do not commit it, and do not treat it as part of
  the repo. Run it (or the applicable subset) before reporting physics work done.
- **New behavior ships with a way to verify it.** Add or extend a self-test check and/or a
  `window.__gummy` hook in the same scope as the change, unless told to defer.
- **Verification is not approval.** Passing the smoke test or a green self-test does not
  authorize a commit, push or tag; those follow Commit Discipline.

## 10. Documentation & Code Sync

- **A change updates the living docs that describe it, in the same change.** If you alter
  behavior, the map/world model, the physics rig or solver, layout rules, controls, tooling
  or performance characteristics, update the affected doc(s) as part of that same approved
  scope and commit.
- **Living docs (keep current):** `README.md`, `ROADMAP.md`, `PERFORMANCE.md`,
  `screenshots/README.md`, `AGENTS.md`.
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

- For any UI, visual or scene change, capture screenshots from the running app (headless
  Chrome is the established path; `scripts/` and `README.md`/`PERFORMANCE.md` describe the
  method) and **view them before reporting the task complete**.
- **Builder agent: shoot more than one capture per visual pass.** A single hero frame is
  not enough — capture before/after of the change, the changed element in close-up, one or
  two other angles, and the relevant time-of-day or quality tier (dawn/day/dusk/night, UI
  and UI-hidden). Name them `<step>_<what>_<view>.png` (e.g. `x3_no_backdrop_flowers.png`).
- Screenshots do not replace semantic success checks: assert the outcome through
  `window.__gummy` as well, and report anything you could not verify.
- **Write scratch captures to the gitignored `.dev-shots/` directory** in the project root
  so the user can watch progress. It is never committed; `/tmp` is not a substitute. Only
  curated, intentional captures belong under `screenshots/`, matching the existing set and
  `screenshots/README.md`.
- `inspiration/` is gitignored third-party reference material. Never commit it or copy its
  assets into the app.

## 14. Performance Discipline

- **Grass fill/geometry is the dominant GPU cost**, followed by draw-call submission; DPR
  and grass density are the largest levers. The Meadow-detail controls (canopy fullness,
  leaf size, grass coverage, draw distance) and quality tiers are the first response.
- **Do not claim a 60 fps result from a headless run.** Headless uses forced-sync
  `readPixels`, and the compositor caps rAF well below real refresh rates — state the
  method and the frame time, not a frame rate.
- **Re-profile before claiming a performance win**, and record meaningful changes in
  `PERFORMANCE.md` (method, before/after, the retention rule for older numbers).
- Keep the scene's batching/instancing structure; measure, don't guess.
