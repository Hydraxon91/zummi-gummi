# Animals and species-based creatures — unvalidated

**Status: unvalidated.** Project-authored candidate guidance. Follow the main skill's
character, rigging and reference rules. Do not reuse humanoid proportions by default.

## 1. Identify the species and characteristic structure

Record species or approved creature design, stylisation, age/sex only if specified,
reference poses and whether fur/feathers conceal anatomy. Identify skull, ribcage,
pelvis, spinal line, limb joints, paws/hooves, tail and ground contact where applicable.
Distinguish digitigrade/plantigrade/unguligrade stance when relevant; a visible backward
limb bend must be identified anatomically rather than guessed from silhouette.

Decide static versus animated and identify the required locomotion or articulation.
For birds, fish, reptiles or invertebrates, name the appropriate body plan instead of
forcing the quadruped landmarks below. Mark missing reference views as uncertainty.

## 2. Select construction by form and movement

| If… | Start with… | Risk |
| --- | --- | --- |
| A simple stylised animal is required | Low-resolution cage with species-specific masses and joints | A rounded generic body may erase the species silhouette |
| Organic anatomy needs sculptural shaping | Primary-mass sculpt/blockout before surface detail | Fur/scales may conceal unresolved anatomy in a hero render |
| The animal must move | Deformation-aware cage or scoped sculpt-to-retopology workflow | Neutral pose quality does not establish limb or spine behaviour |
| Repeated appendages follow an established body plan | Prove one complete limb/wing/segment before repetition | Mirrored copies may inherit wrong axes or attachment |

Existing game actors may have locked representations. Inspect the species/rig contract
before proposing any asset replacement; this module does not authorize a new runtime path.

## 3. Test the characteristic region

1. Establish the spine and main skeletal/mass proportions from the species reference.
2. Block out the head, body and support/locomotion structures without fur, scales or
   accessories. Compare front, side, back and oblique silhouette and ground contact.
3. Prove the characteristic head/muzzle shape and one shoulder/haunch-to-limb transition
   for quadrupeds, or the corresponding defining junction for the actual body plan.
4. If animated, test the required bend/stride/fold with the real joint axes and weights.
   Check compressed and extended states rather than one attractive standing pose.
5. Only after body approval add silhouette-changing fur/feather masses, then fine detail.

**Editable controls:** skeletal landmarks, body masses, limb lengths/stance, head profile,
joint regions, tail/wing attachment, symmetry and rest pose. Keep fur density separate
from anatomical volume; material detail cannot repair a missing muzzle or limb section.

## 4. Diagnose before editing

| Failure | Inspect first | Next scoped test |
| --- | --- | --- |
| Reads as the wrong species | Skull, muzzle, ears, spine, limb ratio and stance | Correct primary landmarks, not texture |
| Limb bend is implausible | Actual joint identity and axes | Pose one limb against a species-appropriate reference |
| Shoulder/haunch pinches | Underlying mass, edge flow and weights | Isolate neutral form versus pose deformation |
| Tail/wing floats | Full attachment region in multiple poses | Isolate junction and check evaluated continuity/coverage |
| Fur hides inconsistent forms | Cage/clay view without surface covering | Correct body before restoring fur |

## 5. Change method only with evidence

If independent anatomical masses or a required articulation cannot be controlled,
demonstrate the failing region on the neutral cage and a required pose before proposing
retopology or a different construction. A species mismatch does not by itself prove a
topology defect; it may be proportions or a wrongly identified landmark.

Check characteristic silhouette, limb count/ownership, contact, attachment, topology
and motion separately. Inspect occluded and opposite-side junctions. State unsupported
anatomy/hidden regions as unverified. Do not claim gait or flight correctness from a still.
