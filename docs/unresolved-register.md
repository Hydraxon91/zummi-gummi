# Unresolved-items register

Status: **living register, Batch I.** Scope: active game/modularity work and
its host/CI verification. Historical authoring, asset and published-run notes
remain in `ROADMAP.md`; Batch I3 audits and links them rather than rewriting
historical records.

This is an index, not a fix authorization. Every entry has a stable ID, owner,
trigger, evidence and disposition. Evidence stays in the owning topic document;
this file links to it. Recording an item does not approve a fix, change a gate
or waive a known-broken required feature.

## Rules

- Every step adds or updates an entry before it closes if it discovers a defect,
  verification gap, deferred decision, unsupported path, or flaky/environmental
  failure. The parent checks the register delta during review.
- Never delete an entry. Mark it `resolved`, `superseded` or `won't-fix` with the
  deciding evidence/commit; keep the original trigger and history.
- Planned work belongs in `docs/system-modularity-roadmap.md`, not here. This
  register records known unresolved conditions, not the absence of a future
  batch.
- Required-broken features remain blockers. An entry is not a green test, and a
  successful parity/test run does not close an entry by itself.
- Unknown issues can be added only when observed or decided. The absence of an
  entry is not proof that an unknown class of failure cannot exist.
- At each batch boundary, reconcile open entries, stale evidence and duplicate
  aliases. Batch I3 closes only when every known entry has a disposition.

## Categories and status

| Category | Meaning |
| --- | --- |
| `defect` | Known wrong or incomplete behavior |
| `verification` | Implemented/source-inspected but not proven at the required host layer |
| `decision` | Competing policies or behavior; needs an explicit choice before repair |
| `unsupported` | Deliberately unsupported path or teardown, recorded rather than faked |
| `flake` | Intermittent/environmental failure with incomplete cause evidence |
| `deferred` | Known follow-up intentionally outside the current gate |

Status values: `open`, `needs-decision`, `blocked`, `resolved`, `superseded`,
`won't-fix`. `open` does not imply that a fix is authorized.

## Active register

