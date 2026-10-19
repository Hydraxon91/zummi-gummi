# Runtime assets

Every shipped GLB has a directory with three things:

1. The tracked `.glb` file.
2. `asset.json`, the machine-readable delivery manifest.
3. `README.md`, the human provenance, source and limits record.

`src/assets.js` validates the manifest, resolves the GLB beside it, and compares
the loaded mesh/bone/material/animation counts. A species entry points at both
paths:

```js
{
  asset: 'assets/MyModel/model.glb',
  assetManifest: 'assets/MyModel/asset.json',
}
```

## Manifest schema

`schema` is currently `1`. Required fields are:

| Field | Meaning |
| --- | --- |
| `file` | Relative GLB path, resolved beside `asset.json` |
| `sha256` | Full SHA-256 of the delivered GLB |
| `bytes` | Exact byte length |
| `assetVersion` | Must be `2.0` |
| `meshCount`, `vertices`, `triangles` | Delivery inventory |
| `skinCount`, `boneCount` | Skinning inventory |
| `animationCount`, `animationNames` | Clip contract |
| `materialCount`, `materialNames` | Material contract |
| `meshNames`, `attributes` | Human/runtime inspection aids |
| `extensionsUsed`, `extensionsRequired` | glTF extension requirements |
| `bounds` | Local POSITION min/max and coordinate-space note |
| `source`, `provenance` | Editable source and rights record |

The runtime checks counts, not visual quality or GLB schema validity. Use
`node scripts/glb-inventory.mjs <file.glb>` for the full container report and
the in-game harness for appearance/load behavior.

## Adding an asset

1. Export only the intended objects and record the source `.blend` checkpoint.
2. Generate/inspect the GLB inventory.
3. Write `asset.json` from the inventory and add the human README.
4. Add `assetManifest` to the species entry and run `node --test tests`.
5. Load it in the Studio/Meadow and inspect captures.

Editable `.blend` files are local-only unless a zipped snapshot is explicitly
approved; the GLB, manifest and README are the tracked delivery.
