# Gummy Bears — repository contract

Browser-first, offline-first ES-module JavaScript game using three.js and Box3D
WASM. No bundler, `package.json` or build step. Serve with `launch.py`.
Repository: `~/Documents/GitHub/GummyBearTest` (exact absolute path:
`/Users/hydraxon/Documents/GitHub/GummyBearTest`). Do not use other checkouts
unless the user names one.

## Common rules

- Inspect the current target, callers and helpers before proposing changes. Preserve
  unfamiliar changes as user work. Match surrounding style; no unrelated cleanup.
- Plan → explicit approval → implement → verify → report and stop. A bounded,
  ordered work chunk allows its listed steps without routine per-step approval;
  it does not authorise new decisions or unrelated work.
- Separately gated actions need explicit `y`, `yes` or direct written approval:
  deletions, large refactors/restructuring, dependency changes, Box3D/WASM changes,
  commits outside an approved chunk, and every push. CI/CD changes need separate
  approval even inside a chunk. Never discard changes you did not make.
- Classify fixes before editing. Local, unambiguous mechanical corrections follow
  normal approval rules. Unspecified behaviour, competing outcomes or reopened
  documented decisions require presenting the tradeoff and waiting for a decision.
- State expected versus actual behaviour and supporting evidence before a fix.
  Validate contradictory diagnostics before repairing their subject. Do not hide
  errors with empty catches, arbitrary fallbacks or fabricated success claims.
- Known-broken required features block delivery. Report failed and unverified
  criteria honestly; checks do not confer user approval. Record discovered bugs
  in `ROADMAP.md` Known follow-ups with trigger, affected state and disposition.
- Keep scope and source intact; do not rebuild or discard unrelated assets.
- Use file-edit tools for repository changes, not shell scripts or Blender Python.
  This game repository does not control live Blender.
  Keep dependent operations sequential; parallelise independent reads/checks.
- After interruption/compaction or “continue”, confirm approved scope, inspect
  `git status --short` and re-read unfinished targets before editing. Exceptions
  can leave partial changes: inspect actual state before retrying.
- Keep progress concise. Use todos when available. Do not invent resource budgets.
  Stop owned verification processes.
- Update living docs invalidated by a change. Keep rules/procedures free of
  incident journals; put evidence in topic docs. Historical records stay immutable.
- Scratch captures belong in `.dev-shots/` and must be viewed. Do not commit
  `inspiration/`, scratch captures, local self-tests or third-party references.

## Load only the active route

### Asset authoring boundary

Standalone authoring belongs to `/Users/hydraxon/Documents/GitHub/AssetWorkshop`.
This game project must not manipulate live Blender. Game-side asset intake and
integration remain separately approved work here; see `docs/asset-intake.md`.
Historical reports and recovery sources are preserved, not active authoring routes.

Detailed procedures are in [docs/agent-procedures.md](docs/agent-procedures.md).
Read the named sections when applicable, not that whole document on every task.

| Task | Required route |
| --- | --- |
| Code/game configuration | Procedures §7 architecture/ownership and the target source; §6 for design-sensitive fixes |
| Multi-step game feature | Procedures §5, including requirements-to-check mapping and failure limits |
| Game verification | `gummy-game-verification` skill; procedures §9 for commands, §13 for game captures |
| Performance claim | Procedures §14 and `PERFORMANCE.md`; remeasure, do not infer |
| Asset intake/integration | `docs/asset-intake.md`, affected loaders/contracts and game verification |
| Save/species/assets contract | Relevant ownership in procedures §7, `assets/README.md`, affected Node tests |
| Commit/push | Procedures §12; verified atomic units, no push implied; monitor applicable CI after a code push |
| Documentation/tooling workflow | Procedures §10–11 and affected commands/cross-references |

## Non-negotiable project boundaries

Three.js stays pinned to `0.186.1`; Box3D remains the physics engine. Bear/Gummy
retain the 24-body metaball/surface-nets path; Glass retains its authored skinned
GLB and rigid adapter. Do not add runtime dependencies, bundlers or test frameworks
without approval. Respect module ownership and shared asset leases; preserve
batching/instancing and avoid per-frame foliage CPU loops. Full ownership and
supported exceptions are maintained in procedures §7, not duplicated here.

Authoring/export/standalone preview and game integration are separate scopes and
evidence. This repository owns destination integration, not source production.

## Approval and recovery details

Procedures §3–6 and §12 retain the detailed approval, repair and commit contract.
Inside a chunk, verify each step at its affected layer. Allow at most seven
evidence-driven failed repairs per failing criterion: diagnose after two unchanged
failures, review at six, stop at seven unless an explicit bounded continuation is
approved. Preserve the ledger across filenames and techniques; never discard
unrelated work to recover.

This entry owns common safety and routing. Detailed references explain execution;
AssetWorkshop owns authoring progression. More specific user scope gates remain
binding. Report implemented, verified, blocked
and deferred work separately; then wait for the next task.
