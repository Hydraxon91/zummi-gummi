# Actor and session identity/lifecycle contract

Status: current-contract inventory for roadmap step M5. This document describes
what the code does today; it does not extract, rename or redesign orchestration.
No production runtime changed in this step.

Baseline: `HEAD 4856ce6` (`docs: inventory interaction ownership for M2a`), clean
working tree before the step. Evidence below is source inspection plus the focused
Node tests named in §8. Browser save/load, map-switch and New Game flows were not
executed here.

Evidence labels used throughout:

- **Inspected** — the named source path and its callers were read directly.
- **Sampled** — representative call sites were read; every branch was not traced.
- **Unverified** — no executed check exists in this step, or the boundary is not
  importable in Node.

This is a contract, not an extraction. The app still owns the live roster,
allocator, pool and removal ordering; no module boundary was introduced.

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

`birthChild()` (`src/app.js:1101-1181`) checks the mother is active, pregnant and
not grabbed/in water/airborne/free-body, checks safe food and species, chooses home
and a walkable position, then spawns a soft-body child or calls
`glassColony.spawnChild()`. A generated child gets a fresh UID through `spawn()`
or the injected Glass allocator. After successful creation it applies family bonds,
history, clears pregnancy/gestation/retry and sets the mother's cooldown. If child
creation returns `null`, `birthChild()` returns `false` before mutating the mother
(Inspected).

### Growth

`applyBearStage()` (`src/app.js:949-1003`) scales live points around the COM,
updates stage/scale, clears `guardianUid` and follow state when leaving `baby`,
destroys and recreates Box3D bodies, rebuilds the mesh and resets behavior
timing. The UID is unchanged. If the actor is grabbed, airborne or in the pond the
stage change is deferred via `pendingStage`. Glass has its own `applyStage()`
(`src/glass.js:348`).

### Real removal (soft body and Glass)

`removeBear(b, opts)` (`src/app.js:747-766`) order:

1. no-op if `b` is not in `bears`;
2. `departures.snapshot()` when `opts.departure` is set;
3. drop carried food into the active map;
4. release the actor's food-portion claim;
5. `ai.detach(b)` (releases food and cancels paired/task state);
6. release the field-food claim; null `b.ai`; clear farewell runtime;
7. destroy Box3D bodies;
8. splice from `bears`;
9. unless `preserveRefs`, clear guardian references and relationship references;
10. end grabs, set `active = false`, `grabs = 0`, hide mesh and eye rows.

`clearGuardianReferences()` scans `actorView.all()` (live actors only).
`clearRelationshipReferences()` scans the live view **and** both world snapshot
arrays (`src/app.js:703-716`). Removal is real: references are cleared unless the
caller explicitly asks to preserve them.

`removeGlassActor()` (`src/app.js:830-844`) snapshots departures, clears farewell
runtime, drops carried food, releases portion/food claims, calls
`glassColony.removeActor()` (which disposes the actor) and then always clears
guardian and relationship references. It has no `preserveRefs` option.

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
  child cannot be created.
- `spawnFromState()` returns `null` before spawning when the saved species is
  unknown/rigless or when MSN is disabled.
- `glassColony.restore()` skips entries that are not Glass-shaped and caps the
  number created; it does not throw for a skipped entry.
- A Glass async model failure cleans the temporary model/materials/lease, records
  `actor.error`, and leaves the actor active with no model
  (`src/glass.js:650-666`).

Not supported / Unverified:

- No rollback or transaction exists for an exception thrown part-way through
  `spawn()` after `active = true` and `bears.push()` (bodies/mesh build are not
  wrapped in a compensating cleanup). Such an actor could remain in the roster.
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
- **C12. No rollback guarantee.** Partial creation/application paths do not promise
  transactional cleanup.

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
  `getFreeBear`, `spawnFromState`, `removeBear`, `removeGlassActor`, `despawnAll`,
  `applySavePayload` and `resetNewGame` are app-internal and not importable in Node
  without a DOM/WebGL/physics boot. No production exports or DOM hooks were added
  for this contract step.
- No executed browser evidence in M5 for map switch, save/load, stars departure or
  New Game ordering. Those sequences are **Inspected/Unverified**, not host-run.
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
recorded as a defect. The partial-creation, material-lifetime, `physicsSuspended`
and non-atomic apply items in §6 are stated as Unverified risks, not proven bugs;
they were not fixed in M5.
