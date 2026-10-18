# Performance report — Phase 2 meadow

## Method

Measured in the actual gameplay view: headless Chrome on Apple silicon,
1440×900, **DPR 2**, six starter bears, default meadow camera. Frame time is a
forced-sync `readPixels` median, not the headless rAF interval (the compositor
caps rAF around 20–30 Hz).

## Circular-meadow re-run — current data

| State | Median frame | Draw calls | Triangles |
|---|---:|---:|---:|
| Baseline | **32.1 ms** | 565 | 3.67 M |
| Grass hidden | **25.3 ms** | 554 | 2.10 M |
| Trees hidden | 30.6 ms | 557 | 3.40 M |
| Pond/reflection hidden | 29.8 ms | 528 | 5.25 M* |
| Villas hidden | 30.3 ms | 118 | 3.59 M |
| Static shadow hidden | 32.9 ms | 564 | 3.67 M |
| Grass coverage 0.50 | 30.3 ms | 565 | 3.67 M |
| Grass draw distance 28 m | 29.5 ms | 559 | 2.84 M |
| Quality 3 / DPR 1.25 | **23.6 ms** | 565 | 3.64 M |
| Bears removed | 29.2 ms | 559 | 3.62 M |

\*Reflection render-target accounting makes the pond-hidden triangle counter
non-monotonic; the frame-time result is the useful one.

The circular-meadow pass now carries the rescaled world, detailed villas, Studio
portal house, 185k grass tufts, dirt trails, branched backdrop trees and bushes,
anime-lite water and fireflies. The **grass fill/geometry cost is still the
largest single GPU item**. Hiding the villas removes ~447 draw calls and saves
~2 ms; draw-call submission is not the primary limiting factor. DPR and grass
density are the largest levers. No 60 fps claim is made from the headless run.

The camera-distance stochastic grass thinning was removed after it produced
visible bare holes in the lawn. Distance now uses only the smooth draw-distance
fade, so every tuft contributes out to the configured draw distance. Meadow
coverage likewise shortens each tuft instead of rejecting instances; the old
per-instance test punched random holes on Balanced and Performance. This raises
far-grass vertex work relative to the old 82% removal; re-profile the default
camera and quality before treating the old grass rows as a current budget, and
use draw distance or the shorter-coverage setting if a device needs relief.

The current grass prototype uses 220k procedural card clumps (three crossed
cards, three tapered blades per card, 12 triangles per clump) by default;
`?grass=blades` keeps the 185k-tuft, 27-triangle opaque comparison. A controlled
test at 1440×900, DPR 1, quality 2, effects off and the same camera/frustum state
measured **20.6 ms** for cards and **26.5 ms** for opaque blades from six
60-frame `renderProbe` samples after discarding the first warm-up sample. These
are forced-sync headless numbers, not a refresh-rate claim, and the
default-camera/DPR-2 table above predates this prototype.

`alphaToCoverage` remains disabled pending an isolated render-target/MSAA test.
The earlier disappearing-card result did not establish causation; shader and
visibility failures also affected those runs. `renderer.antialias` and the
`Math.min(devicePixelRatio, 2)` cap are confirmed in `src/app.js`.

Hero-tree foliage moved from 38.6k to 88.7k leaf cards at the peak of the
lush-foliage pass (small-leaf procedural clusters, denser crowns, interior
filler); grow-form archetypes later brought it to 72.8k. At the same 1440×900,
DPR 1, quality 2, effects-off, tree-focused camera the 88.7k state measured
**23.0–23.8 ms** versus **19.9–20.1 ms** before (five 60-frame runs after
warm-up, ~+3.4 ms). Re-profiled on an idle machine, the current 72.8k-card
build measures **22.0–22.4 ms** with the same method versus the same
19.9–20.1 ms baseline (~+2.1 ms), so the archetype pass recovered part of the
added cost; the later trunk-collider and bush-colour fixes left it unchanged.
A mid-pass reading of 62–75 ms was discarded: the unmodified live build read the
same on a throttled machine, so only same-session comparisons are meaningful.

Pond camera probe (1440×900, DPR 1, quality 2, effects off, five 60-frame runs,
first sample discarded): **17.4–18.5 ms** before the 6b-2 water tuning and
**17.9–18.1 ms** after, so the night tint, softer foam and matte lily pads cost
nothing measurable. The probe looks across the pond from the east bank.

