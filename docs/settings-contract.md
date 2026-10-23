# Display settings contract

Status: E1/M17 pure settings boundary implemented. This document describes the
current working tree, not a settings framework, UI redesign or quality-policy
change. Shipped defaults, preset records, Custom semantics, reset/apply order and
frame-quality behavior are unchanged.

## Ownership

| Concern | Owner |
| --- | --- |
| Pure preset records, nature normalization, stored-profile resolution | `src/settings.js` |
| Browser storage keys, legacy-key detection, URL flags, DOM controls, applying presets/quality/effects, persistence | `src/app.js` |
| Advanced graphics descriptor normalization, `localStorage`/URL reads and panel construction | `src/graphics.js` |
| Effects composition and render-target behavior | `src/effects.js` |

`src/settings.js` performs no `localStorage`, `location`, DOM, three.js or RNG
access at import or call time. `src/graphics.js` remains the owner of advanced
graphics normalization and is not duplicated here.

## Exports

- `DEFAULT_NATURE` — frozen `{ canopy:1, leafSize:1, coverage:1, drawDistance:56 }`.
- `SETTINGS_PROFILE_IDS` — frozen preset order: `auto`, `performance`,
  `balanced`, `quality`, `ultra`. `custom` is a derived state, not a preset.
- `createSettingsProfiles({ autoEffects = 'soft' } = {})` — builds the frozen
  preset table. `autoEffects` supplies the Auto preset's device-dependent
  effects default.
- `PROFILES` — the neutral frozen table from `createSettingsProfiles()`.
  `app.js` builds its live table with the detected `DEFAULT_EFFECTS` so
  low-power devices keep `auto.effects === 'off'` and other devices keep
  `'soft'`. All other profile fields are identical.
- `normalizeNature(v = {})` — returns a new normalized nature record.
- `resolveSettingsProfile({ storedProfile, hasLegacySettings } = {})` — returns
  a valid stored profile/custom value, otherwise `custom` when legacy settings
  exist, otherwise `auto`.

## Preset records

| ID | Label | Tier | Render scale | Effects | DOF | Adaptive | Nature (canopy, leafSize, coverage, drawDistance) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `auto` | Auto | 0 | 1 | device default | false | true | 1, 1, 1, 56 |
| `performance` | Performance | 3 | .70 | off | false | false | .55, .85, .45, 28 |
| `balanced` | Balanced | 2 | .85 | soft | false | false | .75, .95, .70, 40 |
| `quality` | Quality | 1 | .95 | full | false | false | .90, 1, .90, 48 |
| `ultra` | Ultra | 0 | 1 | full | false | false | 1, 1, 1, 48 |

The records and their nested nature objects are frozen. They are data only;
`app.js` still assigns tier/cap/adaptive/render scale/effects/DOF/nature and
calls the existing quality, graphics, effects and UI functions in the existing
order.

## Nature normalization

`normalizeNature` preserves the previous expressions exactly:

- `canopy`: `Number(v.canopy) || 1`, clamped `.35..1`.
- `leafSize`: `Number(v.leafSize) || 1`, clamped `.65..1.4`.
- `coverage`: `Number(v.coverage) || 1`, clamped `.35..1`.
- `drawDistance`: `Math.round(Number(v.drawDistance) || 56)`, clamped `28..76`.

Falsy values therefore fall back to the default (including `0`), numeric strings
coerce, and out-of-range values clamp. The caller's object is not mutated.

## Stored-profile resolution

`app.js` reads `gummy.profile` and passes the raw value to
`resolveSettingsProfile`:

1. `custom` or any of the five preset IDs is retained, regardless of legacy
   keys.
2. Otherwise, if any legacy key is present (`gummy.effects`,
   `gummy.effectsDof`, `gummy.nature`, in that order), the result is `custom`.
3. Otherwise the result is `auto`.

The app only reads those three legacy keys when the stored profile is not valid,
matching the previous conditional read order. `app.js` remains responsible for
the surrounding `try`/`catch`, effects/DOF/nature/toon reads, and all
`saveSettings` writes. A valid stored profile continues to win over legacy keys.

## Verification

- `tests/settings.test.mjs` checks exact records, the injected Auto effects
  default, freezing, normalization defaults/clamps/rounding/coercion, input
  non-mutation, no RNG/ambient-storage access and stored-profile resolution.
- Browser evidence for preset application, Custom transition, persistence across
  reload, legacy-only Custom and reset-to-Auto is recorded under
  `.dev-shots/e1/`.
- `graphics.js` has no dedicated Node test; the browser probe checks the public
  settings hooks and DOM profile controls, not every advanced graphics row.
