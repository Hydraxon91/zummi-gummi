import test from 'node:test';
import assert from 'node:assert/strict';
import { HARNESS_LIFECYCLE } from '../scripts/behavior-parity.mjs';
import { STAGE_AGE, GESTATION_TIME, MATE_COOLDOWN } from '../src/life.js';

test('harness lifecycle constants match life.js and the meadow cap', () => {
  assert.deepEqual(HARNESS_LIFECYCLE.stageAge, STAGE_AGE);
  assert.equal(HARNESS_LIFECYCLE.gestation, GESTATION_TIME);
  assert.equal(HARNESS_LIFECYCLE.mateCooldown, MATE_COOLDOWN);
  // app.js setCeilingForMap(): map.kind === 'life' ? 40 : 128
  assert.equal(HARNESS_LIFECYCLE.populationCap, 40);
});
