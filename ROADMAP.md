# Gummy Bears — Roadmap

A cozy, living gummy-bear meadow: soft-body bears with needs and little lives, a
Bliss-style field, a reflective pond, a full day/night sky, and a Frutiger-Aero /
MSN presentation. The Box3D jelly physics, grabbing/throwing, metaball surface,
fireworks and cannon remain the foundation.

## Locked direction

- **Two maps, switchable in-app:** **Grass Field** (default, full life sim) and
  **Studio** (the current white tabletop, sandbox mode with needs paused).
  Each map keeps its own bears, time, food, cannon position and camera state.
  Only the active map simulates.
- **No bear death.** Health bottoms out at *woozy*; the bear rests and recovers.
- **Assigned sexes** (female/male). Mating requires one of each, both adults,
  both satiated, both healthy, food available, and room under the cap. Females
  carry a short pregnancy.
- **Pacing:** about a 10-minute day/night cycle and 6–8 minutes baby → adult,
  with adjustable time-of-day, auto-cycle and a world-speed control.
- **Pond:** bears path around it; thrown/launched bears splash, float and paddle
  back to shore.
- **Population:** Grass Field default ceiling 40, hard slider max 128. Food
  availability is a soft breeding limit. Studio keeps its sandbox ceiling.
- **Health & food:** flowers and jelly fruit are safe; beehives are high-value
  food and a hazard. Bears avoid hives below a health threshold (personality
  and desperation adjust it). Health regenerates, faster when resting.
- **Cannon:** movable on both maps, with direct drag, a move mode, and a
  validated footprint. The Box3D boundary walls are tall enough to contain shots.
- **Theme:** Aero/MSN UI for the meadow; the Studio keeps the existing editorial
  theme. The map switch also switches the UI skin.
- **Homes:** the meadow has rounded white/aqua Frutiger-Aero villas that bears
  claim as homes, return to at night or when hurt, sleep in, raise babies in and
  invite friends to. Houses are placed on validated lots with no clipping into
  the pond, trees/canopies, food, the cannon, each other or the field walls.
- **Player agency is additive:** saves/New Game, bear directives (which a bear may
  refuse) and a curated village placement editor sit on top of the autonomous
  simulation; bears stay autonomous unless the player takes direct control of one.

## Architecture

Current (after Phase 2):

```
index.html              shell, styles, HUD
src/app.js              renderer, surface, input, UI, fireworks, loop
src/config.js           flavors + 24-body rig
src/world.js            map registry + per-map launcher state
src/launcher.js         movable cannon: build, aim, fire, move
src/box3d.js            WASM bridge
src/field.js            meadow, pond, grass chunks, props, nav/shadows
src/wind.js             shared world-space wind uniforms + GLSL
src/sunlight.js         shared sun direction/colour/intensity for vegetation translucency
src/trees.js            procedural merged trees, leaf/fruit/hive batches
src/homes.js            Aero villa visual builder (fixed home lots)
src/studiohouse.js      field-side Studio portal house + Studio return door
src/backdrop.js         rolling background hills, tree belts, hill grass and rocks
src/horizon.js          distant Aero skyline + wind turbines
src/sky.js              day/night sky, clouds, moon, aurora, mist state
scripts/box3d_wrapper.c C world/body/joint API + destroyable static handles
vendor/box3d/           pinned prebuilt Box3D WASM
snapshots/tabletop-phase0.zip   pre-refactor working app snapshot
legacy-singlefile.html  original pre-Box3D build
inspiration/            supplied visual references (not shipped assets)
```

Target split (grows in with the phases):

```
src/world.js            map registry, per-map state, bounds, walls, launcher pos
src/homes.js            cottage lots, ownership, beds/residents, home AI hooks
src/sky.js              time-of-day, sun/moon/stars/clouds, lighting
src/water.js            pond shader + planar reflection + sun/moon glints
src/field.js            grass, trees, flowers, props, 2D obstacles
src/food.js             food sources, ripeness, claims, respawn
src/life.js             stage/age rules, courtship/birth gates, inheritance
src/ai.js               needs, state machine, steering, invites, conflict, mate, follow, emotes
src/effects.js          optional meadow composer: grade, bloom, GTAO, SMAA
src/launcher.js         cannon build/move/aim/fire
src/ui.js / styles.css  Aero/MSN shell and HUD
src/studio-room.js      authored Studio lounge/bar/TV interaction surface
assets/studio/          exported glTF/GLB room kit, collision proxies, credits
src/save.js             IndexedDB slots, save format/migration, New Game
src/actorsave.js        actor save versions, validation and collection registry
src/player.js           bear selection, directives, possession camera/input
src/editor.js           placement editor: ghost preview, validation, undo
src/village.js          village homes, naming, hub/plaza, roles and shops
src/app.js              orchestration only
```

The Box3D wrapper now has destroyable static-wall handles. The current 24-body
rig and soft-body solver stay.

## Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0 ✅** | Snapshot current app; split modules; map manager + per-map state; per-bear scale/sex/health/age data; static-wall handles; baseline tests | Current Studio still passes its physics and interaction tests; map/launcher state is structured per map |
| **1 ✅** | Movable cannon + taller/larger walls on the Studio (quick playable win) | Cannon can be dragged/moved with validation; it stays in bounds; max-power shots are contained; aim/fire still work |
| **2 ✅** | Grass Field, sky, pond, Aero shell, map switcher; field default; **mixed starter colony (2 adult ♀, 2 adult ♂, 1 teen, 1 baby)**; **rounded white/aqua Aero villas on validated home lots**; **distant Frutiger-Aero skyline + three-blade wind turbines**; pond splash/buoyancy; **procedural gummy-tree replacement with rounded leafy puffs/fruit/hives; shared travelling wind for trees + grass; Wind and Meadow-detail controls; procedural clouds, aurora and sporadic morning mist**; **circular wobbled-disc playfield, wandered dirt trails, full-circle grass, branched backdrop trees/bushes and anime-lite water**; **Hide UI** | Both maps load and switch with independent state; field has grass/trees/flowers/pond/sky/villas; no layout overlaps; day/night slider and dawn look work; pond reflects sun/moon and splashes; trees use the fixed TREE_LOTS/colliders with merged foliage batches and no per-frame CPU branch loops; one shared gust visibly crosses grass and trees; night sky shows aurora; starting colony has the four adults, teen and baby; villa silhouettes are distinct without changing their lots; skyline/windmills read as distant scenery; 16/16 self-test, mobile layouts, layout and map-switch checks pass; circular camera/containment and UI hide checks pass |
| **3a ✅** | Food registry/respawn, hunger, thirst, hop locomotion, WANDER / SEEK_FOOD / EAT / SEEK_WATER / DRINK | Bears autonomously get hungry or thirsty, hop to safe food or the pond shore, eat/drink, and food regrows; grab/throw interrupts and resumes the task; no stuck/NaN/perf regressions |
| **3b ✅** | **3b.0 hop pose/takeoff polish** (level crouch/air target with a small forward lean, upright takeoff gate, transient AI reset, per-bear hop-pace range (inherited in Phase 5)); hives, health, sting/risk logic, rest/recover/woozy, **home return + night sleep**, health UI | AI hops stay close to upright through takeoff, apex and landing; player throws still tumble freely; bees can sting, bears avoid hives below the threshold, health regenerates, hurt/tired bears return home and recover, with no death |
| **4 ✅** | SEEK_COMPANY / invite handshake / mutual SOCIAL, food conflict, affection/bonds, **door-level home visits**, buddy statuses/emotes | The other bear visibly accepts and switches mode; same-food target causes a shoving conflict; friends can visit a villa doorway; MSN-style statuses update |
| **5 ✅** | Growth stages + scale rebuilds, sexes, mating, pregnancy, births, **inherited hop-pace range**, population/food caps, baby following, **family homes/nursery** | Babies grow through teen to adult; opposite-sex satiated adults can mate; births respect cap/food; children inherit a blended pace range with a small mutation; babies stay with/return to a parent’s home; body/surface/eyes/scale stay in sync |
| **6a core ✅ / effects follow-up ✅** | **Effects pass:** gentle color grade, restrained thresholded bloom, SMAA, high-tier GTAO contact AO, cloud-masked sky-dome glow, **real sun/moon directional shadow maps**, **depth-aware screen-space god rays** and an optional **Depth of field** toggle; per-bear sleep schedules and the pond recovery path are also in | Effects stay optional/tiered, preserve readable UI/transmission, occlude light shafts against canopies/objects, and keep a blob-shadow fallback below the shadow tier |
| **6b-1 (post-release)** | **Aero/MSN presentation polish:** HUD/status styling, name plates and emote legibility, gear-sheet visuals, home occupancy / window-glow polish | Dawn/day/dusk/night and UI/UI-hidden captures read as one Aero/MSN look; occupancy glow is legible at night; no layout or readability regressions on desktop or mobile |
| **6b-2 ✅** | **Sky, cloud and water tuning + day/night presets:** named Dawn/Day/Dusk/Night looks (hour + mist + cloud density + exposure), night-tinted pond and foam, calmer lily-pad gloss, clouds pulled closer to the horizon | Presets load and persist; dawn/day/dusk/night look polished against the 6a effects tiers; pond/cloud/mist changes hold up in close-up and wide captures |
| **6b-3 ✅ (desktop + emulated mobile)** | **Performance & mobile pass:** re-profile Off/Soft/Full at 6/20/40 bears; far-grass LOD, god rays off, Balanced defaults; mobile layout and touch checks; record method and before/after in `PERFORMANCE.md` | 40 spread bears on the **Balanced** profile (Soft, device DPR 1.5) at the default camera stay at **≤33 ms** with the stated method; mobile layouts pass at 390×844, 768×1024 and 844×390 (emulated; real devices untested); numbers, method and variability are recorded. The **≤16.7 ms / 60 fps** goal remains open on the WebGL path (the dropped Phase 7 investigation found it is not renderer-bound). |
| **6b-4 ✅** | **Release checklist (shipped scope):** self-test subset, smoke, map-switch, no-clipping/home checks, screenshot set, doc sync; names the deferred 6b-1 polish and Aero/MSN prop set explicitly | Every listed check passes on the shipped build; the checklist is complete and its evidence named, with deferred items recorded rather than silently missing |
| **7 ⛔ dropped** (Oct 2026) | **WebGPU renderer path — dropped.** Investigated but not scheduled after benchmarks showed no path to the **60 fps** goal (≤16.7 ms at DPR 1.5 with 40 bears on Balanced): parity grass, +0.38 ms fixed overhead, ≈10% from GPU culling only | No work planned; WebGL2 remains the renderer. The 60 fps goal stays open on the WebGL path through grass-fill and per-bear work. Measured findings are retained in the dropped section below and in `PERFORMANCE.md` |
| **8a ✅** (after Phase 5) | **Persistence:** full-state save/load (bears, homes, food, clock, cannon, camera), named slots in IndexedDB plus JSON export/import, New Game, autosave, versioned save format | A save reloads both maps exactly; New Game restores the authored starter colony; 5 slots + autosave coexist, rename and delete; a corrupt/incompatible save fails visibly without killing the current game |
| **8b ✅** (after 8a; Follow deferred) | **Bear directives (Sims-lite):** select a bear and issue a command the utility selector treats as a high-priority, time-limited proposal the bear may refuse, with a legible accept/refuse emote and a short queue | Commands visibly change behaviour; refusal is readable and explainable from needs/personality/health; needs and no-death rules hold; directives persist through save/load; no NaN/stuck/perf regressions |
| **8c ✅** (after 8b) | **Possession / third-person:** direct control of one bear with a follow camera and input-driven waddle; AI suspended for that bear only; grab/throw and a clean exit | Possessed movement is continuous (no jitter/NaN) and stays in the arena; exit returns the bear to AI in place with needs intact; the camera never clips ground or field walls; grabbing other bears still works |
| **9** (after 8a) | **Village & placement editor:** player-authored meadow from the curated library on validated footprints — (9a) editor, (9b) village homes + naming + shared hub, (9c) light jobs and shops; every edit rebuilds nav and re-checks reachability | Zero overlaps and clear door approaches after any edit; no unreachable home or trapped bear in a placement stress test; a layout survives save/load; New Game returns the authored starter layout; a full village stays inside the 6b-3 frame budget |
| **S — Studio modelling** (parallel, required; can run alongside 3–6) | Authored Studio interior/architecture: modular bar, lounge and giant Frutiger-Aero TV; Blender-to-glTF asset pipeline; evaluate Blender MCP as an authoring-time helper | Bar is interactable and navigable; TV lounge is visually complete; modular assets are exported to the repo with license/provenance, tested at bear scale, and integrated without a runtime MCP/Blender dependency |

**Phase 6b order (this release):** 6b-2 ✅ → 6b-3 performance and mobile →
6b-4 release checklist. **6b-1 presentation polish is deferred to a post-release
pass**, and an Aero/MSN prop set is out of scope for this release; 6b-4 therefore
certifies the shipped scope and names both as deferred rather than waiting for
them. The frame budget is measured after the 6b-2 look has settled. The graphics
profiles/settings sheet that previously sat inside 6b already shipped (see
Status); the remaining sub-phases do not rework it. References elsewhere in this
file to the "Phase 6b budget / profile / stress" mean **6b-3**.

## Status

- **Phase 0 complete:** `snapshots/tabletop-phase0.zip` preserves the pre-refactor
  build; `src/world.js` and `src/launcher.js` exist; static walls are destroyable
  handles; per-bear life fields are in place; the 16-check self-test passes.
- **Phase 1 complete:** the cannon can be dragged or moved via Move cannon with
  footprint validation; position persists per map; boundary walls are 8 units
  tall and rebuild on resize; aim/fire and real-pointer tests pass.
- **Phase 2 complete (current scope):** the Grass Field is the default map with
  the Studio switch, independent map state, reflective pond and splash/buoyancy.
  The field has a wobbled 65 m playable disc, 8 detailed Aero villas, a large
  Studio portal house, 10 merged hero trees, 220k procedural grass-card clumps
  tufts, dirt trails, a detailed rolling backdrop with branched trees and 120+ bushes,
  anime-lite water, shared tree/grass wind, procedural clouds, aurora,
  fireflies, a distant Aero skyline and wind turbines. Villa doors are validated
  at 1.646 m against a 1.375 m adult bear. The starter colony remains 2 adult ♀,
  2 adult ♂, one teen and one baby. Camera circular clamping, containment,
  mobile layouts, layout/nav checks, both portals, hide-UI, and the smoke test
  pass. The Studio lounge is queued as the parallel Phase S track.
- **Phase 3a complete:** the meadow has 210 safe edible sources (190 flower
  blooms + 20 fallen jelly-fruit clusters; two hazard hives were added in 3b),
  a food claim/respawn registry, 16 walkable
  pond drinking approaches, hunger and thirst, and a
  WANDER / SEEK_FOOD / EAT / SEEK_WATER / DRINK state machine. Bears travel with
  directional hops, face their next waypoint, nibble/drink, and suspend/resume
  their task while grabbed or thrown. The Studio remains AI-free. Headless QA
  covered hop airtime, unique claims, eating, drinking, respawn, throw/resume,
  Studio suppression and a 20-bear stress run with no NaN or stuck states.
- **Phase 3b.0 complete:** travelling AI hops now use a level crouch/air target
  pose with a ~10° forward lean, and takeoff waits for the measured body to be
  upright. Headless sampling found no airborne ticks below 0.955 measured body
  up (~17°), with the visible pose capped at 10°; smoke, Phase 3a QA and side
  captures pass. Transient `arrived` / `turnWait` / `faceYaw` / hop timing state
  is now cleared on disable, grab and release.
- **Phase 3b complete:** two tree hives are high-value food with a 50% sting
  risk and 15-point damage; health/energy regenerate, woozy bears return home,
  and the roster shows health plus sleeping/night status. Bears claim a villa,
  path to its door at their own bedtime (20:00–22:30) or when hurt/tired,
  disappear into the doorway to sleep, and wake at their own wake time
  (05:00–07:00) once recovered. Each bear also has its own random hop-speed range
  (`0.70–0.95` min, `1.45–1.80` max) stored for Phase 5 inheritance. Headless checks cover health/woozy, hive claims/stings, night
  sleep/wake, speed ranges, UI health bars and the existing wander/eat/drink
  regression path with no page errors.
- **Phase 4 complete:** bears carry social/affection needs and a symmetric pair
  bond keyed by a persistent uid. A lonely bear seeks a nearby friend, offers a
  readable nuzzle handshake, and both switch into a short mutual social; a
  partner can decline with a visible “needs space” state. Hearts and marks are
  pooled field sprites, not per-frame scene allocations. Critical hunger adds
  claimed-food contention: a challenger may approach, both face off in a short
  shove, and the larger/hungrier/bolder bear keeps or takes the source while the
  loser retargets. After a greeting, a bonded pair may walk to the host’s villa
  door and hang out outside; interiors are deliberately deferred. MSN-style buddy
  statuses update for seeking, inviting, socialising, declining, visiting and
  shoving. Headless checks cover natural company seeking, forced accept/decline,
  bond gain, door visits, natural and forced contention, grab interruption and
  social/bond persistence through a map switch with no page errors.
- **Phase 5 complete:** `src/life.js` owns stage ages/scales, courtship gates,
  gestation, inheritance and home capacity. Bears age from baby through teen to
  adult (7 minutes total), and a stage-up rebuilds Box3D bodies, metaball lattice,
  surface and instanced eyes together while deferring if grabbed, airborne or in
  the pond. Babies follow a parent, use the family home and return there at night.
  Satiated, healthy opposite-sex adults court and may conceive without a prior
  friendship bond; pregnancy lasts ~25 s and raises hunger. Births require a
  food reserve and room under the map ceiling and retry briefly when blocked.
  Newborns inherit mother flavor (8% mutation), a blended pace range, parent uids
  and the family home. Headless checks cover starter ages, stage/scale rebuilds,
  natural/forced courtship, pregnancy, birth, cap blocking, flavor/pace
  inheritance, baby following, family homes and life-state map persistence with
  no page errors.
- **Phase 6a core + effects follow-up complete:** the meadow has an optional
  composer with **Off / Soft / Full** selection persisted locally. Soft adds a
  gentle time-of-day grade and restrained thresholded bloom; Full adds GTAO
  contact AO on the high tier. SMAA replaces the composer's multisample target
  so AO and the final sRGB output stay stable. Studio remains on the direct
  renderer. The stack preserves the existing transmission and planar-reflection
  passes, uses half-resolution AO/bloom/god-ray depth, and exposes `setEffects` /
  `effectsState` / `setEffectsBloom` / `setEffectsExposure` / `setEffectsDof`
  plus `shadows()` for headless checks. High quality tiers use real sun/moon
  directional shadow maps (2048/1024) and hide the blob plane; lower tiers keep
  the lightweight canvas blobs. A half-resolution depth prepass feeds the
  screen-space god-ray pass, so sun/moon shafts are masked by tree canopies,
  branches and solid objects instead of only living in the sky dome. The new
  **Depth of field** selector is persisted and drives Bokeh focus from the
  camera distance. Per-bear `bedtime` / `wakeTime` schedules spread sleep from
  20:00–22:30 and wake from 05:00–07:00, persist in snapshots and are inherited
  by family members. A pond recovery path lifts a bear that ends up below the
  lawn/basin at the rectangular pond cutout. The post stack tone-maps sky/cloud
  materials that bypass ACES in the direct path, so the optional tiers have a
  slightly softer sky.
- **Graphics profiles/settings slice complete:** the gear sheet adds
  Auto, Performance, Balanced, Quality and Ultra presets over the existing
  quality tiers, plus adaptive quality, render scale, effects/DoF and meadow
  detail. Presets are live starting bundles; tweaking any control switches the
  label to Custom. Individual settings persist, and the Meadow-detail quick
  controls stay synchronized. Headless checks cover each preset, Custom,
  reset, reload persistence and desktop/mobile layouts.
- **Named time-of-day looks (6b-2 presets):** the time panel gained Dawn / Day /
  Dusk / Night chips. Each applies a full look — fixed hour plus mist, cloud
  density and exposure multipliers layered on the existing palette — turns Auto
  off, persists in `localStorage` and restores on reload; dragging the slider or
  re-enabling Auto returns to a custom clock. Debug hooks: `setSkyLook(name)` and
  `fieldInfo().time.look` / `.mist`. Verified at all four looks plus a dusk pond
  close-up (`verify_look_*`), with the stored look surviving a reload.
- **Pond and cloud tuning (6b-2):** the water shader now takes a `uNight` value
  from the sky and deepens the deep/shallow colours, cell lines, foam, crest and
  splash highlights as night falls, so the pond no longer glows daytime teal.
  The shore wash foam is softer in daylight and dimmer at night, lily pads lost
  most of their clearcoat (they no longer read as white discs under the moon),
  and clouds now survive closer to the horizon instead of vanishing above it.
  Pond probe at 1440x900, DPR 1, quality 2, effects off: **17.9–18.1 ms** after
  vs **17.4–18.5 ms** before (5x60 frames, first sample discarded), i.e. no
  measurable cost. Captures: `pond_final2_{dawn,day,dusk,night}_{close,wide}`,
  `pond_final2_full_{dusk,night}_close`. Cloud shape remains the existing FBM.
- **6b-3 desktop budget met (A); 60 fps deferred:** the baseline matrix (grid
  stress, default camera) measured 40 bears at **35.95 ms Off / 38.77 Soft /
  38.92 Full** on DPR 1, and **34.68 / 44.85 / 44.78** on DPR 1.5. Grass was
  23.0 ms of the 39 ms frame; trees 2.6, villas 0.9, pond 2.3; CPU sim 7 ms at
  40 bears. Changes: a far-grass LOD (single card and half the tufts beyond
  36 m, with hysteresis; 27.11/34.82/34.81 on DPR 1 grid), and god rays
  disabled (they cost ~1.9 ms and read poorly). The **Balanced** profile with 40
  spread bears, default camera, device DPR 1.5 and render scale forced to 1
  measures **32.3 ms** (31.6–32.4 typical, one 22 ms outlier), and **30.2 ms**
  as shipped (scale .85) — inside the **≤33 ms** target. The 16.7 ms / 60 fps
  goal remains open; the Phase 7 investigation showed it is not a renderer
  problem. This was a grid stress scene versus a spread
  population; both are recorded in `PERFORMANCE.md`.
- **Mobile UI refresh (6b-3):** at ≤900 px the bear card collapses into a
  "Bears & toys" sheet and the meadow stack starts collapsed; opening one closes
  the other, both scroll, and the camera hint is dismissed/anchor-aware so it no
  longer lands on the expanded controls. Verified at 390×844, 768×1024 and
  844×390 with settings/help sheets and the UI-hidden state; the desktop layout
  is unchanged. Real iOS/Android hardware was not available, so touch checks are
  emulated only.
- **6b-4 release checklist passed (shipped scope):** `node --check` on every
  module, smoke 30/30, layout valid with no errors, 10 trees / 166 bushes / 2
  hives, no NaN and no shader program errors, nav path clears the old trunk by
  1.02 m, field↔studio switch clean both ways, all four time looks apply and
  the slider returns to custom, effects Off/Soft/Full and the Toon toggle
  render, six rapid drops settle with a 0.89 m closest pair, the cannon fires,
  and no page errors were logged. Phone/tablet captures were added as
  `screenshots/47`–`52`; the user's real-device phone test passed. The local
  `.selftest.html` 16-check harness is absent from this checkout, so physics was
  covered by `stats()` bounds/NaN/vertex assertions only — recorded as a gap.
- **8a persistence shipped:** five IndexedDB slots plus a two-minute autosave,
  versioned payloads validated before apply, per-map bears/camera/cannon/food and
  the shared clock/look, JSON export/import, rename/delete and New Game. Round-trip,
  reload, invalid-save rejection, studio↔field load, traits/camera restore, New
  Game reset and the settings UI were verified end-to-end in headless Chrome
  (desktop and 390×844); no page errors. Offline time does not advance.
- **Main menu, pause and lazy boot shipped (8a follow-up):** the page opens on a
  lightweight menu (Continue/Load/New/How to play) and does not build the meadow,
  grass or physics until a choice is made; Escape pauses with Resume, Settings and
  Return to menu (which autosaves first). `?autostart=1` skips the menu for
  harnesses. Verified headless: menu before boot with no field, Continue disabled
  without an autosave, New Game boot, pause/resume, return-to-menu autosave,
  continue, load-from-menu, reload+continue, autostart, mobile capture.
- **Dev server backlog raised to 64:** the first paint loads ~20 ES modules at
  once; the socketserver default of 5 dropped bursts and produced
  `ERR_CONNECTION_RESET` in headless first-loads (and could affect real first
  visits). Verified by running the menu suite against a second `launch.py` instance.
- **8b bear directives shipped:** select a bear in the roster and choose Go
  here / Eat / Drink / Home / Social. Directives enter the selector as
  time-limited proposals, can be refused for legible need/health/courting
  reasons, show accept/refuse emotes, queue up to three for 45 s, reset to
  normal AI on completion/cancel, and round-trip through save/load. Follow
  remains deferred. Verified headless: panel/selection, hard and soft refusals,
  acceptance and emotes, go/eat/home, queue cap, cancel-to-normal and save/load.
- **8c possession shipped:** V (or Control) takes the selected bear; WASD/arrows
  or the on-screen stick drive the existing hop/waddle cycle, Space hops, and
  V/Esc exits. AI is suspended for that bear only, needs keep ticking, and the
  follow camera stays above ground and inside the arena. **C** switches left
  click between Grab and Select: Select highlights the bear and opens its
  command panel without grabbing, while drag still orbits. The command panel is
  now a separate card below the roster, closes with ×, and the performance
  overlay draws above the meadow panels. Verified headless: enter/exit,
  suspended selector, needs tick, WASD and mobile-stick movement, jump, camera
  follow, panel close, click-mode toggle, no page errors.
- **Next:** Phase 9 (placement editor → village → jobs) or the deferred 6b-1
  presentation polish. 6b-1 stays post-release; the Aero/MSN prop set and 60 fps
  target remain deferred.
- **Studio modelling track queued (parallel, required):** author the Studio
  interior with an interactable bar and a living room anchored by a huge
  Frutiger-Aero TV (references 19–24). Evaluate Blender MCP as an authoring-time
  assistant only; see the dedicated track below.
- **Queued after the simulation (Phases 8–9):** 8a persistence, 8b directives and
  8c possession are shipped;
  then 9a placement, 9b village homes/hub/naming and 9c jobs and shops. The
  6b-4 release checklist therefore also covers save/load, directives, possession
  and placement/nav reachability.
- **Later, opt-in:** Phase 6a is the effects pass (before the 6b-3 optimization);
  Phase 7 (WebGPU) is dropped, so WebGL2 remains the renderer.
- **Tree/bush/backdrop culling + far-leaf LOD shipped (Oct 2026):** per-tree hero
  batches and eight angular sectors with padded bounds cut ~30% of rendered
  triangles and ~2 ms at the default Balanced camera; leaves thin to 60% beyond
  42–68 m. Sectoring without culling is slower, so the split ships with per-pass
  frustum culling. Method and the noisy-headless caveat are in `PERFORMANCE.md`.

**Known follow-ups — unified pipeline (prototype, not accepted):** The new
**Diagnostic correction (same-process comparison, supersedes conflicting chat
claims):** `fixtures/diagnose_geometry_transfer.py` compares `_050` directly with
`hybrid-review-004` at frames 1/20, recording exact object/datablock identities,
raw/evaluated counts, modifier settings, indexed vertices, triangles/materials and
UVs. All 96 pairs have equal evaluated vertex counts and indexed world positions
within 1e-5 m. Trackpad raw is 26 vertices/25 triangles/zero degenerate triangles;
the source modifier stack evaluates to 152 vertices/300 triangles/eight exactly
zero-area triangles, and output has the same counts. This is not evidence of
duplicated trackpad vertices. Raw/evaluated count comparisons and the earlier
"source clean versus duplicated output" conclusions were invalid.
Separate introduced defect: output lid assigns all 7,462 triangles to tangerine,
losing source white/clear material ownership. A disposable two-face control proves
`mesh.materials.clear()` resets face material indices to zero; `restore_assembly`
currently remaps indices before clearing slots. This ordering must be repaired,
with a multi-material negative fixture, before accepting another candidate.
With matched BEAUTY triangulation, 22 parts per pose still have connectivity/material
differences; diagonal-choice effects (including local versus world-space triangulation)
must be distinguished from surface loss. No blanket topology PASS is justified.
Retained-source UV deviations reach only 2.98e-8 in this diagnostic, showing why
exact UV equality was also an unreliable mutation claim. Evidence is under
`.dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/geometry-diagnostic-002/`.
This pass performed no source repair, candidate rebuild or export.

