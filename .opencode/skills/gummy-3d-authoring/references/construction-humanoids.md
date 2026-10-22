# Humanoids — unvalidated

**Status: unvalidated.** Candidate construction guidance, not a validated anatomy,
sculpting or rigging workflow. Follow the main skill's character/deformation procedures.

## Game-first application

Read the shared [game-asset contract](game-asset-contract.md). Budget mesh density and
required bones/clips/influences with the approved rig and expected simultaneous actors.
Concentrate loops where silhouette, facial read or actual bends require them. Do not
sculpt pores, model every hair strand or add expressions beyond the brief by default.
A dense sculpt is an approved source stage with a runtime retopology/bake strategy,
not an animation-ready delivery. Verify reduced meshes in required poses and preserve
skin/shape-key/material ownership; a good neutral render is insufficient.

## 1. Establish proportions and use

Identify human-like anatomy versus deliberate stylisation, reference landmarks,
silhouette, asymmetry, pose, clothing and expression requirements. Record which
proportions are reference-derived rather than generic anatomy estimates. Decide static
sculpt versus animated asset, required joint range and intended facial close-up distance.
Do not silently assign age, sex, body type or character cues absent from the brief.

## 2. Choose the starting method

| If the requirement is… | First candidate | Limit |
| --- | --- | --- |
| A simple stylised figure | Deliberate low-resolution cage with primary masses | Sphere stacking is a blockout, not resolved anatomy |
| Explicitly approved detailed sculpt/bake source or CGI exception | Sculpt/blockout of masses, then primary/secondary forms with a separate delivery plan | High resolution cannot repair incorrect proportions or prove runtime suitability |
| Animated body or face | Deformation-aware base cage, or sculpt plus scoped retopology | A good neutral sculpt is not animation-ready topology |
| A compatible existing rig/character | Inspect reusable cage, rest pose, weights and rights first | Do not change the representation or rig contract without approval |

When sculpting, use only verified live-context operations; consult the main skill's
API and sculpt safety guidance. A failed operator is not evidence the form needs rebuilding.

## 3. Prove proportions and the required bend

1. Establish head, ribcage, pelvis and limb masses; locate shoulder/hip, elbows/knees,
   hands/feet and ground contact. Use reference landmarks, not one universal head-count.
2. Inspect neutral front, side, back and three-quarter views before muscles, face detail
   or clothing. Silhouette and body balance come before surface polish.
3. Preserve a neutral editable basis. Keep posed/expression variants separate.
4. For animation, construct one representative shoulder/hip and bend it through the
   required range. Inspect volume, compression and attachment from multiple views.
5. If expressions matter, test the mouth/eyelid region with one required expression,
   including eye/lip closure. Teeth and eyeballs must not merely hide missing surfaces.

**Editable controls:** skeletal landmarks, mass proportions, joint-loop placement,
symmetry, neutral cage, pose and expression keys. Separate anatomy correction from
weight correction. Hair/clothing may affect silhouette but must not conceal broken anatomy.

## 4. Diagnose the failure dimension

| If… | Inspect… | Test next |
| --- | --- | --- |
| The face/body looks wrong despite detail | Primary masses, planes and reference landmarks | Correct neutral proportions before wrinkles or accessories |
| A bend collapses | Rest geometry, loop direction, weights and joint centre separately | One controlled pose with isolated weight/topology changes |
| A joint looks detached | Complete connection/coverage in neutral and posed states | Oblique and opposite-side views, not only front |
| The face reads as attached primitives | Skull/jaw/cheek transitions and silhouette | Resolve primary continuous masses before adding features |
| Clothing intersects while moving | Underlying pose, clearance and garment support | Required motion test; do not shrink the body silently |

## 5. Method change and acceptance

Propose retopology or a different base only when a representative joint/face test shows
the existing controls cannot meet the required pose or form. A neutral render alone
does not prove that need. Preserve existing rig/keys and obtain approval before replacement.

Separate silhouette/anatomy, closed-solid or intentional-open topology, weights,
deformation and expression evidence. Check unweighted vertices and representative bends
before export if animated. A static prop need not be rigged merely to satisfy this module;
state motion checks as excluded when motion is explicitly out of scope.

## Related reading, not validation

[Blender Expert sculpting](https://github.com/edemaistre/blender-expert-skills/tree/main/blender-sculpting)
offers character-specific mass/plane critique. Its example proportions, defaults and
test claims are not universal anatomy requirements or local validation of this guide.
