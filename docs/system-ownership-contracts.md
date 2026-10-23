# System ownership and extension contracts

Status: M0 documentation baseline, updated for the reviewed M1 path, navigation,
homes, food and water query pilots. This document describes the current working
tree only. It does not add a runtime API, plugin loader, registry, toggle or
engine-neutral facade, and it does not authorize remaining M1–M23 implementation.
Proposed chunks in [the system modularity roadmap](system-modularity-roadmap.md)
remain proposals.

Scope: the runtime families in the roadmap inventory. This is a maintained
boundary reference for feature work and a portability starting point, not a
branch-by-branch audit, bug list or performance certification. Historical P0–P5
evidence is linked, not repeated; see
[P0–P5](../MODULARITY_PORTABILITY_ROADMAP.md) and the
[scheduler/RNG contract](scheduler-rng-contract.md).

## How to read this document

- **Owner** means the module or app region that currently performs the
  authoritative mutation. A rendering mirror is not an owner of simulation state.
- **Inspected** means the named symbol and its immediate caller were read for this
  document. **Sampled** means representative paths or exports were read.
  **Unverified** means this pass did not establish the claim. These labels follow
  the prior audit's limits; they are not test results.
- **Current operations** are functions or paths that exist now. They include
  module exports, keys on a factory's returned object, and app orchestration
  helpers; app-internal and factory-internal helpers are labelled as such where
  the distinction matters. An extension recipe describes how to use an existing
  seam; it is not a claim that a general extension API exists.
- **Guarantee** below means behavior enforced by the current source, not an
  aspiration. Where cancellation, teardown or retry is incomplete or unproven, it
  is listed as unsupported/unknown rather than inferred from module boundaries.

State is deliberately split into three classes:

| Class | Examples | Current authority |
| --- | --- | --- |
| Persistent | Save payload, per-map snapshots, actor records, `localStorage` map/clock/launcher settings | `saveformat.js`, `save.js`, `actorsave.js`, `actorrecord.js`, `world.js`; capture/apply order in `app.js` |
| Runtime session | Live actor objects, `actor.ai`, pair/task links, food/portion claims, active map, physics handles, queued map switch | `app.js` composition, `npc.js` view, `interactions.js`, `food.js`, `foodportions.js`, `box3d.js` adapters |
| Render/host | three.js scene objects, materials, skinned instances, shared shader uniforms, DOM controls/listeners, composer targets | `field.js` and named render factories; `app.js` renderer/input/UI regions; `effects.js` composer |

## Runtime family ownership

