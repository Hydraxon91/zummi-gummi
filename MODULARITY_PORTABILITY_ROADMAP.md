# Modularity and portability roadmap

**Status: Planned—read-only audit; implementation requires separate approval.**

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
activity's cancellation path, complete map activation, async actor-loading
lifecycle and all UI listeners. Reinspect affected current source, callers and
tests before approving a corresponding implementation chunk.

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
    save.js -> actorsave.js -> shared record/rule modules
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
  See `actorrecord.js` `snapshotActor()`/`applyCommonActorState()` and `save.js`
  `normalizeSave()`/`cloneWorld()`.
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
| P0 | Planned; read-only | None | Close evidence gaps and specify boundary contracts |
| P1 | Proposed; approval required | Relevant P0 contracts | Translation fixtures, no runtime changes |
| P2 | Optional; approval required | P0 save/aliasing contracts | Separate save normalization from browser storage |
| P3 | Optional; approval required | Relevant P0/P1 contracts | One explicit behavior-host boundary pilot |
| P4 | Optional; approval required | Path/tie fixtures | Isolate navigation debug rendering |
| P5 | Proposed; approval required | P0 | Characterize scheduler/RNG; no runtime redesign |

This numbering is not a requirement to perform every extraction. P5 may precede
an optional extraction if it is needed to establish its ordering baseline.

### P0 — Close evidence gaps and publish contracts

- **Affected:** remaining lifecycle/map paths, representative activities and
  this audit's evidence/contract documentation.
- **Preserved behavior:** all runtime behavior; source remains unchanged.
- **Approval decisions:** bounded inspection scope and documentation updates;
  no exhaustive-coverage claim from samples.
- **Dependencies:** none.
- **Acceptance:** trace current callers and cleanup for proposed targets; record
  identity, ownership and ordering contracts; label inspected/sampled/uninspected
  areas and separate source conclusions from executed evidence.
- **Rollback:** reverse only approved new documentation changes.

### P1 — Add translation fixtures without changing runtime

- **Affected:** existing preference/proposal/genetics/relationship/geometry tests;
  agree a small representative fixture set before editing.
- **Preserved behavior:** rule outputs, ties, rounding, RNG draws and save output;
  do not change runtime merely to simplify fixtures.
- **Approval decisions:** exact fixture set and inline versus separate storage.
- **Dependencies:** relevant P0 contracts.
- **Acceptance:** affected Node tests exercise real functions and representative
  ties, sparse state and seeded inheritance; document expected outputs for later
  translation. No browser run is required for test-only pure fixtures unless
  assertions affect browser acceptance.
- **Rollback:** reverse scoped test/fixture additions; runtime stays unchanged.

### P2 — Separate save normalization from IndexedDB implementation

- **Affected:** `src/save.js`, one narrowly scoped module if approved, direct
  callers and existing save tests.
- **Preserved behavior:** API, errors, cloning, versions, slots, JSON format,
  UID reservation and capture/application order. No persisted migration.
- **Approval decisions:** whether separation offers sufficient maintenance value;
  exact module/API ownership and public import compatibility.
- **Dependencies:** P0 save/aliasing contracts and current caller inventory.
- **Acceptance:** affected Node save/actor tests; HTTP smoke; targeted browser
  save/load, invalid-save rejection without live mutation, both-map round trip
  and New Game. Verify carried portions and inactive-map identities.
- **Rollback:** restore scoped implementation/import arrangement; existing saves
  must remain usable because their format is unchanged.

### P3 — Pilot one explicit behavior-host boundary

- **Affected:** one agreed field-query or emote boundary in `app.js`/behavior
  construction/`behaviors/engine.js`, plus its direct tests/callers.
- **Preserved behavior:** synchronous timing, backing actor/resource identities,
  call order, priorities and RNG. Do not generalize all modules in this chunk.
- **Approval decisions:** exact pilot, useful API shape and excluded callers.
- **Dependencies:** relevant P0 contracts and P1 fixtures where applicable.
- **Acceptance:** affected Node tests, actual host wiring in a targeted browser
  scenario, interruption/pair/claim cleanup, map isolation, disabled legacy parity
  and enabled seeded/RNG checks for affected features. Run boundary-level parity
  under the verification procedure if simulation code changes.
- **Rollback:** reconnect original field access and reverse only the pilot;
  no persistent-state changes.

### P4 — Optionally isolate navigation debug rendering

- **Affected:** `src/navmesh.js`, debug builder and its existing caller.
- **Preserved behavior:** exact path outputs/ties, obstacle ownership, clearance,
  coordinate conventions and debug appearance; no navigation replacement.
- **Approval decisions:** whether this separation is worth maintaining and its
  precise builder/data API.
- **Dependencies:** path/tie fixtures that exercise actual navigation code.
- **Acceptance:** Node path fixtures, browser `navPath`/reachability checks and an
  inspected debug capture. Check asymmetric coordinates and unchanged obstacles.
- **Rollback:** restore the scoped builder/call arrangement, not unrelated nav work.

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

Only creation of this roadmap and its link from `ROADMAP.md` is approved.
P0–P5 remain pending separate approval. The next decision is which bounded audit
or fixture chunk, if any, to authorize; no runtime work follows automatically.
