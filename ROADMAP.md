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
src/ai.js               needs, state machine, steering, invites, conflict, emotes
src/life.js             scale, ages, sexes, health, pregnancy, births
src/launcher.js         cannon build/move/aim/fire
src/ui.js / styles.css  Aero/MSN shell and HUD
src/renderer.js         WebGL/WebGPU backend selection, capabilities, fallback
src/app.js              orchestration only
```

The Box3D wrapper now has destroyable static-wall handles. The current 24-body
rig and soft-body solver stay.

## Phases

| Phase | Deliverable | Done when |
|---|---|---|
| **0 ✅** | Snapshot current app; split modules; map manager + per-map state; per-bear scale/sex/health/age data; static-wall handles; baseline tests | Current Studio still passes its physics and interaction tests; map/launcher state is structured per map |
| **1 ✅** | Movable cannon + taller/larger walls on the Studio (quick playable win) | Cannon can be dragged/moved with validation; it stays in bounds; max-power shots are contained; aim/fire still work |
| **2 ✅** | Grass Field, sky, pond, Aero shell, map switcher; field default; **mixed starter colony (2 adult ♀, 2 adult ♂, 1 teen, 1 baby)**; **rounded white/aqua Aero villas on validated home lots**; **distant Frutiger-Aero skyline + three-blade wind turbines**; pond splash/buoyancy; **procedural gummy-tree replacement with rounded leafy puffs/fruit/hives; shared travelling wind for trees + grass; Wind and Meadow-detail controls; procedural clouds, aurora and sporadic morning mist** | Both maps load and switch with independent state; field has grass/trees/flowers/pond/sky/villas; no layout overlaps; day/night slider and dawn look work; pond reflects sun/moon and splashes; trees use the fixed TREE_LOTS/colliders with merged foliage batches and no per-frame CPU branch loops; one shared gust visibly crosses grass and trees; night sky shows aurora; starting colony has the four adults, teen and baby; villa silhouettes are distinct without changing their lots; skyline/windmills read as distant scenery; 16/16 self-test, mobile layouts, layout and map-switch checks pass |
| **3a** | Food registry/respawn, hunger, waddle locomotion, WANDER / SEEK_FOOD / EAT | Bears autonomously get hungry, walk to safe food, eat, and food regrows; no stuck/NaN/perf regressions |
| **3b** | Hives, health, sting/risk logic, rest/recover/woozy, **home return + night sleep**, health UI | Bees can sting; bears avoid hives below the threshold; health regenerates; hurt/tired bears return to their home and recover; no death |
| **4** | SEEK_COMPANY / invite handshake / mutual SOCIAL, food conflict, affection, **home visits**, buddy statuses/emotes | The other bear visibly accepts and switches mode; same-food target causes a shoving conflict; friends can visit homes; MSN-style statuses update |
| **5** | Growth stages + scale rebuilds, sexes, mating, pregnancy, births, population/food caps, baby following, **family homes/nursery** | Babies grow through teen to adult; opposite-sex satiated adults can mate; births respect cap/food; babies stay with/return to a parent’s home; body/surface/eyes/scale stay in sync |
| **6a** | **Effects pass before optimization:** improve shading/contact depth, SSAO, shadow maps, god rays, restrained bloom and a gentle color grade; scope/tuning to be discussed when the simulation is complete | Effects are optional/tiered, preserve readable UI/transmission, and are profiled before Phase 6b commits to them |
| **6b** | Aero/MSN polish, dawn/cloud/water tuning, day/night presets, performance/mobile, **home occupancy/window glow polish**, full test suite | Dawn/day/dusk/night look polished; field and 40 bears hit the performance target; mobile layouts; no-clipping/home tests pass; complete checklist |
| **7** (opt-in, after 6b) | **WebGPU renderer path:** backend abstraction, TSL material ports, GPU-driven grass/water, render bundles and timestamp queries; WebGL stays as the automatic fallback | WebGPU boots through the same self-test and visual beats with material parity; the 40-bear field meets or beats the Phase 6b frame budget at equal quality; fallback works when WebGPU or a suitable adapter is unavailable |

## Status

- **Phase 0 complete:** `snapshots/tabletop-phase0.zip` preserves the pre-refactor
  build; `src/world.js` and `src/launcher.js` exist; static walls are destroyable
  handles; per-bear life fields are in place; the 16-check self-test passes.
- **Phase 1 complete:** the cannon can be dragged or moved via Move cannon with
  footprint validation; position persists per map; boundary walls are 8 units
  tall and rebuild on resize; aim/fire and real-pointer tests pass.
- **Phase 2 complete:** the Grass Field is the default map with the Studio
  switch, independent map state, reflective pond and splash/buoyancy. The field
  now has the 92×60 bounds, 8 detailed Aero villas, a large Studio portal house,
  10 merged procedural trees, dense chunked/shader-LOD grass, a detailed rolling
  backdrop, shared tree/grass wind, procedural clouds, aurora, sporadic morning
  mist, lit fireflies, a distant Aero skyline and three-blade wind turbines.
  Villa doors are mounted on shallow entry drums and every opening is validated
  at 1.646 m against a 1.375 m adult bear. The starter colony is 2 adult ♀,
  2 adult ♂, one teen and one baby. The existing physics suite, layout/nav
  checks, map switching, both portal directions and mobile captures pass.
  Performance is remeasured in the Phase 2 profile below; grass remains the main
  GPU cost and is exposed through the Meadow-detail controls.
- **Next:** Phase 3a — food registry/respawn, hunger, waddle locomotion and
  WANDER / SEEK_FOOD / EAT.
- **Later, required:** model the Studio lounge interior with an interactable bar
  and a living room anchored by a huge Frutiger-Aero TV (references 19–24).
- **Later, opt-in:** Phase 6a is the effects pass (before Phase 6b optimization);
  Phase 7 adds the WebGPU renderer path, with WebGL2 as the fallback.

Each phase ends playable, with screenshots and headless checks, so the direction
can be adjusted without losing the working app.

## Bear AI

Each bear has **needs** (hunger, social, energy, affection), a sex, age/size,
health, and personality traits (bold/shy, appetite, sociability). A utility
selector with cooldowns/hysteresis picks a state roughly once per second.

| State | Trigger | Behaviour |
|---|---|---|
| Wander | default | pick a waypoint, waddle/lean there, idle |
| Seek food | hunger high | claim a ripe safe food source, or weigh a hive raid |
| Raid hive | honey desired, health/bravery allow | approach, risk sting; eat or flee hurt |
| Eat | at food | nibble, hunger ↓, food consumed, respawn timer starts |
| Seek company | social need high | choose a bear (friends preferred), approach |
| Invite → Social | near the chosen bear | offer interaction; if accepted **both switch to Social**, bounce/nuzzle, hearts, affection ↑; decline = small “no” emote |
| Conflict | two bears target the same food | face-off shove; larger/hungrier bear wins; winner eats, loser retargets; no injury |
| Mate | adult, opposite sex, hunger satisfied, healthy, food & population room | hearts, pregnancy for the female, then birth |
| Seek home / Rest | night, low health, low energy | walk to the bear’s cottage door, enter, sleep and regen; window glows while occupied |
| Woozy | health near zero | slow, safe food only, no hives/mating/conflict; returns home to recover |
| Grow | passive age | baby → teen → adult; sparkle at stage-ups |

**Locomotion** is procedural: steering forces plus a waddle/lean cycle driven
through the shape targets and tiny hops. No skeleton; the metaball jiggle does
the acting. Bears pause their AI while grabbed and resume after release.

**Navigation:** open-field steering with separation, obstacle avoidance (pond,
trees, cottages, cannon, arena bounds), stuck detection, and no per-frame
pathfinding. Homes have a door approach point; bears path to the door, not
through a wall. AI ticks at 5–10 Hz, staggered across bears.

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

## Homes & no-clipping

- **Aero villas:** 8–12 white/aqua Frutiger-Aero homes arranged around the
  meadow: soft rounded shells, turquoise glazing bands, silver trim, large oval
  windows, aqua doors, bubble lamps, mailboxes and a warm/aqua window glow when
  occupied. Silhouettes vary between pavilion, dome, saucer and tower types
  without changing the authored lots. Each villa has 2–4 beds/residents; the
  buddy list shows each bear’s home.
- **Home use:** bears claim a home at spawn (or a baby is assigned to a parent’s
  home). At night, when low on health/energy, or while woozy, they walk to the
  door, enter (a short fade/scale through the doorway — never through a wall),
  sleep and regenerate. In the morning they come back out. Friends can be
  invited for a home visit; babies follow parents; a pregnant/nursing mother
  uses her home as the nursery.
- **Object placement contract:** every prop gets a footprint + clearance:
  - cottages: wall footprint + roof overhang + 0.5 m clearance,
  - tree: trunk radius + canopy radius + 0.6 m (no cottage under/inside a crown),
  - pond: pond edge + 1.2 m,
  - other cottages: sum of radii + 0.9 m,
  - cannon: reserved placement disc + 1.5 m,
  - food/decor: placed after homes and rejected if they enter any clearance,
  - field walls: house + door approach + 1.6 m margin.
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

## World, sky, pond, presentation

- **Field:** Bliss-style rolling hills backdrop, flat playable gummy lawn,
  chunked instanced grass (7 tall/overlap blades + 6 low cover fans per tuft),
  procedural gummy trees with rounded leaf puffs, jelly flowers, jelly fruit,
  honey hives, pebbles, bubbles, and the cluster of Aero villas. Tree
  trunks/branches, foliage, fruit and hives are merged/instanced into a few
  batches; leaf cards are alpha-tested (not transparent glass) and the existing
  baked blob shadows stay.
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
  resolution, fresnel, ripples, shoreline tint, explicit sun/moon glints.
  Splash/buoyancy for bears flung into it.
- **Arena:** tall invisible Box3D walls (~8 units) around the field and the
  Studio table, ground underneath, launch-speed cap so shots stay contained.
- **Cannon:** drag the base or use Move cannon; green/red footprint validation
  (bounds, bears, pond/trees/cottages later); remains visual-only; shadow/arc follow.
- **UI:** Aero glass, aqua gradients, glossy buttons, bubbles; MSN-style buddy
  list with name, ♀/♂, stage, status, hunger/health, pregnancy, online count and
  clock; Studio keeps the editorial skin. Keep contrast, focus and keyboard use.

## Performance & testing

- Instancing for grass/flowers/props; procedural sky clouds; vegetation shadows
  baked/static; bear contact shadows stay blob-based. Reflection at low
  resolution/alternate frames with quality tiers. AI <0.5 ms/frame; food updates
  on timers; growth body rebuilds only at thresholds.

### Phase 2 profile (post-polish sign-off)

Headless Chrome on Apple silicon, 1440×900 at DPR 2, six starter bears,
default gameplay camera. These are forced-sync `readPixels` measurements, not
vsync rAF intervals (the headless compositor caps rAF around 30–20 Hz):

| state | frame | draw calls | triangles |
|---|---:|---:|---:|
| baseline | 29.5 ms | 558 | 2.43 M |
| grass hidden | 22.5 ms | 549 | 1.15 M |
| trees hidden | 27.4 ms | 550 | 2.16 M |
| pond/reflection hidden | 27.1 ms | 520 | 3.73 M* |
| villas hidden | 25.4 ms | 111 | 2.35 M |
| static shadow hidden | 30.2 ms | 557 | 2.43 M |
| grass coverage 0.50 | 27.7 ms | 558 | 2.43 M |
| grass draw distance 28 m | 25.8 ms | 553 | 1.72 M |
| DPR 1.25 (quality 3) | 20.1 ms | 558 | 2.40 M |
| bears removed | 27.9 ms | 552 | 2.38 M |

\*Reflection render-target accounting makes the pond-hidden triangle counter
non-monotonic; the frame-time result is the useful one.

The earlier pre-polish Phase 2 numbers (37.1 ms baseline, 321 calls, 2.12 M
triangles) and the full method are retained in [PERFORMANCE.md](PERFORMANCE.md).
Grass fill/geometry is still the dominant GPU item. The detailed villas add
~447 calls and save ~4 ms when hidden. DPR and grass density are the main
levers. The headless run is not a 60 fps claim.

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

## Tuning defaults (subject to playtesting)

- Day 10 min; growth 6–8 min; world speed 1×/2×/4×.
- Field ceiling 40; hard max 128; Studio ceiling 128.
- Starting meadow colony: 2 adult ♀, 2 adult ♂, 1 teen, 1 baby.
- Hive threshold 45 health; sting damage 15; honey 0.55 satiation.
- Food respawns: flowers 25–45 s, fruit 45–90 s, hives 90–150 s.
- Pond buoyancy/floating is non-lethal; no current; paddles to nearest shore.
- 8 Aero villas × 3–4 residents; door approach 1.2 m; house-to-house clearance 0.9 m.
- Night sleep window 20:00–06:00 (bears leave as the sky brightens); low-health
  returns can happen at any time.

## Studio lounge (later, required)

The Studio map is still the tabletop sandbox. A later modelled-room pass must add:

- **An interactable bar** the bears can use, with a counter, stools, glassware
  and under-counter glow. It should connect to the existing bear interaction
  system rather than being decoration only.
- **A living room with a huge Frutiger-Aero TV** as the focal wall: curved screen
  casing, cyan glow, aquatic channel visuals and a low lounge setting.
- Interior language from references 19–24: white curved architecture, aqua
  risers, ribbed soffits, jellyfish/aquarium motifs, bubble lighting and glossy
  blue floors.

These are must-have Studio requirements, not optional dressing. The references
are saved in `inspiration/`.

## Non-goals / deferred

- No death, predation or combat beyond food shoving.
- No bear migration between maps (each world is independent).
- No multiplayer, accounts or cloud saves.
- No full skeletal animation; locomotion remains procedural soft-body movement.
- Swimming is a recovered float, not free swimming.
- No player house-building/decorating yet; cottages use authored lots. Interiors
  are implied (door entry + window glow), not fully modeled walk-in rooms.
