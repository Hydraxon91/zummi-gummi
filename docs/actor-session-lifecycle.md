# Actor and session identity/lifecycle contract

Status: current-contract inventory for the M5 lifecycle, updated for the D1/M6a
soft-body growth-orchestration, D2/M6b birth-planning and D3/M6c removal-sequencing
slices. The M5 inventory described existing orchestration without changing
production runtime; D1 extracts stage growth, D2 extracts birth planning, D3
extracts removal ordering, and each slice adds focused tests/docs.

Baseline: historical M5 inventory at `HEAD 4856ce6` (`docs: inventory interaction
ownership for M2a`), clean working tree. D1 starts from `HEAD 10331f7`, clean
working tree. D2 starts from `HEAD 6c66613`, clean working tree. D3 starts from
`HEAD 820bafb`, clean working tree. M5 evidence was source inspection plus the
focused Node tests named in §8; its browser save/load, map-switch and New Game
flows were not executed. D1 adds focused Node coverage and a seeded Bear growth
host probe; Glass growth was rerun through the existing `glass-test` growth
scenario. D2 adds focused plan tests, a seeded Bear birth and save-restore host
probe, and a Glass lifecycle rerun. D3 adds focused sequencing tests plus the
existing `departure-test` and `stars-test` host checks.

Evidence labels used throughout:

- **Inspected** — the named source path and its callers were read directly.
- **Sampled** — representative call sites were read; every branch was not traced.
- **Unverified** — no executed check exists in this step, or the boundary is not
  importable in Node.

D3 introduces a real portable boundary for removal ordering only. The app still
owns the live roster, allocator, pool, concrete side effects and all spawn/map/save
callers.

## 1. Scope and owners

| Layer | Owner | Current shape |
| --- | --- | --- |
| Live soft-body actor | `src/app.js` | `class Bear` instance (`src/app.js:493`), stored in `bears` (`src/app.js:574`) and also in `pool` (`src/app.js:560`). Object identity is live identity. |
| Live Glass actor | `src/glass.js` | actor object created by `makeActor()` (`src/glass.js:692`), stored in the colony's `actors` array. Object identity is live identity. |
| Read-only actor view | `src/npc.js` | `createActorView()` (`src/npc.js:38`) returns original live objects in fresh arrays; `active()` and `byUid()` filter on `active` only. |
| Game-wide UID | `src/app.js` | `nextBearUid` allocator (`src/app.js:575`) plus `reserveUid`, `reserveWorldUids`, `reserveGameUids` (`src/app.js:147-162`). |
| Persistent actor record | `src/actorrecord.js` | `snapshotActor()` (`src/actorrecord.js:27`) and `applyCommonActorState()` (`src/actorrecord.js:98`). |
| Record validation/migration | `src/actorsave.js` | `registerActorCollection`, `maxActorUid`, `validateActorWorld`, `validateGameRelationships` (`src/actorsave.js:297-394`). |
| Save envelope | `src/saveformat.js` | `validateSave` rejects duplicate actor UIDs game-wide (`src/saveformat.js:63-78`), then `normalizeSave` migrates/clones. |
| Pooled soft-body slot | `src/app.js` | `getFreeBear()` (`src/app.js:561`), `pool`, `BEAR_HARD_MAX = 256` (`src/app.js:201`), shared scratch field/cell buffers (`src/app.js:214-215`) and instanced eye rows (`src/app.js:484`). |
| Behavior runtime | `src/behavior.js`, `src/behaviors/engine.js` | `attach()` / `detach()` own `actor.ai`; `src/app.js:752` detaches on soft-body removal. |
| Soft-body stage growth | `src/actorlife.js` + `src/app.js` | `applyStageGrowth()` owns eligibility, deferred stage, COM scaling and leaving-baby cleanup. The app `applyBearStage()` wrapper supplies life-species admission, physics/surface rebuild, stage sparks, stats and history. |
| Birth planning | `src/actorbirth.js` + `src/app.js` | `planBirth()` owns eligibility, safe-food/father/species/cap gates, flavor/pace, home/door/nearest-walkable placement, genome, sex and parent UIDs. The host supplies read-only callbacks; the app `birthChild()` keeps spawn/finalization, traits, bonds, history, mother-state changes, stats and emotes. |
| Removal sequencing | `src/actorremove.js` + `src/app.js` | `removeSoftActor()` and `removeGlassActor()` own only the portable callback order. The app wrappers supply departures, food/portion claims, behavior detach, bodies, grabs, reference clearing, presentation and the Glass colony call. |
| Session/world snapshots | `src/world.js` + `src/app.js` | `worlds.field` / `worlds.studio` hold saved arrays for the inactive map; the active map is captured by `saveCurrentWorld()` (`src/app.js:6194`). |

`actorView` is a query surface, not an owner. `all()` returns `[...soft(), ...glass()]`
(`src/npc.js:47`); it returns the original actor objects, so mutating the returned
actor mutates the live actor. `active()` and `byUid()` require `actor.active`
(`src/npc.js:49-57`).

## 2. Identity layers

These are distinct and must not be conflated:

1. **Live object identity** — a JavaScript object reference (`Bear` or Glass actor).
   Valid only while that object is the active actor in the roster. Object identity
   is not persisted and is not a stable handle across removal/reuse.
2. **Game-wide UID** — the numeric `actor.uid` on a live actor or saved record. It is
   unique within one loaded game, including both maps and both actor
   representations. It is not an object reference.
3. **Persistent actor record** — plain saved data produced by `snapshotActor()`.
   It carries the UID plus life fields; it deliberately has no `ai`, mesh, physics
   handle, group or other live pointer.
4. **Actor view** — a read-only query over the live soft-body and Glass lists. It
   resolves UIDs to live objects only while `active` is true.
5. **Pooled bear slot/buffers** — a `Bear` instance and its preallocated arrays,
   geometry, mesh and eye-instance rows. A slot outlives the actor life that
   currently occupies it. `bearCeiling` limits live soft bodies; `BEAR_HARD_MAX`
   limits pooled construction.
