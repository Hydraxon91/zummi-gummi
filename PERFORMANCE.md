# Performance report — Phase 2 meadow

## Method

Measured in the actual gameplay view: headless Chrome on Apple silicon,
1440×900, **DPR 2**, six starter bears, default meadow camera. Frame time is a
forced-sync `readPixels` median, not the headless rAF interval (the compositor
caps rAF around 20–30 Hz).

## Post-polish re-run — current sign-off data

| State | Median frame | Draw calls | Triangles |
|---|---:|---:|---:|
| Baseline | **29.5 ms** | 558 | 2.43 M |
| Grass hidden | **22.5 ms** | 549 | 1.15 M |
| Trees hidden | 27.4 ms | 550 | 2.16 M |
| Pond/reflection hidden | 27.1 ms | 520 | 3.73 M* |
| Villas hidden | 25.4 ms | 111 | 2.35 M |
| Static shadow hidden | 30.2 ms | 557 | 2.43 M |
| Grass coverage 0.50 | 27.7 ms | 558 | 2.43 M |
| Grass draw distance 28 m | 25.8 ms | 553 | 1.72 M |
| Quality 3 / DPR 1.25 | **20.1 ms** | 558 | 2.40 M |
| Bears removed | 27.9 ms | 552 | 2.38 M |

\*Reflection render-target accounting makes the pond-hidden triangle counter
non-monotonic; the frame-time result is the useful one.

The scene now carries the rescaled world, detailed villas, Studio portal house,
backdrop tree belts and fireflies. The **grass fill/geometry cost is still the
largest single GPU item**, but the current baseline is materially faster than
the first Phase 2 profile. Hiding the villas removes ~447 draw calls and saves
~4 ms; draw-call submission is not the primary limiting factor. DPR and grass
density are the largest levers. No 60 fps claim is made from the headless run.

CPU with 21 bears in the current build: **0.87 ms physics + 5.81 ms surface ≈
6.68 ms/frame** at the live update rate (`perf_20`, gated). Forcing a surface
rebuild every frame raises the surface cost to 7.34 ms (8.20 ms total), which is
the worst-case ceiling for this crowd size.

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

## Interpretation

- The meadow remains **fill/overdraw and grass-geometry bound**.
- The Meadow-detail controls (canopy fullness, leaf size, grass coverage and
  draw distance) and quality tiers are the first response.
- Night adds four short-range firefly point lights plus the additive swarm; the
  lights are disabled during the day. Re-profile night separately before using
  the night view as a performance reference.
- A WebGPU migration is intentionally deferred to Phase 7. It is not assumed to
  fix fill-rate/overdraw by itself.
