# Texture baking (Blender 5.2.2 LTS, Cycles)

Adapted selectively from `blender-texture-baking`; see `../THIRD_PARTY.md`.
The parent skill and `AGENTS.md` remain authoritative. Baking is destructive only when it
writes images or changes materials; checkpoint first and work on an approved copy.

## When to bake

- **High → low:** transfer sculpt/boolean/bevel detail to a game mesh as a normal map, with
  AO or other supporting maps.
- **Procedural → texture:** convert noise, wear, gradients or other Blender-only shading into
  images that glTF can use.
- **Multires:** bake from the sculpt level to the low/UV mesh.

Do not bake to compensate for an unresolved silhouette, incorrect UVs, a missing hard-edge
seam or a broken boolean. Those failures remain visible in the texture.

## Prepare the low mesh

1. Confirm the approved low mesh, its UV map, material slots and object scale.
2. Inspect UV overlap, zero-area faces, padding and orientation. A bake needs a single
   unambiguous UV layout; mirrored/stacked islands must be moved or baked separately.
3. Put a UV seam on hard normal edges. The seam does not create the hard edge; it gives the
   bake a clean boundary.
4. Triangulate the low the same way the target will. Mismatched triangulation produces
   shading seams even with a good normal map.
5. Apply transforms only in the approved scope; check shared meshes, parenting and animation
   first. Distance-based cage/extrusion values are in object/world units.

## Prepare the high mesh and cage

- The high must cover the low and protrude only slightly. Floaters such as bolts must remain
  inside the extrusion distance.
- Extrusion must exceed the farthest high-to-low projection. Too small gives holes; too large
  lets neighboring parts project into the map.
- Use a cage when uniform extrusion fails at concave corners or thin parts. A cage is a copy
  of the low with the same topology, inflated locally. Keep it editable and out of the export.
- For multiple parts, bake per part or separate the pairs so adjacent objects do not project
  onto each other. Restore positions afterward.

## Verified 5.2.2 API split

This is important: `bpy.types.BakeSettings.type` exposes only `NORMALS`, `DISPLACEMENT` and
`VECTOR_DISPLACEMENT` in 5.2.2. The operator enum has the wider set, including `COMBINED`,
`AO`, `SHADOW`, `POSITION`, `NORMAL`, `UV`, `ROUGHNESS`, `EMIT`, `ENVIRONMENT`, `DIFFUSE`,
`GLOSSY` and `TRANSMISSION`.

Use the operator form for those passes, for example:

```python
bpy.context.scene.render.engine = "CYCLES"
bpy.context.scene.render.bake.use_selected_to_active = True
bpy.context.scene.render.bake.margin = 16
bpy.context.scene.render.bake.normal_space = "TANGENT"
bpy.ops.object.bake(type="NORMAL", use_clear=True)
```

Do not set `scene.render.bake.type = "AO"` and assume it works; in 5.2.2 that property exposes
only normal/displacement, while the operator carries the wider pass enum. `CURVATURE`, `ID`
and similar maps are not built-in operator types in this build: curvature can be derived from
the baked normal map, while ID requires a material/emission override or equivalent setup.

## Map guide

| Map | Space / source | Notes |
| --- | --- | --- |
| Normal | Non-Color, tangent, OpenGL | 8-bit is usually enough; match target tangent basis |
| AO | Non-Color | Bake high-only unless contact AO is wanted |
| Roughness / Metallic | Non-Color | Can be baked from Principled inputs via a controlled emission setup |
| Base Color | sRGB | Use an emission override or a documented material setup; do not bake lighting into albedo |
| ORM | Non-Color | R=AO, G=Roughness, B=Metallic for glTF/Unreal; verify the exporter's packing |
| Curvature / ID | Non-Color / sRGB | Curvature derives from the baked normal; ID needs a material/emission override |

Unity uses a different metallic/smoothness packing. Confirm the target before composing a
single packed texture.

## Image targets and saving

- The bake target image must be the active Image Texture node in every material of the low
  object, or the bake writes somewhere unexpected.
- Create images at the intended resolution with the correct color space. `Non-Color` for data,
  `sRGB` for base color/emission.
- Set an adequate margin (for example 8 px at 1k/2k, 16 px at 4k, depending on the target and
  mip usage). Inspect seams at the final resolution.
- Save images explicitly. Packed or internal images can disappear on reload and are not a
  substitute for a written texture set.
- Keep the bake setup exception-safe: restore engine, bake settings, selection, active object,
  image nodes and temporary objects in `finally`.

## Multires and displacement

`use_multires` and `use_lores_mesh` exist on the bake settings. Verify the viewport level is
the low and the sculpt level is the high before baking. Displacement/vector displacement
require suitable geometry density and a deliberate midlevel; do not enable adaptive
subdivision on a mesh that will not be exported that way.

## Inspect the result

- Check the normal map in a lit material view for waviness, skewed details, black areas and
  seam mismatches. A flat neutral normal is not proof of a good bake.
- Confirm the map is actually connected through the intended Principled input, not merely
  present in the file.
- Re-run mesh QA on low and high first: flipped normals and floating chunks are common causes
  of bake garbage.
- Export the intended objects and inspect the GLB with the local inventory. Validate with
  Khronos tooling when available; structural validity still does not prove appearance.
- Do not claim game readiness from a successful bake. Runtime material, tangent and lighting
  behavior must be checked in the pinned three.js build when integration is approved.

## Performance and scope

Baking can be slow and GPU-dependent. Do not run a bake on the user's live scene merely to
test settings; use a disposable copy, a checkpoint or a small resolution first. Do not add
new baking dependencies or a pipeline tool without approval.
