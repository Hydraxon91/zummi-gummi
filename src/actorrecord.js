// Shared saved-actor shape.
//
// Bears/Gummies and Glass still have different spawn and visual paths, but the
// life record is the same. One serializer keeps save fields from drifting apart
// when a new species or family feature is added.

import {
  normalizeSkills, normalizeHistory, normalizePlaydates, historyHasBondDelta,
} from './family.js';
import { normalizeTraits } from './behaviors/traits.js';
import { normalizeMourning } from './behaviors/mourning.js';

function round(value, digits = 4) {
  const n = Number(value);
  return Number.isFinite(n) ? +n.toFixed(digits) : 0;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function snapshotActor(actor, extra = {}) {
  if (!actor) return null;
  const mourning = normalizeMourning(actor.mourning);
  const history = normalizeHistory(actor.history);
  const guardianUid = actor.stage === 'baby' && Number.isFinite(actor.guardianUid) &&
    actor.guardianUid > 0 ? actor.guardianUid : null;
  const giftDay = Number.isFinite(actor.lastGiftDay) && actor.lastGiftDay >= 0
    ? Math.floor(actor.lastGiftDay) : null;
  const record = {
    // Trait-free records remain v2; traits v3; grief v4; a guardian v5; bond
    // deltas v6; a persisted gift day v7.
    actorVersion: giftDay !== null ? 7
      : (historyHasBondDelta(history) ? 6
        : (guardianUid ? 5 : (mourning.length ? 4 : (actor.traits ? 3 : 2)))),
    species: actor.species,
    uid: actor.uid,
    name: actor.name,
    sex: actor.sex,
    stage: actor.stage,
    age: round(actor.age, 2),
    scale: round(actor.scale, 4),
    health: round(actor.health, 2),
    hunger: round(actor.hunger, 4),
    thirst: round(actor.thirst, 4),
    energy: round(actor.energy, 4),
    social: round(actor.social, 4),
    affection: round(actor.affection, 4),
    bold: round(actor.bold, 4),
    bonds: { ...(actor.bonds || {}) },
    skills: normalizeSkills(actor.skills),
    history,
    playdates: normalizePlaydates(actor.playdates),
    home: actor.home || '',
    pregnant: !!actor.pregnant,
    gestation: round(actor.gestation, 2),
    mateCooldown: round(actor.mateCooldown, 2),
    fatherUid: actor.fatherUid || 0,
    parentUids: (actor.parentUids || []).slice(),
    genome: actor.genome,
    x: round(actor.cx, 3),
    z: round(actor.cz, 3),
    ...extra,
  };
  if (actor.traits) record.traits = normalizeTraits(actor.traits);
  if (mourning.length) record.mourning = mourning;
  if (guardianUid) record.guardianUid = guardianUid;
  if (giftDay !== null) record.lastGiftDay = giftDay;
  if (actor.kind === 'glass') {
    record.kind = 'glass';
    record.species = 'glass';
  }
  return record;
}

// Apply the representation-independent part of a saved record after a spawn.
// Locomotion, rigid-body handles and animation state are intentionally excluded.
export function applyCommonActorState(actor, record) {
  if (!actor || !record) return actor;
  actor.health = finite(record.health, actor.health);
  actor.hunger = finite(record.hunger, actor.hunger);
  actor.thirst = finite(record.thirst, actor.thirst);
  actor.energy = finite(record.energy, actor.energy);
  actor.bold = finite(record.bold, actor.bold);
  actor.social = finite(record.social, actor.social);
  actor.affection = finite(record.affection, actor.affection);
  actor.bonds = record.bonds && typeof record.bonds === 'object' ? { ...record.bonds } : {};
  actor.skills = normalizeSkills(record.skills);
  actor.history = normalizeHistory(record.history);
  actor.playdates = normalizePlaydates(record.playdates);
  actor.fatherUid = Number.isFinite(record.fatherUid) ? record.fatherUid : 0;
  if (record.traits) actor.traits = normalizeTraits(record.traits);
  if (record.mourning !== undefined) actor.mourning = normalizeMourning(record.mourning);
  else delete actor.mourning;
  if (actor.stage === 'baby' && Number.isFinite(record.guardianUid) && record.guardianUid > 0) {
    actor.guardianUid = record.guardianUid;
  } else {
    delete actor.guardianUid;
  }
  if (Number.isFinite(record.lastGiftDay) && record.lastGiftDay >= 0) {
    actor.lastGiftDay = Math.floor(record.lastGiftDay);
  } else {
    delete actor.lastGiftDay;
  }
  return actor;
}
