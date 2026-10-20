# Asset pipeline tools

Phase 1a and Phase 1b of
[`docs/asset-pipeline-roadmap.md`](../../docs/asset-pipeline-roadmap.md).

This directory currently contains the **read-only asset audit**, delivery profiles,
provenance schema and advisory texel-density policy. It does not generate textures,
repair assets, export GLBs, run glTF-Validator or integrate anything into Gummy Bears.

## Contents

- `profiles/` — versioned delivery profiles:
  - `opaque_prop.json`
  - `transparent_buddy.json`
  - `mixed_architecture.json` (provisional, bubble house)
- `schemas/` — JSON Schema documents for profiles and provenance.
- `examples/provenance.example.json` — minimal provenance record.
- `scripts/audit_asset.py` — read-only Blender audit.
- `scripts/density_policy.py` — pure percentile and advisory-policy evaluation.
- `scripts/validate_documents.py` — dependency-free profile/provenance validation.
- `tests/` — pure document/policy tests and two Blender fixtures.

## Audit

Run against an existing `.blend` from the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background path/to/source.blend \
  --factory-startup \
  --python-exit-code 1 \
  --python tools/asset-pipeline/scripts/audit_asset.py -- \
  --objects Body \
  --out .dev-shots/audit/body.json \
  --resolution 1024 \
  --profile tools/asset-pipeline/profiles/opaque_prop.json \
  --camera Closest_View
```

Use `--objects` with explicit mesh names. `--all-meshes` is available for inspection but
is not the preferred production path. Use `--open-panels` for intentional open surfaces.
Use `--profile path/to/profile.json` to attach a delivery profile. Use `--camera NAME`
to select the closest intended view; the scene camera is never assumed to be that view.
Use `--fail-on error` or `--fail-on warning` when the audit is acting as a gate; the
default is `none`. Use `--force` only when intentionally replacing a report.

The audit is read-only. It does not save the `.blend`, apply modifiers, change UVs,
assign materials, export or render.

### Report contents

- scene units, scale, axes, render engine and dirty state;
- source path and SHA-256 when the source file exists;
- per-object transforms, bounds, dimensions and negative-scale detection;
- evaluated geometry health from `asset_qa`;
- UV layer names, active-render state, bounds, island counts and island area;
- geometric UV overlap, out-of-bounds and degenerate-triangle diagnostics;
- raw UV density measurements from `uv_report`;
- `uv_required` per object, based on whether its materials use image textures;
- advisory camera-projected density by texture resolution and material zone;
- material slots and material/image dependencies from `texture_inventory`;
- shared meshes/materials, visibility and object-linked slots from
  `render_state_audit`;
- missing or unsupported image-source preflight findings;
- dependencies: parents, constraints, modifiers, collections and libraries;
- findings with `error`, `warning` and `info` severities;
- provenance stub with source hash, tool/Blender versions and empty generation/export
  fields.

The audit report is **evidence**, not an acceptance decision. Passing a check does not
approve the asset.

## Texel-density policy

The policy compares measured texture density with the screen density required by an
explicit closest camera:

- for each front-facing triangle inside the view, required density is
  `sqrt(projected_screen_area_px / world_area_m2)`;
- measured density is
  `sqrt(uv_area * texture_width * texture_height / world_area_m2)`;
- the reported ratio is `measured / required`.

Projected screen area naturally accounts for oblique surfaces. A separate UV Jacobian
singular-value ratio reports directional stretching that area alone can hide.

Policy defaults are **advisory**:

- viewport `1920×1080`;
- `1024²`, `2048²` (and fixture-only `4096²`) evaluated independently;
- ratio review range `1.0–2.0` texels per screen pixel;
- density-spread review threshold `p95/p05 > 2.0` within a material zone;
- UV-anisotropy review threshold `p95 > 1.5`;
- small triangles are included and reported separately, never silently discarded;
- no camera, insufficient visible coverage or too few zone samples is `unverified`.

Consistency is evaluated per material zone, not across an entire mixed asset. Thresholds
must be calibrated against the crate and curved test before they are treated as a
delivery gate. A missing UV is only a warning when the object's materials use image
textures; intentionally untextured constant/procedural materials do not require one.

## Diagnostic semantics

| Code | Severity | Meaning |
|---|---|---|
| `geometry_*` | error | Evaluated geometry health failure such as degenerate faces or zero-length edges. |
| `missing_external_image` | error | A required image is missing and has no packed copy. |
| `no_active_uv` | warning | An image-textured mesh has no active render UV. Untextured meshes are exempt. |
| `uv_out_of_bounds`, `uv_outside_single_tile` | warning | UV coordinates leave the 0–1 tile. |
| `uv_degenerate_triangles`, `zero_uv_area_triangles` | warning | UV area is zero or effectively degenerate. |
| `uv_geometric_overlap` | warning | Islands overlap geometrically; raster pixel conflicts are separate. |
| `unsupported_image_source` | warning | UDIM, sequence or movie source; verify static export or bake. |
| `image_has_no_pixels` | warning | Image dimensions are zero. |
| `missing_unused_external_image`, `missing_unconnected_external_image` | warning | Missing image is not required by inspected material outputs. |
| `object_linked_material_slot` | warning | Slot is object-linked; verify export. |
| `unresolved_material_groups` | warning | Node groups are not traversed by the inventory. |
| `texel_density_under`, `texel_density_over` | warning | Camera-relative ratio is outside the advisory range. |
| `texel_density_inconsistent` | warning | Density spread exceeds the advisory limit within a material zone. |
| `texel_density_anisotropic` | warning | Directional UV stretch exceeds the advisory limit. |
| `texel_density_unverified`, `texel_density_zone_unverified` | warning/info | Missing camera, coverage or samples; not a pass. |
| `modifiers_present` | info | Modifiers are present; evaluated geometry was audited. |

`--fail-on error` exits nonzero on errors. `--fail-on warning` also exits nonzero on
warnings. Advisory density warnings should only be made blocking after calibration and
explicit approval.

## Documents

```bash
python3 tools/asset-pipeline/scripts/validate_documents.py
```

## Tests

Pure document tests:

```bash
python3 -m unittest discover -s tools/asset-pipeline/tests -p 'test_*.py'
```

Blender fixture:

```bash
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender \
  tools/asset-pipeline/tests/blender/run.sh
