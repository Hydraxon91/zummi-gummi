# Runtime assets

Every shipped GLB has a directory with three things:

1. The tracked `.glb` file.
2. `asset.json`, the machine-readable delivery manifest.
3. `README.md`, the human provenance, source and limits record.

`src/assets.js` validates the manifest, resolves the GLB beside it, and compares
the loaded mesh/bone/material/animation counts. `assets/catalog.json` maps stable
content IDs to manifests relative to the catalog directory. `src/assetstore.js`
owns the cache; species definitions reference its ID:

```js
{
  assetId: 'msn.glass',
  asset: 'assets/MyModel/model.glb',
  assetManifest: 'assets/MyModel/asset.json',
}
```

## Catalog and ownership

Catalog schema 1 contains an `assets` array. Each entry has a unique `id`,
`kind: 'gltf'`, relative `manifest` path, `groups` and `tags` arrays. The manifest
remains the authority for the GLB filename; do not duplicate it in the catalog.
Paths must stay within the asset directory (no external URLs or traversal).

```js
import { assetStore } from './assetstore.js';
const lease = await assetStore.acquire('msn.glass');
// Clone lease.gltf.scene with SkeletonUtils.clone; clone actor materials too.
// After removing that instance, stopping its mixer and disposing its skeletons
// and material copies (NOT shared textures or geometry):
lease.release();
```

- Concurrent acquisitions share one source load. A failed load reports an error,
  releases reservations and can be retried; no model is silently substituted.
- Every live clone retains a lease, including hidden instances. Hiding a model
  is not disposal. Skeletons, mixers and material parameters are per instance;
  geometry and texture objects remain source-owned.
- `preloadGroup('studio')` warms the cache without creating instances or leases.
  Runtime loading stays lazy; a map switch does not preload unrelated groups.
- `evictUnused()` explicitly disposes source resources only for ready records
  with zero leases. It never evicts pending/referenced sources. Zero-lease cache
  entries otherwise remain reusable across maps; no per-frame eviction work.
- `status()` / `__gummy.assets()` reports state, lease count, load attempts,
  errors and GLB byte length (not a GPU-memory estimate).
- Material looks remain consumer-owned. New material variants reuse a source
  ID and independent material parameters; new geometry needs its own catalog
  entry/manifest. Automatic variants, marketplaces and downloads are not implemented.

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
4. Add its catalog entry and species `assetId` (retain `asset`/`assetManifest`
   as descriptive compatibility fields); run `node --test tests`.
5. Load it in the Studio/Meadow and inspect captures.

Editable `.blend` files are local-only unless a zipped snapshot is explicitly
approved; the GLB, manifest and README are the tracked delivery.
