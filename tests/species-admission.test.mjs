import test from 'node:test';
import assert from 'node:assert/strict';
import * as BEAR_RIG from '../src/config.js';
import {
  getSpecies,
  glassRestoreIssue,
  registerSpecies,
  requireSpeciesRuntime,
  speciesRuntimeIssue,
} from '../src/species.js';
import { defaultGenome } from '../src/dna.js';
import { validateActorWorld } from '../src/actorsave.js';
import { SAVE_VERSION, normalizeSave, validateSave } from '../src/save.js';

const BEAR = getSpecies('bear');
const FIXTURE_ID = 'admission-fixture';
const FIXTURE_RIG = Object.freeze({ ...BEAR.rig, species: FIXTURE_ID });
const FIXTURE = registerSpecies({
  id: FIXTURE_ID,
  label: 'Admission Fixture',
  kind: 'softbody',
  rig: FIXTURE_RIG,
  genetics: {
    version: 1,
    phenotype: 'admission-fixture',
    loci: ['size'],
    defaults: { size: 1 },
  },
});
const RIGLESS = registerSpecies({
  id: 'admission-rigless',
  label: 'Rigless Soft Body',
  kind: 'softbody',
});
const ARBITRARY = registerSpecies({
  id: 'admission-arbitrary',
  label: 'Arbitrary Kind',
  kind: 'probe-kind',
});
const SKINNED = registerSpecies({
  id: 'admission-skinned',
  label: 'Unsupported Skinned',
  kind: 'skinned',
  asset: 'assets/MSN_Figure/msn.glb',
  assetManifest: 'assets/MSN_Figure/asset.json',
  assetId: 'probe.glass',
});
const MALFORMED_ID = 'admission-malformed';
const MALFORMED = registerSpecies({
  id: MALFORMED_ID,
  label: 'Malformed Rig',
  kind: 'softbody',
  rig: { ...BEAR.rig, species: MALFORMED_ID, MASS: BEAR_RIG.MASS.slice(0, -1) },
});
const MISMATCH_ID = 'admission-mismatch';
const MISMATCH = registerSpecies({
  id: MISMATCH_ID,
  label: 'Mismatched Marker',
  kind: 'softbody',
  rig: { ...BEAR.rig, species: 'bear' },
});

function bear(overrides = {}) {
  return {
    uid: 1,
    x: 1,
    z: 2,
    flavor: 0,
    stage: 'adult',
    genome: defaultGenome('bear'),
    ...overrides,
  };
}

function glass(overrides = {}) {
  return {
    kind: 'glass',
    species: 'glass',
    uid: 2,
    x: 3,
    z: 4,
    stage: 'baby',
    genome: defaultGenome('glass'),
    ...overrides,
  };
}

function payload(bears = [], glassActors = []) {
  const world = {
    bears,
    glass: glassActors,
    camera: null,
    launcher: null,
    time: 7,
    auto: true,
    speed: 1,
    initialized: true,
  };
  return {
    format: 'gummy-save',
    version: SAVE_VERSION,
    savedAt: 1,
    mapId: 'field',
    sky: null,
    worlds: { field: world, studio: { ...world, bears: [], glass: [] } },
  };
}

test('registration stays permissive and admission names the unsupported host', () => {
  assert.equal(getSpecies(RIGLESS.id), RIGLESS);
  assert.equal(getSpecies(ARBITRARY.id), ARBITRARY);
  assert.equal(getSpecies(SKINNED.id), SKINNED);
  assert.equal(getSpecies(MALFORMED.id), MALFORMED);
  assert.equal(getSpecies(MISMATCH.id), MISMATCH);

  assert.match(
    speciesRuntimeIssue(RIGLESS, RIGLESS.rig, { expectedKind: 'softbody' }),
    /soft-body rig is missing/,
  );
  assert.match(
    speciesRuntimeIssue(ARBITRARY, null, { expectedKind: 'softbody' }),
    /kind "probe-kind" is not "softbody"/,
  );
  assert.match(
    speciesRuntimeIssue(SKINNED, null, { expectedKind: 'skinned' }),
    /only the shipped glass skinned adapter is hosted/,
  );
  assert.equal(
    speciesRuntimeIssue(getSpecies('glass'), null, { expectedKind: 'skinned' }),
    null,
  );
  assert.equal(
    speciesRuntimeIssue(getSpecies('msn'), getSpecies('msn').rig, { expectedKind: 'softbody' }),
    null,
  );
  assert.equal(
    speciesRuntimeIssue(FIXTURE, FIXTURE_RIG, { expectedKind: 'softbody' }),
    null,
  );
});

