# Supported debug and extension API inventory

Status: **H1/M22a source-inspected inventory and recipe index.** This document
inventories the current `window.__gummy` surface and the extension seams that
already have tests or explicit unsupported dispositions. It does not add a
runtime API, plugin loader, registry, import-ban framework or new test.

Baseline: `HEAD f4f7c89`, clean working tree before this documentation change.
Evidence labels:

- **Source-inspected** — the named source, exports and immediate callers were
  read at the baseline. This is not runtime execution.
- **Existing test/fixture** — a committed Node test, harness or contract checker
  named below already exists; this document did not rerun it as new evidence
  unless the verification section says so.
- **Host-run** — a command was executed for this step and its result is recorded
  in the return report.
- **Unverified** — no committed consumer or host proof was established here.

The authoritative ownership table remains
[system ownership and extension contracts](system-ownership-contracts.md). The
recipes below use existing seams; they are not a general extension promise.

## 1. Scope and stability

- `window.__gummy` is a production-accessible debug object with a single object
  literal in `src/app.js`. Its names are stable by convention and by the
  `debug-api` test, not by semantic versioning. There is no deprecation policy,
  typed contract or versioned debug schema.
- Debug hooks must not become gameplay dependencies. A production path may expose
  state to a hook, but simulation rules must not import or call
  `window.__gummy`. Hooks may be absent in headless modules; browser scripts own
  their own booted checks.
- A new debug hook is justified only by a concrete consumer (a committed test,
  script or reproducible manual probe), plus `tests/debug-api.test.mjs` for the
  object shape. Many existing hooks do not have a committed consumer; they are
  retained as manual/debug surfaces rather than claimed stable test APIs.
- `booted` is a mutable field set by `src/app.js` after boot. Not every hook
  checks it. Hooks that read live field, AI, Glass or renderer objects return
  `null`, `false`, `[]` or a no-op when those objects are absent. Treat `booted`
  as a caller-side precondition, not a universal guard inside each hook.
- `lastMap` is not an object-literal key. It is assigned dynamically after a
  completed map switch (`window.__gummy.lastMap = id`) and is used by
  `scripts/race-test.mjs`; it is included in the inventory with that caveat.
- Supported extension seams are the existing module registries, authored data,
  pure read models and explicit app composition points listed in §3. A recipe is
  not authorization to add a framework, a second cache, a general import ban or a
  new gameplay system.

## 2. Debug API inventory

The names below are exactly the top-level keys in the `window.__gummy` object
literal at the baseline, plus the nested `msn` keys and the dynamically assigned
`lastMap`. `tests/debug-api.test.mjs` asserts one registration, more than 100
top-level names, no duplicate names and unique nested `msn` names.

