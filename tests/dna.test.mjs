import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DNA_VERSION,
  defaultGenome,
  normalizeGenome,
  combineGenomes,
  expressGenome,
  hybridTargetFor,
  canSpeciesBreed,
  registerGene,
  listGenes,
} from '../src/dna.js';
import { registerSpecies } from '../src/species.js';

function seeded(seed = 123456789) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function inheritanceFixture() {
  const firstGenes = {
    color: '#102030', size: .75, rigidity: .25, softness: .5,
    stretch: .5, material: 'bearGummy', hopPace: [.5, 1.5],
  };
  const secondGenes = {
    color: '#80c0e0', size: 1.25, rigidity: .5, softness: .75,
    stretch: 1.5, material: 'msnGummy', hopPace: [.75, 1.25],
  };
  return {
    bearA: defaultGenome('bear', { genes: firstGenes }),
    bearB: defaultGenome('bear', { genes: { ...secondGenes, material: 'bearGummy' } }),
    msnB: defaultGenome('msn', { genes: secondGenes }),
  };
}

test('default genomes carry the current version and species baseline', () => {
  const bear = defaultGenome('bear');
  const gummy = defaultGenome('msn');
  const glass = defaultGenome('glass');

  assert.equal(bear.version, DNA_VERSION);
  assert.deepEqual(bear.species, { bear: 1 });
  assert.equal(bear.genes.material, 'bearGummy');
  assert.equal(gummy.genes.material, 'msnGummy');
  assert.ok(gummy.genes.rigidity < bear.genes.rigidity);
  assert.equal(glass.genes.rigidity, 1);
  assert.equal(glass.genes.softness, 0);
  assert.equal(glass.genes.material, 'glass');
});

test('genome normalization clamps and orders inherited traits', () => {
  const genome = normalizeGenome({
    species: { bear: 1 },
    genes: {
      color: '  #AABBCC  ',
      size: 99,
      rigidity: -5,
      softness: 9,
      stretch: 99,
      material: 'glass',
      hopPace: [3, .2],
    },
  });

  assert.equal(genome.genes.color, '#AABBCC');
  assert.equal(genome.genes.size, 1.6);
  assert.equal(genome.genes.rigidity, 0);
  assert.equal(genome.genes.softness, 1);
  assert.equal(genome.genes.stretch, 2);
  assert.deepEqual(genome.genes.hopPace, [.2, 3]);
  assert.equal(genome.genes.material, 'glass');
});

test('same-species combination stays in species and is deterministic', () => {
  const bear = defaultGenome('bear');
  const first = combineGenomes(bear, bear, { rng: seeded(7), mutation: .04 });
  const second = combineGenomes(bear, bear, { rng: seeded(7), mutation: .04 });

  assert.deepEqual(first, second);
  assert.ok(first.species.bear > .99);
  assert.equal(first.hybridTarget, null);
});

test('translation fixtures: fixed inheritance outputs and RNG draw counts', () => {
  const { bearA, bearB, msnB } = inheritanceFixture();
  const inherited = {
    color: '#487088', size: 1, rigidity: .375, softness: .625,
    stretch: 1, hopPace: [.625, 1.375],
  };
  const cases = [
    {
      label: 'same species',
      other: bearB,
      species: { bear: 1 },
      genes: { ...inherited, material: 'bearGummy' },
      hybridTarget: null,
    },
    {
      label: 'mixed species',
      other: msnB,
      species: { bear: .5, msn: .5 },
      genes: { ...inherited, material: 'msnGummy' },
      hybridTarget: 'bear-msn',
    },
  ];
  for (const item of cases) {
    let draws = 0;
    const result = combineGenomes(bearA, item.other, {
      mutation: .04,
      rng: () => { draws += 1; return .5; },
    });
    assert.equal(draws, 10, `${item.label}: color 3 + five genes 1 each + hopPace 2`);
    assert.deepEqual(result.species, item.species, item.label);
    assert.deepEqual(result.genes, item.genes, item.label);
    assert.equal(result.hybridTarget, item.hybridTarget, item.label);
    assert.equal(result.phenotype, 'softbody-bear', item.label);
  }
});

