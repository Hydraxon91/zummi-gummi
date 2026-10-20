// Mood-extreme scenario: unhappy vs content, natural-world host, modules only.
import { runMoodScenario } from './behavior-parity.mjs';

const RACES = ['bear', 'gummy', 'glass'];
const SEEDS = [1, 2, 3];
const MODES = ['unhappy', 'content'];
const DAYS = 2;

const rows = [];
for (const race of RACES) {
  for (const mode of MODES) {
    const runs = SEEDS.map(seed => runMoodScenario({ race, mode, days: DAYS, seed }));
    const sum = key => runs.reduce((total, run) => total + run[key], 0);
    rows.push({
      race, mode,
      distance: +(sum('distance') / runs.length).toFixed(2),
      social: sum('social'),
      seekFood: sum('seekFood'),
      stargaze: sum('stargaze'),
      mood: +(sum('mood') / runs.length).toFixed(3),
    });
  }
}

const by = (race, mode) => rows.find(row => row.race === race && row.mode === mode);
const checks = [];
for (const race of RACES) {
  const unhappy = by(race, 'unhappy');
  const content = by(race, 'content');
  checks.push({ race, check: 'content mood exceeds unhappy', value: `${content.mood} vs ${unhappy.mood}`, pass: content.mood > unhappy.mood });
  checks.push({ race, check: 'content travels farther', value: `${content.distance} vs ${unhappy.distance}`, pass: content.distance > unhappy.distance });
  checks.push({ race, check: 'content socializes more', value: `${content.social} vs ${unhappy.social}`, pass: content.social > unhappy.social });
  checks.push({ race, check: 'unhappy seeks food more', value: `${unhappy.seekFood} vs ${content.seekFood}`, pass: unhappy.seekFood > content.seekFood });
}

console.log('MOOD EXTREMES (modules, 3 seeds x 2 days)');
for (const row of rows) {
  console.log(`${row.race.padEnd(6)} ${row.mode.padEnd(7)} mood=${row.mood} distance=${row.distance} ` +
    `social=${row.social} seekFood=${row.seekFood} stargaze=${row.stargaze}`);
}
console.log('\nDIRECTION CHECKS');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.race}: ${check.check} (${check.value})`);
}
if (checks.some(check => !check.pass)) process.exitCode = 1;
