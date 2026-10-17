# Gummy Bears

An interactive bowl of translucent jelly bears: grab, stretch, squash, throw, pour, wobble, set off fireworks — or load one into the little glass cannon and fire it across the table. Rendered with **three.js**; soft-body physics runs on **Box3D** (erincatto/box3d) compiled to WebAssembly.

The meadow chapter is playable: a circular Bliss-style meadow with a continuous full-circle grass carpet, wandered dirt trails, rounded hero trees, branched background trees and bushes, detailed Aero villas and a large Studio portal house, an anime-lite reflective pond, a full day/night sky with clouds, aurora and fireflies, a distant skyline and wind turbines. The Studio remains available from the in-app map switch and the diegetic door. The next simulation chapters (food, AI, growth) are in [ROADMAP.md](ROADMAP.md), with selected captures in [screenshots](screenshots/).

## Launch it

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
- **Orbit** by dragging empty space, right-dragging, or two-finger dragging. **Pan** with middle-drag, shift-drag, or two-finger drag. **Zoom** with the wheel or pinch. `WASD` pan, `Q`/`E` orbit, `R` resets the camera.
- **F** fires a firework at the cursor, hold to spray, `Shift+F` fans; the EXPLODE button fires a volley. `?` opens the controls sheet.
- **L / Launch bear** arms the glass cannon. Aim with the mouse (or drag a finger) and release/click to fire a bear on a ballistic arc; `Esc` or the button cancels. The landing ring shows where it will come down.
- **Move cannon**: drag the cannon itself, or press **Move cannon** and click/tap the table. The footprint ring turns green/red for a valid spot; `Esc` cancels and restores the previous position. The position persists for each map.
- **Hide UI**: press `U` or use the small top-right UI button to hide every overlay (including on phones). The button remains as the restore control and the choice is remembered.
- **Wind**: use the Wind slider in the meadow time panel. **Meadow detail** exposes canopy fullness, leaf size, grass coverage and grass draw distance for balancing the look against frame cost.
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
src/field.js               meadow, pond, grass chunks, trails, props, nav/shadows
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

## Roadmap status

- **Phase 0 ✅** — snapshot, module split (`world.js`, `launcher.js`), per-map state, static-wall handles, per-bear life fields, tests green.
- **Phase 1 ✅** — movable cannon, placement validation, persistent position, 8-unit walls.
- **Phase 2 ✅ (current scope)** — Grass Field default with Studio switch, sky/clouds/aurora/mist, reflective anime-lite pond, detailed Aero villas and Studio portal house, circular dirt-trail meadow, full-circle grass with close-up ground texture and Aero sheen, procedural hero trees, branched backdrop trees and bushes, shared wind, Wind/Meadow-detail controls, mixed starter colony, distant skyline/wind turbines, lit night fireflies, and Hide UI. Door openings are validated at 1.646 m against a 1.375 m adult bear. Studio modelling is queued as the parallel required track in the roadmap.
- **Next** — Phase 3a: food registry/respawn, hunger, waddle locomotion and WANDER / SEEK_FOOD / EAT. Phase 6a is the reserved effects pass; Phase 7 is the opt-in WebGPU upgrade.

## Known limitations

- The field is the default playable map; the Studio remains the sandbox. The full food/AI/growth simulation is still Phase 3–5.
- Dense grass is GPU-heavy at high DPR in the headless profile; use the Meadow-detail controls or quality tiers on slower devices. No 60 fps guarantee is made from the headless run.
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

The `inspiration/` moodboard used during development is third-party reference material and is intentionally excluded from this repository.
