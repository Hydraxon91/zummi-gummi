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
| U-019 | `fieldInfo()` throws when the active map has no `bounds` | defect | resolved | Debug API usability | `src/app.js` `fieldInfo()`; Studio/map without `bounds` | `fieldInfo()` dereferenced `getActiveMap().bounds.shape` after checking only `field`; the ROADMAP Phase 3a audit records that calling it while Studio is active threw instead of returning a field-only result. C02 at `7dbb93b` changed the `bounds` expression to read `field.bounds` (the built field's own `FIELD_BOUNDS`), leaving the result shape and every other field unchanged. Evidence: `node --test tests` 719/719, `node scripts/check-behavior-contracts.mjs` 17 modules/34 states, `git diff --check` clean; `.dev-shots/c02` browser probe booted Meadow, switched via `__gummy.setMap('studio')` and back, with `fieldInfo()` returning `{shape:'circle',radius:65}` and no throw in all three states, zero page errors. | Closed for field diagnostics; Studio still has no bounds of its own and the hook intentionally reports the field it describes, not a fabricated Studio bound. |
| U-020 | Family/lineage panel indexes only active-map actors | defect | open | Roster/lineage display | `src/app.js` lineage/relationship UI; `src/family.js`; `src/relationshipview.js` | The older family/lineage panel indexes only active-map actors, so a parent or sibling on the inactive map can disappear and change the computed generation; the relationship view does not have this gap. Recorded in `ROADMAP.md` at line 3426; not repaired by G/H. | Decide whether lineage/generation uses game-wide actor state and add host coverage for an inactive-map relative. |
| U-021 | Duplicate-UID save recovery policy | decision | needs-decision | Save recovery | `src/saveformat.js` duplicate-actor rejection; existing user saves | Duplicate UIDs are rejected at load with no automatic renumbering. Any pre-existing duplicate save therefore needs a recovery policy; changing rejection/renumbering semantics is a user decision, not an audit fix. | Choose reject-only guidance, manual repair, or an approved migration before touching the loader. |
| U-022 | Glass obstacle-interface grab coverage | verification | open | Glass interaction evidence | `src/glass.js` grab/obstacle path; Studio/browser harness | The A/B Glass grab work is implemented and the full lifecycle/Studio regression pass, but the ROADMAP record at line 1660 still marks obstacle-interface coverage as outstanding. G/H changed tests/docs only and do not prove that path. | Add a targeted obstacle-interface browser probe or explicit unsupported disposition. |

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
