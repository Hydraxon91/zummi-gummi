import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVITY_PROPOSALS, activityProposalOrder, defineProposalCandidate,
  describeActivityDecision, rankProposals, scoreContributions,
} from '../src/behaviors/proposals.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { createBehavior } from '../src/behaviors/index.js';
import { createWorld, createRoster, mulberry32 } from '../scripts/behavior-parity.mjs';
import { snapshotActor } from '../src/actorrecord.js';
import { bondOf } from '../src/family.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} != ${b}`);

function fixture({ features = {}, hours = 20, others = true, preference = null, habit = 0,
  random = () => .12, social = 0, affection = 0 } = {}) {
  const roster = createRoster('glass', 0, { allAdults: true });
  const actor = roster[0];
  const active = others ? roster : [actor];
  let now = hours;
  let draws = 0;
  const config = createBehaviorConfig({ features });
  const engine = createBehavior({
    engine: 'modules', config, field: createWorld(), getActors: () => active,
    getHours: () => now, getDay: () => 1, getPopulationCap: () => 40,
    daySeconds: 600, rng: () => { draws++; return random(); },
  });
  for (const item of roster) engine.attach(item);
  for (const item of roster) { item.social = 0; item.affection = 0; }
  actor.social = social;
  actor.affection = affection;
  if (preference !== null) config.setPreference(actor, 'stargaze', preference);
  if (habit) actor.habits = { stargaze: habit };
  return {
    actor, roster, engine, config,
    draws: () => draws,
    hours(value) { now = value; },
    candidates: () => engine.activityProposals(actor),
  };
}

test('portable proposal definitions, validation, ranking and explanations', () => {
  assert.equal(FEATURE_DEFAULTS.activityChooser, false);
  assert.equal(Object.isFrozen(ACTIVITY_PROPOSALS[0]), true);
  assert.deepEqual(ACTIVITY_PROPOSALS.map(item => item.id), ['social.company', 'stargaze.seek']);
  assert.equal(activityProposalOrder('stargaze.seek'), 120);
  assert.equal(activityProposalOrder('unknown'), null);
  assert.equal(scoreContributions({ a: .1, b: .2 }), .3);
  for (const value of [null, [], { a: NaN }, { a: '1' }]) {
    assert.throws(() => scoreContributions(value));
  }
  assert.throws(() => defineProposalCandidate({ id: 'unknown', reason: 'x' }));
  assert.throws(() => defineProposalCandidate({ id: 'social.company' }));
  assert.throws(() => defineProposalCandidate({ id: 'social.company', reason: 'x', contributions: { n: Infinity } }));
  const candidate = defineProposalCandidate({
    id: 'social.company', eligible: true, reason: 'social-need', contributions: { needPressure: .25 },
  });
  assert.equal(candidate.score, .25);
  assert.equal(Object.isFrozen(candidate.contributions), true);

  const candidates = [
    defineProposalCandidate({ id: 'stargaze.seek', eligible: true, reason: 'night-window', contributions: { chanceShare: .25 } }),
    defineProposalCandidate({ id: 'social.company', eligible: true, reason: 'social-need', contributions: { needPressure: .25 } }),
    defineProposalCandidate({ id: 'stargaze.seek', eligible: false, reason: 'outside-window' }),
  ];
  const before = JSON.stringify(candidates);
  // Exact ties keep the authored pipeline order: social (110) before stargaze (120).
  assert.deepEqual(rankProposals(candidates), ['social.company', 'stargaze.seek']);
  assert.equal(JSON.stringify(candidates), before, 'ranking must not mutate candidates');
  const decision = describeActivityDecision({ day: 2, hours: 20, candidates, started: 'social.company' });
  assert.equal(decision.outcome, 'started');
  assert.equal(decision.chosen, 'social.company');
  assert.deepEqual(decision.refused, []);
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(describeActivityDecision({ candidates: [candidates[2]] }).outcome, 'no-eligible');
  assert.equal(describeActivityDecision({
    candidates, refused: ['social.company', 'stargaze.seek'],
  }).outcome, 'refused');
});