test('save validation rejects rigless, arbitrary and unsupported skinned records', () => {
  const rigless = validateSave(payload([bear({ species: RIGLESS.id })]));
  assert.equal(rigless.ok, false);
  assert.match(rigless.errors.join('; '), /representation is unsupported: soft-body rig is missing/);

  const arbitrary = validateSave(payload([bear({ species: ARBITRARY.id })]));
  assert.equal(arbitrary.ok, false);
  assert.match(arbitrary.errors.join('; '), /species is not softbody/);

  const skinned = validateSave(payload([], [glass({ species: SKINNED.id })]));
  assert.equal(skinned.ok, false);
  assert.match(skinned.errors.join('; '), /only the shipped glass skinned adapter is hosted/);
});

test('save validation rejects malformed and mismatched soft-body rigs', () => {
  const malformed = [];
  validateActorWorld({ bears: [bear({ species: MALFORMED.id })] }, 'world', malformed);
  assert.match(malformed.join('; '), /rig.MASS is invalid/);

  const mismatch = [];
  validateActorWorld({ bears: [bear({ species: MISMATCH.id })] }, 'world', mismatch);
  assert.match(mismatch.join('; '), /rig species marker "bear" does not match/);

  const registryDef = { ...MALFORMED, id: 'admission-wrong-np', rig: {
    ...BEAR.rig, species: 'admission-wrong-np', NP: BEAR.rig.NP - 1,
  } };
  const issue = speciesRuntimeIssue(registryDef, registryDef.rig, { expectedKind: 'softbody' });
  assert.match(issue, /rig.RIG is invalid/);
});

test('explicit null or empty species never default to a host', () => {
  for (const species of [null, '']) {
    const check = validateSave(payload([bear({ species })]));
    assert.equal(check.ok, false);
    assert.match(check.errors.join('; '), /species is unknown/);
    assert.throws(() => normalizeSave(payload([bear({ species })])), /Invalid save/);
  }
});

test('supported fixture, shipped species and legacy omission validate', () => {
  const fixtureRecord = bear({
    species: FIXTURE_ID,
    genome: defaultGenome(FIXTURE_ID),
  });
  const fixture = validateSave(payload([fixtureRecord]));
  assert.deepEqual(fixture.errors, []);
  assert.equal(fixture.ok, true);
  assert.equal(normalizeSave(payload([fixtureRecord])).worlds.field.bears[0].species, FIXTURE_ID);

  const shipped = validateSave(payload([
    bear({ species: 'bear' }),
    bear({ uid: 3, species: 'msn', genome: defaultGenome('msn') }),
  ], [glass({ species: 'glass' })]));
  assert.deepEqual(shipped.errors, []);

  const legacyBear = bear();
  delete legacyBear.species;
  const legacyGlass = glass();
  delete legacyGlass.species;
  const legacy = validateSave(payload([legacyBear], [legacyGlass]));
  assert.deepEqual(legacy.errors, []);
});

test('glass restore entries are classified before creation', () => {
  assert.equal(glassRestoreIssue({ kind: 'glass', species: 'glass' }), null);
  assert.equal(glassRestoreIssue({ kind: 'skinned' }), null);
  assert.equal(glassRestoreIssue({}), null);
  assert.match(
    glassRestoreIssue({ kind: 'bear', species: 'bear' }),
    /actor kind "bear" is not supported/,
  );
  assert.match(
    glassRestoreIssue({ species: SKINNED.id }),
    /species "admission-skinned" is not supported/,
  );
  assert.match(glassRestoreIssue({ species: null }), /species "null" is not supported/);
  assert.match(glassRestoreIssue(null), /actor record is invalid/);
  assert.match(glassRestoreIssue([]), /actor record is invalid/);
  assert.match(glassRestoreIssue(['glass']), /actor record is invalid/);
});

test('runtime admission errors include context and species', () => {
  assert.throws(
    () => requireSpeciesRuntime(RIGLESS, RIGLESS.rig, {
      expectedKind: 'softbody', context: 'spawn',
    }),
    /spawn: species "admission-rigless" representation is unsupported/,
  );
  assert.throws(
    () => requireSpeciesRuntime(null, null, { context: 'spawnFromState' }),
    /spawnFromState: species is not registered/,
  );
});