| Family / representative sources | Current owner and authoritative state | Current operations and representative callers | Lifecycle and unsupported transitions | Extension touch points, checks and evidence gaps |
| --- | --- | --- | --- | --- |
| Behavior modules: `src/behaviors/module.js`, `contracts.js`, `engine.js`, `config.js`, `index.js`, README | `index.js` selects the engine; `engine.js` owns the module map, opportunity order, active-state suppression, tick dispatch and coverage; `module.js` validates and freezes definitions; `config.js` owns layered config; `contracts.js` declares support policy. Per-actor mutable state belongs in `actor.ai`, never module scope (`module.js` header). | Current: exported `createBehavior` / `createBehaviorModules` / `defineBehaviorModule`; returned config object `setModuleEnabled` / `setModuleParams` / `setActorConfig` / `setFeature`; returned modules-engine object `api`, `detach`, `attach`, `tick` and the same config setters. Optional constructor `getNavigation()` supplies `api.navigation()` and is resolved on every query; its result is authoritative, including `null`, and omitted/null uses the current `field.nav`. Optional `findPath(fromX, fromZ, toX, toZ)` keeps precedence for `api.pathTo` with its exact return; otherwise `api.pathTo` uses the resolved navigator's `findPath`. Optional `getHomes` / `getFood` / `getWaterSpots` supply `api.homes()` / `api.food()` / `api.waterSpots()` by identity; provider `null`/`undefined`/empty is authoritative and omitted/null uses the field fallback. `app.js` supplies the live field/nav/resources through these providers. Callers: `app.js` `bootGame`, `ai.js` shared host, `glass.js` shared host, parity scripts. | Modules attach an actor on first tick and are detached through `engine.detach`; pair cleanup runs `cancelPair`. Support declarations distinguish `finish-current`, `feature-only`, `legacy-unverified` and `unsupported`. Essential rest/food/water/wander/social/family/flee are not generically toggleable; only `mate` has proven finish-current behavior. Configurable setters admit only source-registered layered IDs (`CONFIGURED_MODULE_IDS`): unknown, empty, non-string or profile-only IDs return `false` without changing values, config version or cached profiles, and `setActorConfig` rejects the whole patch when any module key is unregistered in either flat or wrapped form. The modules-engine `configVersion` advances only on a successful setter call. Species fallback/warning and known parameter merge semantics are unchanged. | Add via README "Add a behavior": definition, registration, optional config block, pure tests and parity. Checks: `behavior-modules`, `behavior-contracts`, `behavior-config`, `behavior-lifecycle`, `behavior-navigation`, `behavior-path-query`, `behavior-parity`, `scripts/check-behavior-contracts.mjs`. Gap: engine passes the whole rendered `field` in `contextFor`; not every `interrupt`/disable path is conformance-tested (inspected/sampled). |
| Traits, mood, habits, proposals: `src/behaviors/traits.js`, `mood.js`, `preferences.js`, `proposals.js` | Pure calculation functions over passed records plus small actor mutators: `ensureTraits` writes `actor.traits`; `normalizeSkills`/`normalizeHistory` etc. live in `family.js`. Mood is derived from actor needs, bonds, history and mourning; no module-scope per-actor cache. | Current: `founderTraits`, `normalizeTraits`, `ensureTraits`, `applyTraitOffsets`, `moodFor`, `applyMoodOffsets`, `normalizePreferences`, `reinforceHabit`, `decayHabits`, `activityOffset`, `scoreContributions`, `rankProposals`. Callers: engine/config and app spawn/birth. | Traits are created deterministically from UID/species, not RNG; saved through `actorrecord.js`. Feature flags keep personality/mood/activity chooser off by default. No independent lifecycle owner beyond actor attach/save. | Extend definitions/fixtures, not a new pipeline. Checks: `behavior-traits`, `behavior-traits-save`, `behavior-mood`, `behavior-preferences`, `behavior-chooser`, `personality-presets`. Gap: mood/feature timing remains integrated with engine cadence; translation fixtures cover rules, not live integration (P1 retained). |
| Pair/group/social/family: `src/interactions.js`, `family.js`, `relationships.js`, `src/behaviors/groups.js`, activity modules | `interactions.js` owns interaction definitions and the reciprocal pair/task protocol; `family.js` owns family relations, bonds, skills, history, playdates and reference pruning; `relationships.js` owns rivalry/partnership records and UID normalization; activity modules own per-activity runtime state in `actor.ai`. App owns birth/farewell orchestration. | Current: `registerInteraction`, `interactionFor`, `beginPair`, `endPair`, `breakPair`, `startTask`, `cancelTask`, `tickTask`; `setBond`, `addBond`, `teachSkill`, `pushHistory`, `schedulePlaydate`, `pruneActorRefs`; `setRival`, `clearRival`, `setPartnership`, `clearPartnership`. Callers: behavior engine, `ai.js`, `glass.js`, app removal/map/save. | Pairs are reciprocal **live references** (`ai.partner`); persistent bonds/partner/rival fields use **UID keys**. `cancelPair` releases food, invokes a state owner's `interrupt` when declared, breaks reciprocal links and resets listed states. `removeBear` releases claims and clears UID references unless `preserveRefs` is true; `removeGlassActor` releases claims and always clears them. Unsupported/unknown: direct writes outside the protocol remain; every activity's cancellation path has not been exhaustively proved (M2). | Use `registerInteraction` plus an existing activity protocol and owner cleanup; add conformance or scenario tests. Checks: `behavior-social`, `behavior-conflict`, `behavior-family`, `relationship-features`, `relationship-save`, `gifting`, `family`, `interaction-history`. Gap: centralized write ownership is not implemented; cancellation is feature-by-feature (sampled). |
| Species, genetics, rigs: `src/species.js`, `dna.js`, `config.js`, `msnrig.js`, `buddyrig.js`, `behaviorprofiles.js` | `species.js` owns the species registry/capability records and imports executable rig data; `dna.js` owns gene definitions, genome normalization, inheritance/expression and hybrid targets; `behaviorprofiles.js` owns per-species balance/schedule profiles; rig modules own typed rig arrays. | Current: `registerSpecies`, `getSpecies`, `speciesForRig`, `listSpecies`, `speciesCan`; `registerGene`, `defaultGenome`, `normalizeGenome`, `combineGenomes`, `expressGenome`, `canSpeciesBreed`; `behaviorProfile`. Callers: app spawn/birth, `ai.js`, `glass.js`, config, tests/tools. | Registry internals `defineSpecies`/`install` freeze and register entries at import; exported `registerSpecies` throws on a duplicate ID. `getSpecies` performs no warning: it silently returns its fallback record (`bear` by default, or `null` when a caller sets `fallback` to null). Warning policy belongs to behavior configuration: `warnUnknown` logs once per unknown species name per config instance and the profile resolution uses the BEAR fallback profile. Genetic inheritance draws RNG; `combineGenomes` outcomes and draw order are fixture-protected. A new body is not a JSON-only addition: rig/capabilities/assets are executable and authored separately. Deferred hybrids (`bear-msn`, etc.) are declared, not supported. | Add species through the README "Add a race" recipe, reusing an existing representation first. Checks: `species`, `dna`, `behavior-profile-completeness`, `content`, parity with an explicit scenario. Gap: rig/surface internals and all gene consumers are not audited here; a new representation needs separate design/authoring approval (M4). |
| Actor view, identity, lifecycle: `src/npc.js`, `actorrecord.js`, `actorsave.js`, app pool/spawn/remove, `glass.js` actors | App owns the live roster: `bears` array, reusable `pool`, `nextBearUid`, body handles, grabs and render meshes. `npc.js` is a read-only view over original live objects. `actorrecord.js` owns the shared saved shape; `actorsave.js` owns validation/migration/collection registration; `glass.js` owns Glass actors separately. | Current: exported `createActorView` (`soft`, `glass`, `all`, `active`, `byUid`, `homeResidents`); exported `snapshotActor`, `applyCommonActorState`, `maxActorUid`, `validateActorWorld`, `validateGameRelationships`; app-internal `spawn`, `spawnFromState`, `removeBear`, `despawnAll`. | Live identity is object identity; `byUid` scans only active actors. UIDs are game-wide, allocated by app, reserved before restore and reset only on New Game; they are not live references. `removeBear` drops carried food, releases food/portion claims, detaches behavior, destroys bodies, removes grabs and clears persistent UID refs unless `preserveRefs` is set for map/save despawns. Glass disposal sets `disposed` before releasing its lease. Unsupported: no public actor lifecycle contract; pool reuse means stale live references are invalid after removal; async Glass completion is handled but not a general retry API. | Prefer `createActorView` over `bears` vs Glass branching; add save/restore and removal tests. Checks: `actor`, `actorrecord`, `actorsave`, `adoption-save`, `save`; browser save/load evidence is historical. Gap: UID allocation, pool reuse and cross-map refs need the M5 inventory (sampled). |
| Navigation, avoidance, bounds: `src/navmesh.js`, `navdebug.js`, `avoidance.js`, `fieldshape.js` | `navmesh.js` owns the clearance grid, obstacle solids/dynamics, components, paths, ties and stats; `fieldshape.js` owns portable field boundary math; `avoidance.js` owns pure steering adjustment; `navdebug.js` owns the three.js debug mesh; `field.js` composes them. | Current: `createNavMesh` (`addSolid`, `clearSolids`, `setDynamic`, `removeDynamic`, `bake`, `isWalkable`, `nearestWalkable`, `findPath`, `lineClear`, `validate`, `stats`); `avoidanceYaw`; `fieldRadiusAt`, `fieldInside`, `fieldClamp`; `buildNavDebugObject`. Callers: `field.js`, `ai.js`, `glass.js`, launcher/app placement. | Nav is baked during field construction from the same obstacle registry used for field colliders. Dynamic obstacle entries are supported; full runtime layout rebuild/edit ownership is not. Debug rendering can be toggled without changing paths. | Add authored obstacles through the field/map-content path and re-bake; keep path/tie fixtures. Checks: `avoidance`, `fieldshape`, `nav-debug`, `content`, parity nav comparisons. Gap: dynamic reachability composition and edit-time rebuild ownership remain unresolved (M7). |
| Food, gifts, resources: `src/foodtypes.js`, `food.js`, `foodportions.js`, `src/behaviors/gifting.js`, `giftvisuals.js` | `foodtypes.js` owns food definitions/defaults/safety; `food.js` owns placed-source ripeness, claims and respawn state; `foodportions.js` owns dropped/carried portion records and IDs; `gifting.js` owns physical collection/handover; `giftvisuals.js` mirrors portions in the scene. `field.js` owns visible instances and injects the visibility callback. | Current: exported `registerFoodType`, `getFoodType`, `isSafeFood`; food-registry-returned `claim`/`release`/`releaseBear`/`consume`/`nearestRipe`/`allRipe`/`snapshot`/`restore`/`reset`; portions-registry-returned `add`/`restore`/`claim`/`release`/`take`/`nearest`/`snapshot`/`reset`; `giftingModule` behavior definition. The behavior engine exposes optional `getFood()`/`getPortions()` providers as `api.food()`/`api.portions()` (falling back to `field.food`/`field.portions` only when the provider is omitted or `null`); gifting resolves both through those APIs and does not require a rendered field object. Callers: behavior engine, app removal/map/save, field visuals. | Claims and consumption authorize by live object identity. Snapshot/restore keeps only mutable food state and authorizes portions by ID; map switches snapshot the active map and restore the target map's gifts. Carried food is converted to dropped portions on save restore. Unsupported: an entirely new risky food/action needs a handler and visual, and general inventory is not implemented. | A definition reusing an existing visual/handler is the supported case: register type, add authored source, preserve IDs. Checks: `food`, `gifting`, `content`; `save`/`relationship-save` cover dropped and carried portion conversion. Gap: every risky food semantics and visual mirror path is not covered (M8). |
| Homes and occupancy: `src/homes.js`, `homes` in `field.js`, `floratypes.js`, `family.js`, app home/birth helpers | `floratypes.js` owns home-style definitions; `field.js` owns authored home lots, door/approach data and colliders; `homes.js` owns villa meshes and occupancy instances; app owns resident/birth/overflow decisions via `actor.home` and `actorView`. | Current: exported `createAeroHomes` (`setOccupied`, `setNight`) and `getHomeStyle`; field `homes`/colliders; app-internal `homeResidents`, `chooseBirthHome` and birth helpers. | A home is a stable authored name, not a live object reference; actors store `home` strings. Occupancy display follows live residents. Doors are authored approach points and also nav solids. Unsupported: interiors, placement editing and alternate capacity rules are not implemented by modularization; capacity/overflow rules remain in `life.js`/app. | Reuse an existing home style and its door/capacity rules; authored placement changes need nav/collider validation. Checks: `content`, `family`, `behavior-family`; no dedicated occupancy test. Gap: sampled only; home/capacity edge cases are not comprehensively tested (M9). |
| Map, world and content: `src/world.js`, `mapcontent.js`, `floratypes.js`, app activation | `world.js` owns map definitions (`MAPS`), per-map mutable snapshots (`worlds`) and `activeWorld.mapId`; it reads `localStorage` at import and persists launcher/clock fields. `mapcontent.js` owns authored lots/starters; `floratypes.js` owns content definitions; app owns activation/visuals. | Current: exported `getActiveMap`, `getWorldState`, `saveLauncherPos`, `persistWorld`, `setActiveMap`; app-internal `saveCurrentWorld`, `applyMapVisuals`, `activateMap`, `requestMapSwitch`, `resetNewGame`. Callers: launcher, sky, save/load, UI, debug hooks. | Only two map IDs (`field`, `studio`) are accepted by save validation and initial map restore. A map switch is asynchronous: guarded, delayed, saves with carried-food drop, activates, then leaves the guard briefly. Inactive maps keep snapshots; only the active map simulates. Unsupported/unknown: new map IDs, dynamic map registration and concurrent switch/save policy are not implemented. | Treat `worlds` as the single world state store; a new map requires an explicit save-validation and activation decision, not just a registry entry. Checks: `content`, `save`, `actorsave`; no direct `world.js` test. Gap: import-time `localStorage` access and two-map assumptions are not isolated (M10–M11). |
| Saves, migration, storage: `src/saveformat.js`, `save.js`, `actorsave.js`, `actorrecord.js`, app save/New Game | `saveformat.js` owns envelope validation, version rejection, migration invocation and normalized clone shape; `save.js` owns IndexedDB slots and re-exports the format API; `actorsave.js` owns actor versions, collection registration, UID and relationship validation; `actorrecord.js` owns the shared saved actor shape; app owns capture/apply ordering and slot/autosave commands. | Current: exported `validateSave`, `normalizeSave`, `SAVE_FORMAT`, `SAVE_VERSION`, `listSaves`, `readSave`, `writeSave`, `removeSave`, `validateActorWorld`, `migrateActorRecord`, `maxActorUid`; app-internal `buildSavePayload`, `applySavePayload`, `resetNewGame`. | `applySavePayload` validates and normalizes before mutation, reserves game-wide UIDs, installs both world snapshots, prunes references against all loaded UIDs, replaces portions, activates the saved map, restores carried food/field food/sky/launcher, then persists the field state. Saved records deliberately exclude runtime `ai`/physics/live references. Unsupported/unknown: concurrent load/autosave/map-switch policy, rollback/transactions and retry guarantees are not defined. | Keep format and storage split; add fields only with `actorrecord`/`actorsave` version and migration decisions. Checks: `save`, `actorsave`, `actorrecord`, `adoption-save`, `relationship-save`, `history-delta-save`, `behavior-traits-save`. Gap: no test for every migration or storage failure; browser save evidence is historical (P2). |
| Scheduler, clocks, RNG: `app.js` `animate`/`frameTick`/`stepMeadowAI`/`simulateSeconds`, `sky.js` | App owns the rAF frame schedule, frame delta, pause/hidden/freeze gates, fixed-physics accumulator, map-active gating and global `Math.random` seeding. `sky.js` owns the Meadow clock (`hours`, `day`, `auto`, `speed`) and visual time. Behavior RNG resolves `Math.random` at call time. | Current: app-internal `animate(now)`, `frameTick`, `stepMeadowAI`, `simulateSeconds`; debug `__gummy.seed`/`unseed`; sky-returned `update`, `setTime`, `setAuto`, `setSpeed`, `setDay`, `setLook`. Callers: browser loop, field update, tests/harnesses. | Frame order and gates are contractually recorded in [scheduler-rng-contract.md](scheduler-rng-contract.md). Pause/hidden stop the frame path; freeze is narrower and still allows sky/field/physics. Only Meadow runs `field.update` and AI. Global RNG is shared by decisions and visuals; seeding is not whole-game determinism. Unsupported: clock extraction, independent RNG streams and fixed-step gameplay redesign. | Use the P5 contract as baseline; any cadence/RNG change needs new expectations and explicit approval. Checks: `scheduler-rng-contract` (5 source-order tests, historical), parity seeds, smoke. Gap: cross-engine and frame-rate-independent determinism are unproven. |
| Physics and movement: `src/box3d.js`, `ai.js`, `glass.js`, app forces/grab/hop | `box3d.js` owns the vendored WASM wrapper, handles and float scratch buffers; app owns Bear/Gummy body creation/destruction, force accumulation, readback, locomotion helpers, grab/throw/hop and the fixed step; `ai.js` owns Bear/Gummy decisions/locomotion requests; `glass.js` owns the rigid sphere adapter. | Current: exported `initPhysics` and its returned wrapper (`step`, `staticSphere`, `sphere`, `destroy`, `joint`, `read`, `applyForces`, `applyImpulses`); app-internal `physicsStep`, `createBearBodies`, `destroyBearBodies`, `uploadBearVelocities`, `hopBear`, `accumulateForces`, `rescuePondBear`; Glass body functions are internal to `glass.js`. | Bodies are runtime resources with explicit create/destroy; handles are not saved. The 24-body Bear/Gummy rig and batched bridge are load-bearing. Glass uses one rigid sphere, not a metaball body. Unsupported: solver internals, Box3D/WASM changes and a universal physics facade are not in scope; Box3D changes remain separately gated. | Add behaviors through existing actor operations; do not bypass batching with per-actor solver calls. Checks: `actor`, parity/Glass browser harnesses; `box3d` has no dedicated Node unit suite. Gap: solver internals and all force/readback orders are not newly audited (M6/M14). |
| Surface, pose, eyes, shadows: app `poseAndTargets`, `buildBear`, `marchSurface`, `updateSurfaces`, `writeEyeInstance`, `drawShadows` | App owns the numeric surface field sampler, per-actor mesh buffers, stable lattice/hysteresis, build order/budget, eye instancing and shadow drawing. `field.js` owns scene/shadow composition around it. | Current: internal `buildBear`, `poseAndTargets`, `updateSurfaces`, `writeEyeInstance`, `drawShadows`; no exported surface API. Callers: frame loop and render path. | Surfaces are rebuilt for grabs, explicit need or shape change; build order prioritizes grabs then deformation. `updateSurfaces` caps a frame at 20 builds and checks the 6 ms `SURFACE_BUDGET_MS` budget only after at least two builds, so when two or more builds are queued the first two always run and a frame can exceed 6 ms. Eye and shadow instances are pooled. Unsupported: buffer/scheduler ownership extraction and a general numeric surface API are not implemented; the stable lattice is not a test fixture yet. | Change only with a numeric fixture and visual/performance evidence; preserve 24-body construction and batching. Checks: browser regression/Glass suite and performance profiles only; no committed numeric surface test. Gap: construction/scheduler were sampled, not fully verified (M14). |
| Glass/Studio actor animation: `src/glass.js`, `msn.js`, app Gummy poses | `glass.js` owns Glass Meadow actors, skinned instance cloning, animation mixer/actions, rigid body sync, grabbing and disposal; `msn.js` owns the Studio MSN prototype (model, panel, hover/select/drag, mixer, dispose); app owns Gummy poses and Studio cast visibility. | Current: exported `createGlassColony` with factory-internal `makeActor` and returned `restore`, `snapshot`, `state`, `update`, `clear`, `removeActor`, `pick`, `beginDrag`, `drag`, `endDrag`, `cancelDrag`, `blastImpulse`, `spawnChild` and the test/debug setters (`setNeed`, `setBond`, `setStage`, `setPosition`, `walkTo`, `force*`); exported `createMSNPrototype` with returned async `load` (self-invoked during setup; app callers do not call it), `update`, `play`, `hitTest`, `beginDrag`, `drag`, `endDrag`, `dispose`, `state`. Callers: app map activation, save/load, pointer and UI. | Glass restoration creates live actors, applies the shared record, then asynchronously loads the authored GLB. Completion checks `active`/`disposed` and releases the lease if gone; failure disposes instance resources and records `error`. No automatic retry path is evident in the inspected loader. `clear`/`removeActor` release before removing. Unsupported: one renderer/picking path for skinned and metaball actors; silent fallback to a different representation. | Reuse species/asset IDs and the colony/Studio factories; a new representation is species/asset work. Checks: Glass tests/browser parity (`glass-test`, `glass-fast-parity`, regression); `msn` has no dedicated Node suite. Gap: failure/retry and rapid-map-change behavior need live coverage (M4–M6/M14). |
| Assets, catalog, leases: `src/assets.js`, `assetstore.js`, `assets/README.md`, `assets/catalog.json` | `assets.js` owns manifest schema/validation, GLTF inventory verification and injected loading; `assetstore.js` owns catalog source records, coalesced loading, ref counts and eviction; consumers own cloned instances. | Current: `validateAssetManifest`, `normalizeAssetManifest`, `loadManifestedGltf`, `gltfInventory`; `createAssetStore` (`acquire`, `preloadGroup`, `evictUnused`, `status`), `disposeAssetSource`, `disposeInstanceSkeletons`, shared `assetStore`. Callers: `glass.js`, app asset status, tests. | `acquire` reserves a source, returns an idempotently releasable lease, and eviction excludes referenced/pending sources. Consumers clone skeletons/materials and must not dispose shared geometry/textures. Unsupported: a second cache or generic asset framework; guaranteed teardown/recreation of all consumers is not provided. | Add a catalog/manifest entry and use `acquire`/release; keep source/clone ownership. Checks: `asset`, `asset-loader`, `asset-store`, `glb-inventory`. Gap: failed-load retry, late completion and partial-construction combinations are not exhaustively covered (M15). |
| Field terrain, pond, water: `src/field.js` | `buildField` owns terrain, pond/bank, water shader/uniforms, colliders, nav composition, food sources, portions, homes, vegetation placement, emotes and visibility. The returned object exposes mixed simulation queries and render objects. | Current: returned `nav`, `homes`, `colliders`, `food`, `portions`, `foodSources`, `waterSpots`, `pond`, `update`, `splash`, `emote`, `setCannon`, `validateLayout`, `setNature`, `setVisible`, etc. Callers: app, behavior engine, launcher, gift visuals, save. | Built once at boot and toggled visible per map; it is app-lifetime, not recreated on map switch. `field.update` is Meadow-only and advances sky/wind/horizon/water/emotes. Unsupported: splitting water/terrain into an independent host without inventorying shared uniforms, shoreline, colliders and camera dependencies. | Extend authored content through `mapcontent.js`/`floratypes.js`; add a query only for a concrete consumer. Checks: `content`, `fieldshape`, `nav-debug`, browser regression. Gap: broad public API and cross-owner composition remain; water/reflection internals were not audited (M16). |
| Vegetation, scenery, wind, sun: `src/trees.js`, `bushes.js`, `backdrop.js`, `horizon.js`, `wind.js`, `sunlight.js`, `studiohouse.js` | Each named factory owns its meshes, batching/instancing, shader hooks and controls; `field.js` composes them and owns authored lots. `sunlight.js` derives a small sun state from sky; `wind.js` owns shared wind state. | Current: `createTreeCollection`, `createBushCollection`, `createBackdrop`, `createHorizon`, `createWind`, `createSunState`/`updateSunState`, `createStudioHouse`, `createStudioReturnPortal`; field `setNature`, `setWind`. Callers: `field.js`, app map visuals. | Collections are constructed from authored lots and updated by field/sky; instancing and shared wind are load-bearing. Unsupported: per-frame per-blade/per-branch CPU loops and a renderer-neutral scenery graph. | Add a species/lot through `floratypes.js` and the collection factory; preserve batching and reflection layers. Checks: `content` only; visual captures are historical. Gap: shader/reflection internals and wind coherence are not newly inspected (M16). |
| Sky, lighting, weather: `src/sky.js` | `createSky` owns the sky dome, sun/moon lights, fog/exposure/night/mist values, named looks, visual time, farewell stars and the simulation hour accumulator; app owns persistence and map visibility. | Current: `createSky` plus `update`, `setTime`, `setDay`, `setAuto`, `setSpeed`, `setLook`, `setVisible`, `setShadows`, `addFarewellStar`, read-only getters. Callers: app `applyMapVisuals`/save, field `update`, effects. | Created once at boot; Studio only hides it and does not advance its clock. Named saved look wins over saved hour and disables auto. Clock semantics are in the [scheduler/RNG contract](scheduler-rng-contract.md). Unsupported: independent clock extraction or safe sky recreation. | Add a look/preset only through existing `setLook`/data; do not split visual and simulation time casually. Checks: `scheduler-rng-contract`, browser clock checks (historical). Gap: weather is visual state, not a simulation system; shader internals not audited (M13/M16). |
| Effects, graphics, materials: `src/effects.js`, `graphics.js`, app profiles/toon/quality | `effects.js` owns the composer, render targets, passes and mode selection; `graphics.js` owns pure descriptor normalization plus `localStorage`/URL reads and DOM panel construction; app owns graphics state, presets, quality application, toon materials and renderer settings. | Current: `createEffects` with returned `render`, `resize`, `setMode`, `setQuality`, `setEnabled`, `setTimeOfDay`, `setBloomScale`, `setExposureScale`, `setDof`, `setFocus`, `stats`, `state`; exported `normalizeGraphics`, `readGraphics`, `createGraphicsPanel`; app-internal `applyGraphics`/`applyProfile`/`setToonMode`. | Effects are created once during boot; the returned API has no public `dispose`. Composer targets/passes are not proven safe to recreate. Graphics panel owns DOM controls but no explicit listener teardown. Unsupported: assuming the effects factory is reusable or that a second graphics layer can own the same settings. | Add a setting through `GRAPHICS_GROUPS` and app application; keep pure normalization separate from storage/DOM. Checks: no dedicated graphics/effects test; `debug-api` covers hook uniqueness only. Gap: teardown/recreation and listener lifecycle are unverified (M17/M15). |
| Input, picking, camera, possession: app pointer/keyboard handlers, `launcher.js` pointer API, `msn.js` picking, camera functions | App owns global pointer/keyboard listeners, gesture priority, camera state/motion, grabbing, possession, selection and UI routing; `launcher.js` owns its own aim/move gestures; `msn.js` owns Studio picking/drag; Glass owns Meadow picking. | Current: app-internal `pointerdown`/`pointermove`/`pointerup`/`pointercancel`/`keydown`/`keyup`, `pickPortal`, `pickMsn`, `makeGrab`/`endGrab`, `applyCamera`, `exitPossession`; launcher-returned `pointerDown`/`pointerMove`/`pointerHover`/`pointerUp`, `aimAt`, `fire`; Glass-returned `pick`, Studio-returned `hitTest`. | Listeners are app-lifetime and not centrally torn down. Map change releases grabs/pointers; possession exits on map/cast changes. Unsupported: a unified input stack, renderer-neutral input events in simulation rules, and phone/touch coverage beyond existing handling. | Add a gesture only after inventorying UI/launcher/portal/actor priority; expose intent at the composition boundary. Checks: browser regression and historical pointer/map probes. Gap: full listener lifecycle and unsupported hardware are unverified (M19). |
| UI, menu, settings, roster, save panels: app DOM regions, `index.html`, `relationshipview.js`, `thoughtbubble.js`, `aidebug.js` | App owns menu/settings/save/roster markup wiring, commands and most DOM state. `relationshipview.js` builds a read-only selected-actor model; `thoughtbubble.js` owns overlay elements/keyed rows and has `destroy`; `aidebug.js` owns its debug panel/DOM. | Current: exported `buildRelationshipView`, `createThoughtBubbleOverlay` (`update`, `refresh`, `state`, `hide`, `destroy`), `createAIDebug`; app-internal panel/menu/save functions and `__gummy` hooks. | Overlays own their created elements; the relationship model copies data and must not be treated as live actor state. App panels are long-lived and listener teardown is not exhaustively owned. Unsupported: extracting markup/styles as if it also moved state ownership; a general UI framework. | Prefer the relationship-view precedent: simulation decides, panel renders and owns DOM. Checks: `relationshipview`, `thoughtbubble`, `debug-api`. Gap: menu/save/settings listener lifecycle and mobile layout are not fully audited (M17/M20). |
| Toys, fireworks, cannon: `src/launcher.js`, app blast/rocket/particle regions | `launcher.js` owns the cannon factory, placement/aim/fire state and its own meshes/UI bindings; app owns fireworks/rocket pools, blast impulses, particle effects and the Explode control. | Current: exported `createLauncher` with returned `build`, `layout`, `update`, `pointerDown`/`pointerMove`/`pointerHover`/`pointerUp`, `setPosition`, `setMapState`, `aimAt`, `fire`, `state`, `findSpot`; app-internal `launchFirework`, `burstAt`, `applyBlastImpulse`, burst queue and particle pools. | Launcher is created once at boot and receives map state on activation; it is not recreated per map. Projectiles/particles are app runtime pools, not saved. Cannon colliders are runtime physics handles rebuilt on placement/map. Unsupported: a universal toy engine and changed cooldown/ballistics/containment. | New toys should use existing actor impulse operations and launcher/UI seams, not copied app globals. Checks: browser regression and historical cannon probes; no dedicated launcher Node test. Gap: cleanup and cross-representation impulses are not exhaustively tested (M21). |
| Diagnostics, testing, tooling: app `__gummy`, `scripts/`, `tests/`, harnesses | App owns the `window.__gummy` debug object and booted gate; scripts own HTTP smoke, parity, browser/CDP harnesses and contract checkers; `tests/` owns Node unit/contract tests; `aidebug.js` owns the in-game AI panel. | Current: `__gummy` methods (map, sim, seed/unseed, save/load, behavior, family, actors, assets, particles, input helpers, etc.), `scripts/smoke.mjs`, `behavior-parity.mjs`, `browser-regression.mjs`, `scheduler-rng-characterization.mjs`, `check-behavior-contracts.mjs`, `node --test tests`. | Debug hooks are production-accessible and stable only by convention; `booted` gates some commands. Harnesses are disposable-profile/browser-tooling evidence, not runtime contracts. | Add focused fixtures next to the affected rule; add a hook only with a concrete consumer and a contract test. Checks: `debug-api`, `ci-policy`, `scheduler-rng-contract`, behavior parity/contracts. Gap: public debug inventory and fixture portability are incomplete; source-order tests are not general architecture checks (M0/M18/M22). |
| Audio, inventory, village/jobs/editor, additional maps | No implemented general audio/inventory/village/job/editor/additional-map system was established by this inspection or the prior audit. Future roadmap features are not existing extension APIs. | None identified as a public runtime contract. Animation `.play()` calls are not evidence of an audio subsystem. | Unverified/future. Absence is not proven repository-wide. | Treat as new-system design under the M23 admission checklist: owner, stable IDs, commands/queries, time domain, persistence, interruption and presentation boundary before implementation. No specific checks; gap: unverified/future, no implementation claim. |

