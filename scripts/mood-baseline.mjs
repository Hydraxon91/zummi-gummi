// Natural-needs mood distribution: 20 days x 3 seeds per race.
import { runMoodBaseline } from './behavior-parity.mjs';

const RACES = ['bear', 'gummy', 'glass'];
const SEEDS = [1, 2, 3];
const DAYS = 20;
const BUCKETS = Array.from({ length: 20 }, (_, i) => +(i / 10 - .9).toFixed(1));

const values = [];
const actorMeans = [];
for (const race of RACES) {
  for (const seed of SEEDS) {
    const result = runMoodBaseline({ race, seed, days: DAYS });
    for (const actor of result.actors) {
      if (!actor.values.length) continue;
      const mean = actor.values.reduce((sum, value) => sum + value, 0) / actor.values.length;
      actorMeans.push({ race, seed, uid: actor.uid, mean });
      for (const value of actor.values) values.push({ race, value });
    }
  }
}

const mean = list => list.length
  ? +(list.reduce((sum, value) => sum + value, 0) / list.length).toFixed(3) : null;
const percentile = (list, p) => {
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a - b);
  return +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(3);
};

console.log(`MOOD HISTOGRAM (${DAYS} days x ${SEEDS.length} seeds, natural needs, 1 s samples)`);
for (const race of RACES) {
  const raceValues = values.filter(row => row.race === race).map(row => row.value);
  const means = actorMeans.filter(row => row.race === race).map(row => row.mean);
  console.log(`\n${race} actor-samples=${raceValues.length} actor-means=${means.length}`);
  console.log(`  mean=${mean(raceValues)} p10=${percentile(raceValues, .10)} ` +
    `p50=${percentile(raceValues, .50)} p90=${percentile(raceValues, .90)} ` +
    `min=${percentile(raceValues, 0)} max=${percentile(raceValues, 1)}`);
  const counts = new Map(BUCKETS.map(bucket => [bucket, 0]));
  for (const value of raceValues) {
    const bucket = Math.round(value * 10) / 10;
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  for (const bucket of BUCKETS) {
    const count = counts.get(bucket) || 0;
    const pct = raceValues.length ? (count / raceValues.length * 100).toFixed(1) : '0.0';
    console.log(`  ${bucket >= 0 ? '+' : ''}${bucket.toFixed(1)} ${String(count).padStart(7)} ${pct.padStart(5)}% ` +
      `${'#'.repeat(Math.round(count / Math.max(1, raceValues.length) * 50))}`);
  }
}