| Category | Exact hooks | Current owner / delegate | Mode | Gate and representative consumers | Caveat |
| --- | --- | --- | --- | --- | --- |
| Bootstrap and global controls | `booted`, `seed`, `unseed`, `sim`, `freeze` | `src/app.js` frame/debug region | `booted` field; `seed`/`unseed` replace global `Math.random`; `sim` advances physics/harness ticks; `freeze` sets a frame gate | No internal booted gate. `scripts/scheduler-rng-characterization.mjs` uses `freeze`/`sim`; `scripts/gifting-test.mjs` and `social-test.mjs` use `seed`; `scripts/stars-test.mjs` uses `sim`. | `seed` is shared global state and is not whole-game determinism. `sim` deliberately bypasses `field.update`, sky advancement and rendering. |
| Actor, roster and identity reads | `bears`, `roster`, `rig`, `family`, `lineage`, `relationships`, `traits`, `personalityTraits`, `genome`, `species`, `gummy`, `life` | `src/app.js` composition; `src/npc.js` actor view; `src/rosterview.js` and `src/relationshipview.js` read models | Read-only by intent; `bears` exposes the live array and `rig` exposes shared typed arrays | Require actors or booted game state for meaningful output. `scripts/race-test.mjs` consumes `bears`, `genome`, `gummy`, `species`, `selectBear`; browser/Glass scripts consume `bears`. | Returning a live object does not authorize mutation. `bears` is pool-backed and identity can be stale after removal. Roster/relationship output is a display read model, not save state. |
| Actor selection and possession | `selectBear`, `selectGlass`, `possess`, `exitPossession`, `possessed`, `possessInput`, `guardianFollow` | `src/app.js` selection, camera and possession regions | Mutating selection/possession/input; `possessed` read-only | Meadow actor/possession paths; `scripts/race-test.mjs` uses `selectBear`, `possessInput`, `possessed`, `guardianFollow`. | Selection and possession are app UI/session state, not simulation rules. No unified input stack or touch-hardware proof is implied. |
| Behavior and AI reads | `behavior`, `behaviorEngine`, `behaviorConfig`, `dispositions`, `activityProposals`, `activityDecision`, `departures`, `routines`, `playdates`, `familyTask`, `ai`, `aiPlan`, `aiDebug`, `stars`, `fading`, `starsBlock`, `mourning`, `mourningLabel`, `adoption`, `guardian`, `glassAdoption`, `glassGuardian`, `skyFarewells`, `farewellVisuals`, `farewellDetails`, `mood`, `thoughtState` | Behavior engine/modules (`src/behaviors/`), `src/ai.js`, app farewell regions, `src/aidebug.js` | Read-only snapshots (most return detached copies; some return engine/config identity) | Require a live engine/actor/field; `scripts/behavior-browser-parity.mjs`, `social-test.mjs`, `thought-test.mjs`, `preferences-test.mjs`, `departure-test.mjs`, `stars-test.mjs`, `mourning-test.mjs` and `race-test.mjs` use representative hooks. | Feature layers are off by default. `behaviorEngine`/`behaviorConfig` expose engine identity/version, not a mutation API. `aiDebug` is an in-game panel read. |
| Behavior configuration and AI mutation | `setBehaviorModule`, `setBehaviorFeature`, `activityPreference`, `clearDepartures`, `socialFeature`, `thoughts`, `aiRoute`, `setAI`, `aiStall`, `directive`, `directives`, `cancelDirectives`, `setMood`, `setBearState`, `starsAdvance`, `gummyReact` | Behavior engine/config, `src/ai.js`, app debug adapters | `directives` reads directive state; the rest mutate configuration, runtime AI or a Gummy reaction | `scripts/chooser-test.mjs` uses `activityDecision`; `scripts/preferences-test.mjs` uses `activityPreference`; `scripts/social-test.mjs`/`thought-test.mjs` use `behaviorConfig`; `scripts/stars-test.mjs` uses `starsAdvance`; `scripts/race-test.mjs` uses directive/AI hooks and `gummyReact`. | Config setters accept only source-registered layered IDs and reject unknown/profile-only IDs. Test mutators can create runtime-only state that is not saved. Disabling a module does not prove cleanup for every activity. |
| Food, home and portion resource reads | `food`, `foodSources`, `homes`, `portions`, `carried`, `giftVisuals`, `foodRegistry`; `foodReset` mutates | `src/app.js` -> `src/field.js` food/portion registries, `src/giftvisuals.js` mirror | Read-only snapshots except `foodReset` (restores every source) | `scripts/social-test.mjs` reads `portions`; `scripts/gifting-test.mjs` reads `giftVisuals`; `scripts/race-test.mjs` reads `fieldInfo`; `tests/food.test.mjs`, `gifting.test.mjs`, `resource-extension.test.mjs` cover the registries. | `foodRegistry` returns the live registry. Claims authorize by live identity; presentation mirrors are not owners. `foodReset` changes runtime ripeness only. |
| Social, family and relationship test mutators | `teach`, `setBond`, `forceSocial`, `familyPlay`, `familyMeal`, `familyLesson`, `forceInvite`, `forceVisit`, `forceConflict`, `gift`, `giftByUid`, `socialByUid`, `groupByUids`, `separate`, `forceMate`, `forceBirth` | `src/interactions.js`, behavior modules, app debug adapters | Mutating runtime state and, for some paths, persistent actor records/history | Representative browser scripts: `social-test.mjs`, `gifting-test.mjs`, `race-test.mjs`; focused Node tests own the underlying protocols: `behavior-social`, `behavior-family`, `behavior-conflict`, `gifting`, `activity-extension`, `interaction-entry`, `social-cancellation`. | These are test conveniences, not a second interaction API. Live references and UID relationships still follow the ownership contract; pair/claim cleanup is feature-by-feature. |
| Needs, life and aging test mutators | `setHunger`, `setThirst`, `setStay`, `stay`, `setHealth`, `setEnergy`, `setSocial`, `setAffection`, `setAge`, `setStage`, `setPregnant` | `src/app.js` actor/debug region; `src/life.js` and actor stage helpers | `stay` reads; the rest mutate live actor state | `scripts/race-test.mjs` uses `setHunger`; `scripts/stars-test.mjs` uses `traits`/`setTime`; actor tests cover the underlying life rules. | Mutators clamp or reject some values, but do not make runtime state persistent. Stage changes can be deferred while grabs/airborne/pond state blocks them. |
| World, field and map reads | `map`, `world`, `fieldInfo`, `navPath`, `navStats`, `portal`, `sun`, `shadows`, `lastMap` (dynamic) | `src/app.js`, `src/field.js`, `src/sky.js`, launcher/portal composition | Read-only | `scripts/race-test.mjs` reads `fieldInfo`, `lastMap`; `scripts/browser-regression.mjs` reads `map`; many scripts poll `g.map().id`. | `navPath` returns the live nav result (including `null`), not a pathfinder API. `lastMap` exists only after the first completed map switch. |
| World and environment mutation | `setMap`, `setMeadowPartVisible`, `hideClouds`, `setWind`, `setNature`, `splash`, `emote`, `setMist`, `setGrassVisible`, `setWaterCellScale`, `setTime`, `setSkyLook`, `navDebug` | `src/app.js`, `src/field.js`, `src/sky.js` | Mutating presentation/session state; `setMap` is async | `scripts/browser-regression.mjs`, `chooser-test.mjs`, `departure-test.mjs`, `gifting-test.mjs`, `preferences-test.mjs`, `race-test.mjs`, `scheduler-rng-characterization.mjs`, `soak-test.mjs`, `social-test.mjs`, `stars-test.mjs`, `uid-test.mjs` use `setMap`; `perf-profile.mjs` uses `setNature`; `stars-test.mjs` uses `setTime`. | `setMap` requests a switch and returns the current map id immediately; callers must poll `map().id`. No dynamic map registration, visual pond/terrain split or general environment API. |
| Save, load and session commands | `save`, `load`, `saves`, `deleteSave`, `exportSave`, `importSave`, `newGame`, `autosave` | `src/app.js`; `src/save.js`, `src/saveformat.js`, `src/sessiongate.js` | Mutating persistent/session state; `saves` reads | `scripts/chooser-test.mjs`, `gifting-test.mjs`, `glass-test.mjs`, `preferences-test.mjs`, `race-test.mjs`, `uid-test.mjs` use save/load; `scripts/preferences-test.mjs` also uses `exportSave`/`importSave`; `uid-test.mjs` uses `newGame`. | Save/load/map/New Game are single-flight; a second operation is rejected while busy. There is no transaction, queue, cancellation or rollback guarantee. |
| Assets | `assets` | `src/app.js` -> `src/assetstore.js` | Read-only status snapshot | `scripts/browser-regression.mjs`; `tests/asset*`, `asset-store`, `async-lifetime`. | Status exposure is not a general asset cache or loader API; consumers still acquire/release leases. |
| Camera and pointer state | `cam`, `freezeCamera` | `src/app.js` live camera region; `src/camera.js` pure math | `cam` reads; `freezeCamera` mutates the camera gate | `scripts/glass-test.mjs`, `race-test.mjs`, `thought-test.mjs` use `freezeCamera`; `race-test.mjs` reads `cam`. | `src/camera.js` owns only pure home/position math. Possession clamps, shake, look-at, pointer priority and listener lifecycle remain app-owned/unverified. |
| Launcher and fireworks | `launcher`, `launcherToggle`, `launcherAim`, `launcherFire`, `launcherMove`, `launcherFreeSpot`, `launcherScreenOf`, `launcherMoveMode`, `firework`, `launchFirework`, `rocketTargets`, `lastBurst` | `src/launcher.js`; app firework/rocket/particle regions; `src/cannonaim.js` pure math | `launcher` and firework/rocket snapshots read; launcher controls and `launchFirework` mutate | Browser regression/race probes exercise launcher hooks; `tests/cannon.test.mjs` covers pure placement/aim/fire eligibility. | No universal toy engine. Fire order, flavor RNG timing, cooldown, ballistics, containment and cross-representation blast remain app-owned; landing-refusal host proof is U-016. |
| Settings, effects and UI | `settings`, `setGraphics`, `setProfile`, `setAdaptive`, `setRenderScale`, `setToon`, `resetSettings`, `setEffects`, `effectsState`, `setGodrays`, `godrays`, `dofInfo`, `setEffectsDof`, `setEffectsBloom`, `setEffectsExposure`, `setQuality`, `menu`, `pause`, `paused`, `start`, `returnToMenu` | `src/app.js`; `src/settings.js`; `src/graphics.js`; `src/effects.js` | `settings`, `effectsState`, `godrays`, `dofInfo`, `paused` read; the rest mutate settings/render/UI/session state | `tests/settings.test.mjs`; browser regression; `glass-test.mjs`, `glass-fast-parity.mjs`, `gifting-test.mjs`, `social-test.mjs`, `scheduler-rng-characterization.mjs` use `pause`/`paused`. | Settings persistence, reset/application order and quality policy remain app-owned. Effects have no public disposal and are app-lifetime; no teardown proof. |
| Performance, rendering and diagnostics | `stats`, `bench`, `sim`, `renderProbe`, `diag`, `eyeInfo`, `meshPos`, `meshHead`, `meshInfo`, `poseUp`, `lastGrabs`, `render`, `three` | `src/app.js` render/physics/profiling regions | Read-only snapshots except `render` (draws) and `sim`/`bench` (advance/probe) | `scripts/glass-test.mjs` and `race-test.mjs` use `stats`, `renderProbe`, `lastGrabs`, `freezeCamera`; `scripts/race-test.mjs` uses `three`, `mesh*`, `eyeInfo`, `diag`. | These are host/debug probes, not performance certification. `three` exposes live three.js objects for probes and must not become a render architecture dependency. |
| Spawn, grab, pose and physics test mutators | `pour`, `drop`, `spawnAt`, `spawnGlass`, `grabPoint`, `moveGrab`, `release`, `releaseThrow`, `hit`, `clear`, `setYaw`, `tipBear`, `setWobble`, `setCustom`, `setCeiling` | `src/app.js` actor/grab/physics/render debug region | Mutating runtime geometry, bodies, grabs and pools | Browser probes: `race-test.mjs`, `glass-test.mjs`, `gifting-test.mjs`; underlying Node tests: `actor`, `actor-remove`, `surface-lattice`, `cannon`. | `clear` despawns actors; grab/physics hooks bypass normal pointer routing. They are not a stable simulation API and must not be used by production consumers. |
| Glass actor test API | `glass`, `glassSetNeed`, `glassSetBond`, `glassFading`, `glassStarsBlock`, `glassStarsAdvance`, `glassMourning`, `glassSetStage`, `glassSetPosition`, `glassWalkTo`, `glassSetCooldown`, `glassSetAge`, `glassSetPregnant`, `glassReset`, `glassShelter`, `glassDragStart`, `glassDragTo`, `glassDragEnd`, `glassFamilyPlay`, `glassVisit`, `glassVisitBear`, `glassMate`, `glassMateBear`, `bearGlassSocial`, `bearGlassMate`, `glassBirth`, `glassScreen`, `glassCanMate`, `glassMateDebug` | `src/app.js` -> `src/glass.js` colony; `src/ai.js` for cross-species helpers | Read subset: `glass`, `glassFading`, `glassStarsBlock`, `glassMourning`, `glassScreen`, `glassCanMate`, `glassMateDebug`; the rest mutate | `scripts/glass-test.mjs` uses drag/pregnancy/screen hooks; many lifecycle scripts read `glass`; `scripts/race-test.mjs` uses cross-species/Gummy helpers. | These are test/debug conveniences over the one shipped Glass adapter. They are not support for a second skinned representation or a general Glass API. |
| Studio MSN namespace | `msn.load`, `msn.state`, `msn.play`, `msn.opacity`, `msn.clarity`, `msn.roughness`, `msn.speed`, `msn.visible`, `msn.reset`, `msn.cast`, `msn.hit`, `msn.hover`, `msn.screen`, `msn.select`, `msn.activate`, `msn.beginDrag`, `msn.drag`, `msn.endDrag`, `msn.focus` | `src/app.js` -> `src/msn.js`; app Studio cast/focus | Mixed: state/screen/hit/hover read; load/play/appearance/select/activate/drag/focus mutate | `scripts/browser-regression.mjs` and `race-test.mjs` use `msn`; `tests/debug-api.test.mjs` enforces unique nested names. | Studio has no dedicated Node suite. `msn` is a prototype/presentation surface, not a general model or animation API. |

