# System modularity, extensibility and engine portability

**Status: source audit and proposed roadmap only. No implementation approved.**

This is the forward-looking continuation of
[P0–P5](../MODULARITY_PORTABILITY_ROADMAP.md), not a replacement for its evidence.
The goal has two independent acceptance axes: **easy, safe feature extension** and
**explicit contracts that can be translated to another engine**. Neither implies
a framework rewrite or an engine migration.

## Audit method and limits

This pass inspected the current, uncommitted working tree, including the P0–P5
changes. It read the architecture ownership contract, the prior audit, behavior
module/support contracts, world state/storage, graphics UI, launcher dependencies,
actor removal, surface construction/scheduling and the field public interface.
It surveyed runtime files/imports and application ownership regions. Other
families below retain the prior P0/P5 inspection or representative-source sampling,
as stated. This is a system-boundary audit, not an exhaustive branch, bug, security,
performance or lifecycle certification.

No browser, Node suite, physics test or benchmark was run for this documentation
pass. P5's recorded 352 Node tests, 68 smoke checks and scheduler probe are prior
evidence, not fresh verification of the proposed architecture. Existing user work
was preserved. No runtime, dependency, CI, save or gameplay change is included.

## Definition of done: modular does not mean arbitrarily pluggable

A system is ready when it has:

1. One documented owner for each mutable state/resource and authoritative write.
2. An explicit, small public API; dependencies passed at composition boundaries,
   not a service locator, global event bus or opaque universal context.
3. Stable definition IDs separate from placed instances, live actors and saves.
4. A lifecycle contract for create/attach, activate, interrupt, leave, restore and
   release, declaring which operations are unsupported or application-lifetime.
5. A documented extension recipe, with a representative successful addition and
   deliberately invalid definition/transition tests.
6. Headless rule/contract tests where appropriate and real-host integration checks
   for wiring, ownership and side effects.
7. Translation fixtures for portable decisions and explicit engine-specific
   adapters for rendering, storage, input and physics.
8. Preserved behavior, save compatibility, ordering, resource ownership and
   measured hot-path cost where affected.

The NPC system supplies the example: definitions, authored opportunity order,
layered configuration, adapters, support declarations and conformance tests.
It does **not** justify making survival, physics or every subsystem disableable.
`behaviors/contracts.js` explicitly distinguishes profile-only, feature-only,
finish-current, unsupported and legacy-unverified policies. Apply that honesty
to other systems rather than promising uniform toggles.

No target file count or line-count reduction constitutes acceptance. Keep direct
calls, live identity, pooled buffers and batch submission where they are useful.
Only introduce extension machinery when a concrete second case needs it.

## Current system inventory

Readiness describes boundaries, not correctness or a percentage of a future port.
**Good** means a useful existing seam, **mixed** means rules and host overlap,
**host** means predominantly platform/representation-specific, **unverified**
means no implemented system or insufficient evidence. All proposals below remain
pending individual approval.

