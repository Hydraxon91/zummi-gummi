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
    assetManifest: def.assetManifest || null,
    assetId: def.assetId || null,
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
  assetManifest: 'assets/MSN_Figure/asset.json',
  assetId: 'msn.glass',
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

const SOFTBODY_LANDMARKS = [
  'P_HEAD', 'P_CHEST', 'P_BELLY', 'P_HANDL', 'P_HANDR', 'P_FOOTL', 'P_FOOTR',
];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isArrayLike = value => value !== null && typeof value === 'object' &&
  Number.isInteger(value.length);

function finiteArray(value, length, { positive = false, nonNegative = false } = {}) {
  if (!isArrayLike(value) || value.length !== length) return false;
  for (let i = 0; i < length; i++) {
    const item = value[i];
    if (!Number.isFinite(item)) return false;
    if (positive && item <= 0) return false;
    if (nonNegative && item < 0) return false;
  }
  return true;
}

function validIndex(value, np) {
  return Number.isInteger(value) && value >= 0 && value < np;
}

function softbodyRigIssue(rig) {
  if (!isObject(rig)) return 'soft-body rig is missing';
  const np = rig.NP;
  if (!Number.isInteger(np) || np <= 0) return 'rig.NP is invalid';
  if (!Array.isArray(rig.RIG) || rig.RIG.length !== np) return 'rig.RIG is invalid';
  for (let i = 0; i < np; i++) {
    const point = rig.RIG[i];
    if (!isObject(point) || typeof point.n !== 'string' || !point.n) {
      return `rig.RIG[${i}] is invalid`;
    }
    for (const key of ['x', 'y', 'z', 'r', 'm', 'hz']) {
      if (!Number.isFinite(point[key])) return `rig.RIG[${i}].${key} is invalid`;
    }
    if (point.r <= 0 || point.m <= 0 || point.hz < 0) return `rig.RIG[${i}] is invalid`;
    if (!Number.isInteger(point.parent) || point.parent < -1 ||
        point.parent >= np || point.parent === i) {
      return `rig.RIG[${i}].parent is invalid`;
    }
  }
  if (!finiteArray(rig.REST, np * 3)) return 'rig.REST is invalid';
  if (!finiteArray(rig.MASS, np, { positive: true })) return 'rig.MASS is invalid';
  if (!finiteArray(rig.RSURF, np, { positive: true })) return 'rig.RSURF is invalid';
  if (!finiteArray(rig.RCOLL, np, { positive: true })) return 'rig.RCOLL is invalid';
  if (!finiteArray(rig.PARENT, np)) return 'rig.PARENT is invalid';
  if (!finiteArray(rig.PARENT_LEN, np, { nonNegative: true })) return 'rig.PARENT_LEN is invalid';
  if (!finiteArray(rig.JOINT_HZ, np, { nonNegative: true })) return 'rig.JOINT_HZ is invalid';
  for (let i = 0; i < np; i++) {
    const parent = rig.PARENT[i];
    if (!Number.isInteger(parent) || parent < -1 || parent >= np || parent === i) {
      return `rig.PARENT[${i}] is invalid`;
    }
  }
  if (!Number.isFinite(rig.TOTAL_M) || rig.TOTAL_M <= 0) return 'rig.TOTAL_M is invalid';
  if (!Number.isFinite(rig.REST_H) || rig.REST_H <= 0) return 'rig.REST_H is invalid';
  if (!Number.isFinite(rig.REST_COM_Y) || rig.REST_COM_Y <= 0) return 'rig.REST_COM_Y is invalid';
  if (!Number.isFinite(rig.REST_DY)) return 'rig.REST_DY is invalid';
  if (!Array.isArray(rig.PTS) || rig.PTS.length !== np) return 'rig.PTS is invalid';
  for (let i = 0; i < np; i++) {
    const point = rig.PTS[i];
    if (!isObject(point)) return `rig.PTS[${i}] is invalid`;
    for (const key of ['x', 'y', 'z', 'r', 'm']) {
      if (!Number.isFinite(point[key])) return `rig.PTS[${i}].${key} is invalid`;
    }
  }
  if (!Array.isArray(rig.CAPS)) return 'rig.CAPS is invalid';
  for (let i = 0; i < rig.CAPS.length; i++) {
    const cap = rig.CAPS[i];
    if (!Array.isArray(cap) || cap.length !== 3 ||
        !validIndex(cap[0], np) || !validIndex(cap[1], np) ||
        !Number.isFinite(cap[2]) || cap[2] <= 0) {
      return `rig.CAPS[${i}] is invalid`;
    }
  }
  if (!Array.isArray(rig.BRACES)) return 'rig.BRACES is invalid';
  for (let i = 0; i < rig.BRACES.length; i++) {
    const brace = rig.BRACES[i];
    if (!Array.isArray(brace) || brace.length !== 4 ||
        !validIndex(brace[0], np) || !validIndex(brace[1], np) ||
        brace[0] === brace[1] ||
        !Number.isFinite(brace[2]) || brace[2] < 0 ||
        !Number.isFinite(brace[3]) || brace[3] < 0) {
      return `rig.BRACES[${i}] is invalid`;
    }
  }
  for (const key of SOFTBODY_LANDMARKS) {
    if (!validIndex(rig[key], np)) return `rig.${key} is invalid`;
  }
  return null;
}