### Inventory limits

- Several hooks return live engine, field or three.js objects (`behaviorEngine`,
  `foodRegistry`, `bears`, `rig`, `three`). The debug surface does not make those
  objects public domain contracts; callers must preserve ownership rules.
- No hook is promised across a renamed module, map rewrite, save-format change or
  representation change. `debug-api` is a shape/uniqueness check, not a behavioral
  contract for every hook.
- No committed consumer was found for many manual/mutator hooks. Their retention
  is not evidence that they are safe for new tests or production code.

## 3. Supported extension recipes

Each recipe names the current registration/data point, lifecycle ownership, the
tests/docs to update and what not to copy. All recipes still need normal approval
and verification for the affected layer.

### 3.1 Behavior module or activity

**Current owner:** `src/behaviors/module.js` validates/freezes definitions;
`src/behaviors/engine.js` owns registration/order/dispatch; `src/behaviors/config.js`
owns layered defaults; `src/behaviors/contracts.js` declares support policy;
`src/interactions.js` owns the pair/task protocol for activities.

**Files and registration points:**

- Definition: use `defineBehaviorModule` in a module file under
  `src/behaviors/`.
- Registration: add the import and `registerModule(...)` call in
  `src/behaviors/engine.js`.
- Config: add a `MODULE_DEFAULTS` entry in `src/behaviors/config.js` only if the
  module has a configurable capability block; otherwise declare it profile-only.
