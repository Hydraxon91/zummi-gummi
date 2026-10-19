import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSpecies,
  speciesForRig,
  listSpecies,
  registerSpecies,
  speciesCan,
} from '../src/species.js';

test('registry ships bear, Gummy and Glass definitions', () => {
  const ids = listSpecies().map(species => species.id).sort();
  assert.deepEqual(ids, ['bear', 'glass', 'msn']);

  const bear = getSpecies('bear');
  const gummy = getSpecies('msn');
  const glass = getSpecies('glass');

  assert.equal(bear.kind, 'softbody');
  assert.equal(bear.countsAsBear, true);
  assert.equal(bear.canPossess, true);
  assert.equal(bear.hasEyes, true);

  assert.equal(gummy.kind, 'softbody');
  assert.equal(gummy.canPossess, true);
  assert.equal(gummy.hasTells, true);
  assert.equal(gummy.hasLife, true);

  assert.equal(glass.kind, 'skinned');
  assert.equal(glass.asset, 'assets/MSN_Figure/msn.glb');
  assert.equal(glass.assetManifest, 'assets/MSN_Figure/asset.json');
  assert.equal(glass.canPossess, false);
  assert.equal(glass.canReproduce, true);
  assert.equal(glass.meadow, true);
  assert.equal(glass.hasLife, true);
});

test('all three shipped species are reciprocally compatible', () => {
  const ids = ['bear', 'msn', 'glass'];
  for (const id of ids) {
    const species = getSpecies(id);
    assert.equal(species.canBreed, true, `${id} canBreed`);
    assert.equal(species.canReproduce, true, `${id} canReproduce`);
    for (const other of ids) {
      assert.ok(species.compatibility.includes(other), `${id} accepts ${other}`);
    }
  }
});

test('rig resolution and capability lookup use the registry', () => {
  assert.equal(speciesForRig(null).id, 'bear');
  assert.equal(speciesForRig(getSpecies('bear').rig).id, 'bear');
  assert.equal(speciesForRig(getSpecies('msn').rig).id, 'msn');
  assert.equal(speciesForRig({ species: 'glass' }).id, 'glass');
  assert.equal(getSpecies('missing').id, 'bear');
  assert.equal(getSpecies('missing', null), null);

  assert.equal(speciesCan('bear', 'canPossess'), true);
  assert.equal(speciesCan('glass', 'canPossess'), false);
  assert.equal(speciesCan('glass', 'hasLife'), true);
});

test('a fixture species registers without editing registry internals', () => {
  const bear = getSpecies('bear');
  const fixture = registerSpecies({
    id: 'fixture',
    label: 'Fixture',
    kind: 'softbody',
    breedGroup: 'fixture',
    compatibility: ['fixture'],
    rig: bear.rig,
    material: 'flavor',
    canGrab: true,
    canPossess: false,
    canBreed: false,
    canReproduce: false,
    hasLife: false,
    genetics: {
      version: 1,
      phenotype: 'fixture',
      loci: ['size'],
      defaults: { size: 1 },
    },
    hybrids: [],
  });

  assert.equal(fixture.id, 'fixture');
  assert.equal(getSpecies('fixture'), fixture);
  assert.equal(speciesCan('fixture', 'canPossess'), false);
  assert.ok(listSpecies().some(species => species.id === 'fixture'));
  assert.throws(() => registerSpecies({ ...fixture, label: 'Duplicate' }), /already registered/);
});
