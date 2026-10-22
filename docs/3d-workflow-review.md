# Authoring workflow reorganisation — scope and evidence

## Current status

Phases 1–3 documentation work: shorter entry points, on-demand detailed references,
one stage/capture policy and a reference-interpretation policy. No Blender state,
asset geometry, helper implementation, OpenCode configuration or game behaviour is
changed by the documentation pass. Phase 4 tooling repairs were subsequently
approved and exercised as recorded below. Controlled modelling trials and resuming
the watering can remain separate approvals. Documentation review is not modelling validation.

## Requirement-preservation map

| Previous location | Current authoritative location / disposition |
| --- | --- |
| Root §1–4, §6, §8, §10–11 | Common safety/routing in `AGENTS.md`; detailed execution preserved under original section numbers in `docs/agent-procedures.md` |
| Root §5, §12 | Detailed batch/repair/commit semantics preserved in procedures §5/§12; root summarises, does not grant additional permission |
| Root §7 | Architecture, ownership and performance-shaped structures preserved in procedures §7; load for code/config tasks |
| Root §9, §14 | Game checks/performance preserved in procedures §9/§14 and existing game skill; no standalone-Blender game boot requirement |
| Root §13 | Game visual checks scoped explicitly to game changes; Blender capture timing belongs to stage-review |
| Root §15 | Technical preservation/diagnostic safeguards retained in procedures §15; progression/capture authority delegated to stage-review |
| Original authoring entry | Full specialist/tool content retained in `authoring-handbook.md` at the same directory depth, preserving link bases and provenance; entry replaced by stage/task router |
| Competing part/stage/stop rules | Merged under `references/stage-review.md`; summaries defer to it; approved-stage edits do not require per-operation approval |
| Reference authority/comparison | `references/reference-review.md`; calibration/overlay technical instructions retained in handbook |
| Mandatory method recital | Replaced by concise decision agreement; extended construction prompts are risk-dependent guidance |
| Mesh/fit/transfer/UV/bake/export checks | Preserved in handbook and specialist references; loaded at active stage, not waived |
| Asset history | Remains in topic notes; current work records must distinguish verified facts from reported history |

No dependency, licence/provenance, source-preservation, required-feature, final
delivery or integration safeguard is intentionally removed. Handbook/procedure
summaries are not independent policy authorities. Existing unvalidated guidance
and tool limitations retain that status.

## Original diagnostic quarantine — historical findings before Phase 4

| Finding | Evidence and present restriction | Deferred action |
| --- | --- | --- |
| Ledger budget mismatch | Confirmed in `tools/asset-pipeline/scripts/construction_gate.py`: `len(entries) > 7` combines criteria and successful entries. Its result cannot establish compliance with per-criterion failed-repair policy. Preserve a truthful criterion history; do not truncate it to obtain PASS. | Phase 4: reconcile implementation and fixture-test independent criteria, successful steps and approved continuations. |
| Can-local signed volume | Prior audit reports repeated `vs[1]` in a polygon fan and translation-dependent results. Asset-local helper was not located/reproduced in this documentation pass. Treat affected volume conclusions as unverified; do not accept or rebuild geometry from them. | Locate exact source/version and independently reproduce on known-volume transformed fixtures before repair. |
| Base/evaluated health and evaluation fallback | Prior audit reports base-health/evaluated-count mixing and silent fallback in the can helper; not independently reproduced here. Such aggregate output cannot certify evaluated health. | Inspect source, make evaluation errors explicit and test modifier-generated defects. |
| Consumed Boolean operands | Prior audit reports applied/deleted cutters. Checkpoint existence does not establish editable-source preservation. Do not use a destructive helper on sole approved source operands. | Inspect helper; preserve controls/operands and test intermediate results under approved tooling scope. |
| Capture restoration/orientation | No fresh runtime fixture evidence in this pass. Names/settings alone cannot establish views or restored state. | Phase 4 asymmetric-axis and success/exception restoration fixtures. |

A faulty report invalidates its claims, not automatically its subject geometry.
Helper gates enforce only their own paths. No claim is made that arbitrary MCP
Python is prevented from exporting or that documentation completeness proves fit.

## Phase 4 tooling results

Follow-up capture repair: reference-visibility loops in the local adapter reused
the snapshot variable, causing restoration to fail when named reference objects
were present. The snapshot now uses a distinct name and temporary-world cleanup
runs even if restoration raises. The updated disposable fixture includes both
`REF_front` and `REF_top` and checks success and injected-render-failure restoration.
The rerun passed in Blender 5.2.2; evidence is under
`.dev-shots/asset-pipeline/phase4-tool-repair/capture-siylohae/`.