| Family / representative sources | Current boundary and extension friction | Readiness / next item |
| --- | --- | --- |
| Behavior modules: `behaviors/module.js`, `contracts.js`, `engine.js`, `config.js`, README | Validated states/opportunities and layered config exist; engine still supplies broad field context. Not every module supports toggling. Contracts inspected this pass; dispatch previously inspected. | Good/mixed; M1–M3 |
| Traits, mood, habits, proposals: `behaviors/traits.js`, `mood.js`, `preferences.js`, `proposals.js` | Portable calculations and fixtures exist. Actor caching, feature flags and timing remain integrated. Prior audit/fixtures retained. | Good; M0, M18 |
| Pair/group/social/family: `interactions.js`, `family.js`, `relationships.js`, behavior activity modules | Existing shared protocols, but direct pair/task writes remain distributed. Cancellation must be proved per feature, not inferred from file separation. Prior representative cleanup inspection. | Mixed; M2 |
| Species, genetics, rigs: `species.js`, `dna.js`, `config.js`, `msnrig.js`, `buddyrig.js` | Registry and gene extensions exist; species imports executable rig data and inheritance functions. A new body is not just a JSON entry. Prior dependency audit. | Good/mixed; M4 |
| Actor view, identity, lifecycle: `npc.js`, `actorrecord.js`, `actorsave.js`, app spawn/remove/growth/birth | Shared view/records exist; application still owns UID allocation, pooling, growth/body rebuild and removal. `removeBear` and surface paths inspected this pass. | Mixed; M5–M6 |
| Navigation/avoidance/bounds: `navmesh.js`, `navdebug.js`, `avoidance.js`, `fieldshape.js` | Numeric navigation already separated from debug rendering. Dynamic obstacle/reachability composition still field/app-owned. P4/prior inspection retained. | Good/mixed; M7 |
| Food, gifts, resources: `foodtypes.js`, `food.js`, `foodportions.js`, `behaviors/gifting.js`, `giftvisuals.js` | Definitions, mutable registries and visual mirror exist. Claims depend on live identity; entirely new risky food needs handler and visual work. Prior inspection retained. | Good/mixed; M8 |
| Homes and occupancy: `homes.js`, `family.js`, app home/birth helpers, field composition | Visual styles are defined; ownership, capacity, door approaches and simulation queries span hosts. Interiors and placement are not implemented by modularization. Sampled dependencies. | Mixed; M9 |
| Map/world/content: `world.js`, `mapcontent.js`, `floratypes.js`, app activation | Authored content is separated; world module reads storage at import and exports mutable singleton state; map IDs/restore paths assume current maps. World inspected this pass; P0 activation evidence retained. | Mixed; M10–M11 |
| Saves/migration/storage: `saveformat.js`, `save.js`, `actorsave.js`, app save/New Game | Format/storage split exists. Ordered live capture/apply and quick-resume remain separate integration surfaces. P2/P0 evidence retained. | Good/mixed; M10, M12 |
| Scheduler/clocks/RNG: app loop, `sky.js` | P5 documents existing gates and global stream; characterization is not decoupling. Visuals and decisions can consume the same RNG. | Mixed; M13 |
| Physics and movement: `box3d.js`, `ai.js`, `glass.js`, app forces/grab/hop | Batched bridge and representation adapters exist; app still owns soft-body construction/readback and locomotion. Solver internals not newly audited. | Host/mixed; M6, M14 |
| Surface/pose/eyes/shadows: app `poseAndTargets`, `buildBear`, `updateSurfaces`, `writeEyeInstance` | Numeric field construction shares actor, quality and three.js buffers; budgeted builds and stable lattice are load-bearing. Construction/scheduler sampled this pass, not fully verified. | Host/mixed; M14 |
| Glass/Studio actor animation: `glass.js`, `msn.js`, app Gummy poses | Different representation lifecycles and picking paths; do not force skinned and metaball actors into one renderer. Prior loader cleanup inspection; Gummy path sampled. | Host/mixed; M4–M6, M14 |
| Assets/catalog/leases: `assets.js`, `assetstore.js`, `assets/README.md` | Stable catalog and injected loader; coalesced leases and per-instance cleanup. Keep this ownership, not a second asset cache. Prior audit. | Good/host; M15 |
| Field terrain/pond/water: `field.js` | Public API exposes nav, food, homes, colliders, sky, uniforms indirectly and visuals. Water/reflection, shoreline and simulation composition share a builder. API inspected this pass. | Host/mixed; M1, M16 |
| Vegetation/scenery/wind/sun: `trees.js`, `bushes.js`, `backdrop.js`, `horizon.js`, `wind.js`, `sunlight.js`, `studiohouse.js` | Named render modules exist; authored batches, shader hooks, shared wind and reflection culling must survive extension. Dependency survey, not shader audit. | Host with good internal modules; M16 |
| Sky/lighting/weather: `sky.js` | Clock and visual update share owner. Presets and uniforms are engine-specific; numeric clock contract is documented in P5. | Mixed/host; M13, M16 |
| Effects/graphics/materials: `effects.js`, `graphics.js`, app profiles/toon/quality | Effects factory exists; graphics combines pure normalization, browser persistence and DOM controls. Composer lacks public teardown; do not assume safe recreation. Graphics inspected this pass; prior effects follow-up retained. | Host/mixed; M15, M17 |
| Input/picking/camera/possession: app pointer handlers, camera and control regions; launcher | Overlapping gesture priorities and input-driven simulation/presentation. Launcher injects collaborators but also owns three.js/UI/input. Boundary survey and launcher constructor inspected. | Host/mixed; M19 |
| UI/menu/settings/roster/save panels: app, `index.html`, `relationshipview.js`, `thoughtbubble.js`, `aidebug.js` | Some read models/overlays exist; substantial DOM listeners, commands and state are app-owned. Listener teardown not exhaustively inspected. | Host/mixed; M17, M20 |
| Toys/fireworks/cannon: `launcher.js`, app blast/rocket/particle regions | Cannon factory exists; fireworks mix picking, impulses, pooled particles and visuals. New toys should not require copying app globals. Boundary survey. | Host/mixed; M21 |
| Diagnostics/testing/tooling: app `__gummy`, scripts, tests | Rich hooks and parity evidence; public debug inventory and fixture portability are incomplete. Source-order tests are not general architectural checks. | Good/mixed; M0, M18, M22 |
| Audio, inventory, village/jobs/editor and additional maps | No implemented general audio/inventory/village system established by this audit. Roadmap features are not existing extension APIs. | Unverified/future; M23 |

## Priority and sequencing

M labels are new proposals, not renamed completed P chunks. Effort is relative:
S localized, M several collaborators, L high-risk cross-system work. Split M/L
items into bounded approved steps after inspecting their current callers.

1. **Foundation:** M0 → M1; M2/M3 can follow with their own behavior decisions.
2. **Session ownership:** M5 inventory first; M10 → M11 → M12. M4, M7–M9 can
   proceed as their consumers require them; not all must finish before UI work.
3. **Browser modularity:** M17, then M20; M19 precedes M21 where input is shared.
4. **Specialized hosts:** M6/M14–M16 only after contracts and baseline evidence.
   Preserve existing factories that already suffice; avoid extraction for size.
