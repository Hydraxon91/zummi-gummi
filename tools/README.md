# Tools

## uv-layout-extractor

Vendored copy of the standalone `uv-layout-extractor` project.

- Entry point: `tools/uv-layout-extractor/README.md`
- Public scripts: `tools/uv-layout-extractor/scripts/`
- Optional repair/rebind: `tools/uv-layout-extractor/extras/`
- Standalone tests: `cd tools/uv-layout-extractor && python3 -m unittest discover -s tests -p 'test_*.py'`
- Blender smoke test: `BLENDER=/path/to/blender tools/uv-layout-extractor/tests/blender/run.sh`

The canonical upstream is maintained separately. See
`tools/uv-layout-extractor/UPSTREAM.md`.

## asset-pipeline

Phase 1a/1b read-only audit, delivery profiles, provenance schema and advisory
camera-projected texel-density policy, plus Phase 2 unified export verification, Phase 3
bake fixtures and a Phase 4 crate material-zone trial for the Blender → AI-assisted
materials → glTF pipeline.

- Roadmap: `docs/asset-pipeline-roadmap.md`
- Entry point: `tools/asset-pipeline/README.md`
- Audit: `tools/asset-pipeline/scripts/audit_asset.py`
- Density policy: `tools/asset-pipeline/scripts/density_policy.py`
- Export verification: `tools/asset-pipeline/scripts/verify_asset.mjs`
- Validator provisioning: `tools/asset-pipeline/scripts/provision_validator.mjs`
- Standalone preview: `tools/asset-pipeline/preview/index.html`
- Profiles: `tools/asset-pipeline/profiles/`
- Python tests: `python3 -m unittest discover -s tools/asset-pipeline/tests -p 'test_*.py'`
- Phase 2 tests: `tools/asset-pipeline/tests/phase2/run.sh`
- Phase 3 fixtures: `tools/asset-pipeline/tests/phase3/`
- Phase 4 crate zone trial: `tools/asset-pipeline/tests/phase4/`
- Blender fixtures: `BLENDER=/path/to/blender tools/asset-pipeline/tests/blender/run.sh`

This tooling is read-only and does not export, repair, generate textures, modify the game
loader or integrate assets into the game. Density thresholds are advisory, not an
acceptance gate; validator and preview evidence remain separate from game integration.
