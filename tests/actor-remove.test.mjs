import test from 'node:test';
import assert from 'node:assert/strict';
import { removeSoftActor, removeGlassActor } from '../src/actorremove.js';

function makeSoft(overrides = {}) {
  return {
    uid: 7,
    active: true,
    grabs: 2,
    ai: { state: 'wander' },
    mesh: { visible: true },
    guardianUid: 3,
    partnerUid: 4,
    unrelated: 'keep',
    ...overrides,
  };
}

function makeGlass(overrides = {}) {
  return {
    uid: 11,
    active: true,
    disposed: false,
    guardianUid: 3,
    partnerUid: 4,
    unrelated: 'keep',
    ...overrides,
  };
}

function harness(actor, { roster = [actor], preserveRefs, departure } = {}) {
  const events = [];
  const seen = {};
  const opts = {
    actors: roster,
    preserveRefs,
    departure,
    onDeparture(a, d) { events.push('departure'); seen.departure = [a, d]; },
    onDropCarried(a) { events.push('drop'); seen.drop = a; },
    onReleasePortions(a) { events.push('portions'); seen.portions = a; },
    onDetach(a) { events.push('detach'); seen.detach = a; },
    onReleaseFood(a) { events.push('food'); seen.food = a; },
    onClearFarewell(a) {
      events.push('farewell');
      seen.aiAtFarewell = a.ai;
    },
    onDestroyBodies(a) { events.push('bodies'); seen.bodies = a; },
    onClearReferences(a) {
      events.push('refs');
      seen.refs = a;
      seen.inRosterAtRefs = roster.includes(a);
    },
    onEndGrabs(a) { events.push('grabs'); seen.grabs = a; },
    onDeactivate(a) {
      events.push('deactivate');
      seen.activeAtDeactivate = a.active;
      seen.grabsAtDeactivate = a.grabs;
    },
  };
  return { events, seen, opts };
}

test('soft removal is inert for an absent actor or one outside the roster', () => {
  const actor = makeSoft();
  const before = { ...actor, ai: { ...actor.ai }, mesh: { ...actor.mesh } };
  const absent = harness(actor);
  assert.equal(removeSoftActor(null, absent.opts), false);
  assert.deepEqual(absent.events, []);

  const outside = harness(actor, { roster: [makeSoft({ uid: 99 })] });
  assert.equal(removeSoftActor(actor, outside.opts), false);
  assert.deepEqual(outside.events, []);
  assert.deepEqual(actor, before);

  assert.equal(removeSoftActor(actor, {}), false);
  assert.equal(removeSoftActor(actor, { actors: null }), false);
});

test('soft removal runs callbacks in the recorded order and mutates roster state once', () => {
  const other = makeSoft({ uid: 5 });
  const actor = makeSoft();
  const tail = makeSoft({ uid: 9 });
  const roster = [other, actor, tail];
  const otherBefore = structuredClone(other);
  const { events, seen, opts } = harness(actor, { roster, departure: 'stars' });

  assert.equal(removeSoftActor(actor, opts), true);

  assert.deepEqual(events, [
    'departure', 'drop', 'portions', 'detach', 'food',
    'farewell', 'bodies', 'refs', 'grabs', 'deactivate',
  ]);
  assert.equal(seen.departure[0], actor);
  assert.equal(seen.departure[1], 'stars');
  assert.equal(seen.aiAtFarewell, null);
  assert.equal(seen.inRosterAtRefs, false);
  assert.equal(seen.activeAtDeactivate, false);
  assert.equal(seen.grabsAtDeactivate, 0);
  assert.deepEqual(roster, [other, tail]);
  assert.equal(actor.ai, null);
  assert.equal(actor.active, false);
  assert.equal(actor.grabs, 0);
  assert.equal(actor.mesh.visible, true, 'mesh work stays with the host callback');
  assert.equal(actor.unrelated, 'keep');
  assert.deepEqual(other, otherBefore);
  assert.equal(tail.unrelated, 'keep');
});

test('departure snapshot is skipped when no departure is requested', () => {
  const actor = makeSoft();
  const { events, opts } = harness(actor);
  assert.equal(removeSoftActor(actor, opts), true);
  assert.deepEqual(events, [
    'drop', 'portions', 'detach', 'food',
    'farewell', 'bodies', 'refs', 'grabs', 'deactivate',
  ]);
});

test('preserveRefs skips only guardian/relationship clearing', () => {
  const actor = makeSoft();
  const roster = [actor];
  const { events, seen, opts } = harness(actor, { roster, preserveRefs: true });
  assert.equal(removeSoftActor(actor, opts), true);
  assert.deepEqual(events, [
    'drop', 'portions', 'detach', 'food',
    'farewell', 'bodies', 'grabs', 'deactivate',
  ]);
  assert.equal(seen.refs, undefined);
  assert.deepEqual(roster, []);
  assert.equal(actor.ai, null);
  assert.equal(actor.active, false);
  assert.equal(actor.grabs, 0);
  assert.equal(actor.guardianUid, 3);
  assert.equal(actor.partnerUid, 4);
});

test('repeated soft removal after splice is inert', () => {
  const actor = makeSoft();
  const roster = [actor];
  const { events, opts } = harness(actor, { roster });
  assert.equal(removeSoftActor(actor, opts), true);
  const afterFirst = events.length;
  assert.equal(removeSoftActor(actor, opts), false);
  assert.equal(events.length, afterFirst);
  assert.deepEqual(roster, []);
});

