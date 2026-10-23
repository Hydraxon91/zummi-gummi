# Interaction ownership inventory

**Status: M2a source inventory, updated with the C1 M2b pilot record.** Baseline
HEAD `8703a6e` for the inventory; C1 pilot baseline `a05ce72` with a clean
working tree. This document records who writes the shared interaction state that
already exists, where reciprocal links and resource reservations can outlive the
pair, and which outcomes have source or test evidence. It does not propose a
central registry or a broad rewrite. C1 routes only the social invite/visit entry
partner assignments through one own-side helper; it does not centralize the
other writers.

Scope: partner, family task, playdate, visit, group, food/portion claim and
gift/conflict interaction state. The M2a pass left production runtime, tests,
configuration, generated files, roadmaps and package metadata unchanged. The C1
pilot adds `linkPartner`, the two social entry callers, focused tests and this
note. The prior [system ownership contracts](system-ownership-contracts.md)
remain the authoritative system-boundary reference; this file adds the
source-backed interaction detail that M2 needs.

## Evidence labels

- **Inspected** — the named field/symbol and its immediate callers were read in
  this pass.
- **Sampled** — representative call sites or one outcome path were read; not
  every branch or representation was traced.
- **Unverified** — plausible from surrounding code but not established here, or
  not exercised by a check. Not a claim of correctness.

No browser or parity run was performed for the M2a documentation pass. C1's
focused Node results are recorded with the pilot below; they are not a full-suite
or browser result. Other test names below are existing coverage, not fresh test
results from this documentation pass.

## State inventory

### Pair links and persistent partnership

| State | Shape and authority | Initialization | Persistence |
| --- | --- | --- | --- |
| `ai.partner` | Live actor object reference. Reciprocal by convention, not by a single invariant: `beginPair` and the social/visit entry points write both sides, while `startTask` and a few recovery paths write only the acting side. | `engine.attach` sets `null`; legacy `behavior.js` has its own attach. | Runtime only; excluded from actor records. |
| `ai.waitForPartner` | Boolean written by legacy cross-species mate setup, `mate.js` and Glass grab/reset paths. No module reads it (`grep` finds writes only). | `engine.attach` sets `false`. | Runtime only. |
| `actor.partnerUid` | Persistent reciprocal adult partnership UID. Owned by `setPartnership` / `clearPartnership` in `src/relationships.js`, not by `ai.partner`. | Absent until committed. | Saved (`actorrecord.js`, `actorsave.js` v8/9) and validated for reciprocity. |
| `actor.rivals` | Persistent reciprocal conflict records keyed by actor UID, owned by `setRival` / `clearRival`. | Absent until a conflict promotes rivalry. | Saved and validated for reciprocity. |

`ai.partner` and `actor.partnerUid` are different concepts. A social pair does
not create a partnership, and a partnership does not populate `ai.partner`.
`ai.follow` is a separate guardian/follow reference and is not part of this
inventory except where removal cleanup touches it.

### Family task state

`startTask` in `src/interactions.js` is the constructor for `ai.familyTask`:

| Field | Meaning / writer |
| --- | --- |
| `id` | Registered interaction id (`familyMeal`, `familyLesson`, `familyPlaydate`). |
| `mode` | Copied from the interaction definition (`solo` or `pair`). |
| `role` | Task role chosen by the starter (`host`, `guest`, `teacher`, `student`). |
| `partnerUid` | `partner.uid` or `0`; informational, while `ai.partner` is the live link. |
| `anchor` | Copied `{ x, z, home }` or `null`. Used for travel/arrival, not recomputed each tick. |
| `phase` | `travel` or `act`; mutated directly by `family.js` and `tickTask`. |
| `t` | Remaining act timer; mutated by `family.js` and `tickTask`. |
| `data` | Task-specific payload (routine name or skill key). |

`startTask` also writes `ai.state = 'familyTask'`, `ai.partner`, `ai.moving`,
`ai.path` and `ai.target`. It does not reciprocate the partner link; callers
that need a pair task call `startTask` for both actors.

Family playdate adds two runtime mirrors plus one role flag:

| State | Writer | Reader |
| --- | --- | --- |
| `ai.playdate` | `family.js` `startPlaydate` / `finish`; `engine.attach` and `glass.js` reset it. | `glass.js` debug state; app UI uses `playmateKind`/`playdateHome` instead. |
| `ai.playdateHome` | `family.js` `startPlaydate` / `finish`; reset paths. | App thought/status text and Glass debug state. |
| `ai.playdateTarget` | `family.js` `startPlaydate` / `finish`; reset paths. | Glass debug state only. Movement uses `familyTask.anchor`, not this copy. |

`ai.familyPlay` and `ai.playmateKind` are family-social role state written by
`social.js` (`acquireCompany`, `beginSocialPair`, `endSocialPair`) and
`family.js` (`startPlaydate`, `finish`). They are not the task itself.

No `ai.familyTask.partner` reference exists; the live partner is `ai.partner`.
No `ai.taskTimer` or `ai.familyTaskTimer` field exists; the timer is
`ai.familyTask.t`.

### Social visit state

| State | Meaning / writer |
| --- | --- |
| `ai.visitHome` | Home **name** string chosen by the initiator in `social.startVisit`, written to both actors. |
| `ai.visitRole` | `host` on the initiator, `guest` on the partner. |
| `ai.visitPhase` | `travel`, then `hangout`. |
| `ai.visitArrived` | Per-actor arrival flag set in `tickVisit`; the host waits for the guest flag before starting the hangout. |
| `ai.visitT` | Travel watchdog (initiator only) then hangout timer. |
| `ai.visitRetryT` | Initialized by `engine.attach`; no reader was found, so it is inert in this pass. |

No `ai.visitTarget` field exists. The visit target is `ai.target`, set by
`startVisit`; the guest target is a door-side approach point. No visit state is
saved.

### Group activity state

