# Fixtures

Reusable, job-driven pipeline code lives one level up in `pipeline.py` and `pipeline/`.
This folder is the future home for **asset-specific builders** (scene geometry, prop
generation) that the pipeline cannot generalise.

Migration policy:

- New builders go here, not into `../tests/`.
- `../tests/` keeps the existing phase scripts unchanged so current checks and CI keep
  working; nothing is renamed or moved as part of this migration.
- A builder here must write to `.dev-shots/` (gitignored) or an explicit out-dir and must
  refuse to overwrite an existing checkpoint.
- Geometry construction is intentionally not parameterised into `pipeline.py`: an asset
  builder is a fixture, while inspection, UV, bake, check, render, export and verify are
  shared verbs.

Planned content (not yet moved):

```text
fixtures/
  office_corner.py        from tests/phase7/build_office_corner.py
  retro_laptop.py         from tests/phase7/build_retro_laptop.py
  frutiger_props.py       from tests/phase7/build_frutiger_props.py
```

No file may be duplicated between `tests/` and `fixtures/`; move only when the old path is
retired in its own reviewed change.
