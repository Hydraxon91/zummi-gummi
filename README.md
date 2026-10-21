# Gummy Bears

An interactive bowl of translucent jelly bears: grab, stretch, squash, throw, pour, wobble, set off fireworks — or load one into the little glass cannon and fire it across the table. Rendered with **three.js**; soft-body physics runs on **Box3D** (erincatto/box3d) compiled to WebAssembly.

The meadow chapter is playable: a circular Bliss-style meadow with a continuous full-circle grass carpet, wandered dirt trails, rounded hero trees, branched background trees and bushes, detailed Aero villas and a large Studio portal house, an anime-lite reflective pond, a full day/night sky with clouds, aurora and fireflies, a distant skyline and wind turbines. The bears now act on hunger, thirst, health, company, family and the time of day: they hop to edible flowers and fallen jelly fruit, drink at the pond, raid risky beehives when very hungry, recover when woozy, return to their villa to sleep on their own schedule (bedtime 20:00–22:30, wake 05:00–07:00), and seek out friends. A lonely bear offers a nuzzle; the other bear visibly accepts or declines, friends build a bond, and a bonded pair can visit a villa doorway together. Hungry bears may shove over the same claimed snack. Babies follow a parent and grow through teen to adult; satiated adults court, carry a short pregnancy and give birth when there is food and room. Each bear also has its own heritable hop-pace range, family home and sleep schedule. They resume their task after being grabbed or thrown, and the Studio remains available from the in-app map switch and the diegetic door. All simulation chapters through family life are now in [ROADMAP.md](ROADMAP.md), with selected captures in [screenshots](screenshots/). An optional **Off / Soft / Full** meadow effects stack adds a gentle grade, restrained bloom, SMAA and high-tier contact AO, plus depth-aware screen-space sun/moon god rays and an optional depth-of-field toggle. High quality tiers also get real directional sun/moon shadow maps; lower tiers keep the lightweight blob shadows. The Studio stays on the direct renderer.

## Launch it

Play the current `main` build in a browser: <https://hydraxon91.github.io/zummi-gummi/>. Or run it locally:

Double-click the launcher for your system:

| System | File |
| --- | --- |
| macOS | **Launch Gummy Bears.command** |
| Windows | **Launch Gummy Bears.bat** |
| Linux | **launch-gummy-bears.sh** (or `python3 launch.py --install-shortcut`) |

Every launcher runs `launch.py`, which needs **Python 3** (already present on macOS/Linux; install it from python.org on Windows). On first launch, allow Python through the firewall (macOS and Windows both prompt) if you want to open the app from other devices.

The host opens **http://localhost:8000/**. The launcher also listens on the local network and prints a second **Network** URL such as `http://192.168.1.23:8000/` — open that on a phone or another computer on the same Wi-Fi/LAN. Use `--localhost` to restrict access to the host machine only, or `--port 8080` to change the port:

```bash
python3 launch.py              # localhost + network
python3 launch.py --localhost  # this machine only
python3 launch.py --port 8080
python3 launch.py --no-open
```

If the executable bits were lost (for example after unzipping on Windows), restore them on macOS/Linux with:

```bash
chmod +x launch.py "Launch Gummy Bears.command" launch-gummy-bears.sh
```

You can also run it by hand:

```bash
python3 launch.py
```

The app uses ES modules and a `.wasm` file, so it must be served over HTTP (opening `index.html` via `file://` will not load the physics). The previous single-file version is preserved as [`legacy-singlefile.html`](legacy-singlefile.html) and works directly from disk.

## Controls