| State | Shape / writer |
| --- | --- |
| `ai.group` | Shared object reference for every member: `{ id, kind, leaderUid, members, phase, t, done }`. Created by `groups.startGroup`; `members` is a live actor array. |
| `ai.groupSlot` | Per-member `{ x, z }` walkable slot assigned by `startGroup`. |
| `ai.groupRole` | `leader` or `member`; `chooseLeader` can rewrite it. |
| `ai.groupCooldown` | Per-actor retry cooldown, set on clear/dissolve. |
| `group.leaderUid` | UID, not a live reference; elected by lowest UID and re-elected when missing. |

There is no `ai.groupLeader` or `ai.groupMembers` field on the actor. The group
object itself is runtime-only and is not saved. `groups.membersOf` filters
inactive actors and actors whose `ai.group` no longer points at that group.

### Food and portion claims

| State | Meaning / writer |
| --- | --- |
| `foodSource.claim` | Live actor reference on a ripe authored food source. Owned by `food.claim` / `release` / `releaseBear` / `consume` / `reset` / `restore`. |
| `portion.claim` | Live actor reference on a dropped gift portion. Owned by `foodportions.claim` / `release` / `releaseActor` / `take`. |
| `actor.carriedFood` | `{ id, kind, satiation }` after a gift is collected, before handover. Written by `gifting.collect`, cleared by `finishGift`, `cancelGift`/`dropCarried`, and app removal/drop. |
| `ai.giftOrigin` | Reservation descriptor while gifting: `{ type: 'source' | 'portion', source | portion, x, z }`. Owned by `gifting.js`. |
| `ai.source` | Generic claimed food/hive source used by forage and hive as well as gifting. `engine.releaseFood` is the generic releaser. |

`food.claim` and `portion.claim` authorize by object identity, not UID.
`ai.giftOrigin` is not initialized by `engine.attach`; it stays `undefined`
until a gift starts. The `gifting` feature gates gift fields on attach.

There is no general `ai.reservation` field. A source search finds no such
property; reservations are represented by the existing claim/gift fields above:
`foodSource.claim`, `portion.claim`, `ai.source` and `ai.giftOrigin`. There is
no generic reservation object, counter or descriptor shared across forage,
hive, conflict and gifting.

### Conflict, hive and gifting interaction state

| State | Meaning / writer |
| --- | --- |
| `ai.contestSource` | Food source under contest while approaching; written by `conflict.acquireContest`, cleared in conflict finish and some failure branches. |
| `ai.contestBear` | Live claimant reference while approaching. |
| `ai.conflictSource` | Source copied to both actors in `startConflict`; cleared in `finishConflict`. |
| `ai.conflictT` | Conflict timer on both actors. |
| `ai.conflictCooldown` | Retry cooldown after conflict. |
| `ai.giftRole` | `giver` / `receiver`; null when not gifting. |
| `ai.giftT` | Approach/handover timer. |
| `ai.giftPhase` | `collect` or `deliver`. |
| `ai.giftOrigin` | See claims above. |
| `ai.giftRetryT` | Giver retry cooldown, decremented by the engine when gifting is enabled. |
| `ai.stungT` | Hive sting feedback timer, unrelated to pairs or claims. |

`ai.conflictSource`, `ai.contestSource` and `ai.contestBear` are not cleared by
the generic `breakPair`/`cancelPair` path. `cancelPair` resets a conflict actor's
state to `wander` through its pair-state list but leaves those pointers behind
until the next conflict acquisition overwrites them.

## Writer matrix

### Pair links and visit roles

| State | Owner / primitive | File / symbol | Writes | Reciprocity / cleanup | Callers / triggers | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `ai.partner`, `ai.state`, optional duration field | Shared pair entry | `interactions.js` `beginPair` | Both actors' `state`, `partner`; clears both `familyTask`; optionally duration field; stop/face | Reciprocal; does not clear visit/playdate/conflict remnants | Social company/invite/social, conflict start, mate seek/mate, chat/cuddle, reconcile/partner, gifting | Inspected |
| `ai.partner`, `ai.state`, idle/task/social cooldowns | Shared pair exit | `interactions.js` `endPair` | Acting actor and reciprocal partner: state, partner, idle/task/social cooldowns, familyPlay, playmateKind, visit fields, familyTask | Reciprocal only when `partner.ai.partner === actor`; stops both | Social completion/decline/visit completion, mate completion, family playdate/lesson, activities, relationships, gifting | Inspected |
| `ai.partner`, visit/family flags/task | Shared forced break | `interactions.js` `breakPair` | Partner side (when reciprocal): partner, state/timers, visit fields, family flags, familyTask; acting side: partner and fields only, **not its own state** | Stops both; caller must reset the acting state | `engine.cancelPair`; legacy `behavior.js` `cancelPair` | Inspected |
| pair + paired feature states | Engine cancel wrapper | `behaviors/engine.js` `cancelPair` | Calls module `interrupt` for cancellable states, `releaseFood` on both, `breakSharedPair`, then resets pair/seek states | Clears reciprocal partner and familyTask; leaves conflict/playdate/invite timers | `onGrab`, `detach`, `setEnabled(false)`, `debugState`, forced debug pairs, directives, rest/flee | Inspected |
| `ai.state`, `partner`, invite timers | Social invitation | `behaviors/social.js` `startInvite` | Own-side `linkPartner` calls for both actors in the existing order; direct state, `inviteAccepted`, `inviteT`, `declineT`, plan/face; partner state `invite` or `decline` | Reciprocity is two calls; no `beginPair`; clears plan/path but leaves familyTask | `thinkSeekCompany`; debug `forceInvite` | Inspected |
| `ai.state`, partner, visit fields | Social visit entry | `behaviors/social.js` `startVisit` | Own-side `linkPartner` calls for both actors in the existing order; direct state, visit home/role/phase/timer/arrived, targets | Reciprocity is two calls; no `beginPair`; no `familyTask` clear | `endSocialPair` visit chance, `forceVisit` | Inspected |
| visit phase/timer/arrival | Visit state machine | `behaviors/social.js` `beginVisitHangout`, `tickVisit` | Both actors' `visitPhase`, `visitT`, `visitArrived`, targets, animation | Completion path calls `endPair`; interrupted travel path calls `finishVisitPair` | Social tick/think | Inspected |
| pair, state, conflict fields | Conflict entry/finish | `behaviors/conflict.js` `startConflict`, `finishConflict` | Entry via `beginPair`; finish directly nulls both partners, conflict/contest fields and timers | Finish clears both; transfer/refusal of the food claim is handled separately | Conflict opportunity/think | Inspected |
| pair, state, mate timer | Mate entry/exit | `behaviors/mate.js` `startSeekMate`, `startMatePair`, `thinkSeekMate`, `finishMatePair` | `beginPair` for both pairs; direct own-side nulls in thinking/finish; quirk path (`matePairOnPathFailure`) clears both | Completion uses `endPair`; quirk flag is off by default | Mate opportunity/think/tick, `forceMate` | Inspected |
| partner, familyTask | Group admission | `behaviors/groups.js` `startGroup` | Sets `partner = null` and `familyTask = null` on every member before joining | Overwrites an existing pair without stopping it; admission checks reject busy actors | `acquireGroup`, `forceGroup` | Inspected |
| partner, visit fields, timers | Glass grab cleanup | `glass.js` `stopGrabTasks` | Clears own partner/visit/timers and reciprocal partner's partner/state/visit subset | Direct, not `breakPair`; called after `shared.onGrab`, which already cancels | Glass `beginDrag` | Inspected |
| partner, familyTask, playdate/visit state | Glass actor reset | `glass.js` `resetActor` | Clears all listed own-side pair/task/playdate/visit fields | Own side only; calls `stopGrabTasks` first | `__gummy.glassReset`, debug | Inspected |
| partner, state | Glass debug cross-mate | `glass.js` `forceMateWithBear` | Sets own `partner`, state `mate`, `waitForPartner` | Does not write the bear side; cross-species helper owns that | `__gummy` debug | Sampled |
| partner, possession fields | Bear possession | `ai.js` `setPossessed` | `cancelPair` then direct `partner = null` and locomotion reset | `cancelPair` covers reciprocity | App possession entry | Inspected |
| partner, task | Actor attach | `behaviors/engine.js` `attach` | Initializes all pair/task/group/visit/playdate fields | Initialization only | First tick/attach | Inspected |
| partner | Legacy oracle | `src/behavior.js` | Parallel direct writes for the legacy `?behaviors=legacy` engine | Separate implementation; only partial parity coverage | Legacy engine selection | Sampled |

