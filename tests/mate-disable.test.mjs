import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehaviorModules } from '../src/behaviors/engine.js';

function fixture() {
  let draws = 0;
  const actors = [1, 2].map(uid => ({
    uid, active: true, kind: 'bear', species: 'bear', stage: 'adult', age: 500,
    cx: uid, cz: 0, cy: 1, hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .3, affection: .25, bold: .5, home: '', parentUids: [],
    sex: uid === 1 ? 'F' : 'M', bonds: {}, skills: {}, playdates: {}, history: [],
    grabs: 0, inPond: false, sleeping: false, mateCooldown: 0,
  }));
  const engine = createBehaviorModules({
    field: {
      homes: [], nav: { nearestWalkable: (x, z) => ({ x, z }),
        findPath: (x, z, tx, tz) => [{ x: tx, z: tz }] },
      pond: { contains: () => false }, food: { allRipe: () => Array(100).fill({ ripe: true }) },
      emote: () => {},
    },
    getActors: () => actors, getHours: () => 12, getDay: () => 0,
    getPopulationCap: () => 40, getAdapter: () => ({ onStop: () => {} }),
    rng: () => { draws++; return 0; },
  });
  actors.forEach(a => engine.attach(a));
  return { engine, actors, draws: () => draws };
}

test('disabled mating refuses new courtship without consuming selection RNG', () => {
  const { engine, actors, draws } = fixture();
  engine.setModuleEnabled('mate', false);
  const before = draws();
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek'), null);
  assert.equal(engine.api.acquireMate(actors[0]), null);
  assert.equal(draws(), before);
  assert.deepEqual(actors.map(a => a.ai.state), ['wander', 'wander']);
  engine.setModuleEnabled('mate', true);
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek').id, 'mate.seek');
});

test('an actor-scoped disabled recipient cannot be recruited by an enabled actor', () => {
  const { engine, actors } = fixture();
  engine.setModuleEnabled('mate', false, { uid: actors[1].uid });
  assert.equal(engine.api.config.forActor(actors[0]).behaviorModules.mate.enabled, true);
  assert.equal(engine.api.config.forActor(actors[1]).behaviorModules.mate.enabled, false);
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek'), null);
});

test('disabling mating preserves existing courtship and permits its completion', () => {
  const { engine, actors } = fixture();
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek').id, 'mate.seek');
  engine.setModuleEnabled('mate', false);
  assert.deepEqual(actors.map(a => a.ai.state), ['seekMate', 'seekMate']);
  for (let i = 0; i < 200 && !actors[0].pregnant; i++) {
    for (const actor of actors) engine.tick(actor, .1);
  }
  assert.equal(actors[0].pregnant, true);
  assert.ok(actors.every(a => a.ai.state === 'wander'));
});