5. **Port evidence:** M18 pure pilot can run early after M0 and target selection;
   its integrated slice follows the relevant ownership work. M22 is a final
   extensibility review, not permission to run all scenarios indiscriminately.
6. **New gameplay:** M23 is separate design work. Do not wait for every optional
   extraction to finish before adding a bounded feature through proven seams.

M13 clock/RNG work is a **decision gate**, not a prerequisite license to redesign
simulation. P5's preserved policy remains the default.

## Proposed implementation chunks

Every item requires fresh target/caller/helper inspection, a bounded plan and
explicit implementation approval. “Probe” means a disposable/test fixture unless
a gameplay addition is separately approved.

### M0 — Publish ownership and extension contracts (S; first)

**Complete — documentation only.** [Current ownership and extension contracts](system-ownership-contracts.md)
cover the 24 inventory families, current operations/callers, state/lifecycle
ownership, extension touch points and evidence gaps. Parent source review closed
the surface-budget, fallback-warning ownership and internal/public API findings.
Documentation checks passed; no runtime tests were rerun for M0.

- Create a compact maintained table of state/resource owners, public operations,
  lifecycle guarantees, supported extension types and forbidden dependencies.
- Cover live actor identity versus saved UIDs; distinguish app-lifetime objects
  from recreatable instances. Inventory existing tests before adding duplicates.
- **Gate:** each inventory row has a named owner, callers and evidence gap; each
  subsequent chunk maps requirements to checks. No generic plugin framework.

### M1 — Narrow behavior world/presentation inputs (M; M0)

**M1a–M1d complete and reviewed:** the modules engine accepts optional
`findPath`, `getNavigation`, `getHomes`, `getFood` and `getWaterSpots` host
callbacks. The corresponding `api.*` queries resolve providers on every call,
preserve backing identities and treat provider `null`/`undefined`/empty as
authoritative. Omitted providers retain the existing `field` fallback. Wander,
flee, social visit, group slots and destination routing use navigation; home
assignment/follow/visit/playdate/meal paths use homes; forage, hive, conflict,
gifting food handling, family meal search and engine food helpers use food; water
uses water spots. Existing guards, claim/release/consume identity, order, RNG and
exceptions are preserved, including null-provider cleanup.

Evidence: the parent independently reran focused navigation/path/emote/social
tests and resource tests (28/28), the full Node suite (405/405), HTTP smoke 68/68,
real-host legacy/modules browser trace parity (202/202 transitions), and the
groups scenario 2/2 after the final null-provider corrections. The coder reported
short parity 9/9 and fresh long parity 15/15 on the main implementation before
the null-only guards; those retained artifacts are under `.dev-shots/m1cd/`.
Scratch evidence is not committed.

**B1 portions capability complete:** optional `getPortions()` / `api.portions()`
now supplies gifting recovery, claim/take, drop and release without a rendered
field. Parent review removed a missing-method compatibility shim; direct module
fixtures now explicitly provide the capability. Parent checks passed 427 Node
tests and the normal browser gifting suite (8 checks, inspected captures).
Coder short parity passed 9/9 and browser parity matched 202 transitions.
Unavailable-registry drop behavior and fallback IDs are unchanged. App-side
save/removal orchestration remains outside this capability slice.

**Still open:** gifting carried-state orchestration and other broad field dependencies
(pond, splash, emote, UI, app orchestration). This is not a complete
field-independent behavior host or an engine-neutral architecture claim.

- Continue the P3 callback pilot by exposing only the actual homes/navigation/
  resource references used by behavior, preserving backing object identity.
- Replace broad rendered-field access one capability at a time; retain synchronous
  ordering, emote semantics and the legacy compatibility path.
- **Probe/gate:** run a representative behavior with no three.js/DOM field builder;
  missing capability fails explicitly; host/parity traces and RNG counts match.

### M2 — Interaction ownership and cancellation conformance (L; M0)

**M2a complete:** the [interaction ownership inventory](interaction-ownership.md)
records pair/task/group/claim writers, protocol boundaries, lifecycle outcomes,
an explicit outcome/reason vocabulary, existing test coverage and gaps. It is a
source inventory only; no centralization, runtime change or M2b family was
chosen.

**C1/M2b social-entry pilot complete:** invite and visit pair links now use a
narrow own-side `linkPartner` primitive while preserving the existing state,
timer, target, path, face, emote and family-task write order. Parent full Node
passed 490/490; development short parity passed 9/9; the browser entry trace
passed 5/5 and the existing social pair scenario passed 2/2. This pilot does not
move visit cancellation, rewards or the other direct writers.

**C2/M2c cancellation conformance complete for the named pilot paths:** real
invite/social/visit transitions cover completion, refusal, grab, critical needs,
AI disable, detach and host save/load/map/New Game. Interrupted visit close now
clears pair/visit/task state without bond, relief or completion history;
completion keeps its existing reward and history. Parent full Node passed 500/500;
development parity passed 9/9. Browser evidence covers the public lifecycle
paths. Remaining findings are pond/social survival (C2-F2), residual timers
(C2-F3) and direct Glass-removal cleanup (C2-F4); they are recorded, not claimed
fixed.

