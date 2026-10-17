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
src/renderer.js         WebGL/WebGPU backend selection, capabilities, fallback
src/studio-room.js      authored Studio lounge/bar/TV interaction surface
assets/studio/          exported glTF/GLB room kit, collision proxies, credits
src/save.js             IndexedDB slots, save format/migration, New Game
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
| **6b** | Aero/MSN polish, dawn/cloud/water tuning, day/night presets, performance/mobile, **home occupancy/window glow polish**, full test suite | Dawn/day/dusk/night look polished; field and 40 bears hit the performance target; mobile layouts; no-clipping/home tests pass; complete checklist |
| **7** (opt-in, after 6b) | **WebGPU renderer path:** backend abstraction, TSL material ports, GPU-driven grass/water, render bundles and timestamp queries; WebGL stays as the automatic fallback | WebGPU boots through the same self-test and visual beats with material parity; the 40-bear field meets or beats the Phase 6b frame budget at equal quality; fallback works when WebGPU or a suitable adapter is unavailable |
| **8a** (after Phase 5) | **Persistence:** full-state save/load (bears, homes, food, clock, cannon, camera), named slots in IndexedDB plus JSON export/import, New Game, autosave, versioned save format | A save reloads both maps exactly; New Game restores the authored starter colony; 5 slots + autosave coexist, rename and delete; a corrupt/incompatible save fails visibly without killing the current game |
| **8b** (after 8a) | **Bear directives (Sims-lite):** select a bear and issue a command the utility selector treats as a high-priority, time-limited proposal the bear may refuse, with a legible accept/refuse emote and a short queue | Commands visibly change behaviour; refusal is readable and explainable from needs/personality/health; needs and no-death rules hold; directives persist through save/load; no NaN/stuck/perf regressions |
| **8c** (after 8b) | **Possession / third-person:** direct control of one bear with a follow camera and input-driven waddle; AI suspended for that bear only; grab/throw and a clean exit | Possessed movement is continuous (no jitter/NaN) and stays in the arena; exit returns the bear to AI in place with needs intact; the camera never clips ground or field walls; grabbing other bears still works |
| **9** (after 8a) | **Village & placement editor:** player-authored meadow from the curated library on validated footprints — (9a) editor, (9b) village homes + naming + shared hub, (9c) light jobs and shops; every edit rebuilds nav and re-checks reachability | Zero overlaps and clear door approaches after any edit; no unreachable home or trapped bear in a placement stress test; a layout survives save/load; New Game returns the authored starter layout; a full village stays inside the Phase 6b frame budget |
| **S — Studio modelling** (parallel, required; can run alongside 3–6) | Authored Studio interior/architecture: modular bar, lounge and giant Frutiger-Aero TV; Blender-to-glTF asset pipeline; evaluate Blender MCP as an authoring-time helper | Bar is interactable and navigable; TV lounge is visually complete; modular assets are exported to the repo with license/provenance, tested at bear scale, and integrated without a runtime MCP/Blender dependency |

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
  Studio portal house, 10 merged hero trees, 88k chunked/shader-LOD grass tufts,
  dirt trails, a detailed rolling backdrop with branched trees and 120+ bushes,
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
- **Next:** add voluntary pond play/swimming, then the Phase 6b effects/profile
  pass.
- **Studio modelling track queued (parallel, required):** author the Studio
  interior with an interactable bar and a living room anchored by a huge
  Frutiger-Aero TV (references 19–24). Evaluate Blender MCP as an authoring-time
  assistant only; see the dedicated track below.
- **Queued after the simulation (Phases 8–9):** 8a persistence (IndexedDB slots +
  JSON export/import, New Game, autosave) starts once the Phase 5 life schema is
  frozen, before the 6a/6b passes; 8b bear directives and 8c possession follow;
  then 9a placement, 9b village homes/hub/naming and 9c jobs and shops. Phase 6b's
  "full test suite" therefore also covers save/load, directives, possession and
  placement/nav reachability.
- **Later, opt-in:** Phase 6a is the effects pass (before Phase 6b optimization);
  Phase 7 adds the WebGPU renderer path, with WebGL2 as the fallback.

Each phase ends playable, with screenshots and headless checks, so the direction
can be adjusted without losing the working app.

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
  This is the Phase 3b approximation; revisit with the Phase 6b occupancy/window
  polish.

**Known follow-ups after Phase 4** — recorded for later, not current blockers:

- **Home visits stop at the door.** The host/guest pair uses the validated door
  approach, but entering the villa together and returning outside are deferred
  until interiors are authored. The `visitHome` / `visitRole` fields are the seam
  for that transition.
