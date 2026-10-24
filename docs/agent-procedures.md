# Agent procedures — task-specific reference

Read the sections routed by `AGENTS.md`, not this whole reference. Paths are
repository-relative. Source authoring belongs to AssetWorkshop; this guide owns
game work and separately approved destination intake/integration.

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
- **No notes in procedure files.** `AGENTS.md` and `SKILL.md` state rules and procedures;
  they are not journals. Do not add worked examples from a session, dated incident
  narratives, measured trial results, case-specific dimensions or file paths, or
  "here is what happened last time" commentary. Those belong in a topic doc under `docs/`
  (for example `docs/3d-authoring-notes.md`, `docs/comfyui-materials.md`). Where the rule
  would otherwise lose context, keep one short pointer to that doc. If you catch yourself
  writing a story, a measurement table or a failure history into a skill, stop and move
  it.
- **Known-broken features block delivery.** A required feature that is absent, collapsed or
  contradicted by the reference is a **failure**, never a "residual", a "known limitation" or
  an "accepted trade-off". Do not bake, export, approve or report delivered while such a
  defect stands. Residuals are only for out-of-scope or unverifiable items and must name what
  is missing; "seat cavity lost under smoothing" is a defect, not a residual. If a rebuild
  destroys an earlier working feature, restore or fix it before continuing — do not regress
  to a simpler shape and ship it.
- **Style alignment:** mirror the existing syntax, formatting and pattern choices in
  `src/`. Match the surrounding file; do not introduce a new idiom for one change.
- **Module configuration is a behavioral contract.** Declare supported configuration
  and disable/re-enable semantics before exposing a module toggle. Verify resolved
  global/species/actor scope, admission, existing activity and cleanup; a successful
  setter return is not proof. Essential needs must not inherit optional-activity
  disabling policies. Follow the verification skill's behavior/module procedure.
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
  never overrides the repair limits, explicit continuation approvals or regression stop
   in Approved Work Chunks.

### Coding delegation and independent review

The project-local `coder` is the bounded implementation worker; the parent
reviewer session owns planning, behavioral decisions and independent review.
The coder's pinned model is defined in `.opencode/agents/coder.md`. No delegation
changes global models or permits work excluded by the current mode or approvals.

1. **Approve owner and scope — one step per coder.** Before a step's first edit,
   propose the bounded outcome, paths, invariants, acceptance checks and
   implementation owner. One explicit approval can cover the step and `coder`
   ownership. Approval of this workflow alone does not authorize any M0–M23
   implementation or repair. Do not combine adjacent roadmap steps in one brief.
   Delegate one step, review it, return corrections to the same coder, and only
   after it passes start a **new coder session** for the next step. A batch
   approval is a sequence of separately gated steps, not one coder assignment.
2. **Capture starting state.** Record HEAD, status and preserved staged/unstaged
   diffs plus relevant untracked contents before each delegation/correction.
   A clean HEAD is sufficient when there are no local changes. Do not stash,
   reset or overwrite user work to manufacture isolation.
3. **Supply a structured brief.** Children start fresh. Every brief must contain:
   - **Objective and approval:** user-approved scope/owner, settled decisions and
     observable acceptance criteria; missing approval returns to the parent.
   - **Ownership and targets:** exact working directory, allowed file writes,
     parent-owned paths and exclusions, including test and doc ownership.
   - **Starting state:** HEAD/preserved-work baseline, verified facts, prior
     evidence and unknowns; allowed read-only preflight for those unknowns.
   - **Procedure and verification:** applicable procedure/skill/reference paths,
     producer/consumer contracts, focused and downstream checks with timeouts.
   - **Limits and recovery:** supplied time/call caps if any, existing criterion
     repair limits, stop conditions, permitted cleanup and artifact paths. Do
     not invent budgets or reset repair counts by starting another worker.
   - **Return evidence:** actual path delta, criteria outcomes, commands/results,
     artifacts, blockers, remaining checks and owned-process cleanup.