test('candidate eligibility and scores are RNG-free and side-effect free', () => {
  const f = fixture({ features: { activityChooser: true, preferences: true }, social: .7, preference: 0 });
  const draws = f.draws();
  const candidates = f.candidates();
  assert.equal(f.draws(), draws, 'evaluation must not draw RNG');
  assert.equal(f.actor.ai.state, 'wander');
  assert.equal(f.actor.ai.socialCooldown, 0);
  assert.equal(f.roster[1].ai.partner, null, 'considering company cannot reserve a partner');
  assert.deepEqual(candidates.map(c => c.id), ['social.company', 'stargaze.seek']);
  assert.equal(candidates.every(c => c.eligible), true);
  // Glass seekSocial is .64: .7 is (.7-.64)/(1-.64) of the way above its floor.
  near(candidates[0].score, (.7 - .64) / .36);
  // Default liking .06 divided by the existing .25 chance ceiling.
  near(candidates[1].score, .24);
  assert.deepEqual(f.candidates(), candidates, 'repeated evaluation is identical');
  assert.equal(f.draws(), draws);

  const day = fixture({ features: { activityChooser: true }, hours: 12, social: .7 });
  const dayCandidates = day.candidates();
  assert.equal(dayCandidates[1].eligible, false);
  assert.equal(dayCandidates[1].reason, 'outside-window');
  assert.equal(dayCandidates[1].score, 0);

  const none = fixture({ features: { activityChooser: true }, others: false, social: .7 });
  assert.equal(none.candidates()[0].eligible, false);
  assert.equal(none.candidates()[0].reason, 'no-company-nearby');
});

test('enabled choice ranks social pressure against stargazing and executes the winner', () => {
  const stargazing = fixture({ features: { activityChooser: true, preferences: true }, social: .7, preference: 1 });
  assert.equal(stargazing.engine.chooseActivity(stargazing.actor), 'stargaze.seek');
  assert.equal(stargazing.actor.ai.state, 'stargaze');
  const decision = stargazing.engine.activityDecision(stargazing.actor);
  assert.equal(decision.outcome, 'started');
  assert.equal(decision.started, 'stargaze.seek');
  assert.deepEqual(decision.ranked, ['stargaze.seek', 'social.company']);
  assert.deepEqual(decision.candidates.map(c => c.reason), ['social-need', 'night-window']);

  const social = fixture({ features: { activityChooser: true }, social: .95 });
  assert.equal(social.engine.chooseActivity(social.actor), 'social.company');
  assert.equal(social.actor.ai.state, 'seekCompany');
  assert.ok(social.actor.ai.partner && social.actor.ai.partner !== social.actor);
  assert.equal(social.actor.ai.partner.ai.partner, social.actor);

  // A named liking and a learned habit move stargazing from .4 to .64, so only a
  // social need above ~.87 outranks it. The effect is never applied twice.
  const liked = fixture({ features: { activityChooser: true, preferences: true, habits: true },
    social: .7, preference: 1, habit: 1 });
  near(liked.candidates()[1].score, .64);
  assert.equal(liked.engine.chooseActivity(liked.actor), 'stargaze.seek');
});

test('exact score ties keep the authored order', () => {
  const f = fixture({ features: { activityChooser: true, preferences: true, habits: true }, preference: 1, habit: 1 });
  // .64 stargazing share meets .64 social pressure at need .64 + .64 * .36.
  f.actor.social = .64 + .64 * .36;
  const candidates = f.candidates();
  near(candidates[0].score, .64);
  near(candidates[1].score, .64);
  assert.deepEqual(rankProposals(candidates), ['social.company', 'stargaze.seek']);
  assert.equal(f.engine.chooseActivity(f.actor), 'social.company');
  assert.equal(f.engine.activityDecision(f.actor).chosen, 'social.company');
});

test('refused or absent candidates explain themselves and fall back to wandering', () => {
  const refused = fixture({ features: { activityChooser: true }, social: 0, random: () => .99 });
  assert.equal(refused.engine.chooseActivity(refused.actor), null);
  const decision = refused.engine.activityDecision(refused.actor);
  assert.equal(decision.outcome, 'refused');
  assert.deepEqual(decision.ranked, ['stargaze.seek']);
  assert.deepEqual(decision.refused, ['stargaze.seek'], 'the failed admission roll is recorded');
  assert.equal(refused.actor.ai.state, 'wander');
  assert.equal(refused.engine.coverage().activityChoices.refused, 1);

  const empty = fixture({ features: { activityChooser: true }, hours: 20, social: 0 });
  empty.config.setModuleEnabled('stargaze', false);
  empty.engine.tick(empty.actor, 1);
  const none = empty.engine.activityDecision(empty.actor);
  assert.equal(none.outcome, 'no-eligible');
  assert.equal(none.chosen, null);
  assert.ok(empty.actor.ai.idleT > 0 || empty.actor.ai.moving,
    'the ordinary wander fallback still runs');
  assert.equal(empty.engine.coverage().activityChoices['no-eligible'], 1);
});