- Contract: add the matching `BEHAVIOR_CONTRACTS` declaration in
  `src/behaviors/contracts.js` with an honest disable policy.
- Balance: add `src/behaviorprofiles.js` entries and parity scenarios only when
  the branch is species-specific.
- Activity protocol: register a definition with `registerInteraction` and use
  `startTask`/`tickTask`/`cancelTask`/`endPair`; do not add a parallel dispatcher.

**Lifecycle/ownership:** per-actor state belongs in `actor.ai`; module scope must
stay immutable. Cover attach, first tick, interruption/cancellation, disable,
detach and save exclusion. Runtime activity/task/pair state is not saved.

**Tests/docs:** `tests/behavior-modules.test.mjs`,
`behavior-contracts.test.mjs`, `behavior-config.test.mjs`,
`behavior-lifecycle.test.mjs`, `activity-extension.test.mjs`,
`interaction-entry.test.mjs`, `social-cancellation.test.mjs`;
`scripts/check-behavior-contracts.mjs`; `src/behaviors/README.md`.

**Do not copy:** module-scope actor state, a second interaction registry or
scheduler, direct writes outside the pair/task protocol, or a debug hook as the
production integration point.

### 3.2 Species and representation

**Current owner:** `src/species.js` owns registry/capabilities/runtime admission;
`src/dna.js` owns genes/genomes; `src/behaviorprofiles.js` owns balance;
`src/app.js` owns spawn/restore/birth composition; `src/glass.js` owns the one
shipped skinned adapter.