The local helper was located at `.dev-shots/asset-pipeline/deepseep_wateringcan/source/tools/cantools.py`.
Its volume bug, silent evaluation fallback, mixed representations and consumed
cutters were source-confirmed. `health` and `boolean` now delegate to tracked
`tools/asset-pipeline/scripts/mesh_diagnostics.py`: corrected fan indices, explicit
local units, separate base/evaluated metrics, no fallback, and unapplied Booleans
with both operands retained. This is not an automatic repair or topology verdict.

The local capture adapter now copies its review world rather than editing the source
world, restores the prior camera/settings/visibility through the shared snapshot,
and rejects invalid view names before camera creation. Shared snapshots preserve
raw quaternion/Euler/axis-angle channels rather than decomposing a matrix; a fixture
exposed measurable drift in matrix-based restoration. Restoration errors are no
longer silently swallowed in the shared helper; temporary capture cleanup also runs
when restoration raises.

Ledger validation now uses explicit kind/result classifications, criterion-local
attempt identities, and failed-repair budgets with recorded bounded continuations.
It rejects unclassified legacy entries rather than inferring success/failure from
prose. Fixture ledgers were updated; real historical ledgers were not rewritten.
Malformed criterion/boolean attempt input is rejected without crashing. Approval
authenticity, classification honesty, and review/diagnosis are still procedural.

Passing fixtures in Blender 5.2.2 LTS: `test_mesh_diagnostics.py` (known-volume
concave L prism, translated/rotated, independent triangulated BMesh volume,
inverted/open/degenerate/loose cases, modifier-created boundaries, explicit evaluation
exception and preserved Boolean operands); `test_phase4_capture.py` with the local
adapter (asymmetric front/right projection, success/exception restoration, original
world contents). Pure `test_construction_gate.py` covers independent criteria,
successful construction, exhausted budget including a subsequent successful repair,
continuation and explicit legacy rejection. Existing capture and export-guard suites
were also exercised; see final verification report for latest reruns.

Viewed accepted fixture captures under
`.dev-shots/asset-pipeline/phase4-tool-repair/capture-fz6ss_r8/`:
`asymmetric_front_solid.png`, `asymmetric_right_solid.png`, `can_front.png`.
Earlier blank factory-cube-occluded captures are failed fixture evidence, not accepted
results; the fixture explicitly hides the startup occluder. No can geometry was
opened, edited, saved or exported. The local adapter remains ignored/local-only;
tracked core repairs and tests are reproducible, but a clone without that adapter
cannot claim its local capture branch was exercised. Live Blender was untouched.

Final verification: six suites passed (`test_construction_gate`,
`test_mesh_diagnostics`, `test_phase4_capture` with `CAN_HELPER`,
`test_capture_review`, `test_export_guard`, `test_office_export_fixture`). Synthetic
export fixtures exercised guarded export; no project asset was exported. Expected
negative-case failures inside those suites are assertions, not suite failures.
No owned Blender background process remained after the runs. Game/runtime tests
and can-specific reference comparisons were not run and are not claimed.

## Documentation review scenarios

- **Broad likeness + body-only:** reference/fidelity clarification leaves the spout
  blocked; no shape approval is inferred.
- **Approved whole-asset chunk:** ordinary edits continue within approved stages;
  stop only at explicit user gates, failures or the chunk boundary.
- **Rejected shape renamed:** approval and failed-repair history remain unchanged.
- **Handoff:** saved checkpoint and inspected live differences are separate fields;
  unestablished contents remain unknown rather than inferred from filenames.
- **Silhouette adjustment:** root → skill → stage review; supplied reference adds
  reference review and, for calibrated work, only calibration/comparison sections.
  No UV/bake/export/game procedure is required.
- **Attachment:** add assembly reference and relevant health/preservation checks.
- **Material-only:** add material diagnosis/PBR and geometry-preservation checks;
  no new construction brief or game integration is implied.
- **Export:** load delivery/transfer/pipeline procedures and inspect final source;
  export scope does not authorise game integration.

These are source-level walkthroughs, not fresh-session execution or observed
agent behaviour. A fresh-session loading review and separately authorised trials
remain necessary. Compare equal safety boundaries in baseline and routed trials;
preserve failures and human assistance, and avoid claiming validation from one run.

## Checks performed

- Entry counts: root contract 801 words/89 lines; authoring skill 908 words/111 lines.
- Checked 107 local Markdown links across both skills and the new procedure/review
  documents: no missing targets. Checked literal repository paths in entry/procedure
  records: none missing. Glob examples are not literal file paths.
- Compared the preserved procedure and handbook against their original tracked
  versions: the original 15 procedure sections and specialist content remain, with
  scoped wording/routing changes shown in the migration map.
- Reviewed the stage and routing scenarios above against source; no fresh agent,
  Blender capture, runtime fixture, game test or modelling trial was run. In
  particular, the can-specific Phase 3 comparison acceptance is still pending,
  not satisfied by writing a reference-review procedure.
- `git diff --check` passed. No verification server/browser was started; the user's
  existing Blender process was left untouched.