- **Bonds are not shown in the roster yet.** The buddy list reflects the live
  social state, but the numeric pair bond is only in the AI debug readout and
  `__gummy.traits()`. Decide whether a friendship/heart indicator belongs in the
  Phase 6b MSN polish.
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
  (only the expected pond basin dips). Re-check in the Phase 6b 40-bear stress and
  inspect solver seams/CCD if it returns.
- **The life schema is now the Phase 8a freeze point.** Any further change to
  `age`, stages, pregnancy, parent uids or inheritance should add a save migration.

**Known follow-ups after the effects pass** — recorded for later:

- **The composed frame tone-maps sky/clouds that bypass ACES in the direct path.**
  Soft/Full therefore have a slightly softer, brighter sky; mood exposure and
  the display-space grade keep it within the Aero palette. A depth/mask output
  pass is the clean future fix if exact Off/Soft parity is required.
- **GTAO, the god-ray depth prepass, real shadows and optional DOF are the
  expensive pieces and are opt-in/tiered.** Full AO is half-resolution with eight
  samples and Poisson denoise; the quality governor may fall back to Soft or Off.
  High tiers use 2048/1024 sun/moon maps; quality 3 falls back to blob shadows.
  Phase 6b still owns the full 40-bear effect profile and final defaults.
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
- **The pond ground cutout is rectangular while the water is elliptical.** The
  recovery path lifts a bear that falls below the lawn/basin, but replacing the
  four-slab cutout with an ellipse-approximating collider set would remove the
  teleport corner case entirely.
- **DOF is a fixed look, not an autofocus system.** Focus follows the orbit
  distance; aperture/max-blur are constants. Expose them only if a future shot
  system needs authored focus.
- **Effect timing is not a final frame-rate claim.** The headless effect probe is
  noisy and GPU-async; Phase 6b must profile Off/Soft/Full at 6/20/40 bears and
  record the method before committing to defaults.

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
- Villas have a capacity of four residents. A newborn prefers the mother’s home,
  then the least-occupied home; with 8 authored villas this covers 32 residents,
  so a full 40-bear field uses shared overflow homes.
- Interiors/a modelled nursery remain later work; family life currently uses the
  existing villa door/sleep path and the buddy status list.

## Effects & post stack

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
  frame. Effect timing is not yet a final frame profile; Phase 6b owns the full
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
  rolling hill backdrop, 88k chunked grass tufts (7 tall/overlap blades + 6 low
  cover fans per tuft), a close-up tiled grass-ground texture with a restrained
  Aero sheen, wandering dirt trails and a dirt hub, procedural hero trees with
  rounded leaf puffs, branched background trees, 120+ branched bushes, jelly
  flowers/fruit/honey hives, pebbles, bubbles and the Aero villa cluster.
  Flower blooms and fallen jelly fruit are edible claims with respawn timers;
  the Studio stays sandbox-only. Foreground trees are merged/instanced; backdrop tree trunks/branches and
  canopy-centre gradient foliage stay in a handful of batches. Leaf cards are
  alpha-tested (not transparent glass), and the baked blob shadows stay.
  Authored trail masks clear grass from every dirt footprint and shoulder.
- **Distant horizon:** a clustered Frutiger-Aero skyline of rounded glass towers
  and flat-topped blocks plus three three-blade wind turbines. These are outside
  the playable bounds and never enter Box3D or nav.
- **Shared wind:** one world-space wind state drives grass and trees, with
  travelling gust fronts, stable spatial phases and separate stiffness/flutter.
  Bear-driven grass parting remains. Compact Wind and Meadow-detail controls
  (canopy fullness, leaf size, grass coverage, draw distance) join the Aero
  panel; direction/gust can be debugged without a tree settings panel.
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
- **Pond:** organic basin, planar reflection of sky/hills/trees at reduced
  resolution, fresnel, explicit sun/moon glints, plus an anime-lite layer of
  dense world-space Voronoi cells, hard-edged shoreline foam and splash-driven
  ripple rings. Sixteen validated shore approaches let thirsty bears drink,
  with a snout dip and ripple; splash/buoyancy still handles flung bears.
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

## WebGPU upgrade (Phase 7, opt-in)

WebGPU is a second renderer, not a second game. The goal is to keep the same
meadow, bears and UI while using the GPU to carry the parts that are hardest on
WebGL: dense camera-local grass, wind, water, instancing overhead and render
passes. WebGL2 remains the automatic fallback and a fully supported path.

### Principles

- **Ship behind a capability check.** WebGPU requires a secure context and an
  available adapter/device. `localhost` qualifies; a network LAN URL may not.
  If anything fails, boot WebGL2 and keep playing.
- **One renderer seam.** `src/renderer.js` owns backend creation, async readiness,
  capabilities (`compute`, `timestamp-query`, float render targets), tone
  mapping, color space, resize, render targets and disposal. Game code asks for
  a backend, not for `THREE.WebGLRenderer` directly.