- **Grab** a bear with the left mouse button (or a finger) and pull to stretch; release to throw. Multiple pointers can grab at once.
- **Orbit** by dragging empty space, right-dragging, or two-finger dragging. **Pan** with middle-drag, shift-drag, or two-finger drag. **Zoom** with the wheel or pinch, from a close bear portrait (about 3.2 m) out to the skyline. `WASD` pan, `Q`/`E` orbit, `R` resets the camera.
- **F** fires a firework at the cursor, hold to spray, `Shift+F` fans; the EXPLODE button fires a volley. `?` opens the controls sheet.
- **L / Launch bear** arms the glass cannon. Aim with the mouse (or drag a finger) and release/click to fire a bear on a ballistic arc; `Esc` or the button cancels. The landing ring shows where it will come down.
- **Directives** — click a bear in the roster, then choose **Go here** (tap the meadow to pick a spot), **Eat**, **Drink**, **Home** or **Social**. A bear may refuse when it is hungry, thirsty, tired, hurt or courting; the panel shows why, a no-mark appears over the bear, and a large crossed-circle stamp appears over that bear's villa. A starving bear abandons the request to eat. Up to three queue for 45 seconds; **×** closes the panel and leaves them running.
- **Select click / Grab click (C)** — Grab keeps the original left-drag stretch and throw. Select highlights the bear under the pointer and opens its command panel; dragging still orbits. The mode persists.
- **Take control (V)** — control the selected bear directly: WASD/arrows or the on-screen stick move, Space hops, V or Esc exits. The AI is suspended for that bear only, needs keep ticking, and the third-person camera follows without clipping the ground or arena edge.
- **Move cannon**: drag the cannon itself, or press **Move cannon** and click/tap the table. The footprint ring turns green/red for a valid spot; `Esc` cancels and restores the previous position. The position persists for each map.
- **Hide UI**: press `U` or use the small top-right UI button to hide every gameplay overlay (including on phones); an active performance overlay stays visible. The button remains as the restore control and the choice is remembered.
- **Autonomous bears**: meadow bears wander locally, occasionally take a longer cross-meadow trip, hop toward food, nibble flowers or fallen fruit with a chew motion, and lap at the pond with a separate drinking motion. Very hungry bears may raid a beehive, risking a sting; health and energy recover over time, faster while resting. At their own bedtime (20:00–22:30) or when hurt/tired, they return to their villa and sleep until their own wake time (05:00–07:00), and the roster shows their health and sleeping status. Each bear has its own hop-speed range. Grabbing or throwing one interrupts its hop/task; it resumes when it lands and settles. The Studio remains a hands-on sandbox with needs paused.
- **AI Debug**: press `G` or click **AI** to open the meadow-only inspector. Select a bear, set hunger/thirst, force a valid state, and show that bear’s planned route and target in the world. The readout also shows health, energy, home and the bear’s own hop-pace range. Eat/drink fall back to the matching seek state when no target exists.
- **Wind**: use the Wind slider in the meadow time panel to set strength. Direction, strength and gust randomize each session and the direction slowly veers; grass, trees, water and the distant turbines follow the same live wind. The pond’s wave normals, edge wavelets and anime cell drift all travel downwind and scale with wind speed; the webbing fades only near the shallow shoreline, and broken foam washes onto the windward bank. **Meadow detail** exposes canopy fullness, leaf size, grass coverage, grass draw distance, the **Off / Soft / Full** Effects selector and a persisted **Depth of field** toggle for balancing the look against frame cost. Lower grass coverage shortens the tufts rather than randomly deleting them, so the carpet never develops bare holes.
- **Graphics profiles / Settings**: the gear button opens a live settings sheet with **Auto / Performance / Balanced / Quality / Ultra** profiles, adaptive quality, render resolution, effects, depth of field, **Toon shading** and meadow detail. The toon toggle swaps compatible standard materials to **MeshToonMaterial**; custom water, sky and particle shaders stay on their own programs. Depth of field focuses on a nearby object under the view centre and softens only the background: full strength within 5 m, fading to sharp by 10 m, so fully zoomed-out overviews stay clear. Presets set a starting bundle; changing any control switches the profile to Custom. The choices persist locally.
- **Studio MSN prototypes**: the Studio lazily loads the blue **Glass MSN** GLB as **3 skinned meshes, 9 bones and 10 authored clips**. Its transmission, IOR, attenuation and reflective clearcoat use the studio environment; the Race Lab controls clarity, roughness, playback, speed and a **Grab / Turn** drag mode. Glass now has a **rigid Box3D sphere proxy**, so drag-to-grab lifts and moves it, while Turn mode rotates it; click selects and triggers a reaction, and double-click or **Frame** focuses. A green **Gummy MSN** now also spawns in the Studio as a **24-body Box3D + metaball soft body** using the bear-style gummy material; it is grabbable and stretchable with the same pointer/throw path as the bears, and Studio save/load preserves its species and rig. The Race Lab's **Control Gummy** button (or **V** once selected) gives it the bear possession controls: WASD/stick, Space hop and V/Esc exit inside the Studio table. Two Gummies join the Meadow colony and the buddy roster; they use the shared AI needs/navigation, grow through baby/teen/adult and can reproduce with each other. Bear × Gummy reproduction is now allowed: a child uses a randomly chosen Bear or Gummy rig, and a Glass material gene is inherited by the child. Two Glass MSNs now also live in the Meadow through a rigid hover adapter: they use the same roster, needs, bonds, stage growth, pregnancy, birth and save payloads as the soft-body actors, eat/drink at a lower rate, never sleep at night and may shelter inside their villa during the day. Glass grows through its stages only at night, and in Grab-click mode it can be dragged by its rigid Box3D proxy. While hovering between tasks it steers its Box3D sphere with forces, leans into travel, turns gradually and bobs with a faint wind sway, so it collides with bears instead of phasing through them. Bears and Glass also steer around nearby actors before contact, so walkers go around each other rather than shoving through. Normal drag pulls a camera-depth target with a damped spring, Shift-drag lifts/lowers that target, and release preserves body velocity with a decaying pointer-velocity contribution. Held Glass follows its physical position without hover bob or navmesh snapping and tilts visually during movement; after release it ricochets off world geometry, tumbles visually, then returns to hover upright. The sphere remains rotation-locked; tilt/tumble is visual. Glass babies follow a parent, inherit a family home, gain parent and sibling bonds, and are presented in the roster by their current family state. The roster shows generation and sibling/child counts; selecting an actor opens a lineage line with parents, siblings, children and generation. Siblings and parents can start family play; Glass playdates gather at the family door, raise the bond, play for longer and show a play status. Successful Glass socializing can continue into a door-level visit with another Glass or a Bear/Gummy; hosts and guests walk to the villa door, socialize outside, then disperse. Entering or leaving daytime shelter uses a door fade and sparkle instead of an instant pop. Glass × Bear/Gummy pairs are enabled in both directions through the companion scan; a Glass child uses the existing GLB with a colour blended from both parents, while a Bear/Gummy child can inherit the glass material. Clicking a Gummy gives a short Nod/Wave/Cheer reaction, and a weighted idle timer chooses from Idle, Nod, Lean, Wiggle, Wave, BigWave, Cheer, Handshake, Squash and Hop using procedural soft-body target poses. A small **species registry** (`src/species.js`) separates race capabilities, cast groups, assets, life/tells flags and DNA metadata from the hot physics paths; future races register a definition instead of growing another branch chain. Each species carries breed-group/compatibility data, genome loci/defaults and deferred hybrid target ids; the reproduction gate is separate from the long-term compatibility list. `src/dna.js` provides deterministic genome defaults, parent combination, mutation, clamping, phenotype expression and current/future species-breeding gates. Every actor now carries a genome/phenotype; births combine both parents, and saves include an optional versioned genome with a species-default fallback for older saves. Size and colour genes are applied. Rigidity, softness/damping and stretch are normalized against each species' defaults before entering the solver, so default actors keep their existing feel while inherited variation changes it. Material genes select the bear/MSN/glass material profile. Custom hybrid models remain deferred while Blender MCP testing/authoring continues in parallel; any future hybrid will be an authored asset/species entry, not a runtime mesh blend. A **Show: Bears / Both / MSN** control filters the Studio cast (view-only; bear state is preserved), persists locally and leaves the Meadow unchanged. `?race=off` disables the MSN prototypes and Meadow Glass actors; `?race=alpha` keeps the Glass alpha/opacity look for A/B comparison.
- Flavor swatches, custom color + clarity, wobble, bear ceiling (8–256, persisted), upright assist, pour, reset, and a performance overlay.