test('grab release only touches grabs owned by the removed actor', () => {
  const actor = makeSoft({ uid: 7 });
  const other = makeSoft({ uid: 8 });
  const ended = [];
  const grabs = new Map([
    ['a', { bear: actor }],
    ['b', { bear: other }],
    ['c', { bear: actor }],
  ]);
  const opts = {
    actors: [actor],
    onEndGrabs(target) {
      for (const [key, grab] of Array.from(grabs)) {
        if (grab.bear === target) {
          ended.push(grab);
          grabs.delete(key);
        }
      }
    },
  };
  assert.equal(removeSoftActor(actor, opts), true);
  assert.equal(ended.length, 2);
  assert.ok(ended.every(grab => grab.bear === actor));
  assert.deepEqual([...grabs.values()].map(grab => grab.bear), [other]);
});

test('a throwing host callback leaves a partial, non-atomic removal', () => {
  const actor = makeSoft();
  const roster = [actor];
  let laterRan = false;
  const opts = {
    actors: roster,
    onDropCarried() { throw new Error('drop failed'); },
    onReleasePortions() { laterRan = true; },
  };
  assert.throws(() => removeSoftActor(actor, opts), /drop failed/);
  assert.equal(laterRan, false);
  assert.deepEqual(roster, [actor]);
  assert.deepEqual(actor.ai, { state: 'wander' });
  assert.equal(actor.active, true);
  assert.equal(actor.grabs, 2);
});

test('removal draws no RNG and leaves unrelated actors and fields alone', () => {
  const actor = makeSoft();
  const other = makeSoft({ uid: 21 });
  const otherBefore = structuredClone(other);
  const originalRandom = Math.random;
  let draws = 0;
  Math.random = () => {
    draws++;
    return 0.5;
  };
  try {
    assert.equal(removeSoftActor(actor, { actors: [actor, other] }), true);
  } finally {
    Math.random = originalRandom;
  }
  assert.equal(draws, 0);
  assert.deepEqual(other, otherBefore);
});

function glassHarness(actor, { removed = true, departure } = {}) {
  const events = [];
  const seen = { uidCalls: [], detachCalls: 0 };
  const opts = {
    departure,
    onDeparture(a, d) { events.push('departure'); seen.departure = [a, d]; },
    onClearFarewell(a) { events.push('farewell'); seen.farewell = a; },
    onDropCarried(a) { events.push('drop'); seen.drop = a; },
    onReleasePortions(a) { events.push('portions'); seen.portions = a; },
    onReleaseFood(a) { events.push('food'); seen.food = a; },
    removeFromColony(a) { events.push('colony'); seen.colony = a; return removed; },
    onDetach(a) { events.push('detach'); seen.detach = a; seen.detachCalls++; },
    onClearReferences(a) { events.push('refs'); seen.refs = a; seen.uidCalls.push(a.uid); },
  };
  return { events, seen, opts };
}

test('Glass removal returns false and clears no references when the colony declines', () => {
  const actor = makeGlass();
  const { events, seen, opts } = glassHarness(actor, { removed: false, departure: 'stars' });
  assert.equal(removeGlassActor(actor, opts), false);
  assert.deepEqual(events, ['departure', 'farewell', 'drop', 'portions', 'food', 'colony']);
  assert.equal(seen.refs, undefined);
  assert.equal(seen.detach, undefined);
  assert.equal(seen.detachCalls, 0);
  assert.equal(actor.unrelated, 'keep');
  assert.equal(actor.active, true);
});

test('Glass removal returns true and clears references exactly once when the colony removes', () => {
  const actor = makeGlass();
  const { events, seen, opts } = glassHarness(actor, { removed: true, departure: 'stars' });
  assert.equal(removeGlassActor(actor, opts), true);
  assert.deepEqual(events, ['departure', 'farewell', 'drop', 'portions', 'food', 'colony', 'detach', 'refs']);
  assert.equal(seen.refs, actor);
  assert.equal(seen.detach, actor);
  assert.equal(seen.detachCalls, 1);
  assert.equal(seen.uidCalls.length, 1);
  assert.equal(seen.departure[1], 'stars');
  assert.ok(events.indexOf('detach') > events.indexOf('colony'));
  assert.ok(events.indexOf('detach') < events.indexOf('refs'));
  assert.ok(!events.includes('cancel'));
  assert.ok(!events.includes('mesh'));
  assert.equal(actor.unrelated, 'keep');
});

test('Glass removal without a departure does not snapshot and repairs no actor fields', () => {
  const actor = makeGlass();
  const before = structuredClone(actor);
  const { events, opts } = glassHarness(actor, { removed: false });
  assert.equal(removeGlassActor(actor, opts), false);
  assert.deepEqual(events, ['farewell', 'drop', 'portions', 'food', 'colony']);
  assert.deepEqual(actor, before);
});

test('Glass removal is inert for an absent actor and without a colony remover', () => {
  const actor = makeGlass();
  assert.equal(removeGlassActor(null, {}), false);
  const { events, opts } = glassHarness(actor, { removed: true });
  delete opts.removeFromColony;
  assert.equal(removeGlassActor(actor, opts), false);
  assert.deepEqual(events, ['farewell', 'drop', 'portions', 'food']);
  assert.ok(!events.includes('detach'));
  assert.ok(!events.includes('refs'));
});
