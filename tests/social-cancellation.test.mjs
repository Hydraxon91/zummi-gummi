// C2/M2c: cancellation and cleanup conformance for the social invite/visit
// family. Every case drives the real modules engine; forced entry is used only
// where the host has no public natural entry (visit cleanup is reached through a
// natural social -> visit chain instead).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBehavior } from '../src/behaviors/index.js';
import { createBehaviorConfig } from '../src/behaviors/config.js';
import { createWorld, mulberry32 } from '../scripts/behavior-parity.mjs';
import { createBearAI } from '../src/ai.js';
import { snapshotActor } from '../src/actorrecord.js';
import { bondOf } from '../src/family.js';

const RACES = [
  { id: 'bear', species: 'bear', kind: 'bear' },
  { id: 'gummy', species: 'msn', kind: 'bear' },
  { id: 'glass', species: 'glass', kind: 'glass' },
];

const DT = .2;

function actor(uid, race, home, extra = {}) {
  return {
    uid, active: true, species: race.species, kind: race.kind,
    name: `${race.id}-${uid}`, stage: 'adult', age: 700, scale: 1,
    sex: uid % 2 ? 'F' : 'M', cx: 8.5 + (uid - 1) * .8, cz: 7, cy: 1,
    hunger: .2, thirst: .2, energy: 1, health: 100,
    social: .8, affection: .25, bold: .5, home,
    bonds: {}, skills: {}, playdates: {}, history: [],
    parentUids: [], fatherUid: 0, bedtime: 20, wakeTime: 6, mateCooldown: 0,
    grabs: 0, inPond: false, sleeping: false, inside: false, freeBody: false,
    ...extra,
  };
}

function setup(race, { hours = 12, rng = mulberry32(7), extraActors = 0 } = {}) {
  const world = createWorld();
  const home = world.homes[0].name;
  const roster = [actor(1, race, home), actor(2, race, home)];
  for (let index = 0; index < extraActors; index++) {
    const extra = actor(3 + index, race, home, { cx: 30 + index, cz: 30 });
    roster.push(extra);
  }
  const config = createBehaviorConfig({ features: { interactionHistory: true } });
  // Mate admission precedes social in the opportunity order and would reserve
  // the partner first; this family's trace must start at social.company.
  config.setModuleEnabled('mate', false);
  const engine = createBehavior({
    engine: 'modules', config, field: world,
    getActors: () => roster, getHours: () => hours, getDay: () => 1,
    getPopulationCap: () => 40, daySeconds: 600,
    rng: () => rng(),
  });
  for (const item of roster) engine.attach(item);
  return { race, world, roster, engine, config, a: roster[0], b: roster[1] };
}

function startCompany(f) {
  f.a.social = .8;
  f.a.affection = .25;
  const opportunity = f.engine.runOpportunities(f.a);
  assert.equal(opportunity?.id, 'social.company',
    `${f.race.id}: natural social.company opportunity must start the trace`);
  assert.equal(f.a.ai.state, 'seekCompany');
  assert.equal(f.a.ai.partner, f.b);
  assert.equal(f.b.ai.partner, f.a);
}

// Advance only the initiator so the partner's needs stay fixed for exact
// exactly-once assertions. Stops at the first requested state or timeout.
function until(f, predicate, { max = 400, dt = DT } = {}) {
  const states = [];
  for (let index = 0; index < max; index++) {
    engineTick(f, dt);
    states.push(f.a.ai.state);
    if (predicate(f)) return states;
  }
  assert.fail(`${f.race.id}: timed out; states ${states.slice(-8).join(' > ')}`);
}

function engineTick(f, dt = DT) {
  f.engine.tick(f.a, dt, { ready: true });
}

function driveToInvite(f) {
  startCompany(f);
  until(f, item => item.a.ai.state === 'invite');
}

function driveToSocial(f) {
  driveToInvite(f);
  until(f, item => item.a.ai.state === 'social');
}

// Natural social completion that chains into a visit when the visit roll passes.
function driveToVisit(f) {
  f.a.bonds[f.b.uid] = .25;
  f.b.bonds[f.a.uid] = .25;
  startCompany(f);
  until(f, item => item.a.ai.state === 'visit');
}