**C3/M2d representative extension proof complete:** a disposable pair/task
definition in `tests/activity-extension.test.mjs` drives host/guest entry,
travel/act/done, cancellation and save exclusion through existing
`registerInteraction`/`startTask`/`tickTask`/`cancelTask`/`endPair` and engine
interruption. Parent full Node passed 507/507. It adds no shipped activity,
module, dispatcher, registry or runtime hook. The approved M2 pilot scope is
complete; C2-F2/F4 remain open follow-ups.

- Inventory writers of partner/task/group/reservation state before choosing any
  centralization. Specify completion, refusal, interruption and removal reasons.
- Move only agreed writes through existing protocols, one activity family per
  chunk; preserve reciprocal live references and exactly-once resource effects.
- **Probe/gate:** a representative new test activity uses existing pairing/slots;
  grab, critical need, disable, removal, switch, load and New Game leave no stale
  partners/claims. Existing activities and legacy parity remain unchanged.

### M3 — Configuration and module admission contracts (M; M0)

**B2/M3 complete:** configurable IDs are exactly the source-registered layered
defaults. Unknown, malformed and profile-only IDs return `false` without changing
config/cache versions; actor patches containing any unknown module key reject
atomically. Species fallback and supported toggle policies are unchanged. Parent
full Node suite passed 434/434 and browser admission/version checks passed;
coder short parity passed nine race/seed cases. Registration remains source-based,
not a dynamic plugin API.

- Resolve the documented unknown-ID setter policy (reject/warn/permissive) before
  editing. Keep essential/profile-only behavior honestly non-toggleable.
- Audit cache invalidation, per-species/actor/runtime precedence and feature-off
  cleanup; do not enable reserved conflict parameters as a cleanup.
- **Probe/gate:** valid extension registers and resolves; invalid/duplicate IDs,
  unsupported options and stale-cache negatives are covered. Any API tightening
  is approved explicitly, not hidden in extraction.

### M4 — Species and representation extension recipe (M; M0)

**B3/M4 admission and recipe complete:** the user approved permissive registration
with strict runtime/save admission. [The recipe](species-extension-recipe.md)
and fixture tests cover existing-representation registration, eligibility, actor
view, save/common-state boundaries and unsupported representation rejection.
Save validation rejects before mutation; spawn/restore no longer substitutes Bear
or silently skips unsupported skinned species. Parent full Node passed 448/448;
the asserted browser probe independently passed invalid-load non-mutation,
supported fixture restore and direct Glass all-before-creation rejection.
Live birth remains unverified. The broader Studio regression had passes and an
unresolved collision failure (0.241865 versus 0.25); it is not a clean regression
acceptance claim or a physics fix. The pre-existing collision follow-up remains.

- Document biology/capabilities, rig/asset representation and species balance as
  distinct responsibilities. Inspect callback/typed-array dependencies before
  proposing a data split; neutral JSON is not mandatory.
- Specify minimum adapter operations for a *supported* new species and report
  unsupported rig/asset/capability combinations instead of falling back silently.
- **Probe/gate:** fixture species using an existing representation works through
  registration, birth eligibility, actor view, save validation and restore;
  malformed combinations fail. A new body/rig is a separate authored scope.

### M5 — Actor/session identity and lifecycle contract (M; M0)

**M5 contract complete:** [actor/session identity and lifecycle](actor-session-lifecycle.md)
records UID allocation/reservation, pooled slots, attach/detach, birth/growth,
real removal, map/save despawn and New Game, with six focused tests in
`tests/actor-lifecycle-contract.test.mjs` and 66 directly relevant existing tests
passing. App-internal spawn/pool/remove ordering and partial-creation failure
cleanup remain Inspected/Unverified because they are not importable without a
DOM/WebGL/physics boot; no production exports were added. M6 extraction remains.

- Inventory UID allocation, pool reuse, attach/detach, real removal versus map
  despawn, birth/growth and reset. Keep persistent, runtime and renderer state
  distinct without replacing live actors by copied records.
- **Probe/gate:** repeated attach/remove, pooled reuse, cross-map references,
  high-UID restore and another-game UID reuse preserve current contracts;
  partial creation failures release only owned resources.

### M6 — Extract actor host orchestration (L; M5, relevant M4 contracts)

**D1/M6a growth slice complete:** `src/actorlife.js` owns portable soft-body
eligibility, deferred-stage state, COM-relative scaling and leaving-baby
guardian/follow cleanup. The app `applyBearStage()` wrapper keeps Box3D/surface
rebuild, sparks, stats and history, preserving callback/RNG order. Parent full
Node passed 536/536; Glass growth, seeded Bear normal/deferred growth, HTTP smoke
and short parity passed.

**D2/M6b birth-planning slice complete:** `src/actorbirth.js` owns portable
eligibility, safe-food/father/species/cap gates, flavor/pace, home/door/walkable
placement, genome, sex and parent UIDs; `birthChild()` still owns spawning,
traits, bonds, history, mother reset, stats and emotes. Parent full Node passed
547/547; seeded live Bear birth and save export/import restore passed, as did
Glass lifecycle, HTTP smoke and short parity. U-001 is resolved; U-003/U-011
remain open.