**Files and registration points:**

- Reuse the existing Bear representation first: copy the Bear rig object with a
  new `species` marker, then `registerSpecies({...})` in `src/species.js` or an
  imported source module.
- Add a profile in `src/behaviorprofiles.js` with the same ID; clone only for a
  deliberate zero-divergence start.
- Add genes with `registerGene` in `src/dna.js` only if needed, plus a species
  `genetics.loci` reference/default and fixtures.
- Add a skinned asset through `assets/catalog.json`/manifest and the existing
  Glass adapter only if the representation already exists; a second skinned
  adapter is separate design work.
- Save admission runs through `src/actorsave.js` and `src/saveformat.js`;
  `spawnFromState` restores species/rig, not `applyCommonActorState`.

**Lifecycle/ownership:** registration is permissive for unhosted definitions.
Save validation and spawn/restore reject unknown, unsupported or malformed
representations before mutation. Capabilities are trusted booleans; a registry
entry does not implement them. Deferred hybrids are declared, not built.

**Tests/docs:** `tests/species.test.mjs`, `dna.test.mjs`,
`species-admission.test.mjs`, `species-extension.test.mjs`,
`behavior-profile-completeness.test.mjs`; `docs/species-extension-recipe.md`,
`docs/species-template.md`, `src/behaviors/README.md`.

