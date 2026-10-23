// Portable birth planning.
//
// This module owns only the decision half of a soft-body/Glass birth: mother
// eligibility, safe-food gate, father resolution, child species, soft cap,
// flavor/pace inheritance, home/door/nearest-walkable placement, genome, sex and
// parent UIDs. The host keeps spawn/finalization, traits, bonds, history,
// mother-state mutation, stats and emotes in app.js.
//
// Host inputs are callbacks so this module has no app, THREE or DOM dependency:
//   speciesOf(actor), fatherByUid(uid), safeFood(), softCount(), softCapacity(),
//   chooseHome(mother), homeDoor(homeName), nearestWalkable(x, z),
//   childGenome(mother, father, childSpecies), random()
// `random` defaults to the current global Math.random at call time, preserving
// the app's __gummy.seed() behavior.

import { MATE_FOOD_MIN, blendPace, inheritedFlavor } from './life.js';
import { FLAVORS } from './config.js';

export function birthSpecies(mother, father, {
  speciesOf = () => null,
  random = Math.random,
} = {}) {
  const defs = [mother, father]
    .filter(Boolean)
    .map(speciesOf)
    .filter(def => def && def.canReproduce);
  if (!defs.length) return speciesOf(mother);
  const unique = [...new Map(defs.map(def => [def.id, def])).values()];
  if (unique.length === 1) return unique[0];
  // Cross-species offspring use one of the parents' existing forms. Glass has
  // no metaball rig, but its meadow adapter can create a child directly.
  return unique[(random() * unique.length) | 0];
}

function blocked(reason) {
  return { ok: false, reason };
}

export function planBirth(mother, father = null, {
  speciesOf = () => null,
  fatherByUid = () => null,
  safeFood = () => 0,
  softCount = () => 0,
  softCapacity = () => 0,
  chooseHome = () => null,
  homeDoor = () => null,
  nearestWalkable = () => null,
  childGenome = () => null,
  random = Math.random,
} = {}) {
  if (!mother || !mother.active || !mother.pregnant) return blocked('inactive-mother');
  if (mother.grabs > 0 || mother.inPond || mother.airborne || mother.freeBody) {
    return blocked('busy-mother');
  }
  if (safeFood() < MATE_FOOD_MIN) return blocked('insufficient-safe-food');
  father = father || fatherByUid(mother.fatherUid) || null;
  const childSpecies = birthSpecies(mother, father, { speciesOf, random }) || speciesOf(mother);
  if (!childSpecies) return blocked('missing-child-species');
  const isGlass = childSpecies.id === 'glass';
  if (!isGlass && softCount() >= softCapacity()) return blocked('soft-capacity');

  const flavor = inheritedFlavor(
    Number.isFinite(mother.flavor) ? mother.flavor : 3,
    FLAVORS.length,
    random,
  );
  const pace = blendPace(mother, father || mother, random);
  const home = chooseHome(mother);
  let x = mother.cx;
  let z = mother.cz;
  if ((mother.sleeping || mother.inside) && home) {
    const door = homeDoor(home);
    if (door) { x = door.x; z = door.z; }
  }
  const p = nearestWalkable(x, z);
  if (p) { x = p.x; z = p.z; }
  // Genetic inheritance owns its own draws inside the host and must stay after
  // placement; sex is the final draw of the plan.
  const genome = childGenome(mother, father, childSpecies);
  const sex = random() < 0.5 ? 'F' : 'M';
  const parentUids = [mother.uid, father ? father.uid : 0].filter(Boolean);

  return {
    ok: true,
    father,
    childSpecies,
    isGlass,
    flavor,
    pace,
    home,
    x,
    z,
    genome,
    sex,
    parentUids,
  };
}