**D3/M6c removal-sequencing slice complete:** `src/actorremove.js` owns the
portable soft/Glass removal order and `preserveRefs`/colony-result gates; the app
wrappers keep food/portion claims, behavior detach, bodies, references, grabs,
mesh/eye work and Glass disposal. Parent full Node passed 559/559; `departure-test`
(8/8) and `stars-test` removal paths passed with no page errors. U-003/U-006/U-011
remain open; async completion, map teardown and M6 completion are not claimed.

- Move birth/growth/removal orchestration out of app in bounded slices, with
  explicit representation callbacks. Keep Bear/Gummy and Glass implementations
  specialized and their shared decision owner unchanged.
- **Probe/gate:** growth during grab/airborne states, birth cap blocking, real
  removal, map teardown and async asset completion after removal are tested;
  24-body rig, shape and force/readback order do not change.

### M7 — Spatial queries, layout and placement boundary (M; M0)

**B4 boundary complete:** `fieldlayout.js` exposes the existing numeric layout
validator without scene construction; the live field wrapper preserves authored
pond geometry, query binding, messages and ordering. Parent full Node passed
464/464 and browser layout/door/path checks passed. See
[the spatial contract](spatial-layout-contract.md). Real split-grid fixtures prove
`findPath` refuses disconnected routes, but `nav.validate`/layout validation is
not a connectivity admission gate. Full edit-time disconnection rejection and
coordinated rebuild remain unsupported, not delivered as an editor feature.

- Retain numeric nav/avoidance/bounds modules. Separate authored obstacle/layout
  descriptions from debug/render objects where needed by a concrete consumer.
- Define placement validation and edit-time nav rebuild ownership before Phase 9.
- **Probe/gate:** asymmetric layout with doors, pond, cannon and blocked routes;
  invalid placement/disconnection rejected, tie/path fixtures unchanged. Dynamic
  editing remains a separately approved feature, not an extraction side effect.

### M8 — Resource extensions and visual mirrors (M; M0, M2 for interactions)

**C4/M8 complete:** [resource extension contract](resource-extension-contract.md)
and `tests/resource-extension.test.mjs` prove an existing-visual fixture food,
claim/consume/visibility timing, portion identity/ownership, carry/drop, save shape
and field/studio isolation. Parent full Node passed 517/517. App map/restore
orchestration and dropped/carried mesh timing remain source-inspected or reuse
B1/C2 browser evidence; no new visual, risk action, registry or renderer
dependency was added.

- Preserve food/portion registries and stable portion identities. Document the
  boundary between a definition using an existing renderer and a new risk/action.
- Narrow presentation callbacks rather than importing renderer objects into
  claim/consume logic; preserve visibility timing and resource ownership.
- **Probe/gate:** fixture food type using an existing visual; duplicate claim,
  double consume, interrupted carry, restore-as-dropped and map isolation checks.
  General inventory and risky-food plugins require separate semantics.

### M9 — Home simulation versus building presentation (M; M7)

**C5/M9 complete:** [home boundary contract](homes-boundary-contract.md) and
`src/homesim.js` separate active resident counting and birth-home choice from
villa meshes, occupancy effects and field descriptors. Parent full Node passed
528/528; the browser birth probe confirmed mother-home retention under capacity
and first least-populated overflow selection. Door/route and occupancy-glow
visuals remain with their existing owners; no capacity or interior policy changed.

- Specify resident/capacity/ownership queries and door/activity anchors apart
  from villa meshes and occupancy effects. Preserve overflow and family rules.
- **Probe/gate:** alternate existing home style reuses the same capacity/door
  rules; bad/missing anchors fail; occupancy, baby home, sleep and door reachability
  remain correct. No new interior simulation or capacity balance implied.

### M10 — World state versus browser quick-resume storage (M; M0)

**B5/M10 complete:** `createWorldState({ getStorage })` provides independent
sessions and explicit hydration; importing `world.js` no longer reads browser
storage. The app hydrates the existing singleton before use. Keys, legacy launcher
precedence, truthiness quirks, read-merge-write and best-effort persistence remain.
Parent full Node passed 478/478 and the browser hydration/map/save/load/New Game
probe passed 18/18. See [world/storage contract](world-storage-contract.md).

- Isolate `world.js` import-time localStorage access behind explicit hydration/
  persistence collaborators while preserving keys, defaults and launcher fallback.
- Keep one authoritative active-map state and no second world store.
- **Probe/gate:** independent headless sessions; missing/malformed storage,
  existing saved preferences and fresh-game reset retain current behavior.

### M11 — Map/session lifecycle coordinator (L; M5, M10)

- Extract activate/leave sequencing with explicit save, input-release, actor,
  scene and clock collaborators. Preserve pause and asynchronous switch semantics.
- Audit two-map assumptions before a future map factory/registration contract;
  new map IDs require an explicit save-validation decision.
- **Probe/gate:** repeated field/Studio switches, guarded reentry, failure paths,
  active-only simulation and no source/instance leaks. Test-only third-map fixture
  only after its validation scope is approved; no playable map is implied.