## Identity, state and lifecycle rules

### Live references versus UIDs

- **Live references** are used for current reciprocity and authorization:
  `ai.partner`, `field.food` claim objects and `field.portions` claim objects.
  `interactions.js` `endPair` checks `b.ai.partner === a`; `food.js` `consume`
  requires `source.claim === bear`; `foodportions.js` `take` requires
  `portion.claim === actor`.
- **UIDs** are persistent game-wide identities used by saves, family bonds,
  partner/rival records, guardians and parentage. `actorrecord.js` writes `uid`;
  `actorsave.js` validates positive, duplicate-free UIDs and reciprocal
  relationships; `saveformat.js` rejects duplicate actor and gift IDs.
- **Actor view** in `npc.js` returns the original live actors in a fresh array.
  It is not a copied roster and does not make inactive snapshots live.
- App `partnerRecord` is the explicit bridge from a UID to either a live actor or
  an inactive map snapshot; callers should not assume `actorView.byUid` sees
  inactive maps.
- `removeBear` clears UID references unless `preserveRefs` is set. Map/save
  despawns use `preserveRefs: true` because inactive snapshots retain UID-based
  cross-map references. A real removal drops carried food and releases claims.
- Pool reuse preserves JavaScript object identity. A reference to a removed or
  repurposed pooled actor is stale even if a later actor occupies the same slot.

