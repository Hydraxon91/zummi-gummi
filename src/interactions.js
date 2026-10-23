// Shared interaction definitions and pair/task primitives.
//
// behavior.js owns *when* an actor chooses an interaction. This module owns the
// data and the small state protocol every representation follows, so a new
// social/family interaction is a registration plus optional effects rather than
// a new branch in ai.js and glass.js.

const registry = new Map();

export const INTERACTIONS = Object.freeze({
  social: 'social',
  invite: 'invite',
  visit: 'visit',
  follow: 'follow',
  mate: 'mate',
  familyMeal: 'familyMeal',
  familyLesson: 'familyLesson',
  familyPlaydate: 'familyPlaydate',
});

export function registerInteraction(def) {
  if (!def || typeof def.id !== 'string' || !def.id) throw new Error('interaction id required');
  if (typeof def.mode !== 'string') throw new Error(`interaction ${def.id} mode required`);
  if (registry.has(def.id)) throw new Error(`interaction already registered: ${def.id}`);
  const normalized = Object.freeze({
    id: def.id,
    mode: def.mode,                       // 'solo' | 'pair'
    roles: Array.isArray(def.roles) ? def.roles.slice() : null,
    duration: Number.isFinite(def.duration) ? def.duration : 4,
    cooldown: Number.isFinite(def.cooldown) ? def.cooldown : 0,
    arriveDist: Number.isFinite(def.arriveDist) ? def.arriveDist : 1.4,
    label: def.label || def.id,
  });
  registry.set(normalized.id, normalized);
  return normalized;
}

export function interactionFor(id) {
  return registry.get(id) || null;
}

export function listInteractions() {
  return [...registry.values()];
}

registerInteraction({ id: INTERACTIONS.social, mode: 'pair', roles: ['initiator', 'partner'], duration: 4.2, cooldown: 14, label: 'social' });
registerInteraction({ id: INTERACTIONS.visit, mode: 'pair', roles: ['host', 'guest'], duration: 4.8, cooldown: 8, label: 'visit' });
registerInteraction({ id: INTERACTIONS.mate, mode: 'pair', roles: ['female', 'male'], duration: 3, cooldown: 90, label: 'mate' });
registerInteraction({ id: INTERACTIONS.familyMeal, mode: 'solo', duration: 6, cooldown: 0, arriveDist: 1.2, label: 'family meal' });
registerInteraction({ id: INTERACTIONS.familyLesson, mode: 'pair', roles: ['teacher', 'student'], duration: 5, cooldown: 0, arriveDist: 1.3, label: 'lesson' });
registerInteraction({ id: INTERACTIONS.familyPlaydate, mode: 'pair', roles: ['host', 'guest'], duration: 10, cooldown: 18, arriveDist: 1.4, label: 'playdate' });

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function state(actor) {
  return actor && actor.ai ? actor.ai.state : null;
}

export function actorAvailable(actor) {
  if (!actor || !actor.active || !actor.ai) return false;
  if (actor.grabs > 0 || actor.inPond || actor.sleeping || actor.inside || actor.freeBody) return false;
  return true;
}

// Shared availability rule for pair interactions. Extra state allow-lists keep
// the existing social/visit behavior intact while family tasks can accept a
// wider idle set.
export function pairAvailable(a, other, { states = ['wander'], health = 15, allowPartner = false } = {}) {
  if (!a || !other || a === other) return false;
  if (!actorAvailable(other)) return false;
  if (finite(other.health, 100) < health) return false;
  if (!allowPartner && other.ai.partner && other.ai.partner !== a) return false;
  if (Array.isArray(states) && !states.includes(state(other))) return false;
  return true;
}

// Assign one actor's live partner link. Pair entry that needs reciprocity calls
// this once per side in its existing write order; it deliberately does not touch
// state, timers, tasks, plans or the other actor.
export function linkPartner(actor, partner) {
  if (!actor || !actor.ai || !partner || !partner.ai || actor === partner) return false;
  actor.ai.partner = partner;
  return true;
}

export function beginPair(a, b, nextState, { stop, face, durationField, duration } = {}) {
  if (!a || !a.ai || !b || !b.ai || a === b) return false;
  a.ai.state = nextState;
  b.ai.state = nextState;
  a.ai.partner = b;
  b.ai.partner = a;
  if (a.ai.familyTask) a.ai.familyTask = null;
  if (b.ai.familyTask) b.ai.familyTask = null;
  if (durationField && Number.isFinite(duration)) {
    a.ai[durationField] = duration;
    b.ai[durationField] = duration;
  }
  if (stop) { stop(a); stop(b); }
  if (face) {
    face(a, b.cx, b.cz);
    face(b, a.cx, a.cz);
  }
  return true;
}

