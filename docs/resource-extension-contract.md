# Resource extension and presentation-mirror contract

Status: **M8 / C4 contract and fixture proof.** This step adds a focused Node
suite and this document. It does not change production source, shipped food
types, renderer code, assets, save format, configuration or the roadmap.

Baseline: `HEAD f079636` with a clean working tree. Evidence labels used here:

- **Inspected** — the named source and its immediate callers were read.
- **Host-run** — a command was executed for this step.
- **Existing browser evidence** — a prior host-run, seeded browser result reused
  here; C4 did not start a browser.
- **Unverified** — no executed check exists here, or the path needs the app DOM/
  WebGL boot and is not imported by Node.

The maintained ownership table is
[system ownership and extension contracts](system-ownership-contracts.md). This
note adds the M8 resource-specific boundary and the requirement-to-check map.

## 1. Owners and state classes

| Concern | Owner | State class and boundary |
| --- | --- | --- |
| Food definition and safety | `src/foodtypes.js` (`registerFoodType`, `getFoodType`, `listFoodTypes`, `isSafeFood`) | Import-time, frozen definition registry. Definitions carry `id`, `label`, `satiation`, `respawnMin`/`respawnMax`, `safe`, `visual` and `interaction`. Duplicate IDs throw. This module has no placed state, renderer or DOM. |
| Placed food source | `src/food.js` (`createFoodRegistry`) | Runtime-only list of authored sources plus mutable `ripe`, `visible`, `timer`, `claim`. `field.js` creates one registry from its authored `foodSources`. No renderer import. |
| Dropped/carried portion | `src/foodportions.js` (`createFoodPortionRegistry`, `normalizeCarriedFood`) | Runtime registry of durable portion identities and ownership. `add`/`restore` create records; `claim`/`release`/`releaseActor` reserve; `take` removes a claimed record and returns the carried record. No renderer import. |
| Gifting lifecycle | `src/behaviors/gifting.js` | Owns collect/handover and the `actor.carriedFood` lifecycle above the two registries. Gifting calls registry methods through `ctx.api.portions()`/`ctx.api.food()`; it does not reach into field visuals. |
| Field food presentation | `src/field.js` (`foodSources`, `setFoodVisible`, registry wiring) | Owns the instanced flower/fruit/hive visuals and passes `onVisibility: setFoodVisible` into the food registry. It maps `source.type.visual` plus `source.visualIndex` to the existing instanced visual. |
| Dropped/carried presentation | `src/giftvisuals.js` (`createGiftVisuals`) | Browser-only mirror. It polls `portions.all()` and live actors and creates/hides small meshes. It never claims, consumes, restores or otherwise mutates registry records. |
| App composition, save/restore/map mirror | `src/app.js` | Creates `giftVisuals`, snapshots gifts per map, restores portions on load, drops carried food on removal/save and converts saved carried food to dropped portions. |
| Carried-food save shape | `src/actorrecord.js`, `src/actorsave.js` | `normalizeCarriedFood` trims the saved carried record to `{ id, kind, satiation }`; actor save versions and migration own admission. These records contain no map position or renderer object. |

The presentation mirror reads simulation state in one direction. Claim/consume
logic must not import `three`, `giftvisuals.js` or field meshes, and a visual
must not be treated as the owner of portion identity.

## 2. Supported extension: a definition reuses an existing visual

The supported case is a new data definition that reuses an existing **visual and
interaction handler**. The proof in
`tests/resource-extension.test.mjs` registers a fixture-only
`c4-fixture-berry` with `visual: 'fruit'`, `interaction: 'eat'`, `safe: true` and
uses it as a placed source. The fixture is not shipped content.

Required steps:

1. **Register the definition once.** Call `registerFoodType` with a unique ID,
   non-empty label, positive finite `satiation`, a valid positive respawn range,
   boolean `safe`, and an existing `visual`/`interaction` pair. Registration
   returns the frozen record; `getFoodType`/`listFoodTypes` return that identity.
   A duplicate ID or invalid field throws before registration.
2. **Author the placed source.** Add a source with a stable `id` and `kind` equal
   to the registered ID. Per-source `satiation`, `respawnMin`, `respawnMax`,
   `label`, approach points and extra authored metadata are preserved by
   `createFoodRegistry`; they override definition defaults. A source without a
   registered `kind` remains the legacy generic `food` case.
3. **Reuse an existing visual instance.** The field visual branch must already
   exist for `source.type.visual` and the source must carry the matching
   `visualIndex` into that instanced stack. `setFoodVisible` currently supports
   `flower`, `fruit` and `hive`; it reads the live source and toggles the
   authored instance. A novel `visual` value does not create a renderer: the
   callback returns without changing any visual, even though the data source
   still simulates.