### Actor lifecycle

1. **Create/restore.** `spawn` claims a pooled Bear/Gummy or creates one, assigns
   a UID (or uses a reserved one), builds bodies and surfaces. Internal Glass
   `makeActor` creates its root, actor record, AI link and rigid body, then starts
   asynchronous model loading. `spawnFromState` restores a saved Bear/Gummy and
   applies the shared record.
2. **Attach.** The behavior engine attaches `actor.ai` on the first tick if absent.
   Glass attaches through its shared engine at construction.
3. **Interrupt.** Grabs/pond entry set interruption and release claims in the AI
   host; engine `cancelPair` owns generic pair cleanup; `breakPair` is the
   representation-facing primitive.
4. **Leave/detach.** `removeBear`/Glass `removeActor` detach behavior, destroy
   bodies, release claims/leases and mark inactive/disposed. Map despawn is not a
   real removal and preserves persistent references.
5. **Restore.** Save apply reserves UIDs before spawning any actor, then activates
   the map, restoring snapshots and portions in the recorded order.
6. **Release.** Bear body handles and surface resources are runtime-only; Glass
   releases its `assetStore` lease and instance skeletons/materials on disposal.
   Field/sky/effects/launcher are app-lifetime and are not recreated per actor or
   map.

### Map and session lifecycle

