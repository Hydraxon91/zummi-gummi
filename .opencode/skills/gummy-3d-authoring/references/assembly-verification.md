# Assembly acceptance and self-check loop

Project policy supplementing the parent skill and `AGENTS.md`, not additional authorization.
Use for assembly edits; apply relevant criteria to simpler assets without auditing unrelated
scene objects. Asset dimensions, protected-part exceptions and exclusions belong in the
approved task scope, not this standing procedure.

## Before each system

1. Inspect the actual scene, existing components and authoritative references. Inventory
   what exists before adding parts; avoid duplicate or concealed replacement hardware.
2. State the intended change and acceptance checklist: required features, protected parts,
   interfaces, neighboring systems, tolerances and evidence. Each reference feature must be
   modeled, explicitly excluded by scope, or unresolved—not silently omitted.
3. Record protected transforms, dimensions, fixed landmarks and baseline surfaces where
   preservation matters. Capture baseline views before editing.
4. Establish a new recoverable checkpoint. Preserve replaced geometry hidden in a clearly
   named source collection. Keep earlier checkpoints; never overwrite accepted source.

## Mandatory loop

Inspect reference → inventory → define acceptance → checkpoint → edit one system →
capture → **view captures** → measure interfaces → inspect neighboring/protected systems →
report each acceptance criterion → correct if necessary → proceed only after passing.

Automatic progression requires an approved ordered chunk. Otherwise stop at the parent
skill's step boundary. At most two fix attempts per failing stage; a newly introduced defect
triggers the existing regression stop. Do not save a failed stage as the accepted delivery;
clearly labeled diagnostic checkpoints are permitted.

## Structural completeness and connectivity

- Trace functional chains from support to supported component. For mechanical assemblies,
  record both endpoints of every link/damper and the actual component each attaches to;
  record spring seats, brackets, mounts, backing and retention devices where required.
- An isolated coil, shock body or carrier shape is not a complete supported assembly.
  Verify the chain in assembled views and with occluding parts hidden. Identify uncertain
  hidden construction as an estimate and obtain approval before implementing it.
- Check full local interfaces, endpoints and transitions for gaps and excessive penetration.
  Intended joints/fastener engagement can intersect; zero intersections is not the goal.
  BVH overlap counts alone are not a verdict. State the method, tolerances and uncovered
  regions; missing samples remain unverified.
- Preserve approved component positions; do not move wheels or reshape a host merely to
  make connections easier. Escalate a genuine incompatible constraint for a decision.

## Visual completeness and construction

- Use matching reference-only, overlay and neutral-solid comparisons under the calibrated
  reference rules. Inspect full outlines, openings, panel junctions and highlight flow,
  not just isolated dimensions or sampled heights.
- Include front/back, both sides and matching three-quarter views. Add top, underside,
  body-visible/body-hidden views and attachment close-ups as relevant to the checklist.
  Confirm the captures actually reveal the claimed features; framing alone is not proof.
- Check recess depth, backing, mounting and retention. Painted plates or emissive patches
  must not conceal missing lamp housings, openings, support structures or other required
  construction. Neutral shading precedes material review.
- Inspect pinching, waviness and local surface transitions. Blanket subdivision/remeshing
  is not evidence of a corrected shape. Preserve cavity normals; do not globally recalculate
  nested shells as a generic repair.

## Preservation and integration

- Recheck neighboring clearances and intended joints with the assembly together, after
  isolated-part checks. Include motion envelopes if motion is in scope; a still proves only
  static clearance. Do not invent travel limits where references do not establish them.
- Compare protected landmarks and actual exterior surfaces against the baseline. Unchanged
  transforms/dimensions/bounds alone cannot prove preservation. Use correspondence-based
  displacement where valid or sampled bidirectional surface distances; report sampling
  coverage, uncertainty and local maxima, not only averages. Do not claim exact preservation
  from sparse samples.
- An accepted arrangement is data, not a defect. When the user places or approves a part — a spare
  leaning in a bed, a bracket rotated for clearance — record it as accepted and do not re-pose or
  re-fit it because a metric disagrees. Report measured interference as information: classify
  intended contact (a tyre resting on a carrier, fastener engagement) against panel penetration,
  and ask before changing an accepted pose.
- Restore temporary visibility, selection, active object, shading and capture settings in
  `finally`, including failed captures. Retained comparison setups must be disclosed.

## Stage evidence and delivery

Report separately: **topology**, **reference fidelity**, **feature completeness**,
**connectivity/fit**, **protected-geometry preservation** and **integration with neighbors**.
For each, provide pass/fail/unverified, the inspected capture or measurement, and limitations.
Mark a criterion not applicable only with a reason; never turn unknowns into passes.

Include the endpoint/attachment table for connected hardware, baseline/after captures,
evaluated topology with intentional boundaries separated, local clearance checks,
surface comparisons, estimates and remaining mismatches. State saved path, dirty state and
delivery status (live, saved, exported, or integrated). A clean topology report does not
establish completeness, plausible construction or reference likeness. Do not claim visual
acceptance on the user's behalf.
