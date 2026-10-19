// Genome model and inheritance rules. Species.js owns the vocabulary; this
// module owns combination, mutation and phenotype resolution. It deliberately
// does not import app.js, three.js or the save layer.

import { getSpecies } from './species.js';

export const DNA_VERSION = 1;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function knownSpecies(id) {
  return getSpecies(id, null);
}

function normalizeWeights(input) {
  const out = {};
  let total = 0;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [id, raw] of Object.entries(input)) {
      if (!knownSpecies(id)) continue;
      const weight = Number(raw);
      if (!Number.isFinite(weight) || weight <= 0) continue;
      out[id] = weight;
      total += weight;
    }
  }
  if (total <= 0) {
    out.bear = 1;
    return out;
  }
  for (const id of Object.keys(out)) out[id] /= total;
  return out;
}

function dominantSpecies(weights) {
  let id = 'bear', best = -1;
  for (const [candidate, weight] of Object.entries(weights)) {
    if (weight > best) { best = weight; id = candidate; }
  }
  return knownSpecies(id) || knownSpecies('bear');
}

function normalizeHopPace(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  const lo = clamp(Number(source?.[0]) || fallback[0], .2, 3);
  const hi = clamp(Number(source?.[1]) || fallback[1], .2, 3);
  return lo <= hi ? [lo, hi] : [hi, lo];
}