4. **Serialize writers.** The coder owns the assigned implementation, tests and
   feature docs. While it runs, the parent does not edit or mutate Git, launch
   competing game/Blender verification or start another writer. Independent
   read-only research is allowed. Parallel coding requires a separate plan and
   explicit approval; this workflow defaults to one coder. The coder cannot
   delegate further or stage/commit/push. Git work waits until the worker stops.
   Background delegation is the default for approved coder work: launch the
   `subagent` tool with `background: true` so the parent stays available for
   conversation. While it runs, the parent may chat, plan and do independent
   read-only research, but not edit, mutate Git or launch competing verification.
   Do not poll for completion; start independent review from the completion
   notification. Discussion does not change an active worker's scope without a
   coordinated handoff.
5. **Inspect the return.** Compare the actual staged/unstaged/untracked delta
   against the baseline and allowed paths, including additions/deletions/renames.
   Stop on unexpected changes; preserve them rather than automatically reverting.
   Then independently read changed code, affected callers/helpers and evidence;
   run targeted closure checks when authorized. A child's summary or green exit
   code is not independent review. State evidence gaps explicitly.
6. **Classify corrections.** Give findings stable IDs, source evidence and
   expected versus actual behavior. Mechanical repairs may be delegated within
   an explicitly approved correction loop; otherwise ask for fix approval.
   Behavioral/API/persistence choices return to the user under §6. Every round
   gets an updated baseline, exact paths and regression checks. Ownership changes
   need an explicit handoff; do not silently mix parent and coder edits.
7. **Close and stop.** Parent consolidates review results and roadmap status by
   default; explicitly assigned feature docs may be coder-owned. Report completed,
   failed, blocked and unverified criteria separately. No automatic next chunk,
   commit or push. Preserve §4/§12 publication gates and all §5 repair limits.

8. **Dependency map and scope expansion.** Before editing, the coder must map
   every source, test, fixture and doc required by the approved behavior. If a
   required file is not in the allowed set, stop and request expansion from the
   parent before touching it. A necessary edit is not retroactive authorization;
   never describe an unlisted path as authorized. The parent records the approved
   expansion and updates the baseline before work resumes.
9. **Evidence ledger and labels.** For runtime/verification chunks, retain a
   bounded ledger under `.dev-shots/<chunk>/` containing baseline HEAD, hashes,
   commands, exit codes, concise results and cleanup. Scratch evidence is not
   committed. Label source-inspected, host-run, independently rerun, fixed-RNG
   and seeded evidence separately; a constant RNG is not a seeded run.
10. **Verification tiers.** The coder runs focused tests, affected host checks,
   the full Node suite and short parity where applicable. The parent reviews the
   actual diff and runs targeted closure plus the full Node suite; it reruns a
    browser/host check when that boundary changed. Run a fresh long parity once
   after runtime settles. Test-only corrections may reuse unchanged runtime
   evidence; do not rerun heavy suites merely to repeat a green result.
11. **Review findings are evidence-bound.** The parent verifies a claimed API,
    caller or failure against source before delegating a correction. Findings use
    stable IDs, expected versus actual behavior and exact regression checks.

After interruption, establish whether the previous worker stopped and inspect
its actual state before launching a replacement. Never treat interruption as
rollback or run competing workers over uncertain writes. Review remains read-only
in Plan mode; it cannot delegate writes as a workaround.

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
   not commit failing work unless asked. Additional attempts need explicit bounded
   continuation approval, not a renamed task or replacement worker.
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

### Efficient feature batches

- **Approve a bounded outcome once.** Set behavior rules, affected files/systems,
  persistence decisions, acceptance criteria and exclusions before implementation.
  Execute the approved chunk without routine per-step check-ins; localized,
  evidence-driven repairs within that scope are covered. New gameplay decisions and
  individually gated actions still require approval.
- **Map requirements to checks before editing.** For interactions, include eligibility,
  acceptance/refusal, exactly-once effects, essential-needs priority, cancellation,
  claim/pair cleanup, save/load, map/new-game isolation, supported representations,
  feature disable/re-enable, enabled determinism/RNG and disabled parity. Mark each
  criterion applicable, excluded with a reason, or pending; do not discover the missing
  acceptance list only after calling the feature complete.
