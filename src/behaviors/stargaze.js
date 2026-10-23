// Glass stargazing.
//
// Profile-gated by p.stargaze only. The night window is today's quirk 11
// window (not day 09:00-16:00); the off glassNightWindow flag can narrow it to
// real night later. Exit thresholds are the raw .85/.88 values.

import { defineBehaviorModule } from './module.js';
import { defineProposalCandidate } from './proposals.js';

// The chooser normalizes the resolved chance by its documented .25 ceiling, so
// batch 2 preference/habit effects are already included and never applied twice.
const SCORE_CEILING = .25;

function windowOpen(ctx) {
  const { api, p } = ctx;
  if (!p.stargaze) return false;
  let open = !api.isDayFor(ctx.actor);
  if (ctx.features.glassNightWindow) {
    const nightStart = Number.isFinite(p.rest.nightStart) ? p.rest.nightStart : 18;
    const nightEnd = Number.isFinite(p.rest.nightEnd) ? p.rest.nightEnd : 6;
    const h = api.hoursNow();
    open = h >= nightStart || h < nightEnd;
  }
  return open;
}

// RNG-free eligibility/score for the optional activity chooser. Admission still
// draws the existing chance roll when the candidate is executed.
function proposal(ctx) {
  const { p } = ctx;
  if (!p.stargaze) return defineProposalCandidate({ id: 'stargaze.seek', reason: 'unsupported' });
  if (!windowOpen(ctx)) {
    return defineProposalCandidate({ id: 'stargaze.seek', reason: 'outside-window' });
  }
  const chance = Number.isFinite(p.stargaze.chance) ? p.stargaze.chance : 0;
  const chanceShare = Math.max(0, Math.min(1, chance / SCORE_CEILING));
  return defineProposalCandidate({
    id: 'stargaze.seek', eligible: true, reason: 'night-window',
    contributions: { chanceShare },
  });
}

export const stargazeModule = defineBehaviorModule({
  id: 'stargaze',
  label: 'Stargazing',
  states: ['stargaze'],
  defaults: { enabled: false, params: {} },
  opportunities: [{
    id: 'stargaze.seek',
    order: 120,
    canRun: (ctx) => {
      if (!windowOpen(ctx)) return false;
      if (ctx.rng() >= ctx.p.stargaze.chance) return false;
      return true;
    },
    enter: (ctx) => {
      const { actor, ai, p, api } = ctx;
      api.coverSlot('stargaze');
      api.coverHour('stargaze', api.hoursNow());
      ai.state = 'stargaze';
      ai.idleT = p.stargaze.min + ctx.rng() * (p.stargaze.max - p.stargaze.min);
      if (ctx.features.habits) ai.stargazeLearning = true;
      api.stop(actor);
      return true;
    },
  }],
  proposal,
  tick(ctx) {
    const { actor, ai, dt, api } = ctx;
    if (!ai || ai.state !== 'stargaze') return false;
    // `ai.idleT` is advanced once by the engine's generic idle timer before
    // module ticks. Decrementing it here as well halved every sampled session.
    if (ai.idleT <= 0 || actor.hunger > .85 || actor.thirst > .88) {
      if (ctx.features.habits && ai.stargazeLearning &&
          ai.idleT <= 0 && actor.hunger <= .85 && actor.thirst <= .88) {
        api.learnActivity(actor, 'stargaze');
      }
      if (ai.stargazeLearning) delete ai.stargazeLearning;
      api.coverHour('stargaze-exit', api.hoursNow());
      ai.state = 'wander';
      ai.idleT = 0;
      ai.nextThink = 0;
    }
    return true;
  },
  isTraveling: () => false,
});
