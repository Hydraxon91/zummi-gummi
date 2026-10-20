// Natural-needs personality baseline: 20 days x 3 seeds per race.
// Reports bottom/middle/top third for each trait axis.
import { runPersonalityBaseline } from './behavior-parity.mjs';

const RACES = ['bear', 'gummy', 'glass'];
const AXES = ['bold', 'greed', 'curiosity'];
const SEEDS = [1, 2, 3];
const DAYS = 20;

const rows = [];
for (const race of RACES) {
  for (const seed of SEEDS) {
    const result = runPersonalityBaseline({ race, seed, days: DAYS });
    for (const actor of result.actors) rows.push({ race, seed, ...actor });
  }
}
for (const row of rows) {
  row.onsetMean = row.seekFoodOnsets.length
    ? row.seekFoodOnsets.reduce((sum, value) => sum + value, 0) / row.seekFoodOnsets.length
    : null;
}

const avg = values => values.length
  ? +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)
  : null;
const sum = values => values.reduce((total, value) => total + value, 0);

for (const race of RACES) {
  console.log(`\n${race} (${DAYS} days x ${SEEDS.length} seeds, natural needs)`);
  const raceRows = rows.filter(row => row.race === race);
  for (const axis of AXES) {
    const sorted = raceRows.slice().sort((a, b) => a.traits[axis] - b.traits[axis]);
    const size = Math.floor(sorted.length / 3);
    const tiers = [sorted.slice(0, size), sorted.slice(size, size * 2), sorted.slice(size * 2)];
    console.log(`  ${axis}`);
    for (let i = 0; i < 3; i++) {
      const tier = tiers[i];
      const onsets = tier.flatMap(row => row.seekFoodOnsets);
      console.log(`    ${['bottom', 'middle', 'top'][i].padEnd(6)} n=${tier.length} ` +
        `trait=${avg(tier.map(row => row.traits[axis]))} ` +
        `social=${sum(tier.map(row => row.socialEntries))} ` +
        `seekFood=${onsets.length} onsetHunger=${avg(onsets) ?? 'n/a'} ` +
        `wander=${avg(tier.map(row => row.wanderDistance))}`);
    }
  }
}

const glass = rows.filter(row => row.race === 'glass');
const sorted = glass.slice().sort((a, b) => a.traits.curiosity - b.traits.curiosity);
const size = Math.floor(sorted.length / 3);
const bottom = avg(sorted.slice(0, size).map(row => row.wanderDistance));
const top = avg(sorted.slice(size * 2).map(row => row.wanderDistance));
const delta = bottom ? +(((top - bottom) / bottom) * 100).toFixed(2) : null;
console.log(`\nGlass curiosity top vs bottom wander: ${top} vs ${bottom} (${delta}%)`);
