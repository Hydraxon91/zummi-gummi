# World state and storage contract

Status: implemented M10 hydration boundary. This document describes the current
working tree only. It does not change the save schema, autosave cadence, map
coordinator or the two supported map IDs.

Scope: `src/world.js` map registry/per-map state and the app composition point
that hydrates it. The app still owns live actors, camera, gifts, physics and the
save payload; `saveformat.js`/`save.js` remain the save store. There is no second
world store.

## Ownership and imports

`src/world.js` owns:

- map definitions `STUDIO`, `FIELD` and `MAPS`;
- the mutable per-map snapshots `worlds`;
- `activeWorld.mapId` plus its `launcher`/`state` getters;
- launcher and Meadow-clock preferences in `localStorage`.

`createWorldState({ getStorage })` builds one independent session. `getStorage`
is an injected getter (a plain storage object is also accepted) resolved lazily on
each explicit storage operation. It defaults to a best-effort resolver for the
browser `localStorage` global. Construction does not resolve storage, so importing
`world.js` and creating a factory never read `localStorage` and are safe in
headless/Node tests.

The default singleton exports remain backward-compatible: `worlds`, `activeWorld`,
`getActiveMap`, `getWorldState`, `saveLauncherPos`, `persistWorld` and
`setActiveMap` operate on the same exported objects as before. `hydrateWorld()`
performs the explicit hydration for that singleton; factory instances expose the
equivalent `hydrate()`.

Hydration mutates the existing world objects, gift arrays and `activeWorld`
rather than replacing them with hidden copies. A launcher object may be replaced
when a valid saved position is applied, matching the pre-M10 behavior.

## App composition

`src/app.js` calls `hydrateWorld()` once during module evaluation, immediately
after its imports and before its first `activeWorld` use. The call has no
try/catch in app: storage denial, a missing browser global, malformed JSON and
write failures are handled inside `world.js`'s documented best-effort resolver.

## Storage keys and precedence

| Key | Owner | Behavior |
| --- | --- | --- |
| `gummy.worlds.v2` | `world.js` | JSON object of per-map launcher/clock preferences. Missing, unparsable or non-object values fall back to `{}`. |
| `gummy.map` | `world.js` | Active map ID. Only `studio` and `field` are accepted; anything else restores `field`. |
| `gummy.studio.launcher` | `world.js` (legacy) | Studio launcher fallback used only when `gummy.worlds.v2.studio.launcher` is not a finite position. |

`saveLauncherPos` writes the active world's launcher to `gummy.worlds.v2` and, for
the Studio, also to the legacy key. `persistWorld(id)` performs a read-merge-write:
it keeps unrelated top-level keys and other fields of the same world record, then
writes `launcher`, `time`, `auto` and `speed`. `setActiveMap` rejects unknown IDs
without writing.

## Preserved defaults and quirks

Hydration preserves the values and truthiness rules that existed before M10:

- Field `time`: a finite stored number is used as-is, including `0`; otherwise
  `7.0`.
- Field `auto`: `false` only when the stored value is exactly `false`; otherwise
  `true` when a field record exists, and `true` when it does not.
- Field `speed`: any truthy stored value is used as-is; falsy values (including
  `0`) fall back to `1`.
- Studio clock fields are not restored from storage; Studio keeps `time: null`,
  `auto: false`, `speed: 1` as before.
- Launcher positions require finite `x` and `z`; saved current-map data wins over
  the legacy Studio key, which in turn wins over the null default.
- Saved Studio clock fields are ignored; only the launcher is read for Studio.

These are intentional compatibility rules, not new validation policy. Do not
"fix" the speed truthiness or add stricter setters without an approved behavior
change.

## Failure behavior

Storage is a preference store, not required session state. Missing storage, a
throwing storage getter, denied `getItem`/`setItem`, malformed JSON and an invalid
map ID all resolve to in-memory defaults. Mutations such as `saveLauncherPos`,
`persistWorld` and `setActiveMap` still update memory when persistence is
unavailable. These catches are deliberate best-effort fallbacks; they do not
fabricate successful persistence.

No save-slot schema, autosave cadence, map-switch sequencing or New Game policy is
changed by this boundary.

## Checks

- `tests/world-state.test.mjs`: import/factory storage isolation, independent
  sessions, defaults, preference quirks, launcher precedence, malformed and
  throwing storage, merge retention, invalid map fallback and reference identity.
- `tests/save.test.mjs`, `content.test.mjs`, `actor.test.mjs`, save-migration
  tests: existing save/content/actor behavior remains green.
- Browser probe under `.dev-shots/b5/`: seeded Studio/field preferences and the
  legacy launcher before boot, active map/launcher assertions, map switch,
  save/load and New Game through existing `window.__gummy` hooks.
