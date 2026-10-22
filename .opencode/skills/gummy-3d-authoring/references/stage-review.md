# Stage, approval and evidence policy

This is the single Blender progression/capture policy. `AGENTS.md` owns common
safety. Technical references supplement this policy; they do not add per-edit
approval gates. This policy does not grant permission to edit, export or integrate.

## Agreement and progression

Use stages **shape → assembly → appearance → delivery → runtime integration**.
Skip inapplicable stages explicitly; local repairs may revisit a stage, invalidating
dependent evidence. This is not permission to rebuild approved neighbouring parts.

Agree review boundaries once in the approved scope. Ordinary edits, diagnostic
captures and scoped repairs within the active stage do not each require approval.
At an agreed user review, stop for approval. An approved whole-asset chunk may
authorise crossing listed stages after verification without routine check-ins;
explicit shape-approval gates still require the recorded user approval they name.
A later “body only” instruction blocks other parts despite earlier broad scope.
“Broadly match it” changes fidelity, not part scope or visible-result approval.
Checkpoint renames and new methods never convert rejected shapes into accepted ones.
Export and runtime integration must each be explicitly included in scope.

## Current work record

Maintain one compact asset-local current record, preferably updating the existing
brief rather than creating a parallel system. Update at consequential decisions,
review boundaries and handoffs, not every edit. Link historical evidence without
rewriting it. Include:

- Active part/stage and blocked downstream stages.
- Approved constraints, required features, protected state, budget and decision sources.
- Reference/view authority, observations, assumptions and unresolved discrepancies.
- Authoritative saved checkpoint; actual live filepath/dirty state and known live
  differences. Inspect contents: filenames and dirty flags alone prove neither.
- Last verified result and its source/pose/captures; pending user decisions.
- Next authorised action and unresolved criterion's failed-repair count.

If inherited state cannot be established, mark it unknown and inspect before editing.
An agent inference is not a user decision. Keep report detail proportional to risk.

## Verification matrix

| Decision | Evidence required |
| --- | --- |
| Routine construction edit | Targeted neutral viewport/solid comparison of affected contour/interface, affected evaluated health and protected-state checks; inspect returned images |
| Shape-stage review | Neutral front/side/top/three-quarter views showing required forms/openings/contact; reference-faithful/measured work also needs aligned reference-only/edges-over-reference/solid comparisons |
| Assembly acceptance | Assembled and isolated affected interfaces, endpoints, neighbouring clearances and protected surfaces; relevant operating poses; inspect front/back/both sides/three-quarter coverage of changed assembly |
| Appearance acceptance | Matched material/rendered views of affected channels and corners; geometry-preservation checks for material/UV-only work |
| Delivery | Fresh final-source feature checklist, evaluated/export/re-import inventories, topology/UV/material/transfer checks and clean self-contained import; inspected final multi-angle appearance |
| Runtime integration | Separately approved game loading, functional assertions, captures and performance/lifecycle checks through game-verification skill |

Select extra close-ups, underside views or motion frames when needed to demonstrate
a criterion. A view name does not prove orientation, isolation or visibility. Do not
recapture unrelated views after local edits; refresh evidence whose claims depend
on those edits. Construction uses cheap views; rendered batches are for settled
acceptance decisions or targeted render-only diagnosis. Standalone Blender work
does not require game screenshots or `window.__gummy`.

## Decision and stop conditions

Report specific observations: what contour improved, what remains mismatched and
what is unverified. Never substitute bounds, mesh health or an isolated beauty
render for the requested comparison. Separate structural health, reference fidelity,
feature presence, fit, preservation, motion and user acceptance. Missing required
features block progression; uninspected regions are not passes.

Contradictory diagnostics stop geometry repairs while the diagnostic is validated.
Keep hypothesis/control/evidence for failed repairs; apply the repository's
two-unchanged/six-review/seven-stop policy per unresolved criterion. Successful
construction is not a failed repair. New regressions stop the edit chain and
require safe scoped recovery, not speculative patching.

Helpers may check documentation completeness or freshness; they cannot judge visual
suitability or approve on the user's behalf. Their restrictions apply to their own
entry points, not arbitrary MCP operations. Do not describe procedural rules as
technically enforced restrictions. Known tool mismatches must remain disclosed.
