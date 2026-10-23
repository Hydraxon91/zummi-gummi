# Species, assets, persistence and lifecycle

Extracted project procedure; use the parent skill's pure checks and acceptance stages.
Paths are repo-relative. Browser checks also require [browser-harness.md](browser-harness.md).

## Store and food lifecycle

`STUDIO=1` also returns to Meadow after the transition completes and asserts that
`__gummy.assets()` still reports one GLB load with three live leases (one retained
Studio instance and two Meadow instances). Cached GLB bytes are not GPU-memory usage.
For store changes also check independent skeletons/materials, source texture lifetime,
save/load, and source reuse over repeated map switches. For food changes check visibility
on consume/restore and preserve source IDs, balance values and seeded respawn draws.

Reuse the catalog/store/manifest path. Verification does not authorize a parallel
loader cache, a new decoder dependency or disposal of shared textures/geometry.
Read actual callers and ownership before choosing a lifecycle assertion.

## Species / DNA / Glass regression matrix

When the change touches a species definition, genome, save payload or shared actor view,
cover the applicable rows rather than only the happy path:

| Area | Checks |
| --- | --- |
| Registry | bear/Gummy/Glass definitions, capabilities, reciprocal compatibility, fixture registration |
| DNA | defaults, all pair combinations, mutation/clamping, phenotype, material/colour inheritance |
| Reproduction | current gate for every pair, child species/rig/phenotype, deferred hybrid target |
| Save | old save without genome, genome round-trip, future save/genome rejection, Glass optional fields |
| Actor view | mixed soft-body/Glass `all`/`active`/`byUid`/`homeResidents` |
| Asset loader | manifest schema/path validation, GLB resolution, mesh/bone/material/clip count match |
| Meadow | cross-species birth, parent/sibling bonds and play, family lineage UI, visits, shelter/door fade |
| Studio | Glass/Gummy load, 3 meshes/9 bones/10 clips, cast filters, `?race=off` |
| UI | roster rows and family status, save/continue, desktop and mobile |

Use the committed `tests/` for the pure rows; use `scripts/race-test.mjs` and
`scripts/glass-test.mjs` for the browser rows. Re-run both desktop and mobile harness
passes, plus `LOOK=alpha` when the Glass fallback path changes.

## Cross-system routes and failure response

### Game-asset runtime acceptance — extension unvalidated

Apply across all asset categories and fidelity modes. Use repository
`docs/asset-intake.md` for the destination contract.
Game-first is the destination, not permission to change a reference-fidelity brief or
an actor representation. Animated assets also require the existing rig/clip/pose checks;
repeated modules and transparent/foliage assets need their relevant performance checks.

Read the approved asset brief for fidelity, camera/screen coverage, intended instance
count, delivery geometry/material/texture budgets and motion/collision requirements.
Source/GLB validation belongs to AssetWorkshop; this reference verifies actual
integration only after it is approved. A background prop need not reproduce optional
reference dimples, but still must retain its required silhouette/cavities and safe state.

Inspect the exported asset at the intended game scale and nearest supported view, in
relevant lighting/quality tiers. Verify manifest/catalog loading, transforms, pivots,
material/texture support, repeated-instance ownership and needed collision/nav behavior.
Record export counts separately from source/evaluated counts; a nominal vertex limit
or fewer triangles is not a runtime-performance measurement. Use the performance route
for representative populations and the rendering route for approved visual cues. State
missing game integration or device tests as unverified, not game-ready.

### Shared checks

Load [behavior-parity.md](behavior-parity.md) when save/actor changes affect seeded
behavior, and [physics-world.md](physics-world.md) when lifecycle touches physical
representations or map isolation. Asset visuals also require
[rendering-visuals.md](rendering-visuals.md); a manifest match does not prove rendering.
Use the 3D authoring skill for source/export checks, without inferring in-game acceptance.

Treat stale IndexedDB, shared-resource disposal, missing clips and failed restore as
distinct diagnoses. Preserve the failed report; do not clear user saves, change data
contracts or substitute another asset to obtain a green test. Apply approval rules.
