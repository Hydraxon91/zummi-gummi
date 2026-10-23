# Game-side asset intake and integration

Authoring, materials/ComfyUI, UVs, baking and Blender verification belong to the
standalone AssetWorkshop project. This repository must not control live Blender.
AssetWorkshop authoring success is not destination compatibility or permission
to integrate. Global MCP availability does not change that boundary.

## Agree intake before integration

Inspect the actual consumer and `assets/README.md`; actor assets also use
`docs/species-template.md` and procedures §7. Select the supported representation:
ordinary props do not inherit special character requirements. Bear/Gummy retain
their 24-body metaball/surface-nets path; Glass retains the authored skinned GLB and
rigid adapter. Preserve catalog ownership, shared asset leases and batching.

For each approved delivery record role, intended views/nearest screen coverage,
instance count/device tier, scale/axes/origin, geometry/exported vertex budget,
material/texture/transparency requirements, static/rigid/skinned behavior, pivots,
clips and collision/nav needs. There is no universal triangle ceiling or automatic
performance pass below a budget. Do not invent loader support or a new registry.
Respect approved likeness and required features independently of runtime budgets.

## Required delivery evidence

- Keep the tracked asset and adjacent manifest/README with SHA-256, byte size,
  source/rights, units/axes, bounds, mesh/skin/clip/material inventory and extensions.
  Existing per-asset tests and contracts remain authoritative; a new cross-project
  versioned manifest/intake protocol is not yet implemented or certified.
- Verify the actual delivered GLB, not source counts. UV/normal/material seams can
  increase exported vertices. Report texture sizes, material primitives and file
  size. Clean import, validator and preview evidence come from AssetWorkshop;
  inspect their correspondence to the delivered hash.
- `scripts/glb-inventory.mjs` and existing asset tests remain game-owned checks.
  A structural inventory is not a Khronos validator, visual review or runtime check.
- Editable sources/checkpoints stay in AssetWorkshop or preserved recovery storage;
  they are not runtime deliveries. No automatic source cleanup or binary commits.

## Runtime acceptance

Integration is separately approved. Use `gummy-game-verification` and affected
asset/save/species tests. Inspect real game cameras, lighting/quality paths,
transmission/alpha/shadows, closest views, expected repetitions, loading/disposal,
animation/interactions and collision where applicable. Use representative measured
populations for performance claims; follow PERFORMANCE.md and procedures §14.

For families/sprites/icons compare native-size readability, palette/value contrast,
consistent view/scale, required states and alpha edges on actual bright/dark game
backgrounds. Lit sprites additionally require supported normal orientation and
lighting behavior. Do not author new artwork or compensate for delivery defects
with arbitrary runtime tint/scaling without approval.

Report delivery validity, visual acceptance, runtime behavior/performance and user
approval separately. Missing required features block delivery; untested conditions
remain unverified. A valid GLB, contact sheet or Blender render is not game readiness.
