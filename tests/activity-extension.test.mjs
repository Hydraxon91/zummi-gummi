// C3/M2d: representative extension proof.
//
// A test-local activity uses only the existing interaction registration and
// pair/task protocol. There is no shipped activity, custom dispatcher, registry
// or framework here: the fixture definition and its start/advance helpers exist
// only in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  interactionFor, listInteractions, registerInteraction,
  startTask, tickTask, cancelTask, endPair,
} from '../src/interactions.js';
import { snapshotActor } from '../src/actorrecord.js';
import { createPairFixture } from './helpers/behavior-conformance.mjs';

const FIXTURE_ID = 'c3RepresentativeVisit';
const FIXTURE_ANCHOR = Object.freeze({ x: 6, z: 4, home: 'Home A' });
const FIXTURE_DEFINITION = {
  id: FIXTURE_ID,
  mode: 'pair',
  roles: ['host', 'guest'],
  duration: 2,
  cooldown: 0,
  arriveDist: 1.2,
  label: 'representative extension visit',
};

// Registered once for this file. The id is intentionally test-only and unique.
const FIXTURE = registerInteraction(FIXTURE_DEFINITION);

const FIXTURE_SOLO_ID = 'c3RepresentativeSolo';
const FIXTURE_SOLO = registerInteraction({
  id: FIXTURE_SOLO_ID,
  mode: 'solo',
  duration: 2,
  cooldown: 0,
  arriveDist: 1.2,
  label: 'representative solo task',
});

// The representative activity is a thin caller of the shared protocol. Effects
// are applied only on the first terminal tick, and cleanup is the existing
// endPair primitive.
function createFixtureActivity() {
  let completions = 0;

  function start(host, guest, anchor = FIXTURE_ANCHOR) {
    const started = startTask(host, FIXTURE_ID, { role: 'host', partner: guest, anchor });
    const joined = startTask(guest, FIXTURE_ID, { role: 'guest', partner: host, anchor });
    assert.equal(started && joined, true, 'both sides start through startTask');
  }

  function advance(actor, dt) {
    const next = tickTask(actor, dt, { arriveDist: FIXTURE.arriveDist });
    if (next.ok && next.phase === 'done' && actor.ai && actor.ai.familyTask) {
      completions += 1;
      endPair(actor, { stop: () => {} });
    }
    return next;
  }

  return { start, advance, completions: () => completions };
}

function assertPairCleared(a, b) {
  for (const [actor, other] of [[a, b], [b, a]]) {
    assert.equal(actor.ai.partner, null, `${actor.uid}: live partner cleared`);
    assert.equal(actor.ai.familyTask, null, `${actor.uid}: task cleared`);
    assert.equal(actor.ai.state, 'wander', `${actor.uid}: state reset`);
    assert.equal(actor.ai.source, null, `${actor.uid}: no stale claim`);
    assert.notEqual(actor.ai.partner, other);
  }
}

test('fixture registration resolves the exact definition and rejects duplicate ids', () => {
  const def = interactionFor(FIXTURE_ID);
  assert.equal(def, FIXTURE, 'registry returns the registered immutable definition');
  assert.ok(Object.isFrozen(def), 'registered definition is frozen');
  assert.equal(def.id, FIXTURE_ID);
  assert.equal(def.mode, 'pair');
  assert.deepEqual(def.roles, ['host', 'guest']);
  assert.equal(def.duration, 2);
  assert.equal(def.cooldown, 0);
  assert.equal(def.arriveDist, 1.2);
  assert.equal(def.label, 'representative extension visit');
  assert.equal(listInteractions().filter(item => item.id === FIXTURE_ID).length, 1);

  assert.throws(
    () => registerInteraction({ ...FIXTURE_DEFINITION, label: 'duplicate' }),
    /interaction already registered/,
  );
  assert.equal(interactionFor(FIXTURE_ID), FIXTURE, 'rejected duplicate leaves the original');
});

test('representative activity enters with host/guest roles, partnerUid and anchor target', () => {
  const { actors } = createPairFixture();
  const [host, guest] = actors;
  const activity = createFixtureActivity();

  activity.start(host, guest);

  assert.equal(host.ai.state, 'familyTask');
  assert.equal(guest.ai.state, 'familyTask');
  assert.equal(host.ai.partner, guest);
  assert.equal(guest.ai.partner, host);
  assert.notEqual(host.ai.familyTask, guest.ai.familyTask, 'each actor owns its task record');

  assert.equal(host.ai.familyTask.id, FIXTURE_ID);
  assert.equal(host.ai.familyTask.mode, 'pair');
  assert.equal(host.ai.familyTask.role, 'host');
  assert.equal(host.ai.familyTask.partnerUid, guest.uid);
  assert.deepEqual(host.ai.familyTask.anchor, { x: 6, z: 4, home: 'Home A' });
  assert.deepEqual(host.ai.target, { x: 6, z: 4 });
  assert.equal(host.ai.familyTask.phase, 'travel');

  assert.equal(guest.ai.familyTask.role, 'guest');
  assert.equal(guest.ai.familyTask.partnerUid, host.uid);
  assert.deepEqual(guest.ai.familyTask.anchor, { x: 6, z: 4, home: 'Home A' });
  assert.deepEqual(guest.ai.target, { x: 6, z: 4 });

  assert.equal(host.partnerUid, undefined, 'runtime task does not create a persistent partnership');
});

