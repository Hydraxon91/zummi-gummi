# Unresolved-items register

Status: **living register, Batch I (I3 audit completed 2026-10-23).** Scope: active game/modularity work and
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
| U-003 | M5 app-internal pool/spawn/removal and partial-creation cleanup | verification | open | M5 closure | `src/app.js` pool/spawn/remove; no importable host seam | Source-inspected and contract-tested only. D1 extracted soft-body growth orchestration to `src/actorlife.js`, D2 extracted birth planning to `src/actorbirth.js` and added live birth/restore host evidence. D3 (baseline `820bafb`) extracted removal ordering to `src/actorremove.js` with `tests/actor-remove.test.mjs` and `departure-test`/`stars-test` host checks. C05 (baseline `3496c35`) reproduced the no-physics partial spawn in a real browser with the menu open: `spawnAt(0,0,0,0)` before boot threw `Cannot read properties of null (reading 'sphere')` and left one partial actor in `bears`/roster with `mesh.visible` true and an allocated handle array. C05 then added a `physics is not ready` guard in `spawn()` after species/rig validation and before pool/roster mutation; the repeated pre-boot call threw the guard error with `bears`/roster still 0, and a post-boot `spawnAt` produced a valid active, visible, physics-backed actor (8→9 bears, 3001 verts, `nan` false). Evidence: `.dev-shots/c05/report-before.json`, `.dev-shots/c05/report-after.json`, `preboot-before.png`, `booted-spawn-after.png`; full `node --test tests` 719/719, contracts 17 modules/34 states, `git diff --check` clean, zero page errors. Other partial-creation/partial-removal failures after physics is ready and app-owned pool/remove ordering remain unproven. | Targeted probe or approved test seam for the remaining pool/spawn/partial-creation and partial-removal paths. |
| U-004 | C2-F2: social pair survives pond entry | decision | resolved | Interaction lifetime | `src/ai.js` pond interruption; `src/behaviors/social.js` pair lifetime | C11 (baseline `4c17b58`) expanded the evidence beyond social: pond entry froze module ticks (`ready:false`) and did not cancel. On exit, social, mate, carried gifting, family meal/playdate, group and conflict resumed and could grant completion bond/relief/history after the interruption; visit and collect-phase gifting closed without reward. A partner in the pond did not stop the grounded initiator's social/mate/conflict timer, so the pond actor could still be credited; a group with its leader in the pond stayed frozen indefinitely, while a non-leader in the pond dissolved the group on the join timeout. Scratch matrix and completion probe in `.dev-shots/c11/`; see `docs/interaction-ownership.md` C11. C11a (baseline `8403c77`, clean tree) implemented the approved policy: on the first interruption tick `src/ai.js` calls `shared.api.cancelPair(b)` after `releaseFood(b)`, guarded by `ai.interrupted` so grab cleanup is not repeated; a grounded actor whose `ai.partner.inPond` cancels the pair before its decisions. Pair/task/visit fields clear symmetrically, carried gifts drop as recoverable portions, and a leader entering the pond dissolves the group. Exit cannot resume the cancelled pair or grant completion bond/relief/history. Evidence: `tests/social-cancellation.test.mjs` 13/13 (social/visit exactly-once plus no-reward on exit, mate, carried gifting, group leader, partner-in-pond); full `node --test tests` 728/728; contracts 17 modules/34 states; short parity 9/9 PASS; HTTP smoke 68/68; `git diff --check` clean; ledger `.dev-shots/c11a/ledger.md`. No save schema change. | Closed for the pond cancellation policy. A live browser probe with an active pair was not practical because the exposed hooks do not teleport an existing Bear into the pond; the focused Node fixtures drive the real Bear adapter and modules engine. Family pair-task cancellation asymmetry remains U-007. |
| U-005 | C2-F3: residual visit/invite/social timers | verification | resolved | Low | `src/interactions.js` `breakPair`; social entry timers | C11 (baseline `4c17b58`) confirmed the residue and that it is inert. `breakPair`/`cancelPair` leave un-interrupted family timers set, but every read in `social.js`, `mate.js`, `conflict.js`, `gifting.js` and `engine.js` is guarded by the matching state, `visitRetryT` has no reader, and a fresh entry overwrites the timer. Probe: `visitT=7` survived `cancelPair` with state `wander`; a new visit reset it to `0`; 20 reset-state ticks did not re-enter a pair state. No stale read reproduced; no timer-cleanup change is warranted. Evidence: `.dev-shots/c11/pond-matrix.mjs`, `pond-matrix.out.json`. | Closed as inert residue. Reopen only with a concrete stale-read reproducer. |
| U-006 | C2-F4: direct Glass removal lacks detach/cancel | decision | resolved | Removal safety | `src/app.js` `removeGlassActor`; `src/glass.js` removal | C04 at baseline `b90ee30` added portable `onDetach` to `removeGlassActor`, called only after `removeFromColony` reports success and before reference clearing. The app wrapper passes the same `ai.detach` used by soft removal, so a successful real Glass removal releases food and cancels its pair exactly once through the behavior engine; a refused/absent colony removal leaves behavior and pair state untouched. The stars farewell, carried-food, portion/food and disposal order is unchanged, and `glassColony.clear()` is unchanged. Evidence: focused `tests/actor-remove.test.mjs` 12/12, full `node --test tests` 719/719, contracts 17 modules/34 states, `git diff --check` clean, and `stars-test.mjs` PASS including "Glass farewell fades and removes the actor" with zero page errors. | Closed for the real-removal contract; map-clear/`glassColony.clear()` remains outside this decision. |
| U-007 | M2 coverage beyond the social pilot | deferred | open | Interaction ownership | M2b–M2d pilot; other direct pair/task/claim writers | C11 (baseline `4c17b58`) inventoried the remaining writers with owner and cleanup path (social visit, mate, conflict, gifting, groups, family tasks, directives, Glass, possession/removal) in `docs/interaction-ownership.md`. No broad central registry is warranted; each family keeps its primitive. One concrete next bounded candidate was found: family pair-task cancellation asymmetry — `cancelTask` is own-side, so a surviving partner keeps `familyTask`/`partner`, can finish alone, and grants bond/relief/history to both sides (scratch probe `.dev-shots/c11/family-cancel-asymmetry.mjs`; reachable from family tick path failure and stall recovery). Not selected or implemented. C11a (baseline `8403c77`) implemented the pond cancellation policy only and did not change `cancelTask` or family pair-task symmetry; U-007 remains open. | Parent/user must select the family-task cancellation family (or defer) with a fresh bounded decision/brief. |
| U-008 | M7 editor-time connectivity and rebuild policy | decision | needs-decision | Authoring/runtime layout | `src/fieldlayout.js` validation; editor/rebuild route absent | B4 validates numeric layout; it is not a global reachability gate and does not define editor connectivity or rebuild behavior. | Define the editor contract before implementation. |
| U-009 | M8 app restore-as-dropped and dropped/carried mesh timing | verification | resolved | Visual evidence | `src/app.js` restore/carry/drop; `src/giftvisuals.js` | C06 at baseline `4c3f84a` proved the presentation transitions in a real browser with existing hooks only. Carry showed one visible carried mesh (uid 11, scale 1.4) and no visible dropped duplicate; disabling gifting dropped the same id (`gift-1`) with one visible dropped mesh at the portion position and removed the carried mesh by the next frame. Save while carrying (`slot5`) restored the saved `carriedFood` record as one dropped field portion at the same id/x/z (saved `28.332,-30.455`; restored `28.33,-30.45`), with `carriedFood` absent on the loaded actor and no carried mesh; gifting was frozen for that frame so a fresh offer could not claim it. A map switch while carrying dropped on Meadow, left zero visible gift meshes on Studio, and returning to Meadow showed the same dropped portion visible at its stored position with no carried record. Verified source hashes `src/app.js` `241a2fb3`, `src/giftvisuals.js` `4ffa503d`. Evidence: `.dev-shots/c06/probe.mjs` probe 8/8 PASS and `report.json` (0 page errors), `scripts/gifting-test.mjs` 8/8 PASS (`.dev-shots/gifting-c06-all.json`, 0 page errors), `node --test tests` 719/719, `node scripts/check-behavior-contracts.mjs` 17 modules/34 states, `git diff --check` clean. Captures inspected: `c06_carried.png`, `c06_dropped.png`, `c06_saved_carry.png`, `c06_restored.png`, `c06_map_switch_studio.png`, `c06_map_switch_returned.png`. | Closed for the named transition paths; no production hook or behavior change was added. Rerun the probe if save/restore, map switch or gift visual sync changes. |
| U-010 | M9 villa occupancy glow and full door-route reachability | verification | resolved | Visual/host evidence | `src/homes.js`, `src/field.js`, `src/fieldlayout.js`, `src/navmesh.js` | C07 at baseline `0399839` proved the live `villaOccupancyGlow` mapping with existing hooks only: all 8 instances hidden when cleared, only Thimble Cottage (scale 1.55) visible with a sleeping bear assigned there, hidden again after clearing, only Mossy Nook visible for a second home, and both visible together. All 8 `navPath(0,0,door.x,door.z)` calls returned non-empty 2-point paths, `fieldInfo().layoutCheck` was `[]`, and every door top was 1.691 m against the 1.535 m adult headroom rule. Night captures `night-occupied.png` (warm halo visible at Thimble Cottage) and `night-cleared.png` (same camera, halo absent) were inspected with no obvious regression; 0 page errors. Verified source hashes `src/homes.js` `804c87c3`, `src/field.js` `f1204127`, `src/fieldlayout.js` `19f74fdf`, `src/navmesh.js` `2ff29f2c`. Evidence: `.dev-shots/c07/probe.mjs`, `report.json`, `ledger.md`; `node --test tests` 719/719, contracts 17 modules/34 states, `git diff --check` clean. | Closed for the named occupancy and door-route checks; nav path endpoints snap to the walk grid by 0.270–0.523 m, which is existing path behavior and not a failed route. Rerun if home geometry, occupancy sync, nav bake or door-clearance constants change. |
| U-011 | M15 real Glass late completion and effects teardown | verification | resolved | M15 host claim | `src/glass.js` async load/dispose; `src/effects.js` | C08 at baseline `105220b` proved real Glass late completion with existing production code only. A scratch init script held the first `assets/MSN_Figure/msn.glb` `fetch` (gate hit 1; no production hook); the two Meadow Glass actors stayed `ready:false` with `msn.glass` `loading`, `refs:2`. Hiding the Studio MSN via `__gummy.msn.cast('bears')` and switching to Studio through `setMap('studio')` cleared the colony (count 0, actors `[]`, scene models 0) while the fetch stayed pending. Releasing the load left Studio cleared and dropped `msn.glass` to `ready`, `refs:0`, `loads:1`; both late lease continuations released. Returning to Meadow created two fresh actors (uids 9/10) that loaded normally (`ready:true`, `refs:2`, scene models 2/shadows 2, `loads:1`), with 0 page errors and no duplicate load/source. Verified source hashes `src/glass.js` `8b98c17`, `src/effects.js` `9ca47f5`, `src/assetstore.js` `8f06b3d`, `src/assets.js` `0a06b18`, `src/app.js` `a0d98d1`, `src/msn.js` `891239e`. Evidence: `.dev-shots/c08/probe.mjs`, `report.json`, `ledger.md`, inspected captures `c08_pending_meadow.png`, `c08_cleared_pending_studio.png`, `c08_released_studio.png`, `c08_returned_meadow.png`; `node --test tests` 719/719, contracts 17 modules/34 states, `git diff --check` clean, `SCENARIO=lifecycle` Glass pass with 0 page errors. | Closed for real late completion and lease release. Effects teardown remains unsupported by design: `src/effects.js` `createEffects()` exposes no `dispose` and `src/app.js` keeps one app-lifetime composer; no teardown mechanism was added or claimed. Rerun the probe if the loader path, map-switch clear or `glassColony.clear()` changes. |
| U-012 | Stargaze timer decremented twice | deferred | needs-decision | Behavior timing/parity | `src/behaviors/engine.js` idle timer plus `src/behaviors/stargaze.js` | Inherited behavior; sessions can finish in roughly half their sampled timer. Changing it alters timing/legacy parity. See `ROADMAP.md`. | Explicit timing/parity decision. |
| U-013 | Hosted boot stalls under software rendering | flake | open | CI reliability | Browser jobs before first frame; SwiftShader/WebGL | Arbitrary jobs intermittently fail to boot; retries/`--disable-dev-shm-usage` mitigate but mechanism is unresolved. Assertions and timeouts were not weakened. | Monitor hosted runs; do not infer an app fix from a boot stall. |
| U-014 | Intermittent cuddle/pair completion fixture failure | flake | open | CI/test reliability | `scripts/social-test.mjs` pair scenario; shared affection state | Observed once with `seekCuddle` and no completion; later local and hosted runs passed. Fixture budgets may be a contributor, not proven. Diagnostics now retained. | If it recurs, classify from `cuddle.diagnostics`; do not weaken or lengthen speculatively. |
| U-015 | M12 concurrent save/map policy | decision | resolved | Session consistency | `src/app.js` save/load/map/New Game overlap | User selected **reject-and-preserve** on 2026-10-23. D7 implements the single-flight `src/sessiongate.js` gate: save/export/load/import/new-game/map-switch acquire before mutation, autosave skips when busy, and busy controls are disabled through `body.session-busy`. No queue, rollback, schema changes or transaction. Menu Continue reads and applies the autosave under one `load` lease. D8 adds callback-only `src/savecoordination.js` capture/apply phase ordering while app keeps validation, world/UID/portion/sky/launcher/persist logic and gates; invalid input still normalizes before phases and failure remains non-atomic. Recorded in [save/map overlap contract](save-overlap-contract.md); host-run focused save/coordination/saveformat/actorsave/session-gate tests 36/36, full Node 589/589, contracts 17 modules, short parity PASS, smoke 68, and D7/D8 busy-overlap probe 31/31 with 0 page errors. | M12 evidence complete from `HEAD 1418950`; no schema bump. U-003, U-006 and U-011 remain open. |
| U-016 | M21 cannon landing-refusal host proof | verification | resolved | M21 closure | `src/launcher.js` landing check; `src/cannonaim.js` `cannonShotPlacement` | C09 at baseline `a6b52d5` forced a real Meadow landing refusal through the production launcher hooks only (no new hook). Cannon placed at `(0,1)` and aimed at the authored static rock at `(-3,5)`: `launcherFire()` returned false, `launcher().blocked === 'landing'`, `map().bears` stayed 8, `lastShot` stayed null, and exactly one `Math.random` draw (the flavor pick) occurred before refusal. An immediate retry also drew exactly one value and blocked landing, proving `lastFireAt` did not advance (a cooldown refusal would draw zero). A clear shot at `(2,10)` then fired: bears 8→9, spawned speed `10.798` matched the reported `10.8`, the bear was airborne, and `lastBlock` cleared; an immediate second clear fire drew zero values and spawned nothing (cooldown). The earlier E5 assumption was the gap: Meadow aim clamps with `fieldClamp`, not the 3.4×2.9 table, so field-wide static colliders are reachable. Evidence: `.dev-shots/c09/landing-refusal-probe.mjs`, `.json`, `.log`, `ledger.md`; inspected `c09_blocked_landing_aim.png`, `c09_blocked_landing_aim_noui.png`, `c09_blocked_landing_aim_crop.png`, `c09_clear_fire.png`; 0 page errors. Verified source hashes `src/launcher.js` `b3a4ffbe`, `src/cannonaim.js` `b69c8897`, `src/app.js` `ec39ca95`. Full `node --test tests` 719/719, contracts 17 modules/34 states, `git diff --check` clean. | Closed for the host landing-refusal and fire-order path. The linked toy-boundary contract's older "remains unforced" paragraph is stale and parent-owned; this record is the newer evidence. Rerun the probe if shot placement, flavor RNG order or Meadow collider wiring changes. |
| U-017 | M14 pond-recovery and eye-continuity host proof | verification | resolved | M14 closure | `src/app.js` `rescuePondBear`, `writeEyeInstance`; F1 seeded probe | C10 at baseline `bf7d492` ran a host probe with existing hooks only (`.dev-shots/c10/probe.mjs`, `report.json`, `ledger.md`, zero page errors). Eye continuity: on active Bear slot/index 0, rest eye-to-transformed-head distances were `0.23060/0.23018` (parts 0/1; part 2 is the nose, `0.36468`). Three asymmetric head-grab rebuilds stayed within `0.00496` of rest for both eyes (tolerance `0.010`, about one third of the `0.028` eye radius); no NaN. In two consecutive no-rebuild frames (frames 3→4 and 7→8, `builtThisFrame=0`), the head moved `0.01077/0.01044` while both eye distances changed by at most `0.00004` (tolerance `0.001`, covering 4-decimal hook rounding), consistent with the shared rigid `meshM` reprojection. Inspected `eye-rest.png` and `eye-deformed.png`: both eyes and nose remain on the deformed face. Pond recovery: spawning a live Bear at pond centre `(-17,2)` with `y=0` entered the pond at `t=0.15 s` (`inPond false→true`, `cy=0.491`) and paddled steadily to the rectangular physics cut-out edge at `x=-12.011` (`POND_HOLE` max `-11.852`), still `inPond=true`, `cy≈0.374`, normalised radius `0.756`, with no exit in 30 s; `rescuePondBear` did not fire because sampled `minCy=0.204` stayed above its `0.10` inside threshold. A repeat run paddled the other way to `x=-21.989` (hole min `-22.148`) and stalled the same way. A separate spawn below the cut-out (`cy=-0.169`) was lifted `+0.529` to `cy=0.36` in one step and then remained in the pond, so rescue was observed but is not shore recovery. | Closed. Eye continuity was proven in C10 at `bf7d492` (numerical and visual evidence above). C10a at baseline `7a23e34` adds the bounded no-progress pond escape. A pure `src/wateraccess.js` helper `pondEscapeDue` accumulates while a free bear is `inPond`, inside the ellipse, and below the existing `.16` splash speed limit, then reports due at the `1.5 s` threshold; it resets on leaving the pond, leaving the ellipse, a grab, or paddling at/above the limit. `src/app.js` stores the timer on the bear (constructor and spawn reset, not saved) and calls the existing `rescuePondBear(b, false)` path once, preserving the below-ground rescue, splash, AI interruption, surface rebuild and ordering. Host probe (`.dev-shots/c10a/probe.mjs`, `report.json`, inspected `c10a_rescued_left.png`/`c10a_rescued_right.png`) spawned Bears either side of centre at `y=0`, entered the pond at `0.15 s`, stalled against both rectangular cut-outs at `x=-21.983` and `-12.017` (`cy≈0.369`, timer reached `1.5`), and escaped one second later to `x=-23.8`/`-10.2` (`cy=0.34`, normalised radius `1.081`, `inPond=false`, timer `0`). Surface rebuilds ran, no NaN and zero page errors. Focused water-access test `18/18`, full `node --test tests` `724/724`, contracts `17 modules/34 states`, short parity PASS, HTTP smoke `68/68`, `git diff --check` clean. Rerun the probe if `rescuePondBear`, `pondEscapeDue`, the pond cut-out/collider geometry or the pond block ordering changes. |
| U-018 | M16 visual pond/terrain host split | deferred | open | Environment ownership | `src/field.js` pond/water/terrain composition | F2 extracted only the pure pond query and water spots. The inventory records shared sand/grass materials, wind/sun uniforms, path mask, shoreline phases/wobble, reflector camera/target/cadence and pond nav/colliders that block a visual split. | Requires a separate approved design covering material/uniform/shoreline/collider/camera ownership; this record does not authorize extraction. |
| U-019 | `fieldInfo()` throws when the active map has no `bounds` | defect | resolved | Debug API usability | `src/app.js` `fieldInfo()`; Studio/map without `bounds` | `fieldInfo()` dereferenced `getActiveMap().bounds.shape` after checking only `field`; the ROADMAP Phase 3a audit records that calling it while Studio is active threw instead of returning a field-only result. C02 at `7dbb93b` changed the `bounds` expression to read `field.bounds` (the built field's own `FIELD_BOUNDS`), leaving the result shape and every other field unchanged. Evidence: `node --test tests` 719/719, `node scripts/check-behavior-contracts.mjs` 17 modules/34 states, `git diff --check` clean; `.dev-shots/c02` browser probe booted Meadow, switched via `__gummy.setMap('studio')` and back, with `fieldInfo()` returning `{shape:'circle',radius:65}` and no throw in all three states, zero page errors. | Closed for field diagnostics; Studio still has no bounds of its own and the hook intentionally reports the field it describes, not a fabricated Studio bound. |
| U-020 | Family/lineage panel indexes only active-map actors | defect | resolved | Roster/lineage display | `src/app.js` `familyFor()`, `lineage()`, `gameActorList()`; `src/family.js`; `src/relationshipview.js` | C03 at baseline `79e0889` adds `gameActorList()` over the existing `gameActorIndex()` values. `familyFor()` and lineage lookup/parent/history indexing now use that game-wide list, so an inactive-map relative resolves with its name and generation; `lineage()` household remains filtered from `actorView.all()` so same-named homes on different maps do not merge. History ordering and returned shapes are unchanged, and missing UIDs still return `null`. Evidence: `node --test tests` 719/719, `node scripts/check-behavior-contracts.mjs` 17 modules/34 states, `git diff --check` clean; `.dev-shots/c03/report.json` browser probe booted Meadow, resolved starter child uid 5 (Pip, parents Mochi/Gumdrop, generation 2, household 3), switched to Studio where the live roster lacked the child but `lineage(5)` returned the same self/parents/generation with household `[]`, confirmed `lineage(987654321) === null`, returned to Meadow with the same coherent lineage/household, and recorded zero page errors. Captures `c03_studio_lineage.png` and `c03_returned_meadow_lineage.png` inspected. | Closed for family/lineage display; the relationship view already used game-wide data, and save/load, UID allocation and roster DOM were not changed. |
| U-021 | Duplicate-UID save recovery policy | decision | needs-decision | Save recovery | `src/saveformat.js` duplicate-actor rejection; existing user saves | Duplicate UIDs are rejected at load with no automatic renumbering. Any pre-existing duplicate save therefore needs a recovery policy; changing rejection/renumbering semantics is a user decision, not an audit fix. | Choose reject-only guidance, manual repair, or an approved migration before touching the loader. |
| U-022 | Glass obstacle-interface grab coverage | verification | resolved | Glass interaction evidence | `src/glass.js` grab/obstacle path; `src/field.js` house collider; Studio/browser harness | C13 at baseline `954728b` ran a real-CDP-pointer probe (`.dev-shots/c13/probe.mjs`, `report.json`, inspected `c13_held_blocked.png`): Glass scale `1` (`bodyRadius .33`) was placed `4.249` from Thimble Cottage (collider radius `1.705`, centre y `1.55`), grabbed by mouse press, and held against the house. Ten steady samples stayed at `[-5.46, .32, -7.41]`, 3D centre distance `2.0131` versus `2.035` required (`0.0219` solver overlap, within `0.04` tolerance), visual-root delta `0.0013`, finite position, `stats.nan=false`, `grabbing=true`, `grabs=1`, no page errors. Release cleared `grabbing`/`grabs`/partner/follow and left no claim at 80/500/1200 ms. **Release defect:** the hover reset raises `cy .32→1.01` while keeping the contact xz near `(-5.45,-7.40)`, leaving distance `1.7066` from the house collider centre versus `2.035` (-`0.3284`, inside the static sphere), unchanged at 1.2 s and in `c13_released_focus.png`; non-grabbed Glass is re-pinned by `syncBody`, so the solver cannot eject it. The probe exits `1` on this release-clearance assertion (`report.json`). C13a at baseline `8ba88c3` added a bounded collision-aware release/settle state in `src/glass.js`: released/hover-bound Glass whose xz overlaps a static `field.colliders` circle (horizontal `r + bodyRadius`, conservative vertical gate `|cy - c.y| < r + bodyRadius`, `0.03` clearance tolerance) stays dynamic instead of `syncBody`/hover-snapping; it restores normal hover when clear, or after `0.9 s` projects radially to `r + bodyRadius + 0.06` before restoring hover. The first C13a probe run happened to hold at a clear angle (`d=2.0222`, six steady samples) and its release exercised the bounded settle: `d=2.0399` at `84 ms`, `2.0399` at `508 ms`, and `2.1863` (`xz=2.0966`) at `1217 ms` after projection, `freeBody=false`, `grabbing=false`, `grabs=0`, no partner/follow/claim, `stats.nan=false`, no page errors; its cancel release reached `2.1846` and a clear-space release restored hover. **Independent rerun defect:** the parent rerun held six steady samples at `[-5.76, .31, -7.22]`, `d=1.7674` (`xz=1.2594`) versus `2.035` while `grabbing=true`, `grabs=1`, finite with zero page errors — the raw grab target could still sit inside the house. Correction: `drag()` now clamps `grabTarget` xz through the same `projectClearXZ` static-circle projection after the existing depth/offset, lift/shift and 6 m delta handling, preserving velocity smoothing; the release/settle state is unchanged. Post-correction probe hold: six steady samples at `[-7.69, .33, -8.98]`, `d=2.4259`, `xz=2.0968`, `grabbing=true`, `grabs=1`, finite; release at 84/507/1212 ms stayed `d=2.1755`, `freeBody=false` (already clear, normal hover), cancel release `d=2.1901`, and a clear-space release restored hover; zero page errors. Inspected `c13a_held_blocked.png`, `c13a_released_1200ms.png`, `c13a_clear_space.png`. `SCENARIO=drag` and `SCENARIO=lifecycle` passed with zero page errors; `node --test tests` 724/724; contracts 17 modules/34 states; short parity 3 races × 3 seeds `9/9` fresh; HTTP smoke 68/68; `git diff --check` clean. | Resolved for the C13 release/wall overlap: release no longer re-pins the proxy inside the house collider, and hover is restored only at a clear xz. Keep the `.04` solver tolerance and `0.9 s` bounded settle as the acceptance values if collider geometry or grab physics changes. Evidence ledger `.dev-shots/c13a/ledger.md`. |

| U-023 | H2 purity guard misses imports and template expressions | defect | resolved | Architecture-check confidence | `tests/pure-boundaries.test.mjs` stripping and import matching | Closeout audit at `6023644` reproduced missed side-effect imports, dynamic imports and executable template interpolation while existing boundary/debug tests passed 14/14. See [extension API audit evidence](extension-api.md#closeout-audit-finding-purity-guard-false-negatives-u-023). C01 at `f8db78d` refactors the guard to `boundaryViolations(source, path)`, scans template interpolations (nested braces/strings/templates) and static/dynamic/export-from imports, and adds 8 positive/17 negative fixtures; all three audit probes now reject while the 12 fixed modules pass. Evidence: focused `node --test tests/pure-boundaries.test.mjs tests/debug-api.test.mjs` 39/39, full `node --test tests` 719/719, `node scripts/check-behavior-contracts.mjs` 17 modules, `git diff --check` clean. The guard remains a heuristic scanner, not a parser; unterminated constructs and unusual regex positions fail closed. No shipped runtime violation is alleged. | Closed for the fixed list; scope remains narrow and not a repository-wide import ban. |

### I3 active-entry reconciliation (2026-10-23)

Reviewed U-001–U-018 against the `4bf44d0` tree and the G/H records. No
disposition changes were made without new evidence.

- U-001 and U-015 remain `resolved`; their named probes/contracts still own the
  closure evidence and no later commit invalidated them.
- U-002, U-013 and U-014 remain open flakes. G/H host runs and extension proofs do
  not establish their causes, and no threshold/assertion was changed here.
- U-003, U-005, U-009, U-010, U-011, U-016 and U-017 remain open verification or
  unsupported items. H1/H2 inventory and fixture-level seam proofs do not supply
  the missing browser/host evidence.
- U-004, U-006, U-008 and U-012 remain open decisions (U-012 is a deferred
  category item with a `needs-decision` status); no G/H evidence selects a
  policy.
- U-007 and U-018 remain deferred/open; U-018's ownership inventory is unchanged
  and no extraction was performed.
- U-016 (landing refusal) and U-017 (pond recovery/eye continuity) were not
  resolved by G/H; those runs did not exercise the required browser paths, so
  both stay open. U-018 likewise stays deferred/open.
- No duplicate or conflicting alias was found among U-001–U-018. The C2 section
  maps to three distinct conditions (U-004 pair lifetime, U-005 residual timers,
  U-006 direct Glass removal), not three aliases for one defect.

### Batch E/F boundary reconciliation (2026-10-23)

E3/M20a, E4/M20b, E5/M21, F1/M14 and F2/M16 closed with independent parent
review and atomic commits through `882055e`. The boundary reran full Node
677/677, contracts 17 modules, short parity 9/9, smoke 68/68 and a fresh long
parity 15/15 (`acceptance:true`), plus the E3/E4/E5/F1/F2 browser probes at the
final HEAD. New entries: U-016 (landing-refusal host proof, open), U-017
(pond-recovery/eye-continuity host proof, open) and U-018 (visual pond/terrain
split, deferred/open). Existing U-003, U-006, U-011 and deferred M7–M10 gaps are
unchanged. No duplicate aliases were introduced and no entry is treated as fixed
by this boundary. At this E/F boundary, Batch G/H had not started; no push was
made.

### G/H boundary note (2026-10-23)

G1/M18b, G2/M18c, G3/M18d and H1/M22a, H2/M22b closed with independent parent
review and atomic commits through `4bf44d0`; I3 reconciled the register at
`0cec344`. H2 added narrow tests only; G/H did not change runtime behavior after
the E/F browser probes. The final parent-run boundary at the G/H code HEAD
passed full Node 694/694, contracts 17 modules, short parity 9/9, fresh long
parity 15/15 (`acceptance:true`), smoke 68/68, and all four Python target
commands (`validate`, `--self-test`, `genome`, `adapter`). No push was made.

## I3 backlog audit (2026-10-23)

Every `**Known follow-ups` heading in `ROADMAP.md` at `4bf44d0` is listed once
below. `ROADMAP.md` was not edited. Disposition convention:

- **Existing ID** — the heading maps to a current register entry (linked, not
  rewritten).
- **Historical/out-of-scope** — authoring/assets/prototype/published-run record;
  retained in `ROADMAP.md`, not part of the active game register.
- **Already fixed/resolved** — the record itself says fixed/optimized, with no
  active register condition left by that heading.
- **Retained in ROADMAP (planned/deferred)** — active game work recorded as
  deferred design or planned follow-up, which the register rules keep in the
  roadmap rather than duplicating here. This is not a claim that the follow-up is
  done.
- **New ID** — a concrete active game/host defect, decision or verification gap
  that was genuinely absent from the register.

| ROADMAP line | Heading (abbreviated) | Route / classification | Disposition | Evidence / link |
| --- | --- | --- | --- | --- |
| 323 | Known follow-ups — unified pipeline (prototype, not accepted) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:323`; asset-pipeline prototype/diagnostic record. |
| 504 | Known follow-ups — inherited trackpad degeneracy (needs decision) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:504`; authoring health gate/source geometry. |
| 517 | Known follow-ups — UV guides and sticker processing (partly fixed) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:517`; authoring UV/sticker scripts. |
| 531 | Known follow-ups — can capture snapshot collision (fixed; reusable helper tracked) | Historical authoring/assets | Already fixed/resolved | `ROADMAP.md:531`; tracked capture helper and its fixtures are recorded there; path is not duplicated here. |
| 540 | Known follow-ups — authoring workflow and diagnostics (Phase 4 core repairs fixture-tested) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:540`; construction-gate/diagnostic fixtures. |
| 629 | Known follow-ups — deformation evidence (deferred; code inspection only) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:629`; `check_evidence.py`/`asset_fingerprint.py` tooling. |
| 643 | Known follow-ups — shape-preservation and UV diagnostics (deferred tooling) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:643`; UV/material preservation tooling. |
| 655 | Known follow-ups — assisted beanbag underside UV (unresolved, not accepted delivery) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:655`; beanbag source/UV review. |
| 667 | Known follow-ups — beanbag reference orientation (side mapping fixed; source unchanged) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:667`; beanbag reference overlay. |
| 677 | Known follow-ups — beanbag sphere dent (blocked, not accepted) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:677`; beanbag deformation experiments. |
| 698 | Known follow-ups — StableMaterials loader (needs diagnosis) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:698`; ComfyUI/StableMaterials server record. |
| 704 | Known follow-ups — reusable ComfyUI runners (needs decision) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:704`; ComfyUI runner scripts. |
| 711 | Known follow-ups — laptop stickers (accepted tooling test, limits) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:711`; laptop decal tooling/evidence. |
| 723 | Known follow-ups — UV verification (fixed/untested) | Historical authoring/assets | Already fixed/resolved | `ROADMAP.md:723`; painting-guide export validation. |
| 933 | Known follow-ups — UV guide delivery (fixed) | Historical authoring/assets | Already fixed/resolved | `ROADMAP.md:933`; corrected checkpoint-166 UV guides. |
| 941 | Known follow-ups — semantic UV tooling (prototype/deferred) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:941`; atlas/UV semantic tooling. |
| 1083 | Known follow-ups — texture inventory (deferred) | Historical authoring/assets | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:1083`; `texture_inventory.py` warnings. |
| 1089 | Known follow-ups after the culling/LOD pass | Active game/performance | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:1089`; `PERFORMANCE.md`; fixed LOD band and sector trade-offs, no defect selected. |
| 1104 | Known follow-ups after 8b | Active game/commands | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:1104`; queue/throw/resume behavior decisions. |
| 1528 | Known follow-ups after 8c | Active game/possession | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:1528`; possession/save/follow-camera backlog. |
| 1660 | Known follow-ups from A/B | Active game/Glass | New U-022; other bullets already implemented | `ROADMAP.md:1660`; Glass grab checks passed, obstacle-interface coverage outstanding. |
| 1880 | Known follow-ups — M4 species admission/restore mismatch (fixed) | Active game/actors | Already fixed/resolved | `ROADMAP.md:1880`; admission/restore rejection implemented and parent-verified. |
| 1893 | Known follow-ups — B3 browser collision recurrence (unresolved) | Active game/flake | Existing U-002 | `ROADMAP.md:1893`; U-002 records the Studio separation recurrence. |
| 1901 | Known follow-ups — C2 pond/social and direct Glass removal (needs decision) | Active game/interactions | Existing U-004, U-005, U-006 | `ROADMAP.md:1901`; `docs/interaction-ownership.md`; three distinct C2 conditions. |
| 2008 | Known follow-ups — stargaze timer is decremented twice (deferred) | Active game/behavior timing | Existing U-012 | `ROADMAP.md:2008`; U-012 owns the timing/parity decision. |
| 2016 | Known follow-ups — historical interruption flag must not gate new learning (fixed in batch 2) | Active game/learning | Already fixed/resolved | `ROADMAP.md:2016`; per-session token regression. |
| 2022 | Known follow-ups — module setter accepts unknown IDs (fixed in B2) | Active game/modularity | Already fixed/resolved | `ROADMAP.md:2022`; B2 reject-unknown policy. |
| 2029 | Known follow-ups — hosted Settings mobile boot timeout (fixed in harness) | Active host/CI | Already fixed/resolved | `ROADMAP.md:2029`; Settings viewport emulation on booted page. |
| 2078 | Known follow-ups — opaque rendering pilot (local only, 2026-10-22) | Historical published-run/diagnostic | Historical/out-of-scope; retained in ROADMAP | `ROADMAP.md:2078`; local pilot samples, not visual acceptance. |
| 2154 | Known follow-ups — opaque required-CI rollout (published 2026-10-22; first run failed, second passed) | Active host/CI | Existing U-014 for the pair failure; rollout itself published | `ROADMAP.md:2154`; U-014 owns the unresolved cuddle/pair fixture condition. |
| 2220 | Known follow-ups — intermittent cuddle completion failure (unresolved; code not at fault and no repair selected) | Active game/flake | Existing U-014 | `ROADMAP.md:2220`; U-014 records trigger, diagnostics and disposition. |
| 2243 | Known follow-ups — hosted boot stalls under software rendering (mitigated, mechanism unresolved) | Active host/CI flake | Existing U-013 | `ROADMAP.md:2243`; U-013 records the unresolved boot-stall mechanism. |
| 2524 | Known follow-ups — browser test latency (2026-10-21, partial) | Active host/tooling | Existing U-013 for remaining stalls; latency work completed | `ROADMAP.md:2524`; harness timeouts/diagnostics improved, intermittent stalls unresolved. |
| 2556 | Known follow-ups — parity test tiers (2026-10-21, fixed) | Active host/parity | Already fixed/resolved | `ROADMAP.md:2556`; fresh/development/long labels and scheduling. |
| 2570 | Known follow-ups — parity runtime (2026-10-21, optimized) | Active host/parity | Already fixed/resolved | `ROADMAP.md:2570`; profiling/optimization record; no behavioral change. |
| 2616 | Known follow-ups from this slice | Active game/assets | Already fixed/resolved for named items; later visual/risk note retained | `ROADMAP.md:2616`; shared asset lifetime, manifest validation, partial setup fixed. |
| 2679 | Known follow-ups after the Phase 3a motion pass | Active game/behavior | New U-019 for the `fieldInfo()` throw; other behavior items retained in ROADMAP (planned/deferred) | `ROADMAP.md:2679`; `src/app.js` `fieldInfo()` dereferences missing Studio `bounds`; facing/timer items are deferred tuning. |
| 2721 | Known follow-ups after Phase 3b | Active game/home/sleep | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:2721`; sleeping-body and home-capacity design follow-ups. |
| 2768 | Known follow-ups after Phase 4 | Active game/social/home | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:2768`; interiors, roster bonds and stale bond-key cleanup. |
| 2792 | Known follow-ups after Phase 5 | Active game/life/home | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:2792`; capacity, nursery and life-timing decisions. |
| 2819 | Known follow-ups after the effects pass | Active game/rendering | Retained in ROADMAP (planned/deferred) | `ROADMAP.md:2819`; god-ray reimplementation and foliage performance notes. |
| 3426 | Known follow-ups from this audit | Active game/UI/save | New U-020 and U-021; guardian capacity fixed | `ROADMAP.md:3426`; inactive-map lineage panel defect and duplicate-UID recovery decision; guardian capacity already implemented. |

### Alias and duplicate check

- No ROADMAP heading duplicates an existing U-ID; the audit links rather than
  copying or deleting history.
- `ROADMAP.md:1901` maps to three separate conditions (U-004, U-005, U-006), not
  aliases. `ROADMAP.md:2154` and `:2220` both point to U-014 because they describe
  the same pair/cuddle fixture failure; `:2243` and `:2524` both point to U-013
  because both retain the unresolved hosted-stall condition.
- The two new defect IDs (U-019, U-020) and the decision ID (U-021), plus U-022,
  were checked against U-001–U-018 and are not duplicates.

### I3 counts

- `**Known follow-ups` headings audited: **42** (verified unique by line).
- Active register entries: **22** (U-001–U-022).
- Existing IDs linked from ROADMAP headings: **7 distinct** (U-002, U-004,
  U-005, U-006, U-012, U-013, U-014) across 7 headings.
- Historical/out-of-scope headings: **15**.
- Already fixed/resolved headings: **10**.
- Active planned/deferred headings retained in ROADMAP without a register ID:
  **7** (plus non-`fieldInfo` bullets in line 2679).
- New IDs: **4** — U-019, U-020, U-021, U-022.
- Dispositions total: 15 historical + 10 fixed + 7 existing-ID headings + 7
  retained-planned + 3 new-ID headings (line 3426 carries two new IDs) = **42**.
- Current unresolved statuses across U-001–U-022: **15 open**, **5
  needs-decision**, **0 blocked**, **2 resolved**; by category: **2 defect**, **8
  verification** (7 unresolved), **5 decision** (4 unresolved), **1 unsupported**,
  **3 flake**, **3 deferred**. Open flakes: U-002, U-013, U-014. Open/deferred:
  U-007, U-012, U-018.

## Pending audit (superseded by I3)

Superseded 2026-10-23 by the [I3 backlog audit](#i3-backlog-audit-2026-10-23)
above. The historical paragraph is retained for context only:

> `ROADMAP.md` contains older Known follow-ups for authoring, assets, UI, published
> runs and retired routes. They are not silently closed by this register. Batch I3
> will audit each current-route entry, link or migrate it here, and mark historical
> or already-resolved items without rewriting the original record. Until that
> audit, `ROADMAP.md` remains authoritative for those entries.

## Batch I operation

- **I1:** create this register, establish IDs/rules, migrate the active known
  items above, and add the update gate to the roadmap and agent procedures.
- **I2:** every Batch D–H step records new findings and updates affected entries
  before parent review; no separate register-only coder run is required.
- **I3:** after Batch H, reconcile every known entry, audit the pending backlog,
  resolve aliases and require an explicit disposition for anything still open.

Batch I records evidence; it does not repair entries. Each repair still needs
its own approved scope, and separately gated actions remain separately gated.
