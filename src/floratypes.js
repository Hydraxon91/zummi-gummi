// Flora and home-style definitions. These are data, not builders: trees.js,
// bushes.js and homes.js still own geometry and rendering.
export const TREE_SPECIES = [
  { id: 'mature',      name: 'mature', trunk: 1.00, trunkR: 1.00, flare: .38, crownY: 1.00, crownR: 1.00, crownH: 1.00, primary: 4, fill: 1.00, leaf: 1.00, droop: .00, tint: 1.00 },
  { id: 'old',         name: 'old',    trunk: 0.92, trunkR: 1.22, flare: .52, crownY: 0.96, crownR: 1.08, crownH: 0.94, primary: 5, fill: 1.10, leaf: 1.06, droop: .35, tint: 0.94 },
  { id: 'slim',        name: 'slim',   trunk: 1.14, trunkR: 0.58, flare: .16, crownY: 1.08, crownR: 0.76, crownH: 1.16, primary: 3, fill: 0.82, leaf: 0.94, droop: .00, tint: 1.02 },
  { id: 'young',       name: 'young',  trunk: 0.62, trunkR: 0.56, flare: .22, crownY: 0.66, crownR: 0.66, crownH: 0.74, primary: 3, fill: 0.56, leaf: 0.84, droop: .00, tint: 1.07 },
  { id: 'mature_wide', name: 'mature', trunk: 1.04, trunkR: 1.02, flare: .40, crownY: 1.02, crownR: 1.02, crownH: 1.03, primary: 4, fill: 1.02, leaf: 1.00, droop: .05, tint: 1.00 },
];
// Keeps the authored tree sequence and the first two hive hosts unchanged.
export const TREE_SPECIES_ORDER = [
  'mature', 'old', 'slim', 'young', 'mature_wide',
  'slim', 'old', 'mature', 'young', 'slim',
];

export const BUSH_SPECIES = {
  meadow: {
    id: 'meadow',
    label: 'meadow shrub',
    branchColors: [0x60452f, 0x725137, 0x513a29],
    greens: [0x4f963b, 0x68ac4c, 0x3d8434, 0x7fbe5b],
  },
};

export const ROCK_SPECIES = {
  meadow: {
    id: 'meadow',
    label: 'meadow stone',
    hue: 0.30,
    saturation: 0.14,
    lightMin: 0.48,
    lightMax: 0.58,
  },
};

export const HOME_STYLES = {
  pavilion: { id: 'pavilion', label: 'Aero pavilion', interiorAsset: null },
  dome:     { id: 'dome',     label: 'Aero dome',     interiorAsset: null },
  saucer:   { id: 'saucer',   label: 'Aero saucer',   interiorAsset: null },
  tower:    { id: 'tower',    label: 'Aero tower',    interiorAsset: null },
};
// Preserves the current villa style sequence.
export const HOME_STYLE_ORDER = [
  'pavilion', 'dome', 'saucer', 'tower',
  'pavilion', 'saucer', 'dome', 'tower',
];

export function getTreeSpecies(id) {
  return TREE_SPECIES.find(species => species.id === id) || null;
}
export function getBushSpecies(id) {
  return BUSH_SPECIES[id] || null;
}
export function getRockSpecies(id) {
  return ROCK_SPECIES[id] || null;
}
export function getHomeStyle(id) {
  return HOME_STYLES[id] || null;
}
