# Species entry template

Use this when adding a race or an authored hybrid. A species entry describes
capabilities and assets; it does not implement the hot body path.

```js
registerSpecies({
  id: 'my-species',
  label: 'My Species',
  plural: 'My Species',
  kind: 'softbody',                    // 'softbody' | 'skinned'
  castGroup: 'my-species',
  breedGroup: 'my-species',
  compatibility: ['my-species'],
  rig: null,                           // required for softbody
  asset: null,                         // required for skinned
  assetManifest: null,                 // required when asset is set
  assetId: null,                       // stable ID in assets/catalog.json
  material: 'flavor',
  spriteFlavor: 3,
  studio: true,
  meadow: true,
  roster: true,
  countsAsBear: false,
  canGrab: true,
  canPossess: true,
  canBreed: true,
  canReproduce: true,
  behavior: null,                      // e.g. 'gummyTells', 'glassHover'
  hasEyes: false,
  hasTells: false,
  hasLife: true,
  growth: 'bearStages',
  genetics: {
    version: 1,
    phenotype: 'softbody-my-species',
    loci: ['color', 'size', 'rigidity', 'softness', 'stretch', 'material', 'hopPace'],
    defaults: {
      color: '#a8e5ff',
      size: 1,
      rigidity: .5,
      softness: .5,
      stretch: 1,
      material: 'flavor',
      hopPace: [.7, 1.8],
    },
  },
  hybrids: [],
  tags: [],
});
```

## Checklist

- [ ] Species id is stable and is not reused by an existing definition.
- [ ] `kind` matches the runtime representation: 24-body soft body or skinned GLB.
- [ ] `rig` is present for soft bodies; `asset` + `assetManifest` for skinned assets.
- [ ] Skinned assets have a catalog `assetId`; the adapter acquires a store lease,
      clones skeleton/material state, and releases it when disposing the instance.
- [ ] Compatibility is reciprocal with every species it can breed with.
- [ ] `canBreed` and `canReproduce` are intentionally separate.
- [ ] Capabilities match the runtime (grab, possession, life, eyes, tells).
- [ ] Genetics loci/defaults produce a neutral 1.0 scale for default actors.
- [ ] Hybrid targets are named and remain `deferred` until an authored asset exists.
- [ ] Asset manifest and GLB inventory match; `node --test tests` passes.
- [ ] Studio/meadow/roster flags are verified in-game.
- [ ] Save/load and `?race=off` behavior are verified when relevant.

Do not generate hybrid geometry at runtime or force one parent's rig to stand in
for a hybrid. A new silhouette is an authored asset plus a species entry.
