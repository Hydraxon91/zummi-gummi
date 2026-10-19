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
- **Directives** — click a bear in the roster, then choose **Go here** (tap the meadow to pick a spot), **Eat**, **Drink**, **Home** or **Social**. A bear may refuse when it is hungry, thirsty, tired, hurt or courting; the panel shows why, and a starving bear abandons the request to eat. Up to three queue for 45 seconds; **×** closes the panel and leaves them running.
- **Select click / Grab click (C)** — Grab keeps the original left-drag stretch and throw. Select highlights the bear under the pointer and opens its command panel; dragging still orbits. The mode persists.
- **Take control (V)** — control the selected bear directly: WASD/arrows or the on-screen stick move, Space hops, V or Esc exits. The AI is suspended for that bear only, needs keep ticking, and the third-person camera follows without clipping the ground or arena edge.
- **Move cannon**: drag the cannon itself, or press **Move cannon** and click/tap the table. The footprint ring turns green/red for a valid spot; `Esc` cancels and restores the previous position. The position persists for each map.
- **Hide UI**: press `U` or use the small top-right UI button to hide every gameplay overlay (including on phones); an active performance overlay stays visible. The button remains as the restore control and the choice is remembered.
- **Autonomous bears**: meadow bears wander locally, occasionally take a longer cross-meadow trip, hop toward food, nibble flowers or fallen fruit with a chew motion, and lap at the pond with a separate drinking motion. Very hungry bears may raid a beehive, risking a sting; health and energy recover over time, faster while resting. At their own bedtime (20:00–22:30) or when hurt/tired, they return to their villa and sleep until their own wake time (05:00–07:00), and the roster shows their health and sleeping status. Each bear has its own hop-speed range. Grabbing or throwing one interrupts its hop/task; it resumes when it lands and settles. The Studio remains a hands-on sandbox with needs paused.
- **AI Debug**: press `G` or click **AI** to open the meadow-only inspector. Select a bear, set hunger/thirst, force a valid state, and show that bear’s planned route and target in the world. The readout also shows health, energy, home and the bear’s own hop-pace range. Eat/drink fall back to the matching seek state when no target exists.
- **Wind**: use the Wind slider in the meadow time panel to set strength. Direction, strength and gust randomize each session and the direction slowly veers; grass, trees, water and the distant turbines follow the same live wind. The pond’s wave normals, edge wavelets and anime cell drift all travel downwind and scale with wind speed; the webbing fades only near the shallow shoreline, and broken foam washes onto the windward bank. **Meadow detail** exposes canopy fullness, leaf size, grass coverage, grass draw distance, the **Off / Soft / Full** Effects selector and a persisted **Depth of field** toggle for balancing the look against frame cost. Lower grass coverage shortens the tufts rather than randomly deleting them, so the carpet never develops bare holes.
- **Graphics profiles / Settings**: the gear button opens a live settings sheet with **Auto / Performance / Balanced / Quality / Ultra** profiles, adaptive quality, render resolution, effects, depth of field, **Toon shading** and meadow detail. The toon toggle swaps compatible standard materials to **MeshToonMaterial**; custom water, sky and particle shaders stay on their own programs. Depth of field focuses on a nearby object under the view centre and softens only the background: full strength within 5 m, fading to sharp by 10 m, so fully zoomed-out overviews stay clear. Presets set a starting bundle; changing any control switches the profile to Custom. The choices persist locally.
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
src/wind.js                shared world-space wind uniforms + GLSL
src/trees.js               procedural merged trees, foliage/fruit/hive batches
src/bushes.js              branched meadow shrubs + canopy-centre foliage shading
src/homes.js               rounded white/aqua Aero villa visual builder
src/studiohouse.js         large field-side Studio portal house + return door
src/backdrop.js            rolling background hills, tree belts and hill detail
src/horizon.js             distant Aero skyline + three-blade wind turbines
src/sky.js                 day/night sky, procedural clouds, moon, aurora, mist
src/box3d.js               JS side of the physics bridge (batched calls)
scripts/box3d_wrapper.c    C wrapper: world, spheres, destroyable statics, spring joints
scripts/build-box3d.sh     reproducible Box3D + wrapper wasm build
scripts/smoke.mjs          served-build smoke test (page, modules, wasm load)
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