- **No gameplay fork.** Physics, AI, navigation, saves and map state stay
  backend-independent. Box3D stays on the CPU/WASM.
- **Parity before speed.** Do not remove a WebGL feature until the WebGPU
  equivalent passes the same visual beats. Prefer TSL/NodeMaterial so materials
  are authored once, with a WebGL2 fallback for the few features WebGPU cannot
  match.
- **Explicit escape hatches.** Support `?renderer=webgpu` (force) and
  `?renderer=webgl` (force fallback) for testing and support. Surface the active
  backend in the debug/performance overlay.

### Migration slices

| Slice | Work | Done when |
|---|---|---|
| **7a — Backend seam** | Add `renderer.js`, async renderer boot/loading state, feature flags, forced-backend query flags, fallback error handling, backend indicator | Field and Studio boot on WebGL2 exactly as before; WebGPU boots on a supported browser; missing `navigator.gpu`, adapter or device falls back silently with no page error |
| **7b — Material parity** | Port the custom grass vertex deformation, sky dome/clouds/stars, pond reflection/water and any post passes to TSL/NodeMaterial; verify transmission, tone mapping and color management; keep the DOM HUD untouched | Dawn/day/dusk/night, grass close-up, pond, cottages and bears match the WebGL screenshots at the same camera/time; the existing self-test and visual beats pass on both |
| **7c — GPU-driven meadow** | Generate/config grass tiles around the camera; compute culling and distance LOD; indirect draws; GPU wind field (world-space gust/swirl, sampled by blades); preserve world-anchored roots, the lawn underlay and seamless density transitions | Dense tufted grass and visible wind close to the camera, no tile seams/pop lines, stable 40-bear field performance, and a WebGL grass fallback that still looks correct |
| **7d — Water and frame polish** | GPU water normals/ripples if profiling justifies it; planar reflection budget; render bundles/pipeline cache; shader warm-up and compile-hitch handling; timestamp queries in the perf overlay | Water/reflections at parity; fewer CPU stalls and draw calls than WebGL; measured frame-time improvement at equal quality; no shader-compile hitch on first input |
| **7e — Ship/fallback** | Device/browser matrix, forced-fallback tests, docs and screenshots from both backends | WebGPU is opt-in (auto when healthy), WebGL2 is documented as the safe path, and a user can switch without losing state |

### Acceptance

- Both backends pass the 16-check physics self-test, map switching, cannon
  validation, pond buoyancy, cottage collision and 40-bear stress run.
- Screenshot parity at matching camera/time/quality, plus deliberate captures of
  the grass LOD, wind, pond and night sky. No new clipping, seams or color
  drift.
- Target: **60 fps at the default quality tier with 40 field bears** on the
  reference machine, and never slower than the WebGL path at the same quality.
  If that target is not reached, keep WebGL as the default and leave WebGPU
  opt-in.
- Forced fallback works when WebGPU is disabled, the adapter request fails, the
  device is lost, or shader/pipeline creation fails. A backend failure must not
  trap the app on a loading screen.
- Memory/render-target usage is documented; no orphaned GPU resources after map
  switches or quality changes.

### Risks and non-goals

- WebGPU boot is asynchronous and shader compilation can stall; mitigate with a
  loading state, pipeline warm-up and fallback.
- TSL ports can drift visually from hand-written GLSL; keep per-material
  screenshots and migrate one material at a time.
- Browser/driver coverage is uneven; the WebGL2 path stays tested, not
  “best effort”.
- Custom planar reflection and transmission need measurement before porting
  aggressively; do not rewrite the whole render graph just to use WebGPU.
- **Not in scope:** GPU physics, GPU AI/navigation, WebGPU-only gameplay or
  content, a UI rewrite, or removing the WebGL renderer. The upgrade is
  successful only if the meadow still feels and plays the same.

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
  health, needs, homes, food ripeness, clock, cannon and camera.
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

**8b — directives.** Select a bear, then issue a command from a short panel:
go to a point, eat that food, sleep at home, follow the player, socialize with
another bear. A directive does not replace the AI — it enters the existing
utility selector as a high-priority, time-limited proposal, and the bear may
refuse. Refusal is decided by needs, personality (bold/shy), health, hysteresis
and cooldowns, and it is visible: an accept nod or a "no" emote plus a status
line. The queue is at most 3 deep and expires; the selector keeps authority, so
a starving bear still abandons "follow me" to eat.

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

## Village & placement editor (Phase 9)

The player shapes the meadow from the curated library — the authored villa
shells, trees, food and decor — rather than authoring new geometry. Each
sub-phase ships on its own:

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
layout; frame time after a fully built village stays inside the Phase 6b budget
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
part of the Studio map.

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
- Use MCP to accelerate geometry/material iteration, then perform the final
  export and performance check manually. The deterministic output is the GLB,
  not the chat transcript.

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