- **Stage verification, not standards.** During edits, run affected Node tests and one
  targeted browser/parity scenario. At feature review, run the full Node suite, smoke,
  affected browser suites, inspected captures where applicable and short all-race parity.
  At the batch boundary, run one fresh long parity matrix after simulation edits and
  focused fixes are complete. Verify each intermediate step at its affected layer;
  this does not require the entire acceptance suite after every step.
- **Invalidate evidence by dependency.** Simulation changes invalidate affected behavior
  evidence and long acceptance; UI-only changes require affected UI/browser/capture
  checks, not automatically another simulation matrix. Prose-only changes do not
  invalidate executed code evidence. Test-only edits require the changed tests and any
  acceptance whose assertions they changed; never call stale evidence current.
- **Test enabled features separately.** Disabled exact parity, enabled seeded
  determinism/RNG accounting and functional acceptance establish different claims.
  A long matrix with a feature off does not verify it on. Never filter away unexpected
  mismatches or change retention/timing/gameplay policies solely to make parity pass;
  apply the Fix-Classification Gate.
- **Use deterministic fixtures without bypassing the target.** Arrange prerequisites
  through existing helpers, then exercise real eligibility, transitions and cleanup.
  A forced state demonstrates only the downstream path; it cannot prove natural
  selection or acceptance. Include a natural opportunity check when that is a claim.
- **Avoid verification contention.** Parallelize independent lightweight checks, but
  serialize GPU-heavy browsers and avoid overlapping them with long CPU matrices.
  Reuse a temporary server during active work; browser profiles remain isolated per
  test. Tear down owned processes once the pass/batch ends, including on failure.
- **Commit verified logical units.** Prefer data/save contract, behavior/UI and final
  closeout boundaries when they are independently loadable. Do not create premature
  completion commits or churn working changes merely to force that split. Existing
  commit authorization rules remain authoritative; no push is implied.
- **Time-box honestly.** An agreed hour is a target, not a guarantee or permission to
  weaken acceptance. At the boundary report implemented, verified, blocked and deferred
  work separately, with evidence and remaining checks. Do not start the next feature.

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
  `saveformat.js` owns save-envelope validation/normalization, `save.js` owns IndexedDB
  storage and re-exports the format API, `actorrecord.js` owns the shared saved-actor
  shape, `assets.js`
  validates manifests and loads manifested GLBs, `npc.js` is the read-only soft-body/Glass
  actor view, `glass.js` owns the Glass Meadow adapter, `msn.js` owns the Studio prototype,
  and `msnrig.js`/`buddyrig.js` own rig data. `src/behaviors/` owns the shared life
  decisions: `engine.js` is the default tick/needs/opportunity host, `index.js` selects
  `modules` or the legacy oracle (`?behaviors=legacy`), and each behavior is a module
  (`rest`, `forage`, `water`, `wander`, `social`, `mate`, `conflict`, `hive`, `flee`,
  `follow`, `stargaze`, `family`, `directives`, `adoption`, `gifting`, `pairActivities`,
  `relationships`, `groupActivities`). `adoption.js` owns
  automatic guardians and the `guardianUid` save field. `relationshipview.js` owns the
  read-only selected-actor relationship model, `relationships.js` owns persistent rivalry
  and partnership records, and `foodportions.js` owns carried/dropped gift portions.
  `gifting.js` owns physical food collection/handover and the
  `lastGiftDay` save field. `affection.js`/`relationships.js`/`groups.js` own chat,
  cuddle, reconciliation, partnership and group activity states. `giftvisuals.js`
  mirrors portion records in the scene; the behavior layer owns their identity.
  `behavior.js` is the untouched legacy
  reference implementation, `behaviorprofiles.js` owns per-species balance/schedule data,
  `family.js` owns relations,
  households, lineage, skills, history and schedules, and `interactions.js` owns the shared
  interaction/pair/task protocol. `life.js` remains the age/mating rules; the soft-body host
  is `ai.js`. Put new logic in the matching module rather than growing `app.js`. Read
  `src/behaviors/README.md` before adding a behavior, a race or a module config block; see
  the target split in `ROADMAP.md`.
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
  separate blocking job after the smoke test, then `scripts/social-test.mjs` and
  `scripts/gifting-test.mjs`, with SwiftShader fallback enabled. Deeper
  passes use `scripts/race-test.mjs` (desktop, `MOBILE=1`, `LOOK=alpha`) and
  `scripts/glass-test.mjs` through the same portable harness. Behavior changes also run
  `node scripts/behavior-parity.mjs --days 2 --seeds 1,2,3` (or `--long`), the seeded
  `scripts/behavior-browser-parity.mjs` trace, and the same browser suites with
  `BEHAVIORS=legacy` and `BEHAVIORS=modules`.
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
  `docs/comfyui-materials.md`, `docs/3d-authoring-notes.md`,
  `docs/unresolved-register.md`, and the project skills under
  `.opencode/skills/*/SKILL.md` when a command, harness or verification procedure changes.