**Do not copy:** a new rig, silhouette, second skinned adapter, JSON-only species
format, hybrid geometry or the Bear fallback as a new-species balance profile.

### 3.3 Food or resource type

**Current owner:** `src/foodtypes.js` owns definitions/safety; `src/food.js` owns
placed-source ripeness/claims; `src/foodportions.js` owns dropped/carried
portions; `src/field.js` owns visible instances; `src/giftvisuals.js` is a
read-only mirror; `src/behaviors/gifting.js` uses the registry APIs.

**Files and registration points:**

- Register a definition with `registerFoodType` in `src/foodtypes.js` or an
  imported source module: unique ID, label, positive satiation, valid respawn
  range, boolean safety and an existing `visual`/`interaction` pair.
- Add an authored placed source with a stable ID whose `kind` matches the
  definition and whose `visualIndex` points at an existing instanced visual.
- Keep `src/food.js` and `src/foodportions.js` as the only registries; save
  capture/restore uses the existing portion snapshot shape.

**Lifecycle/ownership:** claims/consumption authorize by live object identity;
snapshot/restore persists only mutable state and portion identity. A novel
`visual` value simulates but has no visual effect. Presentation derives from
registry polls and never owns claims.

**Tests/docs:** `tests/food.test.mjs`, `gifting.test.mjs`,
`resource-extension.test.mjs`, `content.test.mjs`; `docs/resource-extension-contract.md`.

**Do not copy:** a new renderer/asset/visual branch, a new risk or action
handler, a second food/portion cache, general inventory or UID-based
claim/consume.

### 3.4 Authored content, home or field content

**Current owner:** `src/floratypes.js` owns content/style definitions;
`src/mapcontent.js` authors map lots/starters; `src/field.js` builds the live
field, homes, colliders and nav; `src/fieldlayout.js` owns the pure layout check;
`src/navmesh.js` owns the baked nav.

**Files and registration points:**

- Add species/style definitions in `src/floratypes.js` and authored lots in
  `src/mapcontent.js`.
- Compose the live object through `src/field.js`; keep home names, door
  approaches, capacities and existing visuals.
- Validate with `field.validateLayout()` (`src/fieldlayout.js`) and the existing
  nav/collider build. Preserve authored instance counts unless the content is
  intentionally changed.

**Lifecycle/ownership:** field/sky/effects/launcher are app-lifetime, not
recreated per map. New map IDs, dynamic lot editing and coordinated runtime
collider/nav/scene rebuilds are unsupported.

**Tests/docs:** `tests/content.test.mjs`, `field-layout.test.mjs`,
`homesim.test.mjs`, `family.test.mjs`, `water-access.test.mjs`;
`docs/homes-boundary-contract.md`, `docs/field-environment-inventory.md`,
`docs/spatial-layout-contract.md`.

**Do not copy:** a visual pond/terrain split (U-018), a second field builder,
per-frame foliage loops, new map IDs or interior/placement editing.

### 3.5 Display setting or preset

**Current owner:** `src/settings.js` owns pure preset records, nature
normalization and stored-profile resolution; `src/graphics.js` owns advanced
graphics descriptors, `localStorage`/URL reads and panel construction;
`src/app.js` owns browser keys, application/reset order, quality policy and UI.

**Files and registration points:**

- Add a display preset/normalizer rule in `src/settings.js`.
- Add an advanced graphics control to `GRAPHICS_GROUPS` in `src/graphics.js` and
  apply it through the existing app application path.
- Keep `src/app.js` as the owner of storage, Custom detection, reset order and
  effects/quality application.

**Lifecycle/ownership:** settings are persistent browser state, but the pure
module must not access storage, DOM, three.js or RNG. Effects are app-lifetime
and have no public disposal.

**Tests/docs:** `tests/settings.test.mjs`; `docs/settings-contract.md`;
application/reset/host evidence remains a browser check, not a Node test.

**Do not copy:** storage/DOM into `settings.js`, a second settings store, a new
effects layer or a reset-order change without a decision.

### 3.6 UI read model or panel controller

**Current owner:** `src/relationshipview.js` and `src/rosterview.js` build pure
read models; `src/savepanel.js` owns save/menu row descriptors and keyed row
controllers; `src/panelcontroller.js` owns panel open classes/body flags/
backdrop listeners and the Escape target order; `src/app.js` owns commands,
storage, session gating, formatting and selection effects.