### 6b-3 performance pass

Method: headless Brave, 1440×900, default gameplay camera, quality 2 unless
stated, `renderProbe` (forced-sync `gl.finish`), 30-frame warm-up then five
60-frame samples with the first discarded. Two populations: a 7×6 grid of 40
bears at the centre (stress) and 40 bears spread on a spiral at 9–37 m
(gameplay-like). All values are frame times, not a refresh-rate claim.

Baseline (grid, before the grass LOD), quality 2 / Balanced effects:

| Effects | DPR 1 | DPR 1.5 |
|---|---:|---:|
| Off | 35.95 ms | 34.68 ms |
| Soft | 38.77 ms | 44.85 ms |
| Full | 38.92 ms | 44.78 ms |

Population scaling (Soft, DPR 1): 6 bears 23.18 → 20 bears 30.32 → 40 bears
38.77 ms. Cost attribution at 40 bears / Soft / DPR 1: hiding grass saved
**23.0 ms** (16.04 ms left), trees 2.6, villas 0.9, pond 2.3. CPU at 40 bears:
physics 1.25 ms + surface rebuild 5.73 ms (9.1 rebuilds/frame).

Changes:
- **Far-grass LOD:** grass chunks beyond 36 m swap to a single-card tuft with
  half the instances (hysteresis 30/36 m). Grid DPR 1 Soft fell from 38.77 to
  **34.82 ms**; DPR 1.5 from 44.85 to **42.17 ms**. The gain is smaller than
  hoped because near-field overdraw dominates the grass cost.
- **God rays disabled:** they cost ~1.9 ms and read poorly. The pass, its depth
  prepass and shader are retained unused for a future implementation.
- **Balanced profile** already draws at coverage 0.70, draw distance 40 and
  render scale 0.85.

Result at the target profile (40 spread bears, default camera, device DPR 1.5):
**30.2 ms as shipped** (render scale 0.85) and **32.3 ms with render scale
forced to 1** (31.6–32.4 typical, one 22 ms outlier) — inside the **≤33 ms**
target. Repeated DPR 1.5 spread runs at draw distance 56 varied by ~2.8 ms
(36.4 vs 39.2), so treat single readings as ±1–2 ms.

Mobile layout/touch checks were emulated (390×844, 768×1024, 844×390); the
user's real-device phone test passed in 6b-4. The **16.7 ms / 60 fps** goal
remains open; the Phase 7 WebGPU investigation (now dropped) found it is **not**
a renderer problem — see “Full-frame breakdown” below.

The 6b-4 release build adds only HUD/DOM (mobile sheets), screenshots and
documentation; it does not change these frame times.

### Full-frame breakdown — 40 bears, Balanced (Oct 2026)

Method: headless Brave (Chromium 155), one tab, 1440×900 CSS at device DPR 1.5,
shipped **Balanced** profile (tier 2, render scale 0.85, Soft effects, nature
0.75/0.95/0.70/40 m), day look, default camera, adaptive quality off, AI off,
physics frozen after a 1.4 s settle; 20-frame warm-up then five `renderProbe(60)`
samples, first discarded, median reported. Headless rAF was unusable for this
run (throttled callbacks, 0.5–2 s stalls), so the probe is the measurement; all
values are frame times, not a refresh-rate claim. Sample spread ≤0.7 ms except
where noted.

| State (40 bears unless noted) | Probe median | Δ vs Balanced |
|---|---:|---:|
| Balanced, as shipped | 31.0 ms | — |
| render scale 1.0 | 33.9 | +2.9 |
| render scale 0.7 | 27.2 | −3.8 |
| render scale 0.6 | 25.1 | −6.0 |
| effects Off | 30.5 | −0.5 |
| effects Full | 32.0 | +1.0 |
| nature low (coverage 0.35, 28 m) | 27.9 | −3.2 |
| nature full (1.0, 56 m) | 35.2 | +4.1 |
| **grass off** | **16.4** | **−14.6** |
| 6 bears instead of 40 | 22.8 | −8.2 |
| Performance combo (tier 3, effects Off, nature low), 6 bears | 18.0 | −13.0 |
| Performance combo, 40 bears | 25.5 | −5.5 |

