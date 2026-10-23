// Spaced group activities for three to five actors.
//
// A leader claims two to four nearby idle actors, assigns each a walkable slot
// around the meeting point, waits up to five seconds for everyone to arrive and
// then runs a ten-second activity. Leaving removes only that member; falling
// below three participants dissolves the group without effects. Completion
// applies social relief and one +0.01 bond per participating pair exactly once.

import {
  addBond, bondOf, pairBond, pushHistory,
} from '../family.js';
import { actorAvailable } from '../interactions.js';
import { defineBehaviorModule } from './module.js';

const GROUP_STATE = 'group';

function params(ctx) {
  return ctx.p.behaviorModules?.groupActivities?.params || {};
}

function clearMember(actor, cooldown = 0) {
  if (!actor || !actor.ai) return;
  actor.ai.group = null;
  actor.ai.groupSlot = null;
  actor.ai.groupRole = null;
  actor.ai.state = 'wander';
  actor.ai.idleT = .6;
  actor.ai.moving = false;
  actor.ai.path = null;
  actor.ai.target = null;
  if (cooldown > 0) {
    actor.ai.groupCooldown = Math.max(actor.ai.groupCooldown || 0, cooldown);
  }
}

function membersOf(group) {
  if (!group || !Array.isArray(group.members)) return [];
  group.members = group.members.filter(member => member && member.active && member.ai &&
    member.ai.group === group);
  return group.members;
}

function chooseLeader(group) {
  const members = membersOf(group);
  if (!members.length) return null;
  const leader = members.slice().sort((a, b) => a.uid - b.uid)[0];
  group.leaderUid = leader.uid;
  for (const member of members) {
    member.ai.groupRole = member === leader ? 'leader' : 'member';
  }
  return leader;
}

function dissolve(ctx, group, cooldown = 0) {
  if (!group || group.done) return;
  group.done = true;
  const api = ctx.api;
  for (const member of membersOf(group)) {
    clearMember(member, cooldown);
    api.stop(member);
  }
  if (Array.isArray(group.members)) group.members.length = 0;
}

function cancelGroup(ctx) {
  const { actor, ai, api } = ctx;
  if (!actor || !ai || !ai.group) return false;
  const group = ai.group;
  if (group.done) {
    clearMember(actor);
    return true;
  }
  group.members = membersOf(group).filter(member => member !== actor);
  clearMember(actor, params(ctx).cooldown || 45);
  api.stop(actor);
  if (group.members.length < 3) {
    dissolve(ctx, group, params(ctx).cooldown || 45);
    return true;
  }
  if (group.leaderUid === actor.uid) chooseLeader(group);
  return true;
}

function slotsFor(ctx, members) {
  const p = params(ctx);
  const count = members.length;
  const center = members.reduce((sum, member) => ({
    x: sum.x + member.cx / count,
    z: sum.z + member.cz / count,
  }), { x: 0, z: 0 });
  return members.map((member, index) => {
    let angle = Math.atan2(member.cz - center.z, member.cx - center.x);
    if (!Number.isFinite(angle) || Math.hypot(member.cx - center.x, member.cz - center.z) < .08) {
      angle = (index / count) * Math.PI * 2;
    }
    const x = center.x + Math.cos(angle) * p.spacing;
    const z = center.z + Math.sin(angle) * p.spacing;
    const nav = ctx.api.navigation();
    const near = nav && typeof nav.nearestWalkable === 'function'
      ? nav.nearestWalkable(x, z) : { x, z };
    return { x: near ? near.x : x, z: near ? near.z : z };
  });
}

function acquireGroup(ctx) {
  const { actor, ai, api, features } = ctx;
  if (!features?.groupActivities || !actor || !ai) return false;
  const p = params(ctx);
  if ((ai.groupCooldown || 0) > 0 || ai.partner || ai.familyTask) return false;
  if (!actorAvailable(actor)) return false;
  const candidates = [];
  for (const other of api.actors()) {
    if (other === actor || !other.active || !actorAvailable(other) || other.fading) continue;
    if (other.ai.state !== 'wander' || other.ai.partner || other.ai.familyTask) continue;
    if ((other.ai.groupCooldown || 0) > 0 || other.health < p.health) continue;
    const d = Math.hypot(other.cx - actor.cx, other.cz - actor.cz);
    if (d > p.radius) continue;
    candidates.push({ other, d });
  }
  candidates.sort((a, b) => pairBond(actor, b.other) - pairBond(actor, a.other) ||
    a.d - b.d || a.other.uid - b.other.uid);
  if (candidates.length < 2) return false;
  const members = [actor, ...candidates.slice(0, p.max - 1).map(entry => entry.other)];
  return startGroup(ctx, members);
}

