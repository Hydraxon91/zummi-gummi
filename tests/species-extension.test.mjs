import test from 'node:test';
import assert from 'node:assert/strict';
import * as BEAR_RIG from '../src/config.js';
import {
  getSpecies,
  listSpecies,
  registerSpecies,
  speciesForRig,
} from '../src/species.js';
import {
  DNA_VERSION,
  canSpeciesBreed,
  defaultGenome,
  expressGenome,
  normalizeGenome,
} from '../src/dna.js';
import { canMate } from '../src/life.js';
import { actorKind, createActorView } from '../src/npc.js';
import { applyCommonActorState, snapshotActor } from '../src/actorrecord.js';
import { migrateActorRecord } from '../src/actorsave.js';
import { SAVE_VERSION, normalizeSave, validateSave } from '../src/save.js';
import { behaviorProfile, profileFor } from '../src/behaviorprofiles.js';

// M4 fixture: a new species reusing the shipped soft-body Bear representation.
// The rig is the Bear typed-array rig object plus the species marker every
// adaptor reads. Array identity proves no per-species copy or metaball path.
const FIXTURE_ID = 'fixture-bear-representation';
const BEAR = getSpecies('bear');
const FIXTURE_RIG = Object.freeze({ ...BEAR.rig, species: FIXTURE_ID });
const FIXTURE = registerSpecies({
  id: FIXTURE_ID,
  label: 'Fixture Bear',
  plural: 'Fixture Bears',
  kind: 'softbody',
  castGroup: 'fixture',
  breedGroup: 'fixture',
  compatibility: [FIXTURE_ID],
  rig: FIXTURE_RIG,
  material: 'flavor',
  canGrab: true,
  canPossess: true,
  canBreed: true,
  canReproduce: true,
  hasEyes: true,
  hasLife: true,
  growth: 'bearStages',
  genetics: {
    version: 1,
    phenotype: 'softbody-fixture',
    loci: ['color', 'size', 'rigidity', 'softness', 'stretch', 'material', 'hopPace'],
    defaults: {
      color: 'flavor', size: 1, rigidity: .35, softness: .65,
      stretch: .8, material: 'bearGummy', hopPace: [.7, 1.8],
    },
  },
  hybrids: [],
  tags: ['fixture'],
});

function fixtureActor(overrides = {}) {
  return {
    uid: 101,
    active: true,
    kind: 'softbody',
    species: FIXTURE_ID,
    speciesDef: FIXTURE,
    rig: FIXTURE_RIG,
    px: [],
    cx: 2.25,
    cy: 0.75,
    cz: -3.5,
    name: 'Fixture Pip',
    sex: 'F',
    stage: 'adult',
    age: 620,
    scale: 1,
    health: 96,
    hunger: .22,
    thirst: .24,
    energy: .9,
    social: .4,
    affection: .3,
    bold: .55,
    bonds: { 102: .6 },
    skills: { forage: .4, courage: .2, social: .3 },
    history: [{ kind: 'meal', uid: 102, day: 1, hour: 8 }],
    playdates: { 102: { day: 2, hour: 14 } },
    home: 'Honeydew Cottage',
    pregnant: false,
    gestation: 0,
    mateCooldown: 0,
    fatherUid: 0,
    parentUids: [1, 2],
    genome: defaultGenome(FIXTURE_ID),
    sleeping: false,
    grabs: 0,
    inPond: false,
    ...overrides,
  };
}

function savePayload(bears, glass = []) {
  const world = {
    bears,
    glass,
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
    worlds: {
      field: world,
      studio: { ...world, bears: [], glass: [] },
    },
  };
}