### M12 — Save capture/apply coordination (L; M5, M10–M11)

- Retain the P2 format/storage boundary. Extract capture/apply sequencing only
  after tracing load, autosave, switch and New Game overlap.
- Decide concurrent-operation and failure behavior before introducing a lock or
  queue; do not silently add rollback/transaction guarantees not implemented today.
- **Probe/gate:** invalid input before mutation, sparse versions, cross-map UIDs,
  carried portions, unrelated saves, current storage failures and chosen overlap
  policy. No schema bump unless separately required/approved.

### M13 — Clock and RNG ownership decision (S investigation; L redesign)

**M13 investigation complete:** [clock/RNG decision memo](clock-rng-decision.md)
recommends retaining current ownership and closing M13 without redesign. No
concrete consumer was found for a narrower clock query; existing host callbacks
and diagnostics already cover reads. The P5 source-order suite passes 5/5. This is
a recommendation only: no clock split, RNG isolation, cadence change or runtime
change is approved. A future redesign remains a separate decision.

- Use the P5 contract as baseline. Evaluate a narrow clock-read interface without
  moving time advancement or splitting the global stream.
- Separately decide sky versus life speed, visual RNG isolation and callback
  cadence only if a real consumer requires policy changes.
- **Gate:** preserve P5 gates/order/draws for mechanical work. A changed cadence,
  independent stream or fixed-step gameplay requires new expectations, explicit
  design approval and migration/compatibility decisions—not a parity waiver.

### M14 — Surface, physics and representation host modules (L; M5)

- First inventory numeric kernels versus three.js upload and Box3D state. Pilot
  one numeric surface fixture before moving buffers or scheduler ownership.
- Keep 24-body construction, stable lattice/hysteresis, rebuild priority/budget,
  instanced eyes and pooled readback. Define adapter needs, not universal physics.
- **Probe/gate:** asymmetric/deformed numeric cases, visual surface/eye continuity,
  growth/grab/throw/pond recovery and unchanged batched solver integration; measure
  affected hot paths using the established performance method. Box3D/WASM changes
  remain separately gated and are not part of this extraction.

### M15 — Resource and asynchronous lifetime contracts (M; M0)

**C6/M15 complete:** [async lifetime contract](async-lifetime-contract.md) and
`tests/async-lifetime.test.mjs` cover coalesced loads, refcount/release,
cancellation before lease resolution, failure/retry, preload/eviction and
store-level late completion. Parent full Node passed 532/532. Glass late
completion and effects teardown remain source-inspected/unsupported; no host
proof or recreation mechanism was added.

- Keep catalog/lease infrastructure. Audit partial construction, failed loads,
  removal-before-completion, instance/source disposal and renderer-owned targets.
- Address effects teardown only when recreation is actually required; distinguish
  unsupported teardown from a falsely reusable factory.
- **Probe/gate:** coalesced load, failed-load retry, late completion after removal,
  no shared-texture disposal, repeated supported attach/release and no duplicate
  listeners/resources. No second cache or blanket recreation requirement.

### M16 — Field/environment composition by responsibility (L; M1, M7–M9)

- Separate simulation resource/query access from scene composition, preserving
  existing tree/bush/home/wind modules. Start with one consumer boundary.
- Consider pond/water/reflection or terrain as cohesive modules only after their
  shared uniforms, shoreline, collider and camera dependencies are inventoried.
- **Probe/gate:** alternate definition using an existing builder; invalid content
  references fail. Current authored order, hive hosts, wind coherence, reflected
  visibility, instancing and draw submission stay intact; inspect views and measure
  affected costs. No per-blade/per-branch CPU update loops.

### M17 — Settings definitions, storage and UI adapters (M; M0)

- Separate pure normalization/preset resolution from browser keys/URL flags and
  DOM construction. Preserve Custom semantics, reset and application ordering.
- **Probe/gate:** a fixture setting flows definition → normalization → control →
  persistence; invalid values, presets, reset, reload and viewport/focus cases are
  covered. Do not retune shipped graphics defaults or change frame quality policy.

### M18 — Executable translation specification and target pilot (M; M0)

**M18a complete:** the [translation fixture inventory](translation-fixtures.md)
maps existing literal fixtures to rules, separates JS-vs-JS parity from
cross-language evidence, lists gaps C1–C25 and specifies one pure-rule
(`combineGenomes`) plus one wire-UID adapter pilot. No target engine/language or
project was selected; M18b–M18d remain pending.

- Inventory existing literal fixtures and supplement observable missing rules:
  numbers/Float32, null versus missing, unsigned hashes/RNG, ordering/ties, live
  identity versus wire UIDs and save migrations. Reuse existing tests first.
- Choose target engine/version/language and success criteria before creating any
  target project. First port one pure rule; then one bounded actor/world adapter
  slice using the same fixture inputs and expected outputs.
- **Gate:** independently executed target results, approved tolerances and failure
  negatives. JS-vs-JS legacy parity is not cross-language proof. Native physics,
  rendering fidelity and whole-game determinism are separate evaluation scopes.

### M19 — Input routing, camera and possession (L; M0, M5)

