import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultGenome } from '../src/dna.js';
import {
  ACTOR_SAVE_VERSION,
  registerActorCollection,
  validateActorWorld,
} from '../src/actorsave.js';

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

test('legacy actors validate and the current actor version is accepted', () => {
  const errors = [];
  validateActorWorld({ bears: [bear()], glass: [glass()] }, 'world', errors);
  assert.deepEqual(errors, []);

  const versioned = bear({ actorVersion: ACTOR_SAVE_VERSION });
  const versionedGlass = glass({ actorVersion: ACTOR_SAVE_VERSION });
  const versionErrors = [];
  validateActorWorld({ bears: [versioned], glass: [versionedGlass] }, 'world', versionErrors);
  assert.deepEqual(versionErrors, []);
});

test('a future actor version is rejected instead of being silently downgraded', () => {
  const errors = [];
  validateActorWorld({ bears: [bear({ actorVersion: ACTOR_SAVE_VERSION + 1 })] }, 'world', errors);
  assert.match(errors.join('; '), /actorVersion .* unsupported/);
});

test('unknown or mismatched saved species are rejected', () => {
  const unknown = [];
  validateActorWorld({ bears: [bear({ species: 'future-bear' })] }, 'world', unknown);
  assert.match(unknown.join('; '), /species is unknown/);

  const mismatched = [];
  validateActorWorld({ bears: [bear({ species: 'glass' })] }, 'world', mismatched);
  assert.match(mismatched.join('; '), /species is not softbody/);

  const badGlass = [];
  validateActorWorld({ bears: [bear()], glass: [glass({ species: 'bear' })] }, 'world', badGlass);
  assert.match(badGlass.join('; '), /species is not skinned/);
});

test('a fixture actor collection validates through the registry', () => {
  registerActorCollection({
    key: 'fixtures',
    kind: 'fixture',
    validate(actor, where, errors) {
      if (!actor || actor.token !== 'ok') errors.push(`${where}.token is invalid`);
    },
  });

  const good = [];
  validateActorWorld({ bears: [bear()], fixtures: [{ token: 'ok' }] }, 'world', good);
  assert.deepEqual(good, []);

  const bad = [];
  validateActorWorld({ bears: [bear()], fixtures: [{ token: 'no' }] }, 'world', bad);
  assert.match(bad.join('; '), /fixtures\[0\]\.token is invalid/);
});

test('a required actor collection is still required', () => {
  const errors = [];
  validateActorWorld({}, 'world', errors);
  assert.match(errors.join('; '), /world\.bears is not an array/);
});