4. **Keep IDs and ownership.** Preserve stable source and portion IDs. Claims,
   consumption and `take` authorize by live object identity. Snapshot/restore
   persists only mutable source state and portion position/map data.
5. **Do not add a second registry or cache.** The definition registry, the
   single placed-source registry and the single portion registry are the
   existing owners. Presentation state is derived every poll and removed when
   the ID disappears.

This path does not add a new renderer, asset, risk action, AI kind list or
inventory.

### Visibility timing

`createFoodRegistry` receives `onVisibility(source, visible)`; the callback
always receives the exact live source object and a boolean:

- **Initial:** `visible` mirrors `ripe` (`s.ripe !== false`).
- **Claim/release:** no visibility notification; only `claim` changes.
- **Consume:** only a ripe source claimed by that exact bear can be consumed. It
  sets `ripe = false`, clears the claim, sets `visible = false`, sets
  `timer = respawn`, increments stats and then notifies `(source, false)`.
- **Respawn:** `update` accumulates time in `0.20` steps. While `timer > 0` the
  source stays hidden. When the timer reaches zero, `ripe`/`visible` become true
  and the registry notifies `(source, true)` once.
- **Restore:** entries are matched by ID. The callback is called only when the
  entry changes ripeness; a same-state restore does not notify. Restore then
  writes `visible = ripe`, resets `timer` (`0` when ripe, clamped finite value
  otherwise) and clears the claim. Unknown IDs are ignored.
- **Reset:** every hidden source is notified visible once, then all sources are
  made ripe/visible with no claim or timer.

`field.setFoodVisible` only dispatches on `source.type?.visual` and
`source.visualIndex`; it does not read claim or AI state. A definition with an
unsupported visual silently has no visual effect, which is why a new visual is
outside this supported path.

## 3. Portion identity, ownership and mirrors

### Registry rules

- `add` requires a non-empty `kind`, positive finite `satiation`, finite `x`/`z`
  and an optional `y`. `mapId` is `field` or `studio`; any other value currently
  defaults to `field`.
- An explicit `id` is retained. A generated ID is `gift-N`, and the allocator
  advances past every observed `gift-N` ID (including restored entries).
  Duplicate IDs are rejected by `add`; `restore` skips duplicates.
- `claim(portion, actor)` succeeds only for a live registry record and one
  claimant. A competing actor cannot claim or release it. `release` is
  ownership-checked; `releaseActor` sweeps one actor's claims.
- `take(portion, actor)` requires the exact claim, removes the portion from the
  registry and returns the immutable carried shape `{ id, kind, satiation }`.
  A second take returns `null`.
- `snapshot(mapId)` returns `{ id, kind, satiation, x, y, z, mapId }` only; it
  deliberately excludes the live claim.
- `restore(entries)` replaces the list, resets the allocator, skips malformed or
  duplicate entries, clears every claim and preserves each entry's `mapId`.
  Filtering (`all`, `nearest`, `snapshot`) separates `field` and `studio`; a
  restore of one map's saved list removes portions not supplied by the caller.
- `normalizeCarriedFood` is the save/actor-record boundary. It accepts only an
  object with non-empty string `id`/`kind` and positive finite satiation, rounds
  satiation to four decimals, drops unknown fields and returns `null` otherwise.

### Carried, dropped and maps

- Collecting a source consumes it once and creates a carried record. `take`
  removes a reclaimed dropped portion; handover consumes the carried record
  once.
- An interrupted carried gift is represented as a **new dropped portion with the
  same identity**. `gifting.dropCarried` and app `dropCarriedFood` call
  `portions.add({ id: carried.id, kind, satiation, x, y, z, mapId })`. A duplicate
  ID causes app drop to request a fresh `nextId()`; the fallback still preserves
  kind and satiation. The new record is not the old object, but its identity is
  stable.
- `saveCurrentWorld` snapshots the active map's portions into `worlds[id].gifts`
  via `portions.snapshot(id)`. `activateMap` restores portions belonging to the
  other map plus the target map's saved `gifts`, so each map list stays separate.
- `applySavePayload` restores both saved gift arrays before activating the saved
  map, then `restoreSavedCarriedFood` converts every saved actor `carriedFood`
  into a dropped portion at that actor's saved `x`/`z` and map ID. Saved actors
  do not keep the carried record after apply.