```

The Blender fixtures run two passes:

- Phase 1a: valid cube, bad out-of-bounds-UV/no-material cube, untextured no-UV cube and
  image-textured no-UV cube; checks the changed no-UV semantics and source preservation.
- Phase 1b: known-size grids with a fixed camera, under/over/consistent density,
  directional anisotropy, missing, packed-missing and unsupported images,
  object-linked slots, unresolved groups and degenerate geometry; checks the expected
  findings and confirms that source UVs and objects are unchanged.

## Helper dependencies

The audit imports existing project helpers from:

- `.opencode/skills/gummy-3d-authoring/scripts/`
- `tools/uv-layout-extractor/scripts/`

It does not modify or vendor those helpers. Use `--helper-dir` only if the helper
directory is relocated; the extractor path is derived from the repository root.

## Limits

- Geometric UV overlap is not a raster pixel-conflict check.
- Density checks use front-facing triangles inside the current view; occlusion and
  transparent backfaces are not tested.
- Density consistency uses material groups as zones, not semantic material zones.
- Modifiers and UVs are observed through the current depsgraph; nothing is applied.
- Node groups are not traversed by the texture inventory.
- Density thresholds are advisory until calibrated; they do not establish acceptance.
- No texture-pixel, bake-quality or rendered-appearance validation.
- No glTF-Validator, GLB export, compression or three.js loading yet.
- No house modeling, Qwen generation or game integration.