test('fixture registers strictly and reuses the Bear rig arrays by identity', () => {
  assert.equal(getSpecies(FIXTURE_ID), FIXTURE);
  assert.notEqual(getSpecies(FIXTURE_ID), BEAR);
  assert.equal(getSpecies(FIXTURE_ID, null).id, FIXTURE_ID);
  assert.equal(getSpecies('not-a-registered-species', null), null);
  assert.equal(getSpecies('not-a-registered-species').id, 'bear',
    'documented getSpecies fallback remains Bear for unregistered callers');
  assert.ok(listSpecies().some(species => species.id === FIXTURE_ID));

  assert.equal(FIXTURE.kind, 'softbody');
  assert.equal(FIXTURE.rig.species, FIXTURE_ID);
  assert.equal(speciesForRig(FIXTURE.rig).id, FIXTURE_ID);
  assert.equal(speciesForRig({ species: FIXTURE_ID }).id, FIXTURE_ID);
  assert.equal(speciesForRig(BEAR.rig).id, 'bear');

  for (const key of [
    'NP', 'RIG', 'TOTAL_M', 'REST', 'MASS', 'RSURF', 'RCOLL',
    'PARENT', 'PARENT_LEN', 'JOINT_HZ', 'CAPS', 'BRACES', 'REST_H',
    'REST_COM_Y', 'REST_DY', 'PTS',
  ]) {
    assert.equal(FIXTURE.rig[key], BEAR_RIG[key], `rig.${key} is shared`);
  }
  assert.deepEqual(Array.from(FIXTURE.rig.MASS), Array.from(BEAR_RIG.MASS));

  assert.throws(
    () => registerSpecies({ ...FIXTURE, label: 'Duplicate Fixture' }),
    /already registered/,
  );
});

test('fixture genome expression stays on the soft-body representation', () => {
  const genome = defaultGenome(FIXTURE_ID);
  assert.equal(genome.version, DNA_VERSION);
  assert.deepEqual(genome.species, { [FIXTURE_ID]: 1 });
  assert.equal(genome.genes.material, 'bearGummy');

  const phenotype = expressGenome(genome);
  assert.equal(phenotype.resolvedSpecies, FIXTURE_ID);
  assert.equal(phenotype.rigId, FIXTURE_ID);
  assert.equal(phenotype.kind, 'softbody');
  assert.equal(phenotype.capabilities.canReproduce, true);
  assert.equal(phenotype.capabilities.hasLife, true);

  assert.deepEqual(
    normalizeGenome({ species: { [FIXTURE_ID]: 1 }, genes: { size: 99 } }).species,
    { [FIXTURE_ID]: 1 },
  );
});

test('fixture birth eligibility passes species and opposite-sex life gates', () => {
  const mother = fixtureActor({ uid: 101, sex: 'F' });
  const father = fixtureActor({ uid: 102, sex: 'M' });
  const sameSex = fixtureActor({ uid: 103, sex: 'F' });

  const gate = canSpeciesBreed(FIXTURE_ID, FIXTURE_ID, { current: true });
  assert.equal(gate.ok, true);
  assert.equal(gate.hybridTarget, null);
  assert.equal(canSpeciesBreed(FIXTURE_ID, 'bear', { current: true }).ok, false,
    'fixture compatibility does not silently widen to Bear');

  assert.equal(canMate(mother, father, { room: true, food: true }), true);
  assert.equal(canMate(mother, sameSex, { room: true, food: true }), false);
});

test('actor view resolves the fixture actor by original identity', () => {
  const fixture = fixtureActor({ uid: 201 });
  const glass = {
    uid: 202, active: true, kind: 'glass', cx: 1, cy: .6, cz: 1, home: 'Juniper House',
  };
  const view = createActorView({
    getSoft: () => [fixture],
    getGlass: () => [glass],
  });

  assert.equal(view.byUid(201), fixture);
  assert.equal(view.byUid('201'), fixture);
  assert.equal(view.all()[0], fixture);
  assert.equal(actorKind(fixture), 'softbody');
  assert.equal(view.homeResidents('Honeydew Cottage'), 1);
});