| ID | Item | Category | Status | Impact | Owner / trigger | Evidence and disposition | Next gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U-001 | M4 live birth and live rig restore host proof | verification | resolved | M4 host claim | B3/M4; `src/app.js` birth and rig restore paths | D2 (2026-10-23, baseline `6c66613`) proved both: a seeded scratch probe drove a real Bear mother through `setPregnant` + `sim`, verified the new baby's species/24-body rig/stage/arrays and save export/import restore (`.dev-shots/d2/bear-birth-probe.mjs`, `.json`, `.log`), and unchanged `glass-test SCENARIO=lifecycle` passed Glass/cross birth plus Glass save/load restore with no page errors. No production hook was added. | Closed for the M4 host claim; rerun the named probes if birth/restore orchestration changes. |
| U-002 | Studio collision separation recurrence | flake | open | Test confidence | Existing Studio regression fixture; observed at `0.2418645` vs `0.25` | Recurred once around B3; other runs passed. B3 does not touch solver/force/readback. Cause unestablished. Preserve the fixture/threshold. | Reproduce with retained evidence if it recurs; no threshold change without a decision. |
| U-003 | M5 app-internal pool/spawn/removal and partial-creation cleanup | verification | open | M5 closure | `src/app.js` pool/spawn/remove; no importable host seam | Source-inspected and contract-tested only. D1 extracted soft-body growth orchestration to `src/actorlife.js`, D2 extracted birth planning to `src/actorbirth.js` and added live birth/restore host evidence. D3 (baseline `820bafb`) extracted removal ordering to `src/actorremove.js` with `tests/actor-remove.test.mjs` and `departure-test`/`stars-test` host checks, but pool/spawn ownership and partial-creation/partial-removal cleanup remain app-internal and unproven. | Targeted host probe or approved test seam for pool/spawn/partial cleanup. |
| U-004 | C2-F2: social pair survives pond entry | decision | needs-decision | Interaction lifetime | `src/ai.js` pond interruption; `src/behaviors/social.js` pair lifetime | Pair and social state survive pond entry and resume after exit; no pond-specific cleanup. Fixing changes behavior. See `docs/interaction-ownership.md`. | Decide whether pond entry is a pair interruption before changing cleanup. |
| U-005 | C2-F3: residual visit/invite/social timers | verification | open | Low | `src/interactions.js` `breakPair`; social entry timers | Generic cleanup leaves timers; entry paths overwrite them and no stale read/link was reproduced. | Add a reproducer before changing timer cleanup. |
| U-006 | C2-F4: direct Glass removal lacks detach/cancel | decision | needs-decision | Removal safety | `src/app.js` `removeGlassActor`; `src/glass.js` removal | Direct removal does not call `detach`/`cancelPair`; the current stars caller commits a farewell first. No public single-Glass removal hook. D3 moved the order to `src/actorremove.js` but deliberately did not add detach/cancel, mesh work or pool changes. | Decide the removal contract before adding a caller or cleanup. |
| U-007 | M2 coverage beyond the social pilot | deferred | open | Interaction ownership | M2b–M2d pilot; other direct pair/task/claim writers | C1–C3 prove one social family; other interaction families and writers remain uncentralized by design. | Select another family only with a new bounded decision. |
| U-008 | M7 editor-time connectivity and rebuild policy | decision | needs-decision | Authoring/runtime layout | `src/fieldlayout.js` validation; editor/rebuild route absent | B4 validates numeric layout; it is not a global reachability gate and does not define editor connectivity or rebuild behavior. | Define the editor contract before implementation. |
| U-009 | M8 app restore-as-dropped and dropped/carried mesh timing | verification | open | Visual evidence | `src/app.js` restore/carry/drop; `src/giftvisuals.js` | Source-inspected/prior browser evidence; no dedicated timing proof for restore-as-dropped or mesh transition. | Host probe when the affected path changes. |
| U-010 | M9 villa occupancy glow and full door-route reachability | verification | open | Visual/host evidence | `src/homes.js`, `src/field.js`, `src/homesim.js` | C5 proves birth-home choice; occupancy visuals and complete door-route reachability remain unverified. | Visual/host check before claiming M9 presentation complete. |
| U-011 | M15 real Glass late completion and effects teardown | unsupported | open | M15 host claim | `src/glass.js` async load/dispose; `src/effects.js` | Store-level late-release test exists; real Glass late completion and effects teardown are source-inspected/unsupported. No new teardown mechanism was invented. | Host proof or explicit unsupported disposition. |
| U-012 | Stargaze timer decremented twice | deferred | needs-decision | Behavior timing/parity | `src/behaviors/engine.js` idle timer plus `src/behaviors/stargaze.js` | Inherited behavior; sessions can finish in roughly half their sampled timer. Changing it alters timing/legacy parity. See `ROADMAP.md`. | Explicit timing/parity decision. |
| U-013 | Hosted boot stalls under software rendering | flake | open | CI reliability | Browser jobs before first frame; SwiftShader/WebGL | Arbitrary jobs intermittently fail to boot; retries/`--disable-dev-shm-usage` mitigate but mechanism is unresolved. Assertions and timeouts were not weakened. | Monitor hosted runs; do not infer an app fix from a boot stall. |
| U-014 | Intermittent cuddle/pair completion fixture failure | flake | open | CI/test reliability | `scripts/social-test.mjs` pair scenario; shared affection state | Observed once with `seekCuddle` and no completion; later local and hosted runs passed. Fixture budgets may be a contributor, not proven. Diagnostics now retained. | If it recurs, classify from `cuddle.diagnostics`; do not weaken or lengthen speculatively. |
| U-015 | M12 concurrent save/map policy | decision | resolved | Session consistency | `src/app.js` save/load/map/New Game overlap | User selected **reject-and-preserve** on 2026-10-23. D7 implements the single-flight `src/sessiongate.js` gate: save/export/load/import/new-game/map-switch acquire before mutation, autosave skips when busy, and busy controls are disabled through `body.session-busy`. No queue, rollback, schema changes or transaction. Menu Continue reads and applies the autosave under one `load` lease. D8 adds callback-only `src/savecoordination.js` capture/apply phase ordering while app keeps validation, world/UID/portion/sky/launcher/persist logic and gates; invalid input still normalizes before phases and failure remains non-atomic. Recorded in [save/map overlap contract](save-overlap-contract.md); host-run focused save/coordination/saveformat/actorsave/session-gate tests 36/36, full Node 589/589, contracts 17 modules, short parity PASS, smoke 68, and D7/D8 busy-overlap probe 31/31 with 0 page errors. | M12 evidence complete from `HEAD 1418950`; no schema bump. U-003, U-006 and U-011 remain open. |
| U-016 | M21 cannon landing-refusal host proof | verification | open | M21 closure | `src/launcher.js` landing check; `src/cannonaim.js` `cannonShotPlacement` | E5 unit tests cover the landing-refusal branch, but the browser probe could not force a landing point inside a static Meadow collider with existing hooks (table-clamped shots) and Studio skips field colliders. Not a known defect. See [the toy boundary contract](toy-boundary-contract.md). | Add a collider-adjacent fixture or approved probe hook before claiming host proof; recording does not authorize a fix. |
| U-017 | M14 pond-recovery and eye-continuity host proof | verification | open | M14 closure | `src/app.js` `rescuePondBear`, `writeEyeInstance`; F1 seeded probe | F1 proved pond entry and continuous deformed surfaces/eyes by inspection, but did not prove return-to-shore recovery within the 2.5 s probe window and did not numerically pin eye placement continuity. Lattice math is separately fixture- and random-checked. | Add a longer/targeted host probe before claiming those M14 gates; no production hook or fix is authorized by this record. |
| U-018 | M16 visual pond/terrain host split | deferred | open | Environment ownership | `src/field.js` pond/water/terrain composition | F2 extracted only the pure pond query and water spots. The inventory records shared sand/grass materials, wind/sun uniforms, path mask, shoreline phases/wobble, reflector camera/target/cadence and pond nav/colliders that block a visual split. | Requires a separate approved design covering material/uniform/shoreline/collider/camera ownership; this record does not authorize extraction. |

## Pending audit

`ROADMAP.md` contains older Known follow-ups for authoring, assets, UI, published
runs and retired routes. They are not silently closed by this register. Batch I3
will audit each current-route entry, link or migrate it here, and mark historical
or already-resolved items without rewriting the original record. Until that
audit, `ROADMAP.md` remains authoritative for those entries.

## Batch I operation

- **I1:** create this register, establish IDs/rules, migrate the active known
  items above, and add the update gate to the roadmap and agent procedures.
- **I2:** every Batch D–H step records new findings and updates affected entries
  before parent review; no separate register-only coder run is required.
- **I3:** after Batch H, reconcile every known entry, audit the pending backlog,
  resolve aliases and require an explicit disposition for anything still open.

Batch I records evidence; it does not repair entries. Each repair still needs
its own approved scope, and separately gated actions remain separately gated.