**Files and registration points:**

- Build rows/state as plain copied data in a pure module; inject callbacks
  (`statusFor`, `familyFor`, `colorFor`, `metaText`, `makeButton`,
  `onBackdrop`) instead of importing app globals.
- Reuse DOM rows/buttons by stable key (`String(uid)` or slot/record ID).
- Give controllers a scoped `destroy()` that removes only controller-created
  content/listeners; keep markup/CSS and command effects in the app.

**Lifecycle/ownership:** read models must not retain live actors or storage.
App panels are long-lived; normal app teardown is not implemented.

**Tests/docs:** `tests/relationshipview.test.mjs`, `rosterview.test.mjs`,
`savepanel.test.mjs`, `panel-controller.test.mjs`, `thoughtbubble.test.mjs`;
`docs/roster-panel-contract.md`, `docs/panel-controller-contract.md`.

**Do not copy:** DOM ownership into simulation, markup/style extraction as if it
also moved state, a general UI framework, or unkeyed row recreation/listener
accumulation.

### 3.7 Translation target fixture extension

**Current owner:** `tools/translation-pilot-py/` owns the independent CPython
harness; `docs/translation-fixtures.md` owns fixture inventory/evidence rules;
`docs/translation-target-decision.md` owns the target/precision decision.

**Files and registration points:**

- Add a fixture family under `tools/translation-pilot-py/fixtures/` with
  provenance, source case names, exact/tolerance policy, failure negatives and a
  canonical manifest hash.
- Implement only the bounded rule/adapter in `genome.py` or `adapter.py`; wire
  the command in `run.py`.
- Execute the target directly:
  `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 tools/translation-pilot-py/run.py <command>`.
  Record the exit code and manifest hash; do not substitute a JS test bridge.

**Lifecycle/ownership:** a fixture change invalidates the hash and is a new
baseline. Exact fields and the `1e-12` tolerance are pinned per manifest; no
post-failure widening. The pilot does not run Three.js, Box3D/WASM, assets, the
browser or the game loop.

**Tests/docs:** the Python `validate`, `--self-test`, `genome` and `adapter`
commands; `tools/translation-pilot-py/README.md`,
`docs/translation-fixtures.md`, `docs/translation-target-decision.md`.

**Do not copy:** a claim of whole-game portability, native physics/rendering
parity, a third-party runtime dependency, a JavaScript execution bridge or a
loosened tolerance to make a port pass.

## 4. Representative extension proof map

This maps completed seam families to existing proof or an explicit
unsupported/deferred disposition. Test paths are committed files; the H1 run did
not rerun every one of them.

| Seam family | Existing proof | Disposition / limit |
| --- | --- | --- |
| Behavior module and activity | `tests/behavior-modules.test.mjs`, `behavior-contracts.test.mjs`, `behavior-config.test.mjs`, `behavior-lifecycle.test.mjs`, `tests/activity-extension.test.mjs`, `interaction-entry.test.mjs`, `social-cancellation.test.mjs`; `scripts/check-behavior-contracts.mjs` | Supported through existing definitions/protocol. Not every activity's cancellation path is proven (U-007); no generic module disable. |
| Species/representation | `tests/species.test.mjs`, `dna.test.mjs`, `species-admission.test.mjs`, `species-extension.test.mjs`, `behavior-profile-completeness.test.mjs` | Supported for a new soft body reusing the shipped Bear representation and the shipped Glass adapter. New rigs, silhouettes and second skinned adapters are separate decisions. |
| Food/resource | `tests/food.test.mjs`, `gifting.test.mjs`, `resource-extension.test.mjs`, `content.test.mjs` | Supported only when reusing an existing visual/interaction handler and the existing registries. No new visual, risk action or inventory. |
| Authored content/home/field | `tests/content.test.mjs`, `field-layout.test.mjs`, `homesim.test.mjs`, `family.test.mjs`; `tests/water-access.test.mjs` | Supported for authored data and numeric layout validation. No runtime lot editing/rebuild, new map IDs or visual pond/terrain split (U-018). |
| Settings/presets | `tests/settings.test.mjs` | Pure settings boundary supported; browser application/reset order remains app-owned and host-checked. |
| Roster/read model | `tests/rosterview.test.mjs`, `relationshipview.test.mjs` | Pure read-model extension supported; app keeps DOM/selection/formatting. |
| Panel controllers | `tests/savepanel.test.mjs`, `panel-controller.test.mjs`, `thoughtbubble.test.mjs` | Keyed row/listener cleanup supported at controller scope; normal app teardown is not implemented. |
| Cannon/toy math | `tests/cannon.test.mjs`; `docs/toy-boundary-contract.md` | Pure placement/aim/cooldown/seam supported. There is no universal toy engine; landing-refusal host proof is U-016. |
| Surface/lattice | `tests/surface-lattice.test.mjs` | Numeric bounds/lattice fixture supported. There is no general surface/buffer API; pond recovery and eye continuity remain U-017. |
| Water/field access | `tests/water-access.test.mjs` | Pure pond query and water-spot derivation supported. Visual pond/terrain split is deferred (U-018). |
| Translation pilots | `tools/translation-pilot-py/run.py genome` and `adapter`; G2/G3 results in `docs/translation-target-decision.md` §8a–8b | Bounded cross-language pilots only. They are not whole-game portability, native physics/rendering parity or general save-format support. |

