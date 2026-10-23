# Roster panel read-model contract

`src/rosterview.js` owns the pure roster read model used by the Meadow buddy
panel. `src/app.js` keeps every DOM, styling, listener and selection side effect.

## Producer and consumers

- Producer: `buildRosterRows(actors, options)` in `src/rosterview.js`.
- App consumer: `refreshBuddyList` builds rows from `actorView.active()`, reuses
  keyed `.buddyRow` elements by `dataset.uid`, and updates their text/styles.
- Signature consumer: `buddySignature` wraps `rosterSignature`; `syncAeroUI`
  compares that signature with `buddySig` to decide whether a full refresh is
  needed.
- The debug `__gummy.roster()` snapshot keeps its existing shape and is not a
  consumer of this module.

`buildRosterRows` does not mutate actors, retain live actor references, read
storage, consume randomness, touch the DOM or import three.js. Array
`parentUids` are copied.

## Row contract

Input order is preserved. Rows are plain objects:

| Field | Source |
| --- | --- |
| `uid`, `key` | `actor.uid`; `key` is `String(uid)` for keyed DOM reuse |
| `name`, `sex`, `stage`, `home`, `health` | raw actor values |
| `status` | `statusFor(actor)` — app passes `buddyStatus` |
| `family` | `familyFor(actor)` — app passes `familyShort` |
| `color` | `colorFor(actor)` — app passes `flavorHex` |
| `selected` | UID equality with `selectedUid` |
| `kind`, `species`, `scale`, `flavor`, `parentUids` | copied for the signature |

The callbacks receive the original actor exactly once per accepted row. Display
fallbacks (`Gummy`, `—`, sex glyph, non-adult stage label), health label/style
and all element fields (`_buddy*`) remain app-owned. The raw `health` field is
copied; `syncBuddyHealth` still computes the clamped percentage and labels.

Missing and duplicate UIDs keep current app behavior: no row is dropped or
deduplicated, duplicate rows share the same `key`, and a missing UID has key
`"undefined"`. UID policy is unchanged.

## Signature contract

`rosterSignature(rows)` is exactly the previous `buddySignature` expression:

```
kind || species : name : sex : stage : scale : home : flavor : parentUids.join(',')
```

Rows are joined with `|`. Missing values retain their existing string
coercion, and missing `parentUids` joins as an empty string. This preserves the
current refresh sensitivity.

Health, status, selected, family and color are deliberately **not** part of the
signature. They change through `updateBuddyStatuses`, `syncBuddyHealth` and the
keyed row update, so adding them here would force unnecessary roster rebuilds
and change existing refresh behavior.

## Preserved app behavior

- `actorView.active()` filtering through `speciesOf(actor).roster`.
- Row order, keyed DOM reuse by `dataset.uid`, and single listener per created
  row; reused rows read their current actor through `_buddyActor`.
- Click focus, selected highlighting, `online` count, status tick reset,
  health styling/labels, directive-panel synchronization and Meadow-only
  `replaceChildren()` clearing.

Checks: `tests/rosterview.test.mjs`, `tests/relationshipview.test.mjs`, full
`node --test tests`, `node scripts/check-behavior-contracts.mjs`, short parity
and the affected browser probe.