Attribution: **grass is ≈47% of the Balanced 40-bear frame and is fill-bound**;
population is the next largest term (≈8 ms for the extra 34 bears); Soft effects
and real shadow maps are small (≤1 ms each at this scene). The
lowest shipped settings reach **18.0 ms at 6 bears** but **25.5 ms at 40** — the
40-bear 60 fps target needs grass-fill and per-bear work, not a renderer swap.

GPU selection of the actual grass (real placement, matrices, colours, LOD and the
production GLSL reused via `onBeforeCompile`; WebGPU compute select → readback →
WebGL replay, 3 views) matched the CPU reference exactly (0 missing, 0 extra) and
rendered **0 changed pixels of 2,916,000**; it reduced the grass-only pass from
12.15 to 10.77 ms at the default view, i.e. **≈1.3 ms (≈10%) net of ~0.13 ms
compute** — real but an order below the 14.6 ms fill term it does not address.

The previous post-polish run (29.5 ms baseline / 558 calls / 2.43 M triangles)
and the original supplied 37.1 ms baseline are retained below as historical
comparisons; they describe earlier scene states, not the current disc.

CPU with 21 bears in the current build: **0.90 ms physics + 7.46 ms surface ≈
8.36 ms/frame** at the live update rate (`perf_20`, gated). Forcing a surface
rebuild every frame raises the surface cost to 7.03 ms (7.80 ms total), which is
the worst-case ceiling for this crowd size.

## Previous post-polish reference

This was the sign-off profile before the circular-meadow pass. It is retained
as a historical comparison only.

| State | Median frame | Draw calls | Triangles |
|---|---:|---:|---:|
| Baseline | **29.5 ms** | 558 | 2.43 M |
| Grass hidden | **22.5 ms** | 549 | 1.15 M |
| Trees hidden | 27.4 ms | 550 | 2.16 M |
| Pond/reflection hidden | 27.1 ms | 520 | 3.73 M* |
| Villas hidden | 25.4 ms | 111 | 2.35 M |
| Quality 3 / DPR 1.25 | **20.1 ms** | 558 | 2.40 M |

## Earlier Phase 2 reference (pre-polish)

These measurements were supplied for the earlier Phase 2 build and are retained
for comparison; the current sign-off data above should be used for 6b-3
planning.

| State | Frame time | Draw calls | Triangles |
|---|---:|---:|---:|
| Baseline | **37.1 ms** | 321 | 2.12 M |
| Grass hidden | **20.0 ms** | 312 | 0.84 M |
| Trees hidden | 35.1 ms | 313 | 1.85 M |
| Pond/reflection hidden | 35.1 ms | 314 | — |
| Villas hidden | 34.9 ms | 113 | 2.07 M |
| Static shadow hidden | 37.3 ms | 320 | 2.12 M |
| Grass coverage 0.50 | 31.6 ms | 321 | 2.12 M |
| Grass draw distance 28 m | 32.0 ms | 316 | 1.41 M |
| DPR 1.25 | **22.2 ms** | 321 | 2.09 M |

CPU with 21 bears in that run: **0.82 ms physics + 6.76 ms surface ≈
7.58 ms/frame**.

## Phase 3a AI / food spot check

Phase 3a adds one 5 Hz state-machine update per bear, 210 food sources with
claims and respawn timers, 16 pond drinking approaches and directional hop
impulses. In the headless QA runs the AI update itself measured **0.007–0.045 ms**
per update for six bears; food timers update in a 0.2 s bucket rather than every
frame. A 20-bear stress run reached 7 unique food claims, 23 consumed sources,
and **0.052 ms** AI update time with no NaN/stuck positions. Hop arcs use the
existing Box3D velocity and contact path, so this is not a new per-frame render
cost. The full frame profile has not been re-run after the AI pass; the Phase 2
GPU profile above remains the reference until a clean measurement.

## Phase 4 social / contention spot check

Phase 4 adds slow social/affection needs, pair bonds, invite/decline timers,
door visits and claimed-food contention. A 20-bear headless stress run measured
**0.028 ms** AI update time with no NaN positions or duplicate claims; the
contention search only runs for critically hungry bears and iterates the existing
212-source list. Social marks use a fixed pool of 18 sprites, so no scene object
or material is allocated per frame. This is a CPU-only measurement; the last
stable GPU frame profile above is still the reference, and the visible sprites
have not been included in a fresh frame benchmark.

