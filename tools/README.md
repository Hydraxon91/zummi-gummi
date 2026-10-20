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

Phase 1a read-only audit, delivery profiles and provenance schema for the
Blender → AI-assisted materials → glTF pipeline.

- Roadmap: `docs/asset-pipeline-roadmap.md`
- Entry point: `tools/asset-pipeline/README.md`
- Audit: `tools/asset-pipeline/scripts/audit_asset.py`
- Profiles: `tools/asset-pipeline/profiles/`
- Tests: `python3 -m unittest discover -s tools/asset-pipeline/tests -p 'test_*.py'`
- Blender fixture: `BLENDER=/path/to/blender tools/asset-pipeline/tests/blender/run.sh`

This tooling is read-only and does not export, validate GLBs, generate textures or
integrate assets into the game.
