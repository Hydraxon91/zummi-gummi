# Authoring workflow retirement

AssetWorkshop owns modelling, materials/ComfyUI, UVs, baking, export and standalone
verification. This game repository owns destination loading, intake and separately
approved integration. See `asset-intake.md` for active game requirements.

## Removed from active game workflow

- `.opencode/agents/modeller.md` and the discoverable 3D authoring skill.
- `tools/asset-pipeline/` and UV extractor scripts/tests/docs.
- Authoring routes from AGENTS, coder, game-verification skill and procedures §15.
  Procedures §15 now points to destination intake, not Blender operations.

Original tool/skill trees were relocated without merging or overwriting into
`AssetWorkshop/.dev-shots/legacy-game-authoring-retirement-20261023/` for recovery.
AssetWorkshop's active, repaired copies remain separate. No global configuration,
credentials, live Blender state, game assets or asset histories were changed.

## Preserved

- `scripts/glb-inventory.mjs`, browser harness, runtime loaders, asset manifests,
  destination contracts and asset tests.
- Historical reports, roadmaps and ComfyUI operating notes here remain immutable
  records. Their old authoring links/commands may no longer resolve locally; use
  AssetWorkshop for active instructions rather than repairing historical records.
- Ignored checkpoints/references and uncopied histories remain in place.
- `tools/uv-layout-extractor/.github/workflows/ci.yml` remains byte-for-byte:
  CI changes require separate approval. This residual vendored metadata is not
  an active authoring route. Its removal/update remains deferred.
- Unrelated existing game/document changes were not reverted or cleaned up.

## Verification

- Before relocation, destination coverage check found no missing non-cache tool/skill
  files (CI metadata deliberately excluded from migration).
- No old authoring skill/tool/modeller references remain in active `.opencode/`
  Markdown or AGENTS. Historical documents intentionally retain original references.
- `node --test tests/asset.test.mjs tests/asset-loader.test.mjs tests/asset-store.test.mjs`:
  12 tests passed, including shipped manifest and GLB bounds.
- `git diff --check`: passed.

No end-to-end game/browser verification was claimed for this documentation/tool
retirement. No commits or pushes performed. Versioned cross-project intake remains
a separate task, not fabricated by this cleanup.