## Layout

```
index.html                 page shell, styles, HUD
launch.py                  cross-platform local/LAN server + browser launcher
Launch Gummy Bears.command macOS double-click launcher
Launch Gummy Bears.bat     Windows double-click launcher
launch-gummy-bears.sh      Linux launcher
src/app.js                 renderer, metaball surface, input, UI, fireworks, loop
src/config.js              flavors + the 24-body bear rig
src/world.js               map registry + per-map launcher state
src/launcher.js            movable cannon: build, aim, fire, move/validate
src/field.js               meadow, pond, food visuals, grass, trails, nav/shadows
src/food.js                food sources, claims, ripeness and respawn
src/ai.js                  hunger/thirst needs, hop tasks and interruption hooks
src/effects.js             optional meadow post stack (grade, bloom, GTAO, SMAA, screen-space god rays, DOF)
src/aidebug.js             field-only AI inspector + selected-bear plan overlay
src/fieldshape.js          shared wobbled-disc boundary, camera/nav/wall clamp
src/floratypes.js          tree/bush/rock and villa-style definitions
src/mapcontent.js          authored homes, trees, rocks and starter populations
src/wind.js                shared world-space wind uniforms + GLSL
src/trees.js               procedural merged trees, foliage/fruit/hive batches
src/bushes.js              branched meadow shrubs + canopy-centre foliage shading
src/homes.js               rounded white/aqua Aero villa visual builder
src/studiohouse.js         large field-side Studio portal house + return door
src/msn.js                 Studio Glass MSN GLB prototype, clips and glass material
src/glass.js               Meadow Glass life adapter: hover/grab, needs, bonds, night growth, births, save
src/actorsave.js           actor save validators, actor version and collection registry
src/assets.js              asset manifest validation + manifested GLB loader
src/assetstore.js          catalog IDs, shared source loads, resource leases/status/eviction
src/foodtypes.js           food labels, safety, nutrition, respawn and visual/interaction IDs
src/npc.js                 shared soft-body/Glass actor view for roster, save and interaction iteration
src/msnrig.js              derived 24-body MSN soft-body rig config
src/buddyrig.js            authored MSN 24-body rig data
src/species.js             species registry, capabilities, DNA metadata and asset descriptors
src/dna.js                 genome defaults, crossover, mutation and phenotype expression
src/backdrop.js            rolling background hills, tree belts and hill detail
src/horizon.js             distant Aero skyline + three-blade wind turbines
src/sky.js                 day/night sky, procedural clouds, moon, aurora, mist
src/box3d.js               JS side of the physics bridge (batched calls)
scripts/box3d_wrapper.c    C wrapper: world, spheres, destroyable statics, spring joints
scripts/build-box3d.sh     reproducible Box3D + wrapper wasm build
scripts/smoke.mjs          served-build smoke test (page, modules, wasm load)
scripts/glb-inventory.mjs  standard-library GLB delivery inventory
scripts/browser-harness.mjs portable CDP launch/evaluate/capture helper
scripts/browser-regression.mjs seeded Meadow + Studio browser regression
scripts/race-test.mjs      deep Meadow/Studio species/cast/interaction harness
scripts/glass-test.mjs     deep Glass life, interaction, birth and save harness
scripts/adoption-test.mjs  guardian lifecycle for soft-body and Glass babies
scripts/uid-test.mjs       identity reservation, duplicate rejection, map switches
scripts/relationship-test.mjs relationship panel, pair history and responsive UI
scripts/gifting-test.mjs   gifting collection/carry, cap, save/load and settings UI
scripts/social-test.mjs    chat, cuddle, rivalry, partnership, groups, Glass and v8 save
scripts/prune-dev-shots.mjs scratch capture retention (dry-run default)
vendor/box3d/              prebuilt box3d.js / box3d.wasm + MIT license
snapshots/tabletop-phase0.zip  captured pre-refactor working build
legacy-singlefile.html     previous single-file build (custom point physics)
screenshots/               selected Phase 2 captures (WebP)
LICENSE                    MIT
```