- `requestMapSwitch(id)` refuses re-entry and same-map requests, then after a
  220 ms timer calls `saveCurrentWorld({ dropCarried: true })` before
  `activateMap(id)`. The switch guard remains for another 260 ms. Callers poll
  `g.map().id`; the request is not synchronous.
- `activateMap` releases grabs, clears pointers/drop queue, despawns live actors
  with preserved references, clears Glass, sets the active map, applies visuals,
  restores camera/launcher/portions, respawns actors, and restores or seeds Glass.
  The initial boot skips despawn/clear because no live roster exists yet.
- Only the active map simulates. Inactive maps keep the snapshot saved when last
  left. Save/load uses the same activation path.
- New Game despawns/clears, resets both world snapshots, food and portions, resets
  the UID allocator to 1 and activates the field. New Game isolation is a session
  reset, not a schema change.

### Save capture and apply order

Current order in `app.js`:

```text
buildSavePayload
  saveCurrentWorld()                  capture live active map
  normalizeSave({ format, version, savedAt, mapId, sky, worlds })
applySavePayload(raw)
  normalizeSave(raw)                  validate/migrate/clone before mutation
  reserveGameUids(payload.worlds)     reserve all loaded identities
  install both world snapshots
  prune references against all loaded UIDs
  replace portions from both snapshots
  activateMap(payload.mapId)
  restore carried food as dropped portions
  restore field food
  restore sky look/time and launcher
  persistWorld('field')
```