**Resolution (2026-10-21, this pass):** the material-ordering defect is fixed.
`restore_assembly` now writes the remapped face indices after the compacted slot
list exists, and raises if a used slot disappears. `fixtures/check_material_transfer.py`
covers it: three source materials in three face bands survive the join/split round
trip, and a two-band control proves the previous ordering collapsed both bands onto
slot 0 (the fixture fails on that ordering, passes on the fix).
The earlier "22 parts per pose" connectivity differences were a probe artifact. An
index-level comparison that evaluates the source, transforms it to world space and
applies the same BEAUTY triangulate modifier the bake uses reports **all 96 parts
identical at frame 1** and only three parts differing at frame 20 (28 quads total):
identical vertex counts, identical indexed positions within 4.2e-8 m, symmetric
missing/extra triangle counts. Those are float tie-breaks on near-equal quad
diagonals in a different world transform, not surface loss, and they do not occur
at the frame the bake used. Evidence is under
`.dev-shots/asset-pipeline/phase7/benchmark/retro-laptop-detail-001/index-compare/`.
A rebuilt laptop candidate is still required before any delivery claim: the existing
`hybrid-review-004` was produced with the broken compaction.
`atlas-review-006` (2048, fixed code) confirms the repair on the real asset: all 96
parts match their source per-material triangle counts at frames 1 and 20, and the lid
renders its three regions (tangerine, inner white, clear) instead of one.
`hybrid-review-005` (rebuilt with the fix: lid 4096, base 4096, remainder 1024)
reproduces the same 96/96 material ownership at frames 1 and 20 and the same
geometry result (96/96 exact at frame 1; three parts with float diagonal ties at
frame 20). A source capture rendered with the identical rig confirms the bear decal's
white backing and pale tint are authored in `_050`, not a bake artifact, and the
tangerine region matches within 1-3/255 (source 220/155/128, candidate 219/153/125).
The earlier "decal halo is an atlas limitation" note is withdrawn.
**Hybrid export tangents (decided 2026-10-21):** the test GLB (57.9 MB, 98
materials, 294 textures, 16 images) passed the structural audit, clean import and
three.js preview but the Khronos validator reported 148
`ACCESSOR_VECTOR3_NON_UNIT` errors: zero-length tangents on 13 keycap meshes and the
trackpad, caused by degenerate triangles in the active-render `AtlasUV` layer (8-24
per 300-triangle keycap, 43 on the trackpad) plus 13 inherited zero-area trackpad
triangles. Decision: **omit authored tangents** and let clients derive them, rather
than repair sub-texel keycap UVs or exempt known-degenerate geometry.
`export_approved_asset.py` now defaults `export_tangents` off with a `--tangents`
opt-in, and jobs can set `"tangents": true`. Re-exported, the same asset reports
**0 validator errors and 98 `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warnings**
(the documented consequence of omitting tangents on normal-mapped primitives), with
structural audit, dependencies, clean import and three.js preview all passing.
Tangent authoring stays available for assets whose UVs are clean. Evidence is under
`hybrid-review-005/verify-002.json` and `verify-asset-002/`.
**Delivery binding (implemented 2026-10-21):** baked parts now carry their own
persistent `asset_id` plus `pipeline_source_object`/`pipeline_source_asset_id`
provenance, so approval binds to the artifact that ships instead of to the retained
sources. `hybrid-review-006` was the first candidate packaged this way. After the
material merge, `hybrid-review-007` is the current delivery: exported through
`export_approved_asset.py --stage delivery` as
`delivery/retro_laptop_detail_delivery_002.glb`, 56,475,748 bytes, sha256
`c963ff85…7260a15f`, 96 meshes, 98 primitives, **16 materials**, 40,176 triangles,
validator 0 errors and 98 generated-tangent warnings, clean import and three.js
preview passing. Material merge cut materials 98 -> 16 and texture bindings 294 -> 48
without changing ownership or appearance; primitive count is unchanged. The manifest
beside it records the source hash, approval fingerprint, evidence manifests and
limits. Approval scope: structure, material regions, geometry parity and export
verification — not reference fidelity, contact or in-game use.
**Desk-fan delivery (2026-10-24):** `deskfan-001/bake-004/delivery/deskfan_delivery_002.glb`,
11,799,256 bytes, sha256 `48a9d6ad…ddccbd1`, 9 meshes, 3 materials, 27,528 triangles,
validator 0 errors and 9 generated-tangent warnings, clean import and three.js preview
passing. Material ownership 9/9 and geometry exact at frames 1 and 20. This candidate was
baked from the unswapped source with `tile_materials` overrides and is **byte-identical**
to the earlier hand-swapped `bake-003` delivery, so the colour correction is reproducible
from the job alone. The Blender review captures still read the dark shell lighter than the
GLB preview because of their broad key light, not a texture fault.
**Approval attribution corrected (2026-10-21):** the first record attributed the
silhouette approval to the user on the strength of an implementation go-ahead. That
was wrong. The record now names the agent as the approver, carries
`user_acceptance: false` and states that no user silhouette acceptance exists; the
delivery-stage gate still passes against the corrected record. Manifest status is
"structural delivery verified; user acceptance pending".
Side-view comparison against a source render confirms the dark crescent behind the
hinge barrel is authored geometry/shadow, not a bake defect. The base shell shows
visibly less fine speckle than the source; the tiled roughness detail is
lower-frequency in the candidate, and whether that is acceptable is unverified.
Hinge animation is not exported: the GLB carries static closed and open poses, not an
animation clip.
Remaining pipeline follow-ups recorded by this pass:
- **Hybrid assembly roots (fixed 2026-10-24):** `bake_hybrid` parented only cloned source
  parents into the container, so parts whose source had no parent (the desk fan's base and
  stand) stayed outside `DeskFan_Root` and were missed by capture and export. It now adopts
  parentless parts into the container with world transforms preserved; the rebuilt
  `bake-003` container holds all three roots and capture finds all nine parts.
- **Hybrid tile reuse and corrected maps (fixed 2026-10-24):** `repeated_plastics`
  re-binds base colour to the source image, so a colour-corrected PNG is dropped unless
  the material points at it. `tile_materials` now accepts per-material overrides
  (`{"SM_shell_black": {"base": "…_basecolor_corrected.png"}}`); a missing path fails the
  bake and the report records `base_sources`. The earlier fan delivery needed hand-swapped
  image datablocks in the source material; that workaround is no longer required.
- **Delivery approval binding (fixed 2026-10-21):** baked parts now receive their own
  persistent `asset_id` plus `pipeline_source_object` provenance, and approval, evidence
  and manifest targets name those parts, so the gate validates the artifact that ships.
  The original failure (96 `object has no persistent asset_id` errors on
  `hybrid-review-005`) and the chosen resolution are recorded above.
- Posed exports require the evaluated transform frozen first: the glTF exporter
  writes node rests for object animation even with `export_animations=False`, so a
  frame-20 export was byte-identical to frame 1 until `animation_data` was cleared
  and the evaluated `matrix_world` assigned. Documented in the pipeline README.
- **Duplicate atlas materials (fixed 2026-10-21):** `merge_equivalent_materials`
  collapses atlas slots whose source name, image set and alpha linkage agree, after
  the per-slot materials are built and before the assembly is split. The mug candidate
  exports one material instead of two with its three textures intact; the laptop
  rebuild (`hybrid-review-007`) is the scale check.
- **`alpha_mode` report label (fixed 2026-10-21):** the bake report now derives the
  mode from the built materials (`alpha_modes`) instead of "any alpha channel was
  baked", so an opaque job no longer reports `blend`.

The
`tools/asset-pipeline/pipeline.py` and modules remain uncommitted/incomplete. Failed
`atlas-001` laptop images are not deliveries. Preparation originally joined raw
modifier cages and included render-hidden/rejected shells. Preparation now copies
evaluated meshes, excludes `hide_render` meshes, deduplicates selection, clones
materials and retains named source UVs and object-coordinate references. The
disposable `fixtures/check_atlas_preparation.py` passes exact evaluated-world-vertex
and source-preservation checks on three cubes (one hidden, one bevelled), plus 56
face-centroid colour checks (max linear RGB error 0.002799). Generated byte-buffer
sRGB pixels require decoding before comparison; the original diagnostic incorrectly
compared encoded values to linear shader inputs. A stale UV-layer reference after
triangulation was also fixed by re-fetching it. These fixture results do not prove
the laptop bake: sticker/Object-coordinate fidelity, alpha/normal transfer,
visibility at collection level, shape-preserving articulation and export remain
unverified. Export now delegates to `export_approved_asset.py` and blocks without
all four approval/evidence paths; clean import refuses live Blender. Other prototype
defects still need repair before use: render restoration is incomplete; check profiles do not
yet port the established padding/density/coplanar checks; the schema is not enforced;
clean import must only run in a disposable background Blender process.
Continuation: `bake` now permits review-only checkpoints (`export: false`) and
refuses existing output directories. Evaluated Boolean meshes may append unused
null material slots; unused slots are retained, while referenced nulls still fail.
`atlas-review-003` matches the source's evaluated world-vertex multiset exactly
(17,163 unique positions, zero missing/extra). Its colour atlas maps correctly in
an explicit-UV emission diagnostic, including the bear sticker. Its PBR candidate
still fails: removing the normal alone leaves the large black triangle and edge
artifacts; removing alpha as well clears them. Thus alpha/material transfer, not
geometry loss or colour-atlas placement, is the remaining demonstrated blocker.
Making the delivery opaque is not approved. Preserve the original opaque versus
transparent material regions (and assembly articulation) in a shared-atlas approach
instead of forcing the entire laptop into one blended material. `atlas-review-002`
stopped on the unused-null-slot preflight and is not a completed bake. No new GLB
or office replacement was published from these candidates; slices 2–4 remain open.

Current continuation (2026-10-21): separate source parts and opaque/transparent
regions now survive a shared bake, and fixtures check alpha, parent motion and
negative controls. The CLI launches disposable Blender from ordinary Python,
validates supported job fields, delegates rendering to `capture_review.py` and
adapts existing padding/density/coplanar helpers without changing their semantics.
The JSON schema remains descriptive, not a full schema-validator implementation.
The user chose fidelity over material consolidation and explicitly declined
draw-call measurement. `hybrid-review-001` uses dedicated 4096 lid/deck bakes plus
original repeated base-colour images and numerically remapped roughness through
`TileUV` for supported plain plastics; normals remain height-derived bakes.
Open/closed material captures were inspected and the candidate is loaded in live
Blender for review (source `_050` and the user's saved open-pose file untouched).
All 96 output parts pass equal vertex counts and bidirectional world-distance
checks at frames 1/20 with 1e-5 m tolerance. Rounding hashes falsely rejected
boundary coordinates whose actual deviations are at most 4.22e-8 m; the revised
diagnostic is checked against a deliberately translated failing assembly.

**Known follow-ups — inherited trackpad degeneracy (needs decision):** The hybrid
health gate still fails on `Atlas_Trackpad`. Independent double-precision cross
products find eight exactly zero-area triangles in both the evaluated source
`Trackpad` and output (300 triangles each); minimum positive area is 5.84e-14 m².
The BMesh area routine reports nine zero faces, so its count includes a numeric
edge case. Source keycap bevels have valid areas as small as 8.84e-11 m², proving
the old absolute 1e-9 m² cutoff was not a zero-area test; tiny valid faces are now
separately inventoried, with known-good small cubes and deliberately collinear
triangles as controls. Do not remove source geometry, silently waive this gate or
claim the hybrid is delivery-approved. Output-copy-only cleanup, if wanted, needs
explicit scope and topology/interface rechecks. No new GLB, office replacement,
draw-call measurement, commit or push was performed for the hybrid candidate.

**Known follow-ups — UV guides and sticker processing (partly fixed, 2026-10-21):**
`uv_line_guide.py` failed spaced names after writing images; normalization is now
symmetric, validation precedes image publication, and `uv_core.py` wraps both spaces
and underscores. Explicit placement masks carry source-object/UV affine metadata
and reject rectangles outside island raster coverage; scene obstacle detection is
not provided. The prior grey-key sticker extraction punched holes through enclosed
foot shading. `process_sticker_sheet.py` fills enclosed regions behind a white
die-cut border; synthetic saved-colour and alpha controls pass. Raw/keyed green
means differ by less than 0.0001, so a major colour-space conversion error was not
confirmed. Laptop `_050` is a new mask/colour candidate (saturation 1.5, contrast
1.15), not user acceptance: captures show cleaner foot borders but the bear remains
pale under unchanged lighting. Stronger contrast and exact classic MSN reference
fidelity remain deferred; no new generation or host-material edits were performed.

**Known follow-ups — can capture snapshot collision (fixed; reusable helper tracked):** With
`REF_front` or `REF_top` present, the local `cantools.py` visibility loops
overwrote the saved capture snapshot with a Boolean and broke restoration. The
reusable behaviour now lives in tracked `tools/asset-pipeline/scripts/asset_capture.py`
and the local helper delegates to it. `test_asset_capture.py` covers named
references, invalid views, injected render failure and wire mode, and exposed a
stale `matrix_world` after direct camera positioning; the helper now updates the
view layer. Live Blender and can geometry were untouched.

**Known follow-ups — authoring workflow and diagnostics (Phase 4 core repairs fixture-tested):** Mixed successful/multi-criterion candidate histories previously triggered
the incorrect global seven-entry limit in
`tools/asset-pipeline/scripts/construction_gate.py`; fixed with explicit entry classes,
criterion-local budgets and bounded continuation records. Malformed criterion/boolean
attempt values are now rejected without a validation crash.
The user's can audit also reports translation-dependent signed volume, mixed
base/evaluated health, fallback-on-evaluation-error and consumed cutters in an
asset-local helper; subsequently located and repaired through the tracked diagnostic
core. Disposable fixtures verify volume, representation separation and operand
preservation. Capture restoration also preserves quaternion channels and source-world
contents; projection fixtures and inspected captures pass. Legacy ledgers need explicit
classification, never automatic rewriting. No historical asset acceptance is implied.
Stage/capture policy and reference-review authority are now routed through short
entry points; specialist material is preserved. Fresh-session loading, runtime
acceptance and controlled modelling trials remain unverified and separately scoped. The local adapter
remains gitignored; reusable fixes/tests are tracked. See the Phase 4 result record.
See `docs/3d-workflow-review.md` for the requirement map, warnings and deferred checks.

### Skill validation backlog — unverified, not accepted

The new construction/source-production guides and UI/input extensions remain
**unvalidated**. The game-verification split preserves existing procedures, not fresh
runtime evidence. This checklist covers the skill additions/reorganization; pre-existing
asset/tool defects retain their own Known follow-ups below. Documentation checks alone
must not promote any guide to validated or imply model acceptance.

Each row requires both a **higher-tier** and a **lower-tier LLM** evaluation by default; a
row may instead define a scoped **DeepSeek production-lane** gate where the project goal is
DeepSeek-authored output. In that case DeepSeek evidence is the acceptance lane and a
higher-tier control is recorded separately as an optional diagnostic check, not a blocker.
Unchecked means required validation/acceptance is incomplete; partial and failed
evaluations are recorded separately, not erased. Model choices and actual access must be
confirmed before running; record the exact model/provider/variant and run identifiers per
trial. DeepSeek V4.1 Flash is the exercised assisted-stylized lane (see the beanbag row),
not a blanket validation of other rows. No benchmark executions, purchases, installation,
game integration or source rebuild are authorized by this backlog.

| Pending guide/check | Representative test and evidence needed |
| --- | --- |
| [ ] Soft goods | Broad loaded-seat/contact-to-back test; floor/wall/lip/crown presence, calibrated overlays, protected cage/evaluated displacement and no new pinching. Existing beanbag is blocked, not a passing fixture. |
| [ ] Curved products | Section/cap/rim/opening test with thickness, strip-reflection continuity and evaluated mating fit. |
| [ ] Vehicles | One arch/fender/body junction or appropriate non-wheeled equivalent; reference landmarks, thickness and required operating clearance. |
| [ ] Houses/buildings | Exterior/interior wall corner, opening reveal and roof/floor junction; thickness, cutaway coverage and repeated-module seam. |
| [ ] Humanoids | Reference-based primary proportions plus a required shoulder/hip bend; neutral/posed comparison, attachment and facial closure if applicable. |
| [ ] Animals | Species-specific silhouette and representative shoulder/haunch or equivalent junction; appropriate stance and required articulation. |
| [ ] Rigid furniture | Bevelled member/seat/back joint, complete frame/support contact and operating clearance where required. |
| [ ] Sprite normals | Approved tool preflight; asymmetric sprite, flat and inverted-Y controls; alpha/colour-space/convention checks, atlas registration, source timing/loops and playback. In-game evidence only after separate integration approval. |
| [ ] Asset families | One approved representative followed by a small family with controlled variants/states; native-size/contact-sheet review, consistent scale/pivots/material response and complete provenance. |
| [ ] Assisted stylized props and fidelity routing — DeepSeek lane partially exercised | One human-assisted DeepSeek beanbag case exercised gameplay-read cue approval, manual art direction, supplied material reuse, UV review, shape-keyed delivery, clean import and standalone three.js morph preview. See `docs/3d-authoring-notes.md`. Manual intervention was required; this does not validate autonomous modelling, other prop types, reference-faithful routing or in-game performance. DeepSeek is the acceptance lane for this goal; a higher-tier control remains an optional diagnostic check. The later user-supplied can audit reports failed work/recovery, not acceptance; establish current state and repair comparison/tooling under separate approval before resuming. Retain failed submissions. |
| [ ] Shape-repair iteration policy | Distinguish successful construction from failed repairs; test two-unchanged-failure diagnosis, six-failure review, seven-failure stop and explicit bounded continuation without erasing history or downgrading a required feature. |
| [ ] Background-prop delivery and runtime budget | Agree screen size/camera range, instance count, triangles/materials/textures; inspect reduction at that scale, verify re-imported export counts/UVs/materials and separately approved game loading, lifecycle, appearance and measured performance. A vertex count alone cannot pass. |
| [ ] Shared game-first contract across all categories | With both model tiers, exercise each of the seven construction guides under approved runtime geometry/material/texture budgets. Check modest source construction, reuse, category-specific repetition/deformation/alpha costs and separate delivery verification. A reference-faithful task must not be silently stylized; dense CGI/bake sources require explicit purpose/approval and must not become default runtime output. Preserve every existing safety/export/runtime gate. |
| [ ] Reference coherence, motion contracts and reversible material previews | With both model tiers, identify contradictory part/attachment layouts before building; choose minimal controls and prove one moving region before detail/replication. Check rest/recovery, allowed control combinations, contact and intermediate states through viewport review. Exercise existing-map previews without treating wiring as delivery approval or silently correcting/regenerating maps. These extensions remain unvalidated; a published case study is not project acceptance evidence. |
| [ ] UI/input extensions | Real boot/menu readiness, supported focus/device transitions, multiple viewport/aspect cases, interaction assertions, persistence where affected and bright/dark native-size captures. Hardware not exercised remains unverified. |
| [ ] Verification routing and completeness | Compare original requirements/commands with all seven extracted references; verify links/paths, cumulative routes for cross-system changes, stage/evidence rules and no dropped acceptance criteria. Exercise representative browser, behavior/save, physics/map, rendering/UI and performance tasks. |
| [ ] Dual-tier end-to-end usability | Apply the protocol below to every guide and routing scenario; retain failures as well as passes. A successful higher-tier run cannot certify the lower-tier lane or vice versa. |

For dual-tier comparisons, use equivalent isolated starting states, briefs, references,
tool permissions, acceptance criteria and declared run budgets. Record exact model/provider/
variant, tool/skill/source versions, prompt, available tools and run identifiers. Use fresh
independent sessions; preserve authoritative sources and user work, and respect live-Blender
resource/safety gates. Repeated samples must not be selected only for success; document
sample count, failures and any manual assistance. Serialize resource-heavy runs.

Score **routing/instruction adherence, preservation/safety, functional/structural result,
visual/reference fidelity and reporting honesty separately**. Use known-good and deliberately
failing fixtures to check that diagnostics detect absence, regression and wrong assumptions;
unsupported operations must produce an honest stop rather than invented evidence. A human
reviews the named captures and outcomes independently of the builder's completion claim.
Record time, calls and cost where available, without treating tier/speed as quality evidence.

Keep reports and captures in `.dev-shots/` and concise coverage/failures in
`docs/3d-authoring-notes.md` or the affected topic doc. At review, update each lane's status
and tested scope explicitly. A guide may report a precisely scoped partial exercise when
the named evidence supports it; do not promote the broader guide to validated from one
asset, links/format checks, clean topology or an LLM's self-assessment. Keep unchecked
backlog rows open while any required tier or representative scope is missing. The
verification router and guides contain no new runtime dependency; an unavailable
tool/model is a named coverage gap, not a pass.

Initial independent beanbag submissions from the user-labelled DeepSeek and GPT-6.1 Sol
sessions have been reviewed from reports, captures and both live final meshes. Both fail
their original reference-fidelity brief; neither validates soft goods. Preserve those
submissions and their original attempt histories. The user now requests a cutesy background
prop workflow with human direction rather than exact dimples: that is a new assisted
production lane, not retroactive benchmark acceptance. Review findings, measured counts
and cost-evidence limits are in `docs/3d-authoring-notes.md`. No model edits, optimization,
export or integration are authorized by these documentation changes.

**Known follow-ups — deformation evidence (deferred; code inspection only):** With a stationary
object root, distinct shape-key or bone poses can be rejected as identical by
`tools/asset-pipeline/scripts/check_evidence.py`: its multi-manifest distinctness test compares
only controller world matrices recorded by `capture_review.py`. Expected behavior is to
distinguish the requested deformation states without moving the root. Separately,
`asset_fingerprint.py` hashes shape-key values/coordinates but not explicit bone poses;
armature dependencies include object transforms, not evaluated bone matrices, so pose edits
can evade freshness checks. No Blender reproduction or tool fix was performed in this
documentation pass. A separately approved extension should record selected shape-key values
and evaluated bone matrices, define appropriate distinctness/freshness checks, and test
unchanged roots with changed morph/bone states, genuinely identical states, stale evidence
and existing object-transform captures. Preserve source state during checks; do not move
roots or weaken acceptance to work around the limitation.

**Known follow-ups — shape-preservation and UV diagnostics (deferred tooling):** UV/material
edits legitimately change the whole-asset fingerprint, so preservation checks need a separate
geometry-only report covering ordered connectivity, base/all shape-key coordinates and key
settings, transforms and modifier configuration. Add fixtures where UV-only edits preserve
those signatures and where reordered vertices, a changed key or modifier must fail.
The skill's `scripts/uv_report.py` currently reads the active UV layer and reports density,
not directional stretch. A separately approved extension should select a named layer, report
stretch/shear and worst face locations/area, robust and area-weighted summaries, and retain
clear exclusions for overlap/padding checks it does not perform. Validate with known-good,
sheared, anisotropically stretched, collapsed and tiny-extreme fixtures, including subdivision
and deformation states. No helper implementation or validation is included in this doc pass.

**Known follow-ups — assisted beanbag underside UV (unresolved, not accepted delivery):** In
`beanbag_stylized_source_041_uv_bottom_seam_review.blend`, live inspection of
`Fabric_UV_Seam2` found one 370-face source island and 14 isolated one-face islands, with
36 discontinuous UV edges. The underside checker shows concentrated pinching; evaluated
high-density triangles lie near the sole. Marking all edges whose endpoints pass a height
threshold does not identify a cap perimeter. Next propose a UV-only candidate with an
inspected connected underside patch and deliberate perimeter, preserving geometry/keys and
prior UV layers. Check the lower visible body as well as the sole. Do not waive hidden-region
acceptance, reshape the bag or export this diagnostic layout as a clean delivery. Evidence
and the distinction between reported history and inspected state are in
`docs/3d-authoring-notes.md`.

**Known follow-ups — beanbag reference orientation (side mapping fixed; source unchanged):** The calibrated
`Ref_Side` in `beanbag_source_026.blend` places the back toward −Y, whereas the source
body and `beanbag_sphere_test_001.blend` candidate place it toward +Y. An aligned
side overlay exposes opposing profiles. Following user clarification,
`beanbag_sphere_test_003.blend` restores the candidate's original rotation and flips
only `Ref_Side`'s horizontal UV mapping. Plane scale, position, other references and
`_026` remain unchanged. The inspected `sphere-test-003/side_overlay.png` aligns direction,
but proportions and the seat transition still need refinement before silhouette acceptance.
Evidence is under `.dev-shots/asset-pipeline/beanbag-001/`.

**Known follow-ups — beanbag sphere dent (blocked, not accepted):** Broadening the dent
falloff in `_005` removes the sharp front lip, but does not convincingly reproduce
the reference's raised seat cushion. Moving/deepening the Gaussian in `_006` also
deforms the UV-sphere crown and introduces radial pole pinching. That regression was
reversed to the `_005` deformation in `beanbag_sphere_test_007_recovery.blend`, checked
in `sphere-test-005/recovery_007_seat.png`; evaluated non-manifold edges, loose vertices
and inconsistent winding are zero. Silhouette, cushion and pole handling remain
unaccepted; no detail, bake or export is authorized by these structural results.
The subsequent user-approved sitting-area test is `beanbag_sphere_test_008.blend`:
Gaussian width controls increased from 0.333/0.336 m to 0.44/0.43 m without increasing
amplitude, with the added depression tapered away at the crown. Inspected front/top/
seat solids and side/top overlays are in `sphere-test-008/`. The seat is broader and
the crown is retained, but the cavity reads shallow and the reference's raised seat
cushion is still not established. Topology checks remain zero for non-manifold edges,
loose vertices and inconsistent winding; this is a shape test, not an accepted asset.
Measured falloff-only tests `_009`/`_010` did not resolve the seat and introduced
inner-back/corner pinching. Both were rejected; `_011_recovery` restores `_008` with
zero evaluated index-wise displacement and identical ordered connectivity. The
six-attempt review blocks further blind tuning; detailed measurements and uncertainty
are recorded in `docs/3d-authoring-notes.md`. No topology rebuild or delivery occurred.

**Known follow-ups — StableMaterials loader (needs diagnosis):** Earlier API requests
failed at `LoadStableMaterials` with OOM, while subsequent UI and shared-runner requests
succeeded on the same 16 GB server. The laptop job now matches successful UI settings
(Standard loader, 4 steps, 1024², CFG 7.5). Changing steps does not explain a loader-stage
failure; server/cache state remains unverified. Do not infer a larger-GPU requirement.

**Known follow-ups — reusable ComfyUI runners (needs decision):** the StableMaterials runner
still passes `--seeds` strings to an integer-only validator, can lose the server prompt ID on a
failed job, and infers outputs only from a direct `SaveImage` connection. The new
`scripts/run_comfy_workflow_qwen_image_edit.py` handles all three for its own path (numeric-string
seeds, prompt ID recorded on every outcome, output scan across nodes), but the StableMaterials
runner was not changed in that scope. Decide whether to port the same handling.

**Known follow-ups — laptop stickers (accepted tooling test, limits):** `_049` adds a
`StickerDecal` UV layer (lid tangerine panel, palm front-left quadrant) and a UV-mapped decal mix
in `Lid_Tangerine_Plastic` plus a `Shell_Clay_Base_Sticker` copy assigned to `Shell_Base` only, so
`Shell_Base_Rear_Spine` keeps the original material. Artwork came from Qwen Image 2.1 at 1024²
through the new runner with the labelled UV guide as image 1. Qwen's own placement drifted (the
palm sprite sat under the trackpad, the lid sprite crossed the white arch boundary), so the
sprites are re-composited in UV space at explicit world rectangles before use; raw output is kept
as evidence. Limits: the lid bear reads pale and low-contrast on the tangerine plastic, a faint
residual drop shadow remains inside the silhouette, the decal PNG is external and unpacked, and
only `.dev-shots/` holds the checkpoint. Geometry, face assignments, alpha and transmission were
preserved.

**Known follow-ups — UV verification (fixed/untested):**
Painting-guide delivery (2026-10-20, prototype-003 layout preserved): `paint_reference_guides.py`
exports clean, labelled and legend PNGs at actual 1280² and 4096² from the unchanged authored
`UVMap`, fingerprint-bound to the 98-island surface evidence. All 98 islands have a numeric ID;
24 carry the previously reviewed development names and 74 are explicitly `UNRESOLVED`.
Named charts now use a full name inside (wrapped to 2–3 lines where needed) or a leader callout;
they never silently fall back to ID-only. Unresolved labels on the guide are ID-only. Validation
asserts both rules for every island. Reviewed after feedback: 53/63 were originally ID-only due
to the fallback; 53 is named in both resolutions and 63 remains ID-only because it is unresolved.
41 callouts at 1280 and 40 at 4096. Both labelled sets and legends were visually inspected at
1280; the 4096 set was inspected downscaled plus native crops of 53/63, PNG structural decode
and per-island label manifest. All six outputs decode at their declared dimensions; source file
hash remained unchanged. Limits: names beyond the 24-island development subset are not newly
verified; existing UV overlaps (six charts) remain in the layout and are neither repaired nor
waived; clean guide is UV outlines, not generated albedo; no bake, padding, material-transfer
or export certification. Outputs: RaptorRC `out/body_paint_reference_008/`.
Layout-tool bake-off (2026-10-20, Mio3 UV + Auto Unwrap 2): the six actual self-overlapping
charts are the named panels 6, 7, 31, 45, 62 and 66, not the thin strips implied by the
unsorted chart-order audit. Selective repair used isolated per-chart operands, Mio3
`uv.mio3_unwrap` MINIMUM_STRETCH, refit into each chart's original footprint, then one
full-sheet repack at `8/1280`. It preserved all 98 face sets, so the 24 reviewed names and
stable IDs were rebound by exact face set (fingerprint `96cf9bdc…`). Residual: 26
triangle-pair intersections at 1280 in two charts, max normalised UV area 2.1e-5, plus three
zero-area UV triangles from source slivers; no out-of-bounds, truncated or shifted charts.
Auto Unwrap 2.0.0 hard-surface Smart UV at 8/16/30 parts gave 55/80/68 groups but retained
10–15 self-overlapping chart IDs, so it was not selected. Its `smart_uv` blocking `execute`
path can be scripted; the organic `unwrap` path is panel-only. Guide callouts now avoid
both chart fills and drawn outlines. Output: `out/body_paint_reference_011_mio3/` (98 IDs,
24 names, 74 unresolved, 42/43 callouts). This is the preferred guide, but it is not
generation-ready until the residual slivers are accepted or deliberately repaired.
Read-only `tools/uv-layout-extractor/scripts/uv_layout_gate.py` reports geometric overlaps
`10/17/37`, three zero-area UV triangles, no out-of-bounds or truncation, and **zero raster
pixel conflicts** at 4096; it PASSes with warnings by default and FAILs under
`--strict-geometric`. Flipped-face orientation is not covered.
`tools/uv-layout-extractor/scripts/uv_color_layout.py` adds the dark full-bleed colored sheet
(1280/4096) with deterministic per-island colors and a green 0-1 frame, no title/labels/stats;
011 reports 46.1% UV space used. Auto Unwrap repack reached 58.0% but moved charts enough to
break label placement, so it stays an optional density experiment. Colours follow guide-ID
order, matching `labels.json`. Outputs: `out/body_paint_reference_011_mio3/color_final/`.
Evidence: `out/body_paint_reference_011_mio3/evidence/`.
Approved triangle-copy test (2026-10-20, selective body attempt 2) freezes exact evaluated
loop triangles and authored corner UVs; folded-chart and warped-quad fixtures pass.
Actual body trial reduces overlap to one chart but retains one zero-area UV triangle
and introduces seven non-manifold edges, already present in its triangulated baseline.
Independent face-incidence counting confirms each affected diagonal has four incident
triangles from two original n-gons. Stopped the branch; source/live original untouched.
Failed artifact: RaptorRC `.dev-shots/body_paint_copy_003/` (NOT accepted).
Mechanical safety guard now rejects newly non-manifold triangle diagonals before unwrap
or checkpoint save. Broad/warped/folded and deliberately duplicated-face conflict fixtures
pass in `.dev-shots/paint_unwrap_fixtures_004/`; first conflict fixture used opposite
quad diagonals and was corrected after inspecting that diagnostic, not weakening the gate.
Guard recheck on the original body rejects all seven conflicts as expected. Next repair
is a topology/seam design decision; no clean paint unwrap or complete tagged guide claimed.
Texture-generation goal clarified (2026-10-20): original material transfer is not a
prerequisite for a new paint unwrap. Source materials stay protected, but a separate
working copy can use neutral preview shaders. Every guide chart requires a stable ID
and verified name or explicit unresolved tag; clean generation images stay label-free.
Body selective-unwrap attempt 1: evaluated copy retains 98 authored charts; six have
self-overlaps. Isolated conformal operands pass a deliberately folded two-panel fixture,
but repair/repack of the six actual charts still fails (five self-overlapping charts,
one zero-area UV triangle, including new failures on two previously clean single-face
charts). Stopped this edit chain; source/live file unchanged and pre-edit baseline saved.
Source inspection finds n-gons in every affected chart (up to 18 corners); some deviate
from their face plane by ~9.8 mm. This is evidence for investigating triangulation,
not proof of the unwrap failure's cause. A triangle-preserving evaluated copy is a
proposed topology decision, not yet implemented; no failed unwrap accepted or labelled
as final. Source evaluated topology checks: zero boundary/nonmanifold-nonboundary edges,
loose vertices and inconsistent-winding edges; visual outward orientation unverified.
Evidence: RaptorRC `.dev-shots/paint_unwrap_fixtures_001/`,
`.dev-shots/body_paint_copy_001/` and failed `.dev-shots/body_paint_copy_002/`.
Model-independent allocation tooling added (experimental): `uv_allocation_report.py`
accounts for all scene meshes, flags per-chart thin/subpixel/zero-area/bounds risks and
missing UVs, writes a PNG overview, local HTML object/chart picker and all-pending
treatment template. `uv_allocation_trial.py` requires complete fingerprint-bound
object-level choices (main/additional/material-only), repacks independent copies only,
refuses modifier-bearing paint objects and saves diagnostic checkpoints, never source.
Four pure tests and disposable Blender broad/thin/zero/missing-UV plus two-sheet policy
fixtures pass. Chassis report accounts for 45/45 objects, all pending; no truck treatment
choices applied. PNG overview inspected; HTML browser interaction remains unverified.
Chart-level treatment execution, overlap/padding/bake/PBR acceptance remain deferred.
Evidence: RaptorRC `.dev-shots/uv_allocation_generic_fixtures_002/` and
`.dev-shots/uv_allocation_generic_chassis_002/`. Model-specific coil helpers remain
experimental historical probes, not the generic workflow.
Coil-only allocation trial (2026-10-20, one targeted attempt): authored Coils has 483
charts, no zero-area triangles and minimum triangle altitude 1.760 pixels at 4096;
chassis-packed charts retain that count but minimum altitude falls to 0.351 pixels,
with 3,399 triangles below one pixel wide. Repacking existing charts onto a separate
diagnostic coil sheet, without unwrap, gives mapping PASS: all 16,088 triangles sampled,
zero subpixel/resolution-loss/uncovered triangles, maximum sampled UV error 0.00502%.
Fingerprint assertions preserve geometry, authored UVs, transform, material slots and
the input chassis file. This supports allocation loss as a repairable mapping problem;
does not certify topology, visual guide readability, padding, overlap or original PBR transfer.
Saved diagnostic only, not a replacement delivery:
RaptorRC `.dev-shots/coil_sheet_trial_001/coil_only_trial_001.blend`, with manifest and
`mapping/transfer_check.json`. Other failed sheets remain unresolved; no automatic rollout.
Corrected 4096 zero-margin rerun (2026-10-20): five diagnostic fixtures pass; wheels
PASS with all 15,400 triangles sampled, trim checker PASS with 24 subpixel triangles and
seven approved material-only exclusions. Glass/lights, interior and chassis FAIL on
below-pixel resolution loss and/or unsampled regions; no acceptance exceptions added.
Chassis Coils retains exactly the same maximum error (0.95614), 48 resolution-loss
triangles and 1,011 unsampled triangles in an isolated bake as in the full sheet.
Independent pixel audit finds ten high-error samples have black pixels and a missing
blue emission marker: these are unbaked sample locations, not evidence of cross-object
bake interference or proof that source geometry is wrong. Exact rasterization cause
remains unresolved. No geometry, source UVs or saved source files changed.
Deferred pending targeted diagnosis/repair decision; padding/PBR transfer unverified.
Evidence: RaptorRC `.dev-shots/category_zero_margin_002/` including
`coils_batch_pixel_audit.json` and `coils_isolated/transfer_check.json`.
Source provenance blocker resolved: `raptor_rc_166_body_glass_chassis.blend1` exactly matches
historical SHA `8355741d...`. Read-only inventories of current 166 and that backup show identical
422 meshes (vertex/edge/loop/polygon data, UV arrays, face material indices), 464 objects
(transforms, parent/slot assignments, modifier/constraint settings), 47 materials and 17 image
records (including packed bytes). Extended comparison also matches checked scene settings,
collections, cameras and lights. The only observed difference is the Layout 3D viewport's
saved rotation quaternion. The trim copy's embedded historical source meshes/materials match.
No basis for a model-change accusation or a rebuild from the hash alone; save attribution
remains unknown. Inventory is not animation or export validation. Evidence: RaptorRC
`.dev-shots/source_provenance_001/`. The earlier hash-only blocker below is superseded.
Source provenance blocker discovered during the material-policy pass: source 166 now hashes
`04a728d6...` (mtime 2026-10-20 00:12), versus historical category baseline `8355741d...`.
No save to the source was performed by this pass. Current material inventory supports the
seven policy assignments, but the paint-mapping result applies only to the older trim copy.
Reconcile current source and category copies before claiming current-source delivery or export.
Approved material-only decision: preserve `Grille_HorizontalMesh_Final` on `RC_FittingDark`
and all six `Hood_Louvre_{L,R}_{0,1,2}` on `RC_Fitting_Dark`, excluding them from paint-atlas
requirements, not model delivery. Read-only source-166 inventory confirms both materials have
no image textures or linked Base Color/Roughness/Metallic/Normal inputs. RaptorRC
`paint_material_policy.json` records the seven exact objects/material slots and constraints.
The checker accepts `--material-policy`, verifies exact assignments and records exclusions
as MATERIAL_ONLY_NOT_TESTED, never as passing mappings. Existing category sheets are not rebuilt.
4096 zero-margin trim rerun under the approved policy: 39/39 tested objects PASS; p95 0.0217%,
max 0.0388%, zero uncovered/resolution-limited triangles; 24 subpixel triangles remain explicitly
listed (sampled world-area fraction reports 1.0). Evidence: `.dev-shots/trim_material_policy_001/`
in RaptorRC. All 46 trim objects accounted for (39 tested + 7 preserved); this does not certify
delivery padding, semantic tags, original material-channel transfer or export.
Pixel-centre sampling defect fixed: requested barycentric points were rounded to texels,
but expected source UVs were evaluated at the unrounded point; thin triangles often sampled
outside their own raster footprint. Read-only grille pixel audit found 2,539/3,384 requested
samples outside their triangles; 845 valid centres had max error 0.044%. The checker now
uses `transfer_sampling.py` to reject out-of-triangle centres and interpolate the expected
source UV at the actual centre, uses the maximum valid sample error instead of the median,
and records uncovered triangles without promoting them to PASS. Four pure fixtures and all
five Blender fixtures pass. Corrected isolated grille result: 196 sampled triangles, p95
0.0315%, max 0.0381%, 768 resolution-limited and 164 uncovered triangles. It remains FAIL;
the sampling fix does not solve insufficient texture resolution. Evidence: RaptorRC
`.dev-shots/pixel_centre_verification_001/` and the previous margin diagnosis pixel audit.
No model, UV or packing changes were made; whole categories need later re-verification.
Controlled trim margin diagnosis: RaptorRC `.dev-shots/trim_margin_diagnosis_001/` holds
skid-only zero-margin, full-sheet zero-margin and 46 separate-object zero-margin bakes at
4096, using unchanged UVs and identical sampling. Every object's isolated report is exactly
equal to its full-sheet zero-margin report (`individual_comparison.json`: 46/46). The skid
plate p95 is 0.067% in both (versus 29.40% in the earlier margin-4 batch); trim pooled p95
drops from 0.227% to 0.070%. This establishes bake-margin contamination as the batch-only
failure cause, not material replacement or a necessary skid-plate geometry repair.
At zero margin: 39 objects PASS, one grille object FAIL, six louvres INCONCLUSIVE. Grille
has 768 below-pixel resolution losses plus high sampled errors; louvres each have 16 source-
subpixel triangles and 12 sampled triangles. All persist in isolation. Do not waive them or
call the sheet accepted. Zero margin is a diagnostic control, not a delivery padding solution;
packing gutters, dilation and mip-safe padding remain unverified. The checker now exposes
`--margin` and records margin/resolution in reports. No geometry/UV edits or category rebuilds.
Corrected Emission category rerun: RaptorRC `.dev-shots/category_emission_001/` contains
4096 gradient bakes, complete per-object JSON reports and logs (no checker renders).
Wheels: PASS, p95 0.014%, sampled world area 100%. Interior: FAIL, p95 50.34%, area
99.87%, 164 below-pixel resolution losses and 116 source-subpixel triangles. Glass/lights:
FAIL despite p95 0.051%, area 82.86%, 23 resolution losses and 159 subpixel triangles.
Chassis: FAIL, p95 61.33%, area 99.77%, 2,950 resolution losses and 68 subpixel triangles.
Trim: FAIL, p95 0.227%, area 99.997%, 768 resolution losses and 120 subpixel triangles;
33 objects PASS, 7 FAIL, 6 INCONCLUSIVE. Category failures were not repaired or waived.
Crucially, the skid plate passes alone (p95 0.067%) but fails in the trim batch (29.40%).
Investigate shared bake interactions, margins, raster sampling and cross-object coverage
before treating this as evidence for geometry/UV repair. No captures were produced in this
numeric rerun, so visual acceptance remains outstanding. Some objects labelled PASS by p95
still have large maxima (roof-light lens max 23%); percentile-only acceptance is insufficient
for complete surface verification. Thresholds have not been relaxed.
Mixed-object fixture completed: RaptorRC `.dev-shots/emission_fixtures_003/` contains 200
correct triangles plus four on a small object with stacked target UVs. Pooled p95 is only
0.199%, but that object's p95 is 50.04%; the category correctly reports FAIL. All five
fixtures pass their expected verdicts. The earlier missing mixed-object test is now covered;
this does not certify unsampled surfaces or original PBR transfer. Truck categories remain
pending re-verification with the corrected checker.
Edge-case verification: `.dev-shots/emission_fixtures_002/` in RaptorRC passes four Blender
fixtures: rotated metallic mapping PASS, stacked UVs FAIL, all-subpixel input INCONCLUSIVE
without crashing, and formerly resolved UVs squeezed below one pixel FAIL. Empty sampled sets
now yield null statistics instead of an indexing error. Reports add sampled world-area
coverage and area-weighted mean error; failures/inconclusive objects block a category PASS
instead of being hidden by pooled percentiles. Mixed-object aggregation still needs its own
fixture. The legacy `collapsed_faces` counter denotes below-pixel resolution loss, not proof
of zero-area UVs; limits are recorded in every report. No truck category was rerun here.
2026-10-20 verification update: the Emission checker passes a fully metallic rotated-UV
fixture (p95 0.205% at 256) and rejects deliberately stacked target UVs (p95 50%). On
`ATLAS__Front_SkidPlate_Final` alone at 4096, all 156 loop triangles are sampled, none are
sub-pixel/flagged collapsed, and p95/max errors are 0.067%/0.078%. No UV or geometry repair
was needed. This supports a material-dependent false failure in the old Diffuse test, not a
verified failure of this part's layout. The viewed capture has neighboring trim occlusion;
hidden surfaces remain visually unverified. Evidence: RaptorRC `.dev-shots/emission_fixtures_001/`
and `.dev-shots/skid_emission_001/`. Remaining categories have not been rerun. Sub-pixel
classification, all-unsampled inputs, per-object acceptance and area-weighted reporting still
need dedicated fixtures; do not extend this single-object result into full delivery acceptance.
- `--atlas-resolution` was recorded as metadata only; every guide image/mask is written at
  `--guide-resolution` (1280). Manifests now expose `atlas_images_written` (true only when the
  atlas and guide resolutions match) and the docs state the limit. A real 4096 render pass is
  still unimplemented.
- The repacked transfer checker baked Diffuse Color, which is black on metallic and
  transmissive materials, and compared a single centroid. It now bakes an Emission gradient,
  samples three interior points, excludes genuine sub-pixel faces, separately flags faces
  squeezed below one pixel, validates material replacement and the active UV layer, and reports
  per-object conclusive coverage. Earlier category failures may therefore be checker artifacts.
- These fixes are CPU-reviewed only; Blender is paused. Re-test one failing object before
  rerunning the categories, and update the saved reports afterward.

**Known follow-ups — UV guide delivery (fixed):** the Raptor body template was exported
before the final body/hood unwrap, and its PNG declared RGB with a grayscale-sized payload.
`body_uv_template_2048.png` and the old wireframe are not current paint guides. Corrected
checkpoint-166 `body_uv_166_2048_v2_*` guides preserve geometry/UVs and carry source hashes;
both authoring packages now require saved-byte validation and inspected UV/albedo overlays.
The PNG regression fixtures explicitly reject this channel/payload mismatch. Structural
validity is not a padding/overlap or bake-quality verdict.

**Known follow-ups — semantic UV tooling (prototype/deferred):**
Exporter audit: ID colours previously collided (5,593 ids, only 1,014 RGB values).
Fixed with a 24-bit permutation and a reserved-background swap; four pure fixtures cover
uniqueness, range, background and actual face-slot lookup. Face materials now use their
resolved object slot, not slot zero. Mixed-material islands fail explicitly until per-face
zone coverage is supported. Existing atlas files are not regenerated by these repairs.
Global positive-area overlap checks (including same-island overlaps), fail-before-publish
staging and selectable atlas/guide resolutions are now implemented and pass pure/Blender
fixtures. The atlas-copy trial is **blocked after two failed layouts**: Smart projection
failed, and seam-derived Angle-Based unwrap still has 24 self-overlapping islands and 48
degenerate UV triangles (no out-of-bounds UVs). Affected examples include Body_Shell,
Coils, Dashboard_Main, Interior_Firewall and hood vents/louvres. Geometry and original UV
hashes are preserved. Both `RaptorRC/out/atlas_delivery_00{1,2}/` checkpoints are explicitly
FAILED recovery states, not deliveries; `guides_1280.staging/FAILED.txt` prevents publication.
See `.dev-shots/atlas_failure_002/` for the viewed diagnostic and source-face inventory.
Attempt 3 applied per-face charts to the 13 failing objects and repacked globally. It repaired
Body_Shell, Coils, Interior_Firewall, the cowl/louvres and Chassis_Frame, but 8 objects still
fail: Dashboard_PassengerInset, RearLamp_Housing_R, RearLamp_Lens_R and Reservoirs self-overlap;
72 collapsed UV triangles remain across those plus RearLamp_Housing_L/Lens_L and Body_Shell.
`out/atlas_delivery_003/` is also explicitly FAILED; no guides were published. Three layout
strategies have failed, so the stop rule is active: the remaining chart-specific repair needs
approval, not a fourth blanket unwrap.
Unit-consistent audit correction: with normalized UV area and world-space 3D area, attempt 002
has **0 collapsed UV triangles** and 46 genuinely source-zero triangles; its defect is overlaps
(12 objects, largest about 9 px² at 1280). Attempt 003 has **3 collapsed UVs** (Body_Shell) and
71 source-zero, and introduced sub-pixel overlaps in five objects that were clean in 002
(Dashboard_PassengerInset, Glass_Windshield, RearLamp_Housing_R/Lens_R, Reservoirs). Re-unwrapping
healthy objects therefore caused regressions, so 002 is the better baseline. Independent
hull-based verification (not the clipping helper) found 64 intersections in 003, 15 within one
face, so per-face charts do not guarantee fold-free non-planar faces.
Two chart-local repairs of the 44-face Firewall chart were tried on 002: best-fit-plane
reprojection left 187 pairs (the chart is a thin shell with opposed normals), and a seamed
unwrap produced 4,248 pairs with 167 same-face overlaps (Blender's pack step also moved other
charts). Both are FAILED diagnostic checkpoints in `RaptorRC/out/atlas_repair_004/` and `005/`;
no guides were published. The stop rule is active: the next chart repair needs a controlled
approach and approval, not another automatic reprojection or chart-local pack.
Texture transfer, final atlas/export validation and unattended vision integration remain
unexecuted.

Single-component proof on evaluated `Dashboard_Main` (192 verts/194 polys, authored seams +
open boundaries + >60° angles, Angle-Based unwrap and pack): 7 islands, bounds OK, median
relative texel density 1.008 (p05 0.973, p95 1.106), geometry and source `UVMap` hashes
unchanged, checker renders regular, and a constant-base-colour albedo bake transfers within
1.5% per face. **Exact acceptance still fails:** 30 positive-area overlaps, dominated by one
real band overlap (faces 192/68, 1.3e-4, same 54-face island, coincident split edges); 11 of the
smaller pairs involve near-degenerate source triangles (<1e-8 m²). Checkpoint:
`RaptorRC/out/component_proof_004/` with `README_FAILED.md`. Earlier proof runs are tooling
failures (no pack, wrong seam threshold, shared-mesh material loss). Next: add a deliberate
seam that separates the offending band, then re-run this same proof; do not reproject the whole
component again.

Prototype-3 correspondence and body transfer check (approved milestone):
- `out/uv_semantic_prototype_003/semantic_overlay.png` was drawn from the saved `Body_Shell`
  `UVMap`; the saved fingerprint matches `f095ee9...`, and the label skips are identical on
  regeneration. Current naming code differs for **islands 6 and 66 only** (bed-floor names became
  `unknown`), giving 22/24 instead of 24/24 on the same development benchmark. That is a naming
  regression, not a layout change.
- Body texture round trip on the authored layout: 4,528 triangles, median per-face max-channel
  delta 1.4%, mean 1.5%, p95 3.5%, max 31% (seam/margin outlier); baked atlas and original/baked
  renders visually match. The source JPG must be decoded from sRGB to linear before comparison;
  comparing raw byte-image values falsely reports ~26% mean error.
- Conclusion: prototype 3 is a readable **body-paint guide**, not a whole-truck atlas; 76 body
  islands remain unnamed and 5 labels are skipped for space. Evidence:
  `RaptorRC/out/body_transfer_check_003/` and `out/uv_semantic_prototype_003_verify/`.

Body guide delivered (body-only): 98/98 islands named, 24/24 development benchmark, 4096 atlas /
1280 guide, masks, island manifest, ID sheet, full legend and `id_crosswalk.json` in
`RaptorRC/out/body_guide_004/`. Six authored self-overlaps remain (≈64 px² at 1280; islands 32,
35, 43 carry almost all of it) and are explicitly recorded with `overlaps_allowed: true`; 63
long labels are legend-only and 3 masks are below 16 px². The sheet is readable but not
overlap-free, and the overlay uses semantic ids while the manifest uses exporter ids; the
crosswalk maps them.

Shared whole-truck atlas, new strategy: evaluate all 194 delivery meshes, copy their authored
`UVMap` into `UV_AI_Atlas`, and globally repack without unwrapping (`atlas_shared_repack.py`).
This preserved chart shapes and used 5,657 islands, but still fails: 28 positive-area overlap
pairs (same-island source folds) and **86 collapsed UV triangles** with non-zero source area,
concentrated in Interior_Firewall (75) and glass (12); 7 further triangles are sub-visible
source slivers (<1e-9 m²). No guide was published from `RaptorRC/out/atlas_shared_001/`.
The 6–7 attempt budget is active; the next choice is between category sheets, an explicit
collapsed-UV exception, or accepting the body-only guide.

Category delivery (recommended path): the body guide plus five repacked category sheets cover
all 194 meshes — wheels 5 objects/2,678 islands, glass+lights 36/328, interior 61/431, chassis
45/1,737, trim 46/385 — at 4096 atlas / 1280 guide with masks and manifests in
`RaptorRC/out/category_guides_001/`. Explicit exceptions: interior has 2 allowed collapsed
triangles; overlaps are allowed and counted (interior 3, glass 6, chassis 13); 912 tiny masks
are skipped and most labels are legend-only. 379 source-UV degenerate triangles are inherited
from the authored layouts and reported separately, not introduced by repacking.
**Delivery correction:** these guides contain 1280² images and masks only. `--atlas-resolution`
was recorded as `atlas_resolution` metadata but no 4096 image was written; manifests now state
`atlas_images_written: false`. A real 4096 render pass remains to be implemented.
**Transfer-checker fix (untested in Blender):** the checker baked Diffuse Color, which is black
on metallic/transmissive materials; it now bakes an Emission gradient so the test measures UV
mapping rather than material response. It also excludes sub-pixel faces, samples three interior
points, records material/UV preflight failures, and reports per-object conclusive coverage.
Re-run one failing object before trusting the earlier category failures.

Repacked-category transfer verification (wheels): a UV-space gradient baked through the authored
`UVMap` into `UV_AI_Atlas` at 4096 matches expected UVs on all 15,400 faces within 2.3% (median
1.29%, p95 2.20%, max 2.27%); the checker render is regular. At 1024 the same test fails
(p95 55%) because the 2,678 tread islands are sub-pixel, so this sheet requires 4096 bake/sample
resolution. Evidence: `RaptorRC/out/repacked_transfer_wheels_002/`.

The same test **fails on the other four sheets**: interior median 2.4% / p95 65.7%, glass+lights
3.3% / 50.7%, chassis 3.1% / 88.1%, trim 3.9% / 65.2%. Failures concentrate in a subset of
objects (e.g. trim `Front_SkidPlate_Final` median 55%, `Front_Valance` 54%, grille p95 94%).
Only wheels is transfer-verified; the other sheets must not be described as complete. Evidence:
`RaptorRC/out/repacked_transfer_summary_001/README.md` and the per-sheet JSON reports.

The old
`uv_label_review.py` can place 2048px annotations on a reused 1280px wireframe, reads PNG
scanlines as if all filters were zero, and guesses semantic confidence from average normals.
`uv_island_export.py` flattens UV edge endpoint coordinates when finding islands and uses
fan triangulation for concave faces; connectivity/overlap results can therefore be wrong.
The exporter connectivity and concave-triangulation defects are now fixed with synthetic
seam and concave-U regression fixtures. Old generated outputs have not been replaced;
regeneration can change island ordering and overlap results and needs revisioned manifests.
The legacy label-review image-reader/resolution problems remain deferred. The experimental
`uv_surface_probe.py` uses endpoint-associated UVs and actual loop
triangles, refuses differing legacy memberships and records sampled thickness/visibility.
`uv_semantic_vehicle.py` makes profile-based proposals on 24 visually assessed development
islands, with other islands unknown; no general or unattended vision-model accuracy is claimed.
The first frozen same-asset holdout selected 12 other islands (all cabin-floor patches).
Exact semantic names scored **0/12**: the then-current `uv_semantic_vehicle.py` assigned every low horizontal
surface ahead of the rear window to front floor and had no cabin-floor class. Upper versus
underside was correct, but the semantic location was not. **Deferred**, with sealed predictions,
numbered host/isolation evidence and separate annotations in RaptorRC's
`out/semantic_holdout_001/`; no classifier tuning or atlas replacement was done after scoring.
`uv_semantic_holdout.py` and its pure scoring fixtures preserve this failed result and reject
missing annotations, development-id leakage and changed frozen/classifier/profile artifacts.
The subsequent floor-rule repair adds conservative front/cab/bed intervals and abstains when
island bounds cross a landmark transition; synthetic region/boundary tests pass.
Sampled coverage is now implemented (three barycentric points per loop triangle, world-area
weighting, explicit component fractions, abstention below 90% dominant rule support).
The second frozen holdout excludes all 36 previously annotated ids and selects 16 varied
geometry strata. **2/14 exact**, with 6 wrong names, 6 abstentions and 2 visually unresolved
cases. RaptorRC's `out/semantic_holdout_002/` preserves predictions/annotations/report; no
post-freeze tuning was done. Thin edges/reveals are still mistaken for their broad parent
panels, sometimes with 100% rule coverage: coverage is not semantic confidence. This naming
limitation is **deferred**, not fixed by the mixed-surface sampler. No accepted atlas replaced.

**Known follow-ups — texture inventory (deferred):** Blender 5.2.2 background fixtures
emit two colour-space enum warnings when inventorying all image datablocks (including
Blender-managed images). Assertions pass, but those colour-space entries require manual
interpretation; the helper does not certify them. Affects
`.opencode/skills/gummy-3d-authoring/scripts/texture_inventory.py`.

**Known follow-ups after the culling/LOD pass** — recorded, not blockers:

- **Leaf LOD is a fixed distance band.** 42–68 m and the 60% floor are not tied
  to quality tiers or draw distance, so Performance pays full near-leaf fill
  and Ultra gets the same far thinning.
- **Never replace per-pass culling with main-camera visibility on reflected
  objects.** Bark, hives and bushes are on `REFLECT_LAYER`, so the pond can show
  them behind the main camera; `mesh.visible` distance culling would remove
  them from the reflection. Leaf density follows the reflected camera there.
- **Light backdrop batches stay whole-ring.** Trunks, backdrop leaves, flowers
  and rocks skip culling; sector them only if a future profile shows the draw
  calls pay back.
- **Draw calls rose ~59** (660 vs 601) from sector submissions; watch mobile
  submission cost before adding more sectors.

**Known follow-ups after 8b** — recorded, not blockers:

- **A grab/throw keeps a directive active**, but `resumeTask` can send the bear
  wandering on release; decide whether a throw should cancel the request (likely
  with 8c possession).
- **Only the queue count is shown**, not the queued commands; add a list if the
  three-slot queue becomes player-facing.
- **Acceptance uses unseeded `rng()`**, so the same command can accept or refuse
  across runs by design; verification should assert the reason/outcome pair, not
  a fixed roll.

**God-ray prototype (Oct 2026, flag-gated)** — recorded:

- **Individual settings follow-up:** 24 advanced graphics controls plus the
  existing controls now expose shadows, foliage LOD, post-processing detail,
  experimental god rays and wind; clock controls also appear in Settings.
  Local persistence, Custom labeling, section resets and preset reset behavior
  verified at desktop and 390×844. Default ray/shadow/LOD settings are unchanged.
- **Invisible-ray work removed:** hidden rays skip raymarch/blit/composite and
  composer depth attachments are allocated only while needed. Hidden-ray/off
  output matched exactly in a live-pipeline pixel comparison. Grass and capsule
  optimizations were investigated but rejected (parity failure/no measurable
  gain); production math and surface scheduling remain unchanged. See
  `PERFORMANCE.md` for measurements and rejected-test limitations.
- **Known follow-ups — settings data (fixed):** malformed primitive/array JSON
  and null selector values could crash flag overrides or coerce to tier zero;
  advanced settings now validate object shape and finite numeric enum values.
- **Known follow-ups — prototype resources (deferred):** the pass's existing
  dispose method does not dispose its shadow-depth copy target, and the effects
  owner has no teardown API. This is not exercised by current map switching,
  which keeps the composer; address before adding composer recreation.

- `?godrays=good` (or `setGodrays('good')`) runs a quarter-resolution raymarch
  against the sun/moon shadow-map depth plus composer scene depth, Full tier
  only. Off by default; no npm package or three.js bump. Technique adapted from
  `three-good-godrays` (Casey Primozic, zlib) / n8python/goodGodRays, and marked
  as such in `src/effects.js`.
- `?foliageShadows=1` gives hero leaf cards and bushes alpha-tested depth
  materials so canopies occlude the raymarch instead of casting card rectangles.
  Prototype only; it makes the meadow shadow-casting.
- Measured **+1.9–2.7 ms** at 1440×900/DPR 1.5 with 40 bears (Full tier,
  default and tree views, three alternating probe rounds); captures show sun
  shafts through the tree line. The default camera gets a soft fan from behind
  the hill.
- Follow-ups: half-res/sharper option, the canopy-centre glow artifact, mobile
  cost, and the decision whether foliage shadows (and the effect) ship at all.
- **Canopy-edge tuning:** depth-guided four-tap upsampling rejects background
  ray samples at foreground foliage edges while retaining quarter-resolution,
  24-step raymarching. Desktop/tree/mobile captures and Soft-tier exclusion
  checked; fresh 40-bear on/off cost +1.67 ms (not a cross-run speedup claim).
- **Known follow-ups — canopy glow (partly addressed):** rays-off and bloom-off
  comparisons show existing sky shafts and a bloom contribution to the bright
  canopy centre. Depth-guided upsampling addresses silhouette leakage, but a
  complete bloom/sky-glow fix is not established; deferred rather than masked
  by disabling bloom globally.
- **Known follow-ups — experimental foliage shadows (deferred):** custom leaf
  depth materials do not reproduce the visible shader's wind, scale and density
  changes. Moving-canopy shadow parity remains unverified; alpha testing alone
  does not prove matching occlusion. The flag affects hero trees/bushes, not
  every meadow object.

**MSN Buddy race prototype (Oct 2026, Studio-only, prototype)** — recorded:

- **Asset:** `assets/MSN_Figure/msn.glb` (228,852 bytes) loads as 3 skinned
  meshes, one skin with 9 joints, 10 named clips and one shared material. The
  Blender source remains untracked by policy (`*.blend`); only the exported GLB is
  a delivery candidate. The model is 1.573 m tall and is placed at authored scale.
- **Runtime:** `src/msn.js` lazily imports the pinned `three/addons` GLTFLoader on
  the first Studio entry. It is independent of the bear pool, Box3D handles, AI,
  saves and poses. The Meadow never requests the GLB. `?race=off` disables the
  prototype and hides the Race Lab.
- **Material and animation:** the default **Glass** look keeps transmission
  (`transmission = 1`), low roughness, IOR 1.45, thickness/attenuation, a
  reflective clearcoat and stronger environment reflections. The panel controls
  clarity and roughness; Idle loops and the other clips remain available. The
  alpha prototype remains reachable with `?race=alpha` for A/B comparison
  (`transmission = 0`, transparent opacity, no clearcoat). One-shot clips return
  to Idle. The buried arm surfaces remain visible through the glass; the mesh is
  not clipped.
- **Studio cast filter:** **Bears / Both / MSN** is a view filter, not a physics
  or save change. **MSN** hides bear meshes/eyes/painted shadows, the bear card,
  the header and the cannon; bears keep their state and simulation. The choice
  persists locally as `gummy.studio.cast`. Meadow always shows bears.
- **Interaction pass (Oct 2026):** the MSN has its own invisible hit proxy and
  raycast, so it is selectable independently of the bear pool. Click selects it
  and plays a short Nod/Wave/Cheer reaction; drag turns it; Shift-drag moves it
  inside the Studio table bounds; double-click or the Race Lab **Frame** button
  focuses the camera. Reset restores the default placement, yaw, opacity, speed
  and Idle clip. A teal floor ring marks selection. It does not add physics,
  save state or AI, and it yields to a closer bear when both are under the
  pointer in Both mode.
- **Glass pass (Oct 2026):** default transmission 1, roughness 0.05, IOR 1.45,
  thickness 0.32, attenuation distance 1.8, clearcoat 1 with roughness 0.04,
  reflectivity 1 and environment intensity 1.6. Clarity and roughness are live
  Race Lab controls; the reflective coat is intentionally stronger than the
  authored GLB material. The alpha fallback uses the previous opacity path.
- **Verification:** isolated GLB audit and live browser checks cover the lazy
  load, mesh/bone/clip counts, mixer advance, one-shot return, Glass material
  values, alpha fallback, cast filters, cast persistence, `?race=off`, map
  isolation, hover/click selection, click reaction clips, Glass Box3D
  grab/lift/drop, Drag Grab/Turn, drag-to-turn, Shift-drag placement, Frame
  focus, Reset, the 24-body Gummy actor, distinct blue/green materials, Gummy
  grabbing and save/load, Meadow six-bear regression and desktop/390×844
  captures. Numbers are in `PERFORMANCE.md`.
- **Known follow-ups:** the prototype has no physics, collision, AI, possession
  or soft-body deformation; a playable race is a separate scope. The cast filter
  intentionally leaves hidden bears simulating, so their arrangement survives a
  round trip. Multiple MSN instances, save-state integration and limb clipping
  are deferred. The open Race Lab panel overlaps the prototype's base and selection
  ring at the default desktop camera; collapse or reposition the panel if that
  becomes distracting.
- **MSN variants (requested 2026-10-19):**
  - **Glass MSN — current:** blue GLB path with authored skeletal clips, a
    reflective transmission/refraction material and no soft-body stretch. It is
    rigid by design and does not reuse the bears' 24-body solver. A single rigid
    Box3D sphere proxy now gives it grab/lift/drop physics; the Race Lab has a
    **Grab / Turn** drag mode. Expand the proxy to a multi-sphere rigid body only
    if the single-sphere fit proves inadequate.
  - **Gummy MSN — first Studio slice (Oct 2026):** green 24-body Box3D +
    metaball soft body derived from `BUDDY_RIG` through `src/msnrig.js`, using
    the bear-style gummy material. The per-species `Bear` actor now carries
    per-actor rig data, so Gummy uses the existing surface, spring, grab, throw
    and shadow paths while bears keep their original rig. It is grabbable and
    visible in **Both** and **MSN** casts, hidden in **Bears**, and disabled by
    `?race=off`. Studio save/load preserves its species flag and 24-body rig.
    Studio idle/interaction behavior is implemented in the Chunk 2 entry below.
  - **Gummy Meadow parity (Oct 2026, done):** two Gummies join the Meadow
    colony and the buddy roster, using the shared AI navigation/needs,
    food/water, home/sleep, growth, pregnancy/birth and grab/throw paths.
    Gummy births spawn the Gummy rig and inherit Gummy parentage. Cross-species
    reproduction is enabled through the registry gate.
  - **Gummy Studio control (Oct 2026):** the Race Lab **Control Gummy** button
    enters the existing possession path for the 24-body actor. WASD/arrows or
    the on-screen stick move, Space hops, and V/Esc exits; the camera follows
    inside the Studio table. Gummy can still be grabbed when not possessed.
    Glass remains rigid and non-possessable.
  - **Gummy Studio behavior (Chunk 2, Oct 2026):** added click/pet reactions
    (Nod, Wave or Cheer) and a weighted random idle "think" timer covering Idle,
    Nod, Lean, Wiggle, Wave, BigWave, Cheer, Handshake, Squash and Hop. These
    are procedural soft-body target poses and impulses named after the authored
    Glass clips, not skeletal playback. Behaviours pause during possession,
    grabbing, sleeping, eating and other AI-owned states; the calm default is a
    long idle interval rather than constant fidgeting.
  - **Glass Meadow life adapter (Oct 2026, done):** two Glass MSNs live in the
    Meadow as rigid skinned actors with their own Box3D sphere proxy. They
    hover on nav paths, eat/drink at roughly half the bear need rate, sleep
    never at night, and may drift inside their villa during daylight. They are
    pointer-draggable in Grab-click mode: normal drag moves, Shift-drag lifts
    or lowers, and release hands velocity to the rigid Box3D proxy so it
    ricochets and tumbles before returning upright to hover.
    They use the shared roster/social/bonds/life fields, take their
    baby/teen/adult growth step only at night, follow a living parent as
    babies, inherit family homes/parent bonds, gain sibling bonds, show
    generation/parent/sibling/child lineage in the roster and selected panel,
    start family/sibling play, can continue successful socializing into a door-level
    visit with Glass or soft-body partners, meet at the family door for a
    longer sibling/parent playdate, fade through the door for daytime
    shelter, can become pregnant and give birth, and save/load in the world
    payload. Bear/Gummy AI scans the combined
    companion list for social and mating, so both directions can initiate
    cross-species pairs. Cross-species Glass × Bear/Gummy births use the
    existing Glass GLB or the other parent's rig; custom hybrid bodies remain
    deferred. `src/npc.js` supplies the shared actor view used by roster, save,
    home and launcher iteration.
  - Add a Race Lab **type** selector only once both paths have their final
    controls. Do not silently share one material, solver or animation set
    between them.

**Species & DNA (agreed and implemented 2026-10-19)** — recorded:

- **Asset pipeline (Oct 2026, done):** `src/assets.js` validates the shipped
  `asset.json`, resolves the GLB beside it and checks mesh/bone/material/clip
  counts. `assets/README.md` documents the schema; `docs/species-template.md`
  is the copyable entry template for future authored assets and hybrids.
- **Phase 6 crate v4 selected (2026-10-20, density review):** the crate GLB’s embedded
  PBR channels match the source maps (MAE 0.0). V4 512 px silver is selected: it cuts
  GLB bytes by 34.9% and trim density p95 from 4.813/4.276 to 2.407/2.138, with visible
  grain and one UV set. V5 256 clears p95 but is visibly softer; V6 512 + independent
  trim UV 0.8 clears p95 while keeping grain but lowers the median below the advisory
  floor and adds `TEXCOORD_1`. Density remains a reviewed limitation, not a calibrated
  pass. Future assets should preserve high-resolution sources, choose delivery resolution
  per material from the closest gameplay views, prefer the simplest UV/material setup,
  and validate all channels, seams, tiling and mips after downsampling.
- **Phase 7C procedural curved bake (2026-10-20, density review):** selected
  `pebble-procedural-004`, a pole-free quad sphere with an asymmetric dimple and an
  analytic 3D source (`pebble_fields.py`) baked to a six-island atlas. Source-to-baked
  albedo mean `0.00222`/p95 `0.00412`, roughness `0.000807`/`0.00179`, metallic
  `0.00134`/`0.00267`; 802 seam-pair samples and baked-to-export MAE `0.0` pass.
  The GLB is `1,196,468` bytes, 12,288 triangles, 3 images, single-sided, validator
  0 errors/warnings. Density remains review (1024 p05/p95 `0.399`/`2.193`), so this is
  not a density pass. The earlier UV-space candidates remain failed diagnostics in
  `.dev-shots/asset-pipeline/phase7/benchmark/7c-failure.json`; accepted evidence is in
  `.dev-shots/asset-pipeline/phase7/benchmark/pebble-procedural-004/7c-summary.json`.
- **Known follow-ups — Phase 7E blockout (fixed):** the office sill's rear face
  coincided with the back wall exterior at Y `1.68 m`, producing a black strip in
  the exterior Cycles capture. Moving the sill inward by `30 mm` removes that
  coplanarity; inspected interior/exterior `_003` captures confirm the strip is
  gone. Later candidates also moved wallpaper to interior faces only and plastered
  the exterior. Final 7E evidence is in `office-corner-006`.
- **Phase 7D multi-part desk lamp (2026-10-20, accepted with density review):**
  selected `desk-lamp-005`: 24 separate parts, four materials, 10,648 triangles,
  5,415,096 bytes, validator 0 errors/warnings plus 9 unused-tangent/UV infos. The
  bracket was pulled back and a silver neck plus round shade-mount plate replaced the
  unnatural teal/metal merge; all expected interfaces overlap, all parts are connected,
  and the reflector clears the shade by `6.15 mm` with zero intersections. Reflector
  bake source-to-baked albedo `0.00174`/`0.00237`, roughness `0.00251`/`0.00669`,
  metallic `0.00164`/`0.00285`; 264 seam samples pass. Density remains review (18
  warnings; shade p95 `3.411` at 1024). Two small dark shade marks remain in Blender
  Eevee close-ups; cause unresolved and accepted with the lamp. Evidence:
  `.dev-shots/asset-pipeline/phase7/benchmark/desk-lamp-005/7d-summary.json`.
- **Phase 7B equipment-case tileable-versus-atlas (2026-10-21):** the tileable
  baseline is `equipment-case-010` (3 objects, 3 materials, 77 UV islands, 1,428
  triangles, 4,183,272 bytes). User inspection found no visible flicker or
  z-fighting after the frames became single Boolean-cut solids and the handle
  mounts were unioned; joining overlapping bars had caused the earlier
  camera-motion z-fighting. The experimental coplanar checker is advisory only:
  hidden overlap is acceptable, visible flicker is the blocker. The baked
  comparison `equipment-case-atlas-008` flattens the case to one `AtlasUV`, 90
  islands, one material and three 1024² images, with 19.34 px minimum padding at
  1024 (9.67 px at 512), a clean audit and validator 0/0/0. It is 1,982,128 bytes
  (52.6% smaller) and renders five meshes as one. Matched preview MAE is 0.00128
  front, 0.00096 three-quarter and 0.00459 near; front-panel/handle close-ups show
  softer silver grain, and those plus back, right-side and top captures show no
  visible seam. This is a texel-density tradeoff, so tileable stays the accepted
  baseline and the atlas is retained as a comparison candidate. Fidelity evidence is appearance-based
  (matched previews and close-ups), not a per-channel source-to-baked MAE.
  `equipment-case-atlas-007` is a rejected diagnostic: omitting pre-export
  triangulation dropped tangents and produced a validator warning.
- **Known follow-up — 7B tileable handle tangents (deferred):** the tileable
  `equipment-case-010` handle is not triangulated before export, so its GLB carries
  one `MESH_PRIMITIVE_GENERATED_TANGENT_SPACE` warning. Triangulating the handle in
  `build_equipment_case.py` and rebuilding would remove it. Deferred because 010 is
  a benchmark baseline, not a delivery, and the atlas comparison validates cleanly.
- **Phase 7F shape-workflow trial (2026-10-21, prototypes only):** added
  `tools/asset-pipeline/scripts/capture_review.py` (staged Workbench/material/final
  captures with complete render-state restoration and temp datablock cleanup),
  `asset_fingerprint.py` (deterministic source fingerprints), and
  `check_shape_gate.py` (bounds, hinge, modifier, default-scene hygiene, stale-capture
  rejection and recorded silhouette approval for detail/delivery). Approvals require a
  fresh front/side/top/three-quarter manifest and store review/capture hashes; detail
  revalidates them. Failed gates exit nonzero. The self-test
  `tests/phase7/test_capture_review.py` covers success, exception and material-preset
  cleanup, forced render errors, animated-frame framing, UV/material/transform/modifier-
  operand fingerprint changes, stale review and deleted-capture rejection, and the detail
  approval gate.
  `retro-laptop-013` corrects the iBook-inspired layout to a 4:3 screen, left keyboard,
  right trackpad and wide handle, but the lid, handle integration and segmented hinge
  still fail the shape gate. The live MCP shell candidate `retro-laptop-shell-007` removes
  the handle, thickens/flattens the lid section, lowers the hinge and adds a clean raised
  bezel with a blank screen panel. A Boolean screen recess was rejected: after Subsurf it
  produced degenerate faces, and before Subsurf it produced a teardrop recess; the frame is
  a separate clean mesh. Open/closed `look` views and evaluated health checks pass; it
  remains shell-only. `retro-laptop-shell-008` applies the additional reference finding:
  base seam higher at the rear, lid bottom wedged to match, lid depth matched to the base
  and hinge raised to the rear seam; closed width is flush with a 1 mm seam. Screen dressing
  is hidden for this shape checkpoint and still needs re-seating. `retro-laptop-shell-014`
  is the side-profile pass: curved base underside, a lid crown that varies around
  the perimeter, and a matched seam with flush outer widths. `retro-laptop-shell-020`
  added a seam gasket for the rounded-edge groove; it is retained but rejected because the
  band floated off the base. `retro-laptop-shell-021` hides that band, supports the cap
  perimeters with a fan and perimeter-only crease, and seats the lid bottom on the
  evaluated base surface (0.35–1.4 mm clearance, perimeter about 0.7 mm inside the base
  edge). Base/lid health and the structural gate pass. `009–020` are retained iterations.
  Laptop review closeout: the user accepts shell 021 with reservations before detailing.
  Construction-method gate and brief are documented in the authoring skill. Pose/evidence
  checks, bounds-based focus captures, an experimental fixture-tested interface checker and
  the construction gate are implemented. The moulded-shell pose set includes closed,
  intermediate and open poses; the interface fixture suite includes a deliberately
  unsupported cap-shrinkage case. The canonical exporter, office exporter, two prototype
  builders and detail/delivery shape gate now require construction evidence bound to the
  source `.blend`, and revalidate capture evidence before writing. Benchmark builders are
  explicitly exempt in `tools/asset-pipeline/tests/phase7/ENFORCEMENT.md`. One manual
  subdivided-shell test passed its stated structural/evidence checks, but it is not a reusable
  pattern or likeness approval. Pattern libraries remain planned in
  `docs/asset-pipeline-roadmap.md` under **Construction-method tooling status**.
  Known follow-up (fixed): approvals now record their review frame and are validated at that
  frame; an open-pose approval remains valid while the current frame is closed. Evidence
  reports also carry the saved source hash, and the export fixture covers a positive export
  plus unsaved geometry, changed-source, swapped-target and swapped-evidence negatives. The
  brief now requires an explicit geometry-versus-material split at the intended viewing
  distance.
  Earlier cage-ring equality and unsigned nearest-distance claims did not establish
  evaluated flushness or complete contact. The floating gasket remains rejected.
  `frutiger-props-002`
  adds a flat beanbag underside but still reads as a moulded bowl; it needs a quad cage
  with folds and asymmetry. Both are preserved as prototypes, not deliveries. Findings: factory-startup default cube enclosed the review
  camera; imported glTF empties used quaternion rotation so Euler placement was ignored;
  default-cube removal is now required in builders; and on add-on 1.8/protocol 14, `look`
  angles/frames work but `topology` mode is still unavailable, so wireframe/direct checks
  are the fallback.
  The prototype builders now save their source and block GLB export without a matching
  approval; `export_approved_asset.py` is the gated delivery entry point. Blocking was
  verified on `retro-laptop-014` (source saved, no GLB) and the old evidence-free
  approval is rejected.
- **Known follow-ups — Phase 7E chair/wall/lamp revision (built, pending
  acceptance):** `office-corner-009` extends the back wall through the side-wall
  thickness and the floor to the outer wall faces. The chair now uses continuous
  rear stiles (no 25 mm post/leg step) with 22.5 mm joint overlaps, apron tops
  20 mm inside the seat and longer stretchers; chair topology is clean, 1,916
  evaluated triangles, and a six-angle orbit showed no joint gaps or flicker.
  The builder imports the user-edited lamp hierarchy as a new GLB and reproduces
  its world matrices within `2.4e-7`. The full-resolution GLB is built, but the
  accepted optimized mixed/512/1024 deliveries still come from
  `office-corner-006`; they have not been regenerated, and 7E density,
  compression and exported-light checks remain open. Do not treat 009 as
  accepted until the user approves it.
- **Phase 7E Frutiger prop revisions (built, undocumented until now,
  unaccepted):** `office-corner-010`, `-011` and `-012` extend the 009 scene with the
  Frutiger prototypes and a desk laptop. `-010` adds `frutiger_props`
  (`Frutiger_Beanbag_Root` at `(0.95, 0.25, 0.015)`/`12°`,
  `Frutiger_Plant_Root` at `(1.35, 1.15, 0)`/`30°`, `Frutiger_Mouse_Root` at
  `(0.08, 1.08, 0.77)`/`-25°`) plus `RetroLaptop_Root` at
  `(-0.58, 1.02, 0.776)`/`19°`, hinge held open at `-110°`, 32 parts.
  `-011` moves the mouse off the laptop to `(-0.3, 1.02, 0.77)`;
  `-012` pulls it to `(-0.3, 0.94, 0.77)` and drops the chair-orbit capture.
  Each is a full-resolution build only (`34,494,796` / `34,495,080` /
  `34,495,076` bytes, sha256 `892f6160…`, `8073ab94…`, `12f951f9…`). Captures:
  `render-checks/first/` interior, beanbag, plant, laptop (plus chair and top in
  `-010`, chair in `-011`). These revisions were never recorded here, so they read
  as missing: the accepted optimized mixed/512/1024 deliveries still come from
  `office-corner-006`, and none of 010–012 has density, compression, exported-light
  or user acceptance. Treat `-012` as the newest built scene, not an accepted one,
  and do not present it as a delivery.
- **Phase 7E laptop/lamp corrections (2026-10-21, built, unaccepted):** `office-corner-015`
  and `-016` rebuild 012 with the retro-laptop-detail-050 GLB and the lamp turned to the
  desk. Two root causes were found. (1) The glTF-imported lamp root is
  `rotation_mode = QUATERNION`, so the builder's `rotation_euler[2] = 110°` was silently
  ignored in every earlier build; the lamp always kept its authored +Y (window) pose.
  The builder now sets `rotation_mode = "XYZ"` before rotating and defaults to
  `--lamp-rotation 180 --lamp-tilt -30`, which moves the shade to
  `y 1.017…1.189`, `z 1.073…1.268` — over the desk, in front of the sill, opening down.
  (2) The open laptop reached `y 1.307` into the window sill (`y 1.23…1.65`,
  `z 0.95…1.0`); with `--laptop-hinge-degrees -92 --laptop-y 0.965` it spans
  `y 0.760…1.212`, clear of the sill and 10 mm inside the desk front edge. The builder
  also gained `--laptop-tag`, `--laptop-y`, `--lamp-rotation` and `--lamp-tilt` so these
  poses survive a rebuild. `office-corner-015` used the earlier, still-broken tilt maths
  and its lamp head is displaced; `-016` is the corrected build. Known limitation: the
  laptop GLB is not appearance-faithful — glTF cannot express the object-coordinate
  plastic maps or the sticker `MixRGB`, so the exporter writes `texCoord: -1`, drops
  UVs on 15 of 98 primitives and substitutes the sticker sheet as base colour (black
  deck, white lid). Blender renders are correct; a UV atlas bake or a solid-colour +
  UV-decal export variant is required before the laptop GLB is usable in a viewer.
- **Phase 7E mixed opaque/glass office corner (2026-10-21, accepted):** selected
  `office-corner-006`: a 3.6 x 3.0 m cutaway with floral Hungarian-style wallpaper
  (plaster outside), herringbone parquet, desk against the wall, oak chair with red
  cushion, 29-book oak bookcase, grey oval rug, open book, transmission window and
  four-blade ceiling fan/light. Lamp placement is saved at
  `(0.49528, 1.197138, 0.77)` / `110°`; 12 W and 35 W point lights are parented to
  lamp/fan in the source but not exported. The original 1024 GLB is `32,060,220`
  bytes, 202 meshes/207 primitives, 18,916 triangles, 21 materials and 27 images.
  The accepted default is the merged mixed delivery: `16,062,484` bytes, 24
  meshes/29 primitives, 58 preview draw calls, 21 materials, 27 images; validator
  0 errors/warnings and 31 unused-tangent/UV infos; clean import and standalone
  preview pass. The merged 512-everywhere variant is `10,518,536` bytes with softer
  wallpaper; both 512 and 1024 variants are retained. Eight Blender views and
  day/night preview captures were inspected. Texel density remains unaudited.
  Evidence:
  `.dev-shots/asset-pipeline/phase7/benchmark/office-corner-006/delivery-opt-002/selection.json`.
- **Species registry — first layer (Oct 2026, done):** `src/species.js` registers
  **bear**, **msn** (Gummy) and **glass** definitions with kind, cast group,
  rig/asset, material, studio/meadow/roster availability, grab/possession/
  breeding/life/eyes/tells capabilities and behavior/growth tags. App spawn,
  save/load, cast visibility, possession, roster, life and cross-species
  breeding resolve through the registry; the metaball/Box3D and Glass hover hot
  paths remain specialized.
  A fixture species registration test proves a new definition can be added
  without editing the registry internals. Future race = species module +
  registry entry + assets + tests.
- **DNA metadata — first layer (Oct 2026, done):** every species now carries a
  breed group, all-three compatibility list, genome loci/defaults, phenotype
  id, deferred hybrid target ids and separate `canBreed` / `canReproduce`
  flags. Bear, Gummy and Glass currently reproduce; Glass uses its rigid GLB
  adapter rather than the 24-body solver.
- **DNA engine — first layer (Oct 2026, done):** `src/dna.js` implements
  deterministic default genomes, parent combination, mutation, clamping, colour
  blending, genome normalisation, phenotype expression, current/future breeding
  gates and Bear × Gummy/Glass hybrid-target metadata.
- **Genome-on-actor + save integration (Oct 2026, done):** every Bear/Gummy actor
  and the Glass prototype carries a normalized genome/phenotype. Births combine
  both parents' genomes; stage growth preserves the size gene. Saves store an
  optional versioned genome and old saves fall back to the species default.
  Size, colour, rigidity, damping/softness, stretch and material-profile genes
  are expressed; trait scales are normalized to species defaults so default
  actors keep their previous solver feel. Authored hybrid bodies remain
  deferred.
- **Cross-species birth (Oct 2026, done):** Bear, Gummy and Glass pairs pass the
  compatibility gate. The child chooses a random viable parent species and
  receives the combined genome normalized to that species. A Bear/Gummy child
  inherits a Glass material gene when either parent carries one; a Glass child
  uses the existing Glass GLB with a colour blended from both parents. No
  runtime hybrid mesh is generated.
- **Decision:** all three — bears, Glass MSN and Gummy MSN — may interbreed
  now. Glass offspring use the existing Glass model; authored custom hybrid
  models are a later visual upgrade, not a reproduction prerequisite.
- **Current reproduction:** all three species are active. Child species is
  chosen randomly from the viable parents; it uses that parent's existing form
  and matching genome/phenotype. Cross-species social bonds, visits and play
  remain enabled.
- **DNA:** a versioned genome will carry species weights, colour/material genes
  (base colour, attenuation, transmission, opacity, clearcoat), size, softness/
  rigidity, wobble/stretch, hop pace and personality. Save schema changes wait
  for the DNA pass so they land once.
- **Rigidity:** for soft bodies, DNA drives joint/shape stiffness, damping,
  volume response and max stretch. Glass children use the existing rigid
  skinned GLB; they do not inherit the metaball solver.
- **Hybrid models:** silhouette/rig inheritance cannot be interpolated at
  runtime. Cross-species births currently select one parent's existing form.
  Authored hybrid models remain a separate visual upgrade, not a reproduction
  requirement.
- **Custom models for the hybrids (deferred):** do not generate hybrid geometry
  at runtime or force one parent's rig to stand in for a hybrid. Blender MCP
  testing/authoring continues in parallel; register any authored hybrid as a
  species entry with its own rig/asset, capabilities and tests when it is ready.
- **Phases:** same-species reproduction + cross-species social (done) → Gummy
  Meadow life parity (done) → DNA/genome + custom rigidity (done) → Bear/Gummy
  cross-species birth using existing rigs (done) → Glass Meadow life and
  reproduction adapter (done) → authored custom hybrid models when the Blender
  MCP pass yields an asset (parallel, not a gate) → new MSN/Bear hybrid race
  model. Validate genetics, save/load, roster labels and hybrid performance at
  each step.
- **New race model:** yes, a future authored MSN/Bear hybrid is a valid roadmap
  item, but it is a Blender asset + rig + animation + lifecycle scope, not a
  runtime mesh blend.

**Known follow-ups after 8c** — recorded, not blockers:
- **Possession is session-only.** Reloading or changing maps returns the bear to
  AI in place; decide whether a save should restore control. Sleeping possession
  now wakes the bear before control; it does not preserve the slept-in pose.
- **Follow still needs a target model.** Possession provides a natural target,
  but the Follow command is not implemented yet.
- **The follow camera keeps the player's manual orbit** and only follows
  position; add auto-behind alignment if playtesting asks for it.
- **Grabbing another bear while one is possessed** works through the existing
  pointer path but is not in the headless suite; verify it with a real pointer
  pass.
- **Close (×) now deselects without cancelling**; queued commands keep running.
  Add an explicit “clear commands” affordance only if that surprises players.
- **Glass throw uses a locked-rotation sphere proxy.** It ricochets, visually
  tumbles and settles back upright to hover, but the physics proxy itself does
  not spin or use a multi-sphere body.
- **Multi-sphere Glass proxy — look into later.** A compound proxy could improve
  contact shape in tight geometry, but it needs multi-body readback, joint
  tuning, collision filtering and hover re-anchoring. Do not replace the stable
  single sphere unless throws or collisions become gameplay-critical.
- **Glass daytime shelter is a hidden home-door state**, not an interior scene.
  A door sparkle marks enter/exit, needs and pregnancy persist, and the actor
  emerges at night. Glass interiors are deferred until 3D model/interior
  authoring is available.
- **Glass visits are door-level only.** Glass hosts/guests walk to the villa
  door and socialize outside; entering the villa together waits for the same
  3D model/interior authoring pass.
- **Glass interior models — later.** Do not add an interior scene until authored
  3D models are available. The current door fade/visit states are the seam for
  that future pass.

Each phase ends playable, with screenshots and headless checks, so the direction
can be adjusted without losing the working app.

## Non-Blender backlog (Oct 2026)

Recorded after the Blender-free family, verification and asset-pipeline pass.
Glass interiors and authored hybrids stay on the Blender track; everything here
can proceed with the current runtime and assets.

### Landed

- Committed species/DNA/save/actor-view tests and CI execution.
- MSN asset manifest, GLB inventory check and source-backup decision.
- `AGENTS.md` and project-skill updates for the species runtime.
- Seeded portable browser regression (`scripts/browser-regression.mjs`) and its
  blocking CI browser job.
- Family tree/lineage UI and Glass/soft-body sibling playdates.
- Manifest-driven GLB loader (`src/assets.js`) and `docs/species-template.md`.
- Gene definition registry (`registerGene`) and actor save validation/collection
  contracts (`src/actorsave.js`).
- Deep race/Glass harnesses on the portable helper, plus scratch capture retention.

### Open — no Blender required

- **Stale scratch expectations.** The old menu harness still expects 6 bears;
  update it to the current 8 soft-body actors after a starter-roster change.
- **Deeper family life — A–F landed (Oct 2026).** Shared `behavior.js`,
  `behaviorprofiles.js`, `family.js`, `interactions.js` and `actorrecord.js` drive
  Bear/Gummy/Glass needs, pair interactions, playdates, hive/conflict, routines, meals,
  teaching/skills and lineage/history. Actor save v2 migrates v1 records. The current
  unified-family profile is recorded in `PERFORMANCE.md`; remaining work is presentation
  polish and the larger Phase 9 village systems.
- **Performance.** Phase F baseline recorded: **22.0–22.7 ms** at 1440×900 / DPR 1 /
  quality 2 / effects off with 8 soft-body + 2 Glass; **~11 ms** on the low-quality CI
  profile. Grass draw distance remains the largest lever (~3.5–3.7 ms for 56 → 28 m);
  coverage shortening is not a geometry reduction. Continue toward ≤16.7 ms.
- **6b-1 presentation polish.** HUD/status styling, nameplates, emote legibility,
  gear-sheet visuals, home occupancy glow and mobile layout.
- **Phase 9.** Village placement editor, named homes, shared hub and light
  jobs/shops.
- **NPC adapter phase 2.** Reduce remaining `bears` vs Glass branch paths and
  move more iteration through `src/npc.js`.
- **Multi-sphere Glass proxy — later.** Only revisit if throws or collisions
  become gameplay-critical; the single sphere remains the stable default.
- **Debug/tooling polish.** Add a hook catalog or `debugHooks()` listing and a
  deterministic seed path for every behavior harness.
- **Asset source and rights.** The GLB + manifest are committed; the editable
  `.blend` source still needs an external backup and a final redistribution
  rights statement.

### Blender-blocked

- Glass interior scenes and entering villas during visits.
- Authored Bear × Gummy / Glass hybrid models and hybrid species entries.
- Studio lounge/bar/TV and other modelled-room assets.
- New silhouettes that cannot be expressed as material/colour/scale variants of
  the existing models.

### Suggested order

1. 6b-1 presentation polish.
2. Phase 9.
3. Performance follow-up toward the ≤16.7 ms target.
4. Blender authoring wave when MCP is ready.

### Family behavior unification (A–F landed)

- `behavior.js` is the single decision engine for needs, utilities, pair states and family
  tasks. `ai.js` and `glass.js` are representation adapters (hop/Box3D vs hover/GLB).
- `behaviorprofiles.js` preserves Bear/Gummy and Glass balance: needs rates, thresholds,
  schedules, allowed states and social/mate/visit values stay per species.
- `family.js` owns relations, households, generations, bonds, skills, history and playdate
  schedules. `interactions.js` owns the pair/task protocol.
- Actor save v2 migrates v1 records, adds `skills`/`history`/`playdates`, persists
  `sky.day`, and prunes stale uid references on load.
- Bear/Gummy/Glass now share social, invite/decline, visit, follow, mate and playdate paths;
  mixed-species pairs use the same protocol.
- **Performance profile (F, landed).** `scripts/perf-profile.mjs` records the unified
  8-soft-body + 2-Glass Meadow at 1440×900/DPR 1/quality 2/effects off: **22.0–22.7 ms**,
  677–680 calls, 2.52 M triangles; 56 → 28 m grass draw distance saves **~3.5–3.7 ms**.
  The low-quality CI profile (900×600/DPR 0.6) is **~11 ms** and already at the minimum
  grass distance/coverage. AI is 0.017–0.085 ms. Details and the discarded contended run
  are in `PERFORMANCE.md`.
- **Profile-specific states migrated (C, done).** Bear hive raids, flee, conflict and the
  shared branch of the directive system live in `behavior.js`; Glass stargaze and daytime
  shelter are shared. `ai.js` and `glass.js` are now representation adapters; the old Glass
  decision helpers were removed.
- **Household meals (D, landed).** `family.js` routine windows (breakfast/lunch/supper)
  trigger a shared `familyMeal` task. Household members walk to the home door or the nearest
  safe food source within 9 m, eat for 6 s, relieve hunger/social, gain a small bond with
  co-resident eaters and write a meal history event. One meal per actor per window; the
  buddy status names the routine.
- **Teaching, skills and history (E, landed).** Adults seed a small skill profile, then
  teach their strongest skill to a baby/teen child once per pair per in-game day at the
  family door. `forage` shortens meals, `courage` lowers the safe hive threshold and
  `social` improves invitation acceptance. The selected-bear panel now lists recent family
  events (births, meals, lessons, playdates, stage-ups) below the lineage line.
- **F profiling was run after the Android/Blender/Xcode workloads stopped.** One
  contended run measured 24.8–25.3 ms with `duetexpertd`/WindowServer active and was
  discarded; the clean runs are 22.0–22.7 ms. Keep the same-session comparison rule.

**Known follow-ups from A/B:**

- **Glass grab (implemented, targeted checks pass):** `glass.js` now pulls the
  rigid proxy with a damped spring instead of teleporting it to navmesh samples.
  Normal drag follows a camera-depth target; Shift-drag adjusts height. Held Glass
  follows physical position without hover bob and tilts visually; release preserves
  body velocity. Shared grab/release hooks cancel paired tasks. Rotation remains
  visual because the sphere proxy is rotation-locked. Target-update/no-teleport,
  lift, Shift-lift, tilt and release probes pass, as do 78 pure tests, 57 smoke
  checks and the Studio browser regression. The full Glass lifecycle passes;
  obstacle-interface coverage remains outstanding.
- **Bear growth locomotion (fixed).** `applyBearStage` now clears stale hop/stuck/contact
  state and rearms thinking after the body/rig rebuild. A browser probe forced baby→adult
  while seeking water and observed the bear reach `drink`/`eat` without a nudge.
- **Glass dynamic walking and hover motion (implemented, checks pass).** Normal Glass
  travel now steers its existing Box3D sphere with forces instead of `setPositions`
  teleporting it; the sphere collides with bears and reads back its position/velocity.
  Hover motion leans into travel, eases its facing, adds a small bob and a faint wind
  sway. Grab/free-body springs are unchanged. The full Glass lifecycle and Studio
  browser regression pass; a collision probe against a bear separated the bodies to
  ~0.48 m instead of overlapping.
- **Local actor avoidance (implemented, checks pass).** Soft-body hop steering and
  Glass walking both bias their heading away from nearby actors ahead of them. The
  bias is local and cheap (radius 1.35 m, no replanning); collisions remain the
  fallback. The shared `src/avoidance.js` helper has four pure unit tests, and the
  Studio browser regression now also checks stage-growth recovery, a bear/Glass
  collision and bounded night sleep/wake flips. Full Glass lifecycle, Studio
  browser regression, 78 pure tests and smoke pass. A deterministic two-actor
  visual avoidance capture is still outstanding.
- **Emote backing (checked, safeguard added).** All six kinds (`refuse`, `heart`,
  `no`, `yes`, `sparkle`, `exclaim`) were captured over grass/trees at actual size;
  the refusal sprite was also checked at night. No square backing or halo is visible,
  and the canvas corners are fully transparent. The canvas is explicitly cleared,
  mipmaps are disabled and the sprite uses `alphaTest` to reject transparent texels.
- **Movement profile (contended, discarded).** A 8-soft-body + 2-Glass session
  measured 26.37 ms normal and 12.55 ms in the CI graphics profile, with AI at
  0.048/0.068 ms, but Blender was running and competing for GPU/CPU. The frame
  times are discarded and recorded only as a contended run in `PERFORMANCE.md`;
  the earlier 22.0–22.7 ms clean Phase F result remains the last valid reference.
  Re-profile in a fresh session before changing grass density or quality defaults.
- **Long-run soak (pass).** `scripts/soak-test.mjs` grew the Meadow to 16 soft-body
  actors plus 3 Glass and ran 60 simulated seconds: no NaNs, no stuck movers, map
  round trip field→studio→field, and Glass count preserved. It runs in the nightly
  deep workflow, not the blocking per-push job.
- **Glass reset cleanup (fixed).** `resetActor` now clears `familyTask`, playdate,
  visit and directive state, cached food/water/rest targets and locomotion fields,
  so tests and debug resets no longer inherit a previous interaction.
- **CI split: core push check, deep nightly (added).** Every push and PR runs the
  unit tests, HTTP smoke test and a core browser regression (`BROWSER_SCOPE=core`,
  `?race=off`: six bears, no Glass asset load) that keeps the bear family, save/load,
  command interruption, panel, growth and sleep checks. The full Studio browser
  regression, full Glass lifecycle and soak run in `.github/workflows/nightly.yml`
  on a schedule, a `v*` tag or manual dispatch. The full Glass lifecycle remains too
  slow for the blocking job under SwiftShader; `glass-test` supports `SHOTS=0` and
  longer asset waits for the deep lane.
- **Known follow-ups — CI restructuring (first hosted pass; reliability sampling pending).**
  Push checks now use 11 independent browser jobs with an aggregate required gate;
  all prior behavioral assertions remain represented, with settings consolidated in
  the social settings scenario. Nonvisual scenarios pause background rendering;
  carry and settings retain real frames. Unknown/documentation-tooling paths fail
  closed to full browser coverage. Pages waits for the successful tested main SHA.
  Nightly Glass uses all seven existing scenario groups and includes hidden artifacts.
  Local evidence: 284 Node checks, 67 HTTP checks, core browser, browser parity,
  all social/gifting scenarios and both normal full suites, plus all seven Glass
  groups pass. Hosted run 39780283793 for `1c9651d` passed in 6m42s and Pages
  deployed successfully. Ten browser jobs finished within 3m30s; Settings took
  6m9s. One pass does not establish a new flake rate or meet the five-minute target.
  The follow-up dedicated Settings route now uses `race=off`, no unused interaction
  fixture and a harness-only frame gate after its initial rendered background.
  Desktop/mobile captures were inspected unobscured; the first pause-API trial
  incorrectly covered Settings with the Pause overlay and was replaced. Hosted
  timing of this follow-up is pending; all four Settings assertions remain.
- **Known follow-ups — game/CI failure classification (unresolved).** Recent hosted
  Gifting runs time out during combined save/load even with 120 s allowed; save,
  load and inspection now have separate markers and retained CDP diagnostics.
  Local paused persistence passes are non-reproduction, not proof of a game fix.
  A forced-SwiftShader local probe captured `WebGLProgram.getUniforms` first-use
  work in `renderTransmissionPass`/`animate` blocking a renderer query before any
  save call. With animation gated at startup, three save/load round trips passed
  on the confirmed SwiftShader backend. Rendering starvation is an evidenced lead,
  not proof of the exact historical save/load timeout or an IndexedDB defect.
  Nightly Studio also reported Glass/bear separation of ~0.061 against a 0.25
  assertion (`scripts/browser-regression.mjs` collision fixture; `src/glass.js`
  and physics state need diagnosis). This may be a real collision defect or a bad
  fixture; do not lower the threshold or hide it. Deferred pending hosted evidence.
- **Known follow-ups — interaction harness isolation (fixed locally).** Independent
  group fixtures could enter `seekMate` before the group command, correctly causing
  refusal; new fixture actors now have explicit mating cooldowns. The social chat
  fixture also passed undefined `g.ai` rather than its actor index to needs setters;
  corrected to `setup.ai`. Shared settings testing restores the prior gifting flag.
- **Known follow-ups — mate module disable (fixed locally, hosted verification pending).** Calling
  `setBehaviorModule('mate', false)` did not prevent new `seekMate` states during
  the independent group fixture. `mate` was missing from the config registry;
  its module now resolves enabled state and checks admission without consuming
  selection RNG when globally disabled. Disabled recipients cannot be recruited.
  Approved policy: block new courtship, let existing courtship/mating finish;
  no automatic cancellation or save changes. Three focused regressions, 287 Node
  checks, 67 HTTP checks, full Studio/browser trace parity, normal social/gifting
  suites and a fresh 15-case long parity matrix pass. Other modules' toggle
  coverage is outside this scoped mate fix; shared dispatch was not rewritten.
  The recipient regression uses the actual `{ uid }` scope contract and asserts
  that the initiator remains enabled; an initial `{ actor }` test accidentally
  exercised global disabling instead and was corrected before commit.
- **Interaction suite Glass gate (current harness policy).** The isolated `gifting` job timed
  out at the Glass readiness gate after 30 s while the `social` job passed in the same
  run: under SwiftShader the first frame blocks Glass readiness for roughly 100 s, so
  gifting never reached its first check. `gifting-test.mjs` now uses the same 150 s
  gate and `count > 0` guard. Social/gifting no longer reload on readiness failure;
  failures retain harness diagnostics rather than retrying for green.
  The diagnostic upload steps also set `include-hidden-files: true`, because
  `.dev-shots` is a dot-directory and `upload-artifact` v4 was silently discarding
  every `.dev-shots` capture. The remaining 30 s gates (`adoption`,
  `relationship`, `mourning`, `uid`, `glass-fast-parity`) are local/nightly only and
  still unaligned.
- **Gifting harness follow-ups (fixed 2026-10-21).** Opening the Glass gate exposed two
  more gifting-harness defects on the slow runner. `giftVisuals()` mirrors carried food
  on the next animation frame, but the carried-gift check read the mirror synchronously
  after `sim()`; it had only passed locally because the mirror already held an
  unrelated mesh (a dropped portion) and the check merely required a non-empty list. The debug payload now carries the owner `uid` and the check waits
  for that uid before asserting. The save/load evaluation also exceeded the 30 s
  evaluate timeout and now uses the same 120 s allowance as the social suite.
- **Citizen panel (fixed).** The two refresh signatures now share one helper, and rows
  are keyed by actor uid and updated in place instead of rebuilding the whole list.
  Browser checks keep an original row connected after idle and complete 10/10 CDP
  clicks; the Studio browser regression covers the same stability after save/load.
- **Glass rocket blasts (fixed).** `applyBlastImpulse` now calls the Glass adapter,
  which enters dynamic mode and applies a mass-scaled impulse plus visual tumble, so
  the hover sync cannot erase the blast. A probe confirmed a burst moves Glass from
  hover to `freeBody`.
- **AI inactivity / refusals (fixed for command/travel stalls).** Family-task travel
  now restarts when `moving` is false even if a stale path remains. Commands can
  preempt a family task, cancel both partners, and block autonomous tasks while the
  directive is active; lesson candidates skip students with a queued/active directive.
  A probe confirms the lesson pair is cleared and the command reaches its target
  after the designed willingness roll. Commands can still be refused by the existing
  needs/boldness probability; changing that is a separate balance decision.
- **Critical needs interrupt optional interactions (fixed).** Ordinary hunger and
  thirst still wait for a short invite/social/visit/mate/family task to finish. At the
  profile's critical thresholds, the pair is canceled cleanly and the actor claims
  food or water instead. Unit tests cover ordinary patience, critical hunger, critical
  thirst during a visit, and bounded visit completion; the Glass lifecycle needs
  check now passes, and the full Glass lifecycle completes.
- **House entry/exit loop (reported, not reproduced):** a 150-second deterministic
  night run at 23:30 put actors to sleep normally; no enter/leave cycle appeared.
  Family tasks near a home door can look like repeated house visits, so capture the
  specific pair/time before changing schedules. The family-task travel restart above
  removes one cause of repeated task churn.
- **Refusal emoji background (checked, safeguard added):** `AGENTS.md` now requires
  close-up light/dark checks for square backing, halos, matte fringes and blend seams.
  Day/night crops show clean transparent corners; the canvas is explicitly cleared,
  mipmaps are disabled and the sprite rejects transparent texels with `alphaTest`.
  Other emote kinds were not individually re-captured.
- **Legacy fallback code removed (C).** `ai.js` is a thin hop adapter plus directives;
  `glass.js` is a hover/GLB adapter. The old decision helpers and unreachable state
  dispatch are gone.
- **Glass balance is preserved by profile.** Food/water/social/mate values remain in
  `behaviorprofiles.js`; the Phase C behavior checks cover shelter, stargaze, social and
  mate paths.
- **Meal tasks now trigger from routines; lessons are parent/child only.** Phase E adds
  once-per-day teaching for a parent’s own baby/teen. Non-parent mentoring and sibling
  teaching are not implemented.
- **Adult skills are seeded on first attach.** Legacy adult saves with all-zero skills gain
  a small forage/courage/social baseline; children start at zero and learn. The history
  panel shows the five most recent events, while `__gummy.lineage(uid)` returns the full
  saved history.
- **`__gummy.familyPlay(i,j)` now starts a playdate task** with a shared meeting point,
  not the old in-place social pair. Existing harnesses that expected immediate `social`
  should assert `familyTask` first.
- **Playdates are daytime-only.** Family acquisition and due playdates check the actor's
  day/night profile; forced debug hooks can still start one at night.

## Personality and modular-AI extension track

This is an additive foundation, not a replacement engine. Chunks 1 and 2 are approved and
committed; chunk 3 is approved as the two-activity chooser prototype below. Chunk 4
requires its own behavior/persistence decisions and approval. New core logic uses plain data
and explicit host inputs for easy translation to Godot; this is not an engine migration.

| Chunk | Status / dependencies | Scope | Acceptance gate |
| --- | --- | --- | --- |
| **1 — Contracts and personality definitions/presets** | ✅ Implemented and committed as `99e9e36`; subsequent code run `39795559309` passed hosted CI | Guidance; validated module contracts and registration/config checks; explicit supported/unsupported toggle policies; reusable conformance tests; ordered trait definitions and validated, unapplied shy/adventurous/food-motivated preset data | Positive/negative contract fixtures; scope/admission/existing-activity/re-enable/cleanup checks where supported; unchanged defaults, trait order, founder values, inheritance RNG and save shape; Node/browser/parity evidence. No automatic preset assignment or personality enablement. |
| **2 — Preferences, habits and personality extension points** | ✅ Stargazing prototype implemented, verified locally and committed as `8eeece4`; hosted CI for that revision was not watched | Separate stable traits, temporary mood, preferences and learned habits. Extend supported bounded parameter effects and reusable inheritance/migration/cache contracts. Prove one representative opt-in addition before replication. | Approved bounds/persistence below. Behavioral differentiation, save/load, map isolation, enabled determinism/RNG and disabled compatibility verified; survival priorities remain authoritative. |
| **3 — Optional activity proposals** | ✅ Two-activity chooser prototyped; social/stargazing only, off by default | Shared eligibility/reason/score/explanation interface; ordered cascade preserved while the chooser is off. A separately enabled chooser ranks existing optional activities. | Approved set, scores, ties, attempts and lifecycle below. Natural stargazing and social starts, exactly-once completion, decline and interruption cleanup, dispatch consistency, priorities, determinism, save/map isolation and a measured evaluation cost (~2 µs per actor on this machine) verified. No override of essential needs or player commands. |
| **4 — Bounded goals over existing actions** | Planned; depends on 3 | Goal preconditions, progress/completion, expiry/abandonment, interruption/resumption and bounded memory/evaluation. Reuse existing movement and interaction protocols; prove one small multi-step goal before general planning. | Approve representative goal, persistence and limits first. Verify successful and impossible plans, interruptions, claim cleanup, save/load, map/new-game isolation, deterministic behavior and runtime budget. No unbounded planner or second simulation system. |

**Protected in chunk 1:** personality remains off by default; no new trait axes,
actor-save format changes, chooser/planner, dependencies or broad engine rewrite.
Essential behaviors are not made arbitrarily disableable. Declare unsupported
configuration rather than implying that every engine module has full toggle support.

**Chunk 1 evidence:** 303 Node checks pass, including contract positive/negative
fixtures, per-module config scope/re-enable/reset, mate admission/in-flight/cleanup
conformance, and personality definition/preset validation with unchanged founder
hash baselines. `node scripts/check-behavior-contracts.mjs` reports 17 module/
capability declarations, 34 states and 19 opportunities with no errors. HTTP smoke
67/67, core browser regression and the short all-race parity matrix pass; a fresh
15-case long parity matrix reports `tier: long`, `acceptance: true`, zero reuse.
No hosted CI or personality-enabled visual evidence was produced by this chunk.

**Chunk 2 approved contract:** independent off-by-default `preferences` and `habits`
flags; Glass stargazing only. Explicit liking `0..1` (neutral `.5`) adds up to ±`.04`
to chance; learned strength `0..1` adds up to `.02`. A completed uninterrupted session
adds `.1`; active simulated days decay `.05` each. Paused/inactive/offline time freezes
state. Disabling stops that effect/learning/decay but retains saved values and clears
current learning eligibility. Neither likes nor habits are inherited. Existing chance
clamps, eligibility, order, survival gates, session timing and RNG calls are preserved.
Sparse actor record v9 carries meaningful preference/habit state; old records retain
their previous versions. Core pure rules live in `src/behaviors/preferences.js`, actor
and clock wiring in the existing host, and migration in the existing save boundary.
No activity chooser, general goals, dependencies, UI toggle or Godot integration.

**Chunk 2 acceptance:** 316 Node tests pass, including 13 disposition-specific tests
for pure translation fixtures, malformed input, cache freshness, neutral/disabled
effects, natural ordered selection, survival interruption, exactly-once learning,
post-grab resumption, active-time decay, seeded enabled traces with instrumented RNG,
v9 migration and coexistence with prior save fields. The served prototype harness
(`node scripts/preferences-test.mjs`) passes all 12 checks: default-off and enabled
effects, real natural stargazing/completion, disabled freeze/re-enable, actual v9
save/load, inactive-map freeze/return, Glass newborn non-inheritance and loading an
unrelated game with reused UIDs. Its report is `.dev-shots/preferences-test.json`.
The feature does not add a pair, reservation, bond/resource effect, UI or new visual
asset; those additions are excluded rather than implied by solo-activity checks.

HTTP smoke 67/67 and behavior contracts 17 declarations/34 states/19 opportunities
pass. Full browser regression with Studio passes for both modules and legacy;
the 180-step seeded browser trace matches, and full social (16) and gifting (8)
checks pass. Existing desktop/mobile Settings captures were inspected. Short
all-race parity passes 9/9; final fresh long parity passes 15/15, 20 days × five
seeds × three races, `tier: long`, `acceptance: true`, zero reuse. Enabled behavior
evidence is separate from that disabled compatibility matrix. Chunk 2 was committed as
`8eeece4` and pushed to `main`; its hosted CI run was not watched, so no hosted result is
claimed. Optional features remain off by default.

**Chunk 3 approved contract:** one modules-only, off-by-default `activityChooser` flag.
Candidates are the existing optional slots `social.company` (order 110) and Glass
`stargaze.seek` (order 120); the enabled slot `wander.activity` (order 115) ranks them,
while the flag-off cascade keeps its exact authored calls. Evaluation is RNG-free and
reserves nothing. Social score is per-axis need above its own seek threshold normalized to
`0..1` (max of social/affection); stargazing score is the resolved chance divided by its
`.25` ceiling, so batch 2 effects apply once. Exact ties keep authored order (social first).
Each ranked candidate is attempted once through its existing admission; if all fail the
ordinary arrival/idling/wander fallback runs. While the flag is on, the generic
`runOpportunities()` helper skips both member slots so an order-only dispatch cannot start
them ahead of the ranked entry. Essential needs, family routines, mating,
following, relationship activities, gifting and player directives stay authoritative and
ahead of the chooser. The latest decision (candidates, reasons, scores, contributions,
ranked, chosen, started, refused, outcome) is runtime-only, never saved or inherited, and
is cleared when the flag is disabled. No new activity, persistence/version change, UI or
Godot integration.

**Chunk 3 acceptance:** 330 Node tests pass, including 14 chooser tests for the portable
core, RNG-free evaluation, ranking/ties, refusal/fallback, priority, dispatcher consistency,
exactly-once social completion, decline, interruption cleanup, disable/re-enable during an
active session and the runtime-only save shape. Behavior contracts report 17 modules/34
states/20 opportunities with no errors; HTTP smoke passes 68/68. The served chooser harness
(`node scripts/chooser-test.mjs`) passes all 17 checks, with its report in
`.dev-shots/chooser-test.json`: default-off/enabled, both candidates, approved scores, a real
natural stargazing start and one completed session, a natural social start under stronger
pressure, explanation shape, runtime-only save shape, disable-while-active/re-enable, actual
save/load, inactive-map isolation and return, and another-game restore. Evaluation cost
measured on this machine (Node, one Glass actor, two candidates, gather+rank+explain,
5×20,000 after warmup) is a 1.78 µs median and 2.09 µs worst case. Full browser regression
passes with Studio and with `BEHAVIORS=legacy`; the preference prototype harness still
passes 12/12. Short all-race
parity passes 9/9 fresh; final fresh long parity passes 15/15 (20 days × five seeds × three
races), `tier: long`, `acceptance: true`, zero reuse. Chooser-enabled evidence is separate
from that disabled compatibility matrix. Hosted CI for this revision was not run.

**Known follow-ups — stargaze timer is decremented twice (deferred):** active
stargazing runs the generic `ai.idleT -= dt` in `src/behaviors/engine.js` and then
another decrement in `src/behaviors/stargaze.js`. Sessions can finish in roughly half
their sampled timer. This is inherited behavior, not introduced by preferences;
changing it would alter timing and legacy parity. Batch 2 preserves it and rewards
only the existing successful completion transition. Fix separately with an explicit
timing/parity decision.

**Known follow-ups — historical interruption flag must not gate new learning
(fixed in batch 2):** Glass can retain `ai.interrupted` after grab/release; using
that host flag to decide whether a later stargazing session completed would suppress
learning indefinitely. Completion now uses only the per-session token cleared by
cancellation, and a grab/release/new-session regression proves learning resumes.

**Known follow-ups — module setter accepts unknown IDs (needs decision):**
`setModuleEnabled('notAModule', true)` and `setModuleParams(...)` return `true`
while no such module resolves (`src/behaviors/config.js`). The new inventory check
catches undeclared config during tests, but the runtime setter still reports false
success. Rejecting unknown IDs would tighten a debug/UI API contract and could turn
a silent no-op into an error for existing callers; choosing between rejecting,
warning and leaving it permissive is a design decision, so it is deferred rather
than changed here. Trigger: any caller toggling a misspelled or unwired module ID.

**Known follow-ups — hosted Settings mobile boot timeout (fixed in harness):** run
39785806336 for `d86d09a` failed only `Browser (settings)`; the mobile page's
`__gummy.booted` wait (60 s) expired while the finished desktop page still held its
WebGL context under software rendering, so `Required CI checks` failed and Pages was
correctly skipped. Closing the desktop target and allowing 120 s did not settle it:
run 39787626263 still timed out booting that second page, with the retained stack in
`WebGLProgram.getUniforms` under SwiftShader. The Settings scenario now emulates the
390×844 viewport on the already-booted page instead of booting a second WebGL page;
the full suite keeps its separate mobile page. That run also failed
`Browser (partnership)` with an empty server log and no report JSON, i.e. the browser
never launched. Launch and connect now run inside both interaction harnesses' guarded
section so a report is written, the CDP endpoint allowance is 60 s, and launch failure
reports browser stderr. Local re-checks pass (settings desktop+mobile captures
inspected, full social and gifting suites, forced launch-failure report). Hosted
re-verification is pending; a resized session is not a cold mobile-load test.

Run 39789761139 then passed Settings, partnership and the rest, but `Browser
(gift-flow)` timed out at the 90 s boot gate with `Runtime.evaluate` and
`Debugger.pause` both timing out and no stack. The project already records the
first Glass frame blocking for roughly 100 s under SwiftShader, so the boot gate was
below the documented worst case; the three browser harnesses now allow 180 s to
boot. Assertions, the Glass-ready gate and the 12-minute job timeouts are unchanged.

Run 39790957070 then passed 12 of 13 jobs, but a different single job
(`gift-persistence`) still failed to boot even with 180 s: `Runtime.evaluate` timed
out for the whole gate with no stack. Run 39792375004 again passed 12 of 13, this
time failing `glass-social` after two target-level boot attempts; its server log
showed the page loading every module and the catalogue before hanging, i.e. the
documented first-frame stall rather than a load failure.

A different arbitrary job failing each run, always before the first frame and never
in an assertion, matches a wedged renderer rather than an app defect. The shared
harness now passes `--disable-dev-shm-usage` (container `/dev/shm` exhaustion is a
known cause of software-rendered WebGL hangs) and boots through
`connectBootedBrowser`, which makes one recorded relaunch with a **fresh browser
process** — closing only the target reuses the wedged GPU process and did not
recover. Launch failures retry on the same path. The first attempt's diagnostics and
the retry are written to the report; assertions and job timeouts are unchanged, so a
genuine boot regression still fails visibly.

**Hosted result (run 39795559309, `506ba54`): pass.** All 11 browser jobs, the
aggregate gate and Pages succeeded. `glass-social` used boot attempt 2 — the
fresh-process relaunch recovered a stalled first frame and its assertion passed with
`bootAttempt: 2` in the report. Total wall clock was 14m10s: the recovery path costs
roughly two extra minutes when it fires, and the stalled runner is still slow rather
than fully explained. This is one green run with a proven recovery path, not a
flake-rate measurement; the underlying first-frame stall remains an open
environment finding.

**Known follow-ups — opaque rendering pilot (local only, 2026-10-22):**
`?testRender=opaque` opts into a scene-level `MeshBasicMaterial` override in
`src/app.js`; geometry, asset loading and simulation remain unchanged. Normal
rendering and CI defaults are unchanged. Run the partnership pilot with
`LOW_QUALITY=1 WIDTH=900 HEIGHT=600 SCENARIO=partnership FAST=1
GAME_URL='http://localhost:8000/?testRender=opaque' node scripts/social-test.mjs`
(substitute the reported server port). All five partnership assertions passed
with and without the flag on the current working tree; 325 Node checks and 68
HTTP smoke checks passed. A separate sequential forced-SwiftShader comparison
reported normal/opaque boot times of 41.2/15.4 s, and elapsed times through Glass
readiness, inspection and capture of 99.6/38.6 s, with 86/5 compiled programs.
These are single local samples, not a reliability measurement or exact state-parity
proof. Both retained two ready Glass actors and no captured page errors.
Inspected `.dev-shots/opaque-pilot-{normal,opaque}-front.png` captures confirm
the override, but custom foliage paths still render colour and opaque billboard
backings are visible: this diagnostic mode is not visual acceptance or a complete
hitbox/proxy renderer. Hosted stalls remain unresolved; no CI rollout is approved
by this pilot. Evidence is in `.dev-shots/opaque-pilot-comparison.json` and
`social-opaque-pilot-{normal,simple}-partnership.json`.

**Startup diagnostic retention (verified locally and hosted):**
`connectBootedBrowser` now preserves page diagnostics for every failed boot,
including its stall probe, lifecycle, errors and polling timings. Both interaction
reports retain all attempts and elapsed boot times, including failures followed
by recovery; a final boot failure exposes the last page diagnostics under `harness`.
Two deliberately failing data-URL boots retained their console marker, wait
expression and timings with distinct fresh-process target IDs; a successful
fixture also verified elapsed-time reporting. Callback failures still clean up
the launched browser. Fixture evidence: `.dev-shots/boot-diagnostics-fixture.json`.
The latest hosted partnership failure (39825423266) exhausted both fresh-process
attempts without executing assertions; its successful HTTP requests do not prove
application boot or identify the exact rendering stall.

**Render comparison experiment (hosted sample completed):**
`.github/workflows/render-comparison.yml` is manual-only, independent of required
CI and Pages. It runs three paired samples of pair, rivalry, partnership, groups,
Glass-social, gift-flow and gift-persistence: 21 jobs / 42 existing-test executions.
Each pair uses the same checked-out revision and runner, sequential fresh browser
profiles, normal/opaque order reversed in sample 2, and unchanged assertions,
180-second boot allowance and one recorded fresh-process retry. A failed mode
does not prevent its counterpart from running; either failure fails the experiment
job without gating production. Each execution has the existing 12-minute bound;
the pair job allows 30 minutes. Four jobs run concurrently at most. Artifacts retain
all JSON, output logs, exit status, wall seconds and server logs for seven days.
`RENDER_COMPARISON=1` records the actual rendering override/backend and fails a
mode mismatch. Settings, carry, pointer, animation and visual acceptance are not
certified by this experiment; their required normal-rendering lanes are unchanged.
Local verification: YAML and shell syntax/matrix checks, 330 Node checks, 68 HTTP
checks, full social 16/16 and gifting 8/8 in each mode, no page errors. These four
browser runs used Apple M1 Metal, not hosted SwiftShader, and do not establish
CI reliability or exact seeded state parity. Reports:
`.dev-shots/{social,gifting}-comparison-{normal,opaque}-all.json`.
An extracted workflow-loop fixture under `bash -e` also verified that a nonzero
normal-mode exit still runs opaque, fails the pair, and respects reversed order.

Hosted run [39831909017](https://github.com/Hydraxon91/zummi-gummi/actions/runs/39831909017)
at `d88631b391548c21fc1be63bd189b57bb49feda0` passed all 21 paired jobs.
All 42 reports confirmed SwiftShader (Subzero) and passed their original checks
without page errors. Opaque passed 21/21 with zero failed boot attempts; normal
passed 21/21 after three initial boot failures recovered by the existing retry
(rivalry sample 1, groups sample 3, gift-persistence sample 2). Median per-execution
wall time was normal 167 s versus opaque 34 s; total execution wall seconds were
3665 versus 747, excluding runner setup/artifact upload. See `PERFORMANCE.md`
for method and ranges. This is one paired batch, not zero-flake acceptance.

Required Smoke test [39831895521](https://github.com/Hydraxon91/zummi-gummi/actions/runs/39831895521)
on the same SHA **failed** only `Browser (gift-persistence)` after two 180-second
boot attempts, before any assertions. Both page diagnostic snapshots survived:
GPU `ReadPixels` stall warnings, repeated CDP evaluation timeouts and debugger
probe/pause timeouts, without page errors. No JavaScript stack was recovered;
the exact blocking operation remains unresolved. No rerun or production-lane
switch was made. Opaque evidence supports a rendering-related mitigation for
nonvisual tests, not proof of a specific model defect or storage bug.

## Modular NPC behavior system (step 3, Oct 2026)

**Known follow-ups — opaque required-CI rollout (configured locally; hosted checks pending):**
The seven nonvisual scenarios sampled above now opt into `testRender=opaque` in
`.github/workflows/smoke.yml`, with `RENDER_COMPARISON=1` verifying and reporting
the actual override/backend. Core, parity, settings and gift-carry remain normal;
nightly and the manual comparison workflow are unchanged. Assertions, readiness
gates, retries, 12-minute browser-job bounds and aggregate/deployment policy are
unchanged. Local YAML/matrix validation confirms exactly seven opaque and four
normal lanes; 330 Node checks pass. Prior browser evidence verifies these existing
flags, not execution of the newly configured hosted workflow. A fresh required-CI
run and repeat paired sample remain pending publication; no zero-flake claim.

One behavior engine for Bear, Gummy and Glass, with each behavior a module that can be
enabled, disabled or tuned per race, per actor or at runtime. Parity with today's behavior
is the acceptance gate. The modular engine is the default; the legacy engine remains an
untouched, selectable oracle.

**Approved decisions:**

- **Facade layout, `behavior.js` untouched.** `src/behaviors/index.js` picks the engine:
  `createBehavior({ engine: 'legacy' | 'modules' })`, default `modules` since step 5.
  `?behaviors=legacy` keeps the reference implementation available; it is not moved until
  a separate cleanup approval.
- **Per-actor overrides are runtime-only.** They live in `behaviors/config.js`, not in the
  actor save record, so no actor-save version bump is needed. Bonds, history, playdates,
  directives and every existing actor field keep their current shape.
- **Unknown species keep the BEAR fallback** with a one-time warning per species. The
  fallback is not changed to an error.
- **Temporary scaffold removed.** Steps 3–4 moved every region out of
  `src/behaviors/engine.js`; `scripts/port-markers.txt` is empty and
  `scripts/check-port-markers.mjs` now fails on any `TEMPORARY(port)` marker. The guard
  was re-proved in step 5 with a planted marker.
- **Step 5 cleanups approved:** delete the dead `directives: true` key, import the single
  `HOME_CAPACITY`, document `PREGNANCY_HUNGER` as the profile fallback, remove the unused
  `const p` locals, derive state lists from modules, and have `ai.js` read directive
  `ttl`/`max` from config (still 45/3). **Not approved:** wiring `conflict.damage`,
  `healthFloor` or `shove`; they stay reserved. `seekSocial` stays.

**Layered config (later wins):** module defaults → race profile → per-actor override →
runtime toggle. Resolved once per actor and cached by config version; modules never merge
config per tick. Race profiles declare capability modules as
`modules.<id>.{ enabled, params }`; the legacy flat `hive`/`conflict`/`directives`/
`stargaze` sections are derived views for `behavior.js`. Other balance blocks stay flat.

**Arbitration:** the existing selection order becomes explicit opportunity `order` values.
Rest stays above directives, scheduled meals stay above plain hunger, and conflict keeps its
two positions (critical and fallback). Selection is first-match in `order`; `canRun` draws
no RNG and only the winning `enter` runs, so the RNG sequence is unchanged. Utility scoring
is available to modules for target ranking but eager scoring/arbitration ships off.

**Quirk flags (all default off, so current behavior is preserved):**

| Flag | Quirk |
| --- | --- |
| `glassNightWindow` | Glass stargaze currently treats "not day" as outside 09:00–16:00. |
| `glassBedtimeMode` | Glass draws night `bedtime`/`wakeTime` despite `dayShelter`. |
| `singleDayWindow` | Behavior uses a 09:00–16:00 Glass day; `glass.js` uses 08:00–18:00. |
| `cancelPairStateReset` | `cancelPair` leaves non-listed states selected after cleanup. |
| `matePairOnPathFailure` | `startSeekMate` pairs before the path succeeds. |
| `glassEngineRng` | `glass.js` `insideT` uses `Math.random` instead of the engine RNG. |

**Checkpoint C1 corrections (Oct 2026):**

- Follow retry is **30 s**, not the older 8 s literal; the port preserves the current
  `b7f5fea` throttle.
- Stargaze uses the existing quirk-11 window: **outside 09:00–16:00**, which includes
  16:00–24:00 and 00:00–09:00, not only 06:00–09:00/16:00–18:00. No gate change was made.
- Conflict tie and health-floor outcomes are covered **only by the conflict scenario pack**;
  open-world 20-day runs had 0 tie and 0 health-floor hits (179 actor / 171 opponent wins).
- C2 ports family tasks; C3 ports `directives` and `flee`, leaving no temporary markers.

**Step-5 follow-up — pair/task writer protocol:** `interactions.js` is **not** the only
writer of `ai.partner`/`ai.familyTask`. A repo grep still finds direct assignments in
`social.js`, `mate.js`, `conflict.js`, `glass.js`, `ai.js` and legacy `behavior.js`
(`friend`-level code predates the module split). The family module itself only uses
`startTask`/`cancelTask`/`endPair`. Deferred beyond step 5; it is not a C3 blocker.

**Step 3 scope and acceptance (this pass):** core skeleton, module contract, layered
config, `hive` module, facade and `?behaviors=` flag, parity harness (seeded RNG, fixed
dt, 3 days per race, transition/need diff, RNG draw counts), legacy-vs-legacy and
perturbation validation, scenario packs, and a `--long` mode (20 days × 5 seeds) for
nightly runs. Acceptance: zero diffs for Bear, Gummy and Glass, existing tests and smoke
green, no behavior change with the legacy default.

**Step 3 result (Oct 2026):** `node scripts/behavior-parity.mjs --long` passes with zero
diffs for Bear, Gummy and Glass across 5 seeds × 20 days (96,000 ticks per run; transition,
need, target, task, bond/history and RNG-draw counts identical). `--validate` passes
legacy-vs-legacy determinism, legacy-vs-modules parity and catches a 0.001 need
perturbation for all three races. The new engine mirrors the follow/playdate stall
changes in `b7f5fea`; the legacy file itself was not edited by this pass. 94 pure tests,
the 64-check smoke test and the core browser regression pass with both
`?behaviors=modules` and the legacy default (the default flipped later, in step 5).

**Step 5 result (Oct 2026):** GUMMY is an independent Bear clone keyed to `msn`; the
facade defaults to `modules` and keeps `?behaviors=legacy`; the approved cleanups landed;
race capability blocks moved to `modules.<id>.{ enabled, params }`; and
`src/behaviors/README.md` now documents adding a behavior and a race, the quirk table and
the changelog. The marker guard was re-proved with a planted marker. The legacy path is
retained. Remaining follow-ups are the pair/task writer protocol above and the reserved
conflict fields (`damage`, `healthFloor`, `shove`), which remain unwired.

**Behavioral changelog:** no behavior change from the step-5 cleanup. `modules` and
`legacy` still produce the same transitions, needs, targets, tasks, bonds, history,
playdates and RNG draws; the module default only changes which implementation runs.

**Personality (Oct 2026, off by default):** modules-only `personality` flag with
`bold`/`greed`/`curiosity` axes. Founders use a deterministic uid/species/axis hash (no
RNG); children use `blendTraits` after the existing birth draws. Offsets are bounded and
Glass long-wander chance stays 0; Glass curiosity uses a 2× short-wander step so it is not
inert. Actor records without traits remain `actorVersion: 2` and stay loadable by older
builds; records with traits use `actorVersion: 3`, and old saves hash on first enabled
attach. **Enabling the flag changes existing actors' behavior; hashed founders are not
neutral.** `?behaviors=legacy` ignores the flag. Scenario pack:
`node scripts/personality-scenario.mjs` (all-bold/shy, greedy/generous, curious/homebody
with direction checks). The natural-needs 20-day × 3-seed report
(`scripts/personality-baseline.mjs`) shows small and noisy effect sizes; it is not a
scale claim. The controlled pack proves direction only.

**Departure hook (Oct 2026, off by default):** runtime-only capture of
`removed`/`stars` departures, with `stars` reasons `oldAge`, `starvation` or
`sting`. Survivor bonds come from `bondOf` before detach/prune. Ceiling culling
is `removed` and does not mourn; map switches, new games and loads are teardown.
No save fields, no RNG, no stars implementation yet.

**Stars / farewells (Oct 2026, off by default):** modules-only master + per-cause
flags, runtime-only fading, uid-hash old age measured against saved age, 120 s
starvation at the unchanged health floor, sting acceleration only while fading,
pregnancy/baby-household/population/last-species/stay safeguards, one-day retry,
irreversible committed cleanup, additive actor glow, and transient queued night
stars. App day is 600 s; harness day is 240 s. No save fields, new history kind,
or RNG. Closeout (2026-10-21): 173 Node checks, the stars browser lifecycle and
normal-rendering Glass **20/20 modules + 20/20 legacy**, both standard browser
regressions and inspected fading/rise/night captures pass. The bear-mother forced
birth fixture now resets safe food and waits for a grounded mother; the Glass/bear
collision probe waits for measured separation instead of a fixed sample. The 0/20
legacy and 0/20 modules Glass results came **after** those assertion changes, and a
single legacy collision failure at 0.207 versus the required 0.25 remains
unexplained. The household safeguard also only checks for any other adult in the
baby's home; it does not require a parent or the same species. That gap is noted
here and is not changed. Orphan adoption is implemented as an off-by-default
layer below.

**Mourning (Oct 2026, off by default):** stars-only grief for immediate family or
survivors with bond >= 0.18, scaling from a few game-hours to 14 days by closeness.
Records are per saved actor (`actorVersion: 4`), so separate saves keep separate
grief and new games start clean. Mood subtracts a bounded penalty; close social
contact comforts a survivor by up to six game-hours at most once per game day, and
the shortened deadline clamps to the current time, so nearly expired grief can end
immediately. Grief does not alter needs, health or departure eligibility and
consumes no RNG. Settings
expose the feature under Farewells; legacy remains inert, and turning the feature
off suppresses its effects without deleting saved records. Verified by Node save
tests, `scripts/mourning-test.mjs`, both browser regressions and the stars
lifecycle. Follow-up (2026-10-21): the browser harness now exits non-zero on any
failed check (demonstrated with a deliberate failure) and covers a Glass-survivor
save/load and fresh-game isolation; `tests/mourning-determinism.test.mjs` proves
same-seed trace identity with mourning enabled and zero RNG draws for the
departure and tick-time pruning paths; `--validate` also cross-checks the direct
comparator against JSON every tick. `scripts/mourning-profile.mjs` records the
contended CPU profile in `PERFORMANCE.md`. Physical gifting and the relationship
features are documented below.

**Orphan adoption (Oct 2026, off by default):** modules-only automatic guardians
for baby-stage actors with no active parent and no parent UID in the current
game's roster for the other map. Same-species adult candidates prefer immediate
family (siblings sharing stored parent UIDs), then same household, then a bond >=
0.35, with deterministic bond/UID ties; adults already holding more than two
other active baby dependents are skipped, counting biological children and
adopted babies once each. A grandparent is not recoverable without the absent
linking parent record. Assignment happens on the next think outside a pair
or family task, with a one-game-hour retry when nobody qualifies. `guardianUid` is separate from
`parentUids` and home, clears on parent return, guardian departure or stage-up,
and emits `actorVersion: 5` when present (version 6 with a bond delta, version 7
with a persisted gift day). `follow.seek` stays at order 90 and
targets the guardian when no parent is active; disabling the feature cancels an
active guardian follow while preserving the saved link, and leaves parent-follow
untouched. The off path adds no guardian fields and no RNG. Verified by Node save/behavior tests, `scripts/adoption-test.mjs`
(guardian assignment, save/load, parent return, other-map parent, guardian
removal, Glass assignment/stage-up, fresh game and off), the smoke test and a
fresh long parity matrix.

**Relationship view and interaction memory (Oct 2026, modules):** the selected
actor panel now has **Relationships** and **Recent events** tabs. The read-only
model resolves family, guardian/dependent links, directional bonds and pair
interactions from live actors plus the current game’s inactive-map snapshots;
missing records are labelled unavailable and asymmetric bonds show both values.
Expanding a relationship shows that actor’s latest three recorded interactions.
Completed social pairs, home visits, declined invitations and food conflicts
append to the existing 16-entry history; visits use `visit`/`hosted`, declines
use `decline`/`declined`, and interrupted/unfinished interactions are not
recorded. `bond` remains an unused history kind. No new actor field or actor
version was needed. `interactionHistory` is off in the engine defaults and enabled
by `app.js` for the panel; the parity harness leaves it off so legacy has no extra
history eviction. The comparator also excludes only the module-only interaction
kinds while still comparing state, needs, bonds, playdates, RNG and other history. Verified by Node view/history
tests, `scripts/relationship-test.mjs` (tabs, keyboard, pair expansion, cross-map
and missing relatives, asymmetric bonds, Glass and mobile), both browser
regressions, seeded browser parity and the all-race parity suites.

**Gifting (Oct 2026, off by default, physical v1):** modules-only food gifts. An
adult with enough health and low enough hunger/thirst reserves and collects a
nearby ripe safe source or recovered dropped portion, carries it to a nearby
hungry actor and hands it over. Collection and handover each consume the portion
once; acceptance applies normal satiation, a small symmetric bond and
`gift`/`receivedGift` history, and sets `lastGiftDay` (`actorVersion: 7`, or 8
with another v8 field). An interrupted, disabled, removed or map-switched carry
drops a recoverable portion at the giver’s position; a post-collection refusal
also drops it. Portions keep their originating map, do not resume as active
offers after load, and are converted from carried to dropped on load. Critical
needs, grabs, departure, disable and map switches release both participants;
unreachable offers time out; competing givers cannot reserve one source; Glass can
give and receive; enabled gifting draws no RNG. Verified by Node gift/save/
determinism tests, `scripts/gifting-test.mjs`, `scripts/social-test.mjs`, both
browser regressions and the long parity matrix.

**Pair activities, bonds and groups (Oct 2026, off by default):** `pairActivities`
adds chat (all stages/species) and cuddle (reciprocal bond `>= .35`) with
`.02`/`.04` bond gains and 30/60-second cooldowns. `rivalry` persists completed
conflicts as reciprocal unresolved records; `reconciliation` clears them with a
six-second repair and `.04` bond, plus a 30-second failed-attempt cooldown.
`partnership` forms exclusive reciprocal adult partnerships at a `.65` mutual
bond, survives maps and saves, and ends through explicit separation or committed
departure. `groupActivities` runs three-to-five-agent spaced `groupPlay`/
`groupGather` activities with a five-second join window, ten-second act, one
`.01` bond per pair and 45-second cooldown. All four reuse the shared pair/task
protocol and cancel on critical needs, grabs, removal, map switches and feature
disable. `relationshipview.js` exposes directional friendship labels
(`acquaintance`/`familiar`/`friend`/`close friend`), a separate partnership row
with an explicit end action, and rival rows. Actor records use `actorVersion: 8`
for rivalry, partnership or carried portions; contradictory non-reciprocal
records are rejected before load. Verified by Node feature/save/view tests,
`scripts/social-test.mjs` (desktop/mobile settings, Glass, v8 save/load and
dropped-portion map isolation), both browser regressions and the long parity
matrix.

**Actor identity (Oct 2026, fixed):** a loaded save reserves the highest UID
across both maps and Glass before any restored actor spawns; map activation
reserves again, and a new game resets the allocator to its own identity space.
Duplicate UIDs anywhere in a save are rejected before the live session changes.
No automatic renumbering is performed, so an existing duplicate save fails to
load with a clear error and needs a recovery decision. Verified by
`scripts/uid-test.mjs` (high Glass UID on the active and inactive maps, soft-body
and Glass spawns, parent/bond/guardian preservation, duplicate rejection, fresh
game and both map-switch directions) and the Node save tests.

**Mood (Oct 2026, off by default):** derived needs/bonds/history mood, 4 Hz target,
8 s smoothing, 0.05 buckets, bounded offsets stacked after traits, runtime-only
`ai.mood` fields with no save change, mood-tinted thought bubbles. Config invalidations
measured at **106 per sim-hour for 40 actors**. Controlled unhappy/content pack passes
per race. Natural-needs 20-day × 3-seed samples (86,400 1 s samples and 18 actor-runs
per race) give Bear/Gummy mean −0.143, p10 −0.385, p50 −0.110, p90 +0.053 and Glass
mean +0.036, p10 −0.030, p50 +0.050, p90 +0.086. The off/on perf rerun was contended
(load 3–10 on 8 cores): baseline medians 24.14 vs 24.54 ms and repeat 25.66 vs 24.19 ms,
with no demonstrated frame-time effect. A warm follow-up after Blender closed
(background load 1.8–3.2) measured off 22.53/22.59 ms versus on 22.51/22.45 ms,
a 0.14 ms repeat difference with overlapping ranges: no measurable mood cost.
See `PERFORMANCE.md`. Mood has no RNG and no death/mourning behavior.

**`glass-test.mjs` family-follow flake (pre-existing, fixed 2026-10-20):** the original
20-run samples measured 5/20 failures at `b7f5fea` (before the modular refactor) and 6/20
under each of the current `?behaviors=legacy` and `?behaviors=modules` paths. The dominant
failure was the test's assertion that a child already in a `familyTask` must have
`follow === mother`; a sibling playdate, lesson or household meal can legitimately claim the
child first, and the child can follow either parent. The assertion now accepts a parent
follow and a sibling/meal task claim, retries the pointer grab once on a stale hover point,
waits for the shelter fade in steps, and resets the pair before the reciprocal mating check.
Final 20-run samples: **20/20 legacy and 20/20 modules**, zero failures. The pre-refactor
samples remain useful evidence that the flake was not introduced by the module refactor.

**Known follow-ups — browser test latency (2026-10-21, partial):**
`browser-harness.mjs` now caps each polling evaluation to the remaining wait deadline
and rejects commands after connection closure/browser exit. Previously a short wait
could spend 60 seconds in a single poll. Glass evaluations now record duration and
use a 30-second default rather than 120 seconds; the post-simulation allowance is
also 30 seconds rather than 180. One modules lifecycle pass and 173 Node checks pass.
Glass now supports independent `SCENARIO=drag|growth|social|hover|needs|night`
checks and the prerequisite-preserving `lifecycle` group; default `all` retains
coverage. Opt-in `FAST=1` pauses background rendering after the pointer checks and
omits explicit surface rebuilds during behavioral fast-forward. The normal lane
remains available for rendering/mesh validation. `glass-fast-parity.mjs` compares
actor state, all soft-body positions and RNG at five checkpoints over ten simulated
seconds: modules and legacy pass. Full fast lifecycle passes in both engines and
each selected scenario passes in modules. Evaluation time in the exploratory full
modules samples was 7.96 s normal versus 3.78 s fast (not an end-to-end benchmark).
No physics timestep or app day-length change is made.
Intermittent browser stalls remain unresolved, not certified fixed by this pass.
Targeted stall investigation: boot-state and WebGL error reads are now separate
phases; the harness retains the last 100 network failure, browser log and renderer
crash/detachment events. A deliberately refused request and `Page.crash` fixture
confirmed `Network.loadingFailed`, `Log.entryAdded` and `Inspector.targetCrashed`
retention. Five fresh normal-rendering modules hover runs passed without reproducing
the stall; this is non-reproduction, not a root-cause fix or reliability acceptance.
`STALL_DIAGNOSTICS=1` additionally enables the debugger before navigation and,
on the first evaluation timeout, records process inventory, a macOS browser-process
sample and a paused JS stack before resuming. A forced infinite-loop fixture
verified the exact blocking function is captured (enabling the debugger only after
the hang failed and was corrected). Five additional targeted launches with this
instrumentation did not reproduce the real stall; no speculative game fix applied.

## Content extensibility track (implemented, Oct 2026)

**Known follow-ups — parity test tiers (2026-10-21, fixed):** the matrix previously
labeled any fresh run `acceptance: true`, even a short development probe. Reports
now distinguish freshness, development/long tier and successful full acceptance.
Use targeted checks during edits, the two-day × three-seed all-race matrix at
feature review, and one fresh long matrix only after the feature is ready. This
changes scheduling and evidence labels, not timestep, coverage or comparison rules.

**Parity follow-up:** the direct-field comparator passed all 15 long cases in
341 s (earlier JSON matrix 427 s); a full-length Glass reference cross-check
compared both methods at every tick with identical RNG counts. Default remains
JSON. Glass-first scheduling and nonverbose transition counting avoid excess
tail work/log retention. Persistent worker pools and three-worker tuning remain
unmeasured. Mourning is completed and verified separately; see its entry above.

**Known follow-ups — parity runtime (2026-10-21, optimized):** profiling confirmed
snapshot serialization/projection costs dominate the short baseline. Reused Map
bookkeeping, immediate matrix failure, optional bounded workers and fingerprinted
development-only resume are implemented without changing tick/day length or seed
coverage. Two-day all-race × three-seed wall time was 7.29 s with one worker versus
4.18 s with two; a fresh long matrix passed all 15 cases in 427 s. The candidate
structural comparator was slower in its short probe and stays experimental;
default acceptance uses JSON each tick. Snapshot caching and hash-only equality
were rejected because they could hide state mutations or collisions. Mourning
was completed in its own scoped change; this tooling pass does not cover it.

Extend the existing ES modules, not the engine stack. Stable definition IDs must
remain separate from placed instance IDs and mutable save state. Preserve current
visuals, balance, authored layouts, batching and save compatibility during extraction.

1. **Food types + flavor deduplication (done).** Define food labels,
   satiation, respawn and safety in a pure registry; query safety rather than
   hardcoded flower/fruit lists. Keep specialized hive behavior and existing
   batched visual builders. Use the existing `config.js` flavor definitions once.
2. **Asset catalog/store (done).** Add stable asset IDs, groups and
   manifest references; coalesce loading, report errors/status and lease resources.
   Share immutable source geometry/textures, never skeletons, actor materials or
   mixer state. Release actor-owned state independently; evict cached sources only
   when unused. Unknown/missing assets report errors, never silent replacements.
3. **Flora/home-style definitions (done).** `floratypes.js` defines tree/bush/rock
   and villa-style IDs. `field.js` and `mapcontent.js` assign species/style IDs;
   the authored tree order, first two hive hosts and villa sequence are preserved.
   Builders remain in `trees.js`, `bushes.js` and `homes.js`.
4. **Map content definitions (done for the current maps).** `mapcontent.js` owns
   authored homes, trees, rocks, the Studio House, cannon home and starter
   populations. World state remains in `world.js`; a new map still needs a builder,
   map definition and save-validation decision before it is playable.
5. **Genes + actor persistence contracts (done).** `dna.js` exposes a gene
   definition registry; species opt in through `genetics.loci`. `actorsave.js`
   owns actor validation, actor save versioning and registered collections, while
   `save.js` keeps the envelope and storage. Unknown species/kind and future actor
   versions are rejected; legacy records remain valid.
6. **AI/directive extension points + UI ownership (later).** Add bounded behavior
   handlers only when new content needs them; preserve shared pair interruption,
   needs priorities and specialized physics. Extract UI by ownership, not a broad
   framework rewrite.

Each slice needs fixture-definition tests plus existing-content regressions. The
asset store is local runtime infrastructure, not a download marketplace or an
authorization to install generators, dependencies or new assets.

**Known follow-ups from this slice:**
- **Fixed: shared asset lifetime.** `glass.js` used to dispose a cloned material's
  texture map even though clones share source textures. Actor disposal now releases
  only its material/skeleton state and source lease; the store owns source eviction.
- **Fixed: manifest path validation.** `assets.js` previously accepted nested `..`
  and external URL forms. Catalog/manifest paths now reject traversal, schemes and
  encoded paths; tests cover those forms.
- **Fixed: partial model/material setup failure.** `msn.js` and `glass.js` now
  detach partial models and dispose tracked actor-owned skeletons/materials before
  releasing the source lease on failure. Store load/retry failures have pure tests;
  arbitrary Blender-export/renderer exceptions are not comprehensively fault-injected.
- **Later: specialized visuals/risks.** A new food type can reuse `flower`/`fruit`
  renderers and safe eating, but an entirely new visual or risky interaction still
  needs a builder/handler. Generic risk plugins are not part of this extraction.

## Bear AI

Each bear has **needs** (hunger, thirst, social, energy, affection), a sex,
age/size, health, and personality traits (bold/shy, appetite, sociability). A
utility selector with cooldowns/hysteresis picks a state roughly once per second.

| State | Trigger | Behaviour |
|---|---|---|
| Wander | default | pick a waypoint, hop there, idle |
| Seek food | hunger high | claim a ripe safe food source, or weigh a hive raid |
| Raid hive | honey desired, health/bravery allow | approach, risk sting; eat or flee hurt |
| Flee bees | stung | run away briefly, then seek safe food |
| Eat | at food | nibble, hunger ↓, food consumed, respawn timer starts |
| Seek water | thirst high | hop to a validated pond-shore approach |
| Drink | at the shore | dip the snout, ripple the water, thirst ↓; water is infinite |
| Seek company | social/affection need high | choose a nearby bear (friends preferred), approach |
| Invite → Social | near the chosen bear | offer a nuzzle; if accepted **both switch to Social**, bounce/nuzzle, hearts, bond ↑; decline = “needs space” |
| Seek conflict / Conflict | critical hunger and a claimed safe-food source nearby | approach, face off, short shove; larger/hungrier/bolder bear keeps or takes the source, loser retargets; no injury |
| Home visit | after a successful social with a bonded friend, daylight | host and guest walk to the host’s villa door, hang out outside, then disperse; interiors are a later pass |
| Seek mate → Mate | adult, opposite sex, satiated, healthy, energy, food reserve and population room | approach, brief readable courtship; female conceives for ~25 s; both enter a mate cooldown |
| Follow | baby with a living parent | stay near the parent, repath as it moves; return to the family home at night |
| Seek home / Rest | night, low health, low energy | walk to the bear’s cottage door, enter, sleep and regen; a warm entrance glow marks an occupied villa |
| Woozy | health near zero | slow, safe food only, no hives/mating/conflict; returns home to recover |
| Grow | passive age | baby → teen → adult at 3/7 minutes; scale, body, surface and eyes rebuild together |

**Directives (Phase 8b):** player commands — go to a point, eat a chosen food,
sleep at home, follow the player, socialize with a chosen bear — enter the
utility selector as high-priority, time-limited proposals instead of overriding
it. The bear weighs them against its needs, personality, health and cooldowns and
can refuse with a visible "no". Possession (8c) suspends the selector for the
controlled bear only; every other bear keeps running its own.

**Locomotion** is procedural directional hopping: a crouch/anticipation, a
forward impulse with a small vertical lift, a grounded turn toward the next
waypoint, and a landing settle. There is no continuous drive and no skeleton;
the metaball jiggle does the acting. Travelling AI hops use a level target pose
with a small (~10°) forward lean, and only launch once the measured body is
upright enough; this keeps takeoff, airtime and landing from retaining a
slouched pose. Player-carried and thrown bears keep their ballistic
orientation. Bears pause their AI while grabbed or airborne, release food claims
on a grab, and resume/retarget after release or a throw. The same interruption
hook is the contract for future partner states.

**Navigation:** open-field steering with separation, obstacle avoidance (pond,
trees, cottages, cannon, arena bounds), stuck detection, and no per-frame
pathfinding. Homes have a door approach point; bears path to the door, not
through a wall. AI ticks at 5–10 Hz, staggered across bears.

**Known follow-ups after the Phase 3a motion pass** — recorded for later, not
current blockers:

- **Interaction facing is latched at start/resume.** `startEat` / `startDrink`
  set `faceYaw`, but it is not re-aimed every tick while interacting. If a bear
  is pushed or drifts while eating/drinking, it can keep facing the original
  point. Re-aim after meaningful displacement without reintroducing the
  close-range angle jitter seen when the source is almost at the bear centre.
- **Interaction timers pause while ungrounded.** `ai.update` handles the
  grounded gate before the eat/drink timer blocks. A bear launched or knocked
  airborne without a grab can pause its meal/drink timer (and `animT`) until it
  lands again. Decide whether a physical launch should suspend or abort the
  interaction.
- **`fieldInfo()` assumes the active map has `bounds`.** It dereferences
  `getActiveMap().bounds.shape`, so calling the debug API while Studio is active
  throws instead of returning a field-only/`null` result.
- **Interaction facing and animation are target-pose effects.** A head pressed
  into a flower/pond edge or a body knocked sideways can lean or clip more than
  intended. Re-check the face rate and the chew/lap amplitudes after playtest;
  the current screenshots show the intended nibble/lap poses, but the target-pose
  approach has no IK/contact solve.
- **Long-wander chance is intentionally independent.** A 25% roll can produce
  consecutive long legs. That is the requested behaviour, but revisit if it
  reads as constant map-crossing during a longer playtest.
- **`wanderCandidate` accepts a long leg at up to 4 units of nav displacement**
  and only requires 80% of the nominal 24-unit minimum after snapping. This is
  deliberate tolerance for the organic boundary, not an exact-distance contract.
- **Arrival is app-owned.** `updateAiLocomotion` sets `arrived` when it reaches
  the final waypoint; `thinkWander` consumes it. Any future locomotion path
  that finishes differently must set or centralise that flag.

Fixed in 3b.0: AI hop targets now level the crouch/air pose to a small forward
lean and takeoff waits for an upright body, rather than carrying a slouched
pitch through the arc. `setEnabled(false)`, `onGrab` and `onRelease` also clear
`arrived`, `turnWait`, `faceYaw` and hop timing so a re-enabled or thrown bear
cannot inherit a stale idle beat or skip a pre-hop turn.

Already fixed in the motion pass: `idleT` previously never decremented (which
could strand a bear in idle after its first task), the old face bias was too weak
and based on measured rotation, and the performance overlay was hidden with the
rest of `.hud`. The performance overlay now intentionally survives Hide UI.

**Known follow-ups after Phase 3b** — recorded for later, not current blockers:

- **Sleeping bears remain physical at the door.** Their mesh, eyes and shadow
  are hidden, but the Box3D bodies stay collidable at the villa entrance. A map
  switch saves that door position but not the sleeping flag, so the bear wakes
  on return. Consider an interior sleep point or collision layer, and persist
  the sleep state cleanly.
- **Home assignment has no bed capacity.** `assignHome` round-robins by bear
  index, so poured/test bears can overfill a villa. Add capacity/claiming with
  the Phase 4–5 home work.
- **Grab/throw resume has no explicit hive/home/sleep branch.** `resumeTask`
  handles food, water and wander; grabbing a bear while it is seeking a hive or
  home currently retargets it to wander. Add explicit resume rules before those
  states become player-facing.
- **Hive approach generation can silently drop a hive.** If no walkable point
  within 1.2 units is found, the visual hive remains but no food source is
  registered; surface that as a layout warning instead of leaving an edible
  object that cannot be targeted.
- **A failed flee path leaves a bear in place.** `startFlee` still spends the
  `flee` timer if `nearestWalkable`/`pathTo` fails; add an immediate safe-food
  fallback or a short retreat target.
- **Health/energy only advance inside `ai.update`.** Disabling AI (Studio or the
  debug toggle) freezes vitals; that is intended for the Studio, but should be
  documented or separated from the debug pause.
- **The occupied-villa marker is an entrance halo, not per-window emissive.**
  This is the Phase 3b approximation; revisit with the 6b-1 occupancy/window
  polish.

**Stall and door-loop safeguards (fixed):**
- Movement-intent seek states now replan when `moving` is false even if a stale
  path remains. A shared watchdog measures approach to the current target, path
  index progress and target changes; after 6 s without progress it releases the
  claim, blacklists that source for 6 s, cancels the active task/pair and returns
  the actor to wander with a short cooldown. It logs one `AI STUCK` diagnostic.
- Follow retries use a 30 s cooldown when the parent target is unreachable,
  and a baby stops following a parent that is inside or sleeping instead of
  pushing into the occupied door. Family-task travel cancels with a shared
  30 s cooldown for both partners when its anchor has no path. This prevents a
  recover/cancel/restart loop.
- Door entries and exits are counted in a 20 s window. A third transition logs
  `DOOR LOOP` with inside/state/timer/shelter/task data; bears get an 8 s rest
  cooldown, Glass gets `shelteredToday` suppression for the rest of the day.
- Core regression injects a stopped seek state and asserts recovery; the full
  regression forces one Glass shelter cycle and asserts at most two transitions;
  soak now flags stationary movement-intent actors, repeated recoveries and door
  loops.

**Known follow-ups after Phase 4** — recorded for later, not current blockers:

- **Home visits stop at the door.** The host/guest pair uses the validated door
  approach, but entering the villa together and returning outside are deferred
  until interiors are authored. The `visitHome` / `visitRole` fields are the seam
  for that transition.
- **Bonds are not shown in the roster yet.** The buddy list reflects the live
  social state, but the numeric pair bond is only in the AI debug readout and
  `__gummy.traits()`. Decide whether a friendship/heart indicator belongs in the
  Phase 6b-1 MSN polish.
- **Removed bears leave stale bond keys.** `bonds` is keyed by a persistent uid;
  removing a bear does not prune other bears’ entries. Harmless in memory, but a
  save/cleanup pass should prune dead uids before Phase 8a persistence.
- **Interrupted social pairs reset without an emote.** Grabbing a partner, a
  night/home override or a map switch breaks the pair into wander immediately;
  add a “maybe later” beat if the interruption feels abrupt in playtests.
- **The emote pool caps at 18 sprites.** In a dense group social burst, some
  hearts/marks are silently dropped rather than queued. This is deliberate for
  frame cost; revisit only if it is noticeable at 40 bears.
- **Only seek states have direct force handlers.** Social, invite, decline, visit,
  conflict, mate and follow states show “Automatic” in the debug selector; use
  `__gummy.forceSocial/forceInvite/forceVisit/forceConflict/forceMate` for
  deterministic checks until those need in-panel controls.

**Known follow-ups after Phase 5** — recorded for later, not current blockers:

- **Home capacity overflows above 32 residents.** Eight authored villas at four
  residents cover 32 of the 40-bear field ceiling. Additional births share the
  least-occupied villa until Phase 9 adds player homes. Decide whether to raise
  the authored capacity or make overflow explicit in the UI.
- **Nursery interiors remain door-level.** Pregnancy and birth use the existing
  home/door path; entering a villa together, a modelled nursery and a family
  interior remain the later interior pass.
- **A stage-up deferred during a grab can leave the carried bear at its old
  scale.** The growth is queued until it is grounded, so the badge/age may lead
  the visible body briefly. This is intentional to avoid rebuilding bodies while
  the player is stretching them.
- **Births while the mother sleeps spawn at the villa door.** This keeps the baby
  visible rather than hidden inside the doorway; revisit with the interior/nursery
  transition.
- **Life timing uses real seconds.** World-speed currently controls the sky, not
  aging, gestation or mate cooldowns. Decide whether a future world-speed control
  should scale life time as well.
- **A rare 20-bear ground tunnel was observed once.** One stress run reported
  `minY -99.66` before the conflict-shove guard; shove impulses now skip airborne,
  pond and near-rim losers and are clamped. Two immediate reruns were normal
  (only the expected pond basin dips). Re-check in the 6b-3 40-bear stress and
  inspect solver seams/CCD if it returns.
- **The life schema is now the Phase 8a freeze point.** Any further change to
  `age`, stages, pregnancy, parent uids or inheritance should add a save migration.

**Known follow-ups after the effects pass** — recorded for later:

- **God rays disabled (6b-3):** the current half-res depth prepass plus radial
  blur read poorly and cost a full extra scene depth pass, so the pass is
  switched off rather than tuned. A better implementation (occlusion-aware,
  cheaper depth source or a sun-disc/beam approach) is future work; the old
  `GodRaysShader`/`computeRay`/`renderDepth` code is retained unused for that
  follow-up. Do not re-enable the current pass.

- **Hero trees and bushes — lush-foliage pass, stage 2 implemented:** leaf cards
  now carry a procedural cluster of ~58 small, randomly oriented leaves instead
  of four oversized sprays. Trees gained clump-outward normals (55% mix) with a
  per-leaf tilt, shared-sun wrap/backlit translucency, darker interiors and
  interior filler cards that close crown see-through holes. Five grow-form
  archetypes now vary the stand — mature, old (thick flared base, wide drooping
  crown), slim (tall with a deliberately thin trunk base), young (short trunk,
  small crown) — and each tree draws its own size and trunk girth inside its
  kind's range, so two trees of one kind still differ. Trunk, crown, fill and
  leaf scaling all follow the kind; trees 0 and 1 stay large because they
  host the hives. Each tree also picks a colour family (mostly green, some
  olive/yellow, rare gold). Bushes now use their own 30-leaf alpha-tested sprig
  card (previously solid untextured leaf strips), placed as 13-14 outward-angled
  sprays per lobe, with smaller and slightly darker lobes so the leaves define
  the silhouette. Lobes and cards share the same green gradient (leaf-green
  highlight, stronger bush tint), so the lit side no longer reads as pale white
  spheres. 72.8k hero-tree leaf cards total. Re-profiled on an idle
  machine at 1440x900, DPR 1, quality 2, effects off, tree-focused camera:
  **22.0–22.4 ms** (five 60-frame forced-sync runs after warm-up, first sample
  discarded as warm-up) versus **19.9–20.1 ms** at the pre-pass baseline; the
  collider and bush-colour fixes did not move it.
  The earlier 23.0–23.8 ms reading
  belongs to the 88.7k-card state; a mid-pass run read 62–75 ms on a thermally
  throttled machine (the unmodified live build read the same) and was discarded.
  Still card-based: hard leaf edges when viewed edge-on and no leaf-level
  shadowing remain; edge-on fading is a follow-up. The widest crown reaches
  about 3.0x lot scale. Verified with smoke 30/30, valid layout, no program
  errors, day/dusk/night, Ultra, bush, wind and bear-vs-trunk captures, and
  re-verified after the collider and bush-colour fixes.
  Distant backdrop trees and hill grass are untouched.
- **Tree trunk colliders — fixed:** the chest-height sphere (0.396 m) left the
  flared base open, so a low or dragged bear could enter the trunk (head reached
  0.15 m from the axis). `field.js` now computes each tree's flared base radius
  from its grow form (0.32–0.78 m) and the app adds a second low static sphere
  at `y = baseR`; the chest sphere and nav solid stay at 0.396 m, so walking and
  nav are unchanged. Re-test: the same drag now stops the head 1.18 m from the
  old trunk axis and 0.77 m from the slim trunk, with no visual penetration.
- **Rapid bear spawning can merge bears into one stuck blob — fixed:** the drop
  buttons and pour now pick the emptiest of 14 candidates inside a capped central
  patch (about 2.0 x 1.6 m; the meadow's table is the whole field, so the spread
  is clamped) and refuse the drop when even the best candidate is closer than
  0.55 m to a bear. `spawn()` now refreshes the centre of mass immediately, so
  same-tick spawns no longer read a recycled bear's previous position. The cannon
  gained a 260 ms cooldown plus spawn clearance at both the muzzle (with one
  forward nudge) and the landing point; a shot that cannot be placed is refused
  and reported as `blocked: 'muzzle' | 'landing'`. Measured: 14 drops in one tick
  settle with a 0.598 m closest pair; 40 rapid clicks accept 23 and settle at
  0.504 m; aiming at the old tree returns false with `blocked: 'landing'` while
  open ground fires; a cannon placed 1 m from that tree also refuses. Deferred
  follow-ups (not blockers): the aim ring does not show why a shot was refused,
  and fired bears are not checked against obstacles along the flight path.
- **Emote sprites — fixed:** the 5 px white stroke at .92 alpha read as a
  see-through border around the heart. The stroke is gone; the glyph is a solid
  colour.
- **White pond-adjacent grass clumps — fixed:** `meadowBankFringe` used the
  grass material without instance colours and placed pond-local coordinates in
  the world group. The main-grass-only audit missed this separate batch. It now
  has explicit green instance colours and the pond centre offset.
- **Grass crossing the irregular sand bank — fixed for inspected views:** root-only
  ellipse rejection did not account for the bank wobble or enlarged cards. Main
  grass and shore fringe now share an irregular exclusion polygon, with
  per-fragment clipping so leaning cards cannot cross it. The approved midpoint
  is 1.25x the water outline, inside the translucent outer sand fade but outside
  the solid bank. Root clearance is 3 cm. The full 1.30x outer fade exclusion
  was too abrupt; clipping only the solid bank allowed too much overlap.
- **Water/shore colour discontinuity — softened:** a lit wet-sand ribbon fades
  inward over the outer 5% of the water outline, matching the bank's material
  lighting instead of relying only on the unlit water-shader colour blend.
  Opaque water, foam and wetness timing are unchanged. Daylight inspected;
  dusk/night and moving-bear interaction still need verification.
- **Wet-bank triangle folding — corrected:** the first radial gap was 1.5%,
  smaller than its possible 1.9% wobble. Reduced the wobble bound to 0.475%
  to keep rings ordered. The lit shallows ribbon remains enabled; inspected
  `x23_shore_ordered.png`, but the user's exact close-up angle needs rechecking.
- **Grass overhanging roads — corrected at fragment level:** root rejection
  cannot exclude wind-bent card tips. Grass now samples the lawn's world-space
  path mask and identical edge noise at the actual fragment position; dirt
  coverage above the midpoint is discarded rather than widening the shoulder.
- **Grass edge aliasing — improved, not signed off:** derivatives now use continuous
  UVs instead of `fract` at blade-slot seams, and tip coverage goes to zero without
  a minimum-width flat cap. Curved normals use the card's width axis rather than
  multiplying the face normal. Path shoulder sampling was tightened from 24 cm
  to 3 cm, and shader shortening starts later at the dirt edge.
  Composer MSAA/alpha-to-coverage needs a separate
  controlled check; the earlier claim that alpha-to-coverage hid cards was not
  isolated from shader/visibility failures.
- **Quality/Ultra bear-water shimmer — unresolved:** an Ultra render trace confirmed
  that the reflector callback also runs under GTAO's normal override. It now
  skips override passes before advancing its colour-update throttle. Frozen-pose
  Full/Soft sequences did not reproduce the reported strong shimmer or show a
  material improvement from this guard. Do not claim the shimmer fixed; moving
  bear geometry, dispersion, transmission and temporal silhouette aliasing still
  need controlled isolation. `freeze(true)` pauses AI, not physics, so it alone
  is not a frozen-pose test.

- **The composed frame tone-maps sky/clouds that bypass ACES in the direct path.**
  Soft/Full therefore have a slightly softer, brighter sky; mood exposure and
  the display-space grade keep it within the Aero palette. A depth/mask output
  pass is the clean future fix if exact Off/Soft parity is required.
- **GTAO, the god-ray depth prepass, real shadows and optional DOF are the
  expensive pieces and are opt-in/tiered.** Full AO is half-resolution with eight
  samples and Poisson denoise; the quality governor may fall back to Soft or Off.
  High tiers use 2048/1024 sun/moon maps; quality 3 falls back to blob shadows.
  6b-3 still owns the full 40-bear effect profile and final defaults.
- **GTAO previously rendered the transparent sun/moon sprites into its normal
  buffer and produced a dark square around the sun in Full.** Fixed by hiding the
  sky group for the AO prepass only; the sky is already present in the composer
  read buffer. Re-check if GTAOPass internals change.
- **The god-ray depth prepass hides the sky group and relies on clear depth for
  open sky.** It is half-resolution, so very thin branches can still leak a few
  pixels; the shaft source is thresholded to bright sky. Current checks cover
  dawn/noon/night, Soft/Full and canopy occlusion.
- **Sun/moon shadow cameras are fixed at ±55 world units.** Far-rim props can
  fall outside the shadow frustum; recenter or fit the light target if visible
  in a wider overview.
- **The pond basin is now 1.62 m deep, but there is no swim state yet.** Buoyancy,
  paddling force and the existing recovery path keep bears on the surface. The
  deeper floor is headroom for voluntary pond play; add a proper swim/exit state
  before relying on underwater depth or expressive wakes.
- **The pond ground cutout is rectangular while the water is elliptical.** The
  recovery path lifts a bear that falls below the lawn/basin, but replacing the
  four-slab cutout with an ellipse-approximating collider set would remove the
  teleport corner case entirely.
- **Bears against animated water can still shimmer at their silhouette.** The
  high-frequency cells are now static and anti-aliased, the shoreline crest is
  thin and broken, and a wet-sand band grounds the edge. Reflection, foam,
  glints and splash rings still move. Re-check in a slow-motion 6/20/40-bear
  pass; if it persists, compare transmission resolution/dispersion and consider
  fading the remaining reflection ripple behind foreground silhouettes.
- **DOF uses a view-centre target and a far-only blur.** In the meadow it
  raycasts a small centre fan against bears, then the nearest villas, Studio
  house, trees and bushes, puts the focal plane at the back of the selected
  object, and holds focus briefly through occlusion. The Bokeh depth prepass is
  double-sided so foliage cards contribute depth instead of being treated as
  sky. Near objects stay sharp while only the background softens; the pass turns
  off when no target is found. The effect is full strength inside 5 m, fades
  linearly to zero at 10 m, and therefore stays completely sharp at the default
  and fully zoomed-out orbits. The meadow camera now zooms from 3.2 m to 88 m.
  Aperture/max-blur remain fixed look controls; revisit if a future shot system
  needs authored focus.
- **Continuous grass removed the stochastic distance LOD.** The old 82% removal
  left visible holes; every tuft now survives to the smooth draw-distance fade.
  The grass rows in `PERFORMANCE.md` predate this change, so re-profile the
  default camera/quality before treating them as the current grass budget.
  Draw distance and coverage remain the intended relief controls.
- **Close meadow zoom uses the map-height orbit target.** At the new 3.2 m
  minimum the camera can get close, but a ground-level bear portrait still needs
  the buddy-focus target or a future explicit focus-mode decision; the generic
  orbit target stays at the meadow's 1.7 m framing height.
- **DOF focus is intentionally a centre fan.** Bears are searched across a small
  centre window; villas, the Studio house, trees and bushes use the exact centre
  ray. Off-centre architecture does not acquire focus until it reaches the
  centre, which avoids focusing on incidental background scenery.
- **Effect timing is not a final frame-rate claim.** The headless effect probe is
  noisy and GPU-async; 6b-3 must profile Off/Soft/Full at 6/20/40 bears and
  record the method before committing to defaults.
- **The graphics-profile spot check is only a six-bear, headless probe.** Preset
  values are deliberately conservative starting points, not a 40-bear budget;
  revisit the bundles after the 6b-3 full profile and on mobile hardware.

## Health, hives, mating

- Health 0–100. Base regen ~0.6/min; resting/napping ~4/min; starving slowly
  drains it. No death: below ~15 the bear is woozy, seeks rest, recovers.
- Food satiation: flower ~0.20, jelly fruit ~0.35, honey ~0.55.
- Hive raid: ~50% sting chance for ~15 damage; bees swarm, the bear recoils,
  flees briefly, then seeks safe food. Below ~45 health hives are ignored;
  bold bears lower the threshold, shy bears raise it; desperation can push it
  but never below a hard floor.
- Safely fed + healthy + opposite sex + adult + not pregnant + cooldown +
  food reserve + population room ⇒ mating. Pregnancy ~25s; the mother’s hunger
  rises. Birth requires room and food; otherwise it is briefly delayed.
- Babies inherit flavor (rare mutation) and a random sex; they can follow a
  parent when young. Same-sex friendships/socializing are fully supported.
- Each bear carries its own minimum/maximum hop speed. A child blends the
  parents’ ranges and applies a small mutation, so colonies can drift toward
  calmer or quicker hoppers without a separate selection mechanic.

## Social & bonds

- Social and affection are slow needs (~0.0018/s and ~0.0012/s awake); company
  seeking starts around 0.60/0.64 and a successful greeting relieves both. A
  greeting raises the pair’s symmetric bond (roughly 0.16–0.24) and applies a
  cooldown so bears do not chain the same interaction.
- Invitations are utility decisions: the partner weighs its own social need,
  existing bond, health, energy and whether it was idling. Acceptance and
  decline both last long enough to read, with hearts or a “needs space” mark.
- Critical hunger can contest a **claimed safe-food** source within about 8 m.
  The shove resolves from scale, hunger, boldness, energy and a small random
  factor; the winner keeps or takes the claim and the loser gets a short
  cooldown and a nudge away. No damage and no hive contests yet.
- After a greeting, a bonded pair may make a door-level home visit (daylight
  only, ~4.8 s hangout). The host and guest use the validated door approach and
  an offset guest spot; they do not enter the villa yet. Interiors and
  enter/exit transitions are a later modelled-room pass.
- Bonds persist through map switches as `{ otherUid: 0..1 }`; the buddy list
  shows the live state, not the numeric bond. Emotes are a small pooled sprite
  layer in the field and never allocate per frame.

## Growth, mating & family

- Ages are in seconds: baby (scale 0.58) to teen at 180 s, to adult (scale 1.00)
  at 420 s. Starter adults begin at 600 s, the starter teen at 240 s and the
  starter baby at 30 s. Growth is paused with AI in the Studio or debug freeze.
- A stage-up rebuilds the physics radii/joints, metaball lattice, rendered surface
  and instanced eyes in one operation, scaling points around the current COM. It
  waits until the bear is grounded and not grabbed; a stage-up emits a sparkle.
- Courtship requires adult, opposite sex, neither pregnant, health ≥70, hunger
  ≤0.40, thirst ≤0.60, energy ≥0.30, no mate cooldown, at least 18 ripe safe-food
  sources and room under the map population ceiling. No friendship bond is
  required in this pass.
- Courtship lasts 3 s and raises the pair bond. Pregnancy lasts 25 s, increases
  hunger by 35%, and blocks further courtship. Birth needs the same food/room
  gates; a blocked birth retries every 3 s rather than cancelling the pregnancy.
- Newborns are scale-0.58 babies with a random sex, 8%-mutation mother flavor,
  averaged parent pace ranges (±0.04 min / ±0.06 max), parent uids and a family
  home. They follow a parent and return to the family home at night.
- Family play is a paired **playdate** task: siblings or a parent/child meet at a
  family door, play for 10 s, raise the pair bond, write a history event and
  schedule the next one for the next in-game day's play window. Playdates are
  daytime-only and work across Bear/Gummy/Glass.
- Villas have a capacity of four residents. A newborn prefers the mother’s home,
  then the least-occupied home; with 8 authored villas this covers 32 residents,
  so a full 40-bear field uses shared overflow homes.
- Interiors/a modelled nursery remain later work; family life currently uses the
  existing villa door/sleep path and the buddy status list.
- Family meals, household routines, parent teaching/skills and the lineage/history
  panel remain Phase D/E; `family.js` already owns their data helpers.

## Effects & post stack

- **Graphics profiles:** the gear-accessed Settings sheet bundles Auto,
  Performance, Balanced, Quality and Ultra presets across quality tier, render
  scale, post effects, DoF, Toon shading, meadow density and the shadow tier.
  Auto preserves the adaptive default; explicit presets lock their tier unless
  Adaptive is re-enabled. Manual changes mark the sheet Custom. Individual
  values persist.
- **Toon material mode:** a settings toggle swaps compatible
  Standard/Physical/Lambert/Phong materials to `MeshToonMaterial` with a stepped
  gradient map, preserving maps, vertex colors, alpha test, side and custom
  vertex/fragment hooks where present. Custom water, sky and particle shaders
  stay on their own programs. The toggle restores original materials live.
- **Off / Soft / Full** is a local preference in Meadow detail. Soft is the
  desktop default; Off is the low-width/coarse-pointer default. Studio always
  uses the direct renderer so its editorial white-table look stays crisp.
- **Soft:** half-resolution thresholded bloom + a gentle time-of-day grade + SMAA.
  The grade is applied after the output/color-space pass, so its saturation,
  contrast, lift and vignette operate in display space. Bloom strength/emissive
  threshold and exposure are time-of-day interpolated.
- **Full:** adds GTAO contact AO on the high quality tiers, with half-resolution
  AO targets and Poisson denoise. It is deliberately opt-in because GTAO is the
  expensive tier; the quality governor can fall back to Soft/Off.
- **Sky dome:** animated, cloud-masked glow/spokes in the sky dome, strongest at
  low sun and fading below the horizon. They are the cheap base layer in Off and
  remain behind the real shafts in Soft/Full.
- **Depth-aware god rays:** Soft/Full run a half-resolution depth prepass with
  the sky group hidden, project the sun/moon to screen UV, threshold the bright
  source and radially blur it. The prepass depth masks the result, so tree
  canopies, branches and solid props create real shaft gaps; the pass is disabled
  when the sun/moon is off-screen or behind the camera.
- **Real shadows:** high quality tiers enable `PCFSoftShadowMap` with a single
  active directional light (sun by day, moon at night), 2048/1024 maps, marked
  terrain/tree/home/bear casters and lawn/bank receivers. Lower tiers keep the
  authored blob canvas and hide the real maps.
- **Depth of field:** an optional persisted Bokeh pass after the god-ray pass,
  focus driven by orbit distance, fixed aperture/max-blur. It is available in
  Soft/Full and disabled when effects are Off.
- **Known tone-map difference:** three's direct path leaves `toneMapped:false`
  sky/cloud materials untonemapped, while `OutputPass` tone-maps the composed
  frame. The mood exposure and display-space grade keep this subtle, but a
  depth/mask output pass is the cleaner future fix.
- **Testing:** Off/Soft/Full persistence, day/night captures, Studio direct
  rendering, transmission/reflection parity, real sun/moon maps with blob
  fallback, canopy-occluded shafts, DOF toggle and no page errors are checked
  headlessly. The direct path explicitly clears the render target before Off
  rendering; without it a headless capture could keep the previous composed
  frame. Effect timing is not yet a final frame profile; 6b-3 owns the full
  40-bear measurement.

## Homes & no-clipping

- **Aero villas:** 8–12 white/aqua Frutiger-Aero homes arranged around the
  meadow: soft rounded shells, turquoise glazing bands, silver trim, large oval
  windows, aqua doors, bubble lamps, mailboxes and a warm/aqua entrance glow when
  occupied. Silhouettes vary between pavilion, dome, saucer and tower types
  without changing the authored lots. Each villa currently admits four
  residents; the buddy list shows each bear’s home and family children inherit
  a parent’s home when there is room.
- **Home use:** bears claim a home at spawn (or a baby is assigned to a parent’s
  home). At night, when low on health/energy, or while woozy, they walk to the
  door, enter (a short fade/scale through the doorway — never through a wall),
  sleep and regenerate. In the morning they come back out. A bonded friend can
  currently be invited for a **door-level** visit; entering the villa together
  is a later interior pass. Babies follow parents; a pregnant/nursing mother
  uses her home as the nursery.
- **Object placement contract:** every prop gets a footprint + clearance:
  - cottages: wall footprint + roof overhang + 0.5 m clearance,
  - tree: trunk radius + canopy radius + 0.6 m (no cottage under/inside a crown),
  - pond: pond edge + 1.2 m,
  - other cottages: sum of radii + 0.9 m,
  - cannon: reserved placement disc + 1.5 m,
  - food/decor: placed after homes and rejected if they enter any clearance,
  - field walls: house + door approach + 1.6 m margin,
  - player-placed props (Phase 9): the same footprint + clearance rules as their
    authored counterparts, plus a nav reachability re-check and an instanced-batch
    rebuild on edit.
  Each cottage also reserves a clear **door approach wedge** (1.2 m) facing open
  ground. Every door is mounted on a shallow body-coloured entry drum so tall
  glazing stays flush to curved shells; the opening is validated at **1.646 m**
  against a **1.375 m** adult bear. The initial layout is authored/seeded, not
  random, and a central `validateLayout()` rejects overlaps or insufficient door
  headroom before the map is built.
- **Clipping:** houses and tree trunks get static Box3D/nav footprints; the door
  is an explicit gap/entry point. Bears are hidden or faded while inside, so no
  mesh ever intersects a wall. The cannon’s placement check includes cottage
  footprints, and food/decor generation uses the same exclusion map.
- **Tests:** assert houses are inside the field, every pair of footprints has
  positive separation, every door approach is clear, no food/tree/cannon overlaps
  a home, and residents are unique; a debug footprint overlay makes it visible.
  After Phase 9, the same checks rerun on every placement and add a nav
  reachability assertion: every door must still reach the hub.

## World, sky, pond, presentation

- **Field:** an organic wobbled 65 m playable disc blending into a Bliss-style
  rolling hill backdrop, 220k procedural grass-card clumps (three crossed cards,
  three tapered blades per card; `?grass=blades` keeps the 185k opaque
  comparison), a close-up tiled grass-ground texture with a restrained Aero
  sheen, wandering dirt trails and a dirt hub, procedural hero
  trees with rounded leaf puffs, branched background trees, 120+ branched bushes,
  jelly flowers/fruit/honey hives, pebbles, bubbles and the Aero villa cluster.
  The grass carpet keeps every tuft out to the smooth draw-distance fade rather
  than stochastically deleting blades, so the lawn has no random bare holes.
  Meadow coverage now shortens the tufts instead of switching instances off;
  the old per-tuft coverage test was the source of the lower-profile gaps.
  Flower blooms and fallen jelly fruit are edible claims with respawn timers;
  the Studio stays sandbox-only. Foreground trees are merged/instanced; backdrop tree trunks/branches and
  canopy-centre gradient foliage stay in a handful of batches. Leaf cards are
  alpha-tested (not transparent glass), and the baked blob shadows stay.
  Authored trail masks clear grass from every dirt footprint and shoulder. The
  mask texture is uploaded unflipped so CPU scatter, grass shading and the
  painted soil all sample the same world Z; earlier mirrored sampling produced
  bare-green corridors beside the visible roads.
- **Distant horizon:** a clustered Frutiger-Aero skyline of rounded glass towers
  and flat-topped blocks plus three three-blade wind turbines. These are outside
  the playable bounds and never enter Box3D or nav.
- **Shared wind:** one world-space wind state drives grass, trees, water and the
  distant turbines, with travelling gust fronts, stable spatial phases and
  separate stiffness/flutter. Direction, strength and gust randomize per
  session, the direction slowly veers, and the Wind slider is the strength
  override. Rotor speed and yaw follow the live wind. Bear-driven grass parting
  remains. Compact Wind and Meadow-detail controls (canopy fullness, leaf size,
  grass coverage, draw distance) join the Aero panel; direction/gust can still
  be debugged without a tree settings panel.
- **Sky:** procedural gradient dome with a lightweight cartoon sky-cloud shader,
  sun/moon discs with halos, stars and a broad green/violet aurora curtain after
  dark; occasional low morning mist on some in-game days. A blue city-glow band
  and lit skyline windows support the night references. Dawn/dusk pink-gold, day
  XP-blue, night moonlit. Time slider + auto cycle + world speed. Dawn is the
  hero look.
- **Fireflies:** 110 deterministic looping swarm points with layered vertical
  bob and cross-path wobble, plus four short-range warm point lights that switch
  on only at night. Predetermined paths avoid clumping and keep the update cheap;
  no per-firefly physics or raycasts.
- **Pond:** organic **1.62 m** basin, planar reflection of sky/hills/trees at
  reduced resolution, fresnel and explicit sun/moon glints, plus an anime-lite
  layer of Voronoi cells translated by a smoothed wind-flow offset, with
  derivative-aware anti-aliasing, a narrow sandy shallows blend at the inner
  shoreline, and a near-shore contrast fade, plus irregular
  windward foam tongues on the actual wobbled outline and a separate wet-bank
  wash ribbon that lets broken foam creep onto the sand. The same angular field
  feeds a short-lived wetness mask: newly washed sand darkens, then dries back
  over 4–8 seconds as the foam retreats. A loose grass fringe outside the bank
  softens the lawn transition. Downwind edge wavelets and a procedural dark
  wet-sand band follow the water outline. Surface
  splash rings are masked by
  the same wobbled water outline, so they disappear at the shoreline instead of
  drawing over the sand; airborne droplets still travel naturally. Splashes
  emit staggered, wind-stretched ripples, a light paddling wake and droplets;
  buoyancy and recovery handle flung bears. Sixteen validated shore approaches
  let thirsty bears drink, with a snout dip and ripple.
- **Arena:** a segmented oriented Box3D ring follows the wobbled field disc;
  the Studio keeps its rectangular table walls. Ground underneath and the
  launch-speed cap keep shots contained.
- **Cannon:** drag the base or use Move cannon; green/red footprint validation
  (bounds, bears, pond/trees/cottages later); remains visual-only; shadow/arc follow.
- **UI:** Aero glass, aqua gradients, glossy buttons, bubbles; MSN-style buddy
  list with name, ♀/♂, baby/teen stage, live social/visit/conflict/courtship/
  follow status, hunger/health, pregnancy, online count and clock; Studio keeps
  the editorial skin. A persistent Hide UI control (and `U`)
  clears every overlay on desktop and phone while leaving a restore button.
  The field-only AI debug panel (and `G`) exposes needs, forced states and a
  selected-bear planned-route overlay; Studio hides it. Meadow detail also has
  the Off/Soft/Full **Effects** selector. Keep contrast, focus and keyboard use.

## Performance & testing

- Instancing for grass/flowers/props; procedural sky clouds; vegetation shadows
  baked/static; bear contact shadows stay blob-based. Reflection at low
  resolution/alternate frames with quality tiers. AI <0.5 ms/frame; food updates
  on timers; growth body rebuilds only at thresholds.

### Phase 2 profile (circular pass, not final sign-off)

Headless Chrome on Apple silicon, 1440×900 at DPR 2, six starter bears,
default gameplay camera. These are forced-sync `readPixels` measurements, not
vsync rAF intervals (the headless compositor caps rAF around 30–20 Hz):

| state | frame | draw calls | triangles |
|---|---:|---:|---:|
| baseline | 32.1 ms | 565 | 3.67 M |
| grass hidden | 25.3 ms | 554 | 2.10 M |
| trees hidden | 30.6 ms | 557 | 3.40 M |
| pond/reflection hidden | 29.8 ms | 528 | 5.25 M* |
| villas hidden | 30.3 ms | 118 | 3.59 M |
| static shadow hidden | 32.9 ms | 564 | 3.67 M |
| grass coverage 0.50 | 30.3 ms | 565 | 3.67 M |
| grass draw distance 28 m | 29.5 ms | 559 | 2.84 M |
| DPR 1.25 (quality 3) | 23.6 ms | 565 | 3.64 M |
| bears removed | 29.2 ms | 559 | 3.62 M |

\*Reflection render-target accounting makes the pond-hidden triangle counter
non-monotonic; the frame-time result is the useful one.

The previous post-polish numbers and the original supplied Phase 2 numbers
(37.1 ms baseline, 321 calls, 2.12 M triangles) are retained in
[PERFORMANCE.md](PERFORMANCE.md). The later ground-detail/water spot check was
noisy (39.7–44.3 ms; quality 3 24.8–26.6 ms), so the 32.1 ms table above remains
the last stable reference. Grass fill/geometry is still the dominant GPU item.
The detailed villas add ~447 calls but save only ~2 ms when hidden. DPR and
grass density are the main levers. The headless run is not a 60 fps claim.

- Keep the current 16-check physics self-test green. Add deterministic checks
  for: food claim/respawn; invite acceptance; same-food conflict; health/hive
  risk threshold; regen/woozy; sex/pregnancy/birth; population/food caps; growth
  stages; map state isolation; cannon move validation; wall containment; pond
  buoyancy; time-of-day/sun/moon/stars; pond reflection; mobile layouts.
- Add layout checks: zero overlaps among houses, trees, pond, food, cannon and
  walls; door approaches clear; every bear has a home/bed; night return works.
- Visual beats: Studio + Meadow, dawn/day/dusk/night, pond glints, cottage
  cluster/occupancy, baby/teen/adult lineup, social/conflict/mating, buddy list,
  cannon aim/move, mobile.

## WebGPU investigation (Phase 7 — dropped, Oct 2026)

**Dropped: no work is planned and WebGL2 remains the renderer.** The port was
investigated to see whether the GPU could carry dense camera-local grass, wind,
water, instancing overhead and render passes. It could not deliver the 60 fps
goal, and renderer-level changes do not address the dominant costs. The measured
findings below are retained as the record; the former principles, migration
slices, acceptance criteria and risk plan are withdrawn.

### Findings (Oct 2026) — measured before any port

- **Renderer swap, isolated benchmarks** (headless Brave, 1440×900 at DPR 1.5,
  three runs per API in alternating order): WebGPU carries a fixed **+0.38 ms per
  frame**; submission at 570 and 2,000 draws is **slower**, not faster; render
  bundles save ≈0.05 ms; a representative grass material renders at parity
  (−4%); the fragment microbenchmark was compiler-dominated and discarded. TSL
  limits found: unrolled node graphs beyond ≈64 terms fail WGSL compilation
  (`maximum parser recursive depth`); vertex-stage storage buffers need explicit
  types, `.toReadOnly()` and `.toAtomic()` counters.
- **Actual-grass GPU selection** (real placement, matrices, colours, LOD and the
  production GLSL reused through `onBeforeCompile`; WebGPU compute select →
  readback → WebGL replay): conservative sphere-frustum selection matched the CPU
  reference exactly (0 missing, 0 extra) and rendered **0 changed pixels of
  2,916,000** at default, wide and off-field views. The grass-only pass fell from
  **12.15 to 10.77 ms** (−1.4 ms) at the default view; net of ≈0.13 ms compute
  that is **≈1.3 ms (≈10%)** — real, but it removes off-screen instances only and
  cannot touch the fill term.
- **Full-frame breakdown** (40 bears, Balanced; details in `PERFORMANCE.md`):
  grass off −14.6 ms, population 40→6 −8.2 ms, render scale 0.85→0.6 −6.0 ms,
  nature low −3.2 ms, effects Off −0.5 ms, shadows ≈0. Lowest shipped settings
  reach **18.0 ms at 6 bears** and **25.5 ms at 40**.
- **Conclusion:** the 60 fps target at 40 bears/Balanced is **not** a renderer
  problem. Grass fill (~14.6 ms) and per-bear surface cost dominate. The WebGPU
  path is **dropped**; the 16.7 ms goal is pursued through grass-fill and
  per-bear work on the WebGL path.

## Persistence (Phase 8a)

**A save is life state, not physics state.** For every bear it stores flavor, sex,
age/scale, health, hunger and needs, personality, home/ownership, pregnancy and
timers; per map the clock/speed/auto-cycle, cannon position and camera pose; the
food registry with ripeness/respawn timers; and, once Phase 9 lands, the placed
village layout. Physics bodies, metaball grids and meshes are **never**
serialized — bears respawn from their life fields on load. That is why this
phase starts after the Phase 5 schema freeze rather than during Phase 3.

**Storage.** Named slots live in IndexedDB (`gummy.saves`, one record per slot)
and can be exported to a `.json` file and imported back. Nothing leaves the
machine, so the "no cloud saves/accounts" non-goal is unchanged. The existing
`localStorage` preference keys (map, launcher, time) stay as the quick-resume
path.

**Slots and New Game.** 5 named slots plus one autosave slot; slots can be
renamed, overwritten and deleted. New Game regenerates the authored starter
colony (2 adult ♀, 2 adult ♂, one teen, one baby), the authored home lots, the
default clock and the default camera, and never reuses leftover state.

**Format.** Every save carries `version` and the map ids. Loading an older save
runs a migration step or refuses with a visible message rather than half-loading.
Saving captures the active map exactly and re-enters it on load, Studio included.

**Acceptance:**

- A save reloads both maps exactly: bear count, flavors, sexes, ages/scales,
  health, needs, homes, food ripeness, clock, cannon, camera and the selected
  bear's active directive/queue.
- New Game restores the starter colony on both maps.
- 5 slots + autosave coexist; rename/delete works; an export → import round trip
  behaves identically.
- A corrupt or incompatible save surfaces an error and leaves the running game
  untouched.
- `window.__gummy.save()/load()/slots()/newGame()` drive the checks headlessly.

**Risks:** any life-schema change after Phase 5 invalidates old saves (the
`version` field and a migration hook are the mitigation); IndexedDB is
asynchronous, so load needs a loading state and must not race boot.

## Player control (8b directives, 8c possession)

Two stages, both reusing systems that already exist.

**8b — directives (shipped).** Select a bear, then issue a command from a short
panel: go to a point, eat the nearest ripe food, go home to rest, socialize with
another bear. **Follow remains deferred** until a dedicated target model lands.
A directive does not replace the AI — it enters the existing utility
selector as a high-priority, time-limited proposal, and the bear may refuse.
Refusal is decided by needs, personality (bold/shy), health, hysteresis and
cooldowns, and it is visible: an accept nod or a "no" emote plus a status
line. The queue is at most 3 deep and expires; the selector keeps authority, so
a starving bear still abandons a request to eat.

**8c — possession.** Direct control of the selected bear: a third-person follow
camera, WASD/arrow or on-screen stick locomotion feeding the existing waddle/lean
cycle, grab/throw still on the pointer, and one key/button to exit. The AI is
suspended for that bear only — the rest of the meadow keeps simulating — needs
still tick, and exiting returns the bear to the selector in place. Reuse the
existing pointer picking and grab paths; do not add a second input stack.

**Acceptance:** a directive visibly changes behaviour and a refusal is legible
and explainable from the bear's state; directives survive save/load; possessed
movement is continuous with no jitter/NaN and cannot leave the arena; the camera
never clips ground or field walls; grabbing other bears still works while one is
possessed; needs, health and the no-death rule are unchanged in both modes.

## Additional maps (future scope — design later)

Add more playable maps beyond the Meadow and Studio. Themes, layouts, activities
and travel/unlock rules will be designed later; no specific map designs or
implementation order are committed yet. Reuse the existing map registry and
per-map state architecture, with collision/nav validation, save/load and
map-switch isolation checks for each eventual map.

## Relationship and shared-activity expansion (planned proposal)

Extend the existing pair bonds, social invitations and persistence rather than
replacing them. This is future scope, not an implementation or a change to the
current phase priorities. Recommended order:

1. **Persistent relationships:** strangers, acquaintances, friends, close friends
   and rivals/enemies, with remembered positive and negative encounters. A
   spouse/partner status is separate from friendship, not another mutually
   exclusive bond tier. Audit the existing bonds and save schema first; define
   progression, reciprocity, partnership rules and any migration before coding.
   A relationship panel should show who knows whom and why their bond changed.
2. **Shared pair activities:** play, chat, cuddle, comfort and reconcile, with
   voluntary invitations and readable acceptance/refusal. Exact activities and
   their effects on needs and relationships remain design decisions.
3. **Group interactions (3+ bears):** tag, dancing, group play and gatherings.
   Define joining/leaving, participant limits, interruptions and cleanup; reserve
   spaced activity positions so participants do not bunch into a stuck blob.

**Acceptance:** relationship state round-trips through save/load and map changes;
accepted and declined invitations behave correctly; a group of at least three
bears can start, participate, leave and recover from a grab or despawn without
stale partners, trapped bears or overlapping activity positions. Provide debug
hooks and timed checks alongside the eventual implementation.

**Current model audit (2026-10-21, read-only):**

| Question | Evidence | Result |
| --- | --- | --- |
| Are bonds symmetric? | `setBond` writes both keys; `addBond` moves the pair average; restores trust saved keys; social acceptance reads the initiator bond against partner thresholds. | Normal writes are symmetric. Old/asymmetric records are averaged only when read; the save keeps both keys. |
| Are negative encounters remembered? | Conflict applies one symmetric `-0.08`; no history event or rivalry field. | No durable record; once the bond reaches 0 the encounter is indistinguishable from never meeting. |
| Is partnership persistent? | `ai.partner` is runtime pair state; `mated` history, `fatherUid` and gestation persist. | No spouse/partner record. Partnership is an interaction, not a saved relationship. |
| Can a change be explained accurately? | History kinds render; completed social/visit/decline/conflict/gift outcomes are written, and social/visit/conflict carry before/after bond deltas. The `bond` kind itself remains unused. | Recorded outcomes show their real bond movement; unrecorded history is still not reconstructed. |
| What survives departure or a map change? | `pruneActorRefs` drops bonds, playdates and history that reference invalid UIDs, keeps `parentUids`, and drops an invalid guardian. Inactive maps keep actor snapshots; the family/lineage UI indexes only active-map actors. | Bonds to departed actors disappear; ancestry remains. Cross-map parents/siblings are not shown by the current family panel. |
| Is household a relationship record? | `home` is a persisted string; household membership is recomputed from active actors. | No household record or history beyond optional `home`/`moved` events. |

**Delivered:** the read-only **relationship view** is implemented with family/care
sections, directional bonds, missing/cross-map labels and pair-specific recent
interactions. Completed social, visit, decline and conflict outcomes are now
recorded using existing history entries; no new simulation state, thresholds or
save fields were added. The old family/lineage API still indexes active-map actors
only, but the new view resolves the current game’s inactive-map snapshots.

**Known follow-ups from this audit:** the older family/lineage panel still indexes
only active-map actors, so a parent or sibling on the inactive map can disappear
from that panel and change its computed generation (the new relationship view does
not have this gap). `bond` remains an unused history kind, although interaction
records now carry explicit deltas. Duplicate-UID saves are rejected at load with no
automatic renumbering; any existing duplicate save needs a recovery decision.
Guardian capacity and feature-disable behavior are now implemented and tested.

**Bond-delta history (Oct 2026):** completed social, visit and conflict events can
carry `bondBefore`/`bondAfter` on the existing history entry. `normalizeHistory`
preserves those fields and `actorVersion: 6` is written only when a delta exists
(version 7 when `lastGiftDay` is also present, or version 8 alongside a rivalry,
partnership or carried portion); older saves remain valid. Deltas are display-only: mood does not weight the
interaction kinds, and interaction records may recycle only other interaction
slots; they never displace non-interaction history. If the buffer is full of
behavior history, the display event is skipped, so mood and same-day teaching are
unchanged with logging on or off. The
relationship and Recent events panels render the delta as `42% → 48%`. Validation
rejects deltas on v5 and v6 without a delta. Older builds reject v6 rather than
silently stripping the explanation.

## Interaction expansion backlog (remaining)

The modular interaction foundation is complete: physical gifting v1, directional
friendship labels, persistent rivalry/reconciliation, persistent partnership with
explicit separation, chat/cuddle pair activities, spaced group activities, the
read-only relationship view and versioned history/deltas. These are optional
modules/features, off by default.

Remaining increments, each requiring its own design decision, save review,
focused browser coverage and an invalidated-evidence check:

1. **Richer group activities.** Tag, dancing and distinct gatherings; decide
   late-joining, spectator and activity-variant semantics. Reuse the existing
   opportunity/state engine and spaced-slot rule.
2. **Gifting v2.** Multiple servings, recipient preferences, refusal reasons and a
   general inventory beyond one carried portion. A carried portion must still have
   one durable identity and one consumption path.
3. **Comfort interactions.** Extend reconciliation with mourning comfort and
   distinct cuddle/chat outcomes without redefining bond semantics implicitly.
4. **Friendship-tier effects.** Only after deciding whether labels should affect
   acceptance, teaching or gifting; current labels are display-only.

Group activities and general inventory are the largest remaining steps. Do not add
a parallel scheduler, infer a rival from a low bond, or make friendship labels
behavioral without an explicit decision.

## Village & placement editor (Phase 9)

The player shapes the meadow from the curated library — the authored villa
shells, trees, food and decor — rather than authoring new geometry. Each
sub-phase ships on its own:

**Play-area editor — exploratory, needs design:** extend the Phase 9a prototype
to place/move/rotate approved play equipment and decor, with collision-footprint
previews, clear rejection reasons, undo, layout save/load and reset to the
authored default. Decide the initial equipment library and its activity slots
before implementation; connect equipment to shared activities only after those
activities are verified. Terrain sculpting and custom asset imports are deferred.

| Sub-phase | Work | Done when |
|---|---|---|
| **9a — Placement editor** | Inspect mode with a ghost preview, rotate, valid/invalid tint, place/remove/undo; library of existing villa shells, tree types, food and decor; layout state in `world.js` and the save file | Every placement passes `validateLayout()` (bounds, pond edge + 1.2 m, tree canopy + 0.6 m, other homes + 0.9 m, cannon disc + 1.5 m, wall margin) and reserves a clear door approach; invalid previews say why; undo restores the previous layout |
| **9b — Village homes, naming, hub** | Player-placed homes join the home pool and can be claimed; village/bear naming; a shared hub — plaza, connecting paths, well/fountain — bears gather at | A placed home is claimed, slept in and shows the occupancy glow; paths connect the hub to homes and the hub is reachable from every door; naming persists through save/load |
| **9c — Light jobs and shops** | Roles for adult bears (shopkeeper at the hub, gardener, baker) with a small stock loop and daytime stalls | A bear holds a role, opens its stall in daylight, and the loop reads as village life without breaking needs, mating or performance |

**Collision and nav are the contract, not a follow-up.** Every placement goes
through the same exclusion map and footprint + clearance rules in
`## Homes & no-clipping`, and must then:

