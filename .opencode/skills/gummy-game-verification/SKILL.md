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

Last reviewed: 2026-10-22. Update this line when the commands, harnesses or coverage below
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

During iteration, run the affected test files first. Run the complete suite at feature
review and after changes that invalidate its evidence, not after every small edit.

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

## Route all affected checks

This is one discoverable skill with specialist references, not independent test suites.
The baseline checks above and shared stages below are mandatory when applicable; routing
does not weaken them. Reference links are relative to this skill; script/data paths in
the references remain relative to the project root.

| Approved change / check | Read before execution | Also load when applicable |
| --- | --- | --- |
| Any browser check | [Browser harness](references/browser-harness.md) | Every affected row below |
| NPC behavior, interactions, RNG or simulation | [Behavior/parity](references/behavior-parity.md) | Physics/world; species/assets/save; visuals |
| Physics, rig, solver, map, collision or navigation | [Physics/world](references/physics-world.md) | Behavior/parity; species/assets/save; visuals |
| Species, DNA, save/load, GLB or resource lifecycle | [Species/assets/save](references/species-assets-save.md) | Behavior/parity; physics/world; visuals |
| Materials, masks, shaders, effects or visual changes | [Rendering/visuals](references/rendering-visuals.md) | Performance for speed claims; UI/input for controls |
| Menus, HUD, layout, focus, pointer/touch/keyboard | [UI/input](references/ui-input.md) | Browser harness; visuals; species/assets/save for persistence |
| Timing, optimization or resource-use claim | [Performance](references/performance.md) | Affected functional and visual checks |

For each approved requirement, name its assertion, source state and needed references.
Use **pass / fail / excluded with reason / unverified**; a missing tool is not a pass.
Load cumulative references: a persisted visual setting needs browser, UI/input,
rendering and save checks, not just the UI row. Read current script options and hooks
before execution; stop if the documented prerequisite does not match the checkout.

Existing procedures were extracted without establishing fresh runtime evidence.
The new UI/input extensions are explicitly **unvalidated**. Document/link checks do
not validate gameplay, new procedures or usefulness with a particular LLM.

For source production of coherent asset sets read the 3D skill's
[asset-family guide](../gummy-3d-authoring/references/asset-families.md); for approved
lit sprites read its [sprite-normal guide](../gummy-3d-authoring/references/sprite-normals.md).
These new guides are **unvalidated** and do not authorize integration. Keep source
production separate from in-game rendering, UI/input, lifecycle and performance acceptance.

## Behaviour and regression checks

### Acceptance contract

Follow `AGENTS.md` sections 5 and 6 and the complete interaction checklist in
[behavior/parity](references/behavior-parity.md) when behavior is affected. Fixtures
must exercise the real transition. Forced state does not prove natural eligibility.

### Verification stages and evidence reuse

- **Focused/edit loop:** affected Node files, syntax where relevant, and one targeted
  browser or parity scenario. Keep the server available during active iteration.
- **Feature review:** full Node suite, HTTP smoke, affected browser suites, inspected
  captures for UI/visual changes, and short all-race parity for behavior changes.
- **Batch acceptance:** final applicable checks plus one fresh long matrix after
  simulation-affecting edits are settled. A failed run is not acceptance; diagnose,
  fix within approved scope and repeat the invalidated checks.

Keep a small evidence ledger in the conversation/report: criterion, check, source state,
result and whether a later edit invalidated it. Simulation edits invalidate affected
behavior evidence and long parity; UI-only edits invalidate affected UI/capture evidence,
not automatically the simulation matrix. Prose-only edits need direct document checks,
not another long run. Test-only edits rerun the changed test and any acceptance whose
assertions changed. Reuse evidence only when its tested dependencies and claims remain
valid; scratch report existence alone is not proof.

Treat these as separate lanes:

| Claim | Required evidence |
| --- | --- |
| Disabled compatibility | Exact legacy/modules parity with the feature off |
| Enabled reproducibility | Same-seed feature-on traces and actual instrumented RNG draws |
| Functional correctness | Feature-on assertions for outcomes, interruptions and persistence |

Do not describe a feature-off matrix as enabled acceptance, or weaken comparator
coverage to hide a mismatch. Unintended history eviction or timing changes can affect
other readers even when the new metadata is nominally display-only.

Serialize GPU-heavy browser suites and avoid contending them with the long CPU matrix.
Independent lightweight reads/tests may run together. Reuse an owned server only while
actively working, keep each browser run's profile isolated, and clean up owned processes
in failure paths and at the batch boundary. Do not kill user-owned processes.

Commit at verified, independently loadable logical boundaries under the existing approval
rules. At a time-box or final handoff distinguish implemented, verified, blocked and
deferred work; name gaps instead of issuing another premature completion claim. No fixed
duration is guaranteed, and no push is authorized by verification.

- Test only approved scope; discovery of a separate defect is not authorization to
  fix it. Record it under Known follow-ups in `ROADMAP.md`, as the Agent Behavioral Rules in
  `AGENTS.md` require.

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