- Inventory pointer/keyboard/touch ownership and priority: UI, launcher, portal,
  actor grab/select, possession, orbit/pan. Extract one owner at a time; reuse
  existing paths rather than add a second input stack.
- Keep camera/render coordinates in host adapters; expose intent/commands where
  useful, not DOM events in simulation rules.
- **Probe/gate:** real pointer grab/throw, selection, launcher, focus loss, held-key
  transitions, touch cancel, possession exit/map change, resize and phone controls.
  Unsupported hardware remains explicitly unverified.

### M20 — UI read models and panel controllers (L; M17 where settings overlap)

- Extend the relationship-view precedent: simulation supplies data and command
  operations; panels own DOM, keyed rows, focus and listener cleanup.
- Pilot the selected-actor/roster boundary, then menu/save/settings separately.
  Keep markup/styles extraction distinct from state-ownership extraction.
- **Probe/gate:** mocked read model without scene construction plus real-host
  click/keyboard tests, stale selection, actor removal, save/load, map changes,
  mobile layouts and inspected bright/dark captures. Preserve stable row identity.

### M21 — Cannon/fireworks/toy interaction boundaries (M; M19)

- Retain launcher factory; separate placement/fire eligibility and blast effects
  from pointer picking and pooled particle presentation where useful.
- Use explicit existing actor impulse capabilities for Bear/Gummy/Glass; do not
  make a universal toy engine or alter cooldown/ballistics/containment.
- **Probe/gate:** refused muzzle/landing, placement, firing, cross-representation
  impulse, grab priority, map state and cleanup; new toy fixture uses existing
  operation contracts without copied app globals.

### M22 — Discoverability and final extensibility audit (M; per completed seam)

- Publish supported debug/extension API inventory and copyable recipes with
  exact owners, lifecycle and tests. Keep production hooks stable.
- Add narrow architecture checks only for agreed boundaries (for example pure
  core must not import DOM/three.js). Avoid a general import-ban framework.
- **Gate:** a representative extension per completed seam changes only its
  definition/handler, composition registration and tests/docs—not unrelated owners;
  expected registration/format changes are counted honestly. Review unsupported
  cases and maintain all deferred items. CI changes need separate approval.

### M23 — Future-system admission checklist (design only)

**M23 complete:** the [future-system admission checklist](future-system-admission.md)
defines the required owner/identity/command/time/persistence/interruption/
presentation/asset/claim/test fields, reuse rules, representative-feature proof
sequence, anti-patterns and separate decision gates. It is design-only and does
not approve any future gameplay system.

Before editor/village/jobs, general inventory, audio, additional maps or new
activities, define state and resource owners, stable instance IDs, commands and
queries, time domain, persistence, interruption/undo and presentation boundary.
Reuse proven navigation, reservations, asset leases and behavior modules. Prove
one representative feature before designing a reusable registry for the family.
These remain the separate gameplay tracks in ROADMAP; this roadmap does not
approve equipment, shops/currency, goals/planners, audio or authored interiors.

## Approved execution batches

The user approved the batch map below, with Batch I added as a cross-cutting
unresolved-items register after the original A–H map. A batch is an execution
wave, not one coder assignment. Each numbered step or accepted sub-slice still
runs in its own coder session and is independently reviewed by the parent. Inside an approved
batch, a passing review advances to the next step; a failed review returns to the
same coder for correction. This removes the routine per-chunk approval prompt but
does not waive explicit design decisions or separate gates.

| Batch | Steps | Depends on | Primary gate |
| --- | --- | --- | --- |
| A — Contracts/inventory | M2a, M5, M23, M13 investigation, M18a | M0/M1 | Docs, source inventory and focused characterization; no runtime extraction |
| B — Behavior/world foundations | M1 portions closeout, M3, M4, M7, M10 | A | Focused behavior/world checks, full Node suite and affected host checks |
| C — Interactions/resources | M2b–M2d, M8, M9, M15 | A, B (M2a/M7) | Interaction cancellation, resource identity, homes and lifetime evidence |
| D — Actors/maps/saves | M6, M11, M12 | A–C (M4/M5/M10) | Actor lifecycle, map switching and save-overlap evidence |
| E — Input/UI/cannon host | M17, M19, M20, M21 | A–D | Real browser input, captures, mobile/focus and UI cleanup |
| F — Physics/environment host | M14, M16 | A–D (M7–M9) | Numeric surface fixtures, visual continuity and measured affected costs |
| G — Translation pilot | M18b–M18d | A plus target-engine decision | Independently executed target-runtime results and failure negatives |
| H — Final audit | M22 | All completed seams | Extension recipes, owner-boundary checks and honest unsupported list |
| I — Unresolved register | I1 setup/migration, I2 ongoing capture, I3 final audit | A (I1); D–H (I2); H (I3) | Every known active unresolved item has a stable ID, owner, evidence and disposition; future step findings are captured before review |

Execution order and internal slices:

- **Batch A:** M2a interaction inventory; M5 lifecycle contract and
  characterization tests; M23 admission checklist; M13 decision memo; M18a
  fixture inventory. No production runtime changes.
