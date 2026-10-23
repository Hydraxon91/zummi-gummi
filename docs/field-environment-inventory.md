# Field/environment composition inventory (M16/F2)

Status: **current-route inventory with one extracted consumer boundary.** Baseline
`efe8d2f` (`refactor: isolate surface lattice math`). This record is
source-inspected unless a check is explicitly marked host-run. It does not
authorise a visual pond/terrain split or any change to scene composition.

## `buildField` composition order

`buildField({ scene, camera, renderer, sky })` constructs one `gummyMeadow`
group in this order (source line references are baseline-relative):

1. **Wind/sun/nav foundations.** `createWind`, `createSunState`, `createNavMesh`
   and the collider/authoring registries are created first. Authored homes,
   trees, rocks and the Studio are pushed into `colliders`/`nav` before scatter
   placement; the pond footprint (`nav.addSolid({ kind: 'pond', ... })`) is also
   registered here (`src/field.js` around the materials boundary).
2. **Materials.** Wall/roof/trim/stone/door/wood/glass/leaf/canopy/bark/fruit/
   flower/stem/`sandMat`/pebble/`padMat` records are shared by later visual
   builders. The pond bank, path edge and wet band reuse these materials.
3. **Dirt trails / path mask.** An authored route list rasterises the 1024² path
   mask; the lawn and grass shaders sample the same mask so the path reads as
   thinned grass, not a decal.
4. **Lawn / hills / morning mist.** Terrain mesh, hill toe and mist shader are
   added as composition visuals.
5. **Grass.** Chunked grass instancing and wind uniforms are composed; the pond
   mask, path mask and cull distance are shared with this pass.
6. **Placement helpers.** Shared scatter/clearance helpers used by flowers,
   trees, homes, rocks and bushes.
7. **Flowers, candy trees, Aero cottages, rocks, bushes.** Each factory receives
   authored lots and returns its own batched/instanced collection; `field.js`
   composes the groups and records `userData` counts.
8. **Pond.** `pondGroup` (`meadowPond`) is positioned at `POND`. It holds the
   bank/wet band/blend/fringe geometry, outline-derived shore phases/wobble,
   lily pads/rocks/foam, the `Reflector` water surface, splash rings and the
   shoreline wetness update. The pure pond query is created before this visual
   block; its only composition consumers are the pond visual checks and the
   later water-spot/layout query.
9. **Bubbles, fireflies, bee swarm, field shadows.** Decorative/dynamic pools and
   the shadow submission are appended.
10. **Nav bake and layout validation.** `nav.bake()` runs after all static
    solids are registered. `validateLayout()` resolves the live homes, door
    clearance, authored lots, `POND`, `pond.contains`, nav, food and water spots
    through `validateFieldLayout` on every call.
11. **AI plan overlay.**
12. **Food.** Flower/fruit/hive visuals and authored sources are composed; hive
    approaches are chosen from tree positions with nav/clearance/pond checks.
13. **Plant portions.** `createFoodPortionRegistry` is created after food.
14. **Water spots.** `buildWaterSpots` derives the walkable drinking approaches
    from `pond`, `fieldInside` and `nav.nearestWalkable`.
15. **Emotes, splash/update closure, return object.** `update`, `splash`, emotes,
    visibility/nature/wind setters and the mixed field API are returned.

## Shared dependencies blocking a visual pond/terrain split

The following were inspected and remain intentionally in `field.js`; extracting
them without a full dependency inventory would break authored composition:

- `sandMat`, `pebbleMat`, `padMat`, `grassMat` and the other shared material
  records used by bank/path/lawn/pond fringe.
- Grass/wind shader hooks: the pond mask uniform (`uGrassPondCenter`), path
  mask, wind uniforms and cull state are shared by grass, water and scenery.
- Sun uniforms (`uSunDir`/`uMoonDir` and colour/night values) are copied into the
  reflector's cloned material; the live uniform objects are shared.
- The single path mask canvas/texture feeds lawn, grass and shore treatment.
- Shoreline `outlinePts`/`shorePhases`/`shoreWobble` are used by the water
  shader, wet ribbons, splash rings and bank geometry.
- Pond colliders/nav (`kind: 'pond'`), `isCannonSpot` pond math and
  `validateLayout` all depend on the same authored `POND`.
