import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NATURE, SETTINGS_PROFILE_IDS, PROFILES, createSettingsProfiles,
  normalizeNature, resolveSettingsProfile,
} from '../src/settings.js';

const EXPECTED_PROFILES = {
  auto: {
    label: 'Auto', tier: 0, renderScale: 1, effects: 'soft', dof: false,
    adaptive: true, nature: { canopy:1, leafSize:1, coverage:1, drawDistance:56 },
  },
  performance: {
    label: 'Performance', tier: 3, renderScale: .70, effects: 'off', dof: false,
    adaptive: false, nature: { canopy:.55, leafSize:.85, coverage:.45, drawDistance:28 },
  },
  balanced: {
    label: 'Balanced', tier: 2, renderScale: .85, effects: 'soft', dof: false,
    adaptive: false, nature: { canopy:.75, leafSize:.95, coverage:.70, drawDistance:40 },
  },
  quality: {
    label: 'Quality', tier: 1, renderScale: .95, effects: 'full', dof: false,
    adaptive: false, nature: { canopy:.90, leafSize:1, coverage:.90, drawDistance:48 },
  },
  ultra: {
    label: 'Ultra', tier: 0, renderScale: 1, effects: 'full', dof: false,
    adaptive: false, nature: { canopy:1, leafSize:1, coverage:1, drawDistance:48 },
  },
};

test('profile IDs and records preserve the reviewed preset data', () => {
  assert.deepEqual(SETTINGS_PROFILE_IDS, ['auto', 'performance', 'balanced', 'quality', 'ultra']);
  assert.deepEqual(Object.keys(PROFILES), [...SETTINGS_PROFILE_IDS]);
  assert.deepEqual(PROFILES, EXPECTED_PROFILES);
});

test('the Auto preset inherits the supplied device effects default', () => {
  const lowPower = createSettingsProfiles({ autoEffects: 'off' });
  assert.equal(lowPower.auto.effects, 'off');
  assert.equal(lowPower.performance.effects, 'off');
  assert.equal(lowPower.balanced.effects, 'soft');
  assert.equal(lowPower.quality.effects, 'full');
  assert.equal(lowPower.ultra.effects, 'full');
  assert.deepEqual(lowPower.auto.nature, EXPECTED_PROFILES.auto.nature);
  assert.deepEqual(createSettingsProfiles(), PROFILES);
});

test('exported profile data is frozen where the module promises it', () => {
  assert.ok(Object.isFrozen(DEFAULT_NATURE));
  assert.ok(Object.isFrozen(SETTINGS_PROFILE_IDS));
  assert.ok(Object.isFrozen(PROFILES));
  for (const id of SETTINGS_PROFILE_IDS) {
    assert.ok(Object.isFrozen(PROFILES[id]));
    assert.ok(Object.isFrozen(PROFILES[id].nature));
  }
  assert.throws(() => { PROFILES.auto.renderScale = 2; }, TypeError);
  assert.throws(() => { PROFILES.auto.nature.canopy = .5; }, TypeError);
  assert.throws(() => { DEFAULT_NATURE.canopy = .5; }, TypeError);
  assert.throws(() => { SETTINGS_PROFILE_IDS.push('legacy'); }, TypeError);
});

test('normalizeNature preserves defaults for missing and falsy inputs', () => {
  const defaults = { canopy:1, leafSize:1, coverage:1, drawDistance:56 };
  assert.deepEqual(normalizeNature(), defaults);
  assert.deepEqual(normalizeNature(undefined), defaults);
  assert.deepEqual(normalizeNature({}), defaults);
  assert.deepEqual(normalizeNature({ canopy:0, leafSize:null, coverage:NaN, drawDistance:0 }), defaults);
  assert.notEqual(normalizeNature(), DEFAULT_NATURE);
});

test('normalizeNature clamps each field and rounds draw distance', () => {
  assert.deepEqual(normalizeNature({ canopy:.1, leafSize:.1, coverage:.1, drawDistance:1 }), {
    canopy:.35, leafSize:.65, coverage:.35, drawDistance:28,
  });
  assert.deepEqual(normalizeNature({ canopy:2, leafSize:2, coverage:2, drawDistance:999 }), {
    canopy:1, leafSize:1.4, coverage:1, drawDistance:76,
  });
  assert.deepEqual(normalizeNature({ drawDistance:42.4 }), {
    canopy:1, leafSize:1, coverage:1, drawDistance:42,
  });
  assert.deepEqual(normalizeNature({ drawDistance:42.6 }), {
    canopy:1, leafSize:1, coverage:1, drawDistance:43,
  });
  assert.deepEqual(normalizeNature({ drawDistance:Infinity }), {
    canopy:1, leafSize:1, coverage:1, drawDistance:76,
  });
});

test('normalizeNature coerces numeric strings without mutating its input', () => {
  const input = { canopy:'0.5', leafSize:'1.2', coverage:'0.8', drawDistance:'45.5' };
  const before = JSON.stringify(input);
  const out = normalizeNature(input);
  assert.deepEqual(out, { canopy:.5, leafSize:1.2, coverage:.8, drawDistance:46 });
  assert.equal(JSON.stringify(input), before);
  assert.notEqual(out, input);
  assert.deepEqual(normalizeNature({ canopy:'not a number' }), {
    canopy:1, leafSize:1, coverage:1, drawDistance:56,
  });
});

test('normalizeNature does not read RNG or ambient browser storage', async () => {
  const random = Math.random;
  Math.random = () => { throw new Error('normalizeNature read Math.random'); };
  try {
    assert.deepEqual(normalizeNature({ canopy:.5 }), {
      canopy:.5, leafSize:1, coverage:1, drawDistance:56,
    });
  } finally {
    Math.random = random;
  }

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('settings import read ambient localStorage'); },
  });
  try {
    const mod = await import(`../src/settings.js?isolated=${Date.now()}`);
    assert.deepEqual(mod.normalizeNature(), DEFAULT_NATURE);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('valid stored profile values win over legacy settings', () => {
  for (const id of ['custom', ...SETTINGS_PROFILE_IDS]) {
    assert.equal(resolveSettingsProfile({ storedProfile: id }), id);
    assert.equal(resolveSettingsProfile({ storedProfile: id, hasLegacySettings: true }), id);
  }
});

test('invalid or absent stored profiles resolve to custom or auto', () => {
  for (const storedProfile of [undefined, null, '', 'Auto', 'turbo', '0', 0, false]) {
    assert.equal(resolveSettingsProfile({ storedProfile }), 'auto');
    assert.equal(resolveSettingsProfile({ storedProfile, hasLegacySettings: true }), 'custom');
  }
  assert.equal(resolveSettingsProfile(), 'auto');
  assert.equal(resolveSettingsProfile({ hasLegacySettings: true }), 'custom');
});

test('profile resolution is deterministic and does not mutate its options', () => {
  const options = { storedProfile: 'turbo', hasLegacySettings: true };
  const before = JSON.stringify(options);
  assert.equal(resolveSettingsProfile(options), 'custom');
  assert.equal(resolveSettingsProfile(options), 'custom');
  assert.equal(JSON.stringify(options), before);
});