### Family task and playdate state

| State | Owner / primitive | File / symbol | Writes | Reciprocity / cleanup | Callers / triggers | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `ai.familyTask`, partner, state, target | Shared task entry | `interactions.js` `startTask` | Builds `{ id, mode, role, partnerUid, anchor, phase, t, data }`, sets state/partner/movement | Own side only; partner call is the caller's responsibility | `family.js` meals, lessons, playdates; debug/forced paths | Inspected |
| `ai.familyTask`, partner, state | Shared task cancel | `interactions.js` `cancelTask` | Clears own task and partner, state `wander`, idle | Own side only; leaves reciprocated partner and playdate mirrors | Family task fallbacks, engine recover/hangup paths | Inspected |
| task phase/timer | Shared task tick | `interactions.js` `tickTask` | Mutates `phase`, `t`; returns cancel when a pair partner/task is missing | Does not clear anything | Tests and any adapter using the primitive | Inspected |
| task phase/timer | Family state machine | `behaviors/family.js` `tick`, `startFamilyMeal`, `startLesson` | Directly sets `familyTask.phase`, `task.t`, targets | Completion routes to `finish`, which clears via `endPair` or `cancelTask` | Family opportunity/tick | Inspected |
| playdate flags/home/target | Family playdate entry | `behaviors/family.js` `startPlaydate` | Writes both actors' `playdate`, `playdateHome`, `playdateTarget`, family play/kind, then both tasks | Both sides at entry; `releaseFood` both | Playdate candidate/due playdate, `forcePlaydate` | Inspected |
| playdate flags/home/target | Family playdate completion | `behaviors/family.js` `finish` | Clears acting actor's playdate mirrors after `endPair` | **Partner mirrors are not cleared** because `endPair` does not own these fields | Family task completion | Inspected |
| playdate/task fields | Family task finish | `behaviors/family.js` `finish` | Lesson/meal clear or cancel; all branches clear own family play flags | Partner task cleared through `endPair` only on playdate/lesson success | Family tick | Inspected |
| task field | Group admission | `behaviors/groups.js` `startGroup` | Clears `familyTask` on all members | See group admission above | Group acquire | Inspected |
| task field | Glass reset | `glass.js` `resetActor` | Clears own `familyTask` and playdate mirrors | Own side | Debug reset | Inspected |

### Group activity state

| State | Owner / primitive | File / symbol | Writes | Reciprocity / cleanup | Callers / triggers | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| group object, slot, role, state, partner/task | Group entry | `behaviors/groups.js` `startGroup` | Builds group, assigns slots/roles, clears partner/task, sets state/target | All members written together; no previous-pair stop | `acquireGroup`, `forceGroup` | Inspected |
| member removal | Per-member cleanup | `behaviors/groups.js` `clearMember` | Nulls group/slot/role, state, movement, target; sets cooldown | Removes only that member's fields | `cancelGroup`, `dissolve`, `completeGroup`, stale tick | Inspected |
| member list, leader/role | Membership maintenance | `behaviors/groups.js` `membersOf`, `chooseLeader` | Filters `group.members`; rewrites `leaderUid` and `groupRole` | Prunes inactive actors; no notification to removed actors | `startGroup`, `cancelGroup`, `tickGroup`, `completeGroup` | Inspected |
| group lifecycle | Group cancel/dissolve/complete | `behaviors/groups.js` `cancelGroup`, `dissolve`, `completeGroup` | Removes member or clears all, sets `done`, clears member fields/cooldowns | Below three members dissolves without effects; completion emits once | Engine cancel/module disable, critical need, debug | Inspected |
| group cleanup on generic cancel | Engine module interrupt | `behaviors/engine.js` `cancelPair` → `groupActivitiesModule.interrupt` | Calls `cancelGroup` for `group` state | Handles reciprocal pair and food release after module cancel | Grab, detach, disable, removal | Inspected |
| group cleanup on Glass removal | App / Glass removal | `app.js` `removeGlassActor`, `glass.js` `removeActor` | No `cancelPair`/`detach` call in these functions | Group filters inactive members on the next tick; pair references may persist until the partner's next think | Stars departure (after `commitFarewell`) | Sampled |