`saveformat.js` owns validation/normalization; `save.js` owns storage only. A
future change to capture/apply order is a save-contract change and needs explicit
approval and tests; this document does not define a transaction or rollback
guarantee.

### Scheduling, clock and RNG

Use [scheduler-rng-contract.md](scheduler-rng-contract.md) as the baseline. Key
ownership facts for extension work:

- `animate` owns the frame path and gates pause/hidden before simulation.
- `frameTick` and fixed physics have different cadences and must not be conflated.
- `sky.js` owns the Meadow clock; `field.update` advances it only on the Meadow.
- Behavior RNG is `() => Math.random()`, resolving the current global at call time;
  `__gummy.seed` replaces that global. Visual systems can consume the same stream.
- `__gummy.sim(sec)` intentionally bypasses `field.update`, sky advancement and
  rendering; it is a harness cadence, not the normal loop.

## Supported extension operations

These are uses of existing seams. They still require the normal approval and
verification for the affected layer; a recipe is not a general plugin promise.

| Extension | Current supported path | Required ownership discipline | Representative checks |
| --- | --- | --- | --- |
| New behavior module | `defineBehaviorModule` + `engine.js` registration + optional `config.js` block + `BEHAVIOR_CONTRACTS` declaration | Keep per-actor state in `actor.ai`; preserve opportunity order; do not add module-scope mutable state; declare disable policy honestly | `behavior-modules`, `behavior-contracts`, `behavior-config`, parity |
| Host path and navigation query | Optional `getNavigation` and `findPath` callbacks in `createBehaviorModules` + app composition forwarding the current `field.nav` | `api.navigation` resolves the provider each query and preserves navigator identity; a provider `null` is authoritative. `findPath` wins for `api.pathTo` and returns its exact result; otherwise the resolved navigator's `findPath` keeps its receiver. Omitted providers keep the field/nav fallback; errors propagate | `behavior-navigation`, `behavior-path-query`, `behavior-emote`, browser parity trace |
| World resource queries | Optional `getHomes` / `getFood` / `getWaterSpots` callbacks in `createBehaviorModules` + app composition forwarding the current `field.homes` / `field.food` / `field.waterSpots` | `api.homes` / `api.food` / `api.waterSpots` resolve the provider every query and return the backing reference by identity; provider `null`/`undefined`/empty values are authoritative. Omitted providers keep the field fallback; existing guards, claim/consume identity and RNG order stay unchanged; errors propagate | `behavior-world-resources`, `behavior-family`, `behavior-conflict`, `behavior-social`, parity |
| New social/family interaction | `registerInteraction` + existing pair/task protocol or a module using it | Preserve reciprocal live references; define cancel/finish/removal cleanup; use UID keys for persistent fields | `behavior-social`, `behavior-family`, `relationship-features` |
| New species using an existing representation | `registerSpecies` + `behaviorprofiles.js` + existing rig/asset representation | Reuse a rig/representation; do not route a new race through the Bear fallback; declare deferred hybrids | `species`, `behavior-profile-completeness`, parity race scenario |
| New food type using an existing visual/handler | `registerFoodType` + authored source in map content + existing claim/consume behavior | Keep stable source/portion IDs; authorize by live identity; snapshot only mutable state | `food`, `gifting`, `content` |
| New asset | `assets/catalog.json` + manifest + `assetStore.acquire`/release | Clone instances; never dispose shared source geometry/textures; no second cache | `asset`, `asset-loader`, `asset-store` |
| New home using an existing style | Home style/lots in `floratypes.js`/`mapcontent.js` + field composition | Preserve authored name, door/approach, capacity and nav/collider validation | `content`, `family` |
| New setting control | Descriptor in `GRAPHICS_GROUPS` + app application | Keep pure normalization separate from storage/DOM; preserve Custom/reset semantics | No dedicated test; add one if behavior changes |
| New debug/test hook | Existing `__gummy` pattern or a committed test/script | Add only with a consumer and contract test; do not make a debug hook a production dependency | `debug-api`, `ci-policy` |