function historyCounts(item) {
  const count = (list) => list.reduce((out, event) => {
    out[event.kind] = (out[event.kind] || 0) + 1;
    return out;
  }, {});
  return { a: count(item.a.history), b: count(item.b.history) };
}

function completionSnapshot(f) {
  const before = {
    aSocial: f.a.social, bSocial: f.b.social,
    aAffection: f.a.affection, bAffection: f.b.affection,
  };
  engineTick(f);
  return { before, after: f.a.ai.state, dt: DT };
}

test('fixed-RNG: accepted natural invite completes once with exact bond, relief and history', () => {
  for (const race of RACES) {
    const f = setup(race, { rng: () => .5 });
    const p = f.config.forActor(f.a);
    assert.equal(bondOf(f.a, f.b), 0, `${race.id}: clean bond baseline`);
    startCompany(f);
    const seen = new Set();
    let completion = null;
    for (let index = 0; index < 400; index++) {
      seen.add(f.a.ai.state);
      if (f.a.ai.state === 'social') {
        const snap = completionSnapshot(f);
        if (snap.after !== 'social') completion = snap;
      } else {
        engineTick(f);
      }
      if (completion) break;
    }
    assert.ok(completion, `${race.id}: social completion reached`);
    assert.ok(seen.has('invite') && seen.has('social'), `${race.id}: real invite -> social trace`);
    assert.equal(completion.after, 'wander', `${race.id}: completion returns to wander at midday with this roll`);
    assert.equal(f.a.ai.partner, null);
    assert.equal(f.b.ai.partner, null);
    assert.equal(f.a.ai.state, 'wander');
    assert.equal(f.b.ai.state, 'wander');

    const expectedBond = p.social.bondBase + .5 * p.social.bondJitter;
    assert.ok(Math.abs(bondOf(f.a, f.b) - expectedBond) < 1e-12,
      `${race.id}: one completion bond draw (${bondOf(f.a, f.b)} != ${expectedBond})`);
    assert.ok(Math.abs(bondOf(f.b, f.a) - expectedBond) < 1e-12);

    const expectedASocial = Math.max(0, completion.before.aSocial
      + p.needs.socialRate * completion.dt - p.social.relief);
    const expectedAAffection = Math.max(0, completion.before.aAffection
      + p.needs.affectionRate * completion.dt - p.social.affectionRelief);
    assert.ok(Math.abs(f.a.social - expectedASocial) < 1e-12,
      `${race.id}: initiator relief applied once (${f.a.social} != ${expectedASocial})`);
    assert.ok(Math.abs(f.a.affection - expectedAAffection) < 1e-12);
    assert.ok(Math.abs(f.b.social - (completion.before.bSocial - p.social.relief)) < 1e-12,
      `${race.id}: partner relief applied once`);
    assert.ok(Math.abs(f.b.affection - Math.max(0, completion.before.bAffection - p.social.affectionRelief)) < 1e-12);

    const counts = historyCounts(f);
    assert.equal(counts.a.social, 1, `${race.id}: one initiator history entry`);
    assert.equal(counts.b.social, 1, `${race.id}: one partner history entry`);
    const eventA = f.a.history.find(event => event.kind === 'social');
    const eventB = f.b.history.find(event => event.kind === 'social');
    assert.equal(eventA.uid, f.b.uid);
    assert.equal(eventB.uid, f.a.uid);
    assert.equal(eventA.bondBefore, 0);
    assert.equal(eventB.bondBefore, 0);
    assert.ok(Math.abs(eventA.bondAfter - expectedBond) < 1e-12);
    assert.ok(Math.abs(eventB.bondAfter - expectedBond) < 1e-12);

    // Further ticks must not duplicate effects.
    engineTick(f);
    engineTick(f);
    assert.equal(historyCounts(f).a.social, 1);
    assert.ok(Math.abs(bondOf(f.a, f.b) - expectedBond) < 1e-12);
  }
});

