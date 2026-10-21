import test from 'node:test';
import assert from 'node:assert/strict';
import { jsonEqual, runParity, actorSnapshot, actorsEqual } from '../scripts/behavior-parity.mjs';

test('direct comparator detects individual projected actor and AI mutations', () => {
  const base = { uid: 1, ai: {}, bonds: { 2: .5 }, playdates: { 2: { day: 1, hour: 12 } },
    history: [{ kind: 'meal', uid: 2, day: 1, hour: 12 }], skills: { forage: .1, courage: .2, social: .3 } };
  const actorKeys = ['hunger', 'thirst', 'health', 'energy', 'social', 'affection', 'gestation',
    'mateCooldown', 'bedtime', 'wakeTime', 'shelterCheckT', 'stage', 'home', 'sleeping', 'inside', 'pregnant', 'shelteredToday'];
  const aiKeys = ['state', 'pathIndex', 'animT', 'faceYaw', 'familyPlay', 'playdate', 'interrupted',
    'possessed', 'directiveHome', 'visitArrived', 'moving', 'arrived', 'playmateKind', 'visitPhase',
    'visitRole', 'restKind', 'visitHome', 'eatT', 'drinkT', 'inviteT', 'socialT', 'declineT',
    'conflictT', 'mateT', 'raidT', 'fleeT', 'stungT', 'idleT', 'nextThink', 'taskCooldown',
    'socialCooldown', 'conflictCooldown', 'familyPlayCooldown', 'followRetryT', 'restCooldown',
    'avoidSourceT', 'noProgressT', 'insideT', 'clock', 'doorEntries', 'doorExits', 'avoidSourceId', 'lastMealWindow'];
  for (const [keys, nested] of [[actorKeys, false], [aiKeys, true]]) for (const key of keys) {
    const changed = structuredClone(base);
    (nested ? changed.ai : changed)[key] = 1;
    assert.equal(actorsEqual(base, changed), JSON.stringify(actorSnapshot(base)) === JSON.stringify(actorSnapshot(changed)), key);
  }
  for (const value of [null, undefined, NaN, Infinity, -0, 1]) {
    const changed = structuredClone(base); changed.ai.faceYaw = value;
    assert.equal(actorsEqual(base, changed), JSON.stringify(actorSnapshot(base)) === JSON.stringify(actorSnapshot(changed)));
  }
});

test('candidate comparator preserves JSON projection semantics', () => {
  const values = [null, false, 0, -0, NaN, Infinity, 'x', [], [undefined], [null],
    { a: undefined }, {}, { a: 1 }, { b: 1 }, { a: 1, b: 2 }, { b: 2, a: 1 }];
  for (const a of values) for (const b of values) {
    assert.equal(jsonEqual(a, b), JSON.stringify(a) === JSON.stringify(b));
  }
});

test('direct comparator cross-checks nested fields and unusual relationship keys', () => {
  const base = { uid: 1, ai: {} };
  const fields = {
    target: { x: 1, z: 2 }, waterSpot: { x: 1, z: 2 }, fleeFrom: { x: 1, z: 2 },
    shove: { x: 1, z: 2 }, source: { id: 'food' }, contestSource: { id: 'food' },
    conflictSource: { id: 'food' }, partner: { uid: 2 }, follow: { uid: 2 },
    contestBear: { uid: 2 }, path: [{ x: 1, z: 2 }],
    familyTask: { id: 'meal', phase: 'travel', role: 'child', t: 1, anchor: { x: 1, z: 2 } },
  };
  for (const [key, value] of Object.entries(fields)) {
    const changed = { ...base, ai: { [key]: value } };
    assert.equal(actorsEqual(base, changed), false, key);
    assert.equal(actorsEqual(changed, structuredClone(changed)), true, key);
  }
  for (const field of ['bonds', 'playdates']) for (const keys of [['2', '1'], ['02', 'x'], ['3.5', '-1']]) {
    if (field === 'playdates' && keys.includes('02')) continue; // Reference projection cannot read that malformed record.
    const a = { ...base, [field]: {} }, b = { ...base, [field]: {} };
    for (const key of keys) a[field][key] = b[field][key] = field === 'bonds' ? .5 : { day: 2, hour: 12 };
    assert.equal(actorsEqual(a, b), JSON.stringify(actorSnapshot(a)) === JSON.stringify(actorSnapshot(b)));
  }
});

test('candidate and reference agree on every tick and detect perturbation', () => {
  for (const race of ['bear', 'gummy', 'glass']) {
    assert.equal(runParity({ race, days: .2, comparator: 'validate' }).ok, true);
    const result = runParity({ race, days: .2, comparator: 'validate', perturb: .001 });
    assert.equal(result.ok, false);
    assert.equal(result.firstTick, 0);
  }
});