Explicit unsupported/deferred boundaries:

- Cannon has no universal toy engine; app firework/rocket/particle pools and blast
  ordering remain app-owned.
- Surface has no general buffer/geometry API; the 24-body Bear/Gummy
  metaball/surface-nets path and batching are load-bearing.
- Field has no visual pond/terrain split (U-018); the visual water/reflection,
  shoreline, shared materials and colliders are not separately owned.
- New map IDs, dynamic map registration, save-format changes, new Glass
  representations and effects teardown/recreation require separate decisions.
- Translation pilots are not whole-game portability.

## 5. Narrow boundary checks proposed for H2

H1 does not implement these checks. H2 may add narrow source checks only if the
parent approves the exact module list and rules. The following modules were
source-inspected for this inventory and currently have no `import` statements and
no ambient DOM/storage/three.js/RNG/clock use in their own source:

- `src/camera.js`
- `src/settings.js`
- `src/rosterview.js`
- `src/cannonaim.js`
- `src/surfacelattice.js`
- `src/wateraccess.js`
- `src/homesim.js`
- `src/fieldshape.js`
- `src/fieldlayout.js`
- `src/avoidance.js`
- `src/relationships.js`
- `src/family.js`

A proposed H2 check would assert only that these files do not import
DOM/three.js/storage modules and do not reference ambient `window`, `document`,
`localStorage`, `sessionStorage`, `performance`, `Date` or `Math.random` at
module/call scope, with an explicit allow-list for numeric uses such as
`Math.sin`/`Math.hypot`. It must not become a repository-wide import-ban
framework, and `relationshipview.js`/`panelcontroller.js`/`savepanel.js` are not
candidates because they intentionally consume injected DOM/read-model inputs.

## 6. Unsupported and deferred list

Recording an item here or in the register does not authorize a fix, test seam or
design change.

| ID | Boundary relevant to extension work | Disposition |
| --- | --- | --- |
| U-003 | App-internal pool/spawn/removal and partial cleanup have no importable host seam | Verification open; do not claim a general actor-lifecycle extension API. |
| U-006 | Direct Glass removal lacks detach/cancel | Decision open; do not copy a removal pattern into a new representation. |
| U-007 | Interaction-family coverage beyond the social pilot | Deferred; new activities still need their own cancellation evidence. |
| U-008 | Editor-time connectivity/rebuild policy | Decision open; authored-layout validation is not an editor contract. |
| U-011 | Real Glass late completion and effects teardown | Unsupported/open; no safe effects re-creation or second skinned adapter. |
| U-016 | Cannon landing-refusal host proof | Verification open; pure cannon fixtures do not prove host refusal. |
| U-017 | Pond recovery and eye-placement continuity host proof | Verification open; not a general surface API. |
| U-018 | Visual pond/terrain host split | Deferred/open; requires separate material/uniform/shoreline/collider/camera design. |

See [the unresolved-items register](unresolved-register.md) for the complete
entries and evidence. An entry's presence is not repair authorization.

## 7. Verification boundary

H1 is documentation-only. Its required checks are `git diff --check`, existence
of every cited path/test, `node --test tests` and
`node scripts/check-behavior-contracts.mjs`. No browser boot, parity run,
performance measurement or runtime change is part of H1. The H1 run's exact
commands and counts belong in the return report; this document does not declare
itself reviewed or accepted.
