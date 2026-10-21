import test from 'node:test';
import assert from 'node:assert/strict';
import { runParity, validateParity } from '../scripts/behavior-parity.mjs';
import { findPortMarkers } from '../scripts/check-port-markers.mjs';
import { readFileSync } from 'node:fs';

test('legacy and modules engines match for every race', () => {
  for (const race of ['bear', 'gummy', 'glass']) {
    const result = runParity({ race, seed: 3, days: 1 });
    assert.equal(result.ok, true, `${race} parity: ${JSON.stringify(result.diffs)}`);
    assert.equal(result.drawsA, result.drawsB, `${race} rng draw count`);
    assert.equal(result.transitionsA, result.transitionsB, `${race} transition count`);
    assert.ok(result.transitionsA > 0, `${race} produced transitions`);
  }
});

test('legacy-vs-legacy is deterministic and a perturbation is detected', () => {
  const result = validateParity({ race: 'bear', seed: 5, days: 1 });
  assert.equal(result.legacyVsLegacy.ok, true, 'same engine must be deterministic');
  assert.equal(result.legacyVsModules.ok, true, 'modules must match legacy');
  assert.equal(result.perturbationDetected.ok, true, 'the diff must catch a changed need value');
  assert.equal(result.comparator.equal.ok, true, 'direct and JSON comparators agree on equal runs');
  assert.equal(result.comparator.perturbed.ok, true, 'direct and JSON comparators agree on perturbed runs');
  assert.equal(result.comparator.perturbed.detected, true, 'the cross-check must also detect the perturbation');
  assert.equal(result.ok, true);
});

test('JSON snapshots are compared every tick, not only at verbose samples', () => {
  const result = runParity({
    race: 'bear', seed: 5, days: 1, sampleEvery: 17, perturb: .001,
  });
  assert.equal(result.ok, false);
  assert.equal(result.firstTick, 0, 'the first-tick perturbation is not hidden by sample intervals');
});

test('temporary port markers match the expected step-3 list', () => {
  const markers = findPortMarkers();
  const expected = readFileSync(new URL('../scripts/port-markers.txt', import.meta.url), 'utf8')
    .split('\n')
    .map(line => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .sort();
  const found = [...new Set(markers.map(marker => marker.id))].sort();
  assert.deepEqual(found, expected);
});