### Claims, reservations and gift/conflict state

| State | Owner / primitive | File / symbol | Writes | Reciprocity / cleanup | Callers / triggers | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `foodSource.claim` | Food registry | `food.js` `claim`, `release`, `releaseBear`, `consume`, `reset`, `restore` | Sets/clears source claim; consume clears and depletes; restore/reset clear | Identity-based; `releaseBear` sweeps all sources | Forage, hive, conflict, gifting, app removal, save restore | Inspected |
| `portion.claim`, portion list | Portion registry | `foodportions.js` `claim`, `release`, `releaseActor`, `take`, `add`, `restore`, `reset` | Reserves, releases, removes on take, recreates from save | Identity-based; `take` removes the portion | Gifting, app removal, map/save restore | Inspected |
| `ai.source` | Engine helper | `behaviors/engine.js` `releaseFood` | Releases `ai.source` through the food registry and nulls it | Acting actor only | Cancel, grab, detach, disable, forced states, forage/hive/gifting | Inspected |
| `ai.giftOrigin`, gift phase/role/timer, carried food | Gifting lifecycle | `behaviors/gifting.js` `beginGift`, `originFor`, `collect`, `releaseOrigin`, `cancelGift`, `clearGiftActor`, `dropCarried`, `finishGift` | Reserves source/portion, transfers to `carriedFood`, releases/drops on cancel, clears both gift roles on finish | Both roles cleared on cancel/finish; source/portion claim released or converted exactly once | Gift opportunity, think/tick, `forceGift`, feature disable, detach | Inspected |
| carried food on removal | App ownership | `app.js` `dropCarriedFood`, `removeBear`, `removeGlassActor` | Drops carried portion at actor position, releases portion claims | Removal drops before deleting actor | Removal, map switch save, New Game | Inspected |
| conflict source/claim | Conflict lifecycle | `behaviors/conflict.js` `acquireContest`, `findContest`, `finishConflict`, `thinkSeekConflict` | Reads `source.claim`; transfers claim to winner; releases loser; clears conflict fields | Pair cleared both sides at finish; claim transfer is conditional on ripe source and current claim | Conflict opportunity/think/tick | Inspected |
| conflict pointers on generic cancel | Engine cancel | `engine.cancelPair` + `interactions.breakPair` | Resets conflict state to `wander` but does not clear `conflictSource`, `contestSource`, `contestBear`, `conflictT` | Claims released only through `releaseFood` for actors that had `ai.source` | Grab/detach/disable during conflict | Inspected |
| hive source/sting | Hive behavior | `behaviors/hive.js` `acquire`, `finish` | Claims hive source, stores `ai.source`, stings, releases | No pair; generic `releaseFood` covers grab/detach | Hive opportunity/think/tick | Inspected |
| persistent partnership/rivals | Relationship records | `relationships.js` `setPartnership`, `clearPartnership`, `setRival`, `clearRival`, `clearRivalUid` | Writes/deletes reciprocal UID records | Validated as reciprocal at save boundary | Partnership/reconcile completion, farewell separation, app reference cleanup | Inspected |

## Protocol boundaries

Existing shared primitives:

| Primitive | Writes | Current callers |
| --- | --- | --- |
| `linkPartner` | One actor's `ai.partner`; rejects missing actor/ai, missing partner/ai or self | `social.js` `startInvite`/`startVisit` (one call per side) |
| `beginPair` | Both state/partner, task clear, optional timer, stop/face | `social.js` (company, social, decline), `conflict.js`, `mate.js` (seek/mate), `affection.js`, `relationships.js`, `gifting.js` |
| `endPair` | Acting + reciprocal partner fields, state/timers, visit/family flags, task | `social.js` (social, decline, visit), `mate.js`, `affection.js`, `relationships.js`, `family.js` (playdate, lesson), `gifting.js` |
| `breakPair` | Reciprocal partner plus shared flags; no acting-state reset | `engine.cancelPair`, legacy `behavior.js` `cancelPair` |
| `cancelPair` (engine) | Module interrupt, food release, `breakPair`, pair/seek state reset | Grab, detach, disable, directives, rest/flee, debug/forced operations |
| `startTask` | Task object, state/partner/movement | `family.js` only in production modules; debug/forced paths |
| `cancelTask` | Acting task/partner/state/idle | `family.js`, engine stall recovery, legacy `behavior.js` |
| `tickTask` | Task phase/timer | Tests and primitive consumers; the family module currently advances its own copy of the timer |

Direct writers outside the protocol that change pair/task/group state:

- `behaviors/social.js` `startInvite`, `startVisit` use two `linkPartner` calls
  for pair entry but still write state/timers/targets directly;
  `beginVisitHangout`, `tickVisit`, `finishVisitPair` continue direct role/visit
  writes (completion uses `endPair`).
- `behaviors/family.js` task phases, playdate mirrors, meal/lesson completion.
- `behaviors/conflict.js` `finishConflict` direct pair/conflict cleanup and
  claim transfer.
- `behaviors/mate.js` `thinkSeekMate`, `finishMatePair`, and the opt-in
  path-failure branch.
- `behaviors/groups.js` all group/slot/role/member writes.
- `glass.js` `stopGrabTasks`, `resetActor`, `forceMateWithBear`.
- `ai.js` `setPossessed`.
- `app.js` removal drops carried food and releases claims; it does not write
  `ai.partner`/`ai.familyTask` directly.