test('fixed-RNG: declined invite cleans both sides without bond, relief or duplicate history', () => {
  for (const race of RACES) {
    const f = setup(race, { rng: () => .999 });
    const p = f.config.forActor(f.a);
    startCompany(f);
    const seen = new Set();
    for (let index = 0; index < 400; index++) {
      seen.add(f.a.ai.state);
      seen.add(f.b.ai.state);
      engineTick(f);
      if (seen.has('decline') && f.a.ai.state === 'wander') break;
    }
    assert.ok(seen.has('invite'), `${race.id}: real invite entry`);
    assert.ok(seen.has('decline'), `${race.id}: acceptance roll declines`);
    assert.equal(f.a.ai.state, 'wander');
    assert.equal(f.b.ai.state, 'wander');
    assert.equal(f.a.ai.partner, null);
    assert.equal(f.b.ai.partner, null);
    assert.equal(f.a.ai.visitHome, null);
    assert.equal(f.b.ai.visitHome, null);
    assert.equal(bondOf(f.a, f.b), 0, `${race.id}: refusal grants no bond`);
    assert.ok(f.a.social >= p.thresholds.seekSocial, `${race.id}: refusal grants no relief`);
    assert.ok(f.a.ai.socialCooldown > 0, `${race.id}: declined cooldown preserved`);
    assert.ok(f.b.ai.socialCooldown >= 2.5, `${race.id}: partner decline cooldown preserved`);

    const counts = historyCounts(f);
    assert.equal(counts.a.decline, 1);
    assert.equal(counts.b.declined, 1);
    engineTick(f);
    engineTick(f);
    assert.deepEqual(historyCounts(f), counts, `${race.id}: no duplicate refusal history`);
  }
});

test('fixed-RNG: grab during invite, social and visit clears both sides without reward or completion history', () => {
  for (const race of RACES) {
    for (const stage of ['invite', 'social', 'visit']) {
      const f = setup(race, { rng: stage === 'visit' ? () => 0 : () => .5 });
      if (stage === 'invite') driveToInvite(f);
      else if (stage === 'social') driveToSocial(f);
      else driveToVisit(f);
      assert.equal(f.a.ai.state, stage, `${race.id}/${stage}: entry`);

      const beforeBond = bondOf(f.a, f.b);
      const beforeCounts = historyCounts(f);
      const beforeSocial = { a: f.a.social, b: f.b.social };
      const beforeAffection = { a: f.a.affection, b: f.b.affection };

      f.engine.onGrab(f.a);
      for (const item of [f.a, f.b]) {
        assert.equal(item.ai.partner, null, `${race.id}/${stage}: no stale partner`);
        assert.equal(item.ai.state, 'wander', `${race.id}/${stage}: state reset`);
        assert.equal(item.ai.visitHome, null, `${race.id}/${stage}: no stale visitHome`);
        assert.equal(item.ai.visitRole, null, `${race.id}/${stage}: no stale visitRole`);
        assert.equal(item.ai.visitPhase, null, `${race.id}/${stage}: no stale visitPhase`);
        assert.equal(item.ai.visitArrived, false, `${race.id}/${stage}: no stale arrival`);
        assert.equal(item.ai.familyTask, null, `${race.id}/${stage}: no stale task`);
      }
      assert.ok(Math.abs(bondOf(f.a, f.b) - beforeBond) < 1e-12,
        `${race.id}/${stage}: grab grants no bond`);
      assert.equal(f.a.social, beforeSocial.a, `${race.id}/${stage}: grab grants no relief`);
      assert.equal(f.b.social, beforeSocial.b);
      assert.equal(f.a.affection, beforeAffection.a);
      assert.equal(f.b.affection, beforeAffection.b);
      const afterCounts = historyCounts(f);
      assert.deepEqual(afterCounts, beforeCounts, `${race.id}/${stage}: grab writes no history`);
      assert.equal((afterCounts.a.hosted || 0) + (afterCounts.a.visit || 0), 0,
        `${race.id}/${stage}: no visit completion recorded`);

      // A second grab is inert rather than a second cleanup with effects.
      f.engine.onGrab(f.a);
      assert.equal(f.a.ai.partner, null);
      assert.equal(f.b.ai.partner, null);
      assert.ok(Math.abs(bondOf(f.a, f.b) - beforeBond) < 1e-12);
      assert.deepEqual(historyCounts(f), afterCounts);
    }
  }
});

