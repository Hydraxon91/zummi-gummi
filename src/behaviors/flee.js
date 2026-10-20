// Flee behavior: the shared threat response used by hive stings.
//
// Keep this separate from conflict. The hive module calls startFlee through the
// engine API; the exit state is still seekFood (legacy quirk).

import { defineBehaviorModule } from './module.js';

function startFlee(ctx, source) {
  const { actor, ai, p, api, field } = ctx;
  if (!actor || !ai) return;
  const hive = p.hive;
  api.cancelPair(actor);
  api.releaseFood(actor);
  ai.follow = null;
  ai.target = null;
  ai.faceYaw = null;
  ai.state = 'flee';
  ai.fleeT = hive ? hive.fleeTime : 1.4;
  ai.fleeFrom = source ? { x: source.x, z: source.z } : null;
  api.coverFlee('start');
  if (!field || !field.nav) return;
  const dx = actor.cx - (source ? source.x : actor.cx);
  const dz = actor.cz - (source ? source.z : actor.cz);
  const len = Math.hypot(dx, dz) || 1;
  const p2 = field.nav.nearestWalkable(actor.cx + dx / len * 4.5, actor.cz + dz / len * 4.5);
  if (!p2) return;
  ai.target = { x: p2.x, z: p2.z };
  api.face(actor, p2.x, p2.z);
  const path = api.pathTo(actor, p2.x, p2.z);
  if (path) api.setPath(actor, path);
  else ai.moving = false;
}

export const fleeModule = defineBehaviorModule({
  id: 'flee',
  label: 'Flee threat response',
  states: ['flee'],
  activeStates: ['flee'],
  defaults: { enabled: true, params: {} },
  startFlee,
  tick(ctx) {
    const { ai, dt, api } = ctx;
    if (!ai || ai.state !== 'flee') return false;
    ai.fleeT -= dt;
    if (ai.fleeT <= 0) {
      api.coverFlee('exitSeekFood');
      ai.state = 'seekFood';
      ai.nextThink = 0;
      ai.moving = false;
      api.stop(ctx.actor);
    }
    return true;
  },
});