test('essential needs, directives and survival exits stay authoritative', () => {
  const thirsty = fixture({ features: { activityChooser: true }, social: .95 });
  thirsty.actor.thirst = 1;
  thirsty.engine.tick(thirsty.actor, 1);
  assert.notEqual(thirsty.actor.ai.state, 'seekCompany');
  assert.notEqual(thirsty.actor.ai.state, 'stargaze');
  assert.equal(thirsty.engine.activityDecision(thirsty.actor), null);
  assert.equal(thirsty.engine.coverage().activityChoices.started, undefined);

  const commanded = fixture({ features: { activityChooser: true }, social: .95 });
  commanded.actor.ai.directive = { ttl: 5 };
  commanded.engine.tick(commanded.actor, 1);
  assert.equal(commanded.engine.activityDecision(commanded.actor), null);
  assert.equal(commanded.actor.ai.state, 'wander');
});

test('disabling the chooser clears explanations and restores ordered selection', () => {
  const f = fixture({ features: { activityChooser: true }, social: .7, preference: 1 });
  f.engine.chooseActivity(f.actor);
  assert.ok(f.engine.activityDecision(f.actor));
  f.engine.setFeature('activityChooser', false);
  assert.equal(f.engine.activityDecision(f.actor), null);
  assert.equal(f.engine.chooseActivity(f.actor), null);
  f.actor.ai.state = 'wander';
  f.actor.ai.nextThink = 0;
  f.engine.tick(f.actor, 1);
  const coverage = f.engine.coverage();
  assert.equal(coverage.opportunities['wander.activity'], undefined);
  assert.ok(coverage.opportunities['social.company'] >= 1,
    'the authored social slot runs first again');
});

function trace(seed, features, { social = .7, preference = 1 } = {}) {
  const rng = mulberry32(seed);
  const f = fixture({ features, random: rng, social, preference });
  const out = [];
  for (let i = 0; i < 600; i++) {
    f.engine.tick(f.actor, .1);
    if (f.actor.ai.moving && f.actor.ai.target) {
      f.actor.cx = f.actor.ai.target.x;
      f.actor.cz = f.actor.ai.target.z;
      f.actor.ai.moving = false;
      f.actor.ai.arrived = true;
      f.actor.ai.target = null;
    }
    out.push([f.actor.ai.state, f.actor.ai.idleT, f.actor.ai.hunger,
      f.actor.ai.activityDecision?.started || null, f.draws()]);
  }
  return { out, draws: f.draws(), coverage: f.engine.coverage() };
}

test('enabled traces reproduce; disabled traces keep the ordered pipeline and draws', () => {
  const enabled = trace(11, { activityChooser: true, preferences: true });
  assert.deepEqual(enabled, trace(11, { activityChooser: true, preferences: true }));
  assert.ok(enabled.coverage.opportunities['wander.activity'] > 0,
    'enabled trace consults the chooser');
  assert.ok(enabled.coverage.activityChoices.started > 0);
  assert.ok(enabled.coverage.opportunities['stargaze.seek'] > 0);

  const off = trace(11, {});
  assert.deepEqual(off, trace(11, {}));
  assert.equal(off.coverage.opportunities['wander.activity'], undefined);
  assert.deepEqual(off.coverage.activityChoices, {});
  assert.ok(off.coverage.opportunities['social.company'] > 0);
  assert.ok(off.coverage.opportunities['stargaze.seek'] > 0,
    'the authored slots still run when the chooser is off');
});

test('decision explanations are runtime-only and never change the save record', () => {
  const f = fixture({ features: { activityChooser: true }, social: .95 });
  f.engine.chooseActivity(f.actor);
  const decision = f.engine.activityDecision(f.actor);
  decision.candidates[0].contributions.needPressure = 9;
  assert.notEqual(f.engine.activityDecision(f.actor).candidates[0].contributions.needPressure, 9,
    'debug reads return a detached snapshot');
  const record = snapshotActor(f.actor, { flavor: 0 });
  assert.equal('activityDecision' in record, false);
  assert.equal(record.actorVersion, 2, 'no new saved actor version');
  f.engine.detach(f.actor);
  f.engine.attach(f.actor);
  assert.equal(f.actor.ai.activityDecision, undefined);
  assert.equal(f.engine.activityDecision(f.actor), null);
});

// Advance one actor without the render loop: simulate arrival immediately so
// pairing states settle on the next tick.
function step(f, actor) {
  f.engine.tick(actor, .1);
  if (actor.ai && actor.ai.moving && actor.ai.target) {
    actor.cx = actor.ai.target.x;
    actor.cz = actor.ai.target.z;
    actor.ai.moving = false;
    actor.ai.arrived = true;
    actor.ai.target = null;
  }
}

function chooserFixture(options) {
  const f = fixture(options);
  f.config.setModuleEnabled('mate', false);
  return f;
}