- Legacy `src/behavior.js` duplicates the same state machine for
  `?behaviors=legacy` and is not the modules-engine path.

`finishVisitPair` is exported as `finishVisit` and is called by engine stall
recovery in addition to the social tick. That means an interrupted visit can be
completed/closed from outside the module.

## M2b C1 pilot: social invite/visit entry

Baseline HEAD `a05ce72`; allowed source changes were `src/interactions.js` and
`src/behaviors/social.js` plus tests/docs. `linkPartner(actor, partner)` validates
and writes only `actor.ai.partner`, returns `true`, and rejects a missing
actor/ai, missing partner/ai or self. `social.startInvite` and
`social.startVisit` call it once per side in the existing order. No state, timer,
target, path, face, emote, familyTask or eligibility write moved. This is not a
`beginPair` replacement: reciprocity remains two calls, and visit cancellation,
reward logic, visit completion and the direct writers above stay for later
separately approved steps.

C1 evidence: `tests/interaction-entry.test.mjs` covers the primitive, invite
accept/decline and profile-threshold entry, visit roles/targets/fallback and
incidental family/visit state. A file-level fixed-RNG probe matched observable
state/callback order and instrumented draw counts before and after the change.
C1 also ran the focused and full Node suites, the development short parity
matrix and a browser entry trace; these are development evidence, not long
acceptance.

## M2c C2 pilot: cancellation conformance

Baseline HEAD `e647754`, clean working tree. C2 initially added characterization
only: `tests/social-cancellation.test.mjs`, a scratch browser probe under
`.dev-shots/c2/` and this section. Correction R1 then made one approved
production change in `src/behaviors/social.js`: an interrupted visit close no
longer grants its completion reward.

`tests/social-cancellation.test.mjs` drives the real modules engine for Bear,
Gummy and Glass. Entry is the natural `social.company` opportunity, then invite,
social and (with a passing visit roll) visit. Forced entry is used only where no
natural route exists or where the transition is the subject (`forceMeal`,
`forceVisit` in the pond case). Every case uses an isolated two/three-actor field
with the mate module disabled so mate admission cannot pre-empt the social
opportunity.

Verified current behavior:

| Outcome | Result |
| --- | --- |
| Social completion | One bond draw, one relief per actor, one `social` history entry per actor; repeated ticks add nothing. Fixed-RNG and seeded traces agree. |
| Visit completion | Exact `+.08` bond and `.22` social / `.16` affection relief per actor, one `hosted`/`visit` history entry per actor; pair and visit fields clear with cooldown 8. |
| Interrupted/stall/targetless visit close | Both reciprocal partner links and visit fields clear, states return to `wander`, cooldown 8 remains; no bond, relief or completion history on either side. A repeated close is inert. |
| Decline | `decline`/`declined` history exactly once per actor; no bond, no relief; cooldowns remain positive; no duplicate history. |
| Grab (`invite`/`social`/`visit`) | Both reciprocal partner links, visit home/role/phase/arrival and task fields clear; states return to `wander`; no bond, relief or completion history; a second grab is inert. |
| Critical thirst/hunger (`invite`/`social`/`visit`) | Same pair cleanup, no reward or completion history, then `seekWater`/`drink` or `seekFood`/`eat`. |
| `setEnabled(false)` | Every actor loses partner, visit fields, task and `ai.source`; owned food claims release; a repeated disable is inert. |
| `detach` | Detaching one participant clears the reciprocal partner, visit/task state and both claims; detaching both leaves `ai = null`; a detached solo task holder loses its task and claim. |
| Save record | `snapshotActor` carries no `ai`, live `partner`, visit fields or `familyTask`; a social pair creates no `partnerUid`. |

Browser probe (seeded, public `window.__gummy` boundaries): fictional pair ->
grab; critical thirst and hunger; `setAI(false)`; save/load; field -> Studio ->
field; population-ceiling removal; New Game. The probe observed the pair cleanup
on grab/need/disable, no restored pair or visit fields after load/map return, no
stale food claim after load/map/removal/New Game, and a fresh history-less roster
after New Game. Map/save/load/New Game restore or reseed actors and the engine
can naturally start *new* pairs/tasks within the probe's observation window;
that is live activity, not restored runtime state, so the probe asserts the old
pair/visit fields and histories rather than requiring an empty global partner
set.

Discovered behavior and open questions:

- **Finding C2-F1 (pond + interrupted visit reward) — resolved in R1.** Pond
  entry in `ai.js` still does not call `cancelPair`, so a visit pair and its
  visit fields survive entry. On exit, `resumeTask` clears `ai.target`; the next
  `tickVisit` treats the targetless travel as interrupted and calls
  `finishVisitPair(false)`. That path now clears the pair, visit fields and task
  state with the existing cooldown, but grants no bond, no relief and no
  `hosted`/`visit` history. Visit completion (`completed=true`) keeps the exact
  `+.08` bond, `.22`/`.16` relief and history behavior.
- **Finding C2-F2 (pond + social).** A social pair survives pond entry and
  resumes counting down after exit; no pond-specific social cleanup exists.
- **Finding C2-F3 (timers).** Generic `breakPair` clears pair/visit/state but
  not `visitT`, `inviteT`, `socialT`, `declineT` or `visitRetryT`. Entry paths
  overwrite the relevant timers, so no stale link or read was observed; this is
  a residual timer observation, not a reproducer.
- **Finding C2-F4 (Glass removal).** `removeGlassActor` still does not call
  `detach`/`cancelPair`. The stars path commits a farewell first. There is no
  public single-Glass-removal hook, so this probe exercised only map switch and
  New Game colony clearing; direct Glass removal remains source-inspected.
- **Finding C2-F5 (browser variability).** Load/map return/New Game allow
  immediate natural pair or family-task selection. Browser assertions must
  inspect histories, visit fields, claims and removed identities rather than
  assuming a globally empty partner/family-task set after an arbitrary wait.

C2 evidence is development characterization, not long acceptance. The initial
focused suite, full Node suite, behavior contracts, short all-race parity, smoke
check and probe result, plus the R1 focused/full/contracts/parity reruns, are
recorded in `.dev-shots/c2/results.md` (scratch).