- rebuild/extend the nav mesh for the changed footprint on edit only — never per
  frame,
- reject a placement or removal that disconnects any home's door approach from
  the hub or traps a bear in a pocket (a reachability check, not just overlap),
- keep the instanced/batched prop structure — placed props join the existing
  batches and geometry is rebuilt on edit,
- reserve nothing that blocks the cannon placement disc or the pond shoreline.

**Acceptance:** zero overlaps and clear doors after any edit sequence; no
unreachable home or trapped bear in a randomized placement stress test; a village
layout round-trips through save/load; New Game returns the authored starter
layout; frame time after a fully built village stays inside the 6b-3 budget
(measure, don't assume).

**Still deferred:** freeform/room-by-room building (walls, floors, roofs) and
modelled interiors; the editor places authored units only.

## Jobs & shops (Phase 9c, scope note)

This is the largest Phase 9 item and is deliberately last, because it adds needs
and AI states on top of the Phase 3–5 simulation. Scope assumed: roles for adult
bears, a stall at the village hub, a small stock/consumption loop and a daytime
schedule. **Open decision — not settled here:** whether shops use a currency
(coin/barter loop with a HUD counter) or stay an abstract stock swap between
bears and stalls. Decide when 9c is scheduled; 9a and 9b do not depend on it.

## Tuning defaults (subject to playtesting)

- Day 10 min; growth 7 min (3 baby + 4 teen; adult at 420 s); world speed
  1×/2×/4× currently affects the sky, not life timers.
- Field ceiling 40; hard max 128; Studio ceiling 128.
- Starting meadow colony: 2 adult ♀, 2 adult ♂, 1 teen, 1 baby.
- Hive threshold 45 health (bold/shy shifts it, desperation lowers it to a
  25-point floor); sting damage 15; honey 0.55 satiation.
- Food respawns: flowers 25–45 s, fruit 45–90 s, hives 90–150 s.
- Per-bear hop pace: min 0.70–0.95, max 1.45–1.80, sampled at spawn and inherited
  by children (averaged with ±0.04/±0.06 mutation). Health base regen 0.6/min,
  rest 4/min; energy drains 0.0025/s, restores 0.012/s; woozy below 15 health.
- Hunger +0.0045/s, thirst +0.0065/s; seek above 0.70/0.76. Flower satiation
  0.20, fallen fruit 0.35; one drink restores 0.55. Hop travel is about 1 m/s
  with a crouch, low airborne phase and landing settle.
- Mating: adult opposite-sex pair, hunger ≤0.40, thirst ≤0.60, health ≥70,
  energy ≥0.30, 18 ripe safe-food sources, room under the ceiling and no mate
  cooldown. Courtship 3 s, pregnancy 25 s, mate cooldown 90 s. Newborn flavor is
  the mother’s with an 8% mutation; sex is random.
- Pond buoyancy/floating is non-lethal; no current; paddles to nearest shore.
- 8 Aero villas × 4 residents (32 authored capacity; overflow shares the least
  occupied villa); door approach 1.2 m; house-to-house clearance 0.9 m.
- Per-bear sleep window: bedtime 20:00–22:30, wake 05:00–07:00; schedules are
  fixed per bear, inherited by family members and persisted with snapshots.
  Low-health returns can happen at any time.
- Effects: **Soft** default on desktop, **Off** default on coarse-pointer/low
  width; **Full** opt-in. Bloom is half-resolution and thresholded; GTAO is
  half-resolution on the high tiers; SMAA handles edges.
- Saves: 5 named slots + 1 autosave; autosave every 2 in-game minutes and on
  nightfall.
- Village: up to 8 player-placed homes on top of the authored 8; placed props
  count against the existing field prop/instance budget.
- Directives: at most 3 queued commands, each expiring after ~45 s.

## Studio modelling track (parallel, required)

The Studio map is still the tabletop sandbox. This track can run alongside the
simulation phases, but it is not optional dressing: the interior is a required
part of the Studio map. A broader Aero/MSN prop set (signage, extra furniture
and decor beyond this interior) is **out of scope for this release** and remains
future Blender work.

### Content requirements

- **An interactable bar** the bears can use, with a counter, stools, glassware
  and under-counter glow. It must connect to the real bear interaction system,
  not just sit there as geometry.
- **A living room with a huge Frutiger-Aero TV** as the focal wall: curved screen
  casing, cyan glow, aquatic channel visuals and a low lounge setting.
- Interior language from references 19–24: white curved architecture, aqua
  risers, ribbed soffits, jellyfish/aquarium motifs, bubble lighting and glossy
  blue floors.
- A navigable floor plan at bear scale, with walkable paths around the bar and
  lounge, door/portal clearance, and collision/nav proxies for every solid piece.

### Authoring pipeline

1. Model a modular kit in Blender: shell, bar, stools, banquette/sofa, TV wall,
   shelves, lighting coves, floor inlays, planters and portal threshold.
2. Keep semantic names and transforms: `bar_counter`, `bar_stool_*`, `tv_screen`,
   `sofa_*`, `nav_*`, `collision_*`, `light_*`. Anchor points must be exported as
   empties or separately named nodes, not inferred from mesh bounds at runtime.
3. Export a single room-scale GLB plus small collision proxies. Bake no lighting;
   use the existing Aero materials/lighting where possible, custom shader only
   for the TV/water surfaces.
4. Validate scale against the 1.375 m adult bear, doorframes, camera min/max
   distance, mobile viewport and draw-call/triangle budgets.
5. Commit the exported asset, source blend file only if the license/size policy
   allows it, a provenance note and screenshots. Do not commit MCP servers,
   Blender binaries or downloaded third-party assets without an explicit license.

### Blender MCP — evaluation, not runtime dependency

Blender MCP is being considered for the **authoring** step only. It must never be
a runtime dependency of the browser game.

- Candidates reviewed: `3d-mcp/blender-mcp` (local scene context; native Python
  optional), `MakerSully/blender-mcp` (read-only inspection), and the community
  `ahujasid/blender-mcp` family (broader write/tool surface). Most are explicitly
  experimental/alpha and some allow arbitrary Python execution inside Blender.
- Start with a **read-only inspection** pass in a disposable Blender scene:
  camera framing, object naming, material inventory, scale checks and export
  validation. Only enable write/native-script tools for a scoped prototype after
  reviewing the exact version and license.
- Pin one MCP implementation and Blender version for the experiment; record the
  commit/version and license. Keep the bridge local-only. Never expose it to the
  LAN or the game runtime.
- **Pinned for the experiment (2026-10-18):** `ahujasid/mcp-for-blender` (the
  `blender-mcp` project after its rename), PyPI package `mcp-for-blender`
  **v2.1.9**, MIT license, author Siddharth Ahuja. Blender **5.2.2 LTS**, addon
  protocol 13 (addon version 1.8). Installed as an authoring-time helper only,
  via Homebrew `uv` 0.13.1 and `uvx mcp-for-blender`; the addon is a local file
  in Blender's addons folder. The bridge stays local-only
  (`BLENDER_HOST=localhost`, port 9876) behind the `mcp.blender` entry in the
  OpenCode config. Nothing here is a repo or runtime dependency.
- Use MCP to accelerate geometry/material iteration, then perform the final
  export and performance check manually. The deterministic output is the GLB,
  not the chat transcript.
- **Authoring skill tools (2026-10-18):** `gummy-3d-authoring` now includes
  project-local, read-only evaluated mesh QA, world-space UV-density reporting
  and a standard-library GLB inventory, plus adapted hard-surface, UV, PBR
  material, texture-baking and Geometry Nodes guidance. Selective source:
  MIT-licensed `EL4CTEO/blender-skills`, commit
  `71d031dab8bc6729504d11a78cbe91945401045f`; attribution and isolated Blender
  5.2.2 LTS fixture commands live alongside the skill. No global installation,
  compressed-export defaults, runtime dependencies or game integration.
- **Independent reusable authoring copy (2026-10-19):** the sibling `../BlenderAuthoring/`
  package is a separate, harness-neutral copy for other projects, not a dependency of Gummy.
  The full project-specific `gummy-3d-authoring` skill and `AGENTS.md` section 15 have been
  restored from `cfd26ee` and then corrected in place; their local references and helpers
  remain authoritative here.
  No external package is required alongside a Gummy clone. The universal package is unchanged.
- **Known follow-ups — authoring-rule corrections (2026-10-19, fixed):** the restored
  skill's cube-size/BMesh lifetime claims, blanket UV requirement and mixed-licence ban
  could cause incorrect geometry or unnecessary edits. Corrected them in place, added
  clean-path/importer export checks, and required faithful multi-channel baking or approved
  simplifications. Target picking now handles occluders/unknown cameras; temporary isolation
  and partial cuts have explicit state/boundary checks rather than blanket prohibitions.
  Added shared-data, partial-script recovery, cleanup-manifest and independent-copy safeguards,
  while retaining Gummy's full adapted instructions and resolving progress-update wording.
- **Known follow-ups — upstream skill adaptation:** deferred/not imported:
  upstream `blender-asset-qa`'s `game` profile can pass open boundaries and only
  warn on non-manifold edges; it must not replace our closed-solid health gate.
  Upstream `review_shots.py` uses tilted perspective front/side cameras and
  does not restore all changed state (including object colors and output image
  settings), so it is not suitable unchanged for live-scene orthographic audits.
  In 5.2.2, `scene.render.bake.type` exposes only normal/displacement, while
  `bpy.ops.object.bake(type=...)` carries the wider AO/combined/pass enum; the
  audited upstream `bake_maps.py` already uses the operator form. Curvature is
  not a built-in pass and can be derived from the baked normal; ID needs a
  material/emission override. No upstream material, bake or Geometry Nodes
  scripts were imported; these references are guidance only and still need a
  project-local helper before an agent can produce assets unattended. Local
  helpers do not certify attachment fit, Face Orientation, UV overlap, bake
  quality or full glTF validity; those still require the parent skill's explicit
  checks. The upstream lighting/look-dev skill remains deferred; calibrated
  reference captures still govern geometry review.

### Acceptance

- Bears can approach and use the bar; the action is reachable and does not clip
  through the counter.
- The TV lounge reads from the default Studio camera and on a phone.
- All room solids collide and navigate correctly; door/portal approach remains
  clear.
- The room loads with no MCP service running and no new web dependency.
- Reference/provenance and performance notes are recorded with the asset.

These are must-have Studio requirements. The references are saved locally in
`inspiration/` and are not shipped assets.

## Non-goals / deferred

- No death, predation or combat beyond food shoving.
- No bear migration between maps (each world is independent).
- No multiplayer, accounts or cloud saves; saves are local-only (IndexedDB slots
  plus JSON export/import).
- No full skeletal animation; locomotion remains procedural soft-body movement.
- Swimming is a recovered float, not free swimming.
- No freeform building kit: the Phase 9 editor places authored units (villa
  shells, trees, food, decor) on validated footprints, not player-drawn
  walls/floors/roofs. Interiors stay implied (door entry + window glow), not
  modeled walk-in rooms.
