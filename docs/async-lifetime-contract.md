# Asynchronous resource lifetime contract

Status: **M15 / C6 contract and focused fixture proof.** This step adds
`tests/async-lifetime.test.mjs` and this note, and updates M15 facts in the
maintained ownership table. It does not change production source, existing
tests, effects, assets, scripts, configuration, CI or the roadmap. Parent review,
acceptance and commits are separate.

Baseline: `HEAD 6e6adda` with a clean working tree. Evidence labels:

- **Inspected** — the named source and its immediate callers were read.
- **Host-run** — a command was executed for this step.
- **Store-level simulation** — a test consumer exercises the real
  `createAssetStore` contract without importing three.js, the DOM or Glass.
- **Unverified** — no executed check covers that host path here.

The maintained ownership table is
[system ownership and extension contracts](system-ownership-contracts.md);
[assets/README.md](../assets/README.md) remains the consumer-facing asset guide.

## 1. Owners and non-owners

| Concern | Owner | Boundary |
| --- | --- | --- |
| Manifest validation and GLB loading | `src/assets.js` | `validateAssetManifest`, `loadManifestedGltf`, GLTF inventory checks. Injected loader; no cache. |
| Source cache, coalescing, leases and eviction | `src/assetstore.js` `createAssetStore` | Owns catalog source records, load promise, ref count, error state, preload and explicit eviction. The exported `assetStore` uses the browser catalog fetch. |
| Source resource disposal | `src/assetstore.js` `disposeAssetSource`, `disposeInstanceSkeletons` | `disposeAssetSource` disposes only cached source-owned geometry, skeletons, materials and referenced textures. `disposeInstanceSkeletons` disposes a clone's skeletons only. |
| Meadow Glass consumer | `src/glass.js` `makeActor`/`loadModel`/`disposeActor`/`removeActor`/`clear` | Owns actor liveness, the cloned skinned model, cloned materials, mixer/actions and the actor's one source lease. |
| Studio MSN consumer | `src/msn.js` `load`/`dispose` | Owns the Studio prototype clone, materials, mixer and its one source lease. |
| Asset status query | `src/app.js` `__gummy.assets()` | Read-only projection of `assetStore.status()`; not a second cache. |
| Effects and renderer targets | `src/effects.js` | Owns the composer, passes, render targets and their private disposal helpers. The factory has no public `dispose`. |

The store deliberately does **not** own consumer/actor state. It has no
cancellation callback, actor registry, model attachment or automatic recreation.
A consumer that disappears before its lease resolves must retain enough state to
await the lease and release it.

## 2. Lease lifecycle

### States and reservations

A source record starts `unloaded`. `acquire(id)` resolves the catalog entry,
increments `refs`, then calls `ensureLoaded`:

- `unloaded`/`error` + no promise → `loading`, increment `loads`, start one load.
- `loading` → return the same promise; concurrent consumers share one load.
- `ready` → return the cached value without another load.
- Load success → store `value`, state `ready`, keep the promise resolved.
- Load failure → state `error`, record an error string, clear the load promise
  and reject every waiter.

`acquire` reserves an existing record before awaiting the load, and a new record
is created before loading starts. Eviction therefore cannot remove a source
between a consumer's acquisition and the first promise continuation.

A resolved lease is a shallow copy of the loaded value plus one idempotent
`release()` function. Releasing:

- decrements that record's `refs` exactly once;
- does not dispose a source, remove cached data or affect other leases;
- is inert on repeated calls.

Distinct leases each own one reservation. Releasing one lease twice must not
release another consumer's reservation.

### Eviction and preload

`evictUnused()` removes only records whose state is `ready` **and** whose
`refs` are zero. It calls the injected `dispose` once per record, deletes the
record and reports the ID. It does not evict:

- pending loads (`loading`);
- failed records (`error`);
- any referenced source (`refs !== 0`);
- an unloaded source with no record.

`preloadGroup(group)` loads matching sources without creating leases. Its
sources remain `ready` with `refs: 0` and are reusable by a later `acquire`.
They become evictable only through the explicit `evictUnused()` call; eviction
is not automatic or per-frame.

`status()` reports the catalog projection: state, refs, load attempts, last error
and manifest bytes. It is diagnostic state, not an ownership or GPU-memory API.

## 3. Consumer cancellation and late completion

An `acquire` promise has no cancellation channel and produces no lease until the
load resolves. A consumer removed while loading therefore cannot release "early";
it must remember that it is gone and release when the promise settles. Current
consumers implement this explicit ownership:

- Glass `loadModel` checks `!a.active || a.disposed` after
  `assetStore.acquire(...)` resolves, releases immediately and does not attach a
  model.
- Glass `disposeActor` marks `disposed`/inactive, stops the mixer, disposes
  instance skeletons and cloned materials, removes the root, then releases
  `assetLease` if one is already attached. `clear` and `removeActor` use this
  path.
- Studio MSN `load` checks `disposed` after acquisition, releases immediately
  if gone, and `dispose` releases an attached lease.

Late completion is store-safe: the source may remain cached `ready` at refs zero
until `evictUnused` disposes it. A consumer that has already removed its model
must not attach or mutate the model from the late path. Release is exactly once
per lease; a second release from either the cancellation path or normal disposal
is inert.

