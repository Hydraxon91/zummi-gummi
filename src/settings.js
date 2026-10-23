// Pure display-setting definitions and resolution.
//
// This module owns preset data, nature normalization and stored-profile
// resolution only. Browser storage keys, URL flags, DOM controls and the
// application order stay in app.js; advanced graphics normalization stays in
// graphics.js. Importing this module performs no environment access.

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

export const DEFAULT_NATURE = Object.freeze({
  canopy: 1,
  leafSize: 1,
  coverage: 1,
  drawDistance: 56,
});

// Preset IDs accepted from storage. `custom` is a derived state, not a preset.
export const SETTINGS_PROFILE_IDS = Object.freeze([
  'auto', 'performance', 'balanced', 'quality', 'ultra',
]);

export function normalizeNature(v = {}) {
  return {
    canopy: clamp(Number(v.canopy) || 1, .35, 1),
    leafSize: clamp(Number(v.leafSize) || 1, .65, 1.4),
    coverage: clamp(Number(v.coverage) || 1, .35, 1),
    drawDistance: clamp(Math.round(Number(v.drawDistance) || 56), 28, 76),
  };
}

// The Auto preset inherits the device effects default, which app.js detects.
// Supplying it here keeps this factory pure while preserving each profile's
// exact record on every device.
export function createSettingsProfiles({ autoEffects = 'soft' } = {}) {
  const profiles = {
    auto: {
      label: 'Auto', tier: 0, renderScale: 1, effects: autoEffects, dof: false,
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
  for (const profile of Object.values(profiles)) {
    Object.freeze(profile.nature);
    Object.freeze(profile);
  }
  return Object.freeze(profiles);
}

// Neutral records for fixtures/consumers with no device effects context. app.js
// builds its live table with the detected default effects instead.
export const PROFILES = createSettingsProfiles();

// Valid stored values win. Otherwise a legacy settings key means the old
// unlabelled state is Custom; a truly empty store keeps the Auto default.
export function resolveSettingsProfile({ storedProfile = null, hasLegacySettings = false } = {}) {
  if (storedProfile === 'custom' || SETTINGS_PROFILE_IDS.includes(storedProfile)) {
    return storedProfile;
  }
  return hasLegacySettings ? 'custom' : 'auto';
}
