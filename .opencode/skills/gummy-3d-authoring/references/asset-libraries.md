# Asset-library imports: tested workflow

Evidence: pond-scene trials, 2026-10-19–20; Blender 5.2.2, Blender MCP addon 1.8,
protocol 13. Findings are sample-specific unless the tool itself required the argument.
These procedures do not authorize downloads outside approved scope or game integration.

## Provider findings

### Poly Haven

- Supply `asset_type` (`models`, `textures`, or `hdris`); the tested importer did not infer it.
- Models generally arrived at plausible metre scale. Search dimensions can describe a pack
  rather than an individual specimen: measure the imported object before trusting them.
- Texture resolution does not limit geometry. A 1K request imported a 2.23-million-triangle
  tree. Inspect evaluated triangle counts and texture memory before duplication.
- Plant packs can include multiple specimens, LODs and helper/preview geometry. Classify the
  new objects before joining, hiding or scattering. Do not join everything by name prefix.
- Textures arrive as materials; assign with `apply_to` or explicitly preserve the material
  before saving. An unused material can disappear on reload.
- For a texture covering 2.17 m, UVs expressed as world metres / 2.17 with mapping scale 1
  provide life-sized tiling. Verify UV axes and actual node connections in a close capture.
- HDRI import changes the active world. Record/preserve the previous world and inspect the
  new lighting. A later world replacement means the HDRI is no longer the active environment.

### Sketchfab

- Supply `target_size` in metres (largest dimension).
- Normalization can live on a root empty's scale; axis conversion can live in its quaternion.
  Compose transforms or use a placement controller. Replacing the root scale or switching
  rotation modes without preserving the matrix produced enormous or incorrectly oriented assets.
- FBX-derived hierarchies may have substantial internal offsets. Place using evaluated bounds
  of descendant meshes; an empty's location or zero-sized bounds are not the model footprint.
- The tested butterfly retained its armature/action. Verify each new asset independently.
- CC-BY and CC-BY-NC downloads were exercised. Download success is not legal clearance;
  preserve author, source URL and exact licence even for private experiments. Tested imports
  did not consistently carry attribution custom properties.

### Poly Pizza

- Measure scale and origin per asset: tested examples ranged from correctly sized humans to
  hundreds-of-metres vegetation with large scene-space offsets.
- A conversion scale of 100 may reside on a mesh, armature or ancestor. Inspect the complete
  hierarchy; do not apply one hardcoded normalization recipe to every import.
- A single asset can contain dozens or hundreds of objects. Record the import delta and
  classify parts before assembly. Prefix matching accidentally joined only part of one tuft.
- Tested rigged assets retained clips, but characters selected `Death` initially and other
  NLA tracks were muted. Explicitly choose the intended action/slot/track and repetition.
- Additional unparented icospheres appeared during rigged-import trials. Their origin was not
  isolated conclusively. Inspect the import delta and quarantine confirmed helpers with
  viewport AND render exclusion; do not automatically delete similarly named objects.
- Attribution/licence custom properties were supplied on tested imports. Inspect where they
  live and preserve them when copying or joining; do not assume every child carries them.

## Required acceptance loop

1. Record pre-import object/material/image/action inventories. Import one asset at a time;
   identify the exact new datablocks, including linked collections and dependencies.
2. Record provider, ID, URL, author, licence, arguments and result. Inspect parents, modifiers,
   shared data, images, material wiring, missing files and evaluated geometry counts.
3. Preserve an untouched source hierarchy in a clearly excluded source collection. Hiding an
   empty alone does not exclude its children from rendering. Copied objects inherit hide flags.
4. Establish metres and intended dimensions before placement: height, footprint and relevant
   component sizes (e.g. bamboo culm diameter is not clump width). Use evaluated mesh bounds
   including instances, then inspect physical landmarks and a human-scale comparison capture.
5. Place through a controller without discarding import conversions. For recentering, distinguish
   mesh-local coordinates from world coordinates; world minima include the current location.
   Validate the calculation on one known instance before scattering.
6. Inspect the complete interface: ground contact, penetration, attachments and neighboring
   clearance. Bounds alone do not prove fit. A black sphere in rocks is not a constructed cave.
7. Verify animation across the delivery range: active action/slot, NLA muting, strip range,
   repetition, deformation, foot contact, direction, sliding and loop seams. Compare evaluated
   vertices in object-local space separately from world motion; a path does not prove swimming.
8. Save a new checkpoint after each accepted system, before expensive renders. A timeout is
   unknown execution state: inspect scene and output files before retrying, never blindly rerun.

## Resource and render safeguards

- Budget evaluated triangles, materials, textures and instances before scatter. Prefer linked
  instances or Geometry Nodes where appropriate. Joining thousands of objects reduces object
  overhead but does not reduce triangles, shading work or memory.
- Render a representative timing sample before an animation; preserve existing output sequences
  under distinct names. Report preview resolution/samples separately from final-quality renders.
- Check the entire camera route for collisions, occlusion and near-lens props. Test day/night
  at fixed viewpoints separately from camera movement. Counts and a hero frame prove neither.
- Inspect and restore temporary VSE/compositor state in `finally`. A failed encoding attempt
  left a VSE strip that silently replaced subsequent scene renders in the pond trials.
- Probe the installed Blender API instead of copying enum/property names. The observed FFmpeg
  assignment failures remain unresolved API/context findings, not proof that Blender lacks
  encoding support. APNG chunk validation alone does not establish successful playback.
- Report structural, visual, animation, licensing/provenance and destination-engine verification
  separately. Mixed high-detail and stylized assets do not become high fidelity by triangle count.