- **Unresolved findings have a stable register entry.** Every discovered defect,
  verification gap, deferred decision, unsupported path or flake gets or updates an ID in
  `docs/unresolved-register.md` before the step closes. Keep the evidence in the owning
  topic document and link it from the register. Recording is not fix approval; retain
  resolved entries with their deciding evidence and never delete the trigger.
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
- For any **game** UI, visual or scene change, capture screenshots from the running app (headless
  Chrome is the established path; `scripts/` and `README.md`/`PERFORMANCE.md` describe the
  method) and **view them before reporting the task complete**.
- **Builder agent: shoot more than one capture per acceptance visual pass.** A single hero
  frame is not enough at acceptance time — capture before/after of the change, the changed
  element in close-up, one or two other angles, and the relevant time-of-day or quality
  tier (dawn/day/dusk/night, UI and UI-hidden). Name captures
  `<step>_<what>_<view>.png` (e.g. `x3_no_backdrop_flowers.png`).
- **Stage render work by decision, not by edit.** While constructing, use transform/bounds
  checks and viewport, solid-shading or material-preview captures. Run a multi-angle
  Cycles/EEVEE batch when orientation, proportions, assembly and materials are settled, or
  when one targeted render is needed to diagnose a render-only effect such as
  transmission, reflection, a baked normal or a render-only artifact. Do not rerender
  unrelated views after a small change. Two unchanged visual results mean diagnose the
  target, tool and prior evidence before launching another batch.
- For game changes, screenshots do not replace semantic success checks: assert the outcome through
  `window.__gummy` as well, and report anything you could not verify.
- **A smoke or syntax pass is not a visual fix.** Do not report a rendering issue as fixed
  based only on source inspection or passing checks. Name the inspected captures, timed
  assertions and quality/time-of-day conditions that passed, and state what remains
  unverified.
- **Inspect emoji and icon sprites close up on both light and dark backgrounds.** Check for
  an unintended square/rectangular backing, halo, matte fringe, opaque texel border or
  blend-mode seam around the artwork; a transparent PNG or an `alphaTest` material does not
  prove the visible edge is clean. Capture the icon at its actual UI size and at 2–3×
  close-up with the game's real background behind it, including night/dark and bright
  panels, then restore any temporary diagnostic backing before reporting.
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

## 15. Asset intake and integration

Source production, Blender, UVs, materials/ComfyUI, baking and export tooling belong
to `/Users/hydraxon/Documents/GitHub/AssetWorkshop`. Do not manipulate live Blender
from this game project. Historical authoring reports and recovery assets are not
active workflow instructions.

Use `docs/asset-intake.md`, `assets/README.md`, the affected consumer and §7 ownership
contracts for separately approved integration. Retain per-asset manifests, hashes,
rights/provenance and tests; validate delivered assets and actual runtime behavior
with `gummy-game-verification`. Source approval, validator success and low polygon
counts do not establish game readiness. New cross-project delivery-contract/intake
versioning remains separately scoped; do not invent compatibility claims.
