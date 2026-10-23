# Surface, physics and representation inventory — F1/M14

Date: 2026-10-23. Baseline: `e84a9ae` (`refactor: isolate cannon interaction math`).
Scope: F1/M14 numeric inventory and exactly one numeric surface fixture. This
pass does not move buffers, the scheduler, eyes/shadows or Box3D.

## Owner boundaries

| Boundary | Current owner | What it owns |
| --- | --- | --- |
| Numeric field kernels | `src/app.js` (`scatterSphere`, `scatterCapsule`, `samRaw`, `samBear`, `THRESH`, `MIN_R_F`) | Sphere/capsule field scatter into the shared pooled field, trilinear samples and isolevel. |
| Stable lattice | `src/surfacelattice.js` (pure) | Surface bounds from `point ± radius*scale`, radius floor, 1.13 cell ladder, 6% hysteresis, 0.9-cell fit margins, four-pass 1.15 expansion, `maxDim`/`maxCells` rejection. `buildBear` consumes it. |
| Surface nets | `src/app.js` `buildBear` inner loop | Edge crossings, one Newton step, gradient normals, quad winding, degenerate-sliver drop. |
| Eye/shadow presentation | `src/app.js` `marchSurface`, `writeEyeInstance`, `drawShadows` | Eye ray-march and instanced placement; canvas shadow blobs. |
| Geometry upload | `src/app.js` `buildBear` tail | `BufferGeometry` update ranges, draw range and bounding sphere. |
| Box3D bodies/readback | `src/box3d.js` wrapper; app `createBearBodies`/`destroyBearBodies`/`updateBearVelocities`/readback | Vendored WASM, body handles, shared float scratch buffers, batched solver bridge. |
| Scheduler/budget | `src/app.js` `updateSurfaces` | Build order (grabs, explicit need, shape deformation), 20-build cap and `SURFACE_BUDGET_MS`. |

## Load-bearing invariants

- Bear/Gummy surfaces use the 24-sphere body rig plus 5 visual capsules; Box3D
  still owns the 24 collision bodies and the batched bridge. Glass keeps its
  authored skinned GLB and rigid adapter.
- The field lattice stays world-aligned with hysteresis. Consecutive builds
  resample the same lattice points so the surface does not crawl, and a cached
  lattice is reused only when its cell matches and all padded bounds keep the
  historical `0.9*cell` margins.
- `updateSurfaces` caps a frame at 20 builds and checks the 6 ms
  `SURFACE_BUDGET_MS` budget only after the first two builds. Therefore the first
  two queued builds always run and a frame may exceed 6 ms. Build priority is
  grabs first, then largest deformation.
- Eyes are one pooled `InstancedMesh`; hidden/sleeping actors are scaled to
  `1e-4` instead of rebuilding the pool. Shadow drawing is tick-gated and uses
  the same actor view.
- The field and cell-vertex buffers are shared pool arrays; only the live range
  (`vc*3`, `ic`) is uploaded, and draw range follows the built index count.
- Surface rebuild order, RNG draws, update order, saves and physics state were
  not changed by F1.

## Evidence this pass

Source-inspected for this inventory: `src/app.js` `buildBear`, `surfaceStats`,
`updateSurfaces`, `marchSurface`, `writeEyeInstance`, `drawShadows`;
`src/config.js` rig/capsules; `src/box3d.js` wrapper surface; `src/life.js`
stages.

Host-measured in this pass:

- `node --test tests/surface-lattice.test.mjs` — 13/13, including a pinned
  asymmetric lattice and the source guard.
- Fixed seeded Meadow probe (`seed(424242)`, quality 2, effects off, adaptive
  off): 8 soft bears + 2 Glass, 24 rig points/5 capsules, asymmetric grab stretch
  `1.62×` followed by release/recovery, baby→adult stage rebuild, throw/landing
  and pond entry. `stats().nan` false throughout, no page errors; inspected
  `.dev-shots/f1/f1_deformed.png` and `.dev-shots/f1/f1_normal.png`.
- Forced 60-frame `bench(N, true)` samples before/after: see the dated F1 entry in
  `PERFORMANCE.md`. The extraction is neutral within run-to-run noise; no
  speedup is claimed. Parent reran the after bench independently (field
  `0.154`, surface `5.06`, total `5.46` ms) with a different actor grid, which
  confirms the noise caveat rather than a small win.
- Pond entry is host-proven; return-to-shore recovery within the probe window
  and numeric eye-continuity placement are not. Recorded as U-017.

## Chosen numeric fixture

`tests/surface-lattice.test.mjs` pins a six-point asymmetric set with unequal
radii and a `1.08` scale. It yields literal bounds and `cell 0.0339456738992222`,
origin `(-0.6449678040852218, -0.9165331952789993, -0.678913477984444)`,
dims `50×50×45`, total `112500`. This represents the numeric kernel better than a
single radius because all three axes differ, the ladder rounds a non-trivial
`want`, and the lattice is exercised end-to-end through allocation limits. The
live 24-body rig is covered by the browser probe rather than duplicated as a
large fixture.

## Unsupported or deferred

- Field scatter, surface-nets polygonisation, geometry upload, eye instancing,
  shadow drawing and `updateSurfaces` scheduling remain app-internal. Only the
  bounds/lattice numeric slice is extracted.
- `surfaceBounds` returns `null` for zero points; `buildBear` then returns before
  touching buffers. This is honest for an impossible/empty rig and was not a
  reachable production state.
- Box3D/WASM internals, solver behavior, force/readback ordering and a universal
  physics facade are out of scope and remain separately gated. F1 does not
  change the 24-body construction or batching.
- A general exported surface/buffer/scheduler API is not implemented.
