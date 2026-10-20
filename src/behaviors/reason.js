// Deterministic, human-readable explanation of an actor's current plan.
//
// This is a debug/UI readout only. It reads existing actor/ai fields and never
// draws from the behavior RNG or mutates state, so enabling thought bubbles
// cannot change simulation parity.

function nameOf(actor) {
  return actor && (actor.name || (actor.uid !== undefined ? `#${actor.uid}` : 'someone')) || 'someone';
}

export function planReason(actor) {
  const ai = actor && actor.ai;
  if (!ai) return 'resting';
  if (ai.directive) return `following a ${ai.directive.kind} request`;
  if (ai.familyTask) {
    const task = ai.familyTask;
    if (task.id === 'familyMeal') return task.phase === 'travel' ? 'heading to a family meal' : 'sharing a family meal';
    if (task.id === 'familyLesson') return task.phase === 'travel' ? 'heading to a lesson' : 'in a lesson';
    if (task.id === 'familyPlaydate') return task.phase === 'travel' ? 'heading to a playdate' : 'playing with family';
    return task.phase === 'travel' ? `heading to ${task.id}` : `busy with ${task.id}`;
  }
  const partner = ai.partner ? nameOf(ai.partner) : null;
  const follow = ai.follow ? nameOf(ai.follow) : null;
  const source = ai.source ? (ai.source.label || ai.source.kind || 'food') : null;
  switch (ai.state) {
    case 'sleep': return 'sleeping';
    case 'seekHome': return 'heading home';
    case 'seekFood': return source ? `going to ${source}` : 'looking for food';
    case 'eat': return 'eating';
    case 'seekWater': return 'looking for water';
    case 'drink': return 'drinking';
    case 'seekCompany': return 'looking for company';
    case 'invite': return partner ? `inviting ${partner}` : 'inviting a friend';
    case 'social': return partner ? `socializing with ${partner}` : 'socializing';
    case 'decline': return 'declining an invitation';
    case 'visit': return ai.visitHome ? `visiting ${ai.visitHome}` : 'visiting a home';
    case 'seekMate': return 'looking for a mate';
    case 'mate': return partner ? `courting ${partner}` : 'courting';
    case 'seekConflict': return 'looking for contested food';
    case 'conflict': return 'contesting food';
    case 'seekHive': return 'looking for a hive';
    case 'raidHive': return 'raiding a hive';
    case 'flee': return 'fleeing a threat';
    case 'follow': return follow ? `following ${follow}` : 'following a parent';
    case 'stargaze': return 'stargazing';
    case 'wander': {
      if (actor.hunger >= .70) return 'getting hungry';
      if (actor.thirst >= .76) return 'getting thirsty';
      if (actor.social >= .60 || actor.affection >= .64) return 'looking for company';
      return 'wandering';
    }
    default: return ai.state || 'resting';
  }
}