6. **Representation** — soft-body Bear/Gummy uses the metaball/surface-nets path
   and `kind` is not `glass`; Glass uses its authored skinned GLB adapter and is
   identified by `kind === 'glass'` (`src/npc.js:7-19`). Both use the same saved
   record shape and UID space.
7. **Saved UID references** — `bonds` keys, `playdates` keys, history event `uid`,
   `guardianUid`, `partnerUid`, `rivals` keys, `parentUids` and `fatherUid`. They
   point to UIDs, never to live objects. `pruneActorRefs()` (`src/family.js:399`)
   prunes bond/playdate/history/guardian/partner/rival references but deliberately
   keeps ancestry (`parentUids`/`fatherUid`).

Live references are never saved. Persistent references are UIDs and are resolved
through a fresh `actorView.byUid()` or saved-record lookup.

## 3. UID allocation and reservation

**Allocator state.** `let nextBearUid = 1` (`src/app.js:575`) is app-local and is
not part of a save payload.

**`reserveUid(value)`** (`src/app.js:147-153`): if `value` is finite, returns it
unchanged and raises `nextBearUid` to at least `value + 1`; otherwise returns the
current `nextBearUid` and increments it. This is injected into the Glass colony as
`nextUid` (`src/app.js:7074`), so Glass-generated actors share the same game-wide
space. Glass has a local `nextLocalUid = 100000` fallback only when no allocator is
injected (`src/glass.js:126-128`).

**`spawn()`** (`src/app.js:579`) assigns an explicit finite `opts.uid`, otherwise
`nextBearUid++` (`src/app.js:651-652`), and raises the allocator past any explicit
UID. `spawnFromState()` passes the saved `st.uid` back in (`src/app.js:6154`), so
restore preserves identity rather than reallocating it.

**`reserveWorldUids(world)`** (`src/app.js:155-158`) raises `nextBearUid` above the
highest UID in the world being activated. It is called by `activateMap()` before
that map's actors spawn (`src/app.js:6383`).

**`reserveGameUids(worlds)`** (`src/app.js:160-162`) assigns
`nextBearUid = Math.max(1, maxActorUid(worlds) + 1)`. It is called by
`applySavePayload()` before any snapshot is installed or spawned
(`src/app.js:6518-6520`). This is a recalibration to the loaded save, not a
monotonic bump: a save with a lower maximum can lower the allocator relative to
the previous session. It is safe in the current order because `applySavePayload`
then activates the map, which despawns the old live roster before spawning the
new one; no generated UID is issued between reservation and despawn.

**`maxActorUid(worlds)`** (`src/actorsave.js:317-330`) scans exactly `field` and
`studio`, over every registered actor collection, and returns the highest finite
`actor.uid` (0 when none). It therefore includes the inactive map, Glass actors
and any additional registered collection. It ignores missing/non-array
collections, `null` actors and non-numeric/zero UIDs.

**New Game reset.** `resetNewGame()` (`src/app.js:6600-6635`) despawns live actors,
clears Glass, resets food/portions, sets both world snapshots to `null` and sets
`nextBearUid = 1` (`src/app.js:6616`) before activating and reseeding the field.
New Game starts a fresh identity space; it does not delete save slots on disk.

**Another game / save UID reuse.** `applySavePayload()` replaces both world
snapshots and recalibrates the allocator to that payload. UIDs are scoped to the
loaded game, so UID 7 in one save need not be the same actor as UID 7 in another
save. Within one payload, `validateSave()` rejects duplicate UIDs across both maps
and every registered collection (`src/saveformat.js:63-78`). The live allocator
does not independently re-check duplicate explicit UIDs passed to `spawn()` /
`makeActor()`; explicit restore UIDs are trusted after save validation.

**High-UID restore.** Because reservation runs before spawning and `spawn()` raises
the allocator past explicit UIDs, a restored actor with a high UID (including one
on the inactive map or a Glass actor) forces later generated UIDs above it. This
is covered by `tests/save.test.mjs` with a 500000 UID and by the new focused test
in §8 for an extra registered collection.

## 4. Pool and instance reuse

**Acquisition.** `getFreeBear(rigCfg)` (`src/app.js:561-567`) returns the first
pooled Bear with `!active` and the same species (`rigCfg.species || 'bear'`). If
none is free it constructs a new Bear until `pool.length === BEAR_HARD_MAX` (256),
then returns `null`. Species matching is intentional: each slot owns arrays sized
from its creation rig (`Bear` constructor, `src/app.js:494-557`) and `spawn()`
re-applies `rig`, `np` and `speciesDef`.

**Live limit vs pool limit.** `bearCeiling` is the user-adjustable live limit
(default 128; adjusted in `setCeiling()`, `src/app.js:3645-3649`). Before acquiring
a slot, `spawn()` removes `bears[0]` when `bears.length >= bearCeiling`
(`src/app.js:580`). `BEAR_HARD_MAX` is the construction/eye-instance ceiling, not
the live-population limit.

**Activation.** `spawn()` sets `active = true`, pushes into `bears`, resets the
mutable life/runtime fields, assigns the UID, creates Box3D bodies and builds the
surface (`src/app.js:579-680`). The Bear constructor starts with `active = false`
(`src/app.js:500`). Removal sets `active = false` (`src/app.js:763`).

**Behavior attach/detach.** Soft-body behavior is lazy: `ai.update()` attaches when
`b.ai` is missing (`src/ai.js:67-69`). Glass attaches in `makeActor()` through the
shared engine (`src/glass.js:812`). `detach()` releases food, cancels pair/task
state and sets `actor.ai = null` (`src/behavior.js:2258-2268`,
`src/behaviors/engine.js:1421-1430`). `removeBear()` calls `ai.detach(b)` before
nulling `b.ai` (`src/app.js:752-754`).

**Resources owned by a soft-body slot.** Preallocated point/velocity/force/target
arrays, snapshot arrays, mesh `BufferGeometry` with position/normal/index buffers,
mesh object and eye-instance rows (`slot * 3`). The slot also holds the current
material reference; some spawn paths clone a material (for MSN/Glass material genes
or DNA color), and `removeBear()` does not dispose that per-spawn clone. Shared
materials, sprites, toon cache, the scratch `FIELD`/`CELLVERT` arrays and the
instanced eye mesh are module-scope resources. Box3D body handles are per-live-life
and destroyed by `destroyBearBodies()` on removal and stage rebuild
(`src/app.js:1627-1632`, `src/app.js:987-988`).

