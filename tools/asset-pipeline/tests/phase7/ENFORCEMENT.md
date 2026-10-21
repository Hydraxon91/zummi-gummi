# Construction and evidence enforcement coverage

This inventory is policy, not additional authorization.

## Enforced delivery paths

These paths require a construction brief, candidate ledger and source-bound evidence report,
and revalidate the evidence against the current source before writing a GLB:

- `tools/asset-pipeline/scripts/export_approved_asset.py`
- `tools/asset-pipeline/tests/phase7/build_retro_laptop.py`
- `tools/asset-pipeline/tests/phase7/build_frutiger_props.py`
- `tools/asset-pipeline/tests/phase7/export_office_corner.py`
- `tools/asset-pipeline/scripts/check_shape_gate.py` at **detail** and **delivery** stages

## Target coverage contract

The enforced paths require each selected mesh to have a persistent `asset_id` custom
property. Capture manifests record `target_ids`; revalidation resolves objects by ID, and
coverage compares the union of revalidated target IDs with the selected mesh IDs. Every
selected mesh must occur in the evidence. Additional IDs must be listed in the evidence
report's `support_objects`/`support_ids`; a support declaration cannot excuse a missing
export mesh. This permits component-specific captures across manifests; it does not prove
every mesh was reviewed from every angle. Pose controllers recorded separately are not
automatically targets.

Migration: run the helper in Blender after opening the saved source, then re-capture and
re-approve because IDs change the source fingerprint:

```bash
blender --background source.blend --python tools/asset-pipeline/scripts/asset_identity.py -- \
  --objects Object_A,Object_B --save
```

Briefs and ledgers now carry `target_ids` when enforced callers supply the current target
set. Approval records store `target_ids` and resolve the review manifest by ID. A rename
resolves by ID but old evidence becomes stale because fingerprints include object names;
a replacement object with the old name and a new ID is not covered. Duplicate IDs are
rejected as ambiguous. Evidence, approvals and brief/ledger files without IDs cannot
authorize enforced export until migrated and re-reviewed.

Positive entry-point coverage:
- Canonical exporter: `test_export_guard.py` (positive GLB, unsaved/source/ID/coverage negatives).
- Office exporter: `test_office_export_fixture.py` (positive GLB through the actual entry point).
- Detail shape gate: `test_capture_review.py` (approval and construction-evidence path).
- Laptop and Frutiger builders now assign deterministic IDs to generated sources, but do
  not yet have executed positive GLB fixtures; whole-scene regeneration and evidence/source
  binding remain a separate fixture task.

Brief `target` remains a human-readable description, not a cryptographic asset identity.
Coverage is ID-based within the current source; it is not semantic likeness proof.

## Explicit exemptions

The following are frozen benchmark or test-fixture paths. Their outputs are comparison
evidence, not accepted game deliveries. They do not currently enforce construction evidence.
If one becomes a delivery path, add the gate before using its GLB outside the benchmark.

- All phase 3, 4 and 6 builders/exporters.
- Phase 7 benchmark builders and bake/optimization utilities:
  `build_equipment_case.py`, `build_desk_lamp.py`, `build_office_corner.py`,
  `bake_equipment_case_atlas.py`, `build_pebble_bake.py`,
  `build_pebble_procedural_bake.py` and `optimize_office_delivery.py`.

## Not established

Passing these gates does not establish reference likeness, complete contact, visual approval,
or that a brief/method is correct. The interface checker remains experimental local sampling.