Currently unsupported or decision-gated (do not infer from a module's existence):

- Generic disable/toggle for all behavior modules. `contracts.js` distinguishes
  `layered`/`profile-only` configuration and `finish-current`, `feature-only`,
  `legacy-unverified`/`unsupported` disable policies; essential
  rest/food/water/wander/social/family/flee are not generic toggles.
- Centralized pair/partner/task writes. Direct writes remain distributed; M2 must
  inventory them before choosing ownership.
- A new body/rig, hybrid representation, or runtime mesh blend. A supported new
  species using an existing representation is different from a new authored body.
- A new risky food/action, general inventory, shops/equipment, audio, village/jobs
  or editor. These are M23 design work, not existing APIs.
- New map IDs, dynamic map registration, dynamic nav/layout editing or concurrent
  save/map policy. Two map IDs and the current activation order are assumed.
- Safe re-creation/teardown of effects, field, sky, launcher or the whole renderer.
  Effects has no public `dispose`; field/sky are app-lifetime.
- A universal ECS, dependency-injection container, plugin loader, event bus,
  engine-neutral scene graph or generalized physics facade.

## Dependency boundaries

- Pure rule modules should continue to avoid DOM, three.js, storage and physics
  where they already do: `behaviors/preferences.js`, `behaviors/proposals.js`,
  `family.js`, `relationships.js`, `fieldshape.js`, `avoidance.js`, and the
  numeric part of `navmesh.js`.
- `dna.js` imports `species.js`, which imports executable rig data. Treat genetics
  as portable rules with a non-neutral species/representation dependency, not as
  standalone JSON.
- Behavior modules receive `field` and actor/adapter callbacks. Do not introduce
  renderer objects into rule calculations merely because the field currently
  exposes them. M1's path-query callback and M1b's navigation provider are
  implemented; the remaining capability narrowing is proposed, not a completed
  field-independent host.
- Render modules may depend on three.js, shader uniforms and shared scene objects.
  Consumers clone skinned assets and must not dispose shared source resources.
- Persistence dependencies point one way: `save.js` → `saveformat.js` →
  `actorsave.js` → shared rule modules; app composes capture/apply. Do not create a
  second save store or a second world store.
- `world.js` currently reads browser `localStorage` at import. Pure/headless code
  must not depend on that side effect; M10 is the proposed hydration boundary.
- Physics adapters must not be hidden behind generic per-actor wrappers that lose
  batching, handles or pooled buffers.

## Existing checks and evidence gaps

These are existing checks and harnesses, not M0 executions unless explicitly
noted. Prior passing counts are historical. No game, browser, physics, Blender or
performance run was performed for this document.

| Area | Existing check |
| --- | --- |
| Behavior admission/config/modules | `tests/behavior-modules.test.mjs`, `behavior-contracts.test.mjs`, `behavior-config.test.mjs`, `behavior-lifecycle.test.mjs`, `scripts/check-behavior-contracts.mjs` |
| Traits/mood/preferences/proposals | `tests/behavior-traits.test.mjs`, `behavior-traits-save.test.mjs`, `behavior-mood.test.mjs`, `behavior-preferences.test.mjs`, `behavior-chooser.test.mjs`, `personality-presets.test.mjs` |
| Social/family/relationships | `tests/behavior-social.test.mjs`, `behavior-family.test.mjs`, `behavior-conflict.test.mjs`, `relationship-features.test.mjs`, `relationship-save.test.mjs`, `family.test.mjs`, `interaction-history.test.mjs` |
| Species/genetics | `tests/species.test.mjs`, `dna.test.mjs`, `behavior-profile-completeness.test.mjs` |
| Actor identity/save | `tests/actor.test.mjs`, `actorrecord.test.mjs`, `actorsave.test.mjs`, `adoption-save.test.mjs`, `save.test.mjs` |
| Navigation/layout/content | `tests/avoidance.test.mjs`, `fieldshape.test.mjs`, `nav-debug.test.mjs`, `content.test.mjs`, `behavior-navigation.test.mjs` |
| Food/gifts/portions | `tests/food.test.mjs`, `gifting.test.mjs`; save tests cover carried/dropped portions |
| Assets | `tests/asset.test.mjs`, `asset-loader.test.mjs`, `asset-store.test.mjs`; `scripts/glb-inventory.mjs` |
| Scheduler/RNG | `tests/scheduler-rng-contract.test.mjs`; `scripts/scheduler-rng-characterization.mjs` |
| Debug/UI read models | `tests/debug-api.test.mjs`, `relationshipview.test.mjs`, `thoughtbubble.test.mjs` |
| Browser/parity/smoke | `scripts/behavior-parity.mjs`, `behavior-browser-parity.mjs`, `browser-regression.mjs`, `glass-test.mjs`, `glass-fast-parity.mjs`, `smoke.mjs` |

Known evidence gaps for this contract:

- No direct committed Node test covers `world.js` import-time storage or map
  activation sequencing; browser save/map evidence is historical.
- No dedicated test covers effects/graphics teardown, composer recreation,
  launcher cleanup, UI listener teardown or input hardware variants.
- The surface numeric kernel and stable lattice have no committed headless fixture;
  surface/scheduler claims rely on sampled source and historical browser checks.
- Behavior toggle cleanup is proven for selected policies (notably mate), not for
  every declared `legacy-unverified` or `feature-only` module.
- Every activity's interruption/removal path, partial async actor loading and
  concurrent save/map/autosave behavior remain inspection gaps (M2/M5/M12).
- Cross-engine, frame-rate-independent and whole-game determinism are not
  established by the existing RNG/parity fixtures.
- This document is source inspection plus a documentation consistency pass. It is
  not independent review, runtime verification or acceptance.

## Change-touch recipes

Before changing a family:

1. Find the authoritative owner in the table and the actual callers; do not edit a
   mirror (`giftvisuals`, render meshes, DOM panel) as if it owned simulation state.
2. Decide the state class: persistent field, runtime session field or render/host
   resource. Persistent changes need `actorrecord`/`actorsave`/`saveformat` review
   and a version/migration decision; render changes need disposal/ownership review.
3. Trace live references and UIDs separately. A new persistent link uses a UID and
   must be validated/pruned; a new current interaction may use a live reference but
   must define reciprocal cleanup.
4. Trace creation → activation → interruption → removal/leave → restore → release.
   If any transition is unsupported, say so and stop rather than inventing a
   fallback.
5. Map requirements to existing checks first. Add a focused fixture only for an
   uncovered rule; add browser/render checks only when the affected layer needs
   them. No general import-ban or plugin framework.
6. Update this table and the owning module README when ownership, public
   operations, lifecycle or extension steps change. Keep proposed APIs out of the
   current-operations column until they exist.
