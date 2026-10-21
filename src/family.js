// Family rules shared by every Meadow actor.
//
// This module is deliberately pure: no renderer, physics, DOM or navigation.
// The behavior engine (behavior.js) and the app-owned roster/lineage UI both
// read these helpers, so Bear/Gummy/Glass use one definition of a parent,
// sibling, household, skill and history event.

export const HISTORY_LIMIT = 16;
export const SKILL_KEYS = ['forage', 'courage', 'social'];
export const SKILL_MAX = 1;
export const LESSON_GAIN = .12;
export const PLAYDATE_WINDOW = { start: 14.5, end: 17 };

// The routine table is data only. Phase D turns these windows into behavior;
// keeping it here means a new routine is an entry, not a new state machine.
export const FAMILY_ROUTINES = Object.freeze({
  breakfast: Object.freeze({ kind: 'meal', start: 7.5, end: 9.0 }),
  lunch: Object.freeze({ kind: 'meal', start: 12.0, end: 13.5 }),
  supper: Object.freeze({ kind: 'meal', start: 17.5, end: 19.0 }),
  play: Object.freeze({ kind: 'play', start: PLAYDATE_WINDOW.start, end: PLAYDATE_WINDOW.end }),
});

export const HISTORY_KINDS = Object.freeze([
  'born', 'mated', 'child', 'meal', 'lesson', 'taught', 'playdate', 'visit',
  'hosted', 'social', 'decline', 'declined', 'conflict', 'gift', 'receivedGift',
  'chat', 'cuddle', 'reconcile', 'groupPlay', 'groupGather', 'partnered',
  'separated', 'stage', 'home', 'moved', 'bond',
]);

// These records are UI-facing bookkeeping. When the bounded buffer is full,
// prefer evicting one of them over a lesson record, which gates same-day
// teaching behavior.
export const INTERACTION_HISTORY_KINDS = Object.freeze(new Set([
  'social', 'hosted', 'visit', 'decline', 'declined', 'conflict', 'gift', 'receivedGift',
  'chat', 'cuddle', 'reconcile', 'groupPlay', 'groupGather',
]));

function bondDeltaFields(event) {
  const before = Number(event && event.bondBefore);
  const after = Number(event && event.bondAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return { bondBefore: clamp(before, 0, 1), bondAfter: clamp(after, 0, 1) };
}

export function historyHasBondDelta(list) {
  return (Array.isArray(list) ? list : []).some(event =>
    event && Number.isFinite(Number(event.bondBefore)) &&
    Number.isFinite(Number(event.bondAfter)));
}

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return n < lo ? lo : (n > hi ? hi : n);
}

function uidKey(other) {
  return String(other && (other.uid !== undefined ? other.uid : other.slot));
}

function activeActor(actor) {
  return !!(actor && actor.active !== false);
}

export function familyRelation(a, other) {
  if (!a || !other || other === a) return null;
  const parents = a.parentUids || [];
  const otherParents = other.parentUids || [];
  if (parents.length && otherParents.some(uid => parents.includes(uid))) return 'sibling';
  if (parents.includes(other.uid)) return 'parent';
  if (otherParents.includes(a.uid)) return 'child';
  return null;
}

// A small index makes the lineage helpers O(n) instead of repeatedly scanning
// the roster. Callers pass the current active actor list.
export function familyIndex(actors) {
  const list = Array.isArray(actors) ? actors.filter(activeActor) : [];
  const byUid = new Map(list.map(actor => [actor.uid, actor]));
  return { list, byUid };
}

export function generationOf(actor, byUid, seen = new Set()) {
  if (!actor || seen.has(actor.uid)) return 1;
  seen.add(actor.uid);
  const parents = (actor.parentUids || [])
    .map(uid => (byUid instanceof Map ? byUid.get(uid) : byUid?.[uid]))
    .filter(Boolean);
  if (!parents.length) return 1;
  return 1 + Math.max(...parents.map(parent => generationOf(parent, byUid, new Set(seen))));
}

