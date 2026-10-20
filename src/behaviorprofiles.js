// Per-species behavior data.
//
// One behavior engine (behavior.js) reads these profiles. The logic is shared;
// the numbers and the allowed opportunities are not. Bear and Glass keep their
// current balance instead of being flattened into one generic animal.

const BEAR = {
  id: 'bear',
  species: ['bear'],
  kind: 'softbody',
  locomotion: 'hop',
  states: ['wander', 'seekFood', 'eat', 'seekWater', 'drink', 'seekHive', 'raidHive', 'flee',
    'seekHome', 'sleep', 'seekCompany', 'invite', 'social', 'decline', 'visit',
    'seekConflict', 'conflict', 'seekMate', 'mate', 'follow', 'familyTask'],
  wander: {
    min: 3.0, max: 12.0,
    longChance: .25, longMin: 24.0, longMax: 40.0,
    shortShift: 2.0, longShift: 4.0, longSnapFloor: .8,
  },
  think: { min: .18, max: .28, stuckTime: 1.9 },
  needs: {
    hungerRate: .0045, thirstRate: .0065,
    socialRate: .0018, affectionRate: .0012, energyRate: .0025,
    energyRest: .012,
    healthRegen: .6 / 60, healthRest: 4.0 / 60, healthStarve: .02,
    pregnancyHunger: 1.35,
  },
  thresholds: {
    seekHunger: .70, stopHunger: .40,
    seekThirst: .76, stopThirst: .30,
    criticalHunger: .90, criticalThirst: .92,
    seekSocial: .60, seekAffection: .64, stopSocial: .30,
    energyTired: .18, energyRested: .35,
    healthHurt: 35, healthWoozy: 15, healthRecovered: 70,
    woozySpeed: .65,
  },
  food: { eatTime: 1.25, drinkTime: 1.35, eatDist: .62, drinkDist: .62, searchRadius: 46 },
  rest: { mode: 'night', nightStart: 20, nightEnd: 6, homeDist: 1.15 },
  social: {
    radius: 22, dist: 1.45, inviteTime: .70, socialTime: 4.2, familySocialTime: 10,
    declineTime: .90, cooldown: 14,
    relief: .50, affectionRelief: .38,
    bondBase: .16, bondJitter: .08, familyBondBase: .22, familyBondExtra: .08,
    visitBond: .16, visitChance: .45, visitTime: 4.8, visitDist: 1.55,
  },
  conflict: {
    dist: 1.20, time: .85, cooldown: 12, radius: 8, healthFloor: 45,
    damage: 15, shove: 2.4,
  },
  mate: { radius: 22, dist: 1.25, followDist: 2.15, requiresRoom: true, chance: 1 },
  hive: {
    hunger: .95, health: 45, hardFloor: 25, damage: 15,
    stingChance: .5, dist: 1.25, raidTime: 1.25, fleeTime: 1.4,
  },
  directives: { ttl: 45, max: 3 },
};

// Gummy starts as an exact Bear clone so the two can diverge without changing
// today's behavior. Deep-copy the data; nested balance blocks must not be
// shared with BEAR.
function cloneProfile(profile, { id, species }) {
  const copy = JSON.parse(JSON.stringify(profile));
  copy.id = id;
  copy.species = [...species];
  return copy;
}

const GUMMY = cloneProfile(BEAR, { id: 'gummy', species: ['msn'] });

const GLASS = {
  id: 'glass',
  species: ['glass'],
  kind: 'skinned',
  locomotion: 'hover',
  directives: false,
  states: ['wander', 'seekFood', 'eat', 'seekWater', 'drink',
    'seekHome', 'sleep', 'seekCompany', 'invite', 'social', 'decline', 'visit',
    'seekMate', 'mate', 'follow', 'stargaze', 'familyTask'],
  wander: { min: 4.0, max: 12.0, longChance: 0, longMin: 0, longMax: 0, shortShift: 2.2, longShift: 2.2, longSnapFloor: 0 },
  think: { min: .20, max: .45, stuckTime: 1.9 },
  needs: {
    hungerRate: .0022, thirstRate: .0032,
    socialRate: .0012, affectionRate: .0009, energyRate: .0004,
    energyRest: .008,
    healthRegen: .01, healthRest: 0, healthStarve: 0,
    pregnancyHunger: 1.2,
  },
  thresholds: {
    seekHunger: .64, stopHunger: .35,
    seekThirst: .70, stopThirst: .30,
    criticalHunger: .92, criticalThirst: .94,
    seekSocial: .64, seekAffection: .68, stopSocial: .32,
    energyTired: .18, energyRested: .35,
    healthHurt: 35, healthWoozy: 15, healthRecovered: 70,
    woozySpeed: .65,
  },
  food: { eatTime: 1.0, drinkTime: 1.1, eatDist: .9, drinkDist: .9, searchRadius: 44 },
  rest: { mode: 'dayShelter', start: 9, end: 16, chance: .34, homeDist: 1.15, insideSeconds: 24 },
  social: {
    radius: 22, dist: 1.45, inviteTime: .70, socialTime: 3.4, familySocialTime: 10,
    declineTime: .90, cooldown: 15,
    relief: .42, affectionRelief: .30,
    bondBase: .14, bondJitter: .06, familyBondBase: .18, familyBondExtra: .08,
    visitBond: .16, visitChance: .35, visitTime: 4.8, visitDist: 1.55,
  },
  conflict: null,
  mate: { radius: 22, dist: 1.25, followDist: 2.15, requiresRoom: false, chance: .10 },
  hive: null,
  directives: null,
  stargaze: { chance: .10, min: 3, max: 8 },
};

const PROFILES = new Map();
for (const profile of [BEAR, GUMMY, GLASS]) {
  for (const species of profile.species) PROFILES.set(species, profile);
}

export function behaviorProfile(speciesId) {
  return PROFILES.get(speciesId) || BEAR;
}

export function profileFor(actor) {
  if (!actor) return BEAR;
  if (actor.kind === 'glass' || actor.species === 'glass') return GLASS;
  return behaviorProfile(actor.species || 'bear');
}

export { BEAR as BEAR_PROFILE, GUMMY as GUMMY_PROFILE, GLASS as GLASS_PROFILE };