**Resources owned by a Glass actor.** Root/holder groups, shadow, cloned materials,
model, mixer/actions, body handle and the asset lease. `disposeActor()`
(`src/glass.js:1174-1194`) sets `disposed` then `active = false`, destroys the body,
stops the mixer, disposes instance skeletons/materials/shadow, removes the root and
releases the lease. The async model load checks `!a.active || a.disposed` before
accepting a lease and releases it immediately if the actor is already gone
(`src/glass.js:609-612`). The colony caps live Glass actors at `MAX_ACTORS = 8`
(`src/glass.js:22`, `src/glass.js:694`).

**Stale live references are not handles.** After removal, a pooled Bear object
remains allocated and retains its last `uid`, but `active` is false and the actor
view excludes it. A later spawn may reuse the same object with a different UID and
life state. There is no generation counter or invalidation token on the object.
The current contract is therefore: **do not use a held actor reference after
removal/reuse; look the actor up again by UID.** The new actor-view test in §8
pins the observable part of this rule (`npc.js` returns live objects, drops the old
UID when inactive, and resolves the reused object only under its new UID).

## 5. Lifecycle

### Birth

`birthChild()` (`src/app.js`) still owns the live birth sequence. D2 moved only
the decision half to `planBirth(mother, father, host)` (`src/actorbirth.js`).
The plan checks the mother is active, pregnant and not grabbed/in water/airborne/
free-body, checks safe food, resolves the father, chooses the child species,
applies the non-Glass soft cap, inherits flavor/pace, chooses home and a walkable
position, then builds the genome, sex and parent UIDs. The host supplies
`speciesOf`, `fatherByUid`, `safeFood`, `softCount`, `softCapacity`,
`chooseHome`, `homeDoor`, `nearestWalkable`, `childGenome` and `random`
(defaulting to the current global `Math.random`); it performs no app/THREE/DOM
work itself. `birthSpecies()` moved unchanged in behavior to the same module,
including the cross-species draw and `speciesOf(mother)` fallback.

A failed plan returns `{ ok: false, reason }` without mutating the mother or
father and without drawing RNG for checks that had no draw before. On success the
app spawns the soft-body child or calls `glassColony.spawnChild()`, applies trait
inheritance after all existing birth/spawn draws, assigns genome/phenotype,
family/sibling bonds and history, clears pregnancy/gestation/retry, sets the
mother's cooldown, increments `lifeStats.births` and emits the heart/sparkle
emotes in the existing order. If child creation returns `null`, `birthChild()`
returns `false` before mutating the mother (Inspected; `tests/actor-birth.test.mjs`).

### Growth

D1 moved the portable half of soft-body growth to
`applyStageGrowth(actor, nextStage, { isLifeActor, represent, onStageUp })`
(`src/actorlife.js`). It owns the current eligibility checks (active, life
species, ordered stage, not already there), the deferred `pendingStage` path for
grabs/airborne/pond, COM-relative scaling of points and velocities, `snap`
refresh, stage/scale assignment, and the `guardianUid`/adoption/follow cleanup
when the next stage is not `baby`. Rejected requests clear `pendingStage` when an
actor exists; deferred requests set it without scaling.

`applyBearStage()` (`src/app.js`) is now the host wrapper. Its `represent()`
callback destroys and recreates Box3D bodies, clears the lattice, contacts and
airborne flag, requests a surface rebuild, resets AI timing, calls `buildBear()`
and emits the existing 12 `spawnSpark()` draws. Its `onStageUp()` callback
increments `lifeStats.stageUps` and appends the `stage` history event. The module
calls `represent` once after state changes and `onStageUp` after it. The UID is
unchanged. Glass keeps its own `applyStage()` (`src/glass.js:348`).

### Real removal (soft body and Glass)

D3 moved only the ordering to `src/actorremove.js`. The app wrappers keep the
concrete side effects; the module calls them in a fixed sequence.

`removeBear(b, opts)` (`src/app.js`, wrapper) calls
`removeSoftActor(b, { actors: bears, preserveRefs, departure, ...callbacks })`.
`removeSoftActor()` (`src/actorremove.js`) returns `false` without callbacks when
the actor is absent or not in `actors`; otherwise it runs:

1. `onDeparture(actor, departure)` when `opts.departure` is set
   (`departures.snapshot()`);