## How the bear is simulated

Each bear is **24 sphere bodies with rotation locked** (so the jelly solver only has to drive translations). Box3D owns contacts, friction, CCD and sleep. Our solver adds the jelly every 60 Hz step:

- mass-weighted **shape matching** to a rest pose (polar decomposition, capped tracking),
- **volume preservation** that bulges sideways when compressed,
- COM-relative damping, grab springs per pointer, and a press-squash,
- an **upright** torque plus a gentle righting nudge that yields to pushes,
- **distance-spring joints** for the spine, ears/snout, arms, legs and cross-braces,
- negative collision groups so a bear's own parts never self-collide.

The render surface is a metaball field (spheres + neck/arm/leg capsules) polygonised with surface nets on a deformation-gated lattice; rigid mesh reprojection keeps motion smooth between rebuilds. Box3D contact tuning is deliberately soft (55 Hz, 0.72 damping).

The **bear launcher** is a small glass-and-brass cannon. Entering aim mode solves a ballistic launch (fixed 32° elevation, cursor-targeted speed) and draws a dotted arc plus a landing ring; firing spawns a new 24-body bear lying head-first along the barrel with the solved velocity. The cannon itself is visual-only, so bears never catch on it.

The cannon can be **moved**: drag its base directly, or use Move cannon and click the table. A footprint ring validates bounds and nearby bears. The boundary walls are now **8 units tall** (up from 1.8) with destroyable static-body handles, so they rebuild when the table resizes and contain max-power shots.

## Rebuilding the physics wasm

Requires cmake + Emscripten (tested with cmake 4.4.4, emcc 6.0.12):

```bash
brew install cmake emscripten
./scripts/build-box3d.sh
```

This pins **Box3D v0.1.0** and builds single-threaded wasm with SIMD (`-msimd128`), so no COOP/COEP headers are needed. The prebuilt module is checked in, so the toolchain is only needed when changing the wrapper.

## Performance

Measured headless in Chrome on Apple silicon (CPU frame cost; surface time varies with grid tier + rebuild rate):

| bears | bodies | physics | surface | total |
|------:|-------:|--------:|--------:|------:|
| 21 | 504 | ~0.90 ms | ~7.5 ms | ~8.4 ms |
| 128 | 3,072 | ~8.3 ms | ~3 ms | ~11.3 ms |

The 256 ceiling is available (6,144 bodies) but heavy; the crowd tiers reduce surface detail as the count rises.

### Phase 2 meadow profile (circular pass)

Headless Chrome on Apple silicon, actual gameplay view at 1440×900, DPR 2, six
starter bears, forced GPU sync (`readPixels`):

| state | frame | draw calls | triangles |
|---|---:|---:|---:|
| baseline | **32.1 ms** | 565 | 3.67 M |
| grass hidden | **25.3 ms** | 554 | 2.10 M |
| trees hidden | 30.6 ms | 557 | 3.40 M |
| pond/reflection hidden | 29.8 ms | 528 | 5.25 M* |
| villas hidden | 30.3 ms | 118 | 3.59 M |
| static shadow hidden | 32.9 ms | 564 | 3.67 M |
| grass coverage 0.50 | 30.3 ms | 565 | 3.67 M |
| grass draw distance 28 m | 29.5 ms | 559 | 2.84 M |
| quality 3 / DPR 1.25 | **23.6 ms** | 565 | 3.64 M |

\*Reflection render-target accounting makes the pond-hidden triangle counter
non-monotonic; the frame-time result is the useful one.

A later close-up-ground/sheen/water-cell spot check measured a noisy
**39.7–44.3 ms** baseline and **24.8–26.6 ms** at quality 3; the stable 32.1 ms
table above remains the reference until a clean rerun.

Grass fill/geometry is still the largest single item; the detailed villas remove
~447 draw calls but save only ~2 ms in this run. DPR and grass density are the
largest levers. The full report, including the previous post-polish and original
37.1 ms baselines, is in [PERFORMANCE.md](PERFORMANCE.md).

## Verification

The Box3D port passes a 16-check headless self-test covering NaN/bounds, bounce counting, pour, head pull/stretch readout, upright hang, press squash, snap-back, throws, release launch, surface validity, vertex limits and the bear ceiling. Separate checks drive the cannon through the UI, the keyboard (`L`/`Esc`), the debug API and real mouse events, including move-mode and direct-drag placement, validation and 8-unit wall handles. Phase 2 checks additionally cover map switching with independent bear/cannon state, field layout/nav validation, pond buoyancy, cottage collision, tree/grass controls, mobile captures and the final visual beats. The polish pass adds checks for villa door headroom (1.646 m opening vs 1.375 m adult), both portal directions, sky-look/high-orbit camera limits, and day/night firefly visibility and motion.

A continuous-integration smoke test also runs on every push and pull request (`.github/workflows/smoke.yml`). It boots `launch.py`, then `scripts/smoke.mjs` fetches the page shell, source modules, licenses and `box3d.wasm` over HTTP and instantiates the wasm — asserting the `application/wasm` MIME type, the `\0asm` header, the linear memory and the exported `_g3_*` wrapper API. Run it locally with `python3 launch.py --no-open &` then `node scripts/smoke.mjs`.

