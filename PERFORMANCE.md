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
portal house, 88k grass tufts, dirt trails, branched backdrop trees and bushes,
anime-lite water and fireflies. The **grass fill/geometry cost is still the
largest single GPU item**. Hiding the villas removes ~447 draw calls and saves
~2 ms; draw-call submission is not the primary limiting factor. DPR and grass
density are the largest levers. No 60 fps claim is made from the headless run.

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
for comparison; the current sign-off data above should be used for Phase 6b
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
- A WebGPU migration is intentionally deferred to Phase 7. It is not assumed to
  fix fill-rate/overdraw by itself.
