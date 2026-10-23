// Pure home resident counting and birth-home choice.
//
// This module owns only the simulation rule. Authored homes, villa meshes,
// occupancy presentation, doors and live actor storage remain with the field,
// homes, app and actor-view owners that already supply them.
//
// Callers pass the soft-body and Glass actors as one list, the authored home
// descriptors in authored order, and the current capacity. Nothing here
// mutates actors or homes, reads time or RNG, or touches a renderer or DOM.

export function countHomeResidents(actors, name) {
  if (!name) return 0;
  let n = 0;
  for (const actor of actors || []) {
    if (actor && actor.active && typeof actor.home === 'string' && actor.home === name) n++;
  }
  return n;
}

export function chooseBirthHome({ mother = null, homes = null, residents = [], capacity } = {}) {
  const motherHome = mother && mother.home ? mother.home : '';
  if (mother && mother.home && countHomeResidents(residents, mother.home) < capacity) {
    return motherHome;
  }
  if (!homes) return mother ? motherHome : '';
  let best = null;
  let bestCount = Infinity;
  for (const home of homes) {
    const n = countHomeResidents(residents, home.name);
    if (n < bestCount) { best = home; bestCount = n; }
  }
  return best ? best.name : (mother ? motherHome : '');
}