CI runs `node --test tests` before the server starts, then the smoke test, then a blocking core browser regression (`BROWSER_SCOPE=core`, `?race=off`). Those checks cover the species registry, gene definitions and inherited traits, current DNA combination and breeding gates, actor save versions/collections and unknown-content rejection, food definitions/state, the asset catalog/store, the MSN GLB inventory, and the bear family lesson/meal/playdate/history plus save/load. A separate nightly workflow runs the full Studio browser regression, the full Glass lifecycle and the Meadow soak. The asset manifest lives at `assets/MSN_Figure/asset.json`; inspect a GLB locally with `node scripts/glb-inventory.mjs assets/MSN_Figure/msn.glb`.

With the server running, `node scripts/browser-regression.mjs` boots the Meadow, seeds randomness, checks the 10-row roster, 8 soft-body actors, 2 Glass, the starter family lineage, a sibling play start, a parent/child lesson and skill gain, a family meal with hunger/history, cross-species social, the history panel and save/load. Set `BROWSER_SCOPE=core` to use `?race=off`, expect six bears and no Glass, and skip the Glass asset, cross-species and Studio checks. Set `STUDIO=1` to also load the Studio Glass prototype and verify 3 meshes/9 bones/10 clips plus the family fields surviving a map/save round trip; set `SHOTS=1` to write a capture under `.dev-shots/`. Use `BROWSER_BIN` or `CHROME_BIN` when the browser is not in a standard macOS/Linux location. CI runs the core scope with a runner-provided Chrome/Chromium, SwiftShader fallback, `LOW_QUALITY=1` and a 900×600 viewport. The nightly workflow runs the full Studio regression, the full Glass lifecycle and soak without blocking pushes; the full Glass lifecycle is too slow for the blocking job under software rendering.

Frame profiling: with the server running, `node scripts/perf-profile.mjs` measures the current 8-soft-body + 2-Glass Meadow at 1440×900/DPR 1/quality 2/effects off and reports baseline, grass coverage, grass draw distance and a baseline repeat. Set `LOW_QUALITY=1` to measure the CI graphics profile (900×600/DPR 0.6/quality 3). Discard the first two probes as GPU ramp and compare rows from the same session; the current numbers are in `PERFORMANCE.md`.

Deeper passes use the same portable harness: `node scripts/race-test.mjs` covers Meadow species/births and the Studio MSN/Gummy/Glass interaction paths; `node scripts/glass-test.mjs` covers the full Glass life cycle; `node scripts/soak-test.mjs` runs a larger household through 60 simulated seconds and a map round trip, failing on stuck movers, NaNs or count drift; `scripts/adoption-test.mjs` covers guardian assignment, save/load, parent return, other-map parents, Glass stage-up and the off path, `scripts/uid-test.mjs` covers identity reservation, duplicate rejection and both map-switch directions, and `scripts/relationship-test.mjs` covers the relationship tabs, pair interactions, cross-map/missing relatives and responsive captures; `scripts/gifting-test.mjs` covers physical collection/carry, accepted/refused gifts, the daily cap, map cleanup, v7 gift save and settings; `scripts/social-test.mjs` covers chat/cuddle, rivalry/reconciliation, partnership and separation, groups, Glass participation, v8 save/load and dropped-portion map isolation. All accept `TAG`/`GAME_URL`; race-test also accepts `LOOK=alpha` and `MOBILE=1`, and soak accepts `SOAK_SECONDS`/`SOAK_POP`. Scratch captures under `.dev-shots/` can be reviewed with `node scripts/prune-dev-shots.mjs` (dry run) and deleted with `--apply`, using `DAYS` (default 14) for the cutoff. Curated `screenshots/` are never touched.