The new test suite models this with a small store-level consumer that checks its
own `removed` flag, releases the late lease and leaves no model reference. That is
**store-level simulation, not Glass host proof**. It does not import three.js,
DOM, WebGL or `glass.js`.

## 4. Source versus instance ownership

- The source `gltf.scene` and its geometries, skeletons, source materials and
  textures are shared cache data. The store owns their disposal.
- Consumers clone the scene and skinned skeletons; Glass and Studio also clone
  materials so per-actor look and material parameters are independent.
- Consumers dispose only instance skeletons and cloned materials, never shared
  source geometry or textures.
- `disposeAssetSource` walks a source scene once through a `Set`, so a material
  shared by multiple meshes and a texture referenced by multiple material keys
  are disposed once. `disposeInstanceSkeletons` de-duplicates skeletons in a
  clone.
- Glass instance failures dispose the partial clone/material set and release the
  lease if it was attached. Store source eviction is a separate acts-once path.

No second cache, per-consumer source copy, blanket source recreation or
asset-store fallback is part of this contract.

## 5. Failure, retry and effects

A load failure rejects all coalesced consumers. Each `acquire` catch returns its
reservation, leaving `refs: 0`; the record stays `error` with the error string
and a cleared load promise. A later `acquire` is a new attempt, increments
`loads`, starts exactly one new load and can reach `ready`. There is no automatic
retry loop and no lease from the failed attempt. Glass records the actor error
and does not silently substitute a model; a later consumer acquisition is the
retry path.

`src/effects.js` is not an asset-store consumer and has no public dispose. Its
composer, passes and render targets are app-lifetime under the current owner.
Private `dispose()` methods on individual helper classes do not make the effects
factory safely recreatable: pass/target/listener interaction has not been
inventoried. Effects teardown or recreation is therefore unsupported here and
would need a separate approved design. M15 does not add effect teardown, a
second graphics layer or blanket recreation.

## 6. Glass behavior evidence and reuse

The Glass and Studio lifetime behavior above is **source-inspected**. The paths
were not executed in a browser for C6 because no production code changed. Prior
B1/C2 browser evidence exercises portions, interactions, save/map/New Game and
Glass population paths, but does not force an asset lease to resolve after actor
removal. It is therefore not used as proof of late completion. Existing Glass
suites remain the applicable host checks if a future production change touches
this path.

## 7. Requirement-to-check map

All new checks are Node host-run unless marked source-inspected.

| M15 requirement | Check |
| --- | --- |
| Concurrent consumers coalesce one load; pending source cannot be evicted | `async-lifetime` coalesced-cancellation test; existing `asset-store` coalescing test |
| Release exactly once; repeated release idempotent; eviction only after zero refs | `async-lifetime` coalesced-cancellation test |
| Consumer removed before lease resolution; caller awaits and releases; refs zero and source disposable | `async-lifetime` coalesced-cancellation test |
| Store owns no consumer state or cancellation API | `async-lifetime` coalesced-cancellation test (`Object.keys(store)` and removed consumer remains detached) |
| No duplicate disposal after late/repeated release | `async-lifetime` cancelled and late-completion tests |
| Late completion after consumer removal; store stays ready until eviction; no use-after-release | `async-lifetime` store-level late-completion test; Glass path source-inspected |
| Coalesced load failure rejects both consumers; refs zero; error exposed; one retry succeeds | `async-lifetime` failure/retry test; existing `asset-store` failure test |
| Preload creates no lease; preloaded source is reused and evicted once | `async-lifetime` preload test; existing `asset-store` preload test |
| Source disposal de-duplicates shared textures/materials; skeletons are separate | existing `asset-store` disposal test |
| Glass disposal before/after completion releases once | source-inspected `glass.js`; not host-run in C6 |
| Effects teardown/recreation unsupported | source-inspected `effects.js`; ownership table |
| No second cache, dependency or blanket recreation | diff limited to tests/docs/scratch |

## 8. Checks

```bash
node --test tests/async-lifetime.test.mjs
node --test tests/async-lifetime.test.mjs tests/asset-store.test.mjs \
  tests/asset-loader.test.mjs tests/asset.test.mjs
node --test tests
node scripts/check-behavior-contracts.mjs
```

C6 focused checks passed 4/4 and 16/16; the full Node suite passed 532/532 and
`check-behavior-contracts.mjs` returned `{"ok":true,"errors":[],"modules":17,"states":34,"opportunities":20}`.
`git diff --check` and the changed-doc relative-link check also passed. The
detailed command log is in the C6 scratch ledger. No browser, smoke or parity run
was started because production source is unchanged.

## 9. Unresolved and unverified

- Actual Glass/Studio late completion after a real GLB clone, WebGL resource
  creation and actor removal is **unverified** by a host test. The new suite
  proves the store contract and a consumer simulation only.
- Rapid map/save/New Game overlap while a lease is pending remains a host gap;
  map sequencing and save coordination are outside C6.
- Effects recreation, composer target disposal and listener teardown remain
  unsupported/unverified; no teardown was added.
- Passing checks here are not independent review or acceptance.