test('fixture snapshots validate and normalize as a registered soft body', () => {
  const record = snapshotActor(fixtureActor(), {
    flavor: 0, bedtime: 21, wakeTime: 6, hopSpeedMin: .8, hopSpeedMax: 1.6,
  });
  assert.equal(record.species, FIXTURE_ID);
  assert.equal(record.kind, undefined);
  assert.equal(record.actorVersion, 2);
  assert.deepEqual(record.genome, defaultGenome(FIXTURE_ID));

  const payload = savePayload([record]);
  const check = validateSave(payload);
  assert.deepEqual(check.errors, []);
  assert.equal(check.ok, true);

  const normalized = normalizeSave(payload);
  const restored = normalized.worlds.field.bears[0];
  assert.equal(restored.species, FIXTURE_ID);
  assert.deepEqual(restored.genome.species, { [FIXTURE_ID]: 1 });
  assert.equal(restored.actorVersion, 2);

  const unknown = savePayload([{ ...record, species: 'future-fixture' }]);
  const unknownCheck = validateSave(unknown);
  assert.equal(unknownCheck.ok, false);
  assert.match(unknownCheck.errors.join('; '), /species is unknown/);

  const mismatched = savePayload([], [record]);
  const mismatchedCheck = validateSave(mismatched);
  assert.equal(mismatchedCheck.ok, false);
  assert.match(mismatchedCheck.errors.join('; '), /species is not skinned/);
});

test('migration preserves fixture identity and common apply excludes representation', () => {
  const legacy = { ...snapshotActor(fixtureActor(), { flavor: 0 }) };
  delete legacy.actorVersion;
  const migrated = migrateActorRecord(legacy);

  assert.equal(migrated.actorVersion, 2);
  assert.equal(migrated.species, FIXTURE_ID);
  assert.deepEqual(migrated.genome, legacy.genome);
  assert.deepEqual(migrated.parentUids, [1, 2]);
  assert.equal(legacy.actorVersion, undefined, 'migration does not mutate the input');

  const record = snapshotActor(fixtureActor({
    health: 91, hunger: .18, thirst: .2, energy: .88,
    bonds: { 102: .7 }, skills: { forage: .6 },
    history: [{ kind: 'lesson', uid: 102, day: 3, hour: 9 }],
    playdates: {},
  }), { flavor: 0 });

  const target = fixtureActor({ uid: 301, health: 10, hunger: .95, bonds: {}, skills: {} });
  applyCommonActorState(target, record);
  assert.equal(target.health, 91);
  assert.equal(target.hunger, .18);
  assert.deepEqual(target.bonds, { 102: .7 });
  assert.deepEqual(target.skills, { forage: .6, courage: 0, social: 0 });
  assert.equal(target.history[0].kind, 'lesson');

  // Restoring species/rig is deliberately app-side (`spawnFromState` chooses
  // the registry rig before calling this function). This control shows the
  // common restore does not rewrite representation or identity fields.
  const control = {
    ...fixtureActor({ uid: 302, species: 'bear', speciesDef: BEAR, rig: BEAR.rig }),
    name: 'Other Actor', sex: 'M', stage: 'teen', age: 200, scale: .78,
    genome: defaultGenome('bear'),
  };
  applyCommonActorState(control, record);
  assert.equal(control.species, 'bear');
  assert.equal(control.rig, BEAR.rig);
  assert.equal(control.uid, 302);
  assert.equal(control.name, 'Other Actor');
  assert.equal(control.sex, 'M');
  assert.equal(control.stage, 'teen');
  assert.equal(control.health, 91, 'common state is restored regardless of representation');
});

test('fixture has no balance profile and profile lookup falls back to Bear', () => {
  // Balance is a separate edit (`src/behaviorprofiles.js`). This fixture proves
  // the registry/save path only; the current fallback is recorded as unsupported,
  // not as a working new-species balance profile.
  assert.equal(behaviorProfile(FIXTURE_ID).id, 'bear');
  assert.equal(profileFor({ species: FIXTURE_ID }).id, 'bear');
});