Phase 3a/3b debug checks drive `__gummy.ai()` / `__gummy.food()` / `__gummy.foodSources()`, plus `setHunger`, `setThirst`, `setHealth`, `setEnergy`, `setAI`, `setBearState`, `setTime`, `aiPlan` and `aiRoute`. They cover hop travel, heading/face alignment, upright hop tilt and airtime, local and long wander legs, food claims and unique claims, eating, drinking, respawn, hive risk/sting and depletion, health/woozy recovery, night home return/sleep/wake, per-bear pace ranges, grab/throw interruption and resume, Studio AI suppression, map-switch cleanup, and NaN/bounds. Phase 4 adds `setSocial`, `setAffection`, `setBond`, `forceSocial`, `forceInvite`, `forceVisit`, `forceConflict` and `homes()` to the same API; the checks cover natural company seeking, invite acceptance, mutual social, decline, bond gain, door visits, contested-food shoving and resolution, partner interruption, and social/bond persistence across a map switch. Phase 5 adds `life()`, `setAge`, `setStage`, `setPregnant`, `forceMate`, `forceBirth` and `setCeiling`; the checks cover baby→teen→adult growth with body/surface/eye scale rebuilds, natural and forced courtship, pregnancy, births under cap/food pressure, parent/flavor/pace inheritance, baby following, family homes and life-state persistence through a map switch. The Glass adapter adds `glass()`, `glassSetNeed`, `glassSetStage`, `glassSetAge`, `glassSetPosition`, `glassSetCooldown`, `glassSetPregnant`, `glassReset`, `glassShelter`, `glassFamilyPlay`, `glassVisit`, `glassVisitBear`, `glassScreen`, `glassMate`, `glassMateBear`, `bearGlassSocial`, `bearGlassMate`, `glassMateDebug` and `glassBirth` for deterministic hover-life checks. `seed(n)`/`unseed()` make random behavior repeatable, `family(uid)` returns the lineage record, `roster()` returns the current UI rows, and `familyPlay(i, j)` starts a deterministic sibling/parent play session. The optional effects stack adds `setEffects`, `effectsState`, `setEffectsBloom`, `setEffectsExposure` and `setEffectsDof`; `shadows()` reports the active renderer/quality shadow state. The settings pass adds `settings()`, `setProfile()`, `setAdaptive()`, `setRenderScale()` and `resetSettings()`. Checks cover Off/Soft/Full selection, persistence, day and night captures, Studio direct rendering, transmission/reflection parity, GTAO high-tier rendering, real sun/moon maps with blob fallback, depth-aware canopy/object god rays, the DOF toggle, all five graphics presets, render-scale/quality persistence, settings-screen desktop/mobile layouts and the absence of page errors. The AI debug panel was checked at desktop and 390×844 with a selected-bear route line, target marker, social/affection controls, live life readout and Studio-hidden controls. The AI update itself measured well under the <0.5 ms budget. Sleeping-bear possession and the house crossed-circle refusal stamp were checked with debug state and a meadow capture. Gummy Studio possession was checked through the Race Lab Control button, keyboard movement and exit. The species registry was checked with all three shipped definitions (bear, Gummy, Glass) and a separately registered fixture species; spawn, save/load, possession, cast, roster, life and cross-species breeding consult the registry. DNA metadata was checked for breed groups, all-three compatibility, genome loci/defaults, hybrid targets and separate current/future reproduction flags. The DNA engine was checked with deterministic bear, Gummy and Glass genomes, same-species and Bear × Gummy combination, mutation/clamping, phenotype expression, current/future breeding gates, default genomes on every actor, parent-genome combination at birth, Gummy-rig child inheritance and genome persistence through save/load. A v1 save without genomes still validates and loads; the actor layer supplies species defaults. Default DNA scales were checked to stay exactly at 1.0 so existing solver behaviour is unchanged. Meadow now has six bears, two Gummies and two Glass MSNs in the roster; the field simulation reports eight soft-body actors with no NaN. Gummy stage growth, same-species mating and a Gummy birth with Gummy-rig inheritance were checked. Bear × Gummy mating and a cross-species birth were also checked: the child used a random viable parent rig, carried the matching genome/phenotype and inherited a Glass material gene. The Glass Meadow adapter was checked for lazy GLB loading, hover height and material, real pointer drag with Shift vertical lift, rigid-body throw ricochet and visual tumble, lower-rate food/water seeking, no night sleep, daytime home shelter and night emergence with door fade, night-only stage growth, baby/adult scaling, parent follow, parent/sibling bonds, family/sibling play, door-level Glass/Glass and Glass/Bear visits, Glass × Glass and Glass × Bear births, a Bear-mother × Glass-father birth, reciprocal bear-initiated social/mating, parent-blended Glass colour, roster rows, pregnancy/family save/load and no page/GL errors. The shared `src/npc.js` actor view now supplies active/all/by-uid/home queries for roster, save, launcher clearance and interaction iteration. Gummy click reactions, the random idle think timer and the Wave pose were also checked and captured. The Studio MSN prototypes add `__gummy.msn.load/state/play/clarity/roughness/opacity/speed/visible/reset/cast/hit/hover/screen/select/activate/drag/focus`; checks cover the lazy Studio load, 3 skinned meshes/9 bones/10 clips, Idle advance, one-shot return to Idle, Glass transmission/clearcoat/reflection values, the alpha fallback, all three cast filters, cast persistence, `?race=off`, Meadow isolation, hover/click selection, click reaction clips, Glass Box3D grab/lift/drop, Drag Grab/Turn, drag-to-turn, Shift-drag placement, Frame camera focus, Reset placement, the 24-body Gummy actor, distinct Glass/Gummy colours, Gummy grabbing, Gummy save/load and desktop/mobile captures.

## Roadmap status

### Extensible content (first slice)

- Food definitions live in `src/foodtypes.js`: `registerFoodType` / `getFoodType`
  / `listFoodTypes`. A placed source keeps its stable `id`, `kind`, position and
  visual index; the registry fills labels, satiation and respawn ranges. Per-source
  overrides remain supported. Bear/Gummy and Glass query `{ safe: true }` rather
  than flower/fruit lists. New types can reuse an existing visual/interaction;
  new geometry or new behavior still needs its own builder/handler. Hive sting
  behavior remains specialized and unchanged. Flavor data now has one source,
  `config.js`, preserving numeric save indices and all material values.
- `assets/catalog.json` and `src/assetstore.js` share the MSN GLB source between
  Meadow and Studio. Each actor has independent bones, materials and animation
  state and retains a source lease. `__gummy.assets()` reports cache state and
  counts; explicit zero-lease eviction cannot dispose live actor resources.
  See [assets/README.md](assets/README.md) for catalog and ownership rules.