test('translation fixtures: seeded inheritance outputs and draw order', () => {
  const { bearA, bearB, msnB } = inheritanceFixture();
  const inherited = {
    color: '#3f6580',
    size: 0.9972803003057837,
    rigidity: 0.3770659795805812,
    softness: 0.6283276194415987,
    stretch: 0.9940259193077683,
    hopPace: [0.5932915655896067, 1.3520984780229628],
  };
  const cases = [
    {
      label: 'same species',
      other: bearB,
      species: { bear: 1 },
      genes: { ...inherited, material: 'bearGummy' },
      hybridTarget: null,
    },
    {
      label: 'mixed species',
      other: msnB,
      species: { bear: .5, msn: .5 },
      genes: { ...inherited, material: 'msnGummy' },
      hybridTarget: 'bear-msn',
    },
  ];
  const parentsBefore = JSON.stringify([bearA, bearB, msnB]);
  for (const item of cases) {
    let draws = 0;
    const rng = seeded(11);
    const result = combineGenomes(bearA, item.other, {
      mutation: .04,
      rng: () => { draws += 1; return rng(); },
    });
    assert.equal(draws, 10, `${item.label}: color 3 + five genes 1 each + hopPace 2`);
    assert.deepEqual(result.species, item.species, item.label);
    assert.deepEqual(result.genes, item.genes, item.label);
    assert.equal(result.hybridTarget, item.hybridTarget, item.label);
    assert.equal(result.phenotype, 'softbody-bear', item.label);
  }
  assert.equal(JSON.stringify([bearA, bearB, msnB]), parentsBefore,
    'inheritance must not mutate either parent genome');
});

test('Bear x Gummy retains both species weights and a deferred hybrid target', () => {
  const hybrid = combineGenomes(defaultGenome('bear'), defaultGenome('msn'), {
    rng: seeded(11),
    mutation: .04,
  });

  assert.ok(hybrid.species.bear > 0);
  assert.ok(hybrid.species.msn > 0);
  assert.equal(hybrid.hybridTarget, 'bear-msn');
  assert.equal(hybridTargetFor('bear', 'msn'), 'bear-msn');
  assert.equal(hybridTargetFor('glass', 'msn'), 'msn-glass');

  const phenotype = expressGenome(hybrid);
  assert.equal(phenotype.hybridTarget, 'bear-msn');
  assert.equal(phenotype.kind, 'softbody');
});

test('all three shipped species pass the current reproduction gate', () => {
  for (const [a, b] of [['bear', 'msn'], ['bear', 'glass'], ['msn', 'glass']]) {
    const forward = canSpeciesBreed(a, b, { current: true });
    const reverse = canSpeciesBreed(b, a, { current: true });
    assert.equal(forward.ok, true, `${a} x ${b}`);
    assert.equal(reverse.ok, true, `${b} x ${a}`);
    assert.ok(forward.hybridTarget, `${a} x ${b} hybrid target`);
  }
  assert.equal(canSpeciesBreed('bear', 'missing').ok, false);
});

test('Glass expression keeps the skinned capabilities and cannot be possessed', () => {
  const phenotype = expressGenome(defaultGenome('glass'));
  assert.equal(phenotype.resolvedSpecies, 'glass');
  assert.equal(phenotype.kind, 'skinned');
  assert.equal(phenotype.capabilities.canReproduce, true);
  assert.equal(phenotype.capabilities.canPossess, false);
  assert.equal(phenotype.capabilities.hasLife, true);
});

test('a registered gene flows through a fixture species without editing DNA internals', () => {
  registerGene({ id: 'fixtureTone', type: 'number', min: 0, max: 1, fallback: .4, mutate: .2 });
  assert.ok(listGenes().some(gene => gene.id === 'fixtureTone'));
  assert.throws(() => registerGene({ id: 'fixtureTone', type: 'number', min: 0, max: 1 }), /already registered/);

  registerSpecies({
    id: 'fixture-gene',
    label: 'Fixture Gene',
    kind: 'softbody',
    genetics: {
      version: 1,
      phenotype: 'fixture-gene',
      loci: ['size', 'fixtureTone'],
      defaults: { size: 1, fixtureTone: .25 },
    },
  });

  const genome = defaultGenome('fixture-gene');
  assert.equal(genome.genes.fixtureTone, .25);
  assert.equal(normalizeGenome({ species: { 'fixture-gene': 1 }, genes: { fixtureTone: 9 } }).genes.fixtureTone, 1);

  const child = combineGenomes(genome, genome, { rng: seeded(17), mutation: .04 });
  assert.ok(child.genes.fixtureTone >= 0 && child.genes.fixtureTone <= 1);
  assert.equal(expressGenome(child).genes.fixtureTone, child.genes.fixtureTone);
});
