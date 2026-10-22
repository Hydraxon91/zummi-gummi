---
name: gummy-3d-authoring
description: Create, edit, inspect and export Blender assets through MCP. Use for 3D models, meshes, materials, UVs, baking, geometry nodes, reference matching and GLB work. Load only the active-stage references. Asset work does not authorise game integration.
---

# Gummy 3D authoring

Follow repository `AGENTS.md` for scope, safety and approval. Paths below are
relative to this skill unless labelled repository-relative. This entry is a
router, not a requirement to read every linked document.

## Select the active stage

Read [stage review](references/stage-review.md) when starting/resuming asset
work: it owns progression, review points, current state and the verification
matrix. For supplied references or likeness claims also read
[reference review](references/reference-review.md). Reuse the existing approved
agreement; do not restart a substantial brief for a local edit.

Agree scope, fidelity (stylized/gameplay-read, reference-faithful or reconstruction),
required cues, omissions, dimensions/axes, protected state and review points.
Propose game-scale triangle/material/texture budgets, viewing scale, likely
instances and motion needs for approval. Do not invent missing decisions.
Fidelity changes likeness expectations, not user approval or delivery quality.

Runtime game assets are the default destination, not CGI assets. For new primary
construction read [game asset contract](references/game-asset-contract.md).
Dense sources require an approved purpose and a budgeted delivery strategy.
Game-first does not authorise simplification, destructive optimisation or integration.

## Live decision loop

1. Inspect MCP addon status and scene information: actual filepath, unsaved state,
   target identity, dependencies and shared data. Inspect the target with `look`.
   Do not open another file over unrelated unsaved work.
2. Inspect the reference and demonstrate the comparison relevant to the intended
   contour change. Distinguish observations, assumptions and user decisions.
3. Preserve the editable cage/profiles/paths and operands, with a recoverable
   new-name checkpoint before destructive work. Make one scoped control change.
4. Inspect the affected form in neutral viewport/solid views against the reference.
   Check evaluated health and protected state at the affected layer. Counts and
   dimensions support, but cannot replace, the visual comparison.
5. Decide from that evidence: improved, still mismatched, regressed or unverified.
   Name the changed contour and remaining discrepancy. Continue within the approved
   stage; stop at its agreed boundary or on a blocking failure.

Live MCP Python supports construction, repetition, measurement and capture. It is
not permission for blind whole-asset regeneration. If MCP disconnects, stop live
editing. Scripts are not transactions: inspect partially applied state after errors.
Restore temporary diagnostic state in `finally`. Respect user resource pauses.

## Construction references — only the applicable category

Use the [construction brief](references/construction-brief.md) as a short decision
aid for a new form or strategy; its extended prompts are optional unless the task's
risks require them. Choose the method from the shape, not an existing generator.
Preserve editable controls and prove a difficult representative region before
replication. Existing category guidance is unvalidated, not an accepted recipe.

| Shape driver | Read |
| --- | --- |
| Fabric/contact/folds | [Soft goods](references/construction-soft-goods.md) |
| Moulded shells, lofts, sweeps | [Curved products](references/construction-curved-products.md) |
| Vehicle body and running gear | [Vehicles](references/construction-vehicles.md) |
| Architectural shells | [Buildings](references/construction-buildings.md) |
| Human proportions/articulation | [Humanoids](references/construction-humanoids.md) |
| Species silhouette/articulation | [Animals](references/construction-animals.md) |
| Rigid frames and furniture | [Rigid furniture](references/construction-rigid-furniture.md) |

For assisted stylized props also use [stylized game props](references/stylized-game-props.md).
Its limited human-assisted trial evidence is not autonomous-production validation.

## Specialist routes — load when that work becomes active

The preserved [authoring handbook](authoring-handbook.md) is an on-demand technical
index. Read a named section, not the whole handbook. For standalone Blender work,
do not load the game-verification skill unless integration is separately authorised.

| Active task | Technical reference |
| --- | --- |
| Existing-part identification or shared data | Handbook “Inspect before editing” and “Locating geometry before you touch it” |
| Shape health or repair | Handbook “Mesh health gate”, “Regression stop”; relevant technical bullet in repository `docs/agent-procedures.md` §15 |
| Attachment/interface | [Assembly verification](references/assembly-verification.md); handbook “Fitting attachments to host surfaces” |
| Reference-faithful/measured matching | Reference review, then handbook “Reference calibration” and “Direct comparison with reference planes” |
| Material-only change | Handbook “Diagnosing appearance discrepancies”; [PBR](references/pbr-materials.md); preserve geometry and unrelated assignments |
| UV template/island delivery | [UV templates](references/uv-template-delivery.md), [UV islands](references/uv-island-export.md) only as requested |
| Bake/atlas | [Baking](references/texture-baking.md), [atlas delivery](references/atlas-delivery.md) |
| Geometry Nodes | [Geometry Nodes](references/geometry-nodes.md) |
| Libraries/generation | [Asset libraries](references/asset-libraries.md); approval before paid generation |
| Rig/morph work | Handbook “Character and variant authoring” and “Deformation and export” |
| Export/transfer | Handbook “Geometry transfer verification” and “Deformation and export”; repository `tools/asset-pipeline/README.md` |
| Other specialised tooling | Handbook “Optional workflows and tools”; select only the relevant linked procedure |

## Review and delivery

Use the stage-review matrix, not a full delivery suite after every edit. Required
features must each be present with evidence before the next gated stage. A missing
feature is a defect, not a residual. Report topology, likeness, fit, preservation,
motion and user acceptance separately where relevant.

Helpers validate only their documented scope. A successful exporter does not
establish likeness or permission. Arbitrary MCP Python is not sandboxed by helper
approval files. Current suspect diagnostics and deferred repairs are recorded in
repository `docs/3d-workflow-review.md`; do not use their outputs to accept or
rebuild geometry pending independent verification.

At a review/handoff state the authoritative checkpoint versus live state, current
part/stage, evidence, pending decision, blocked work and next authorised action.
Distinguish live-only, saved, exported, standalone-verified and in-game-verified.
Do not claim game readiness from polygon counts or a Blender round trip. Stop at
the agreed boundary; passing checks never approves the shape on the user's behalf.
