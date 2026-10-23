# Spatial layout contract

Status: M7 working-tree boundary (B4). This records current ownership and
operations only. It adds no placement rule, no editor, no dynamic editing policy
and no change to navigation, colliders, rendering or physics. Remaining M7 work
such as edit-time rebuild ownership is deferred, not implemented.

## Current owners

| Concern | Current owner | Authority and inputs |
| --- | --- | --- |
| Authored lot data | `src/mapcontent.js`, `src/floratypes.js` | House/tree/rock lots, cannon home, Studio House, names and style/species IDs. |
| Layout composition | `src/field.js` `buildField` | Computes home yaw/door/radius, tree/rock footprints, the pond ellipse and Studio House collider; registers the same obstacles with nav and `colliders`. |
| Numeric layout validation | `src/fieldlayout.js` `validateFieldLayout` | Pure, headless check over passed lot/scale data, authored `POND` geometry, the live pond `contains` query, `fieldInside`, current `nav` and food registry. Returns the existing ordered error list. No three.js, DOM, storage or mutation. |
| Field validation wrapper | `src/field.js` `validateLayout` | Resolves the live `homes`, `aeroHomes.doorClearance`, `TREE_LOTS`/`ROCK_LOTS`, `WORLD_SCALE`, `pond`, `CANNON_HOME`, `STUDIO_HOUSE`, `nav`, usable food approaches, `food` and `waterSpots` on each call. It keeps no stale snapshot. `layoutErrors` remains the boot-time result and `field.valid` remains its zero-length test. |
| Numeric navigation | `src/navmesh.js` `createNavMesh` | Clearance grid, static solids, dynamic obstacle entries, components, paths, ties, stats and `validate`. `isWalkable`/`validate` are read by the layout check. |
| Field bounds | `src/fieldshape.js` | `fieldRadiusAt`, `fieldInside`, `fieldClamp`; shared by nav bake, scatter and layout checks. |
| Steering avoidance | `src/avoidance.js` | Pure `avoidanceYaw`; not part of layout validation. |
| Physics colliders | `src/field.js` collider records, consumed by `src/app.js` | App creates static Box3D spheres from `field.colliders`; tree bases add a low sphere. This is a separate representation from the nav solids, built from the same authored registry. |
| Debug rendering | `src/navdebug.js` `buildNavDebugObject` | three.js mirror of the baked nav grid. Toggling it does not change paths or layout results. |
| Launcher placement | `src/app.js` `isCannonSpot`/`launcherSpotClear` | `isCannonSpot` is a field query over `fieldInside`, homes, trees, rocks, Studio House and pond; `launcherSpotClear` additionally rejects current collider circles and bears. Neither replaces `validateFieldLayout`. |

`validateFieldLayout` is the pre-extraction `field.validateLayout` body: same
headroom constants (`1.375` + `0.16`), same 0.35 field pad and formulas, same
duplicate directional home-overlap errors, same message strings/order, the same
`if (food)` guard, and nav errors appended last. It does not choose placement or
reject edits; it reports the existing error list.

Pond inputs are deliberately split. Overlap formulas read the authored
`POND` object (`pondGeometry`) exactly as the original closure did, while water
inclusion calls the runtime `pond.contains` query through `pondContains` and
keeps its receiver. A later change to the exported `POND` values and a change to
the composed pond query therefore remain independent, as before extraction.

The checker forwards `nav.validate()`, which checks authored solids (centres must
not be walkable), door approach cells and house door clearance. It does not prove
global reachability. Actual path queries are the numeric navigation authority for
that: a cross-component `findPath` returns `null`, while same-component routes
still resolve. Neither `layoutErrors` nor `nav.validate()` is a complete editor
reachability validator.

## Build, bake and rebuild ownership

Current boot order in `buildField`:

1. Author lots are read and home/tree/rock/pond/Studio solids are added to a new
   `createNavMesh` instance; `colliders` is filled from the same pass.
2. Scene content, food sources and pond water approaches are built.
3. `nav.bake()` runs; reachable food approaches are resolved against that bake.
4. `validateLayout()` runs once; warnings are stored in `field.layoutErrors` and
   logged by the app. `field.validateLayout()` remains callable later (debug
   `fieldInfo().layoutCheck`) and reads current live inputs.

