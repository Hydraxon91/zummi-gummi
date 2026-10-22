import assert from 'node:assert/strict';
import { createBehaviorConfig } from '../../src/behaviors/config.js';
import { createBehaviorModules } from '../../src/behaviors/engine.js';

// Resolve real config layers, with unrelated actors/species as negative controls.
export function assertModuleConfigScopes(id) {
  const actors = [{ uid: 101, species: 'bear', kind: 'bear' },
    { uid: 102, species: 'bear', kind: 'bear' }, { uid: 103, species: 'glass', kind: 'glass' }];
  for (const [scope, expected] of [[null, [false, false, false]],
    [{ species: 'bear' }, [false, false, true]], [{ uid: 101 }, [false, true, true]]]) {
    const config = createBehaviorConfig();
    // Global runtime overrides intentionally outrank scoped values. Establish
    // the baseline at species scope so the narrower tests can actually differ.
    config.setModuleEnabled(id, true, { species: 'bear' });
    config.setModuleEnabled(id, true, { species: 'glass' });
    assert.ok(actors.every(a => config.forActor(a).behaviorModules[id].enabled));
    config.setModuleEnabled(id, false, scope);
    assert.deepEqual(actors.map(a => config.forActor(a).behaviorModules[id].enabled), expected);
    config.setModuleEnabled(id, true, scope);
    assert.ok(actors.every(a => config.forActor(a).behaviorModules[id].enabled));
    config.reset();
    const fresh = createBehaviorConfig();
    assert.deepEqual(actors.map(a => config.forActor(a)), actors.map(a => fresh.forActor(a)));
  }
}

// Real engine/pair protocol, no three.js or WASM. Behavior-specific tests own
// admission, completion, interruption and claim assertions on top of this fixture.
export function createPairFixture() {
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