- Reflector camera/render target, `REFLECT_LAYER`, the every-other-frame
  `onBeforeRender` cadence and visibility/nature toggles assume the same scene
  graph and camera.
- Hive hosts share tree lots/positions; homes/rock/tree colliders feed both nav
  and placement rejection.

## Extracted consumer boundary (F2)

`src/wateraccess.js` is pure data/query code (no three.js, DOM, storage, RNG or
clock imports):

| Export | Responsibility |
| --- | --- |
| `createPondQuery(pond, hole)` | Returns `{ ...pond, hole, contains, nearestShore }`; `contains` is the normalized ellipse `< 1`; `nearestShore` uses the exact `atan2` angle and `1.12` radius factors. It never mutates its arguments. |
| `pondEscapeDue({ timer, dt, inPond, inside, grabs, speed, threshold = 1.5, speedLimit = .16 })` | Pure bounded no-progress timer: resets on leaving the pond or ellipse, a grab, or speed at/above the splash limit; otherwise accumulates `dt` and reports `due` at the threshold. `src/app.js` uses it to call `rescuePondBear(b, false)` for a bear stranded at the rectangular physics cut-out. |
| `buildWaterSpots({ pond, count = 16, fieldInside, nearestWalkable, ... })` | Returns the historical shore spots in `i / count * 2π` order with the raw point at `1.22` radii, rejection order `fieldInside → nearestWalkable → snap > 2.2 → contains → spacing < 1.4`, and water point at `.94` radii. |

Why this boundary is cohesive: both are simulation/layout queries over authored
pond geometry. The field builder supplies the constants and live callbacks; the
module does not need the scene, renderer, camera, shader or collider graph.

### Producer → consumer map

- **Producer:** `src/field.js` authors `POND`/`POND_HOLE`, constructs the nav and
  calls `createPondQuery(POND, POND_HOLE)` plus `buildWaterSpots(...)`.
- **Field surface:** `field.pond` keeps the same shape and members;
  `field.waterSpots` keeps the same values/order.
- **Consumers:** `src/app.js` uses `pond.contains`/`nearestShore` for pond entry,
  rescue and debug and `pondEscapeDue` for the bounded stranded-pond escape;
  `src/behaviors/engine.js`/`water.js` consume
  `api.waterSpots()` (falling back to `field.waterSpots`); `social.js`/`wander.js`
  use `pond.contains`; `fieldlayout.js` receives `pondGeometry`, `pondContains`
  and `waterSpots` through the field wrapper.
- **Not extracted:** `isCannonSpot` keeps its inline pond-clearance math and
  `validateLayout` keeps its wrapper/query wiring.

## Load-bearing invariants

- Authored composition order above, including pre-scatter collider/nav
  registration and one nav bake.
- Hive hosts remain tree lots; hive approach order and 14-sample scan are
  unchanged.
- Wind coherence: one `createWind` state supplies grass, water and scenery.
- Reflected visibility: reflector `layers.set(0)`, reflection camera
  `REFLECT_LAYER`, every-other-frame cadence and `scene.overrideMaterial` guard.
- Instancing/batching and draw submission for grass, trees, bushes, flowers,
  portions and shadows.
- No per-blade/per-branch CPU update loops; grass work stays in shaders/chunks.
- `field.update`, `splash`, shaders/uniforms and collider/nav values are out of
  the extracted boundary.

## Deferred / unsupported

- Extracting terrain, pond visuals, water shader/reflector, shoreline, grass,
  trees, homes, wind, colliders or camera composition. The shared dependencies
  above make that a larger design step, not a mechanical move.
- Runtime lot editing/rebuild, an independent water host, and renderer-neutral
  scenery/water graphs.
- A general field API split beyond the two pond/water-spot queries.

## Evidence level

- Source-inspected: composition order, shared materials/uniforms/shoreline,
  reflector/camera interactions, consumer map.
- Host-run: focused `tests/water-access.test.mjs`; full Node suite, behavior
  contracts, short parity, HTTP smoke and an affected Meadow browser probe are
  recorded in the F2 return ledger (`.dev-shots/f2/`, not committed).
- No visual pond/terrain extraction was attempted; no performance claim is made.
