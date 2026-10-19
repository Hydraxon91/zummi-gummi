# MSN Buddy asset

`msn.glb` is the tracked delivery asset for the Studio MSN prototype and the
Meadow Glass adapter. `asset.json` is the machine-readable inventory checked by
`tests/asset.test.mjs`; this file explains the delivery and its known limits.

## Delivery

| Field | Value |
|---|---|
| File | `msn.glb` |
| SHA-256 | `5a111700482b1dd2ec60775c187873a049223dd734ff9d4334a7a45dc79a7158` |
| Bytes | 228,852 |
| Generator | Khronos glTF Blender I/O v5.2.40 |
| Scale | 1 unit = 1 m; Y-up; no root scale |
| Local POSITION bounds | X ±0.6015 m, Y 0…1.5730 m, Z ±0.4494 m |
| Meshes | 3 (`armL.003`, `armR.003`, `torso_mesh.001`) |
| Vertices / triangles | 2,878 / 5,744 |
| Skin | 1 (`MSN_Anim`, 9 joints) |
| Clips | 10: BigWave, Cheer, Handshake, Hop, Idle, Lean, Nod, Squash, Wave, Wiggle |
| Material | 1 (`MSN Buddy`) |
| Images | None |
| Extensions used | `KHR_materials_transmission`, `KHR_materials_ior` |

The material is the glass look: transmission 1, IOR 1.45, metallic 0,
roughness 0.1 and a strong reflective clearcoat supplied by the runtime
environment.

## Source and backup

The editable Blender checkpoints (`msn_001.blend` … `msn_008.blend`,
`msn.blend`, and `.blend1` backups) are intentionally ignored by git. The
latest local checkpoint is `msn_008.blend`; the tracked delivery is the GLB
and this manifest.

**Decision:** keep the editable `.blend` source out of git for now. It must be
backed up outside the repository; an ignored local file is not a backup. If the
source needs to travel with the repository, add a zipped snapshot under
`snapshots/` with explicit approval rather than silently tracking large Blender
files.

## Provenance and rights

Authored in Blender for this project. Before public redistribution, record
whether the model or its references include third-party character, livery or
trademark material. The repository MIT licence covers the code; it does not by
itself establish rights to a character likeness.

## Validation

Run the inventory from the project root:

```sh
node scripts/glb-inventory.mjs assets/MSN_Figure/msn.glb
node --test tests
```

The inventory validates the GLB container and metadata counts. It does not
decode geometry, apply node transforms or replace the Khronos glTF validator.
The game-side check remains the Studio/Meadow browser harness: three skinned
meshes, nine bones, ten clips, Glass material values, hover, grab/throw and
save/load.

## Known limits

- The Studio prototype is single-instance; Meadow Glass clones the loaded GLB.
- Glass uses a rigid Box3D sphere proxy, not the 24-body metaball solver.
- The mesh is not clipped, so buried arm surfaces remain visible through the
  glass torso.
- The look is reflective and refractive, not a true mirror; there is no planar
  reflection probe.