// Finish a pair once. The caller applies the gameplay effects; this only clears
// the shared social fields so both representations end in the same state.
export function endPair(a, { stop, next = 'wander', idleT = .55, taskCooldown = 1, socialCooldown = null } = {}) {
  if (!a || !a.ai) return null;
  const b = a.ai.partner;
  const clear = (actor) => {
    if (!actor || !actor.ai) return;
    actor.ai.state = next;
    actor.ai.partner = null;
    actor.ai.idleT = idleT;
    actor.ai.taskCooldown = taskCooldown;
    if (socialCooldown !== null) actor.ai.socialCooldown = socialCooldown;
    actor.ai.familyPlay = false;
    actor.ai.playmateKind = null;
    actor.ai.visitHome = null;
    actor.ai.visitRole = null;
    actor.ai.visitPhase = null;
    actor.ai.visitArrived = false;
    if (actor.ai.familyTask) actor.ai.familyTask = null;
    if (stop) stop(actor);
  };
  clear(a);
  if (b && b.ai && b.ai.partner === a) clear(b);
  return b;
}

// Cancel whatever shared interaction an actor is in. Adapters call this on
// grab, throw, pond entry, map switch and AI disable.
export function breakPair(a, { stop, next = 'wander', idleT = .5, taskCooldown = .8, states = null } = {}) {
  if (!a || !a.ai) return;
  const partner = a.ai.partner;
  if (partner && partner.ai && partner.ai.partner === a) {
    const clear = (actor) => {
      actor.ai.partner = null;
      if (Array.isArray(states) && !states.includes(actor.ai.state)) return;
      actor.ai.state = next;
      actor.ai.idleT = idleT;
      actor.ai.taskCooldown = taskCooldown;
      actor.ai.visitHome = null;
      actor.ai.visitRole = null;
      actor.ai.visitPhase = null;
      actor.ai.visitArrived = false;
      actor.ai.familyPlay = false;
      actor.ai.playmateKind = null;
      actor.ai.familyTask = null;
      if (stop) stop(actor);
    };
    clear(partner);
  }
  a.ai.partner = null;
  a.ai.familyPlay = false;
  a.ai.playmateKind = null;
  a.ai.visitHome = null;
  a.ai.visitRole = null;
  a.ai.visitPhase = null;
  a.ai.visitArrived = false;
  a.ai.familyTask = null;
  if (stop) stop(a);
}

/* ------------------------------------------------------------------- tasks */

export function startTask(actor, id, {
  role = 'host', partner = null, anchor = null, data = null, phase = 'travel',
} = {}) {
  if (!actor || !actor.ai) return false;
  const def = interactionFor(id);
  if (!def) return false;
  actor.ai.state = 'familyTask';
  actor.ai.partner = partner || null;
  actor.ai.familyTask = {
    id,
    mode: def.mode,
    role,
    partnerUid: partner ? partner.uid : 0,
    anchor: anchor ? { x: anchor.x, z: anchor.z, home: anchor.home || null } : null,
    phase,
    t: def.duration,
    data,
  };
  actor.ai.moving = false;
  actor.ai.path = null;
  actor.ai.target = actor.ai.familyTask.anchor
    ? { x: actor.ai.familyTask.anchor.x, z: actor.ai.familyTask.anchor.z }
    : null;
  if (actor.ai.familyTask.anchor &&
      Math.hypot(actor.ai.familyTask.anchor.x - actor.cx, actor.ai.familyTask.anchor.z - actor.cz) <= def.arriveDist) {
    actor.ai.familyTask.phase = 'act';
  }
  return true;
}

export function cancelTask(actor, { stop } = {}) {
  if (!actor || !actor.ai) return;
  actor.ai.familyTask = null;
  actor.ai.partner = null;
  actor.ai.state = 'wander';
  actor.ai.idleT = .5;
  if (stop) stop(actor);
}

// Advance the small travel/act timer. Movement and arrival checks stay with the
// adapter; this returns the next phase and never mutates position.
export function tickTask(actor, dt, { arriveDist = 1.4 } = {}) {
  const ai = actor && actor.ai;
  const task = ai && ai.familyTask;
  if (!task) return { ok: false, phase: null, done: true };
  if (task.mode === 'pair') {
    const partner = ai.partner;
    if (!partner || !partner.active || partner.ai?.familyTask?.id !== task.id) {
      return { ok: false, phase: 'cancel', done: true };
    }
  }
  if (task.phase === 'travel') {
    if (!task.anchor) {
      task.phase = 'act';
      return { ok: true, phase: 'act', done: false };
    }
    if (Math.hypot(task.anchor.x - actor.cx, task.anchor.z - actor.cz) <= arriveDist) {
      task.phase = 'act';
      ai.moving = false;
      ai.path = null;
      return { ok: true, phase: 'act', done: false };
    }
    return { ok: true, phase: 'travel', done: false };
  }
  task.t = Math.max(0, finite(task.t, 0) - dt);
  if (task.t <= 0) return { ok: true, phase: 'done', done: true };
  return { ok: true, phase: task.phase, done: false };
}
