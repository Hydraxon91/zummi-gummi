# Asset pipeline tools

Phase 1a of [`docs/asset-pipeline-roadmap.md`](../../docs/asset-pipeline-roadmap.md).

This directory currently contains the **read-only asset audit**, delivery profiles and
provenance schema. It does not generate textures, repair assets, export GLBs, run
glTF-Validator or integrate anything into Gummy Bears.

## Contents

- `profiles/` — versioned delivery profiles:
  - `opaque_prop.json`
  - `transparent_buddy.json`
  - `mixed_architecture.json` (provisional, bubble house)
- `schemas/` — JSON Schema documents for profiles and provenance.
- `examples/provenance.example.json` — minimal provenance record.
- `scripts/audit_asset.py` — read-only Blender audit.
- `scripts/validate_documents.py` — dependency-free profile/provenance validation.
- `tests/` — pure document tests and a Blender fixture.

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
  --resolution 1024
```

Use `--objects` with explicit mesh names. `--all-meshes` is available for inspection but
is not the preferred production path. Use `--open-panels` for intentional open surfaces.
Use `--profile path/to/profile.json` to attach a profile reference, and `--force` only
when intentionally replacing a report.

The audit is read-only. It does not save the `.blend`, apply modifiers, change UVs,
assign materials, export or render.

### Report contents

- scene units, scale, axes, render engine and dirty state;
- source path and SHA-256 when the source file exists;
- per-object transforms, bounds, dimensions and negative-scale detection;
- evaluated geometry health from `asset_qa`;
- UV layer names, active-render state, bounds, island counts and island area;
- geometric UV overlap, out-of-bounds and degenerate-triangle diagnostics;
- raw UV density measurements from `uv_report` (no policy yet);
- material slots and material/image dependencies from `texture_inventory`;
- shared meshes/materials, visibility and object-linked slots from
  `render_state_audit`;
- dependencies: parents, constraints, modifiers, collections and libraries;
- findings with `error`, `warning` and `info` severities;
- provenance stub with source hash, tool/Blender versions and empty generation/export
  fields.

The audit report is **evidence**, not an acceptance decision. Phase 1a does not define
texel-density thresholds or routing rules.

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

The Blender fixture builds one valid cube, one deliberately bad cube (out-of-bounds UV,
no material) and one no-UV cube. It runs the audit, checks the expected UV/material
findings and confirms that source UVs and objects are unchanged.

## Helper dependencies

The audit imports existing project helpers from:

- `.opencode/skills/gummy-3d-authoring/scripts/`
- `tools/uv-layout-extractor/scripts/`

It does not modify or vendor those helpers. Use `--helper-dir` only if the helper
directory is relocated; the extractor path is derived from the repository root.

## Limits

- Geometric UV overlap is not a raster pixel-conflict check.
- Modifiers and UVs are observed through the current depsgraph; nothing is applied.
- Node groups are not traversed by the texture inventory.
- Texel-density values are measurements; Phase 1b defines policy and failing fixtures.
- No texture-pixel, bake-quality or rendered-appearance validation.
- No glTF-Validator, GLB export, compression or three.js loading yet.
- No house modeling, Qwen generation or game integration.