test('fixed-RNG: critical thirst/hunger interrupts invite, social and visit and starts survival', () => {
  for (const race of RACES) {
    for (const stage of ['invite', 'social', 'visit']) {
      for (const need of ['thirst', 'hunger']) {
        const f = setup(race, { rng: stage === 'visit' ? () => 0 : () => .5 });
        if (stage === 'invite') driveToInvite(f);
        else if (stage === 'social') driveToSocial(f);
        else driveToVisit(f);
        const p = f.config.forActor(f.a);
        const beforeBond = bondOf(f.a, f.b);
        const beforeCounts = historyCounts(f);
        const beforeSocial = f.a.social;
        const beforeAffection = f.a.affection;
        f.a[need] = need === 'thirst' ? p.thresholds.criticalThirst : p.thresholds.criticalHunger;

        engineTick(f);
        for (const item of [f.a, f.b]) {
          assert.equal(item.ai.partner, null, `${race.id}/${stage}/${need}: pair cleared`);
          assert.equal(item.ai.visitHome, null, `${race.id}/${stage}/${need}: visit fields cleared`);
          assert.equal(item.ai.visitPhase, null);
          assert.equal(item.ai.familyTask, null);
        }
        if (need === 'thirst') {
          assert.ok(['seekWater', 'drink'].includes(f.a.ai.state),
            `${race.id}/${stage}: thirst transitions to water, got ${f.a.ai.state}`);
        } else {
          assert.ok(['seekFood', 'eat'].includes(f.a.ai.state),
            `${race.id}/${stage}: hunger transitions to food, got ${f.a.ai.state}`);
        }
        assert.equal(f.b.ai.state, 'wander');
        assert.ok(Math.abs(bondOf(f.a, f.b) - beforeBond) < 1e-12,
          `${race.id}/${stage}/${need}: interruption grants no bond`);
        assert.deepEqual(historyCounts(f), beforeCounts,
          `${race.id}/${stage}/${need}: interruption history stays empty/unchanged`);
        const expectedSocial = Math.min(1, beforeSocial + p.needs.socialRate * DT);
        const expectedAffection = Math.min(1, beforeAffection + p.needs.affectionRate * DT);
        assert.ok(Math.abs(f.a.social - expectedSocial) < 1e-12,
          `${race.id}/${stage}/${need}: no pair relief on interruption`);
        assert.ok(Math.abs(f.a.affection - expectedAffection) < 1e-12);
      }
    }
  }
});

test('fixed-RNG: setEnabled(false) clears pairs, visit fields, tasks and claims for every actor', () => {
  for (const race of RACES) {
    const f = setup(race, { rng: () => .5, extraActors: 1 });
    const c = f.roster[2];
    driveToSocial(f);
    const task = f.engine.forceMeal(c);
    assert.equal(task.ok, true, `${race.id}: real family task entry`);
    assert.ok(c.ai.familyTask, `${race.id}: task present before disable`);

    const sources = f.world.food.allRipe();
    const [first, second] = sources;
    f.a.ai.source = first;
    f.world.food.claim(first, f.a);
    f.b.ai.source = second;
    f.world.food.claim(second, f.b);
    assert.equal(first.claim, f.a);

    f.engine.setEnabled(false);
    for (const item of f.roster) {
      assert.equal(item.ai.partner, null, `${race.id}: no partner after disable`);
      assert.equal(item.ai.state, 'wander', `${race.id}: state reset after disable`);
      assert.equal(item.ai.visitHome, null);
      assert.equal(item.ai.visitRole, null);
      assert.equal(item.ai.visitPhase, null);
      assert.equal(item.ai.visitArrived, false);
      assert.equal(item.ai.familyTask, null, `${race.id}: task cleared`);
      assert.equal(item.ai.source, null, `${race.id}: source cleared`);
    }
    assert.equal(first.claim, null, `${race.id}: initiator claim released`);
    assert.equal(second.claim, null, `${race.id}: partner claim released`);

    f.engine.setEnabled(false);
    assert.equal(f.a.ai.partner, null, `${race.id}: repeated disable is inert`);
    f.engine.setEnabled(true);
  }
});