export function ancestorsOf(actor, byUid, depth = 8) {
  const out = [];
  const seen = new Set();
  const visit = (current, level) => {
    if (!current || level > depth || seen.has(current.uid)) return;
    seen.add(current.uid);
    for (const uid of current.parentUids || []) {
      const parent = byUid instanceof Map ? byUid.get(uid) : byUid?.[uid];
      if (!parent) continue;
      out.push(parent);
      visit(parent, level + 1);
    }
  };
  visit(actor, 0);
  return out;
}

export function descendantsOf(actor, actors, depth = 8) {
  const list = Array.isArray(actors) ? actors : [];
  const out = [];
  const seen = new Set([actor.uid]);
  let frontier = [actor];
  for (let level = 0; level < depth && frontier.length; level++) {
    const next = [];
    for (const current of frontier) {
      for (const other of list) {
        if (!other || seen.has(other.uid)) continue;
        if ((other.parentUids || []).includes(current.uid)) {
          seen.add(other.uid);
          out.push(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return out;
}

export function familyFor(actor, actors) {
  const empty = {
    parents: [], siblings: [], children: [], grandparents: [], grandchildren: [],
    generation: 1,
  };
  if (!actor) return empty;
  const { list, byUid } = familyIndex(actors);
  const parents = (actor.parentUids || []).map(uid => byUid.get(uid)).filter(Boolean);
  const parentUids = new Set(parents.map(parent => parent.uid));
  const siblings = list.filter(other => other !== actor &&
    (other.parentUids || []).some(uid => parentUids.has(uid)));
  const children = list.filter(other => other !== actor &&
    (other.parentUids || []).includes(actor.uid));
  const ancestors = ancestorsOf(actor, byUid);
  const grandparents = ancestors.filter(other => {
    if (parents.includes(other)) return false;
    return parents.some(parent => (parent.parentUids || []).includes(other.uid));
  });
  const descendants = descendantsOf(actor, list);
  const grandchildren = descendants.filter(other => !children.includes(other));
  return {
    parents, siblings, children, grandparents, grandchildren,
    generation: generationOf(actor, byUid),
  };
}

export function householdMembers(actor, actors) {
  if (!actor || !actor.home) return [];
  return (Array.isArray(actors) ? actors : [])
    .filter(other => activeActor(other) && other.home === actor.home);
}

// Bonds are symmetric and keyed by persistent uid. A dead/removed actor's key
// is harmless until the save boundary prunes it.
export function bondKey(other) {
  return uidKey(other);
}

export function bondOf(actor, other) {
  if (!actor || !other || !actor.bonds) return 0;
  const value = Number(actor.bonds[bondKey(other)]);
  return Number.isFinite(value) ? clamp(value, 0, 1) : 0;
}

export function pairBond(a, b) {
  return (bondOf(a, b) + bondOf(b, a)) * .5;
}

export function setBond(a, b, value) {
  if (!a || !b || a === b) return 0;
  const next = clamp(finite(Number(value), 0), 0, 1);
  if (!a.bonds || typeof a.bonds !== 'object') a.bonds = {};
  if (!b.bonds || typeof b.bonds !== 'object') b.bonds = {};
  a.bonds[bondKey(b)] = next;
  b.bonds[bondKey(a)] = next;
  return next;
}

export function addBond(a, b, amount) {
  if (!a || !b || a === b) return 0;
  const next = clamp(pairBond(a, b) + finite(Number(amount), 0), 0, 1);
  return setBond(a, b, next);
}

/* ------------------------------------------------------------------ skills */

export function normalizeSkills(input) {
  const out = {};
  for (const key of SKILL_KEYS) {
    const value = input && Number(input[key]);
    out[key] = clamp(Number.isFinite(value) ? value : 0, 0, SKILL_MAX);
  }
  return out;
}

export function skillsFor(actor) {
  if (!actor) return normalizeSkills(null);
  if (!actor.skills || typeof actor.skills !== 'object') actor.skills = normalizeSkills(null);
  else actor.skills = normalizeSkills(actor.skills);
  return actor.skills;
}

export function skillValue(actor, key) {
  const skills = skillsFor(actor);
  return Number.isFinite(Number(skills[key])) ? clamp(Number(skills[key]), 0, SKILL_MAX) : 0;
}

export function strongestSkill(actor) {
  const skills = skillsFor(actor);
  let best = SKILL_KEYS[0];
  for (const key of SKILL_KEYS) if (skills[key] > skills[best]) best = key;
  return best;
}

// Parents teach their strongest skill. A lesson never reduces the child and is
// capped so a long-lived family cannot max every skill immediately.
export function teachSkill(child, parent, key = null) {
  if (!child || !parent) return { ok: false, key: null, value: 0 };
  const skill = key && SKILL_KEYS.includes(key) ? key : strongestSkill(parent);
  const skills = skillsFor(child);
  const before = skills[skill];
  const parentValue = skillValue(parent, skill);
  const gain = Math.min(LESSON_GAIN, Math.max(0, parentValue - before), SKILL_MAX - before);
  skills[skill] = clamp(before + gain, 0, SKILL_MAX);
  return { ok: gain > 0, key: skill, value: skills[skill], gain };
}

export function forageEatScale(actor) {
  return 1 - .25 * skillValue(actor, 'forage');
}

export function courageHiveBonus(actor) {
  return 10 * skillValue(actor, 'courage');
}

export function socialAcceptBonus(actor) {
  return .10 * skillValue(actor, 'social');
}

/* ----------------------------------------------------------------- history */

export function normalizeHistory(list, limit = HISTORY_LIMIT) {
  if (!Array.isArray(list)) return [];
  const clean = [];
  for (const event of list) {
    if (!event || typeof event.kind !== 'string') continue;
    const entry = {
      kind: event.kind,
      uid: Number.isFinite(Number(event.uid)) ? Number(event.uid) : 0,
      day: Number.isFinite(Number(event.day)) ? Math.max(0, Math.floor(Number(event.day))) : 0,
      hour: Number.isFinite(Number(event.hour)) ? clamp(Number(event.hour), 0, 24) : 0,
    };
    const delta = bondDeltaFields(event);
    if (delta) Object.assign(entry, delta);
    clean.push(entry);
  }
  return clean.slice(-Math.max(1, limit | 0));
}

export function pushHistory(actor, event, limit = HISTORY_LIMIT) {
  if (!actor || !event || typeof event.kind !== 'string') return null;
  const list = normalizeHistory(actor.history, limit);
  const entry = {
    kind: event.kind,
    uid: Number.isFinite(Number(event.uid)) ? Number(event.uid) : 0,
    day: Number.isFinite(Number(event.day)) ? Math.max(0, Math.floor(Number(event.day))) : 0,
    hour: Number.isFinite(Number(event.hour)) ? clamp(Number(event.hour), 0, 24) : 0,
  };
  const delta = bondDeltaFields(event);
  if (delta) Object.assign(entry, delta);
  const max = Math.max(1, limit | 0);
  const interaction = INTERACTION_HISTORY_KINDS.has(entry.kind);
  if (interaction && list.length >= max) {
    // Display records never displace behavior history. If there is no older
    // interaction slot to recycle, skip this record.
    const recycle = list.findIndex(item => INTERACTION_HISTORY_KINDS.has(item.kind));
    if (recycle < 0) return entry;
    list.splice(recycle, 1);
  }
  list.push(entry);
  if (list.length > max) {
    const alternate = list.findIndex(item => INTERACTION_HISTORY_KINDS.has(item.kind));
    if (alternate >= 0) list.splice(alternate, 1);
    else list.shift();
  }
  actor.history = list;
  return entry;
}

export function historyFor(actor) {
  if (!actor) return [];
  actor.history = normalizeHistory(actor.history);
  return actor.history;
}

/* --------------------------------------------------------------- playdates */

export function normalizePlaydates(input) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [uid, record] of Object.entries(input)) {
    const numericUid = Number(uid);
    if (!Number.isFinite(numericUid) || numericUid <= 0) continue;
    if (!record || typeof record !== 'object') continue;
    const day = Number(record.day);
    const hour = Number(record.hour);
    if (!Number.isFinite(day) || !Number.isFinite(hour)) continue;
    out[String(numericUid)] = {
      day: Math.max(0, Math.floor(day)),
      hour: clamp(hour, 0, 24),
    };
  }
  return out;
}

export function playdatesFor(actor) {
  if (!actor) return {};
  actor.playdates = normalizePlaydates(actor.playdates);
  return actor.playdates;
}

export function schedulePlaydate(a, b, { day = 0, hour = PLAYDATE_WINDOW.start } = {}) {
  if (!a || !b || a === b) return null;
  const record = { day: Math.max(0, Math.floor(day)), hour: clamp(hour, 0, 24) };
  const aDates = playdatesFor(a);
  const bDates = playdatesFor(b);
  aDates[bondKey(b)] = { ...record };
  bDates[bondKey(a)] = { ...record };
  return record;
}

export function clearPlaydate(a, b) {
  if (!a || !b) return;
  const aDates = playdatesFor(a);
  const bDates = playdatesFor(b);
  delete aDates[bondKey(b)];
  delete bDates[bondKey(a)];
}

export function nextPlaydateDay(day) {
  return Math.max(0, Math.floor(finite(Number(day), 0))) + 1;
}

export function playdateDue(record, day, hour) {
  if (!record) return false;
  const currentDay = Math.max(0, Math.floor(finite(Number(day), 0)));
  const currentHour = finite(Number(hour), 0);
  if (record.day < currentDay) return true;
  if (record.day > currentDay) return false;
  return currentHour >= record.hour;
}

/* ---------------------------------------------------------------- routines */

// Homes start their routines at slightly different times so the whole village
// does not eat on the same tick.
export function homeRoutineOffset(name) {
  const text = String(name || '');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 7) * .12;
}

export function routineAt(kind, hours, offset = 0) {
  const routine = Object.values(FAMILY_ROUTINES).find(entry => entry.kind === kind &&
    hours >= entry.start + offset && hours < entry.end + offset);
  return routine || null;
}

export function routineWindowFor(actor, hours) {
  if (!actor) return null;
  const offset = homeRoutineOffset(actor.home);
  for (const name of Object.keys(FAMILY_ROUTINES)) {
    const routine = FAMILY_ROUTINES[name];
    if (hours >= routine.start + offset && hours < routine.end + offset) {
      return { name, ...routine };
    }
  }
  return null;
}

/* ---------------------------------------------------------- save-boundary */

// Drop references to actors that no longer exist. Ancestry (parentUids) is
// deliberately kept: a departed parent is still part of the family tree.
export function pruneActorRefs(actor, validUids) {
  if (!actor) return false;
  const valid = validUids instanceof Set ? validUids : new Set(validUids || []);
  let changed = false;
  if (actor.bonds && typeof actor.bonds === 'object') {
    for (const key of Object.keys(actor.bonds)) {
      if (!valid.has(Number(key))) { delete actor.bonds[key]; changed = true; }
    }
  }
  if (actor.playdates && typeof actor.playdates === 'object') {
    for (const key of Object.keys(actor.playdates)) {
      if (!valid.has(Number(key))) { delete actor.playdates[key]; changed = true; }
    }
  }
  if (Array.isArray(actor.history)) {
    const kept = actor.history.filter(event => !event.uid || valid.has(Number(event.uid)));
    if (kept.length !== actor.history.length) { actor.history = kept; changed = true; }
  }
  if (actor.guardianUid !== undefined && !valid.has(Number(actor.guardianUid))) {
    delete actor.guardianUid;
    changed = true;
  }
  if (actor.partnerUid !== undefined && !valid.has(Number(actor.partnerUid))) {
    delete actor.partnerUid;
    changed = true;
  }
  if (actor.rivals && typeof actor.rivals === 'object') {
    for (const key of Object.keys(actor.rivals)) {
      if (!valid.has(Number(key))) { delete actor.rivals[key]; changed = true; }
    }
  }
  return changed;
}