test('travel -> act -> done runs through tickTask and completes exactly once', () => {
  const { actors } = createPairFixture();
  const [host, guest] = actors;
  const activity = createFixtureActivity();
  activity.start(host, guest);

  const travel = activity.advance(host, .5);
  assert.equal(travel.phase, 'travel');
  assert.equal(travel.done, false);
  assert.equal(activity.completions(), 0);

  host.cx = FIXTURE_ANCHOR.x;
  host.cz = FIXTURE_ANCHOR.z;
  const arrive = activity.advance(host, 0);
  assert.deepEqual(arrive, { ok: true, phase: 'act', done: false });

  const acting = activity.advance(host, 1.4);
  assert.equal(acting.phase, 'act');
  assert.equal(acting.done, false, 'the timer has not expired yet');
  assert.equal(activity.completions(), 0);

  const done = activity.advance(host, .7);
  assert.equal(done.phase, 'done');
  assert.equal(done.done, true);
  assert.equal(activity.completions(), 1, 'completion ran once');

  assertPairCleared(host, guest);

  const repeated = activity.advance(host, 1);
  assert.deepEqual(repeated, { ok: false, phase: null, done: true });
  assert.equal(activity.completions(), 1, 'a repeated terminal tick adds no completion');
});

test('engine.cancelPair interrupts both sides without a completion effect', () => {
  const fixture = createPairFixture();
  const [host, guest] = fixture.actors;
  const activity = createFixtureActivity();
  activity.start(host, guest);
  activity.advance(host, .5);

  fixture.engine.cancelPair(host);

  assertPairCleared(host, guest);
  assert.equal(activity.completions(), 0, 'interruption is not completion');

  fixture.engine.cancelPair(guest);
  assertPairCleared(host, guest);
  assert.equal(activity.completions(), 0, 'a repeated cancel is inert');
});

test('cancelTask clears both reciprocal participants without a completion effect', () => {
  const fixture = createPairFixture();
  const [host, guest] = fixture.actors;
  const activity = createFixtureActivity();
  activity.start(host, guest);
  activity.advance(host, .5);

  cancelTask(host, { stop: () => {} });

  assertPairCleared(host, guest);
  assert.equal(activity.completions(), 0, 'cancellation is not completion');

  guest.cx = FIXTURE_ANCHOR.x;
  guest.cz = FIXTURE_ANCHOR.z;
  assert.deepEqual(activity.advance(guest, 10), { ok: false, phase: null, done: true },
    'the cancelled partner has no task left to finish');
  assert.equal(cancelTask(guest, { stop: () => {} }), undefined);
  assertPairCleared(host, guest);
  assert.equal(activity.completions(), 0, 'a repeated cancel is inert');
});

test('cancelTask on a solo task clears only the acting side', () => {
  const { actors } = createPairFixture();
  const [host, guest] = actors;
  startTask(host, FIXTURE_SOLO_ID, { role: 'host', partner: guest, anchor: FIXTURE_ANCHOR });
  startTask(guest, FIXTURE_SOLO_ID, { role: 'guest', partner: host, anchor: FIXTURE_ANCHOR });

  cancelTask(host, { stop: () => {} });

  assert.equal(host.ai.familyTask, null);
  assert.equal(host.ai.partner, null);
  assert.equal(host.ai.state, 'wander');
  assert.equal(guest.ai.familyTask?.id, FIXTURE_SOLO_ID, 'solo cancellation is own-side');
  assert.equal(guest.ai.partner, host);
});

test('cancelTask leaves a non-reciprocal partner task untouched', () => {
  const { actors } = createPairFixture();
  const [host, guest] = actors;
  const activity = createFixtureActivity();
  activity.start(host, guest);
  guest.ai.partner = null;

  cancelTask(host, { stop: () => {} });

  assert.equal(host.ai.familyTask, null);
  assert.equal(host.ai.partner, null);
  assert.equal(guest.ai.familyTask?.id, FIXTURE_ID, 'only the acting task is cancelled');
  assert.equal(guest.ai.partner, null);
  assert.equal(activity.completions(), 0);
});

test('engine.detach and setEnabled(false) clear the fixture pair with no stale links', () => {
  const detached = createPairFixture();
  const detachedActivity = createFixtureActivity();
  detachedActivity.start(detached.actors[0], detached.actors[1]);

  detached.engine.detach(detached.actors[0]);
  assert.equal(detached.actors[0].ai, null, 'detached actor loses its ai');
  const survivor = detached.actors[1];
  assert.equal(survivor.ai.partner, null, 'survivor partner cleared');
  assert.equal(survivor.ai.familyTask, null, 'survivor task cleared');
  assert.equal(survivor.ai.state, 'wander', 'survivor state reset');
  assert.equal(survivor.ai.source, null, 'survivor has no stale claim');

  const disabled = createPairFixture();
  const disabledActivity = createFixtureActivity();
  disabledActivity.start(disabled.actors[0], disabled.actors[1]);

  disabled.engine.setEnabled(false);
  assert.equal(disabled.engine.enabled, false);
  assertPairCleared(disabled.actors[0], disabled.actors[1]);
  disabled.engine.setEnabled(false);
  assertPairCleared(disabled.actors[0], disabled.actors[1]);
  assert.equal(disabledActivity.completions(), 0);
});

test('save records exclude runtime task and pair state', () => {
  const { actors } = createPairFixture();
  const [host, guest] = actors;
  const activity = createFixtureActivity();
  activity.start(host, guest);

  const record = snapshotActor(host);
  for (const key of [
    'ai', 'familyTask', 'partner', 'partnerUid', 'state', 'target', 'anchor',
    'visitHome', 'visitRole', 'visitPhase', 'visitArrived', 'group', 'groupSlot',
  ]) {
    assert.equal(Object.hasOwn(record, key), false, `record omits ${key}`);
  }
  assert.equal(record.uid, host.uid);
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes(FIXTURE_ID), false, 'record omits the runtime activity id');
  assert.equal(serialized.includes(FIXTURE.label), false, 'record omits the runtime label');
  assert.equal(serialized.includes('"anchor"'), false);
});
