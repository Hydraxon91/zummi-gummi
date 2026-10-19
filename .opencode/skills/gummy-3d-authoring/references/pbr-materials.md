# PBR materials and glTF (Blender 5.2.2 LTS)

Adapted selectively from `blender-pbr-materials`; see `../THIRD_PARTY.md`.
The parent skill and `AGENTS.md` remain authoritative. Do not overwrite a shared material,
change a view transform or bake textures without confirming the asset scope.

## Inspect first

- Identify every material slot, its users, texture paths, image sizes and color spaces.
- Confirm the delivery target and whether the asset is stylized or measured. A physically
  based workflow is a tool, not a requirement to add grunge or roughness noise to a
  deliberately clean or cartoon asset.
- Record the current view transform. Judge material color under the transform the asset will
  be reviewed in, not an extreme look.
- Preserve unrelated materials and shader nodes. If a material is shared, duplicate it before
  changing it for one asset.

## Principled BSDF in 5.2.2

`Material.use_nodes` is deprecated (Blender warns it is expected to be removed in 6.0).
New materials already have a node tree; obtain the Principled node by `type`, not by name.

Verified inputs include: `Base Color`, `Metallic`, `Roughness`, `IOR`, `Alpha`, `Thin Wall`,
`Normal`, `Subsurface Weight/Radius/Scale`, `Specular IOR Level`, `Specular Tint`,
`Anisotropic`, `Transmission Weight`, `Coat Weight/Roughness/Normal`, `Sheen Weight/Roughness`,
`Emission Color/Strength`, `Thin Film Thickness/IOR`.

- Base Color is albedo, not a lit render. Do not bake highlights or shadows into it unless
  that is an intentional stylized decision.
- Metallic is usually 0 for dielectrics or 1 for raw metal. Intermediate values belong only
  in transition pixels such as wear or dirt. Painted metal is dielectric.
- Roughness does most of the realism work, but a constant value is not automatically wrong.
  Vary it only where the reference shows variation.
- Leave IOR at 1.5 and `Specular IOR Level` at 0.5 for ordinary dielectrics unless the
  material is known (water, glass, diamond).
- `Thin Wall` is useful for leaves, paper and thin fabric; verify how the target exporter
  handles it before relying on it.

## Glass and transmission

Two approaches; pick one with the user and record which was used:

- **Alpha tint** (default for game assets): near-neutral base colour with a slight tint,
  Roughness 0.02–0.10, IOR 1.45, Alpha 0.4–0.6, `surface_render_method = 'BLENDED'`. Cheap and
  exports as glTF `BLEND`, but sorts badly where panes overlap and costs per-pixel blending.
- **Transmission**: `Transmission Weight` 1.0, Roughness 0.0–0.05, IOR 1.45. EEVEE needs
  raytracing enabled to refract; otherwise the pane reads as clear film. glTF needs
  `KHR_materials_transmission`, which the project loader may not support.

Alpha and transmission are not interchangeable: alpha also affects shadows and draw sorting,
while transmission keeps the surface in the depth buffer. Verify from outside and inside, and
check the exported `alphaMode`/extensions rather than inferring them from the Blender viewport.
A glass material datablock existing is not evidence that it is assigned — rebuilt panes start
with zero slots, so assert the slot list on the pane object.

## Color spaces

| Data | Color space |
| --- | --- |
| Base Color, Emission | `sRGB` |
| Roughness, Metallic, Normal, AO, Height, Opacity | `Non-Color` |
| ORM / packed data | `Non-Color` |

Color space is an image property, not a material property. Changing a shared image changes
it for every material that uses it. Set it before baking or exporting.

## glTF material path

Only image-texture → Principled chains export predictably. Procedural nodes, math and mix
nodes do not become glTF materials; bake them to textures first.

- glTF metallic-roughness uses **G = roughness, B = metallic**. Occlusion is a separate
  texture reference with **R = AO**. The bundled exporter can compose these channels from
  separate images or from an image plugged into a `glTF Material Output` group; it can also
  keep an already-composed texture. Verify the resulting GLB rather than assuming a wiring
  pattern round-trips.
- The exporter derives `alphaMode` from the Alpha node graph, not from Blender's Eevee
  `surface_render_method`. `DITHERED` and `BLENDED` are viewport/render methods. A material
  can export as `BLEND` when it looks dithered in Blender. Inspect the GLB `alphaMode` and
  cutoff when alpha matters.
- Prefer opaque materials where possible. Alpha blending has sorting and performance costs
  in three.js and other engines.
- Use power-of-two textures for game assets where practical. Keep PNG/PNG-like lossless data
  for normal maps; JPEG artifacts in normals are visible.
- One material per texture set is the default. Each extra material slot is a potential draw
  call; do not merge materials across large culling boundaries just to reduce the count.

## Normal maps

Blender, glTF and three.js use OpenGL-style tangent-space normals (Y+). Unreal and some
Substance presets use DirectX (Y−). Do not flip the green channel without knowing the source
and target convention. Bake and export with the same triangulation and tangent basis; otherwise
seams and shading artifacts appear even when the texture looks correct in Blender.

## Procedural materials

Procedural noise, wear, curvature masks and edge effects are appropriate for Blender review
renders. For a GLB, bake the result to the supported texture set. Do not ship a material that
only evaluates inside Blender and claim it is game-ready.

## Looking at the result

- `AgX` is Blender's photographic default. `Khronos PBR Neutral` is useful when comparing
  albedo and glTF parity; `Standard` is for pixel-matched textures/UI.
- The view-transform enum is dynamic and may report only a subset of identifiers. Probe by
  assigning a candidate inside `try/except TypeError` and read back the accepted value.
- Inspect base color, roughness, metallic and normal response separately in a neutral
  material view. Do not conceal a shape or material defect with colored lighting.
- `material.diffuse_color` affects only viewport solid/workbench display; rendered color comes
  from shader inputs.
- A metal's Base Color tints its specular reflection; lighting and roughness also affect colour.
  Coated or painted metal is not necessarily a fully metallic surface. Judge under neutral
  lighting before attributing a cast to the texture.
- Constant roughness and flat normals are valid for clean stylized assets. Wear and noise need
  reference evidence or user intent. Review material separation across the assembled asset,
  not just one body's maps; dark tyre albedo does not establish missing modeled tread.

## Verification

Run the local GLB inventory after export and inspect materials, images, vertex counts and
required extensions. That report is not a validator. When integration is approved, inspect
the asset in the project's pinned three.js runtime with its real lighting; a correct Blender
material is not proof of the in-game result.
