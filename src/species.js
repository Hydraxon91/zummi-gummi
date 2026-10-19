// Species registry. This is the data layer that lets app.js and future DNA
// resolve a race without growing another chain of species-specific branches.
//
// The registry intentionally describes capabilities and assets, not the hot
// metaball/Box3D implementation. Those stay specialized in app.js.

import * as BEAR_RIG from './config.js';
import { MSN_RIG } from './msnrig.js';

const registry = new Map();

function copyData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defineSpecies(def) {
  if (!def || typeof def.id !== 'string' || !def.id) throw new Error('species id required');
  if (!def.kind) throw new Error(`species ${def.id} kind required`);
  if (!def.label) throw new Error(`species ${def.id} label required`);
  const canBreed = def.canBreed !== false;
  const normalized = {
    id: def.id,
    label: def.label,
    plural: def.plural || def.label,
    kind: def.kind,                    // 'softbody' | 'skinned'
    castGroup: def.castGroup || def.id,
    breedGroup: def.breedGroup || def.id,
    compatibility: Array.isArray(def.compatibility) ? def.compatibility.slice() : [def.id],
    rig: def.rig || null,
    asset: def.asset || null,
    material: def.material || 'flavor', // app resolves the actual material
    spriteFlavor: Number.isFinite(def.spriteFlavor) ? def.spriteFlavor : 3,
    studio: def.studio !== false,
    meadow: def.meadow !== false,
    roster: def.roster !== false,
    countsAsBear: !!def.countsAsBear,
    canGrab: def.canGrab !== false,
    canPossess: def.canPossess !== false,
    canBreed,
    canReproduce: def.canReproduce !== undefined ? !!def.canReproduce : canBreed,
    behavior: def.behavior || null,   // e.g. 'gummyTells'
    hasEyes: !!def.hasEyes,
    hasTells: !!def.hasTells,
    hasLife: !!def.hasLife,
    growth: def.growth || null,
    genetics: copyData(def.genetics) || null,
    hybrids: Array.isArray(def.hybrids) ? copyData(def.hybrids) : [],
    tags: Array.isArray(def.tags) ? def.tags.slice() : [],
  };
  registry.set(normalized.id, Object.freeze(normalized));
  return normalized;
}

function install(def) {
  return defineSpecies(def);
}

install({
  id: 'bear',
  label: 'Bear',
  plural: 'Bears',
  kind: 'softbody',
  castGroup: 'bear',
  breedGroup: 'bear',
  compatibility: ['bear', 'msn', 'glass'],
  rig: BEAR_RIG,
  material: 'flavor',
  spriteFlavor: 0,
  studio: true,
  meadow: true,
  roster: true,
  countsAsBear: true,
  canGrab: true,
  canPossess: true,
  canBreed: true,
  canReproduce: true,
  behavior: 'bear',
  hasEyes: true,
  hasTells: false,
  hasLife: true,
  growth: 'bearStages',
  genetics: {
    version: 1,
    phenotype: 'softbody-bear',
    loci: ['color', 'size', 'rigidity', 'softness', 'stretch', 'material', 'hopPace'],
    defaults: {
      color: 'flavor', size: 1, rigidity: .35, softness: .65,
      stretch: .8, material: 'bearGummy', hopPace: [.7, 1.8],
    },
  },
  hybrids: [
    { with: 'msn', target: 'bear-msn', status: 'deferred' },
    { with: 'glass', target: 'bear-glass', status: 'deferred' },
  ],
  tags: ['starter'],
});

install({
  id: 'msn',
  label: 'Gummy MSN',
  plural: 'MSN Buddies',
  kind: 'softbody',
  castGroup: 'msn',
  breedGroup: 'msn',
  compatibility: ['bear', 'msn', 'glass'],
  rig: MSN_RIG,
  material: 'msn',
  spriteFlavor: 3,
  studio: true,
  meadow: true,
  roster: true,
  countsAsBear: false,
  canGrab: true,
  canPossess: true,
  canBreed: true,
  canReproduce: true,
  behavior: 'gummyTells',
  hasEyes: false,
  hasTells: true,
  hasLife: true,
  growth: 'bearStages',
  genetics: {
    version: 1,
    phenotype: 'softbody-msn',
    loci: ['color', 'size', 'rigidity', 'softness', 'stretch', 'material', 'hopPace'],
    defaults: {
      color: '#86dd7d', size: 1, rigidity: .2, softness: .8,
      stretch: 1, material: 'msnGummy', hopPace: [.75, 1.75],
    },
  },
  hybrids: [
    { with: 'bear', target: 'bear-msn', status: 'deferred' },
    { with: 'glass', target: 'msn-glass', status: 'deferred' },
  ],
  tags: ['msn', 'softbody'],
});

install({
  id: 'glass',
  label: 'Glass MSN',
  plural: 'Glass MSNs',
  kind: 'skinned',
  castGroup: 'msn',
  breedGroup: 'glass',
  compatibility: ['bear', 'msn', 'glass'],
  rig: null,
  asset: 'assets/MSN_Figure/msn.glb',
  material: 'glass',
  spriteFlavor: 3,
  studio: true,
  meadow: true,
  roster: true,
  countsAsBear: false,
  canGrab: true,
  canPossess: false,
  canBreed: true,
  canReproduce: true,
  behavior: 'glassHover',
  hasEyes: false,
  hasTells: false,
  hasLife: true,
  growth: 'bearStages',
  genetics: {
    version: 1,
    phenotype: 'skinned-glass',
    loci: ['color', 'size', 'rigidity', 'softness', 'stretch', 'material', 'hopPace'],
    defaults: {
      color: '#a8e5ff', size: 1, rigidity: 1, softness: 0,
      stretch: 0, material: 'glass', hopPace: null,
    },
  },
  hybrids: [
    { with: 'bear', target: 'bear-glass', status: 'deferred' },
    { with: 'msn', target: 'msn-glass', status: 'deferred' },
  ],
  tags: ['msn', 'skinned', 'meadow', 'hover'],
});

export function getSpecies(id, fallback = 'bear') {
  return registry.get(id) || registry.get(fallback) || null;
}

export function speciesForRig(rig) {
  if (!rig) return getSpecies('bear');
  return getSpecies(rig.species || 'bear');
}

export function listSpecies() {
  return [...registry.values()];
}

export function registerSpecies(def) {
  if (registry.has(def && def.id)) throw new Error(`species already registered: ${def.id}`);
  return defineSpecies(def);
}

export function speciesCan(id, capability) {
  const def = getSpecies(id);
  return !!(def && def[capability]);
}