Phase 3a/3b debug checks drive `__gummy.ai()` / `__gummy.food()` / `__gummy.foodSources()`, plus `setHunger`, `setThirst`, `setHealth`, `setEnergy`, `setAI`, `setBearState`, `setTime`, `aiPlan` and `aiRoute`. They cover hop travel, heading/face alignment, upright hop tilt and airtime, local and long wander legs, food claims and unique claims, eating, drinking, respawn, hive risk/sting and depletion, health/woozy recovery, night home return/sleep/wake, per-bear pace ranges, grab/throw interruption and resume, Studio AI suppression, map-switch cleanup, and NaN/bounds. Phase 4 adds `setSocial`, `setAffection`, `setBond`, `forceSocial`, `forceInvite`, `forceVisit`, `forceConflict` and `homes()` to the same API; the checks cover natural company seeking, invite acceptance, mutual social, decline, bond gain, door visits, contested-food shoving and resolution, partner interruption, and social/bond persistence across a map switch. Phase 5 adds `life()`, `setAge`, `setStage`, `setPregnant`, `forceMate`, `forceBirth` and `setCeiling`; the checks cover baby→teen→adult growth with body/surface/eye scale rebuilds, natural and forced courtship, pregnancy, births under cap/food pressure, parent/flavor/pace inheritance, baby following, family homes and life-state persistence through a map switch. The optional effects stack adds `setEffects`, `effectsState`, `setEffectsBloom`, `setEffectsExposure` and `setEffectsDof`; `shadows()` reports the active renderer/quality shadow state. The settings pass adds `settings()`, `setProfile()`, `setAdaptive()`, `setRenderScale()` and `resetSettings()`. Checks cover Off/Soft/Full selection, persistence, day and night captures, Studio direct rendering, transmission/reflection parity, GTAO high-tier rendering, real sun/moon maps with blob fallback, depth-aware canopy/object god rays, the DOF toggle, all five graphics presets, render-scale/quality persistence, settings-screen desktop/mobile layouts and the absence of page errors. The AI debug panel was checked at desktop and 390×844 with a selected-bear route line, target marker, social/affection controls, live life readout and Studio-hidden controls. The AI update itself measured well under the <0.5 ms budget.

## Roadmap status

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
- **Phase 8c ✅ — possession** — select a bear and press **V** (or **Control**): WASD/arrows or the on-screen stick drive the existing hop/waddle cycle, Space hops, and **V**/**Esc** exits. The other bears keep simulating, the possessed bear's needs still tick, and the follow camera stays above ground and inside the arena. **C** switches left click between Grab and Select so you can still throw bears around.
- **Menu & pause ✅ (8a follow-up)** — the page opens on a lightweight menu (Continue from the autosave, Load game, New game, How to play) and builds no 3D scene, grass or physics until you choose. `Esc` pauses; the pause menu resumes, opens Settings, or returns to the menu, which writes an autosave first. `?autostart=1` skips the menu for harnesses.
- **Queued after the simulation** — 8b bear directives the bears can refuse, 8c third-person possession, and Phase 9: a curated village placement editor, village homes/hub/naming and light jobs/shops. Phase 7 (WebGPU) is dropped; WebGL2 remains the renderer. See [ROADMAP.md](ROADMAP.md).

## Known limitations

- The field is the default playable map; the Studio remains the sandbox. Food, water, hive/health, home/sleep, social/bonds, growth/family and inherited hop pace are in place. Remaining AI/life edge cases (mid-interaction re-aim, ungrounded interaction timers, Studio `fieldInfo`, door-only visits/interiors, home-capacity overflow above 32 residents) are recorded under **Known follow-ups** in [ROADMAP.md](ROADMAP.md).
- Dense grass is GPU-heavy at high DPR in the headless profile; use the Meadow-detail controls or quality tiers on slower devices. No 60 fps guarantee is made from the headless run. WebGL2 is the only renderer: the WebGPU port was investigated and dropped (see the Phase 7 findings in `ROADMAP.md`).
- **God rays are experimental:** `?godrays=good` enables a flag-gated raymarched prototype on the Full effects tier, and `?foliageShadows=1` lets canopies occlude it. Neither is on by default; the effect costs about **+1.9–2.7 ms** at 40 bears / 1440×900 and is documented in `PERFORMANCE.md`.
- **Full effects is deliberately opt-in:** GTAO, the depth prepass for god rays, real shadow maps and optional DOF are the expensive pieces, so Soft is the desktop default and Off is the low-width default; the quality governor can fall back automatically. High tiers use 2048/1024 sun/moon shadow maps, while quality 3 keeps the cheap blob shadows. The graphics presets are convenience bundles, not a 40-bear performance guarantee; the 6b-3 profile is still the authority. The post stack tone-maps sky/cloud materials that bypass ACES in the direct path, so Soft/Full have a slightly softer sky.
- The existing metaball surface remains CPU-bound; very large crowds deliberately drop resolution.
- Aero villa interiors are implied (door/light) rather than modeled walk-in rooms. The Studio lounge (interactive bar + huge Frutiger Aero TV) is the next required modelled-room pass; the reference moodboard used for it is kept locally and is not part of the repo.
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
