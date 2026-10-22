# Performance report — Phase 2 meadow

## Method

Measured in the actual gameplay view: headless Chrome on Apple silicon,
1440×900, **DPR 2**, six starter bears, default meadow camera. Frame time is a
forced-sync `readPixels` median, not the headless rAF interval (the compositor
caps rAF around 20–30 Hz).

## Unified family/Glass profile — Phase F (Oct 2026)

### Hosted behavior-test rendering comparison — 2026-10-22

Revision `d88631b391548c21fc1be63bd189b57bb49feda0`, manual workflow
[39831909017](https://github.com/Hydraxon91/zummi-gummi/actions/runs/39831909017).
Seven existing nonvisual social/gifting scenarios, three paired samples each,
same revision and runner within each pair, sequential fresh browser processes
and profiles. Sample 2 reverses normal/opaque order. Both modes use the existing
900×600 low-quality profile, `FAST=1`, `STALL_DIAGNOSTICS=1`, unchanged checks and
the same bounded startup retry. All 42 reports identify ANGLE Vulkan SwiftShader
(Subzero). `testRender=opaque` changes the scene material override, not geometry
or physics, and does not cover all custom rendering paths.

| Measure | Normal | Opaque |
|---|---:|---:|
| Executions passing after allowed boot recovery | 21/21 | 21/21 |
| Executions needing a second boot attempt | 3 | 0 |
| Median execution wall time | 167 s | 34 s |
| Execution wall-time range | 93–281 s | 25–67 s |
| Sum of execution wall times | 3665 s | 747 s |
| Median boot time, including failed-attempt time | 33.119 s | 9.510 s |

Wall times are shell elapsed seconds around each whole scenario execution,
including browser startup, boot recovery, readiness, assertions and cleanup;
runner setup and artifact upload are excluded. Sums are execution seconds, not
overall workflow duration or billed runner minutes. Boot times are retained
`bootAttempts[].elapsedMs`, including launch/connect and boot polling. This is a
startup/test-throughput comparison, not a frame-time or FPS benchmark. Debugger
instrumentation is enabled equally in both lanes. No warm-up samples were
discarded: cold startup and its failures are the target. Normal required CI on
the same SHA separately failed gift-persistence boot twice (run 39831895521).
The 21 opaque samples support further use for nonvisual testing but cannot
establish zero flakiness or exact state parity. Keep this dated result as history;
future samples must name their revision, backend, scenario set and instrumentation
rather than silently replacing it. Earlier frame-time tables below are separate
measurements and are retained unchanged.

### Unified frame-time measurements

Method: `node scripts/perf-profile.mjs` (headless Chrome, 1440×900, **DPR 1**,
quality 2, effects off, adaptive off, day look, the current 8 soft-body actors +
2 Glass, six simulated seconds to settle family/Glass state, then frozen AI and
camera). Seven 60-frame `renderProbe` samples; the first two are discarded for
GPU ramp, and the median of the last five is reported. This is a forced-sync
`gl.finish` frame time via `renderProbe`, not a refresh-rate claim. The low-quality row
uses the CI profile:
900×600, DPR 0.6, quality 3, effects off, performance nature (coverage .45,
draw distance 28).

| State | Median frame | Range | Draw calls | Triangles |
|---|---:|---:|---:|---:|
| Baseline | **22.0–22.7 ms** | 22.06–22.82 | 677–680 | 2.52 M |
| Grass coverage 1.0 → 0.35 | 21.5–22.3 ms | 21.39–22.31 | 677 | 2.52 M |
| Grass draw distance 56 → 28 m | **18.4–19.2 ms** | 18.40–19.24 | 653 | 2.34 M |
| Baseline repeat | 22.0–22.7 ms | 21.88–22.82 | 671 | 2.52 M |
| Low-quality CI baseline (900×600 / DPR 0.6) | **10.9–11.3 ms** | 10.77–12.03 | 653–655 | 2.32 M |

- **Grass draw distance is still the largest single lever.** Dropping 56 → 28 m
  saves **~3.5–3.7 ms** and removes ~0.18 M triangles / 24 draw calls.
- **Shortening grass coverage is not a geometry reduction.** 1.0 → 0.35 saves
  only **~0.4–0.6 ms**; draw calls and triangle count are essentially unchanged
  because coverage shortens blades instead of rejecting instances. Use draw
  distance, DPR or quality for relief, not coverage.
- **The low-quality CI profile is ~11 ms** and already sits at the minimum
  draw-distance and near-minimum coverage controls, so those sliders no longer
  move it. Further relief there has to come from DPR, quality tier or other
  scene costs.
- **AI is not the bottleneck:** 0.017–0.085 ms per update across the 10 actors,
  well under the 0.5 ms budget.
- A separate run measured 24.8–25.3 ms while `duetexpertd` and WindowServer were
  active; it was discarded. The same-run draw-distance delta stayed ~3.3 ms, so
  only same-session comparisons are meaningful on a contended machine.

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

### Tree, bush and backdrop culling + far-leaf LOD (Oct 2026)

Method: headless Brave, 1440×900 at DPR 1.5, Balanced profile, effects Soft,
render scale .85, 40 spread bears, camera frozen, five 60-frame `renderProbe`
samples after a discarded warm-up. Single readings on this machine varied by
±2–3 ms (one run produced impossible per-toggle values), so the same-run
cull-on/cull-off pair is the evidence; the table is not a refresh-rate claim.

| state | draw calls | triangles | median |
|---|---:|---:|---:|
| before (whole-ring batches) | 601 | 3.51 M | ~31.7 ms |
| sector split, culling off | 753–809 | 3.51 M | 32.4–36.1 ms |
| sector split, culling on | 660–677 | 2.39–2.45 M | 28.0–29.4 ms |
| mobile 390×844, culling on | 397 | — | — |

- Hero trees are now one bark mesh, one leaf batch and one fruit batch per tree,
  each with a padded bounding sphere and `frustumCulled`. Bushes use eight
  angular sectors; backdrop canopy, hedges, hill grass and grass cards use eight.
  Backdrop trunks, leaves, flowers and rocks stay whole-ring because sectoring
  them cost more submissions than it saved.
- The leaf shader thins cards to 60% beyond 42–68 m on top of the Canopy hash,
  so far crowns keep their silhouette with fewer alpha-tested fragments.
- Culling removes ~1.05–1.12 M triangles (~30%) and ~90–130 draw calls at the
  default camera. Net of the extra sector submissions the same-run pair is
  ~3–8 ms; against the pre-change row the default camera is ~2–3 ms (~7–10%)
  faster. Sectoring **without** culling is slower than the original whole-ring
  batches, so the split is only justified together with per-pass frustum culling.
- Hero leaves still cost ~2.3 ms at this camera: the LOD reduces far-field fill,
  not the near canopy.

### God-ray prototype — `?godrays=good` (Oct 2026)

The prototype can now also be enabled and configured in Settings; defaults remain
off. Individual sample/resolution/density/colour controls intentionally permit
quality/cost tradeoffs, but those manual changes are not claimed as lossless
optimizations.

**Lossless-work audit (settings follow-up, Oct 2026):**

- The renderer skips raymarch, shadow-depth blit and composite when the existing
  shader's sun-visibility multiplier is zero (or ray strength is zero).
  `rayDepthAllocated` reports lazy allocation of the two ping-pong depth textures;
  they are absent when rays are disabled, tier-ineligible or invisible, and
  allocated again for visible rays. At 2160×1350 their nominal 32-bit payload is
  ~22.2 MiB combined (an estimate, not a GPU memory measurement).
- Live-render-path hidden-rays vs rays-off comparison: **0 changed pixels** at
  2160×1350; no GL errors. Stabilized forced-sync samples were ~33.7–34.8 ms
  in both states. This confirms no hidden-ray surcharge in that test, not a
  measured speedup over the old implementation. A separate two-composer A/B
  failed pixel parity and produced inconsistent first timings; those results
  are rejected, not used as performance evidence.
- Grass experiment: moved root-constant colour-patch trigonometry from fragment
  to vertex shader in a temporary material. The trial changed 84 pixels (maximum
  channel delta 119) and timings overlapped (~44.5–45.2 ms vs ~43.1–45.1 ms,
  excluding initial warm-up). **Rejected:** neither fidelity parity nor a
  repeatable improvement was established; production grass math/cards unchanged.
- Bear profile, 40 bears, three forced 20-frame runs: physics ~1.2–1.3 ms/frame;
  surface work ~6.8–8.1 ms/frame; field scatter ~0.23–0.26 ms/build versus nets
  ~1.44–1.98 ms/build. Forced rebuilds remain budget-limited (3.3–4/frame).
  A scratch capsule-row invariant-hoisting experiment matched all 120 field
  cases exactly, but seven alternating Node rounds measured 34.34 vs 34.39 ms
  for the batch. **Rejected as no win.** No bear mesh output, rebuilding schedule,
  grid quality or solver changes were made. This microbenchmark is not a browser
  frame-time result.

- **Flag-gated and off by default.** `?godrays=good` (or `setGodrays('good')`) swaps in a raymarched pass on the Full tier only. No dependency or three.js change; the technique is reimplemented on `three/addons` `ShaderPass`/`FullScreenQuad` from `three-good-godrays` (Casey Primozic, zlib licence, adapted from n8python/goodGodRays).
- **How it works:** quarter-resolution screen-space raymarch against the sun/moon shadow-map depth and the composer's scene depth. On r186 the PCF shadow map uses a comparison depth texture, so the pass blits it to a comparison-free depth texture each frame before sampling raw depth.
- **Cost:** 1440×900 / DPR 1.5, Full tier, 40 spread bears, three alternating rounds of five 60-frame probes with the first sample of each discarded (n=12 median):
  - default camera, foliage shadows off: **45.79 → 47.72 ms (+1.93 ms)**;
  - tree view, foliage shadows off: **46.38 → 48.82 ms (+2.44 ms)**;
  - tree view, `?foliageShadows=1`: **44.39 → 47.04 ms (+2.65 ms)**, with one 55.25 ms outlier.
  The foliage-shadow caster cost was not isolated; the off baselines differ by ~2 ms between runs, which is machine variance.
- **Foliage shadows:** `?foliageShadows=1` gives hero leaf cards and bushes alpha-tested depth materials so canopies occlude the raymarch instead of casting card rectangles. Experimental only; it makes the whole meadow shadow-casting.
- **Look:** beams radiate from the sun through canopy and hill silhouettes; the default camera gets soft shafts from behind the hill. This is a stylised screen-space effect, not a participating medium: edges are soft at quarter res, and the canopy centre can show a bloom/glow artifact.
- **Status:** prototype only; nothing is enabled without the flag, and the legacy radial pass remains off.

**Canopy-edge tuning follow-up:** the ray buffer now carries
endpoint view depth in alpha. The full-resolution composite reconstructs scene
depth and blends four neighboring ray samples only when their depths match.
This rejects bright background samples across foreground leaf edges, sharpening
the quarter-resolution upsample without increasing raymarch resolution/steps.
Matched-camera rays-off and bloom-off captures also show that broad sky shafts
already exist without this pass; bloom contributes to the central canopy glow.
The edge correction does not establish that all remaining glow is eliminated.

Recheck: 40 bears, 1440×900/DPR 1.5, Full/quality 1, experimental foliage
shadows, three alternating rounds of five 60-frame probes, first discarded:
**46.15 → 47.82 ms (+1.67 ms)** (off range 45.90–46.69; on 47.20–48.37,
n=12 each). This is a fresh on/off cost measurement, not evidence of a speedup
over the earlier run. Inspected desktop dawn, tree close-up at 08:00 and
390×844 emulated-mobile captures; Soft disables the prototype. Browser errors
and reported shader diagnostics were empty.

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

## Step 5 behavior modules

The default Meadow behavior engine is now the module host in
`src/behaviors/engine.js`; the legacy engine remains selectable for parity. This
does not add a render pass or change the actor/body count. Config is resolved
once per actor and cached by config version, module state ownership is a
registry lookup, and the top-level active-state suppression set is built when
modules register rather than scanned from a per-tick string list. No per-tick
config merge or per-actor module allocation was added.

No fresh frame profile was taken specifically for this change. Compare behavior
runs with `node scripts/behavior-parity.mjs` (correctness/RNG), and re-profile
the whole Meadow with `scripts/perf-profile.mjs` before claiming a frame-time
win or regression; the Phase 2/6 GPU numbers above remain the reference until
then.

## Studio race prototype spot check

The MSN Buddy is a Studio-only GLB prototype, loaded on the first Studio entry
and hidden without drawing in the Meadow. Method: headless Brave, 1440×900,
DPR 1, six bears, quality 1, direct Studio renderer, twenty-frame
`renderProbe` with the prototype visible versus hidden. This is a relative
spot reading, not a frame-rate claim.

| Studio state | calls | triangles | probe ms |
|---|---:|---:|---:|
| prototype visible | 60 | 430,904 | 0.51 |
| prototype hidden | 53 | 420,870 | 0.36 |

The three skinned meshes, 5,744 GLB triangles and one painted contact shadow are
the added work; the authored material is double-sided, so visible triangle
submission is higher than the raw GLB count. The model only loads in the Studio.
A separate FrontSide trial was inspected but not adopted: the authored
double-sided material remains the fidelity baseline. The animate loop updates one
`AnimationMixer` only while the prototype is visible.

### Glass reflection spot check

The default Glass material uses transmission 1, roughness 0.05, clearcoat 1 and
environment intensity 1.6. A live Studio run measured **0.83 ms visible / 0.46 ms
hidden** with `renderProbe(20)`; the `?race=alpha` opacity path measured **0.85 /
0.76 ms** in a separate run. These are single-run, GPU-asynchronous spot readings
with overlapping variability, so they do not establish a glass cost or a
regression. Transmission and clearcoat are additional rendering features, not
free replacements; profile at the target quality tiers before making a
tier/fallback decision. The reflective coat uses the studio environment map, not
a planar reflection probe.

### Glass Box3D spot check

Glass adds one rigid Box3D sphere (radius 0.62 m, mass 2.4) that is anchored to
the model while idle and switched to dynamic/spring-grabbed while dragging. It
is collision-stepped with the existing world rather than a second physics world.
The proxy is intentionally one sphere, not the bears' 24-body rig, because Glass
must stay rigid. A full frame-time comparison for Glass grabbing versus idle has
not been run.

### Gummy first-slice spot check

The Gummy MSN is a seventh Studio actor with 24 Box3D bodies and a measured
surface of about 2.1k–3.1k vertices across rebuild frames. It shares the
existing per-frame surface budget and solver step rather than adding a second
physics world. The six-bear Meadow regression still reports six bears and no
NaN positions. A full 6-bear + Gummy vs 6-bear frame profile has not been run
yet, so no frame-time claim is made for this slice.

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

## Dynamic Glass and local-avoidance follow-up (contended, discarded)

Method: `scripts/perf-profile.mjs`, same 8-soft-body + 2-Glass Meadow, camera,
DPR and effects settings as the Phase F profile. The same session was used for
both rows. **This run is discarded**: Blender was running on the machine and
competing for GPU/CPU, so the values are not a clean baseline and must not be
compared with the 22.0–22.7 ms Phase F result or used to change quality defaults.

| profile | baseline | baseline repeat | grass-distance minimum | AI |
|---|---:|---:|---:|---:|
| 1440×900, DPR 1, quality 2, effects off | 26.37 ms (contended) | 25.93 ms (contended) | 21.73 ms (contended) | 0.048 ms |
| 900×600, DPR 0.6, quality 3 (CI graphics) | 12.55 ms (contended) | 12.55 ms (contended) | 12.40 ms (contended) | 0.068 ms |

The AI figures are still useful as an order-of-magnitude check for the new
avoidance/Glass steering (under 0.07 ms reported), but the frame times are not.
Keep the earlier **22.0–22.7 ms** clean Phase F reading as the last valid
reference. Re-profile in a fresh session with Blender and other GPU workloads
closed before making a performance claim or changing defaults.

## Mood gate (contended, no performance claim)

Method: `scripts/perf-profile.mjs`, same seed/roster/camera as Phase F, mood
enabled only for the second run. The machine was **not quiet**: load averaged
3–10 on 8 cores with WindowServer, the agent process, Safari, Spotify and Blender
active. These rows are matched within the pass but are not a quiet baseline.

| Feature | Baseline median | Repeat median | AI |
|---|---:|---:|---:|
| Mood off | 24.14 ms | 25.66 ms | 0.072 ms |
| Mood on | 24.54 ms | 24.19 ms | 0.084 ms |

The frame-time ordering reverses between baseline and repeat, so mood has **no
demonstrated frame-time cost or win**. The AI delta is about 0.012 ms in this
sample.

Warm matched follow-up (2026-10-21, after Blender was closed): the machine still
carried background load from the agent and desktop apps (1-minute average 2.2–3.2
at run start, 1.8 at the end), so this is not a zero-load claim. The first run had
a cold-start penalty; the warm pair below uses matched baseline/repeat conditions:

| Warm run | Baseline median | Range | Repeat median |
|---|---:|---:|---:|
| Mood off | 22.53 ms | 22.41–22.86 | 22.59 ms |
| Mood on | 22.51 ms | 22.46–22.55 | 22.45 ms |

The difference is **0.14 ms at the repeat** with overlapping ranges, so the clean
result agrees with the contended pass: no measurable mood frame-time cost. AI
readings varied from 0.036 to 0.135 ms across runs and are not a stable signal at
this scale.

### Mourning cost (contended, no performance claim)

Method: `node scripts/mourning-profile.mjs`, 40 adult Bear actors, mood and
mourning enabled, 200 engine ticks at 20 Hz (one sim-hour) per batch, five
batches per row; medians reported. Pure rows call `mourningMood` plus
`pruneMourning` once per actor and pass. The machine was **not quiet**: the
1-minute load average was 6.88 before and after (8-core host) with opencode,
WindowServer and Terminal active. These are matched within the pass but not a
quiet or frame-time baseline; the engine rows exclude physics and rendering.

| Work | Per actor pass | Per sim-hour (40 actors) | Per tick |
|---|---:|---:|---:|
| Pure mourning pass, no records | 0.031 µs | — | — |
| Pure mourning pass, 1 record | 0.925 µs | — | — |
| Pure mourning pass, 8 records | 6.19 µs | — | — |
| Engine, no records | — | 7.55 ms | 0.038 ms |
| Engine, 1 record each | — | 12.57 ms | 0.063 ms |
| Engine, 8 records each (record cap) | — | 38.74 ms | 0.194 ms |

The worst supported case (all 40 actors at the 8-record cap) adds about
**31 ms per simulated hour**, or **0.156 ms per 20 Hz tick**, in the behavior
layer. That is well below a rendered frame, but it is not an FPS claim and the
contended host makes small deltas unreliable.

Natural-needs distribution, 20 days × 3 seeds per race, 1 s samples, 86,400
samples and 18 actor-runs per race:

| Race | Mean | p10 | p50 | p90 | Range |
|---|---:|---:|---:|---:|---:|
| Bear | −0.143 | −0.385 | −0.110 | +0.053 | −0.634…+0.184 |
| Gummy | −0.143 | −0.385 | −0.110 | +0.053 | −0.634…+0.184 |
| Glass | +0.036 | −0.030 | +0.050 | +0.086 | −0.230…+0.230 |

The bear/Gummy identity is expected from their shared profile. Glass sits
slightly positive because its needs/bond sources differ. The founder cohort and
the 600 s app day are part of this fixture; these are not population-wide
long-session percentiles.

## Interpretation

### Parity tooling (2026-10-21)

Follow-up: a full-length Glass profile showed playdate projection 15,927 samples,
snapshot serialization 15,393, bond projection 13,906 and GC 1,528. A direct-field
comparator now avoids actor snapshot allocation, with an unsorted exact key-set
comparison for canonical numeric relationship keys and the original normalization
for unusual keys. Sequential 20-day Glass/seed-1 runs measured JSON 85,149 ms,
direct 55,682 ms; a third run compared both methods at every tick and passed with
462,932 RNG draws in each engine. Mutation tests cover scalar and nested groups.
The direct 15-case long matrix (`--comparator exact --jobs 2`) passed in 341,361 ms
versus the earlier JSON matrix's 427,097 ms (about 20% less elapsed time; separate
runs, not a controlled end-to-end speedup guarantee). Glass jobs now dispatch
first, and nonverbose runs count transitions without retaining full logs. JSON
remains the default/reference; direct comparison is explicitly selected. Persistent
workers and three-worker benchmarking have not been implemented/measured in this
follow-up; no speed claim is made for those proposals.

