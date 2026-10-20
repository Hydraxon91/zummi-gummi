// Deterministic departure-tuple check for the runtime-only capture hook.
// This does not simulate mourning or stars; it verifies that repeated seeded
// departure sequences produce identical tuples and that the hook is inert off.

import { createDepartureHook, departureTuple } from '../src/departures.js';
import { createWorld, createRoster } from './behavior-parity.mjs';

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(seed, enabled) {
  const world = createWorld();
  const actors = createRoster('bear');
  const rng = seeded(seed);
  for (const actor of actors) {
    actor.bonds = {};
    for (const other of actors) {
      if (other.uid !== actor.uid) actor.bonds[String(other.uid)] = +(rng() * .9).toFixed(3);
    }
  }
  const active = actors.slice();
  const hook = createDepartureHook({
    isEnabled: () => enabled,
    getActors: () => active,
    getMapId: () => (world.kind === 'life' ? 'field' : 'studio'),
    getTime: () => ({ day: 1, hours: 12 }),
  });
  const tuples = [];
  for (let step = 0; step < 3; step++) {
    const index = Math.floor(rng() * active.length);
    const actor = active[index];
    const cause = step === 0 ? 'removed' : 'stars';
    const reason = cause === 'stars' ? (step === 1 ? 'starvation' : 'oldAge') : null;
    const rows = hook.snapshot(actor, cause, { reason, at: step });
    tuples.push(...rows.map(row => departureTuple(row)));
    active.splice(index, 1);
  }
  return { tuples, count: hook.count };
}

const seeds = [1, 2, 3];
const runs = [];
for (const seed of seeds) {
  const first = run(seed, true);
  const second = run(seed, true);
  const off = run(seed, false);
  const deterministic = JSON.stringify(first.tuples) === JSON.stringify(second.tuples);
  runs.push({ seed, tuples: first.tuples.length, deterministic, offCount: off.count });
  if (!deterministic || off.count !== 0) process.exitCode = 1;
}
console.log(JSON.stringify({ runs }, null, 2));
console.log(runs.every(row => row.deterministic && row.offCount === 0)
  ? 'DEPARTURE PARITY PASS' : 'DEPARTURE PARITY FAIL');