2. `onDropCarried` (drop carried food into the active map);
3. `onReleasePortions` (release the actor's food-portion claim);
4. `onDetach` (`ai.detach`, which releases food and cancels paired/task state);
5. `onReleaseFood` (release the field-food claim);
6. set `actor.ai = null`;
7. `onClearFarewell` (clear farewell runtime);
8. `onDestroyBodies` (destroy Box3D bodies);
9. splice the actor from `actors`;
10. unless `preserveRefs`, call `onClearReferences` once (guardian then
    relationship references);
11. `onEndGrabs` (end grabs whose `bear` is this actor);
12. set `active = false`, `grabs = 0`, then `onDeactivate` (hide mesh and eye
    rows);
13. return `true`.

The app wrapper deliberately keeps its previous no-return behavior; callers do
not receive the module's boolean. `clearGuardianReferences()` scans
`actorView.all()` (live actors only). `clearRelationshipReferences()` scans the
live view **and** both world snapshot arrays (`src/app.js`). Removal is real:
references are cleared unless the caller explicitly asks to preserve them.

`removeGlassActor()` (`src/app.js`, wrapper) keeps the `glassColony` guard and
calls `removeGlassActorCore(actor, { departure, ...callbacks })`. The module runs:

1. `onDeparture(actor, departure)` when a departure is requested;
2. `onClearFarewell`;
3. `onDropCarried`;
4. `onReleasePortions`;
5. `onReleaseFood`;
6. `removeFromColony(actor)`;
7. only when that returns truthy, `onClearReferences` once;
8. return the colony result coerced to a boolean.

The app passes `glassColony.removeActor()` (which disposes the actor) and clears
guardian then relationship references with the UID captured before removal. Glass
has no `preserveRefs` option, and D3 deliberately does **not** add behavior
detach/cancel, mesh work or pool changes to direct Glass removal (U-006 stays a
decision).

Removal is not transactional. If a host callback throws, the remaining steps do
not run and no rollback is attempted; a partial removal leaves the roster and
actor partly mutated. The focused test records this current non-atomic behavior
rather than inventing recovery.

### Stars departure

A fading actor reaches the end of `updateFarewells()` and is removed through
`removeGlassActor(actor, { departure: 'stars', reason })` or
`removeBear(actor, { departure: 'stars', reason })` (`src/app.js:898-926`). This is
a real removal, so persistent references are cleared. The departure hook records
survivors' bonds before detach; it is runtime-only and not written to actor saves
(`src/departures.js`).

### Map despawn

`despawnAll()` (`src/app.js:767-772`) removes every soft body with
`preserveRefs: true`. `activateMap()` on a non-initial switch also calls
`glassColony.clear()` (`src/app.js:6352-6361`), which disposes Glass actors without
rewriting their saved cross-map references. Map switching first captures the
current world (`requestMapSwitch` → `saveCurrentWorld({ dropCarried: true })`,
`src/app.js:6803-6820`), then activates the target map: release grabs/pointers/drop
queue, despawn with preserved refs, clear Glass, set map/visuals/bounds, reserve the
target world's UIDs, restore portions, spawn saved soft bodies or seed, then
restore or seed Glass (`src/app.js:6352-6418`).

### Save/load despawn and restore

`applySavePayload()` (`src/app.js:6515-6598`) order:

1. `normalizeSave(raw)` validates, migrates and clones before mutation;
2. `reserveGameUids(payload.worlds)`;
3. install both world snapshots, camera, gifts and map-specific state;
4. build the game-wide UID set and `pruneActorRefs()` every record against it;
5. replace food portions from both snapshots;
6. `activateMap(payload.mapId)`, which despawns the old live roster with
   `preserveRefs: true`, clears Glass, then spawns the restored actors;
7. restore saved carried food as dropped portions at saved positions;
8. restore field food, sky look/time and launcher;
9. persist the field world.

Saved records deliberately exclude `ai`, physics, renderer and live pointers
(`snapshotActor`), so restored actors receive new live handles through spawn and
`applyCommonActorState()` only re-applies the common life state.

### New Game reset

`resetNewGame()` (`src/app.js:6600-6635`) despawns soft bodies with preserved refs,
clears Glass, resets food and portions, clears both world snapshots, resets the UID
allocator to 1, resets field time/launcher, activates the field and persists. The
preserved references are moot because the old snapshots are discarded in the same
operation.

## 6. Partial creation and failure behavior

What is proven / Inspected:

- Save validation and normalization happen before mutation; an invalid payload
  throws from `normalizeSave()` before install/spawn (`src/app.js:6516-6520`).
- `birthChild()` returns `false` without changing the mother's pregnancy when the
  plan or child creation cannot complete. D2's plan path is covered by
  `tests/actor-birth.test.mjs`, including no-RNG early failures and no mutation on
  success; a seeded host probe proved a live soft-body birth and save export/
  import restore of the child's species, rig and stage.
- `spawnFromState()` returns `null` before spawning when the saved species is
  unknown/rigless or when MSN is disabled.
- `glassColony.restore()` skips entries that are not Glass-shaped and caps the
  number created; it does not throw for a skipped entry.
- A Glass async model failure cleans the temporary model/materials/lease, records
  `actor.error`, and leaves the actor active with no model
  (`src/glass.js:650-666`).

Not supported / Unverified:

- `spawn()` now unwinds an exception thrown after `active = true` and
  `bears.push()` using `abortPartialSpawn()` before rethrowing the original error:
  the roster entry and live flags are reset, acquired handles are destroyed, the
  mesh/eyes are hidden, and any material clones created by that spawn are
  disposed.
  This is bounded synchronous failure cleanup, not a transaction or rollback; see
  §11. If cleanup itself throws, the original error is still rethrown with
  `cleanupError` attached.
- Removal sequencing is likewise non-atomic: a throwing host callback stops the
  remaining steps and leaves the roster/actor partly mutated
  (`tests/actor-remove.test.mjs`). A retry repeats the sequence from the start;
  see the retry contract in §11.
- `spawn()` evicts the oldest live bear when at `bearCeiling` **before** validating
  the requested species/rig and before acquiring a slot; a rejected spawn can
  therefore still have evicted an actor.
- `applySavePayload()` is not atomic. Validation protects against malformed
  payloads, but a failure during install, pruning, activation, food/sky/launcher
  restore has no rollback guarantee.
- Glass load failure has no retry or automatic removal path, and the actor remains
  active with `error` set until removed by another path.
- Pool reuse completeness is not exhaustively verified. In particular,
  `physicsSuspended` is written only by `syncStudioCastPhysics()`
  (`src/app.js:6271-6286`) and is not explicitly reset by `spawn()`; per-spawn
  cloned materials are not disposed by `removeBear()`. Whether every removal/reuse
  sequence leaves those states consistent is Unverified.
- `maxActorUid()` hardcodes the two current map ids (`field`, `studio`); a future
  map would need this inventory updated.
- The live allocator trusts explicit `opts.uid`; duplicate prevention depends on
  save validation and correct callers, not on a runtime uniqueness check.

## 7. Current contract rules

- **C1. UID uniqueness is game-wide.** Within one loaded game, a UID identifies at
  most one actor across both maps and both representations.
- **C2. Persistent references are UIDs.** Bonds, playdates, history, guardian,
  partner, rivals, ancestry are stored as numbers/string keys, never live objects.
- **C3. Live references are not saved.** `snapshotActor()` records only data; `ai`,
  meshes, physics handles and groups stay with the live session.
- **C4. Saved UIDs survive restore.** `spawnFromState()` and Glass restore pass the
  saved UID back to the live actor; `applyCommonActorState()` restores UID-based
  relationship fields without adopting saved live pointers.
- **C5. Reservation precedes restore.** Both map activation and save application
  reserve the highest loaded UID before spawning, including the inactive map and
  Glass actors.
- **C6. Pooled slots are reusable, and stale live references are invalid after
  removal/reuse.** Use `actorView.byUid()`/a fresh lookup, not a held object.
- **C7. `active` is the liveness flag.** The actor view and `byUid()` ignore
  inactive actors even though the pooled object and its last UID still exist.
- **C8. Real removal clears persistent references.** `removeBear()` without
  `preserveRefs` and `removeGlassActor()` clear guardian/relationship references
  (subject to the exact scan scopes noted in §5).
- **C9. Map/save despawn may preserve persistent references.**
  `despawnAll()` uses `preserveRefs: true`; Glass `clear()` disposes without
  rewriting relationships. Save application additionally prunes references against
  the loaded game's UID set before respawning.
- **C10. New Game resets the allocator and snapshots.** UID 1 is the next generated
  identity after the live roster and both world snapshots are cleared.
- **C11. UIDs are scoped to the loaded game.** Loading another save may reuse a UID
  for a different actor; cross-save comparison is not actor identity.
- **C12. Failure cleanup is bounded, not transactional.** `spawn()` unwinds its
  own post-push partial actor and rethrows the original error (§11);
  `applySavePayload()` and removal still have no rollback or transaction
  guarantee.
- **C13. Growth rules are host-independent; representation stays host-owned.**
  `applyStageGrowth()` performs only portable actor-state mutations and calls
  `represent`/`onStageUp` in that order. It has no app, THREE, DOM or physics
  import; the app wrapper remains authoritative for bodies, surfaces, sparks,
  stats and history.
- **C14. Birth decisions are host-independent; spawn/finalization stays
  app-owned.** `planBirth()` performs no mutation or RNG for rejected checks that
  had none, resolves the current RNG at call time, and returns the decision record
  only. `birthChild()` remains authoritative for spawning, representation, traits,
  bonds, history, mother state, stats and emotes.
- **C15. Removal ordering is host-independent; side effects stay app-owned.**
  `removeSoftActor()`/`removeGlassActor()` own only the callback sequence, the
  roster splice/index guard, `ai = null`, `active`/`grabs` reset and the
  `preserveRefs`/colony-result gates. The app supplies arrival/departure snapshots,
  claims, detach, bodies, grabs, reference clearing, mesh/eye work and Glass
  disposal, and keeps its existing wrapper return behavior. A failed soft removal
  is retryable only by running the sequence again after the throwing callback
  recovers; earlier callbacks repeat and no rollback occurs.

## 8. Test coverage map

Focused new test: `tests/actor-lifecycle-contract.test.mjs` (6 cases, all pass).

| New case | Covers |
| --- | --- |
| repeated attach/detach cycles keep one owned `ai` value (legacy) | attach idempotence, repeated detach, fresh reattach, stable live actor identity |
| repeated attach/detach cycles keep one owned `ai` value (modules) | same contract on the default modular engine |
| actor view exposes live objects and drops removed slot identities | live object references (not copies), inactive exclusion, removed UID no longer resolvable, same slot reused under a new UID |
| reservation scans every registered collection across both maps | `maxActorUid` ignores malformed entries, includes an extra registered collection and both maps |
| saved records keep persistent UID references and omit live handles | `partnerUid`/`rivals`/`bonds`/`carriedFood` persist; `ai`/mesh/handles/body/groups/active are absent |
| common restore applies UID references without adopting saved live pointers | `validateActorWorld` + `validateGameRelationships` accept reciprocal partner UIDs; `applyCommonActorState` restores the UID, preserves live `ai`/mesh/body, and does not adopt saved pointer fields |

D1 focused growth test: `tests/actor-growth.test.mjs` (4 cases, all pass). It
imports the real `src/actorlife.js` with a fake actor/host and does not duplicate
the broader actor/life/family suites.

| D1 case | Covers |
| --- | --- |
| invalid, inactive, non-life and same-stage requests clear pending without growth or callbacks | rejection ordering, pending cleanup, no point/scale mutation, no represent/stage-up |
| grab, airborne and pond growth defers without representation or stage-up callbacks | all three deferred flags, pending assignment, no scaling or callbacks |
| valid growth scales around COM, updates snap, clears leaving-baby state and orders callbacks | genome-scaled points/velocities/snap, stage/scale, guardian/adoption/follow cleanup, represent before stage-up, repeated same-stage inert |
| a transition back to baby preserves guardian, adoption retry and follow state | the `nextStage === 'baby'` cleanup boundary |

D1-hosted evidence: `node scripts/glass-test.mjs SCENARIO=growth` passed. A
scratch seeded browser probe (`.dev-shots/d1/bear-growth-probe.mjs`) grew a real
Bear from baby to teen, verified points/velocities/snap and rebuilt handles, then
dropped a new Bear, confirmed natural airborne deferral, and let it land and apply
the pending stage. Source inspection still covers the exact 12-spark draw order;
the probe did not count individual spark RNG draws.

D2 focused birth test: `tests/actor-birth.test.mjs` (11 cases, all pass). It
imports the real `src/actorbirth.js` with fake actors/hosts and does not boot the
app.

| D2 case | Covers |
| --- | --- |
| birthSpecies keeps the existing cross-species draw and fallback order | same-species no draw, one cross draw, first/second selection, mother fallback, non-breeding fallback |
| inactive or non-pregnant mothers reject before later hosts and without mutation | eligibility ordering, no host/RNG calls, input preservation |
| grabbed, pond, airborne and free-body mothers reject before safe food and RNG | busy-state ordering and no mutation |
| safe-food threshold gates father resolution and emits no RNG below it | `MATE_FOOD_MIN`, father lookup after food |
| missing child species rejects after father resolution and before placement/genome/RNG | missing-species ordering |
| non-Glass soft cap blocks while Glass bypasses it | soft cap, Glass bypass, MSN cap |
| father resolution prefers the explicit father and falls back to mother.fatherUid | explicit/fallback/missing father, parent UID order |
| cross-species plan draws once, then flavor, pace, genome and sex in that order | draw count/order, flavor/pace, placement before genome, sex last |
| sleeping or inside mothers use the home door; otherwise the mother position is kept | door only for sleeping/inside with a home, no-home fallback |
| nearestWalkable overrides placement and its null fallback keeps the original point | placement override and absent-nav fallback |
| successful planning does not mutate the mother, father or host inputs | plan immutability on success |

D2-hosted evidence: a seeded scratch browser probe
(`.dev-shots/d2/bear-birth-probe.mjs`, report/log in the same directory) drove a
real Bear mother through `setPregnant` + `sim`, verified a new baby Bear with a
24-body rig and Float32 arrays, then exported/imported the save and verified the
same UID kept species `bear`, stage `baby`, rig NP 24, parent UIDs and genome
material. `node scripts/glass-test.mjs SCENARIO=lifecycle` (unchanged, `SHOTS=0`)
also passed Glass birth, cross-species birth, family state and Glass save/load
restore with no page errors. The probe uses existing `__gummy` hooks; no
production hook was added.

D3 focused removal test: `tests/actor-remove.test.mjs` (13 cases, all pass). It
imports the real `src/actorremove.js` with fake actors/rosters/callbacks and does
not boot the app.

| D3 case | Covers |
| --- | --- |
| soft removal is inert for an absent actor or one outside the roster | missing/null actor and roster guards, no callbacks, no mutation, no throw on a missing roster |
| soft removal runs callbacks in the recorded order and mutates roster state once | exact callback order, departure payload, `ai = null` before farewell, splice before refs, `active`/`grabs` reset, unchanged other actors |
| departure snapshot is skipped when no departure is requested | optional departure gate |
| `preserveRefs` skips only guardian/relationship clearing | refs callback skipped; splice, detach, food/portion, farewell, bodies, grabs and deactivation still run |
| repeated soft removal after splice is inert | index guard after the first removal, no duplicate callbacks |
| grab release only touches grabs owned by the removed actor | host-side matching when `onEndGrabs` runs |
| a throwing host callback leaves a partial, non-atomic removal | no rollback, later callbacks skipped, roster/actor partly mutated |
| a failed removal can be retried after the failing callback recovers | failed attempt leaves the actor active; retry repeats the earlier callback and completes exactly once |
| removal draws no RNG and leaves unrelated actors and fields alone | no `Math.random` draw; unrelated actor/field preservation |
| Glass removal returns false and clears no references when the colony declines | Glass order, false colony result gate |
| Glass removal returns true and clears references exactly once when the colony removes | Glass order, one ref clear, no detach/cancel/mesh call |
| Glass removal without a departure does not snapshot and repairs no actor fields | optional departure and unchanged actor on a declined removal |
| Glass removal is inert for an absent actor and without a colony remover | null actor guard and missing-remover false result |

D3-hosted evidence: `node scripts/departure-test.mjs` passed all 8 departure
checks (including ceiling-culling `removeBear` and map/save/New Game non-departures)
with no page errors; `node scripts/stars-test.mjs` passed its farewell/star checks,
including Bear and Glass farewell removal, with no page errors
(`.dev-shots/d3/`).

Existing cases reused rather than duplicated:

- `tests/actor.test.mjs` — predicates, active filtering, `byUid`, fixed-array view.
- `tests/actorrecord.test.mjs` — v2 snapshot, Glass tag, common restore, ancestry not overwritten.
- `tests/actorsave.test.mjs` — actor version validation/migration, species checks, registered and required collections.
- `tests/save.test.mjs` — envelope checks, genome/gift validation, cross-map high-UID `maxActorUid` (500000), game-wide duplicate UID rejection, normalization.
- `tests/relationship-save.test.mjs` — partner/rival persistence and reciprocity, game-wide `pruneActorRefs()` preserving an inactive-map partner.
- `tests/behavior.test.mjs` — attach state shape and shared pair behavior.
- `tests/behavior-mood.test.mjs` — detach/reattach resets runtime mood.
- `tests/behavior-contracts.test.mjs` — detaching one side of an active pair cleans both sides.
- `tests/behavior-preferences.test.mjs`, `tests/gifting.test.mjs` — existing detach cleanup/reservation cases (not duplicated here).
- `tests/family.test.mjs`, `tests/adoption-save.test.mjs`, `tests/departures.test.mjs` — existing `pruneActorRefs()` coverage.

Gaps:

- `nextBearUid`, `reserveUid`, `reserveWorldUids`, `reserveGameUids`, `spawn`,
  `getFreeBear`, `spawnFromState`, `despawnAll`, `applySavePayload` and
  `resetNewGame` remain app-internal and are not importable in Node without a
  DOM/WebGL/physics boot. D1 added the `actorlife.js` growth seam, D2 added the
  `actorbirth.js` planning seam, and D3 added the `actorremove.js` sequencing seam;
  none exports pool, spawn or map teardown orchestration. The app `removeBear`
  wrapper still has no return value by design.
- D3 host checks cover ceiling-culling removal and Bear/Glass farewell removal, but
  not an arbitrary direct Glass removal caller (there is none) or removal during
  every map/save overlap. U-003's post-physics spawn-failure cleanup is addressed
  under N1 (§11); broader pool/save/map coverage remains a gap. U-006 (direct Glass
  detach decision) remains open.
- No executed browser evidence in M5 for map switch, save/load, stars departure or
  New Game ordering. Those sequences are **Inspected/Unverified**, not host-run.
  D1's host probe covers normal and deferred Bear growth only. D2 host evidence
  covers a live soft-body birth and a same-session save export/import restore; it
  does not cover map switch, New Game or stars departure.
- The exact per-draw spark RNG sequence is source-inspected, not individually
  counted by a committed test. The D1 module adds no RNG draws; the wrapper keeps
  the existing 12 `spawnSpark()` calls in place.
- Pool reuse edge cases (`physicsSuspended`, per-spawn material disposal) and Glass
  load failure/retry remain **Unverified**.
- No test asserts that a held stale `Bear` reference throws or is otherwise
  invalidated; the contract is observational: `active` is false and the view no
  longer resolves it.
- No test covers `clearGuardianReferences()` scanning only live actors while
  `clearRelationshipReferences()` also scans both world snapshots; this is
  **Inspected** behavior, not executed coverage.

## 9. Discovered defects

The new focused tests did not reveal a failing current behavior, so none is
recorded as a defect. The material-lifetime, `physicsSuspended` and non-atomic
apply items in §6 remain Unverified risks. The post-physics `spawn()` partial
actor was an observed N1 defect and is addressed by the bounded cleanup in §11.
D3 likewise added no defect: the extraction preserved the recorded behavior, and
non-atomic callback failure remains documented as current behavior rather than a
regression.

## 10. N1 U-003 post-physics partial lifecycle evidence (2026-10-24)

Status: bounded investigation only at baseline `HEAD 937aaa6`, with the parent's
three documentation changes preserved (only the U-003 register row was updated
under N1's allowed writes). No production source, committed test or committed
harness changed, and no rollback/cleanup policy is proposed or implemented.
U-003 remains open.

### Method and evidence labels

- **Source-inspected:** the full `spawn()`, `getFreeBear()`, `removeBear()`,
  `removeSoftActor()` and relevant callers were read before probing.
- **Host-run (unmodified):** an owned `python3 launch.py --no-open` server and
  the committed `scripts/browser-harness.mjs`, headless Chromium, fresh temporary
  profile, `__gummy.seed(20261024)`, existing `__gummy` hooks only.
- **Instrumented-host:** a scratch proxy served the checkout unchanged except the
  `/src/app.js` response, which added dormant `window.__n1` snapshots and explicit
  throws at five app-level boundaries. The on-disk `src/app.js` was never edited
  or rewritten. This is not unmodified-host evidence.
- An instrumented control run with no throw active matched the normal host run on
  all compared success-path fields (uid, slot, 24 handles, initial verts, removal
  flags, same-object respawn, grew UID, final zero bears).
- Both pages reported zero page errors. Source/instrumented hashes, commands and
  exit codes are in `.dev-shots/n1/ledger.md` and `report.json`.

### Source order

`spawn()` validates species/rig, requires physics, applies the ceiling, acquires a
pool slot, then performs `clearFarewellRuntime`, `active = true` + `bears.push`,
material/mesh setup, point/stage/UID/life reset, `createBearBodies` and
`buildBear`. There is no rollback wrapper. `getFreeBear()` will not reuse a slot
left `active` by a failed spawn until that partial actor is removed.

`removeBear()` delegates to `removeSoftActor()`, whose callback order is:
departure, drop carried, release portions, detach, release food, `ai = null`,
farewell, destroy bodies, roster splice, reference clearing (unless
`preserveRefs`), end grabs, `active = false`/`grabs = 0`, deactivate. A throwing
callback stops the rest; the splice and deactivation may not have happened.

### Observed results

| Probe | Immediate state after failure | Later spawn/sim | Later removal |
| --- | --- | --- | --- |
| Normal host spawn/remove | — | spawn uid 11, slot 0, active, visible, 24 handles, 2456 verts, `nan:false`; removal clears roster/ai/handles/hide | respawn reuses slot 0 as uid 12, 24 handles, `nan:false` |
| `roster` throw after push | 2→3 bears; partial active in roster with stale uid 3 (allocator still 15), no handles, mesh hidden, no AI | next spawn uid 15 succeeds; partial gains AI `seekMate`, still in roster; `nan:false` | `clear()` removes it and zeroes pool handles/visibility |
| `material` throw after mesh/material | 2→3 bears; partial active in roster with stale uid 3 (allocator still 19), no handles, mesh visible, no AI | next spawn uid 19 succeeds; partial gains AI, still visible in roster; `nan:false` | `clear()` removes it cleanly |
| `bodies` throw after `createBearBodies` | 2→3 bears; partial active in roster with allocated uid 23, 24 positive handles, mesh visible, no AI | next spawn uid 24 succeeds; partial gains AI, retains handles; `nan:false` | `clear()` destroys handles and deactivates |
| `detach` throw during removal | roster stays at 2; target active/in roster, AI `seekMate`, 24 handles, mesh visible | next spawn uid 28 succeeds; target remains; `nan:false` | second `clear()` removes target, destroys handles, hides mesh |
| `destroy` throw during removal | roster stays at 2; target active/in roster, `ai:null`, 24 handles, mesh visible | next spawn uid 30 succeeds; target remains; `nan:false` | second `clear()` completes removal |

The two removal retries re-ran earlier callbacks and succeeded in this sample
because `ai.detach` and `destroyBearBodies` are repeat-safe. That is observed
idempotence, not a production recovery or rollback guarantee.

### Conclusions and limits

- Normal spawn/remove accounting works: one pooled slot is reused, bodies are
  created/destroyed, the roster and `active` flag are cleaned, and UIDs advance.
- A post-physics spawn failure leaves an explicit thrown error but no explicit
  failure state. The partial actor remains in `bears`, may acquire AI on the next
  tick, and in the body-stage case already owns live Box3D handles. Roster/material
  failures keep a stale previous-life UID without consuming the allocator; the
  body-stage failure consumes its UID. Subsequent spawning is not blocked in this
  sample, but the roster/identity state is not clean.
- No automatic cleanup was observed. `clear()` later removes the partial actor,
  but that is a caller action, not failure recovery.
- Limits: injected boundaries are synthetic; the instrumented page is not
  unmodified-host evidence. Removal used `despawnAll()` (`preserveRefs:true`), so
  reference clearing and ceiling/stars departures are out of scope. Save/load,
  map switch, New Game, Glass, `physicsSuspended` and the per-spawn material clone
  path were not exercised. No screenshots were created; this is state evidence.
- A bounded implementation would need a separately approved policy decision
  (failure cleanup, quarantine, or explicit non-atomic acceptance). N1 does not
  authorize one.

## 11. N1 U-003 spawn-failure unwind and removal retry (2026-10-24)

Status: implemented under the parent-approved N1 policy at baseline `HEAD
90dd00b`, superseding the no-cleanup observation in §10. Production changes are
limited to `src/app.js`, `tests/actor-remove.test.mjs` and this documentation.
Removal remains explicitly non-transactional. The post-physics spawn-failure gap
is addressed for the bounded cases below; broader save/map/pool sequencing
remains out of scope.

### Approved policy and source order

`spawn()` still validates species/rig, requires physics, applies the ceiling,
acquires a pooled slot, clears farewell state, then sets `active = true` and
pushes the actor into `bears`. After that push, the remaining initialization
through `createBearBodies()`, `buildBear()` and `return b` is wrapped in
`try/catch`. Any throw in that region calls the local
`abortPartialSpawn(b, ownedMaterial)` helper and then rethrows the original error.
The helper does not call `removeBear()`; departure, food, portion, partner,
reference-clearing and other removal callbacks do not run. No persistent
lifecycle state was added.

The cleanup sequence is:

1. splice the actor from `bears` once, if it is still present;
2. set `b.ai = null`, `b.grabs = 0`, `b.active = false`,
   `b.needsBuild = false`;
3. set `b.mesh.visible = false` and attempt `writeEyeInstance(b, true)`;
4. attempt `destroyBearBodies(b)` independently;
5. when this spawn created a material clone, clear `b.material` and
   `b.mesh.material` and attempt to dispose that exact clone independently;
6. retain the first cleanup error across those attempts and rethrow it after the
   remaining safe steps, so the original spawn error can still carry it as
   `cleanupError`.

`createBearBodies()` now initializes every handle entry to `-1` before creating
spheres. If sphere creation throws part-way through, cleanup destroys only the
handles that were actually created; it never treats an uncreated zero-filled
entry as Box3D handle `0`.

`nextBearUid` is deliberately not rewound. A UID allocated before the throw is
consumed, so a later spawn may skip that number; a gap is safer than reusing a
partially published identity.

### Error preservation

The original error object is rethrown, not a wrapper. If cleanup itself throws,
the original error remains the thrown value and receives a `cleanupError`
property when it can accept one. If attaching that diagnostic also fails (for
example a frozen error), the original error is still rethrown; the catch is
commented rather than silently replacing the failure.

### Material ownership limits

`ownedMaterial` holds the exact material reference created by this spawn, not a
boolean. The two creation sites are the `MSN_MAT.clone()` path and the
DNA-color path where `material === baseMaterial` triggers a clone. Shared
`FLAVOR_MATS`, `MSN_MAT`, toon-cache materials from `toonMaterialFor()` and
`customMats` are never disposed. If a competing throw occurs before the clone is
assigned to `b.material`, the helper disposes only the tracked clone and clears
the slot's material references; it does not dispose a previous-life or shared
material.

### Removal retry contract

`removeSoftActor()` is unchanged and remains non-atomic. A throwing host callback
stops the remaining steps and leaves the roster/actor partially mutated. A retry
runs the sequence again from the start, so earlier callbacks repeat; it completes
only if the host's callbacks and side effects are repeat-safe. This is retry
support, not rollback or transaction machinery. `tests/actor-remove.test.mjs`
keeps the existing non-atomic case and adds a case where a failing drop callback
leaves the actor active, then a recovered retry completes removal exactly once.

### Evidence (N1 implementation)

- **Host-run, unmodified:** owned `python3 launch.py --no-open --localhost`,
  committed `scripts/browser-harness.mjs`, headless Chromium, fresh profile,
  `__gummy.seed(20261024)`. Normal spawn/removal/respawn still produced uid 11 in
  slot 0 with 24 handles and 2456 verts, cleared to `active:false`,
  `handles:null`, `ai:null`, hidden mesh, then reused slot 0 as uid 12 with
  `nan:false`. HTTP smoke passed 68/68.
- **Instrumented-host:** scratch proxy served the checkout unchanged except a
  scratch `/src/app.js` response containing dormant snapshots and throws. The
  on-disk source hash was `0edea7887d071e59f62c5ec55684b0164b98d20255bfb7ae99db2b50277fd6f0`;
  the instrumented copy hash was
  `65a71caf1c5955c0b5b5b88e47260afb860dd23de03763a09612d82d02ee5fc6`.
  The `roster`, `material`, `bodies` and `partialBodies` throws now occur inside
  the wrapped region, and the probe records the aborted actor explicitly.
- In each spawn-failure mode the original `N1_INJECT` error surfaced; `bears`
  returned to the pre-spawn count; the aborted actor was inactive, outside the
  roster, had no handles and no AI, and its mesh was hidden. A simulation tick
  did not attach AI or reactivate it. A later spawn reused the cleaned slot with
  24 handles and a built mesh, `nan` stayed false, and all cleanup calls returned
  without error. The `bodies` failure consumed uid 23 and the subsequent spawn
  used uid 24; no allocator rewind was observed.
- The `partialBodies` throw after six spheres left the aborted actor with
  `handles:null`, no AI, a hidden mesh and no roster entry; the next spawn created
  24 handles with `nan:false`. This exercises the `-1` sentinel for entries that
  were never created, rather than only the completed-body path.
- Removal `detach` and `destroy` failures still left the target active in the
  roster with 24 handles and a visible mesh. A retry `clear()` then removed it
  (`active:false`, out of roster, no handles, hidden mesh) and the page produced
  zero errors. This confirms retry behavior only; it does not claim rollback.
- Both normal and instrumented pages reported zero page errors. Focused
  `node --test tests/actor-remove.test.mjs
  tests/actor-lifecycle-contract.test.mjs` passed 19/19, full `node --test tests`
  passed 731/731, `node scripts/check-behavior-contracts.mjs` passed with 17
  modules/34 states/20 opportunities, and `git diff --check` is clean. Probe
  assertions passed and the report is `.dev-shots/n1/report.json`.

### Limits

The injected boundaries are synthetic, so this is instrumented-host evidence,
not an end-to-end unmodified-host failure proof. The default spawn fixture took
no owned material clone path (`lastAbortedMaterialOwned:false`), so clone disposal
and `cleanupError` attachment are source-inspected, not host-executed. The probe
also does not cover pre-physics guard behavior, ceiling eviction, save/load/map
switching, New Game, Glass, `physicsSuspended`, or per-frame caller behavior
after a caught spawn error. If `destroyBearBodies()` itself throws after some
handles were created, the actor is still removed and hidden, but the slot can be
reused with residual handles; no quarantine state is added by this policy. No
screenshots were created; this is state evidence.