## Lifecycle outcomes

| Outcome | Partner / familyTask / group / claims | Evidence |
| --- | --- | --- |
| Completion | Social/visit/mate/conflict/gift use `endPair` or explicit cleanup. Family playdate and lesson use `endPair`; meal uses `cancelTask`. Group completion clears every member. Conflict transfers or releases the food claim. Gifting consumes the carried portion once. Playdate mirrors remain set on the non-finishing partner. | Inspected; modules tests cover social/visit, playdate, group, gift, conflict completion (see coverage map). |
| Refusal / decline | Social decline uses `startDeclinePair` (`beginPair` + `declineT`) then `endPair`; bonds are unchanged. Gifting refuses by cancelling and dropping/releasing the reservation. Conflict rejects an unhealthy claimant in `findContest` with `coverConflictOutcome('healthFloor')`. There is no generic refusal primitive. | Inspected; tested for social decline, gift refusal, conflict health floor. |
| Grab | App `makeGrab` calls `ai.onGrab`; Glass `beginDrag` calls `shared.onGrab` and then `stopGrabTasks`. Engine `cancelPair` runs module interrupts (gift/chat/cuddle/reconcile/partner/group), releases food, breaks reciprocal links and resets pair states. `ai.onGrab` also clears social timers. | Inspected; tested for a shared social pair (legacy and modules chooser), gifting, group detach. |
| Throw | Same grab-time cancellation as grab; `endGrab` changes physics only and does not re-pair. A thrown actor resumes normal decisions after grounding. | Inspected for grab path; throw-specific pair cleanup is unverified. |
| Pond entry | `ai.js` marks `interrupted`, releases food and ticks needs only while `inPond`; it does **not** call `cancelPair`. Partner-side checks such as `social.thinkSeekCompany` may cancel later, but gifting/conflict/mate do not receive a pond-specific cancellation. New pairs are blocked because `actorAvailable` rejects `inPond`. | Inspected; no test found for pair state during pond entry. |
| AI disable | `engine.setEnabled(false)` calls `cancelPair` and `releaseFood` for every actor, then stops locomotion. `ai.js` additionally clears invite/social/decline/conflict/mate timers and shove for bears. Module cancellable states are interrupted; conflict pointers and playdate mirrors are not specifically cleared. | Inspected; disable is used in a preferences interruption test, but pair/claim cleanup is not asserted there. |
| Actor removal (Bear) | `app.removeBear` drops carried food, releases portion/food claims, calls `ai.detach` (which runs `cancelPair`), nulls `ai`, then clears persistent refs unless `preserveRefs`. Group membership is cancelled through the engine interrupt. | Inspected; group detach and gifting detach are tested with `engine.detach`. |
| Actor removal (Glass) | `app.removeGlassActor` drops carried food, releases claims, removes the colony actor and clears persistent UID refs. It does **not** call `cancelPair`/`detach`. The stars path commits a farewell first, and `commitFarewell` ends partnership and cancels the pair. Other callers of Glass removal do not get that guarantee. | Sampled; no direct test of live pair cleanup for this removal function. |
| Map switch / despawn | `requestMapSwitch` saves with `dropCarried: true`, then `activateMap` releases grabs, `despawnAll` removes every Bear (each `detach` cancels pairs/claims), and `glassColony.clear()` disposes Glass actors. Inactive-map snapshots keep only persistent records. | Inspected; no dedicated map-switch test. |
| Save / load restore | Actor records exclude `ai` and all runtime pair/task/group/visit/conflict fields. `partnerUid`, `rivals`, `playdates` and `carriedFood` are persisted; carried food is converted to a dropped portion on load. Loading despawns the live roster before activating the saved map. | Inspected; save/relationship tests cover records and reciprocity, not live interaction cleanup. |
| New Game / reset | `resetNewGame` despawns all actors, clears Glass, resets food and portions, drops both world snapshots and resets UID allocation. Runtime pair/task/group state disappears with the actors. | Inspected; no test found. |

## Outcome and reason vocabulary

The labels below are inventory terms for this document, not runtime enum values.
There is no shared pair-lifecycle `outcome` or `reason` field. `ai.activityDecision`
does carry a latest-only selection `outcome` (`started`/`refused`/`no-eligible`)
and proposal reasons, but it describes activity selection, not pair completion or
interruption, and is not saved. The only persisted interaction event record is
`actor.history`, which stores `kind`, `uid`, `day`, `hour` and optional bond
deltas; departure `cause`/`reason` and stall `recoveryLog` data are runtime-only.
The module `interrupt(ctx, reason)` hook receives `cancel` for generic pair
cancellation and `no-progress` for stall recovery, not distinct grab, pond,
disable or critical-need reasons.