Built-in Node CPU profiling of a two-day Bear case identified snapshot
serialization/projection as the dominant sampled work: snapshot 208 samples,
playdates 107, bonds 44, step bookkeeping 32 and GC 21. A candidate structural
comparator matched JSON at each tested tick and detected injected divergence,
but measured 797 ms versus JSON 734 ms in the initial short probe; it remains
experimental. The reference JSON comparator is still the default.

Reusable transition bookkeeping removes two per-tick Map allocations without
changing hook/birth semantics. The optional worker matrix measured 7,289 ms with
one worker versus 4,180 ms with two for the same two-day × three-seed × three-race
matrix. A fresh two-worker long matrix passed all 15 cases in 427,097 ms. These
are local wall times, not a guaranteed speedup on contended machines. Resume is
per completed case with source/runtime fingerprints, explicitly non-acceptance;
fresh acceptance never loads cached results. Previous game rendering profiles
remain valid and are not superseded by these tooling measurements.

- The meadow remains **fill/overdraw and grass-geometry bound**.
- The Meadow-detail controls (canopy fullness, leaf size, grass coverage and
  draw distance) and quality tiers are the first response.
- Night adds four short-range firefly point lights plus the additive swarm; the
  lights are disabled during the day. Re-profile night separately before using
  the night view as a performance reference.
- The WebGPU renderer migration is **dropped**. It was not assumed to fix
  fill-rate/overdraw on its own, and the investigation confirmed it does not.
