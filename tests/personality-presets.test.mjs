import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIT_DEFINITIONS, TRAIT_AXES, PERSONALITY_PRESETS, definePersonalityPreset,
  founderTraits, applyTraitOffsets } from '../src/behaviors/traits.js';
import { FEATURE_DEFAULTS } from '../src/behaviors/config.js';
import { BEAR_PROFILE } from '../src/behaviorprofiles.js';

test('ordered trait definitions retain founder baselines and neutral defaults', () => {
  assert.deepEqual(TRAIT_AXES, ['bold', 'greed', 'curiosity']);
  assert.ok(TRAIT_DEFINITIONS.every(d => d.min === 0 && d.max === 1 && d.neutral === .5 && Object.isFrozen(d)));
  for (const [species, expected] of [
    ['bear', { bold: .5568, greed: .8188, curiosity: .4992 }],
    ['msn', { bold: .3296, greed: .5935, curiosity: .2849 }],
    ['glass', { bold: .2107, greed: .8108, curiosity: .4151 }],
  ]) assert.deepEqual(founderTraits(7, species), expected);
});

test('presets are immutable opt-in values and use existing bounded effects only', () => {
  assert.equal(FEATURE_DEFAULTS.personality, false);
  assert.deepEqual(PERSONALITY_PRESETS.map(p => p.id), ['shy', 'adventurous', 'food-motivated']);
  assert.ok(PERSONALITY_PRESETS.every(p => Object.isFrozen(p) && Object.isFrozen(p.traits)));
  const [shy, adventurous, food] = PERSONALITY_PRESETS.map(p => applyTraitOffsets(BEAR_PROFILE, p.traits));
  assert.ok(shy.thresholds.seekSocial > BEAR_PROFILE.thresholds.seekSocial);
  assert.ok(adventurous.wander.max > BEAR_PROFILE.wander.max);
  assert.ok(food.thresholds.seekHunger < BEAR_PROFILE.thresholds.seekHunger);
  assert.equal(BEAR_PROFILE.traits, undefined);
});

test('preset validation rejects invalid data before normalization could hide it', () => {
  const base = { id: 'example', label: 'Example', traits: { bold: .5, greed: .5, curiosity: .5 } };
  assert.doesNotThrow(() => definePersonalityPreset(base));
  for (const patch of [{ id: '' }, { label: ' ' }, { traits: [] },
    { traits: { ...base.traits, newAxis: .5 } }, { traits: { bold: .5 } },
    ...[NaN, Infinity, -.1, 1.1, '0.5'].map(value => ({ traits: { ...base.traits, bold: value } })),
  ]) assert.throws(() => definePersonalityPreset({ ...base, ...patch }));
});