- **Batch B:** close M1 with portions/gifting; M3 audit and the approved
  unknown-ID policy; M4 fixture species using an existing representation; M7
  spatial/layout boundary; M10 hydration/storage boundary. The unknown-ID policy
  remains an explicit decision before M3 code.
- **Batch C:** M2b one agreed interaction family, then M2c cancellation/removal/
  load cleanup; M8 resource/presentation boundary; M9 home simulation versus
  presentation; M15 asynchronous lifetime. M8 follows the M2 work.
- **Batch D:** M6 birth/growth then removal/async slices; M11 activation/leave
  then map-assumption slices; M12 overlap-policy decision then capture/apply
  extraction. Concurrent save/map policy remains an explicit decision.
- **Batch E:** M17 settings; M19 input inventory then one owner/camera slice;
  M20 roster then menu/save/settings panels; M21 cannon/fireworks/toy boundary.
- **Batch F:** M14 numeric inventory/fixture then host extraction; M16 simulation/
  query boundary then one concrete environment consumer.
- **Batch G:** choose target engine/version/language and success criteria, port one
  pure rule, then one bounded actor/world adapter. The target choice remains an
  explicit decision; JS-vs-JS parity is not cross-language proof.
- **Batch H:** M22 supported extension/debug inventory, recipes and narrow
  owner-boundary checks. CI changes remain separately gated.
- **Batch I (cross-cutting unresolved register):** I1 creates
  [`docs/unresolved-register.md`](unresolved-register.md), assigns stable IDs and
  migrates the active known items before Batch D; I2 requires every D–H coder step
  to add/update entries before parent review; I3 audits the older `ROADMAP.md`
  backlog and reconciles every known open item after H. This batch records
  unresolved items and evidence links only. It does not repair them, waive a
  required gate or authorize a fix.
- **Conditional:** M13 redesign only if its memo recommends one and it receives
  separate approval. Box3D/WASM changes and native target physics/rendering are
  outside these batches.

**Batch A is complete:** M2a, M5, M23, the M13 investigation and M18a are
committed. No production runtime changed in A.

**B+C execution is complete:** B1 portions, B2 M3, B3 M4, B4 M7, B5 M10, C1
M2b social entry, C2 M2c cancellation conformance, C3 M2d test-only extension,
C4 M8, C5 M9 and C6 M15 all passed independent review and atomic commits. The
final fresh long parity matrix passed 15/15 (`acceptance:true`). Batch D is not
started. Batch I1 now provides the [unresolved-items register](unresolved-register.md);
I2 runs during D–H and I3 reconciles the older backlog after H. Known follow-ups
remain explicit there: M4 live birth/late Glass host proof, M5 app-lifecycle
internals, C2-F2 pond/social survival, C2-F3 residual timers, C2-F4 direct Glass
removal, M7 editor/connectivity policy, M8 visual timing, M9 occupancy/door
reachability, M15 host late-completion, stargaze timing, and the hosted boot/cuddle
flakes. No push is implied.
The M3 policy is settled: reject unknown module IDs without mutation/version
changes, and reject an entire actor-config patch containing any unknown ID.
Supported admission must remain explicit; species warning/fallback is unchanged.
New behavior decisions and separately gated infrastructure changes still stop.

## Verification, rollback and release gates

For each approved extraction:

- Record expected versus actual behavior and a requirements-to-check map before
  editing. For ambiguous policies, obtain a decision rather than assume one.
- Capture the scoped pre-change state and preserve unrelated uncommitted work.
  Roll back only the approved extraction if a new regression cannot be repaired
  safely; do not reset the whole working tree.
- Run focused contracts first, relevant Node suites next and affected browser/
  physics/map/input/visual checks through the existing verification route. Use
  controlled parity for behavior boundaries and enabled-feature checks separately.
- Check saves and lifecycle when affected; use disposable browser profiles.
  Existing P5 scheduler probe remains required for changed clock/order boundaries.
- Rendering/input changes require inspected captures; performance claims require
  same-method measurements, not inference from smaller modules.
- Update recipes and ownership docs, record failures/unverified criteria and stop
  owned verification processes. Known broken required criteria block completion.
- A feature probe is not engine migration, a green test is not implementation
  approval, and neither authorizes a commit, push, dependency or CI change.

## Deferred decisions and explicit non-goals

The following remain decisions, not automatic fixes: unknown module setter
behavior, centralized pair writes, concurrent save/map policy, all-system speed,
RNG stream separation, target-engine language and solver integration. Existing
documented bugs (including stargaze timing), hosted stalls and intermittent
fixtures retain their dispositions in ROADMAP; modularization does not repair or
waive them. Newly discovered defects must be recorded there before any repair.

Do not introduce a universal ECS, dependency-injection container, plugin loader,
event bus, engine-neutral scene graph, generalized physics facade or framework
dependency merely to satisfy this roadmap. Modules can use different internal
patterns while sharing ownership, lifecycle and verification discipline.

**Recommended first approval:** M0 only, followed by one M1 capability pilot.
Choose the target-engine pilot separately; no need to finish all optional
modularity work before testing one pure translation.
