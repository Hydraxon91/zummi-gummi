// Glass stargazing.
//
// Profile-gated by p.stargaze only. The night window is today's quirk 11
// window (not day 09:00-16:00); the off glassNightWindow flag can narrow it to
// real night later. Exit thresholds are the raw .85/.88 values.

import { defineBehaviorModule } from './module.js';

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
      api.stop(actor);
      return true;
    },
  }],
  tick(ctx) {
    const { actor, ai, dt, api } = ctx;
    if (!ai || ai.state !== 'stargaze') return false;
    ai.idleT = Math.max(0, ai.idleT - dt);
    if (ai.idleT <= 0 || actor.hunger > .85 || actor.thirst > .88) {
      api.coverHour('stargaze-exit', api.hoursNow());
      ai.state = 'wander';
      ai.idleT = 0;
      ai.nextThink = 0;
    }
    return true;
  },
  isTraveling: () => false,
});
