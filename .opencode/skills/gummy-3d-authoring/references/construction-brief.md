# Construction-method brief

Use before building a primary form or changing construction strategy. This supplement
does not authorize edits or replace calibration, shape approval or interface checks.
Record concise decisions and observable evidence, not hidden reasoning.

## Template

- **Destination contract:** read [game-first production](game-asset-contract.md).
  Runtime delivery is the default in every likeness mode. If a dense CGI/sculpt/bake
  source is needed, state its approved purpose and how it stays separate from delivery.
- **Fidelity and scope:** stylized/gameplay-read, reference-faithful or reconstruction;
  required identifying cues, optional/simplified/omitted details, independent evaluation
  versus assisted production, and who approves shape/style.
- **Game budget:** intended camera distance or screen coverage, expected instances,
  proposed delivery triangles/materials/texture sizes, motion/collision needs, available
  source materials and separately authorized export/integration stages. Distinguish
  editable source, evaluated source and re-imported export counts.
- **Target/evidence:** reference landmarks, dimensions, units, coordinate space and uncertainty.
- **Reference coherence:** compare supplied views for conflicting part counts, panel layouts,
  attachment points and operating states, not just dimensions. Name the authority view and
  flag consequential contradictions for user decision before building. Generated views are
  design proposals, not proof of hidden construction or mechanical feasibility. This check
  applies in every fidelity mode and does not authorize new image generation.
- **Reference calibration:** authority view, crop rectangles, pixels-per-metre scale, plane
  collection and the overlay captures used for the gate. If no reference was supplied, state
  that explicitly. In reference-faithful/reconstruction or requested measured matching,
  calibration must precede geometry; dimensions agreed only in chat do not count as
  calibration. For stylized visual-guide work, state that no calibrated match is claimed,
  record declared dimensions and name the neutral shape-review views instead.
- **Geometry drivers:** silhouette, section progression, curvature, thickness, openings,
  interfaces and operating poses. Identify protected surfaces/transforms.
- **Construction routing:** modules read from the main skill's routing table, their
  validation status, and which conditions make their candidate methods applicable.
  State a routing gap explicitly; an unvalidated module still needs a representative test.
- **Method:** chosen approach, why it fits, and the principal alternative's drawback.
- **Editable controls:** source cage/profiles, symmetry, support loops, thickness,
  hinge/sweep axis, modifiers and recoverable source.
- **Motion contract (if requested):** choose controls using the guide below; record rest
  and recovery states, ranges, allowed combinations, contact/support requirements, prohibited
  outcomes and representative test states. Mark motion excluded for a static asset rather
  than adding a rig by default.
- **Geometry/material split:** list features that must be modelled (silhouette, thickness,
  openings, parallax, attachment, articulation, deformation) and features that can be
  texture/material (printed graphics, fine relief, roughness, colour boundaries). State the
  closest intended viewing distance used for the decision.
- **Risks:** pinching, cap shrinkage, intersections, gaps or excessive geometry; what
  observation would disprove the choice?
- **Representative test:** difficult corner/section/interface before replication; captures
  and evaluated checks with agreed tolerances and explicit unverified regions.
- **Decision:** proceed, revise or stop; link evidence and the criterion's candidate ledger.

Separate method review from mesh health, evaluated attachment, likeness, motion and user
acceptance. Follow `assembly-verification.md`; do not conceal failed construction with trim.

## Selection prompts (not validated recipes)

| Geometry driver | Candidate method | Main risks |
| --- | --- | --- |
| Moulded changing sections | Bridged loops / subdivision cage | Cap shrinkage, rim support |
| Rotational symmetry | Revolved profile | Poles and curvature |
| Section following a path | Sweep / loft | Twist and self-intersection |
| Fabricated panels | Panels, booleans, bevels | Wall thickness and corners |
| Soft goods | Quad cage with contact/deformation | Artificial symmetry, bowl-like form |
| Progressive organic coil | Transformed sections / parametric sweep | Accumulated scale and winding |

Choose from geometry, not names: a coiled shell and a hinged laptop clamshell need different
construction. Derive counts/offsets from scale and curvature, not tutorial constants.
Preserve procedural sources before applying arrays or bridging evaluated copies.

## Deformation controls and motion contract — unvalidated

Choose the simplest controls that support the approved behavior before detailing. These
are candidates, not permission to change an existing actor representation or build a rig.

| Required behavior | First candidate | Representative check |
| --- | --- | --- |
| One fixed art-directed form | Editable cage / proportional edits | Preserve support/contact and required silhouette |
| Authored squash or expression states | Shape keys with matching topology | Basis, intermediate and full states; approved combinations and recovery |
| Articulated rigid parts | Explicit pivots and parenting, or a small bone rig | Joint limits, attachment endpoints and required clearance throughout travel |
| A limb must reach or keep a contact target | IK where useful; FK for directly controlled articulation | Reach limits, planted contact, joint direction and stable body movement |

Keep the contract short and reuse the approved work card. Specify:

- The rest/Basis state and the intended recovery target; these need not be a pristine or
  symmetric shape. State whether deformation resets, settles or persists.
- Named controls, ranges and whether variants are alternatives or may combine. Do not
  assume separate shape keys are mutually exclusive or safe at simultaneous full weight.
- Support/contact and moving interfaces: what stays planted, what may move, and each
  required link/actuator's attachment endpoints. State the allowed sliding or clearance.
- Failure cues such as floor penetration, detached parts, clipping, pinching, implausible
  filling loss or impossible joint travel. Agree relevant tolerances rather than inventing
  physical accuracy, occupant dimensions or travel limits.

After primary-form approval, prove one representative moving region on the simple source
before replicating it or adding fine detail/full rig polish. Inspect intermediate states
and recovery, not only endpoints. Use viewport playback or representative viewport frames;
do not add a video pipeline for this review. A few stills establish only the sampled states,
not timing, smoothness or the complete motion envelope.

Blender controls are authoring mechanisms, not a runtime-support guarantee. Before separately
approved export, identify what becomes object transforms, skin animation or morph weights;
IK, constraints and drivers do not automatically transfer as runtime solvers. Any necessary
animation bake needs its own approved scope and source-versus-export motion comparison.

## Laptop example (illustrative, not a validated pattern)

Two moulded shells have opposing thickness tapers, a shared closed seam and a hinge axis.
Candidate: rounded section loops bridged into editable cages, with deliberate rim support
and cap topology. Alternative: stacked slabs are quick blockouts but poorly express the
changing sections and mating interface. Test a front/side rim and cap under subdivision,
open and closed, before details. A shared cage seam does not prove evaluated contact.
A floating filler ring is failed construction, not a successful interface.

## Geometry versus material (laptop illustration)

Model geometry for the shells, hinge, bezel opening, key depth/spacing and any feature that
changes the silhouette, attachment, parallax or shadow at the intended view. Use texture or
material for key legends, screen imagery, printed labels, colour boundaries and fine plastic
grain. A raised bezel is geometry; a painted line around it is not. Normal maps can add
surface relief but cannot create an opening or change the silhouette. Decide at the closest
intended viewing distance, not by a size threshold alone. For export, baked textures are
static; procedural node graphs need a tested bake or an approved simplification.
