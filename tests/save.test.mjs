import test from 'node:test';
import assert from 'node:assert/strict';
import { DNA_VERSION, defaultGenome } from '../src/dna.js';
import { SAVE_VERSION, validateSave, normalizeSave } from '../src/save.js';
import { maxActorUid } from '../src/actorsave.js';

function basePayload() {
  const bear = {
    uid: 1,
    flavor: 0,
    stage: 'adult',
    x: 1,
    z: 2,
    sex: 'F',
    genome: defaultGenome('bear'),
  };
  const world = {
    bears: [bear],
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
      studio: { ...world, bears: [] },
    },
  };
}

test('a v1 save without genomes still validates and stays genome-free in storage', () => {
  const payload = basePayload();
  delete payload.worlds.field.bears[0].genome;

  assert.equal(validateSave(payload).ok, true);
  const normalized = normalizeSave(payload);
  assert.equal(normalized.worlds.field.bears.length, 1);
  assert.equal(normalized.worlds.field.bears[0].genome, undefined);
});

test('genomes round-trip with the current DNA version', () => {
  const payload = basePayload();
  assert.equal(validateSave(payload).ok, true);

  const normalized = normalizeSave(payload);
  assert.equal(normalized.worlds.field.bears[0].genome.version, DNA_VERSION);
  assert.equal(normalized.worlds.field.bears[0].genome.genes.material, 'bearGummy');
});

test('dropped gift portions validate and duplicate ids are rejected', () => {
  const payload = basePayload();
  const gift = { id: 'gift-1', kind: 'flower', satiation: .2, x: 2, y: .1, z: 3, mapId: 'field' };
  payload.worlds.field.gifts = [gift];
  assert.equal(validateSave(payload).ok, true);
  const normalized = normalizeSave(payload);
  assert.equal(normalized.worlds.field.gifts[0].id, 'gift-1');

  payload.worlds.studio.gifts = [{ ...gift, mapId: 'studio' }];
  const check = validateSave(payload);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('; '), /duplicate gift portion id gift-1/);
});

test('a future top-level save version is rejected before normalization', () => {  const payload = basePayload();
  payload.version = SAVE_VERSION + 1;

  const check = validateSave(payload);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('; '), /unsupported save version/);
  assert.throws(() => normalizeSave(payload), /Invalid save/);
});

test('a future genome version is rejected instead of being silently downgraded', () => {
  const payload = basePayload();
  payload.worlds.field.bears[0].genome.version = DNA_VERSION + 1;

  const check = validateSave(payload);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('; '), /genome version/);
  assert.throws(() => normalizeSave(payload), /Invalid save/);
});

test('Glass actors validate without a genome and reject an invalid species tag', () => {
  const payload = basePayload();
  payload.worlds.field.glass = [{
    kind: 'glass',
    species: 'glass',
    uid: 4,
    x: 3,
    z: 4,
    stage: 'baby',
    genome: defaultGenome('glass'),
  }];
  assert.equal(validateSave(payload).ok, true);
  assert.equal(normalizeSave(payload).worlds.field.glass.length, 1);

  payload.worlds.field.glass[0].species = 'bear';
  assert.equal(validateSave(payload).ok, false);
});

test('the loader reserves the highest uid across both maps and Glass', () => {
  const worlds = {
    field: { bears: [{ uid: 4 }], glass: [{ uid: 7 }] },
    studio: { bears: [{ uid: 9 }], glass: [{ uid: 500000 }] },
  };
  assert.equal(maxActorUid(worlds), 500000);
  assert.equal(maxActorUid({ field: { bears: [{ uid: 3 }] } }), 3);
  assert.equal(maxActorUid(null), 0);
});

test('a duplicate actor uid anywhere in the game is rejected', () => {
  const payload = basePayload();
  payload.worlds.studio.bears = [{ ...payload.worlds.field.bears[0], uid: 1 }];
  const check = validateSave(payload);
  assert.equal(check.ok, false);
  assert.match(check.errors.join('; '), /duplicate actor uid 1/);
  assert.throws(() => normalizeSave(payload), /duplicate actor uid 1/);

  const glassPayload = basePayload();
  glassPayload.worlds.field.glass = [{
    kind: 'glass', species: 'glass', uid: 1, x: 3, z: 4, stage: 'baby',
    genome: defaultGenome('glass'),
  }];
  const glassCheck = validateSave(glassPayload);
  assert.equal(glassCheck.ok, false);
  assert.match(glassCheck.errors.join('; '), /duplicate actor uid 1/);
});

test('normalization strips unknown top-level keys and preserves the map payload', () => {
  const payload = basePayload();
  payload.extra = { should: 'not survive' };

  const normalized = normalizeSave(payload);
  assert.equal(normalized.extra, undefined);
  assert.equal(normalized.mapId, 'field');
  assert.equal(normalized.worlds.field.bears[0].uid, 1);
});