test('fixed-RNG: detach one and both participants leaves no stale pair, visit, task or claim state', () => {
  for (const race of RACES) {
    const f = setup(race, { rng: () => .5 });
    driveToSocial(f);
    const sources = f.world.food.allRipe();
    f.a.ai.source = sources[0];
    f.world.food.claim(sources[0], f.a);
    f.b.ai.source = sources[1];
    f.world.food.claim(sources[1], f.b);

    f.engine.detach(f.a);
    assert.equal(f.a.ai, null, `${race.id}: detached actor loses ai`);
    assert.equal(f.b.ai.partner, null, `${race.id}: remaining partner link cleared`);
    assert.equal(f.b.ai.state, 'wander');
    assert.equal(f.b.ai.visitHome, null);
    assert.equal(f.b.ai.visitRole, null);
    assert.equal(f.b.ai.visitPhase, null);
    assert.equal(f.b.ai.visitArrived, false);
    assert.equal(f.b.ai.familyTask, null);
    assert.equal(sources[0].claim, null, `${race.id}: detached claim released`);
    assert.equal(sources[1].claim, null, `${race.id}: reciprocal claim released`);

    f.engine.detach(f.b);
    assert.equal(f.b.ai, null, `${race.id}: second detach leaves no ai`);
    assert.equal(sources[0].claim, null);
  }

  // Removal of a solo task holder also clears task and source.
  const f = setup(RACES[0], { rng: () => .5, extraActors: 1 });
  const c = f.roster[2];
  assert.equal(f.engine.forceMeal(c).ok, true);
  const source = f.world.food.allRipe()[0];
  c.ai.source = source;
  f.world.food.claim(source, c);
  f.engine.detach(c);
  assert.equal(c.ai, null);
  assert.equal(source.claim, null);
});

test('fixed-RNG: pond entry does not cancel the pair; exit closes a targetless visit', () => {
  const f = setup(RACES[0], { rng: () => .5 });
  const adapter = createBearAI({
    field: f.world, getBears: () => f.roster, behavior: f.engine, rng: () => .5,
  });
  assert.equal(f.engine.forceVisit(f.a, f.b).ok, true);
  const source = f.world.food.allRipe()[0];
  f.a.ai.source = source;
  f.world.food.claim(source, f.a);
  assert.equal(f.a.ai.visitHome, f.world.homes[0].name);

  f.a.inPond = true;
  adapter.update(DT);
  assert.equal(f.a.ai.interrupted, true);
  assert.equal(f.a.ai.state, 'visit', 'pond entry does not cancel the visit');
  assert.equal(f.a.ai.partner, f.b);
  assert.equal(f.b.ai.partner, f.a);
  assert.equal(f.a.ai.visitHome, f.world.homes[0].name, 'visit home survives');
  assert.equal(f.b.ai.visitHome, f.world.homes[0].name);
  assert.equal(f.a.ai.visitPhase, 'travel');
  assert.equal(f.a.ai.source, null, 'pond entry releases the food source');
  assert.equal(source.claim, null);

  // Exit: resumeTask clears the target; the next visit tick treats the now
  // targetless travel as an interrupted visit and closes it through
  // finishVisitPair(false). Interruption cleanup must not reward either actor.
  const beforeExitBond = bondOf(f.a, f.b);
  const beforeExit = {
    aSocial: f.a.social, bSocial: f.b.social,
    aAffection: f.a.affection, bAffection: f.b.affection,
  };
  const p = f.config.forActor(f.a);
  const pB = f.config.forActor(f.b);
  f.a.inPond = false;
  f.a.contacts = 1;
  f.a.airborne = false;
  f.a.rMat = [0, 0, 0, 0, 1];
  adapter.update(DT);
  assert.equal(f.a.ai.interrupted, false);
  assert.equal(f.a.ai.state, 'wander', 'pond exit closes the targetless travel visit');
  assert.equal(f.a.ai.partner, null);
  assert.equal(f.b.ai.partner, null);
  assert.equal(f.a.ai.target, null, 'resumeTask cleared the locomotion target');
  assert.equal(f.a.ai.visitHome, null);
  assert.equal(f.b.ai.visitHome, null);
  assert.ok(Math.abs(bondOf(f.a, f.b) - beforeExitBond) < 1e-12,
    'interrupted visit close grants no bond');
  assert.equal(historyCounts(f).a.hosted || 0, 0, 'pond-exit visit close writes no completion history');
  assert.equal(historyCounts(f).a.visit || 0, 0);
  assert.equal(historyCounts(f).b.hosted || 0, 0);
  assert.equal(historyCounts(f).b.visit || 0, 0);
  assert.ok(Math.abs(f.a.social - Math.min(1, beforeExit.aSocial + p.needs.socialRate * DT)) < 1e-12,
    'interrupted visit close grants no initiator relief');
  assert.ok(Math.abs(f.b.social - Math.min(1, beforeExit.bSocial + pB.needs.socialRate * DT)) < 1e-12,
    'interrupted visit close grants no partner relief');
  assert.ok(Math.abs(f.a.affection - Math.min(1, beforeExit.aAffection + p.needs.affectionRate * DT)) < 1e-12);
  assert.ok(Math.abs(f.b.affection - Math.min(1, beforeExit.bAffection + pB.needs.affectionRate * DT)) < 1e-12);

  // Repeated ticks after the close must not repeat the cleanup or reward path.
  adapter.update(DT);
  assert.equal(f.a.ai.partner, null);
  assert.equal(f.b.ai.partner, null);
  assert.ok(Math.abs(bondOf(f.a, f.b) - beforeExitBond) < 1e-12,
    'repeated pond ticks do not add interruption bond');
  assert.equal(historyCounts(f).a.hosted || 0, 0);
  assert.equal(historyCounts(f).a.visit || 0, 0);

  // Social pairs show the same current pond behavior.
  const s = setup(RACES[0], { rng: () => .5 });
  const socialAdapter = createBearAI({
    field: s.world, getBears: () => s.roster, behavior: s.engine, rng: () => .5,
  });
  assert.equal(s.engine.forceSocial(s.a, s.b).ok, true);
  s.a.inPond = true;
  socialAdapter.update(DT);
  assert.equal(s.a.ai.state, 'social');
  assert.equal(s.a.ai.partner, s.b);
  assert.equal(s.b.ai.partner, s.a);
});

