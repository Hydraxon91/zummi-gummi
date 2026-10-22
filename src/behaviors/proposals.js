// Portable optional-activity proposals.
//
// Plain records in, a ranked decision out. This module never reads actors,
// clock, storage, renderer, physics or RNG; the host builds candidates and
// executes the winner through the existing opportunity pipeline. Evaluation is
// therefore side-effect free: no reservation, cooldown or RNG draw happens
// until a candidate is actually attempted.

export const ACTIVITY_PROPOSALS = Object.freeze([
  Object.freeze({ id: 'social.company', activity: 'social', order: 110 }),
  Object.freeze({ id: 'stargaze.seek', activity: 'stargaze', order: 120 }),
]);

const BY_ID = new Map(ACTIVITY_PROPOSALS.map(def => [def.id, def]));
const round4 = n => +n.toFixed(4);

export function activityProposalOrder(id) {
  return BY_ID.get(id)?.order ?? null;
}

export function scoreContributions(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('activity proposal contributions must be an object');
  }
  let score = 0;
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isFinite(value)) {
      throw new Error(`activity proposal contribution ${name} must be finite`);
    }
    score += value;
  }
  return round4(score);
}

export function defineProposalCandidate({ id, eligible = false, reason, contributions = {} } = {}) {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`unknown activity proposal ${id}`);
  if (typeof reason !== 'string' || !reason) {
    throw new Error(`activity proposal ${id} needs a reason`);
  }
  const clean = {};
  for (const [name, value] of Object.entries(contributions || {})) {
    if (!Number.isFinite(value)) {
      throw new Error(`activity proposal ${id} contribution ${name} must be finite`);
    }
    clean[name] = round4(value);
  }
  return Object.freeze({
    id,
    activity: def.activity,
    order: def.order,
    eligible: !!eligible,
    reason,
    contributions: Object.freeze(clean),
    score: scoreContributions(clean),
  });
}

// Higher score first; exact ties keep the existing pipeline order so the
// chooser never invents a preference the authored cascade did not have.
export function rankProposals(candidates = []) {
  if (!Array.isArray(candidates)) throw new Error('activity proposals must be a list');
  return candidates
    .filter(candidate => candidate && candidate.eligible)
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.order - b.order) ||
      String(a.id).localeCompare(String(b.id)))
    .map(candidate => candidate.id);
}

export function describeActivityDecision({
  day = 0, hours = 0, candidates = [], started = null, refused = [],
} = {}) {
  const ranked = rankProposals(candidates);
  const outcome = started ? 'started' : (ranked.length ? 'refused' : 'no-eligible');
  return Object.freeze({
    day: Number.isFinite(day) ? day : 0,
    hours: Number.isFinite(hours) ? hours : 0,
    candidates: Object.freeze(candidates.map(candidate => Object.freeze({
      id: candidate.id,
      activity: candidate.activity,
      order: candidate.order,
      eligible: !!candidate.eligible,
      reason: candidate.reason,
      score: candidate.score,
      contributions: Object.freeze({ ...candidate.contributions }),
    }))),
    ranked: Object.freeze(ranked),
    chosen: ranked[0] || null,
    started: started || null,
    refused: Object.freeze(refused.slice()),
    outcome,
  });
}