function startGroup(ctx, members) {
  const { actor, api, features } = ctx;
  const p = params(ctx);
  if (!features?.groupActivities || !actor || !Array.isArray(members)) return false;
  if (members.length < p.min || members.length > p.max) return false;
  if (!members.includes(actor)) return false;
  for (const member of members) {
    if (!member || !member.ai || !member.active || !actorAvailable(member) || member.fading) return false;
    if (member !== actor && (member.ai.state !== 'wander' || member.ai.partner || member.ai.familyTask)) return false;
  }
  const slots = slotsFor(ctx, members);
  const kind = actor.stage === 'adult' ? 'groupGather' : 'groupPlay';
  const group = {
    id: `${kind}-${actor.uid}-${Math.floor(api.dayNow())}-${Math.floor(api.hoursNow() * 100)}`,
    kind,
    leaderUid: actor.uid,
    members,
    phase: 'travel',
    t: p.joinSeconds,
    done: false,
  };
  members.forEach((member, index) => {
    member.ai.group = group;
    member.ai.groupSlot = slots[index];
    member.ai.groupRole = index === 0 ? 'leader' : 'member';
    member.ai.state = GROUP_STATE;
    member.ai.partner = null;
    member.ai.familyTask = null;
    member.ai.moving = false;
    member.ai.path = null;
    member.ai.target = { ...slots[index] };
    api.face(member, actor.cx, actor.cz);
  });
  return true;
}

function allAtSlots(members) {
  return members.every(member => member.ai.groupSlot &&
    Math.hypot(member.ai.groupSlot.x - member.cx, member.ai.groupSlot.z - member.cz) <= 1.25);
}

function completeGroup(ctx, group) {
  if (!group || group.done) return false;
  const { api, features } = ctx;
  const members = membersOf(group);
  if (members.length < 3) {
    dissolve(ctx, group, params(ctx).cooldown || 45);
    return false;
  }
  group.done = true;
  const day = api.dayNow();
  const hour = api.hoursNow();
  for (const member of members) {
    const profile = api.profile(member);
    member.social = Math.max(0, member.social - profile.social.relief);
    member.affection = Math.max(0, member.affection - profile.social.affectionRelief);
  }
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i];
      const b = members[j];
      const beforeA = bondOf(a, b);
      const beforeB = bondOf(b, a);
      addBond(a, b, params(ctx).bond);
      if (features.interactionHistory) {
        pushHistory(a, {
          kind: group.kind, uid: b.uid, day, hour,
          bondBefore: beforeA, bondAfter: bondOf(a, b),
        });
        pushHistory(b, {
          kind: group.kind, uid: a.uid, day, hour,
          bondBefore: beforeB, bondAfter: bondOf(b, a),
        });
      }
    }
  }
  for (const member of members) {
    api.emit(member, group.kind === 'groupPlay' ? 'heart' : 'chat', 1.0);
    clearMember(member, params(ctx).cooldown || 45);
    api.stop(member);
  }
  return true;
}

function tickGroup(ctx) {
  const { actor, ai, api, dt } = ctx;
  const group = ai.group;
  if (!group || group.done) {
    if (ai.group) clearMember(actor);
    return false;
  }
  const members = membersOf(group);
  if (!members.includes(actor)) {
    clearMember(actor);
    return false;
  }
  if (!members.some(member => member.uid === group.leaderUid)) chooseLeader(group);
  const leader = members.find(member => member.uid === group.leaderUid) || chooseLeader(group);
  if (!leader) return false;

  if (group.phase === 'travel') {
    const slot = ai.groupSlot;
    if (slot && Math.hypot(slot.x - actor.cx, slot.z - actor.cz) > 1.2 &&
        api.needsReplan(ai)) {
      api.setDestination(actor, slot.x, slot.z);
    }
    if (leader === actor) {
      group.t -= dt;
      if (allAtSlots(members)) {
        group.phase = 'act';
        group.t = params(ctx).duration;
        for (const member of members) {
          member.ai.moving = false;
          member.ai.path = null;
          api.face(member, leader.cx, leader.cz);
        }
      } else if (group.t <= 0) {
        dissolve(ctx, group, params(ctx).cooldown || 45);
      }
    }
    return true;
  }

  if (leader === actor) {
    group.t -= dt;
    if (group.t <= 0) completeGroup(ctx, group);
  }
  return true;
}

export const groupActivitiesModule = defineBehaviorModule({
  cancel: cancelGroup,
  id: 'groupActivities',
  label: 'Group activities',
  states: [GROUP_STATE],
  activeStates: [GROUP_STATE],
  defaults: {
    enabled: true,
    params: {
      radius: 8,
      spacing: 1.05,
      min: 3,
      max: 5,
      health: 15,
      joinSeconds: 5,
      duration: 10,
      bond: .01,
      cooldown: 45,
    },
  },
  opportunities: [{
    id: 'group.seek',
    order: 114,
    canRun: (ctx) => !!ctx.features?.groupActivities && !!ctx.actor &&
      (ctx.actor.ai.groupCooldown || 0) <= 0,
    enter: (ctx) => acquireGroup(ctx),
  }],
  acquireGroup,
  startGroup,
  cancelGroup,
  completeGroup,
  tick(ctx) {
    return tickGroup(ctx);
  },
  isTraveling: (ctx) => !!(ctx.ai && ctx.ai.state === GROUP_STATE &&
    ctx.ai.group && ctx.ai.group.phase === 'travel'),
  interrupt(ctx) {
    if (ctx.ai && ctx.ai.state === GROUP_STATE) cancelGroup(ctx);
  },
});
