// Deterministic stars departure tuple check, all flags on vs all off.
import { createStars } from '../src/behaviors/stars.js';

function actor(uid, age = 700) {
  return {
    uid, active: true, species: 'bear', stage: 'adult', age,
    health: 100, hunger: .2, thirst: .2, bonds: {}, home: 'Home 1',
  };
}

function run(enabled, seed = 1) {
  const actors = Array.from({ length: 8 }, (_, i) => actor(i + 1, i === (seed - 1) % 8 ? 99999 : 700));
  const farewells = [];
  const features = {
    farewells: enabled, starsOldAge: enabled, starsStarvation: enabled, starsStings: enabled,
  };
  const stars = createStars({
    features,
    getActors: () => actors,
    getDay: () => 1,
    getCeiling: () => 40,
    daySeconds: 240,
    onFarewell: (who, info) => farewells.push([who.uid, info.cause, info.reason]),
  });
  for (let tick = 0; tick < 620; tick++) {
    for (const member of actors) stars.update(member, .05);
  }
  return farewells;
}

const runs = [1, 2, 3].map(seed => ({
  seed,
  first: run(true, seed),
  second: run(true, seed),
  off: run(false, seed),
}));
const pass = runs.every(row =>
  JSON.stringify(row.first) === JSON.stringify(row.second) && row.off.length === 0);
console.log(JSON.stringify({ runs }, null, 2));
console.log(pass ? 'STARS PARITY PASS' : 'STARS PARITY FAIL');
if (!pass) process.exitCode = 1;