function isShippedGlass(def) {
  const glass = registry.get('glass');
  return !!glass && def.id === 'glass' && def.kind === 'skinned' &&
    def.asset === glass.asset &&
    def.assetManifest === glass.assetManifest &&
    def.assetId === glass.assetId;
}

// Narrow runtime admission, not a universal representation validator. Registration
// stays permissive for unhosted definitions; callers use this before creating or
// restoring an actor. `expectedKind` maps a save collection to the host it needs.
export function speciesRuntimeIssue(def, rig = def && def.rig, { expectedKind = null } = {}) {
  if (!def || typeof def.id !== 'string' || !def.id) return 'species is not registered';
  if (expectedKind && def.kind !== expectedKind) {
    return `species "${def.id}" representation is unsupported: kind "${def.kind}" is not "${expectedKind}"`;
  }
  if (def.kind === 'skinned') {
    if (!isShippedGlass(def)) {
      return `species "${def.id}" representation is unsupported: only the shipped glass skinned adapter is hosted`;
    }
    return null;
  }
  if (def.kind !== 'softbody') {
    return `species "${def.id}" representation is unsupported: kind "${def.kind}" has no host`;
  }
  const rigIssue = softbodyRigIssue(rig);
  if (rigIssue) return `species "${def.id}" representation is unsupported: ${rigIssue}`;
  const marker = rig.species === undefined ? 'bear' : rig.species;
  if (typeof marker !== 'string' || !marker) {
    return `species "${def.id}" representation is unsupported: rig species marker is invalid`;
  }
  if (marker !== def.id) {
    return `species "${def.id}" representation is unsupported: rig species marker "${marker}" does not match`;
  }
  return null;
}

export function requireSpeciesRuntime(def, rig = def && def.rig, options = {}) {
  const issue = speciesRuntimeIssue(def, rig, options);
  if (issue) throw new Error(`${options.context || 'runtime'}: ${issue}`);
  return def;
}

// Saved skinned/Glass records are prevalidated as a complete list before the
// adapter constructs any actor, so one bad later entry cannot leave a partial
// restore. Missing kind/species keeps the legacy Glass defaults.
export function glassRestoreIssue(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return 'actor record is invalid';
  }
  if (state.kind !== undefined && state.kind !== 'glass' && state.kind !== 'skinned') {
    return `actor kind "${state.kind}" is not supported by the glass adapter`;
  }
  if (state.species !== undefined && state.species !== 'glass') {
    return `species "${state.species}" is not supported by the glass adapter`;
  }
  return null;
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