| Label | Trigger(s) | Owner / source | Cleared state and claims | Reason/history persisted | Evidence |
| --- | --- | --- | --- | --- | --- |
| `completed` | Module timer, task or counter reaches its end: social, visit, mate, chat/cuddle, reconcile/partner, gift handover, conflict resolution, group completion, family task or hive raid. | `social.endSocialPair`, `finishVisitPair(true)`, `mate.finishMatePair`, `affection.finishActivity`, `relationships.finishReconcile`/`finishPartnership`, `gifting.finishGift`, `conflict.finishConflict`, `groups.completeGroup`, `family.finish`, `hive.finish`. | Per family: `endPair`/`cancelTask` clears pair/task/visit fields; gift roles and carried food; conflict pointers with claim transfer or release; group member fields; hive `ai.source`. | `actor.history` stores the completion kind when `interactionHistory` is enabled (`social`, `visit`/`hosted`, `mated`, `chat`/`cuddle`, `partnered`/`reconcile`, `gift`/`receivedGift`, `conflict`, group kind, `playdate`/`taught`/`lesson`/`meal`). No outcome or reason string is stored. | Inspected. |
| `refused` | Social invite rejected; gift offer cannot start or is declined/cancelled; conflict candidate is skipped at the health floor; pairing/reconcile preconditions fail. | `social.startDeclinePair`/`finishDeclinePair`, `gifting.cancelGift`, `conflict.findContest`, `relationships.cancellation`, `affection.cancelActivity`. | Social decline ends through `endPair`; gift cancellation releases the origin, drops carried food, clears roles/retry and `endPair`; conflict health-floor skip changes no state or claim; relationship/affection cancellation ends the pair and timers. | Social decline persists `decline`/`declined` when `interactionHistory` is enabled; gift, conflict and relationship refusals persist no interaction history. Conflict health-floor is a runtime coverage counter only. | Inspected. |
| `interrupted-grab` | App pointer/debug grab, or Glass `beginDrag`. | App `makeGrab` -> `ai.onGrab` -> engine `onGrab`; Glass `beginDrag` -> `shared.onGrab` + `stopGrabTasks`. | `cancelPair` runs module interrupts (gift/chat/cuddle/reconcile/partner/group), releases food on both sides, breaks reciprocal pair/task/visit fields and resets pair state; sets `ai.interrupted`; adapter clears social/invite/decline/conflict/mate timers. Glass `stopGrabTasks` additionally clears its own and reciprocal pair subset. Conflict pointers, playdate mirrors and social/mate-specific fields are not cleared. | None. | Inspected. |
| `interrupted-throw` | Throw release after a grab. | App `endGrab(g, true)`; Glass `endDrag(a, true)`. | No additional interaction cleanup: grab-time cancellation already ran. The app and Glass throw branches change physics/velocity only. | None. | Inspected for the throw branch; throw-specific residual cleanup is unverified. |
| `interrupted-pond` | Bear enters the pond. | `ai.js` `update`. | Sets `ai.interrupted`, stops hop/movement and calls `releaseFood(b)`. It does **not** call `cancelPair`, so partner, `familyTask`, visit, playdate, group and conflict fields remain. Exiting the pond calls `resumeTask`. | None. | Inspected; no dedicated test found. |
| `interrupted-disable` | `setEnabled(false)` for the AI. | Engine `setEnabled` plus `ai.setEnabled`. | `cancelPair` for every actor (module interrupts, both-side food release, reciprocal pair/task clear, state reset), then `releaseFood`, movement/target reset; the bear adapter also clears invite/social/decline/conflict/mate timers, follow/shove and sleeping. It does not set `ai.interrupted`; playdate mirrors and conflict pointers are not specifically cleared. | None. | Inspected. |
| `interrupted-critical-need` | Thirst or hunger reaches its critical threshold while the actor is in the engine's optional-state list. | Engine tick. | `cancelPair`, then acquire water, food or a contest. Pair/task/claim handling is the same as generic cancellation. Conflict and `seekConflict` are not in the critical-need state list. | None. | Inspected. |
| `interrupted-stall` | No-progress recovery. | Engine `recoverStall`. | Chat/cuddle/reconcile/partner/group/gift states call `interruptActor(actor, 'no-progress')` and end through the module interrupt; visit calls `finishVisitPair(false)`; `familyTask` calls own-side `cancelTask`; food/hive/conflict recovery releases the source and clears contest pointers. | None. | Inspected. |
| `removed-ceiling` | Population ceiling trim. | App `removeBear(..., { departure: 'removed' })`. | Captures a departure snapshot, drops carried food, releases portion claims, `ai.detach` (release food and `cancelPair`), `food.releaseBear`, nulls `ai`, clears persistent references unless `preserveRefs`, and ends any active grab. | Departure `cause: 'removed'` is runtime-only; no actor history entry. | Inspected. |
| `removed-stars` | Stars farewell commits for `oldAge`, `starvation` or `sting`, then the fade completes. | `stars.start`/`onFarewell` -> app `startFarewell`/`commitFarewell` -> `removeBear` or `removeGlassActor`. | `commitFarewell` ends a partnership as `departed`, calls `cancelPair`, releases food and resets movement. Final removal drops carried food, releases portion/food claims, detaches (Bear) or disposes (Glass), and clears persistent references. `removeGlassActor` does not detach behavior itself. | Departure `cause: 'stars'` and the star reason are runtime-only. A `separated` history entry is persisted if a partnership existed; the star reason is not written to actor history. | Inspected for Bear; Sampled for Glass. |
| `despawn-map-switch` | `requestMapSwitch`, after saving the current world. | App `saveCurrentWorld({ dropCarried: true })` -> `activateMap`. | Save drops carried food for live actors. `activateMap` releases grabs, `despawnAll` removes Bears through `removeBear(..., { preserveRefs: true })` (detach/`cancelPair`/claim release), and `glassColony.clear()` disposes Glass. Persistent cross-map references are preserved. | Saved world snapshot only; no departure record and no interaction reason. Glass claim cleanup through `clear()` is unverified. | Inspected; no dedicated test. |
| `despawn-save-load` | `applySavePayload` activates the saved map. | App `applySavePayload` -> `activateMap`. | Portions are restored first; `activateMap` despawns live Bears and clears Glass as above; food is restored afterwards and carried food becomes a dropped portion. Persistent references are pruned and preserved across maps. | Save payload only; no departure record and no interaction reason. | Inspected; no dedicated test. |
| `reset-new-game` | `resetNewGame`. | App `resetNewGame`. | `despawnAll`, `glassColony.clear()`, food/portion reset, world snapshots set to `null`, UID allocation reset and stored world key removed. | None. | Inspected; no test found. |

`removed-manual` is not a supported label: no user-facing single-actor removal
function was found, and `__gummy.clear()` is a full despawn. The only `removed`
departure cause is population-ceiling trimming. A pair-admission rejection
(`pairAvailable`/busy/health checks) returns `false` before writes, so it also
has no reason record.

## Existing coverage map