- Flora and villa content now use stable IDs in `src/floratypes.js`; authored
  placements and starter populations live in `src/mapcontent.js`. The current
  tree order, first two hive hosts, villa style sequence, home names and starter
  colony are preserved. Builders consume the definitions; this is not a map or
  renderer rewrite.
- Pure tests cover food fixtures, claims/respawn/save state, flavor baselines,
  flora/home/map content IDs and counts, catalog validation, coalesced loads,
  error/retry, leases and disposal. The `STUDIO=1` browser regression also checks
  source reuse over a map round trip.


- **Phase 0 ✅** — snapshot, module split (`world.js`, `launcher.js`), per-map state, static-wall handles, per-bear life fields, tests green.
- **Phase 1 ✅** — movable cannon, placement validation, persistent position, 8-unit walls.
- **Phase 2 ✅ (current scope)** — Grass Field default with Studio switch, sky/clouds/aurora/mist, reflective anime-lite pond, detailed Aero villas and Studio portal house, circular dirt-trail meadow, full-circle grass with close-up ground texture and Aero sheen, procedural hero trees, branched backdrop trees and bushes, shared wind, Wind/Meadow-detail controls, mixed starter colony, distant skyline/wind turbines, lit night fireflies, and Hide UI. Door openings are validated at 1.646 m against a 1.375 m adult bear. Studio modelling is queued as the parallel required track in the roadmap.
- **Phase 3a ✅** — Food claims/respawn, hunger and thirst, hop locomotion, WANDER / SEEK_FOOD / EAT / SEEK_WATER / DRINK, with grab/throw interruption and resume.
- **Phase 3b ✅** — Upright hop poses and takeoff gating; per-bear hop-speed ranges; risky hive raids with bee stings; health, energy, woozy recovery and sleeping; night/low-health home return with villa sleep and wake-up; health bars in the meadow roster.
- **Phase 4 ✅** — Social and affection needs, pair bonds, company seeking, invite/accept/decline handshakes, mutual nuzzling with hearts, contested-food shoves with a winner and loser, door-level home visits with host/guest statuses, and MSN-style buddy status updates.
- **Phase 5 ✅** — Baby/teen/adult growth with synchronized physics and visual rebuilds, parent following, family homes, adult courtship, pregnancy, births with population/food gates, inherited flavors and hop-pace ranges, and life-state persistence. Villa interiors and a modelled nursery remain later modelled-room work.
- **Phase 6b-4 ✅** — Release checklist passed on the shipped build (self-test subset, smoke, map switch, no-clipping/home checks, desktop and mobile captures, doc sync), with the deferred 6b-1 polish and Aero/MSN prop set named explicitly rather than silently dropped.
- **Phase 6a/6b effects follow-up ✅** — Optional meadow post stack with **Off / Soft / Full** control: gentle time-of-day grade, restrained thresholded bloom, SMAA, high-tier GTAO contact AO, real sun/moon directional shadow maps with blob fallback below the shadow tier, cloud-masked sky-dome glow, and depth-aware screen-space god rays that occlude against tree canopies and solid objects. **Depth of field** is a separate persisted toggle. Studio stays on the direct renderer.
- **Graphics profiles / settings (shipped slice) ✅** — Gear-accessed Settings sheet with Auto, Performance, Balanced, Quality and Ultra presets, adaptive quality, render scale, effects/DoF and meadow detail. Presets are live starting bundles; manual tweaks switch to Custom. All settings persist; the quick Meadow-detail panel stays in sync.
- **Time-of-day looks ✅** — The time panel has Dawn / Day / Dusk / Night chips. Each applies a full look (hour, mist, cloud density and exposure), turns Auto off and persists across reloads; the slider or Auto returns to a custom clock.
- **Mobile layout** — On phones and tablets the interface becomes two collapsible sheets, **Bears & toys** and **Meadow**; opening one closes the other so the meadow stays visible, and both scroll. Settings and Controls remain full-screen sheets.
- **Phase 8a ✅ — persistence** — Settings has five named slots plus an autosave (every two minutes). Each slot saves both maps, bears (identity, traits, bonds, homes, pregnancy, active directive and queue), food state, clock/look, camera and cannon position. Load replaces the live session only after the payload validates; Export/Import moves saves as JSON; New Game restores the authored starter colony at 07:00. Saves live in the browser (IndexedDB). Offline time does not advance.
- **Phase 8b ✅ — bear directives** — click a bear in the roster, then send **Go here / Eat / Drink / Home / Social**. A directive is a high-priority request the bear can refuse (too hungry, thirsty, tired, hurt, courting or simply unwilling); a starving bear abandons it to eat. Accepted and refused commands show a nod/“no” emote and a status line, up to three queue for 45 seconds, and the queue survives save/load. **Follow** remains deferred until a dedicated target model lands.
- **Phase 8c ✅ — possession** — select a bear and press **V** (or **Control**), including a sleeping bear: control wakes it and hands over movement. WASD/arrows or the on-screen stick drive the existing hop/waddle cycle, Space hops, and **V**/**Esc** exits. The other bears keep simulating, the possessed bear's needs still tick, and the follow camera stays above ground and inside the arena. **C** switches left click between Grab and Select so you can still throw bears around.
- **Menu & pause ✅ (8a follow-up)** — the page opens on a lightweight menu (Continue from the autosave, Load game, New game, How to play) and builds no 3D scene, grass or physics until you choose. `Esc` pauses; the pause menu resumes, opens Settings, or returns to the menu, which writes an autosave first. `?autostart=1` skips the menu for harnesses.
- **Queued after the simulation** — 8b bear directives the bears can refuse, 8c third-person possession, and Phase 9: a curated village placement editor, village homes/hub/naming and light jobs/shops. Phase 7 (WebGPU) is dropped; WebGL2 remains the renderer. See [ROADMAP.md](ROADMAP.md).

## Known limitations

- The field is the default playable map; the Studio remains the sandbox. Food, water, hive/health, home/sleep, social/bonds, growth/family and inherited hop pace are in place. Remaining AI/life edge cases (mid-interaction re-aim, ungrounded interaction timers, Studio `fieldInfo`, door-only visits, home-capacity overflow above 32 residents) are recorded under **Known follow-ups** in [ROADMAP.md](ROADMAP.md). Glass interior scenes are deferred until 3D model/interior authoring is available.
- Dense grass is GPU-heavy at high DPR in the headless profile; use the Meadow-detail controls or quality tiers on slower devices. No 60 fps guarantee is made from the headless run. WebGL2 is the only renderer: the WebGPU port was investigated and dropped (see the Phase 7 findings in `ROADMAP.md`).
- **Individual graphics controls:** Settings includes collapsible Display & shadows, Grass & tree LOD, Post-processing detail, God rays and Environment sections. Adjust tier/shadow resolution, foliage shadows, LOD distances/density, bloom/threshold, exposure, AO, SMAA, DoF strength, ray colour/density/range/samples/resolution/sharpening, wind and the clock. Values apply live and persist locally; edits select Custom, presets restore their starting defaults, and section/reset-all buttons are provided. Expensive options are marked ⚠. These are graphics controls, not physics tuning.
- **God rays are experimental:** enable them in Settings or with `?godrays=good`; foliage shadows are available in Settings or through `?foliageShadows=1`. Rays require Full effects, tier 1 or 2 and directional shadows. Neither option is on by default. Visible-ray costs and measurement limitations are recorded in `PERFORMANCE.md`; invisible rays skip their work and release their unused composer depth attachments.
- **MSN parity is still partial.** Glass is a skinned GLB with authored clips plus a rigid Box3D sphere proxy; it is not a 24-body soft body. The Studio prototype remains single-instance, while Meadow Glass uses the `src/glass.js` adapter for hover movement, lower-rate needs, daytime shelter, bonds, stage growth, pregnancy/birth, roster and save/load. Gummy is a 24-body Metaball/Box3D soft body with grab/throw, Studio possession, two Meadow residents, shared AI needs/navigation, growth and cross-species reproduction. Child species is chosen randomly from the viable parents; Glass children use the existing GLB with a parent-blended colour, and Bear/Gummy children can inherit the glass material. Custom hybrid bodies remain deferred while Blender MCP testing/authoring continues. The **MSN** cast filter hides bears visually but keeps their state and simulation; it is not a population edit. The Glass look is reflective and refractive but not a true mirror: it uses environment reflections, not a planar reflection probe. The buried arm surfaces inside the torso remain visible through the glass because the mesh is not clipped.
- **Full effects is deliberately opt-in:** GTAO, the depth prepass for god rays, real shadow maps and optional DOF are the expensive pieces, so Soft is the desktop default and Off is the low-width default; the quality governor can fall back automatically. High tiers use 2048/1024 sun/moon shadow maps, while quality 3 keeps the cheap blob shadows. The graphics presets are convenience bundles, not a 40-bear performance guarantee; the 6b-3 profile is still the authority. The post stack tone-maps sky/cloud materials that bypass ACES in the direct path, so Soft/Full have a slightly softer sky.
- The existing metaball surface remains CPU-bound; very large crowds deliberately drop resolution.
- Aero villa interiors are implied (door/light) rather than modeled walk-in rooms. The Studio lounge (interactive bar + huge Frutiger Aero TV) is the next required modelled-room pass; the reference moodboard used for it is kept locally and is not part of the repo. Glass-specific interiors are deferred until we can author the required 3D models.
- Fireflies use a deterministic swarm plus four short-range point lights at night; they do not cast shadows.
- The launcher listens on the LAN by default (so phones can join). Use `python3 launch.py --localhost` on untrusted networks.
- Box3D v0.1.0 is young; the wrapper only exposes the subset this app needs.

## Credits and license

Original code and assets in this repo are released under the [MIT License](LICENSE).

Bundled third-party work:

- **[three.js](https://github.com/mrdoob/three.js)** — MIT. Loaded at runtime from the jsDelivr CDN (`three@0.186.1`), not vendored.
- **[Box3D](https://github.com/erincatto/box3d)** by Erin Catto — MIT. The prebuilt `vendor/box3d/box3d.js` / `box3d.wasm` ship with their license in [`vendor/box3d/LICENSE`](vendor/box3d/LICENSE).
- **[three-good-godrays](https://github.com/Ameobea/three-good-godrays)** by Casey Primozic — zlib licence, adapted from [n8python/goodGodRays](https://github.com/N8python/goodGodRays). The flag-gated god-ray prototype in `src/effects.js` is an altered, three/addons reimplementation of its raymarch technique, not the upstream pmndrs pass.

The `inspiration/` moodboard used during development is third-party reference material and is intentionally excluded from this repository.