test('the generic dispatcher cannot bypass ranking while the chooser is on', () => {
  const f = chooserFixture({ features: { activityChooser: true, preferences: true }, social: .7, preference: 1 });
  const started = f.engine.runOpportunities(f.actor);
  assert.equal(started?.id, 'wander.activity', 'the ranked slot owns both members');
  assert.equal(f.actor.ai.state, 'stargaze');
  assert.equal(f.engine.activityDecision(f.actor).chosen, 'stargaze.seek');

  const off = chooserFixture({ features: {}, social: .7 });
  assert.equal(off.engine.runOpportunities(off.actor)?.id, 'social.company');
});

test('chooser-started social completes once and releases both partners', () => {
  const f = chooserFixture({ features: { activityChooser: true }, social: .95, random: () => 0 });
  assert.equal(f.engine.chooseActivity(f.actor), 'social.company');
  const partner = f.actor.ai.partner;
  assert.ok(partner, 'the chosen candidate reserved a partner through admission');
  const p = f.config.forActor(f.actor);
  const before = bondOf(f.actor, partner);
  const family = !!f.actor.ai.familyPlay;
  const expected = family
    ? p.social.familyBondBase + p.social.familyBondExtra
    : p.social.bondBase;
  let sawSocial = false;
  for (let i = 0; i < 900 && !(sawSocial && f.actor.ai.state === 'wander'); i++) {
    step(f, f.actor);
    step(f, partner);
    if (f.actor.ai.state === 'social') sawSocial = true;
  }
  assert.ok(sawSocial, 'the real invite is accepted and the pair socialises');
  assert.equal(f.actor.ai.state, 'wander');
  assert.equal(f.actor.ai.partner, null);
  assert.equal(partner.ai.partner, null);
  near(bondOf(f.actor, partner) - before, expected);
  assert.ok(f.actor.ai.socialCooldown > 0);
});

test('chooser-started social can be refused without side effects', () => {
  const f = chooserFixture({ features: { activityChooser: true }, social: .95, random: () => .999 });
  assert.equal(f.engine.chooseActivity(f.actor), 'social.company');
  const partner = f.actor.ai.partner;
  assert.ok(partner);
  const before = bondOf(f.actor, partner);
  let sawDecline = false;
  for (let i = 0; i < 600 && !(sawDecline && f.actor.ai.state === 'wander'); i++) {
    step(f, f.actor);
    step(f, partner);
    if (f.actor.ai.state === 'decline' || partner.ai.state === 'decline') sawDecline = true;
  }
  assert.ok(sawDecline, 'a low acceptance roll declines the invite');
  assert.equal(f.actor.ai.state, 'wander');
  assert.equal(f.actor.ai.partner, null);
  assert.equal(partner.ai.partner, null);
  near(bondOf(f.actor, partner), before);
  assert.ok(f.actor.ai.socialCooldown > 0, 'decline cooldown is preserved');
});

test('interrupting a chooser-started pairing cleans both sides without reward', () => {
  const f = chooserFixture({ features: { activityChooser: true }, social: .95, random: () => 0 });
  assert.equal(f.engine.chooseActivity(f.actor), 'social.company');
  const partner = f.actor.ai.partner;
  const before = bondOf(f.actor, partner);
  f.engine.onGrab(f.actor);
  assert.equal(f.actor.ai.partner, null);
  assert.equal(partner.ai.partner, null);
  assert.equal(f.actor.ai.state, 'wander');
  assert.equal(partner.ai.state, 'wander');
  near(bondOf(f.actor, partner), before);
});

test('disabling the chooser leaves an ongoing activity untouched and re-enables cleanly', () => {
  const f = chooserFixture({ features: { activityChooser: true, preferences: true }, preference: 1, random: () => 0 });
  assert.equal(f.engine.chooseActivity(f.actor), 'stargaze.seek');
  const idle = f.actor.ai.idleT;
  f.engine.setFeature('activityChooser', false);
  assert.equal(f.actor.ai.state, 'stargaze', 'disabling must not cancel the running activity');
  assert.equal(f.engine.activityDecision(f.actor), null, 'the stale explanation is cleared');
  step(f, f.actor);
  assert.equal(f.actor.ai.state, 'stargaze');
  assert.ok(f.actor.ai.idleT < idle, 'the session keeps counting down');
  for (let i = 0; i < 80 && f.actor.ai.state === 'stargaze'; i++) step(f, f.actor);
  assert.notEqual(f.actor.ai.state, 'stargaze');
  f.actor.ai.nextThink = 0;
  f.actor.ai.taskCooldown = 0;
  f.engine.setFeature('activityChooser', true);
  step(f, f.actor);
  assert.equal(f.engine.activityDecision(f.actor)?.started, 'stargaze.seek');
  assert.equal(f.actor.ai.state, 'stargaze');
});