| Area / outcome | Existing case | Engine / scope |
| --- | --- | --- |
| Pair/task primitives | `tests/behavior.test.mjs` "interaction primitives create and clear shared pair/task state" | Direct `interactions.js`; legacy harness |
| Social acceptance thresholds | `tests/behavior-social.test.mjs` "quirk 25: acceptance uses the partner profile thresholds, per race" | Social module isolation |
| Visit completion values | `tests/behavior-social.test.mjs` "quirk 26: visit completion keeps the hardcoded bond/relief values, per race" | Social module isolation |
| Visit home/roles/targets | `tests/behavior-social.test.mjs` "quirk 27: a visit uses the initiator home for host and guest, per race" | Social module isolation |
| Social completion and decline | `tests/behavior-chooser.test.mjs` "chooser-started social can be refused without side effects" and the preceding chooser completion test | Modules engine |
| Grab cancellation | `tests/behavior.test.mjs` "grab cancels a shared pair and leaves both actors idle"; `tests/behavior-chooser.test.mjs` "interrupting a chooser-started pairing cleans both sides without reward" | Legacy and modules |
| Visit interruption by critical thirst | `tests/behavior.test.mjs` "critical thirst interrupts a visit and releases both participants" | Legacy engine |
| Playdate completion | `tests/behavior-family.test.mjs` "playdate completion grants .18 bond and history"; `tests/behavior.test.mjs` "playdate sets a paired task, raises the bond and schedules the next day" | Family module and legacy |
| Family module write discipline | `tests/behavior-family.test.mjs` "family module does not write partner/familyTask directly" | Source-text assertion for `behaviors/family.js` |
| Conflict resolution | `tests/behavior-conflict.test.mjs` tie/order cases; `tests/behavior-world-resources.test.mjs` "conflict finish skips registry writes and still cleans up with a null provider" | Modules and module isolation |
| Gifting completion/refusal | `tests/gifting.test.mjs` accepted gift, hungry-receiver refusal, daily cap, critical thirst, unreachable timeout, two-giver reservation | Modules engine |
| Gifting interruption/removal/disable | `tests/gifting.test.mjs` detaching a giver, carried-gift interruption, recipient refusal after collection, disabling while carrying | Modules engine |
| Group completion/removal | `tests/relationship-features.test.mjs` group completion, exact-once effects, critical-thirst member removal, detach/map-switch proxy; `tests/behavior-navigation.test.mjs` group slot paths | Modules engine |
| Partnership and save reciprocity | `tests/relationship-features.test.mjs` partnership and farewell separation; `tests/relationship-save.test.mjs` v8 records, reciprocity and cross-map pruning | Modules/save |
| Interaction history | `tests/interaction-history.test.mjs` completion/decline/conflict/visit recording and interruption omission | Modules engine |
| Pond pair state | No dedicated case found | Gap |
| Map switch and New Game live cleanup | No dedicated case found | Gap |
| Save/load live pair/task cleanup | No case; saved records are covered, runtime `ai` is excluded | Gap |
| Actor removal via Glass `removeGlassActor` | No direct case | Gap |
| Playdate partner mirrors after interruption/completion | No case | Gap |
| Conflict pointers after generic cancel | No case | Gap |
| Direct-write coverage outside `behaviors/family.js` | No equivalent source assertion for social/conflict/mate/groups/glass | Gap |
| Pair-entry own-side link | `tests/interaction-entry.test.mjs` primitive one-side writes/rejections; invite/visit entry order, RNG and incidental state | Modules source and social module isolation |

## Candidate interaction families for M2b

These are candidates for a later, separately approved pilot. They are not
ranked, selected or recommended here, and none implies a central registry or
broad rewrite.

| Candidate | Why it is bounded | Risk notes |
| --- | --- | --- |
| Social invite/visit pair family | Pair creation is mostly local to `social.js`; completion already uses `endPair`; existing module tests cover acceptance, decline, visit roles and completion. | `startInvite`/`startVisit` bypass `beginPair`; visit completion has an external stall-recovery caller; partner mirror/visit timer cleanup is uneven. Selected for the C1 pilot under a narrow entry-only brief; no cancellation/reward cleanup moved. |
| Gifting claim/reservation family | Reservations, drops, carried state and feature-disable cleanup already sit behind `gifting.js`; the strongest existing interruption/removal test coverage is here. | Source and portion claims are separate registries; cancel behavior differs between source, collected and dropped portions; app removal also releases claims. |
| Group membership family | Group state is a single shared object with per-member fields and an existing module `interrupt`; below-three dissolution is explicit. | Live `members` array and leader UID must stay consistent across removal; Glass removal does not call `detach`, so membership cleanup relies on lazy filtering. |
| Family playdate/task mirrors | Task construction and most clearing already live in `interactions.js`/`family.js`; playdate completion is test-covered. | Partner-side playdate mirrors are not cleared by `endPair`; meals are solo tasks with a different cleanup path; lesson and playdate share the same `familyTask` shape. |
| Conflict pair and claimed source | Pair entry is shared and the conflict module owns a clear finish path with claim transfer. | Generic `cancelPair` does not clear conflict pointers; claim ownership can outlive an interrupted conflict; conflict is solo-claim plus pair interaction, not a simple pair family. |

## Open questions and unverified areas

- Whether every pair entry path should require a reciprocal write is unresolved;
  `startTask`, `startInvite`/`startVisit` and several recovery branches currently
  write directly.
- `cancelTask` is own-side only. Pair-task callers compensate by starting both
  sides and finishing through `endPair`, but a partial start failure was not
  exercised.
- The pond interruption path does not invoke `cancelPair`. Partner-side checks
  may eventually clear a social pair, but conflict/mate/gifting behavior was not
  traced through a full pond cycle.
- Glass removal (`removeGlassActor`) does not detach behavior. The stars path
  calls `commitFarewell` first, so the inspected production caller is covered by
  that preceding cleanup; other removal callers are unverified.
- Save/load intentionally drops runtime interaction state. Whether any UI or
  debug reader expects a restored `playdate`/`visit` mirror after load was not
  found in this pass.
- Legacy `src/behavior.js` remains a second implementation of these writers when
  `?behaviors=legacy` is selected. Parity tests sample it but this inventory does
  not enumerate every legacy branch.
