# Home simulation and building presentation boundary

Status: **M9 / C5 implementation and fixture proof.** This step extracts the
pure resident-count and birth-home choice from `src/app.js`, adds a focused Node
suite and records the boundary. It does not change villa meshes, occupancy
glow, doors, authored lots, capacity, save data, birth order, RNG or the
roadmap. Parent review and acceptance are separate.

Baseline: `HEAD 2dcf50c` with a clean working tree. Evidence labels used here:

- **Inspected** — the named source and its immediate callers were read.
- **Host-run** — a command was executed for this step.
- **Unverified** — no executed check exists here for that claim.

## 1. Owners and non-owners

| Concern | Owner | Boundary |
| --- | --- | --- |
| Resident count and birth-home choice | `src/homesim.js` (`countHomeResidents`, `chooseBirthHome`) | Pure functions over caller-supplied actor and home values. No imports, mutation, RNG, clock, renderer or DOM. |
| Authored home names, positions, styles | `src/floratypes.js`, `src/mapcontent.js` | Style definitions and authored lots. `HOME_CAPACITY` remains in `src/life.js`. |
| Runtime home descriptors, doors, colliders, layout validation | `src/field.js` | Builds `field.homes` from the authored lots with `door`, `r`, `yaw` and scale; adds house colliders and nav solids; exposes `validateLayout`. |
| Villa meshes and occupancy presentation | `src/homes.js` (`createAeroHomes`) | Owns instanced villa geometry and the `setOccupied(names)` occupancy glow. It reads names; it does not choose homes. |
| Household membership and routines | `src/family.js` | `householdMembers` and routine windows remain home-string based and unchanged. |
| Live actor roster and birth sequence | `src/app.js` | `actorView`, `homeResidents`, the `chooseBirthHome` wrapper, `birthChild` and child spawn/restore; the wrapper composes live inputs but does not redefine the rule. |

Doors and occupancy effects were deliberately left in their existing owners.
`homes.js` has no import of `homesim.js`, and `homesim.js` has no field or
renderer import.

## 2. Pure rule

`countHomeResidents(actors, name)` counts actors where all of the following hold:

- the actor is present and `active` is truthy;
- `actor.home` is a string;
- `actor.home === name`.

Soft-body and Glass actors are supplied in one list by the caller. A falsy
`name` returns `0`. The count never mutates an actor.

`chooseBirthHome({ mother, homes, residents, capacity })` implements the
existing app rule exactly:

1. If `mother.home` is truthy and its resident count is below `capacity`,
   return `mother.home`. This uses the mother's string even if it is not one of
   the authored `homes`.
2. If `homes` is falsy, return the existing fallback: `mother.home || ''` when
   the mother exists, otherwise `''`.
3. Otherwise scan `homes` once in authored order, counting residents for each
   `home.name`. Keep the first home whose count is strictly lower than the best
   count seen so far. Equal counts preserve the earlier authored home.
4. Return the chosen `home.name`. If no home was chosen (for example an empty
   list), return the same mother fallback as step 2.

The call does not write to actors, mother, homes or shared state. Two calls with
the same values return the same name. No RNG draw is introduced, so the birth
sequence and its existing draws remain unchanged.

## 3. App composition

`src/app.js` keeps its internal `homeResidents(name)` signature and delegates to
`countHomeResidents(actorView.all(), name)`. `chooseBirthHome(mother)` now passes:

- `mother`;
- `homes: field && field.homes`;
- `residents: actorView.all()`;
- `capacity: HOME_CAPACITY`.

The wrapper is called from `birthChild` at the same point as before, before the
sleeping/inside door lookup, `nearestWalkable`, genome, sex and child spawn. No
birth eligibility, draw, history, bond or spawn behavior changed.

## 4. Unchanged presentation and content

- `field.homes` still contains authored descriptors; home identity is still the
  stable name string, not a live object reference.
- `field` still owns doors, door clearance, colliders and nav solids.
- `homes.js` still owns villa geometry and the occupancy instance; its
  `setOccupied` API is unchanged.
- `family.js` household membership and routine windows are unchanged.
- No interior, placement editor, home registry or alternate capacity policy was
  added.

## 5. Requirement-to-check map

All checks below are host-run unless marked otherwise.

| Requirement | Check |
| --- | --- |
| Count only active actors | `resident count includes active soft-body and Glass actors with the exact home string`; `resident count treats a missing or empty home name as no home` |
| Soft-body and Glass share one list | `resident count includes active soft-body and Glass actors...`; `overflow tie preserves authored home order` (Glass changes the outcome) |
| Exact home strings | same count test with `Villa A `, `villa a` and `''` |
| Mother home wins below capacity | `mother keeps her home while residents are below capacity` |
| Capacity boundary | `capacity boundary sends the birth to the first least-populated authored home` |
| First least-populated, strict tie order | `overflow tie preserves authored home order` |
| Empty/missing mother fallback | `an absent or empty mother preserves the current first-home fallback` |
| No homes or empty list fallback | `no homes or an empty home list preserves the exact mother fallback` |
| Overflow may choose an unauthored/other home | `a full mother home may choose any authored home, including one outside the mother home` |
| No mutation, deterministic | `the rule is deterministic and does not mutate actors, homes or the mother` |
| Authored name returned | `the chosen value is the authored home name, not the descriptor` |
| Existing family/household behavior | `node --test tests/family.test.mjs tests/behavior-family.test.mjs` |
| Existing actor-view compatibility | `resident count matches the existing actor view for a mixed roster`; `node --test tests/actor.test.mjs tests/species-extension.test.mjs` |
| App module remains parseable | `node --check src/app.js` |
| Whole committed Node suite | `node --test tests` |

## 6. Executed evidence

- `node --test tests/homesim.test.mjs` — 11 tests passed.
- `node --test tests/homesim.test.mjs tests/family.test.mjs tests/actor.test.mjs tests/species-extension.test.mjs tests/behavior-family.test.mjs` — 36 tests passed.
- `node --check src/app.js && node --check src/homesim.js` — passed.
- `node --test tests` — 528 tests passed, 0 failed.
- Browser probe (seeded, `.dev-shots/c5/probe.mjs`) — live `forceBirth` through
  `birthChild`: under-capacity child kept the mother home; a full mother home
  selected the first authored least-populated home; both children were soft-body
  actors with the expected `home`. The final probe passed 2/2 consecutive runs
  with no page errors. The first probe revision failed its own actor-selection
  check and was narrowed to identify the new soft-body child by UID diff; see the
  ledger for the sequence. No screenshots were taken because this step has no
  visual/UI change.
- `node scripts/browser-regression.mjs` — `BROWSER OK`, 10-row roster, family
  birth/stage/save section intact and no page errors.

Source-inspected claims include the `birthChild` call order, `HOME_CAPACITY` in
`life.js`, actor-view active filtering, field home construction, `homes.js`
`setOccupied`, `family.js` household membership and the other capacity/overflow
call sites in `glass.js`, `behavior.js` and `behaviors/engine.js` (unchanged).

## 7. Limits

- The existing `glass.js`, `behavior.js` and `behaviors/engine.js` home-choice
  variants are not routed through `homesim.js`; changing them is outside C5.
- Villa occupancy glow and door reachability still rely on inspected existing
  code and the committed field-layout/browser checks, not a dedicated visual
  test.
- `homeResidents` in `app.js` remains the internal compatibility wrapper; this
  step did not alter actor-view ownership in `npc.js`.