- `giftvisuals` mirrors the registry rather than owning it. Dropped meshes are
  keyed by `portion.id`, positioned from `x/y/z`, scaled per dropped/carried and
  hidden when `portion.mapId !== getMapId()`. Carried meshes are keyed by
  `actor.uid`, read `actor.carriedFood` and follow the actor/face yaw. Missing
  IDs/UIDs remove the corresponding mesh. `app.js` calls `update(dt)` on the
  frame path; the mirror's effective lists are empty unless `getActive()` (the
  booted flag) is true.

B1's existing seeded browser report shows a carried gift visual at the giver's
position with scale `1.4` and `visible: true`
(`.dev-shots/gifting-b1-all.json`, check "a carried gift is visible while the
giver approaches"; ledger `.dev-shots/b1/ledger.md`; inspected captures
`.dev-shots/gifting_offer.png` and `.dev-shots/gifting_carried.png`). That is
existing browser evidence, not a C4 rerun. Dropped-mesh visibility, map hiding
and removal are source-inspected here; C4 did not execute a browser scene.

## 4. Unsupported or decision-gated

- A **new visual** (new geometry/material/instancing branch), a new asset, or a
  renderer change. Registering a definition with a novel `visual` does not make
  it supported.
- A **new risk or action** (new `interaction` handler, sting/depletion/status
  semantics). The supported case reuses an existing handler.
- General inventory, shops, equipment, carried capacity or item slots.
- A second food/portion registry, a second presentation cache, or a renderer
  dependency inside claim/consume logic.
- New map IDs. Portions currently validate only `field` and `studio`, and app
  save/map activation assumes the same two-map shape.
- Direct claim/consume by UID. Live object identity remains the authority.

## 5. Requirement-to-check map

| Requirement | Check |
| --- | --- |
| Existing-visual definition; registry identity, duplicate rejection, invalid fields | `resource-extension`: definition test |
| Duplicate claim, consume once, double consume inert | `resource-extension`: source visibility test; existing `gifting` source claim cases |
| Visibility `false`/timer/respawn and exact callback arguments/order | `resource-extension`: source visibility test |
| Restore hidden/visible callback semantics, claim clearing, timer preservation | `resource-extension`: restore test |
| Per-source overrides and authored metadata preserved | `resource-extension`: override test |
| Stable portion IDs, duplicate/invalid add rejection | `resource-extension`: portion ID test |
| Claim conflict, ownership-checked release, snapshot excludes claim, double take | `resource-extension`: claim/take test |
| Restore clears claims, preserves `mapId`, filters/isolation, allocator advance | `resource-extension`: restore/map test |
| Interrupted carried drop as new portion with retained identity | `resource-extension`: drop test; existing `gifting` "interrupting a carried gift drops a recoverable portion" |
| `normalizeCarriedFood` boundary | `resource-extension`: normalization test; `relationship-save` carried/migration cases |
| No renderer import or `THREE` use in resource rules/gifting | `resource-extension`: renderer-free test |
| Dropped-portion save validation and duplicate grant IDs | existing `save` test "dropped gift portions validate and duplicate ids are rejected" |
| Carried save shape/migration and load conversion outside actor | existing `relationship-save` tests |
| App restore-as-dropped and map activation | source-inspected only (see gap below); not duplicated in the new suite |
| Gift visual mirror | source-inspected; carried visual reused from B1 browser evidence; no Node three import |

Focused commands for this step:

```bash
node --test tests/resource-extension.test.mjs
node --test tests/resource-extension.test.mjs tests/food.test.mjs tests/gifting.test.mjs \
  tests/behavior-portions-query.test.mjs tests/save.test.mjs tests/relationship-save.test.mjs
node --test tests
node scripts/check-behavior-contracts.mjs
```

## 6. Honest gaps

- `src/app.js` is not importable without the browser/DOM/WebGL boot. The
  restore-as-dropped sequence, map activation merge and `dropCarriedFood`
  fallback are **source-inspected**, not executed in this Node step. Existing
  save tests cover the record shapes and `gifting` tests cover registry-level
  drops, not the app orchestration itself.
- `giftvisuals.js` imports three.js and is browser-only. C4 did not add a Node
  renderer test; carried visual timing is prior B1 host-run seeded browser
  evidence. Dropped mesh, map hiding and teardown remain source-inspected.
- Map switch/save sequencing has no dedicated committed Node test; see
  [interaction ownership](interaction-ownership.md) and
  [system ownership](system-ownership-contracts.md) for the same limitation.
- The fixture proves the supported definition/registry/portion boundaries, not
  that a new shipped food is balanced or visually authored. A shipped visual
  needs separate field/content work.
- Passing checks here are not independent review or acceptance. The parent owns
  review and roadmap evidence.