The nav mesh is baked during construction. `setCannon` calls
`nav.setDynamic('cannon', …)` then `nav.bake()`, so the cannon marker is the one
existing runtime obstacle transition. Static authored lots are not edited at
runtime. `nav.addSolid`, `clearSolids`, `setDynamic`, `removeDynamic` and `bake`
exist as operations, but no path currently rebuilds `homes`, `colliders`,
`aeroHomes.doorClearance`, the pond, Studio House or scene content after a layout
change, and no code recomputes `field.layoutErrors` after such a change.

Deferred (not implemented, not authorized here): an editor or placement UI,
live lot mutation, coordinated collider/nav/scene rebuild, incremental reachability
maintenance, and save/undo of layout edits. A future edit path must rebuild all
consumers below, not just the nav grid, and must not reuse `layoutErrors` as if it
were a live result.

## Consumer map

| Consumer | Read today | Minimum for a future rebuild |
| --- | --- | --- |
| `field.validateLayout` / `app.js` boot warning | live homes/nav/food/water inputs | Re-run validation after all registries change. |
| `nav.isWalkable`, `nearestWalkable`, `findPath`, `validate` | baked grid and solids | Re-add solids and bake; callers must not use pre-bake results. |
| `app.js` Box3D static spheres | `field.colliders` | Destroy/recreate affected static handles; existing handles are boot-lifetime. |
| `field.isCannonSpot`, `app.js` launcher placement | authored lots + pond bounds | Query current data; no cached lot snapshot. |
| `field.homes`, `aeroHomes` | composed homes and door metadata | Door/headroom data is produced by the villa factory, not authored in `mapcontent.js`; a layout edit that changes scale or style needs that data regenerated. |
| Trees/rocks/bushes render collections | authored lots at build time | Rebuild the affected instances; no per-frame lot scan is added by this contract. |
| Pond/terrain/water/reflection | `POND` and pond build | Shared uniforms, shoreline and camera dependencies were not inventoried for safe rebuild. |
| Food sources/water approaches | bake reachability | Re-resolve approaches against the new bake; preserve claim identity or explicitly migrate it. |
| `navdebug` mesh | baked grid | Rebuild/toggle after bake. |
| `__gummy.fieldInfo()`/`navStats` | `field.layoutErrors`, live `validateLayout()`, nav stats | Debug reads current calls; it is not a rebuild trigger. |

## Unsupported transitions

- Moving/adding/removing a static lot while the game runs, then expecting nav,
  colliders, rendered props and food/water approaches to stay consistent.
- Editing only `mapcontent.js` at runtime or assuming a re-import re-registers
  the field.
- Treating `nav.addSolid` + `bake()` as a complete layout update: app static
  colliders and scene instances are not derived from a post-boot change.
- Using a blank or partial authored dataset as proof that the real meadow layout
  is valid. The committed `tests/field-layout.test.mjs` uses synthetic fixtures
  plus the real nav/field-shape functions to protect the validation boundary; it
  is not authored-geometry evidence.
- Concluding that a zero-length `layoutErrors` proves every visible prop is
  reachable; the check covers the listed homes, lots, food/water approaches and
  nav door/obstacle validation only. Connectivity is not checked, so a split nav
  graph can coexist with an empty layout error list.
- Treating `layoutErrors`/`nav.validate()` as an edit-time reachability policy or
  claiming an editor supports disconnected layouts. No connectivity threshold,
  main-component policy or edit-time rebuild is introduced here.

## Checks

- `tests/field-layout.test.mjs`: headless pure boundary, exact messages/order,
  authored-pond versus runtime-query separation, source immutability, real-nav
  blocked doors, an out-of-bounds door error, appended nav errors, and a genuine
  two-component split grid where cross-component `findPath` is `null` while a
  same-side path resolves. Existing `tests/nav-debug.test.mjs`,
  `fieldshape.test.mjs`, `avoidance.test.mjs`, `content.test.mjs` remain the
  nav/tie/path and authored content fixtures.
- Browser: `__gummy.fieldInfo()` exposes `layoutErrors`, live `layoutCheck` and
  nav stats; boot/accepted-layout evidence is reported by the M7 run, not claimed
  by this document.
