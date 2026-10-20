// Trait-extreme behavior pack.
//
// Runs modules-only simulations with every actor on one trait extreme and
// reports measured counts. Start from the repo root:
//   node scripts/personality-scenario.mjs
import { runTraitScenario } from './behavior-parity.mjs';

const GROUPS = [
  ['all-bold', { bold: 1, greed: .5, curiosity: .5 }],
  ['all-shy', { bold: 0, greed: .5, curiosity: .5 }],
  ['greedy', { bold: .5, greed: 1, curiosity: .5 }],
  ['generous', { bold: .5, greed: 0, curiosity: .5 }],
  ['curious', { bold: .5, greed: .5, curiosity: 1 }],
  ['homebody', { bold: .5, greed: .5, curiosity: 0 }],
];
const RACES = ['bear', 'gummy', 'glass'];
const SEEDS = [1, 2, 3];
const DAYS = 2;

const sum = values => values.reduce((total, value) => total + (value || 0), 0);
const avg = values => +(sum(values) / Math.max(1, values.length)).toFixed(2);
const metric = (runs, fn) => sum(runs.map(fn));

function aggregate(race, name, traits) {
  const runs = SEEDS.map(seed => runTraitScenario({
    race, traits, days: DAYS, seed,
    allAdults: true, resetEvery: 100, resetHunger: .66, resetSocial: .62,
  }));
  const entries = id => metric(runs, run => run.coverage?.entries?.[id] || 0);
  const history = kind => metric(runs, run => run.summary?.history?.[kind] || 0);
  return {
    race, group: name,
    distance: avg(runs.map(run => run.distancePerActor)),
    births: metric(runs, run => run.life?.births || 0),
    meals: history('meal'),
    playdates: history('playdate'),
    lessons: history('lesson'),
    mated: history('mated'),
    eat: entries('eat'),
    seekFood: entries('seekFood'),
    seekCompany: entries('seekCompany'),
    invite: entries('invite'),
    social: entries('social'),
    stargaze: entries('stargaze'),
    raidHive: entries('raidHive'),
    conflict: entries('conflict'),
    wander: entries('wander'),
  };
}

const rows = [];
for (const race of RACES) {
  for (const [name, traits] of GROUPS) rows.push(aggregate(race, name, traits));
}

const by = (race, group) => rows.find(row => row.race === race && row.group === group);
const checks = [];
for (const race of RACES) {
  const bold = by(race, 'all-bold');
  const shy = by(race, 'all-shy');
  const boldValue = bold.seekCompany + bold.invite + bold.social;
  const shyValue = shy.seekCompany + shy.invite + shy.social;
  checks.push({
    race, check: 'bold seeks/socializes more than shy',
    value: `${boldValue} vs ${shyValue} seek/invite/social entries; ` +
      `${bold.distance} vs ${shy.distance} distance`,
    pass: boldValue > shyValue,
  });
  const greedy = by(race, 'greedy');
  const generous = by(race, 'generous');
  checks.push({
    race, check: 'greedy seeks/eats more than generous',
    value: `${greedy.seekFood + greedy.eat} vs ${generous.seekFood + generous.eat} seek/eat entries; ` +
      `${greedy.meals} vs ${generous.meals} meals`,
    pass: greedy.seekFood + greedy.eat > generous.seekFood + generous.eat ||
      greedy.meals > generous.meals,
  });
  checks.push({
    race, check: 'curious travels farther than homebody',
    value: `${by(race, 'curious').distance} vs ${by(race, 'homebody').distance}`,
    pass: by(race, 'curious').distance > by(race, 'homebody').distance,
  });
}

console.log('TRAIT EXTREMES (modules, 3 seeds x 2 days)');
for (const row of rows) {
  console.log(`${row.race.padEnd(6)} ${row.group.padEnd(9)} distance=${row.distance} ` +
    `eat=${row.eat} meals=${row.meals} invites=${row.invite} social=${row.social} ` +
    `stargaze=${row.stargaze} hive=${row.raidHive} births=${row.births}`);
}
console.log('\nDIRECTION CHECKS');
for (const check of checks) {
  console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.race}: ${check.check} (${check.value})`);
}
if (checks.some(check => !check.pass)) process.exitCode = 1;
