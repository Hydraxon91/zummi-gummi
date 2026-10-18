# Geometry Nodes (Blender 5.2.2 LTS)

Adapted selectively from `blender-geometry-nodes`; see `../THIRD_PARTY.md`.
The parent skill and `AGENTS.md` remain authoritative. Keep the editable source; do not
apply modifiers or merge the result into the scene without approval.

## Use it for

- Repeated props and kit pieces where an editable, parametric source is useful.
- Scatter, array-like layout, trim/panel patterns and controlled procedural variation.
- Authoring-time variation that will be evaluated into a static mesh or supported instances
  before export.

Geometry Nodes is an authoring tool, not a game-runtime dependency. The browser game must not
need Blender or a node graph at runtime.

## 5.2.2 API facts verified locally

- `node_group.interface.new_socket(...)` exists on the interface instance. The older
  `node_group.inputs.new(...)` API is gone.
- A Geometry Nodes modifier exposes inputs through
  `modifier.properties.inputs.<identifier>.value`. Interface identifiers may be `Socket_1`,
  `Socket_2`, ...; enumerate the interface rather than guessing names.
- Exposed group inputs can have UI names that differ from their identifiers. Use identifiers
  in scripts and report both when debugging.
- `node_group.is_tool` exists for node-tool authoring. Do not turn a production asset group
  into an operator merely to simplify a one-off edit.
- Look nodes up by `bl_idname`/`type`, and query socket names on the installed build. Do not
  hardcode socket labels from a tutorial.

## Data model

- **Geometry** flows through geometry sockets. **Fields** (diamond sockets) are evaluated by
  the node that consumes them, on that node's domain.
- Domains include point, edge, face, face corner, spline and instance. `Capture Attribute`
  freezes a field before topology changes; `Evaluate on Domain` converts deliberately.
- `Store Named Attribute` persists data after the modifier. It is how geometry-node data
  reaches shaders or exporters. Do not assume every node preserves UVs or custom attributes.
- Instances are cheap: one mesh plus many transforms. `Realize Instances` creates editable
  geometry and increases memory/counts. Realize as late as possible, and only when required
  by the downstream operation or export target.

## Build protocol

1. Sketch the data flow before wiring: source geometry → selections/masks → generate or
   instance → transform/variation → merge/realize → materials/shading → output.
2. Build in small, inspectable steps. Verify intermediate geometry and counts instead of
   building a large graph and debugging it as a whole.
3. Expose only meaningful inputs (density, seed, scale range, material). Set sensible ranges
   and document the identifiers.
4. Use a stable seed and drive randomness from an index/ID so results stay reproducible when
   counts change.
5. Keep units and object scale explicit. Apply transforms only in the approved scope; a
   distance input interpreted in object space can change with unapplied scale.
6. Preserve the source object and its modifiers. Work on an evaluated/export copy when testing
   realization, triangulation or export settings.

## Materials, UVs and shading

- Assign materials inside the graph with `Set Material`; the material must exist in the file.
  Instances retain their own materials.
- Primitive nodes can output UVs, but UVs may be dropped by some operations. Store a UV map
  as a named face-corner attribute when it must survive, and inspect the evaluated mesh.
- Geometry Nodes output does not automatically preserve smooth shading. Add explicit smooth
  shading and sharp-edge handling, then inspect the evaluated result.
- Do not use geometry nodes to hide a material or UV problem that will reappear in glTF.

## Export and runtime

- Exporters see the evaluated mesh. Decide deliberately whether to export realized geometry
  or supported GPU instances.
- `export_gpu_instances` exists on the bundled glTF exporter. The project's pinned three.js
  `GLTFLoader` includes `EXT_mesh_gpu_instancing`, but support still needs an actual export
  and runtime inspection. Do not assume a node instance count equals the final draw count.
- Realizing millions of instances is not a delivery strategy. Measure the evaluated triangle
  and instance counts and compare them with the approved budget.
- Static scenery should not depend on a simulation zone. Bake simulation results only when
  the asset genuinely needs them and the export format can carry the result.

## Verification

- Run the local QA helper on the evaluated target when it is a mesh. Check non-manifold
  boundaries, degenerate geometry, winding conflicts and evaluated counts.
- Run the UV report when UVs matter, and inspect the actual UV layout; the report does not
  prove packing or absence of overlap.
- Export only approved objects, then run the local GLB inventory and Khronos validation when
  available. Inspect the result in the pinned three.js runtime before claiming integration.
- Capture the graph inputs and seed so the result can be reproduced. A saved `.blend` is the
  editable source; a screenshot of the viewport is not.

## Gotchas

- Do not use `mod["Socket_2"]` in 5.2; use `mod.properties.inputs`.
- Sockets disabled for the current data type still exist. Set type/mode before linking, and
  query the enabled socket.
- `nt.interface.new_socket` is the current API; older `ng.inputs.new` examples fail.
- Applying a modifier frees its data; collect names first and re-fetch objects afterward.
- A node group can look correct in the viewport while the exported mesh differs because the
  exporter evaluated a different realization/instancing path. Always inspect the GLB.
- Do not enable experimental simulation/physics nodes for a static prop. They add complexity
  and are not part of the game's runtime stack.