test('saved actor records omit live pair and visit state at every stage', () => {
  for (const race of RACES) {
    const f = setup(race, { rng: () => .5 });
    driveToSocial(f);
    const social = snapshotActor(f.a);
    assert.equal('ai' in social, false, `${race.id}: runtime ai is not saved`);
    for (const key of ['partner', 'visitHome', 'visitRole', 'visitPhase', 'visitArrived', 'familyTask']) {
      assert.equal(key in social, false, `${race.id}: ${key} is runtime-only`);
    }
    assert.equal('partnerUid' in social, false, `${race.id}: a social pair creates no partnership`);

    const v = setup(race, { rng: () => 0 });
    driveToVisit(v);
    const visit = snapshotActor(v.a);
    assert.equal('ai' in visit, false);
    assert.equal('visitHome' in visit, false);
    assert.equal('visitPhase' in visit, false);
    assert.equal('visitRole' in visit, false);
  }
});

test('seeded: identical seeds replay the same invite/social completion and cleanup trace', () => {
  function run(seed) {
    const f = setup(RACES[0], { rng: mulberry32(seed) });
    startCompany(f);
    const trace = [];
    let completed = false;
    for (let index = 0; index < 500; index++) {
      engineTick(f);
      trace.push([f.a.ai.state, f.b.ai.state,
        +f.a.social.toFixed(9), +f.b.social.toFixed(9),
        +bondOf(f.a, f.b).toFixed(9)]);
      if (trace.some(item => item[0] === 'social') && f.a.ai.partner === null) {
        completed = true;
        break;
      }
    }
    assert.equal(completed, true, 'seeded trace completes the pair');
    return {
      trace,
      a: f.a.history.map(event => ({ ...event })),
      b: f.b.history.map(event => ({ ...event })),
      partner: f.a.ai.partner,
      partnerB: f.b.ai.partner,
      state: f.a.ai.state,
    };
  }
  const first = run(41);
  const second = run(41);
  assert.deepEqual(second, first, 'same seed must reproduce states, needs, bond and history');
  assert.equal(first.a.filter(event => event.kind === 'social').length, 1);
  assert.equal(first.b.filter(event => event.kind === 'social').length, 1);
  assert.equal(first.partner, null);
  assert.equal(first.partnerB, null);
  assert.equal(first.state, 'wander');

  const other = run(42);
  assert.notDeepEqual(other.trace, first.trace, 'a different seed changes the trace');
});