## Phase 5 life spot check

Phase 5 adds one age/pregnancy pass per active meadow bear and a stage rebuild
that is paid only when a bear crosses baby→teen→adult, not per frame. The 20-bear
AI stress run remained at **0.06–0.12 ms** per update with no NaN positions.
Stage rebuilds scale 24 body points, recreate their Box3D handles and joints, and
rebuild one metaball surface/eye set; a forced growth check showed the vertex
counts and scale increasing together without page errors. Mating/birth decisions
only scan adults and the existing food list, and emotes stay in the fixed pool.
No new full-frame GPU profile was taken in this pass.

## Effects follow-up spot check

The meadow post stack is optional and tiered: Off keeps the direct renderer,
Soft adds half-resolution bloom, SMAA, a display-space grade and the
depth-aware god-ray pass, and Full adds half-resolution GTAO contact AO with
Poisson denoise. The composer uses an SMAA path rather than a multisampled
render target; the latter was unreliable with GTAO in the headless driver.
High quality tiers also render real 2048/1024 sun/moon directional shadow maps
and hide the authored blob plane; lower tiers skip the shadow maps and keep the
blob canvas. The god-ray pass adds a half-resolution depth prepass only while a
celestial body is on screen, so the clear-sky sun/moon view pays an extra scene
render but a camera facing away does not. The optional DOF pass adds its own
depth render only when enabled.

The direct Off path now explicitly clears the compositor's render target before
drawing; without that, a headless capture after switching from composed to Off
could retain the previous frame (a QA-only symptom, fixed in the app loop and
render probe).

Scene draw calls remain in the same range as the direct path (about 571–575 at
1440×900 DPR 2 for the six-bear view), with the post/shadow passes additional.
A single forced `renderProbe` pass at quality 0 measured roughly **6.1 ms Off /
10.0 ms Soft / 45.2 ms Full** for the six-bear view; Full includes GTAO and the
real shadow map, and the headless command-timing probe is GPU-asynchronous and
noisy, so this is not a frame-rate claim. The quality-3 tier intentionally
falls back to no composer/no shadow maps. 6b-3 must profile Off/Soft/Full at
6/20/40 bears before fixing defaults.

### Graphics-profile spot check

The settings sheet adds fixed presets over the same tiers. Method: headless
Chrome, 1440×900, emulated DPR 1, six bears, same camera, preset selected and
Adaptive disabled, eight forced `renderProbe` frames with `gl.finish()`. These
are relative spot readings, not a final frame-rate claim.

| preset | render scale | effects | shadows | DPR | calls | triangles | probe ms |
|---|---:|---|---|---:|---:|---:|---:|
| Performance | 70% | Off | blob | 0.70 | 243 | 1.25 M | 5.86 |
| Balanced | 85% | Soft | blob | 0.85 | 243 | 1.25 M | 5.55 |
| Quality | 95% | Full | 1024 directional | 0.95 | 454 | 3.57 M | 11.36 |
| Ultra | 100% | Full | 2048 directional | 1.00 | 455 | 3.66 M | 14.76 |

Auto is adaptive and intentionally excluded from a fixed comparison. The
numbers show the intended gap: render scale and meadow density dominate the
low end, while Full effects, GTAO, directional shadows and canopy density
dominate Quality/Ultra. The presets remain starting points for the eventual
6/20/40-bear matrix.

## Ground-detail / water spot check

Two forced-sync runs after adding the close-up grass ground texture, its Aero
sheen, the denser water cells and the trail clearing measured **39.7–44.3 ms**
baseline and **24.8–26.6 ms** at quality 3 / DPR 1.25. The grass-off readings
were unstable (29.7–45.1 ms) in the same runs, so this environment is currently
noisy; treat the range as a monitoring result, not a final optimization claim.
The 32.1 ms circular-pass table above remains the last stable profile.

## Interpretation

- The meadow remains **fill/overdraw and grass-geometry bound**.
- The Meadow-detail controls (canopy fullness, leaf size, grass coverage and
  draw distance) and quality tiers are the first response.
- Night adds four short-range firefly point lights plus the additive swarm; the
  lights are disabled during the day. Re-profile night separately before using
  the night view as a performance reference.
- The WebGPU renderer migration is **dropped**. It was not assumed to fix
  fill-rate/overdraw on its own, and the investigation confirmed it does not.
