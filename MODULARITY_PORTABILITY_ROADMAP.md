# Modularity and portability roadmap

**Status: P0 audit, P1 translation fixtures, P2 save-format extraction, P3 emote host boundary and P4 navigation-debug isolation complete; P5a–P5d scheduler/RNG characterization and contract closeout complete.**

This is a separate track from the [personality/modular-AI track](ROADMAP.md#personality-and-modular-ai-extension-track),
including AI chunk 4. Approval to write this roadmap authorizes documentation
only. No runtime extraction, migration, library replacement or gameplay change
is approved by this document.

## Goal and boundaries

Identify useful engine-independent rules/data, small host adapters and systems
best left engine-specific. Preserve the current browser game throughout.
Not everything benefits from abstraction. Portable JavaScript still requires
translation to GDScript or C#; this track chooses neither a Godot language nor
a physics replacement.

Protected contracts:

- Save compatibility, sparse actor versions and game-wide identity ownership.
- RNG draws/order, activity priorities and existing update/event ordering.
- Pair/resource reservations, interruption, cleanup and exactly-once effects.
- Active-map-only simulation, inactive-map snapshots and New Game isolation.
- Box3D and its batched bridge; Bear/Gummy 24-body metaball/surface-nets path;
  Glass authored skinned GLB and rigid-body adapter.
- Rendering/material appearance, shared asset leases, batching, instancing and
  performance-sensitive occupancy structures.
- Current dependencies, including three.js 0.186.1, and dependency-light tooling.

No generic service framework, renderer-neutral scene graph, universal physics
facade, one-module-per-function churn, Godot project or second simulation system
is planned. Deletions, large restructuring, dependencies, Box3D/WASM, CI/CD,
commits and pushes retain their separate approval gates in `AGENTS.md`.

## Audit evidence and limits

The initial audit used source inspection on 2026-10-22. Git status was clean
before and after it. No tests, browsers, parity suites or performance measurements
were executed for the audit. Historical roadmap results are not fresh evidence.
This document records findings, not a claim that the current game has passed
regression checks or that any extraction is safe without verification.

Categories:

| Category | Meaning |
| --- | --- |
| A | Already engine-independent |
| B | Portable rules/data mixed with host dependencies |
| C | Adapter boundary needed |
| D | Engine-specific implementation: retain now, replace during migration |
| E | Insufficient evidence; further inspection required |

“Inspected” means the named implementation or boundary was read, not every
branch of the surrounding system. “Sampled” means representative paths or
dependency references only. All first-party runtime families below were surveyed;
this is not exhaustive implementation or branch coverage.

### Coverage matrix

| System | Coverage and representative sources | Classification |
| --- | --- | --- |
| Preferences/habits | Inspected `src/behaviors/preferences.js`, host samples and relevant test assertions | A rules; B integration |
| Traits/mood/activity selection | Sampled traits/hash, mood dependencies and config; inspected `rankProposals()` and engine selection pipeline | A/B |
| Needs/behavior dispatch | Inspected engine construction, opportunity ordering, callbacks and interruption/detachment; other states sampled | B/C |
| Social/family/shared activities | Inspected pair/task protocol; sampled family bonds and module dependencies; individual activities not fully reviewed | A/B/E |
| Genetics/species | Inspected inheritance/expression paths; registry, rig dependencies and gene definitions sampled | A/B |
| Actor records/progression | Inspected shared serialization/restoration and Bear host; lifecycle rules/tests sampled | A/B/C |
| Relationships/history/departures | Sampled definitions, chains and persistence ownership; outcomes not fully inspected | A/B/E |
| Authored world/content | Sampled `mapcontent.js`, flora definitions and content-test assertions | A data; B composition |
| Food/gifts | Inspected food claims, timing, snapshots/restoration; portion registry sampled | A with identity caveats |
| Navigation/spatial queries | Inspected grid setup, obstacle registration and heap ordering; debug boundary and avoidance sampled | A/B |
| Map ownership/isolation | Inspected `world.js`, game-wide actor index, save capture/application and New Game samples; activation not fully traced | B/C/E |
| Timing/RNG/order | Inspected frame loop, Meadow update order, clock update, RNG injection and browser-parity seeding | B/C |
| Persistence/migrations | Inspected envelope validation/cloning, storage boundary and application sequence; individual migrations sampled | A/B/C |
| Configuration | Sampled behavior layering and graphics persistence/UI | A/B |
| Physics/movement | Inspected JS/WASM bridge and Bear readiness/locomotion boundary; Glass movement sampled | C/D |
| Rigs/deformation | Representation/import survey and actor construction samples; surface algorithm and C solver internals uninspected | D/E |
| Rendering/materials | Dependency survey across field, sky, effects, vegetation, homes, backdrop, horizon, wind and sunlight; representative updates sampled | D; reusable parameters/data |
| Assets/animation | Inspected leases, loader boundary and Glass disposal; loading/animation callers sampled | A/C/D |
| Input/possession/UI | Sampled application input/camera coupling, graphics panel and overlays; full listener lifecycle uninspected | B/D/E |
| Audio | Searches found animation `.play()` calls, not an identified audio subsystem; absence not established repository-wide | E |
| Debug/testing/verification | Inspected representative Node assertions and browser-parity setup; other harnesses inventoried/sampled | A fixtures/contracts; D browser tooling |

Important open inspection areas: surface generation, solver internals, every
activity's cancellation path, async actor-loading failure/retry behavior and
all UI listeners. Reinspect affected current source, callers and tests before
approving a corresponding implementation chunk.

### P0 evidence update (2026-10-22)

P0 read the lifecycle, map, save and representative interaction paths listed
below. This remains source inspection only; the named Node tests and browser
harnesses were inspected as protection, not executed.

**Map ownership and switch order**

- `requestMapSwitch()` guards re-entry with `mapSwitching`, then calls
  `saveCurrentWorld({ dropCarried: true })` before `activateMap(id)`. Saving
  snapshots the active map, launcher/camera/clock and field portions; carried
  food is dropped into the current map first.
- `activateMap()` releases grabs, clears pointers/drop queue, despawns live
  actors, clears Glass, sets the active map, applies map visuals, restores
  launcher/camera and portions, respawns actors, and restores or seeds Glass.
  Only the active map runs `stepMeadowAI()`.
- `despawnAll()` uses `preserveRefs: true`, so map switching does not rewrite
  cross-map partner/guardian records. A real `removeBear()` clears those live
  references after detaching behavior, releasing claims and dropping carried
  food. The distinction is load-bearing, not incidental.
- `activateMap()` calls `reserveWorldUids()` for the target world; save
  application first calls `reserveGameUids()` across both maps. New Game resets
  the allocator only after clearing both world snapshots and live state.
- The initial boot calls `activateMap(activeWorld.mapId, { initial: true })`,
  which deliberately skips despawn/clear because no live roster exists yet.

**Save ownership and restoration order**

- `applySavePayload()` validates and normalizes before mutation, reserves
  game-wide UIDs, installs both world snapshots, prunes references against all
  loaded UIDs, replaces portions, activates the saved map, converts saved
  carried food into dropped portions, restores field food, applies sky/launcher,
  then persists the field state.
- `snapshotBear()` adds Bear-only directives, schedule, pace and yaw to the
  shared `snapshotActor()` record. Runtime `ai` fields and live references are
  intentionally not saved.
- Glass restoration creates live actors through `makeActor()` and then applies
  the shared record. Model loading is asynchronous; completion checks
  `a.active`/`a.disposed`, releases the lease if the actor is gone, and failure
  disposes instance resources and exposes an error. `clear()`/`removeActor()`
  set `disposed` before releasing source leases.

**Representative interaction cleanup**

- `engine.cancelPair()` releases food for both actors, invokes the owning
  module's `interrupt()` hook when declared, breaks the reciprocal pair, and
  resets cancellable seek/pair states. `detach()` also clears movement/path state.
- `removeBear()` drops carried food, releases portion and food claims, detaches
  behavior, destroys bodies, removes grabs and then optionally clears persistent
  references. Disabling behavior iterates actors through the same cancellation,
  claim and path cleanup.
- Group cancellation removes the actor, dissolves when fewer than three members
  remain, and reassigns a leader if needed. Gifting cancellation releases the
  origin claim and drops any carried portion. Affection/relationship cancellation
  ends both sides of the pair and clears role/timer runtime state.
- `commitFarewell()` ends a partnership and cancels pairs/claims before the
  irreversible visual begins. Map despawn cancels farewell visuals and clears
  per-actor farewell runtime fields; disabling the farewell feature uses
  `cancelFarewells()`/`stars.cancelAll()`. These are separate cleanup surfaces.

**Still open before extraction:** concurrent save-load/map-switch or autosave
interactions, async model failure/retry during rapid map changes, every module's
interruption hook, and the uninspected rendering/physics internals above. No new
defect is asserted; these are evidence gaps. Existing protections include
`tests/save.test.mjs` (UID reservation/duplicate rejection), relationship-save
pruning, `tests/behavior.test.mjs` (grab cancels both sides),
`tests/relationship-features.test.mjs` (group detach cleanup) and
`tests/gifting.test.mjs` (claim/carried-food cleanup).

### P1 fixture evidence (2026-10-22)

P1 added inline translation fixtures only; no runtime, gameplay configuration,
save format or dependency changed.

- `tests/behavior-preferences.test.mjs` records sparse preference normalization,
  habit saturation, three-day and fractional 1.5-day decay, and input non-mutation.
- `tests/behavior-chooser.test.mjs` records literal higher-score, exact-tie,
  ineligible-candidate and empty rankings, including no mutation of candidates.
- `tests/dna.test.mjs` records constant-RNG midpoint/count fixtures plus seeded
  same-species and mixed-species outputs with distinct draws, the exact 10-draw
  order (color 3, five genes 1 each, hopPace 2), the deferred `bear-msn` hybrid
  target and parent non-mutation.
- `tests/family.test.mjs` records asymmetric directional bonds averaging to a
  pair bond, symmetric updates, clamping and an untouched unrelated actor.
- `tests/fieldshape.test.mjs` is new and records the authored radius wobble,
  origin/asymmetric inside/outside points, padding and clamping with an explicit
  `1e-9` numeric tolerance.

Verification: the five affected files pass 52 tests (44 before P1); the complete
`node --test tests` run passes 338 tests. No browser or visual run was performed,
and no separate long parity suite was run; the complete Node suite includes the
existing parity tests.

### Current dependency map

```text
index.html
  app.js — browser composition, live actors, loop, capture/restore
    behaviors/index.js
      behavior.js — legacy oracle
      behaviors/engine.js
        behavior modules and layered configuration
        life/family/relationships/interactions
        injected actors, clock, RNG and representation adapters
        field homes/nav/food/emotes
    ai.js — Bear/Gummy behavior host
    glass.js — Glass behavior/physics/render/animation adapter
    box3d.js -> vendored WASM
    field.js
      mapcontent/floratypes
      navmesh/food/foodportions
      three.js scenery/water/vegetation/effects
    world.js — mutable per-map snapshots and localStorage
    save.js -> saveformat.js -> actorsave.js -> shared record/rule modules
    assetstore.js -> assets.js -> GLTFLoader
```

The repository already has meaningful separation. The opportunity is improving
specific boundary precision, not replacing its architecture wholesale.

## Findings

Priority means investigation/usefulness, not implementation authorization.
Effort is relative: S = localized; M = several callers/tests; L = cross-system.
Source locations are navigation aids and must be refreshed before edits.

### F1 — Preserve existing portable rules

- **Category/priority/effort:** A; high; S for documenting fixtures.
- **Evidence:** `src/behaviors/preferences.js` takes records and explicit elapsed
  days, returning new records without actors, clocks, RNG, storage or rendering.
  `tests/behavior-preferences.test.mjs` includes translation fixtures and
  enabled/disabled assertions. Life gates, relationship calculations, proposal
  ranking, field-boundary math and avoidance are other candidates, subject to
  their sampled coverage.
- **Boundary/benefit:** retain APIs; specify representative input/output fixtures
  as translation contracts without runtime churn.
- **Risk:** describing actor-mutating helpers as pure or assuming all sampled
  rules have been fully inspected. No extra services or cosmetic file splitting.

### F2 — Behavior adapters exist, but the host surface is oversized

- **Category/priority/effort:** B/C; high; M.
- **Evidence:** `app.js` constructs `createBehavior({ field, getActors, getHours,
  ... })`; `engine.js` `contextFor()` passes the field to modules. The engine
  accesses homes, navigation, food and `field.emote()` (initial audit around
  lines 653–779). Representation adapters already exist in `ai.js`/`glass.js`.
- **Boundary/benefit:** pilot explicit existing world-query/resource references
  or one presentation callback instead of passing the whole rendered field.
  This exposes real requirements and enables smaller headless fixtures.
- **Risk:** callback binding/timing and object identity changes. Preserve
  synchronous calls and backing objects; no command bus or general rewrite.

### F3 — Object identity is part of gameplay correctness

- **Category/priority/effort:** A implementation with translation hazard; high;
  S to specify, L to replace.
- **Evidence:** `interactions.js` `beginPair()` stores reciprocal actors;
  `endPair()` checks reciprocal reference identity. `food.js` `claim()` and
  `consume()` authorize by identity. `npc.js` `all()` returns original actors
  in a fresh array. `family.js` `setBond()` mutates both actors while persistent
  bonds use UID keys.
- **Boundary/benefit:** distinguish stable live identity from saved UID identity
  and detached snapshots. Prevent broken reservations, pairing and completion.
- **Risk:** copied records or UID replacement change cleanup semantics. Document
  and test first; reference replacement is not authorized or presumed useful.

### F4 — Save portability includes ordered orchestration

- **Category/priority/effort:** A/B/C; high; M.
- **Evidence:** `app.js` `buildSavePayload()` calls `saveCurrentWorld()` before
  `worldSaveState()` and `normalizeSave()`. `applySavePayload()` validates,
  reserves identities, populates worlds, prunes references, restores portions,
  activates the map and restores carried portions in an explicit sequence.
  See `actorrecord.js` `snapshotActor()`/`applyCommonActorState()` and
  `saveformat.js` `normalizeSave()`/`cloneWorld()`.
- **Contracts:** active live actors differ from inactive snapshots; carried food
  becomes dropped food on restore; actor versions are sparse. `snapshotActor()`
  includes the genome reference, while full normalization later JSON-clones the
  world. This is an aliasing observation, not a demonstrated defect.
- **Boundary/benefit:** consider separating envelope normalization/validation from
  IndexedDB operations while leaving capture/application sequencing unchanged.
- **Risk:** changed clone depth, optional fields, reservation or restoration
  order. A complete save coordinator extraction is not yet justified.

### F5 — Scheduling and RNG are coupled to the host

- **Category/priority/effort:** B/C; high; S to characterize, L to redesign.
- **Evidence:** `app.js` `animate()` clamps frame delta, runs frame simulation
  before fixed physics steps; `stepMeadowAI()` orders food, Bear AI, life,
  Glass and locomotion. `sky.js` advances time alongside visual updates.
  Behavior RNG dynamically resolves global `Math.random`; visual systems also
  consume that global stream. `behavior-browser-parity.mjs` replaces global RNG
  and suppresses background animation frames.
- **Boundary/benefit:** characterize current time/order/draw ownership before
  moving it. Fixed physics does not establish whole-game fixed-step determinism.
- **Risk:** Godot physics callbacks, stream splitting and reordered actor ticks
  can change outcomes. None is a mechanical portability extraction. Existing
  parity does not prove cross-engine or frame-rate-independent determinism.

### F6 — Navigation is mostly reusable; debug rendering is not

- **Category/priority/effort:** A/B; medium; S–M.
- **Evidence:** `navmesh.js` contains numeric grid, obstacle and heap logic plus
  `buildDebugObject(THREE)`; `field.js` composes navigation with rendered content.
- **Boundary/benefit:** optionally isolate debug construction after path/tie
  fixtures exist, retaining the current algorithm.
- **Risk:** obstacle order, heap ties, clearance and aliasing affect paths.
  Godot navigation is not assumed to be an equivalent replacement.

### F7 — Asset ownership already provides a useful boundary

- **Category/priority/effort:** A/C/D; medium; S for contract work.
- **Evidence:** `assetstore.js` `acquire()` reserves before awaiting loading,
  release is idempotent and eviction excludes pending/referenced sources.
  `assets.js` `loadManifestedGltf()` accepts an injected loader. `glass.js`
  `disposeActor()` stops animation, disposes instance resources and releases
  the lease. See `assets/README.md` for source/clone ownership.
- **Boundary/benefit:** retain stable catalog IDs, manifest checks and lifetime
  contracts; translate loaders/GPU objects separately.
- **Risk:** Godot resource caching need not match existing leases/clones. Do not
  add a generic asset framework or duplicate cache.

### F8 — Species definitions are not simply neutral JSON

- **Category/priority/effort:** A/B; medium; M if extraction proves useful.
- **Evidence:** `dna.js` imports species, which imports rig configuration.
  `combineGenomes()` invokes executable inheritance rules; `expressGenome()`
  returns capabilities and representation metadata.
- **Boundary/benefit:** distinguish biological rules, capabilities, representation
  descriptors and asset IDs as contracts before proposing a split.
- **Risk:** JSON flattening loses callbacks, registration order and derived
  typed-array data. Retain the registry without a concrete extraction consumer.

### F9 — Keep rendering and physics engine-specific

- **Category/priority/effort:** C/D; low for abstraction; L.
- **Evidence:** `box3d.js` batches handles/float buffers; Bear construction in
  `app.js` combines solver state, three.js objects and surface buffers. Glass
  combines rigid bodies, skinned models, animation and picking.
- **Boundary/benefit:** preserve representation hosts; expose only proven behavior
  needs, protecting hot paths and appearance.
- **Risk:** generic wrappers add allocations, lose batching and obscure disposal.
  No renderer-neutral scene graph, physics facade or deformation rewrite now.

## Translation hazards

| Hazard | Contract to preserve or establish |
| --- | --- |
| Identity/aliasing | Live references versus UIDs; shallow copies versus detached snapshots; reciprocal pair mutation |
| Map/Set serialization | Explicit wire forms and reconstruction; ordinary JSON does not preserve container semantics |
| Ordering/ties | Actor/registry iteration, opportunities, equal-distance selection and heap ties; proposal ranking uses `localeCompare`, not an automatically equivalent cross-language comparator |
| Numbers | JS double calculations, Float32 boundaries, rounding, finite checks and observable null/missing distinctions |
| RNG/hashes | `Math.imul`, unsigned 32-bit wrapping, seed normalization, scaling and draw order |
| Async loading | Completion after actor removal, failed-load retry, lease release and map-switch behavior |
| Coordinates/units | X/Z ground plane, Y-up, yaw/forward conventions, authored scale, collider dimensions and texture axes |
| Time | Wall-clock metadata, pointer timing, frame delta, fixed physics and simulated days are different clocks |
| Saves | Version validation, sparse fields, game-wide identities and restoration order |
| Cleanup | Reciprocal pair clearing, resource reservations, actor removal and source/instance ownership |

Reusable algorithms still need language translation. Data/fixtures can specify
equivalence; three.js materials/animation, DOM, shaders and WASM handles require
engine-specific work. Do not assume the future physics implementation.

## Systems best left unchanged

Retain current plain-data rule modules, shared behavior engine and legacy oracle,
authored priorities, live-reference pair/claim protocols, Box3D bridge, both
actor representations, navigation, authored layout, asset leases and rendering.
Preserve vegetation batching/instancing/occupancy structures. No identified
portability benefit currently justifies rewriting these systems wholesale.
“Retain” is not certification of every uninspected branch.

## Chunk execution contract

The backlog below is proposed, not approved implementation. Each chunk needs
its own explicit approval after current targets/callers/tests are inspected.
Approval of one chunk does not authorize the next or all recommendations in a
finding. Optional chunks may be declined if their benefit does not justify churn.

- Keep the game loadable at every completed step; do not merge a known regression.
- Before editing, map requirements to checks and identify baseline behavior,
  exclusions and open decisions. Do not claim an unexecuted baseline passed.
- Verify at the affected layer during work and at the agreed chunk boundary.
- A changed behavior, save contract, RNG policy or performance target needs a
  decision, not a silent adjustment to make tests pass.
- Follow the repository's failure limits and regression stop rules. If checks
  fail, diagnose within scope or stop; do not expand the chunk automatically.
- Rollback only scoped changes without discarding unrelated work. If that cannot
  be done safely, stop for a decision. A rollback plan is not deletion approval.
- Report implemented, verified, blocked and deferred items separately. No promise
  of zero regressions replaces actual evidence.

### Backlog overview

| Chunk | Status | Dependencies | Outcome |
| --- | --- | --- | --- |
| P0 | Complete—source audit, docs only | None | Evidence gaps and boundary contracts recorded above |
| P1 | Complete—tests only | Relevant P0 contracts | Translation fixtures, no runtime changes |
| P2 | Complete—narrow extraction | P0 save/aliasing contracts | Separate save normalization from browser storage |
| P3 | Complete—emote host boundary | Relevant P0/P1 contracts | One explicit behavior-host boundary pilot |
| P4 | Complete—nav debug isolated | Path/tie fixtures | Isolate navigation debug rendering |
| P5 | Complete—characterization/docs only | P0 | Scheduler/RNG contract recorded through P5a–P5d; no runtime redesign |

This numbering is not a requirement to perform every extraction. P5 may precede
an optional extraction if it is needed to establish its ordering baseline.

### P0 — Close evidence gaps and publish contracts ✅

- **Affected:** remaining lifecycle/map paths, representative activities and
  this audit's evidence/contract documentation.
- **Preserved behavior:** all runtime behavior; source remains unchanged.
- **Result:** lifecycle, map, save and representative interaction cleanup paths
  inspected and recorded under “P0 evidence update”. Open gaps remain explicit.
- **Approval decisions:** bounded inspection scope and documentation updates;
  no exhaustive-coverage claim from samples.
- **Dependencies:** none.
- **Acceptance:** trace current callers and cleanup for proposed targets; record
  identity, ownership and ordering contracts; label inspected/sampled/uninspected
  areas and separate source conclusions from executed evidence.
- **Rollback:** reverse only approved new documentation changes.

### P1 — Add translation fixtures without changing runtime ✅

- **Affected:** existing preference/proposal/genetics/relationship tests plus a
  separate field-geometry test; the fixture set is recorded under “P1 fixture
  evidence”.
- **Preserved behavior:** rule outputs, ties, rounding, RNG draws and save output;
  runtime was not changed to simplify fixtures.
- **Approval decisions:** five inline fixture areas; one new geometry test file;
  no browser or separate long parity suite.
- **Dependencies:** relevant P0 contracts.
- **Result:** 44 baseline affected tests became 52; all 338 Node tests pass.
- **Acceptance:** affected Node tests exercise real functions and representative
  ties, sparse state, fixed inheritance outputs/draw counts, asymmetric bonds and
  toleranced geometry. Expected outputs are literal for later translation.
- **Rollback:** reverse scoped test/fixture additions; runtime stays unchanged.

### P2 — Separate save normalization from IndexedDB implementation ✅

- **Affected:** new `src/saveformat.js`, `src/save.js`, direct callers, existing
  save tests, and save-ownership comments/documentation.
- **Preserved behavior:** API, errors, cloning, versions, slots, JSON format,
  UID reservation and capture/application order. No persisted migration.
- **Approval decisions:** move envelope validation/normalization only; keep slot
  constants, IndexedDB operations and storage in `src/save.js`; retain compatible
  imports through re-exports; preserve the existing input-world migration side
  effect.
- **Dependencies:** P0 save/aliasing contracts and current caller inventory.
- **Result:** `src/saveformat.js` owns `SAVE_FORMAT`, `SAVE_VERSION`,
  `validateSave()` and `normalizeSave()`; `src/save.js` owns slots/IndexedDB and
  re-exports the format API. The save format, schema, restoration order and
  dependencies are unchanged.
- **Acceptance:** affected Node save/actor tests; HTTP smoke; targeted browser
  save/load, invalid-save rejection without live mutation, both-map round trip
  and New Game. Verify carried portions and inactive-map identities.
- **Evidence:** 11 save tests and all 340 Node tests pass. HTTP smoke passes all
  68 checks. A disposable-profile browser harness passes save/load, inactive
  field/Studio identities, carried-food restoration as dropped portions,
  future-version rejection with an unchanged live session, and New Game
  isolation. The committed browser regression passed `BROWSER OK` on rerun; its
  first run hit the documented Glass/bear collision fixture at 0.178 versus the
  0.25 threshold, with no save-related failure.
- **Rollback:** restore scoped implementation/import arrangement; existing saves
  must remain usable because their format is unchanged.

### P3 — Pilot one explicit behavior-host boundary ✅

- **Affected:** `src/behaviors/engine.js`, `src/app.js`, one focused emote test,
  and the portability docs/status.
- **Preserved behavior:** module-owned emission intent, synchronous ordering,
  actor coordinates and the existing nonfinite-height fallback. Omitting the new
  callback retains the old `field.emote()` route. The legacy engine and all
  behavior modules are unchanged.
- **Approval decisions:** pilot only the emote output boundary; do not extract
  field queries, add a general host/service interface, defer delivery or change
  rendering.
- **Dependencies:** relevant P0 contracts and P1 fixtures where applicable.
- **Result:** `createBehaviorModules({ emitEmote })` forwards emissions to an
  injected host callback. `src/app.js` wires it to `field.emote()`; the engine's
  fallback keeps existing callers and tests compatible.
- **Evidence:** 5 focused emote tests verify ordered emissions, fallback
  compatibility, default/no-actor contracts and equal enabled social traces/RNG
  draws; all 345 Node tests pass. HTTP smoke passes 68/68; browser regression
  passes `BROWSER OK`; legacy/modules browser parity passes 180 steps with 202
  transitions each; a disposable-profile check passes two-emote declines, map
  return, save/load, hunger interruption and New Game with no leaked portions.
  The inspected close-up capture clearly showed the emitted heart and no visual
  regression.
- **Acceptance:** affected Node tests, actual host wiring in a targeted browser
  scenario, interruption/pair/claim cleanup, map isolation, disabled legacy parity
  and enabled seeded/RNG checks for affected features. Run boundary-level parity
  under the verification procedure if simulation code changes.
- **Rollback:** reconnect the original field call and remove only the injected
  option/test; no persistent-state changes.

### P4 — Optionally isolate navigation debug rendering ✅

- **Affected:** `src/navmesh.js`, new `src/navdebug.js`, the field caller and a
  focused nav-debug/path test.
- **Preserved behavior:** exact path outputs/ties, obstacle ownership, clearance,
  coordinate conventions and debug appearance; no navigation replacement.
- **Approval decisions:** separate only the debug builder, using the existing
  public grid fields and `isWalkable`; no new navmesh API.
- **Dependencies:** path/tie fixtures that exercise actual navigation code.
- **Result:** `buildNavDebugObject(THREE, nav)` now owns the Three.js mesh while
  `navmesh.js` owns only navigation. `field.js` keeps `navDebug`, scene
  attachment, toggles, reset behavior and the opacity pulse.
- **Evidence:** 2 focused tests and all 347 Node tests pass. An old/new baseline
  comparison produced identical debug positions, material/visibility properties,
  stats, validation and all 64 asymmetric path combinations. HTTP smoke passes
  68/68; browser regression passes `BROWSER OK`; legacy/modules parity passes 180
  steps with 202 transitions each. A targeted browser check passes repeated
  `navPath`, debug toggling, unchanged nav stats and map return. The inspected
  capture showed the cyan nav-grid lines.
- **Acceptance:** Node path fixtures, browser `navPath`/reachability checks and an
  inspected debug capture. Check asymmetric coordinates and unchanged obstacles.
- **Rollback:** restore the scoped builder/call arrangement and remove the new
  module/test; no unrelated nav work or persistent-state changes.

### P5 — Characterize scheduler and RNG ownership

- **Affected:** test fixtures and contract documentation around `app.js`, sky,
  behavior hosts and existing harnesses; no runtime scheduler/RNG redesign.
- **Preserved behavior:** existing frame/physics/clock ordering and global RNG.
- **Approval decisions:** bounded scenarios and evidence method; any later
  extraction requires a new proposal.
- **Dependencies:** P0 ownership inventory.
- **Acceptance:** ordered traces cover pause, inactive-map freeze/return, clock
  advancement, Bear/Glass update order and RNG consumption under explicit harness
  conditions. State frame-rate/global-RNG limitations rather than claiming
  cross-engine determinism.
- **Rollback:** reverse characterization additions; runtime remains untouched.

**Proposed decomposition (documentation only):** P5 is split into four bounded
subchunks. P5a and P5b are independent; P5c extends P5b; P5d publishes the
evidence. Each subchunk needs separate approval and changes only tests, tooling
or documentation. None authorizes scheduler, clock, RNG, debug-hook or gameplay
changes. If characterization exposes a defect, record it and stop rather than
repairing it inside P5.

| Subchunk | Status | Dependencies | Outcome |
| --- | --- | --- | --- |
| P5a | Complete—tests only | P0 | Source-order contract guard |
| P5b | Complete—tooling only | P0 | Controlled seeded trace and RNG ownership |
| P5c | Complete—tooling only | P5b | Live pause/freeze/inactive-map clock checks |
| P5d | Complete—docs only | P5a–P5c | Contract documentation and P5 closeout |

#### P5a — Add source-order contract guard ✅

- **Affected:** new `tests/scheduler-rng-contract.test.mjs`; no runtime source.
- **Work:** assert the current ordering contract from unique source markers:
  `animate()` hidden/paused guards before simulation; `frameTick()` before
  `field.update()`; `field.update()` before the fixed-physics accumulator;
  `stepMeadowAI()` before `stepGummyBehavior()`; food → Bear AI → life → Glass
  → locomotion inside `stepMeadowAI()`; `sky.update()` first in `field.update()`;
  `simulateSeconds()` bypasses field/surface/render work and calls `frameTick()`
  only on the fourth substep; the behavior engine still resolves `Math.random`
  dynamically.
- **Preserved behavior:** runtime is unchanged. The test records existing order
  and fails with a named contract when that order moves.
- **Approval decisions:** a narrow source-order guard, not a general architecture
  linter. This is drift detection, not runtime evidence or a determinism claim.
- **Result:** `tests/scheduler-rng-contract.test.mjs` records five contracts:
  animate gates/order, `frameTick`/`stepMeadowAI` order, field sky ordering,
  `simulateSeconds` bypass, and the dynamic host RNG callback.
- **Evidence:** the five focused tests pass; all 352 Node tests pass. No browser
  or smoke run was required for this subchunk alone.
- **Acceptance:** focused test passes; the full Node suite passes; no browser or
  smoke run is required for this subchunk alone.
- **Rollback:** delete only the new test; runtime and other evidence remain.

#### P5b — Add controlled seeded trace and RNG ownership probe ✅

- **Affected:** new `scripts/scheduler-rng-characterization.mjs` in controlled
  mode; no runtime source.
- **Work:** boot through the existing disposable-profile browser harness with
  `requestAnimationFrame` suppressed and a seeded `Math.random` wrapper. After
  boot, reset the wrapper stream and record draws by stack origin (`src/ai.js`
  for Bear-host work, `src/glass.js` for Glass-host work, `src/app.js` for
  app/Gummy work, other as diagnostic). Drive one `g.sim(1/15, 0)` call per
  frame so each call contains four fixed physics steps and one `frameTick()`.
  Record per-frame owner sequences and totals.
- **Checks:** with `sky.auto` enabled, `g.sim(1)` advances behavior ticks but
  leaves `map().sky.hours` unchanged because `simulateSeconds()` bypasses
  `field.update()`. In a bounded
  seeded window, find a frame containing both a Bear-host and a Glass-host draw
  and assert Bear precedes Glass. If the default roster does not overlap, use the
  existing `g.spawnGlass({ stage: 'adult' })` hook before the seeded reset and
  record that fixture setup; do not infer order from separate frames. Require
  Bear-before-Glass on every overlapping frame. Repeat the same seeded window on
  a fresh profile/page and require identical per-frame owner sequences and draw
  counts. Run a non-frozen positive control, then a controlled `g.freeze(true)`
  window that may retain app/Gummy draws but must remove Bear/Glass draws.
- **Preserved behavior:** no runtime scheduling, RNG ownership or visual behavior
  changes. The wrapper and stack labels are harness-only diagnostics.
- **Approval decisions:** a synthetic `g.sim` cadence is intentional; it is not a
  model of normal `animate()` scheduling. Freeze/RNG results describe the current
  host, not a new policy.
- **Result:** `scripts/scheduler-rng-characterization.mjs` suppresses rAF, seeds
  and wraps `Math.random`, records owner labels per frame, checks the `g.sim`
  clock bypass with auto-clock enabled, Bear-before-Glass order on every overlap,
  a non-frozen positive control, frozen Bear/Glass suppression and repeatability
  on separate fresh profiles. Live pause/freeze/map checks are covered by P5c.
- **Evidence:** `node scripts/scheduler-rng-characterization.mjs` passes with
  seed 1234, 120 frames, four spawned Glass actors and the modules engine:
  `g.sim` clock `auto=true 7 -> 7`, behavior ticks `0 -> 38`, all 43 overlap
  frames ordered `bear<glass` (first frame 1), totals
  `bear 144 / glass 146 / field 48`, identical repeat traces on fresh profiles,
  and a non-frozen control with 92 draws versus 0 frozen draws and no Bear/Glass
  labels while frozen. HTTP smoke passes 68/68. No normal-frame-rate or
  cross-engine determinism is claimed.
- **Acceptance:** controlled summary passes with the fixture conditions printed;
  no normal-frame-rate or cross-engine determinism is claimed.
- **Rollback:** remove the controlled mode and its output; runtime remains
  untouched.

#### P5c — Add live pause, freeze and inactive-map clock checks ✅

- **Affected:** the same tooling script, extended with a normal-rAF live mode;
  no runtime source.
- **Work:** use a disposable-profile page and existing `window.__gummy` hooks.
  Pause and wait: behavior ticks and sky hours must stay fixed, then advance after
  unpause. Freeze and wait: behavior ticks must stay fixed while sky hours advance,
  because `field.update()` still runs. Pause, switch to Studio, unpause and wait:
  sky hours and behavior ticks must stay fixed, with `sky.auto` and the behavior
  engine still enabled so the hold is attributable to the inactive map. Return
  to Meadow: the saved field clock must be restored while paused and then advance
  again after unpause; the P5a `lastNow` order guard owns the no-catch-up claim.
  Use generous waits and monotonic/equality assertions, not exact frame rates.
- **Preserved behavior:** runtime remains untouched; the probe observes pause,
  freeze, `field.update()`, map switching and clock restoration as implemented.
- **Approval decisions:** live checks assert direction/presence, not exact
  timing. A failure is reported as a characterization mismatch, not repaired by
  changing the scheduler.
- **Result:** the tooling script now runs a normal-rAF live mode on its own fresh
  profile after the controlled runs. It checks baseline advancement, pause
  hold/resume, freeze tick suppression with clock advancement, paused Studio
  switch, inactive-Studio hold with `sky.auto` and the behavior engine still
  enabled, returned field-clock restoration with `sky.auto`, and post-return
  resume. No runtime source changed.
- **Evidence:** `node scripts/scheduler-rng-characterization.mjs` passes with
  controlled output unchanged and live conditions `settle=250ms wait=900ms
  timeout=10000ms`. A representative live run recorded baseline behavior ticks
  `6 -> 10` and hours `7.0060 -> 7.0133`; pause held ticks at `11` and hours at
  `7.0140` before resuming to ticks `16`; freeze held ticks at `16` while hours
  advanced `7.0313 -> 7.0407`; paused Studio held ticks at `21` and hours at
  `7.0480`; returning to Meadow restored `7.0480 -> 7.0480` with `auto=true`
  and resumed ticks `21 -> 29`. Studio snapshots also asserted `sky.auto=true`
  and `behavior.enabled=true`, so the inactive-map hold is not explained by a
  disabled clock or engine. The script printed `SCHEDULER_RNG_CONTROLLED_OK`,
  `SCHEDULER_RNG_LIVE_OK` and `SCHEDULER_RNG_OK`. The full Node suite passes 352
  tests and HTTP smoke passes 68/68. Freeze advancing sky is observed behavior,
  not a defect claim: pause gates `animate()` before `field.update()`, while
  freeze only gates Meadow AI. No-catch-up is covered by the P5a source-order
  guard, not claimed as a live timing measurement.
- **Acceptance:** live summary passes and the script prints
  `SCHEDULER_RNG_OK`; no screenshot is required because there is no visual change.
  Harness conditions and the freeze/clock interpretation are recorded above.
- **Rollback:** remove the live mode; the P5b controlled harness remains usable.

#### P5d — Publish the scheduler/RNG contract and close P5 ✅

- **Affected:** new `docs/scheduler-rng-contract.md`, the P5/backlog status in
  this roadmap and the mirror status in `ROADMAP.md`.
- **Work:** document the frame path, clock domains, pause/hidden/freeze/inactive
  map gates, map-return clock restoration, `g.sim` bypass, global RNG ownership,
  `g.seed`/`g.unseed`, Glass defaults and the harness commands. State that
  seeded traces are conditional on harness cadence and other global-RNG
  consumers, and that fixed physics does not establish whole-game determinism.
  Record P5a–P5c evidence, commands and any unverified criteria; update status
  only after that evidence exists.
- **Preserved behavior:** documentation/status only; runtime, saves, APIs and
  dependencies remain unchanged.
- **Approval decisions:** document observed behavior; do not convert it into
  authorization for clock extraction or RNG-stream separation. A later extraction
  needs a new evidence-backed proposal.
- **Result:** `docs/scheduler-rng-contract.md` records the frame path, clock
  domains, pause/hidden/freeze behavior, inactive-map and map-return rules,
  `g.sim` bypass, global RNG ownership, `g.seed`/`g.unseed`, Glass defaults,
  harness commands and explicit determinism limits. P5 is marked complete as
  characterization and documentation only; no runtime work is authorized by the
  closeout.
- **Evidence:** the P5a source-order tests pass 5/5; the controlled and live
  scheduler/RNG probe passes and prints `SCHEDULER_RNG_OK`; the full Node suite
  passes 352 tests; HTTP smoke passes 68/68. The new document matches the
  inspected source and recorded evidence. No visual capture was required.
- **Acceptance:** docs match inspected source and executed P5a–P5c evidence; the
  full Node suite and HTTP smoke pass; the targeted browser probe passes; the diff
  contains no runtime source changes. No visual capture is required.
- **Rollback:** remove the new document and revert only the P5/status lines.

### Deferred decisions — not implied follow-on work

Clock extraction, RNG-stream separation, live-reference replacement, species
registry restructuring, full save-coordinator extraction and engine migration
each require a new evidence-backed proposal. Do not turn characterization into
permission to change the behavior it records.

## Verification plan

Load the `gummy-game-verification` skill and applicable procedure sections when
executing future game checks. No long browser/parity suites are needed merely
to complete the read-only audit.

Existing checks inspected or sampled for planning, not executed for this audit:

| Protection | Existing evidence source / future use |
| --- | --- |
| Preferences and habits | `tests/behavior-preferences.test.mjs`: fixtures, enabled reproducibility, disabled draw/order compatibility, learning and saves |
| Behavior order and RNG | `tests/behavior-parity.test.mjs`: race traces/draw counts and perturbation detection; `scripts/behavior-parity.mjs` for affected simulation boundaries |
| Browser host parity | `scripts/behavior-browser-parity.mjs`: seeded real-host traces; distinguish harness conditions from normal frame scheduling |
| Persistence/identities | `tests/save.test.mjs`, actor-record/save and relationship tests; browser save/map/New Game scenarios |
| Authored content | `tests/content.test.mjs`: stable IDs/order/layout records; browser reachability for affected composition |
| Asset lifetime | `tests/asset-store.test.mjs`: leases, retries, eviction and disposal; targeted real-asset load/removal checks when affected |
| Actual gameplay integration | `scripts/browser-regression.mjs` and affected feature harnesses through existing `window.__gummy` hooks |
| Serving/import contract | `scripts/smoke.mjs`; HTTP-only, not gameplay evidence |
| Representation/physics | Existing local physics harness when affected; headless behavior parity is not solver proof |
| Appearance/performance | Inspected captures for visual changes; measure affected hot paths using the current performance procedure, never infer gains from modularity |

Stage checks: affected Node tests first, targeted browser checks for host wiring,
cleanup/persistence/maps, then the applicable chunk-boundary acceptance suite.
Verify enabled features separately from disabled legacy parity. A feature-off
matrix does not verify feature-on behavior. Preserve natural opportunity checks
where selection is claimed; forced state proves only its downstream path.

Avoid unnecessary browser/parity runs for prose-only changes. Any later source
change invalidates affected evidence according to its dependencies. Record the
commands, conditions, failures, unverified criteria and owned-process cleanup
with the approved chunk's results, not as fabricated success in this plan.

## Approval checkpoint

P0's read-only audit, P1's test-only translation fixtures, P2's save-format
extraction, P3's emote host boundary and P4's navigation-debug isolation are
complete. P5's source-order guard, controlled trace, live clock checks and
contract documentation are complete. P5 closes as characterization and
documentation only; no runtime work follows automatically. Clock extraction,
RNG-stream separation or any other scheduler/runtime change requires a new
evidence-backed proposal.