function normalizeColor(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function blendColor(a, b, rng) {
  const parse = (value) => {
    if (typeof value !== 'string') return null;
    let hex = value.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  };
  const ca = parse(a), cb = parse(b);
  if (!ca || !cb) return rng() < .5 ? a : b;
  // A small deterministic jitter keeps siblings from being identical without
  // pretending colour is a chemically exact blend.
  const mix = ca.map((v, i) => clamp(Math.round(v + (cb[i] - v) * (.35 + rng() * .3)), 0, 255));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

function mutateNumber(value, amount, rng) {
  return value + (rng() * 2 - 1) * amount;
}

// Gene definitions own bounds, fallbacks, mutation and inheritance. A species
// opts into genes through genetics.loci, so a new trait does not need another
// branch in normalizeGenome() or combineGenomes().
export const GENE_DEFS = Object.create(null);

export function registerGene(def) {
  if (!def || typeof def.id !== 'string' || !def.id) throw new Error('gene id required');
  if (GENE_DEFS[def.id]) throw new Error(`gene already registered: ${def.id}`);
  const type = def.type;
  if (type !== 'number' && type !== 'color' && type !== 'choice' && type !== 'range') {
    throw new Error(`gene ${def.id} type is invalid`);
  }
  const gene = {
    id: def.id,
    type,
    min: Number.isFinite(def.min) ? def.min : undefined,
    max: Number.isFinite(def.max) ? def.max : undefined,
    mutation: Number.isFinite(def.mutate) ? Math.max(0, def.mutate) : 0,
    fallback: Array.isArray(def.fallback) ? def.fallback.slice(0, 2) : def.fallback,
  };

  if (type === 'number') {
    if (!Number.isFinite(gene.min) || !Number.isFinite(gene.max) || gene.min > gene.max) {
      throw new Error(`gene ${def.id} bounds are invalid`);
    }
    gene.normalize = (value, fallback) => clamp(
      Number.isFinite(Number(value)) ? Number(value) : fallback, gene.min, gene.max,
    );
    gene.inherit = ({ a, b, rng, mutation }) => clamp(
      mutateNumber((a + b) * .5, mutation * gene.mutation, rng), gene.min, gene.max,
    );
  } else if (type === 'color') {
    gene.normalize = (value, fallback) => normalizeColor(value, fallback);
    gene.inherit = ({ a, b, rng }) => blendColor(a, b, rng);
  } else if (type === 'choice') {
    gene.normalize = (value, fallback) => typeof value === 'string' ? value : fallback;
    gene.inherit = ({ high, low, rng }) => rng() < .5 ? high : low;
  } else {
    gene.normalize = (value, fallback) => normalizeHopPace(value, fallback);
    gene.inherit = ({ a, b, rng, mutation }) => {
      const lo = clamp((a[0] + b[0]) * .5 + (rng() * 2 - 1) * mutation, gene.min, gene.max);
      const hi = clamp((a[1] + b[1]) * .5 + (rng() * 2 - 1) * mutation, gene.min, gene.max);
      return lo <= hi ? [lo, hi] : [hi, lo];
    };
  }
  GENE_DEFS[gene.id] = Object.freeze(gene);
  return gene;
}

export function listGenes() {
  return Object.values(GENE_DEFS);
}

registerGene({ id: 'color', type: 'color', fallback: null });
registerGene({ id: 'size', type: 'number', min: .35, max: 1.6, fallback: 1, mutate: .08 });
registerGene({ id: 'rigidity', type: 'number', min: 0, max: 1, fallback: 0, mutate: .12 });
registerGene({ id: 'softness', type: 'number', min: 0, max: 1, fallback: 0, mutate: .12 });
registerGene({ id: 'stretch', type: 'number', min: 0, max: 2, fallback: 0, mutate: .18 });
registerGene({ id: 'material', type: 'choice', fallback: null });
registerGene({ id: 'hopPace', type: 'range', min: .2, max: 3, fallback: [.7, 1.8], mutate: 1 });

function geneDefinitionsFor(def) {
  const loci = Array.isArray(def?.genetics?.loci) ? def.genetics.loci : [];
  const defs = loci.map(id => GENE_DEFS[id]).filter(Boolean);
  return defs.length ? defs : listGenes();
}

function defaultForGene(gene, defaults, def) {
  if (gene.id === 'color') return normalizeColor(defaults.color, gene.fallback);
  if (gene.id === 'material') {
    return defaults.material || def.material || gene.fallback;
  }
  if (gene.type === 'range') {
    return Array.isArray(defaults[gene.id]) ? defaults[gene.id] : gene.fallback;
  }
  return defaults[gene.id] !== undefined ? defaults[gene.id] : gene.fallback;
}

export function defaultGenome(speciesId = 'bear', overrides = {}) {
  const def = knownSpecies(speciesId) || knownSpecies('bear');
  const defaults = def.genetics?.defaults || {};
  return normalizeGenome({
    version: DNA_VERSION,
    species: { [def.id]: 1 },
    genes: { ...clone(defaults), ...clone(overrides.genes || {}) },
    phenotype: def.genetics?.phenotype || null,
    hybridTarget: null,
    ...overrides,
  });
}

export function normalizeGenome(input = {}) {
  const weights = normalizeWeights(input.species);
  const def = dominantSpecies(weights);
  const defaults = def.genetics?.defaults || {};
  const genes = { ...clone(defaults), ...(input.genes && typeof input.genes === 'object' ? clone(input.genes) : {}) };
  const outGenes = {};
  for (const gene of geneDefinitionsFor(def)) {
    outGenes[gene.id] = gene.normalize(genes[gene.id], defaultForGene(gene, defaults, def));
  }
  return {
    version: DNA_VERSION,
    species: weights,
    genes: outGenes,
    phenotype: input.phenotype || def.genetics?.phenotype || null,
    hybridTarget: typeof input.hybridTarget === 'string' ? input.hybridTarget : null,
  };
}

export function hybridTargetFor(a, b) {
  const defA = knownSpecies(typeof a === 'string' ? a : a?.id) || knownSpecies(a);
  const defB = knownSpecies(typeof b === 'string' ? b : b?.id) || knownSpecies(b);
  if (!defA || !defB) return null;
  const direct = (defA.hybrids || []).find(item => item.with === defB.id);
  if (direct) return direct.target;
  const reverse = (defB.hybrids || []).find(item => item.with === defA.id);
  return reverse ? reverse.target : null;
}

export function combineGenomes(parentA, parentB, options = {}) {
  const rng = options.rng || Math.random;
  const mutation = Number.isFinite(options.mutation) ? Math.max(0, options.mutation) : .04;
  const a = normalizeGenome(parentA);
  const b = normalizeGenome(parentB);
  const species = normalizeWeights(
    Object.fromEntries(
      [...new Set([...Object.keys(a.species), ...Object.keys(b.species)])]
        .map(id => [id, (a.species[id] || 0) * .5 + (b.species[id] || 0) * .5]),
    ),
  );
  const def = dominantSpecies(species);
  const aTop = Object.entries(a.species).sort((x, y) => y[1] - x[1])[0]?.[0] || 'bear';
  const bTop = Object.entries(b.species).sort((x, y) => y[1] - x[1])[0]?.[0] || 'bear';
  const high = aTop === def.id ? a : b;
  const low = high === a ? b : a;
  const genes = { ...clone(high.genes) };
  for (const gene of geneDefinitionsFor(def)) {
    genes[gene.id] = gene.inherit({
      a: a.genes[gene.id], b: b.genes[gene.id],
      high: high.genes[gene.id], low: low.genes[gene.id],
      rng, mutation,
    });
  }
  const hybridTarget = hybridTargetFor(aTop, bTop);
  return normalizeGenome({
    version: DNA_VERSION,
    species,
    genes,
    phenotype: def.genetics?.phenotype || null,
    hybridTarget,
  });
}

export function expressGenome(input) {
  const genome = normalizeGenome(input);
  const def = dominantSpecies(genome.species);
  const target = genome.hybridTarget ? knownSpecies(genome.hybridTarget) : null;
  const renderDef = target || def;
  return {
    version: DNA_VERSION,
    species: def.id,
    speciesWeights: { ...genome.species },
    phenotype: target?.genetics?.phenotype || genome.phenotype || def.genetics?.phenotype || null,
    hybridTarget: genome.hybridTarget,
    resolvedSpecies: renderDef.id,
    rigId: renderDef.id,
    kind: renderDef.kind,
    capabilities: {
      canGrab: renderDef.canGrab,
      canPossess: renderDef.canPossess,
      canReproduce: renderDef.canReproduce,
      hasLife: renderDef.hasLife,
      hasEyes: renderDef.hasEyes,
      hasTells: renderDef.hasTells,
    },
    genes: clone(genome.genes),
  };
}

export function canSpeciesBreed(a, b, { current = true } = {}) {
  const defA = knownSpecies(typeof a === 'string' ? a : a?.id) || knownSpecies(a);
  const defB = knownSpecies(typeof b === 'string' ? b : b?.id) || knownSpecies(b);
  if (!defA || !defB) return { ok: false, reason: 'unknown species', hybridTarget: null };
  if (current && (!defA.canReproduce || !defB.canReproduce ||
      !defA.compatibility.includes(defB.id) || !defB.compatibility.includes(defA.id))) {
    return { ok: false, reason: 'reproduction disabled or species incompatible', hybridTarget: null };
  }
  if (!current && (!defA.canBreed || !defB.canBreed ||
      !defA.compatibility.includes(defB.id) || !defB.compatibility.includes(defA.id))) {
    return { ok: false, reason: 'species incompatible', hybridTarget: null };
  }
  return { ok: true, reason: null, hybridTarget: hybridTargetFor(defA.id, defB.id) };
}
