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
| `ai.familyTask`, partner, state | Shared task cancel | `interactions.js` `cancelTask` | Acting task/partner cleared, state `wander`, idle, stop; a reciprocal same-task partner is cleared the same way and stopped | Pair tasks clear both reciprocal participants plus family mirrors on each cleared side; solo tasks and non-reciprocal/different-task partners remain own-side; repeated calls are inert | Family task fallbacks, engine recover/hangup paths | Inspected; N2 tests and probe |
| task phase/timer | Shared task tick | `interactions.js` `tickTask` | Mutates `phase`, `t`; returns cancel when a pair partner/task is missing | Does not clear anything | Tests and any adapter using the primitive | Inspected |
| task phase/timer | Family state machine | `behaviors/family.js` `tick`, `startFamilyMeal`, `startLesson` | Directly sets `familyTask.phase`, `task.t`, targets | Completion routes to `finish`, which clears via `endPair` or `cancelTask` | Family opportunity/tick | Inspected |
| playdate flags/home/target | Family playdate entry | `behaviors/family.js` `startPlaydate` | Writes both actors' `playdate`, `playdateHome`, `playdateTarget`, family play/kind, then both tasks | Both sides at entry; `releaseFood` both | Playdate candidate/due playdate, `forcePlaydate` | Inspected |
| playdate flags/home/target | Family playdate completion | `behaviors/family.js` `finish` | Clears acting actor's playdate mirrors after `endPair` | **Partner mirrors are not cleared on completion** because `endPair` does not own these fields; cancellation through `cancelTask` clears both sides' mirrors | Family task completion | Inspected; N2 cancellation tests |
| playdate/task fields | Family task finish | `behaviors/family.js` `finish` | Lesson/meal clear or cancel; all branches clear own family play flags | Partner task cleared through `endPair` only on playdate/lesson success; pair-task cancellation clears both sides through `cancelTask` | Family tick | Inspected; N2 tests |
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
| group cleanup on Glass removal | App / Glass removal | `app.js` `removeGlassActor`, `actorremove.js` `removeGlassActor`, `glass.js` `removeActor` | Successful colony removal calls `ai.detach` before reference clearing; `glass.js` still disposes the actor | `detach` runs `cancelPair` (including group interrupt) and releases food on both sides | Stars departure (after `commitFarewell`); refused/absent colony removal does not detach | Inspected and tested |

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
| `cancelTask` | Acting task/partner/state/idle; for pair tasks, reciprocal partner and family mirrors on both cleared sides | `family.js`, engine stall recovery, legacy `behavior.js` |
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
- **Finding C2-F4 (Glass removal) — resolved by C04.** At C2 inspection
  `removeGlassActor` did not call `detach`/`cancelPair`; the stars path commits a
  farewell first and no public single-Glass-removal hook existed. C04 now calls
  portable `onDetach` only after a successful colony removal, and the app passes
  `ai.detach`; the stars farewell and disposal order are unchanged.
- **Finding C2-F5 (browser variability).** Load/map return/New Game allow
  immediate natural pair or family-task selection. Browser assertions must
  inspect histories, visit fields, claims and removed identities rather than
  assuming a globally empty partner/family-task set after an arbitrary wait.

C2 evidence is development characterization, not long acceptance. The initial
focused suite, full Node suite, behavior contracts, short all-race parity, smoke
check and probe result, plus the R1 focused/full/contracts/parity reruns, are
recorded in `.dev-shots/c2/results.md` (scratch).

## M2d C3 representative extension proof

Baseline HEAD `c9f8092`, clean working tree. This pass is test-only: it adds no
production source, activity, module, state, opportunity, dispatcher, registry,
save field, config flag or UI. The proof is `tests/activity-extension.test.mjs`,
which registers one disposable pair definition (`c3RepresentativeVisit`, roles
`host`/`guest`, duration `2`, `arriveDist` `1.2`) through the existing
`interactions.js` map and drives a file-local activity with only
`startTask`/`tickTask`/`cancelTask`/`endPair`. Interruption uses the exported
modules engine's `cancelPair`, `detach` and `setEnabled(false)`; no test-only
cancellation path was added. This is a fixture id for this test file, not a
shipped interaction or a general extension API.

Coverage ledger:

| Criterion | New C3 evidence | Existing C2 / earlier evidence |
| --- | --- | --- |
| Registration resolves the exact definition; duplicate id is rejected | `fixture registration resolves the exact definition and rejects duplicate ids` asserts the frozen normalized definition, one registry entry and the duplicate error without replacing the original | Shipped definitions were inspected in M2a; no C2 case registered a new id |
| Two actors enter with host/guest roles, `partnerUid`, anchor and target | `representative activity enters with host/guest roles, partnerUid and anchor target` checks both task records, reciprocal live partners, role strings, `partnerUid`, anchor copy and target | `tests/interaction-entry.test.mjs` covers shipped invite/visit entry; `tests/behavior.test.mjs` covers primitive pair/task state |
| Travel -> act -> done through `tickTask`, exactly-once completion | `travel -> act -> done runs through tickTask and completes exactly once` drives travel, arrival, act and terminal tick, then repeats the terminal tick with no extra completion | `tests/behavior.test.mjs` primitive tick; C2 social/visit completion tests use real modules |
| Reciprocal live cleanup through `endPair`, no stale partner/task | The completion case asserts both partners, both tasks, states and `ai.source`; `endPair` is the only cleanup on completion | C2 completion and decline cover shipped `endPair` paths |
| Interruption via `cancelPair`/`cancelTask`/detach/disable, no stale links/claims | `engine.cancelPair interrupts both sides...`, `cancelTask clears both reciprocal participants...` and `engine.detach and setEnabled(false) clear...`; the cancelTask case asserts both sides and the repeated-cancel inert path | C2 `tests/social-cancellation.test.mjs` covers grab, needs, disable, detach, pond and save records on shipped social/visit pairs |
| Save record excludes runtime task/pair state | `save records exclude runtime task and pair state` checks the snapshot omits `ai`, task, partner, persistent `partnerUid`, visit/group fields, target/anchor and the runtime fixture id/label | C2 save-record cases cover shipped social/visit runtime state and `partnerUid` exclusion |
| No unrelated owner writes | Only the new test, this section, the small `src/behaviors/README.md` proof note and `.dev-shots/c3/` scratch evidence changed | C2 source/test delta remains the prior step |

The fixture activity is claim-free and uses no group slots. Claim release and
group membership cleanup are not re-proven here; they remain covered by the
existing gifting/group tests and C2 interruption evidence.

Explicit unverified / not applicable in C3:

- Browser host, save/load restore, map switch and New Game are **not rerun**.
  The proof changes no runtime wiring and the fixture is never shipped or saved,
  so C2's browser evidence remains the runtime basis. A browser pass of this
  fixture would require a new runtime hook, which was not approved.
- The fixture cannot appear in the host roster, on a map transition or after
  New Game, so those cases are not applicable to the fixture itself. The general
  host/map/New Game cleanup gaps recorded in the C2 section are unchanged.
- No long parity or performance claim is made; the source wiring is unchanged.

C3 commands and results are recorded in `.dev-shots/c3/results.md` (scratch).


## M2 closeout C11: pond lifetime, residual timers and remaining families

Baseline HEAD `4c17b58`, clean working tree. This pass is investigation and
documentation only: no `src/`, `tests/`, `scripts/` or runtime behavior changed.
It uses the existing modules engine and the Bear adapter (`createBearAI`) in
scratch Node probes under `.dev-shots/c11/`. Forced fixtures (`forceSocial`,
`forceVisit`, `forceMate`, `forceGift`, `forceGroup`, `forcePlaydate`,
`forceMeal`, `forceConflict`) are labelled because natural eligibility would
require long simulated travel; the probes drive the real state machines, not a
test-only cleanup path.

### Pond entry/exit matrix

`ai.js` sets `ai.interrupted`, stops hop/movement and calls `releaseFood(b)` on
entry, then calls `shared.tick(b, dt, { ready: false })`. Because the engine's
`tick` returns before module state ticks when `ready` is false, every pair/task
state machine is **frozen**, not cancelled, while `inPond` is true. On exit the
adapter calls `resumeTask(b)`, which clears `ai.target` and lets module ticks
resume. Observed behavior:

| Family (fixture) | Entry | While in pond | Exit | Completion reward/history after interruption |
| --- | --- | --- | --- | --- |
| social (`forceSocial`) | no cleanup; partner/`socialT` survive | frozen | resumes; `socialT` counts down | **Yes**: +bond and one `social` history entry per actor after exit. |
| visit (`forceVisit`) | no cleanup; visit fields/partner survive | frozen | next `tickVisit` sees the cleared target and calls `finishVisitPair(false)` | **No**: pair/visit fields clear, state `wander`, no bond/relief/history. `visitT` is left at the last increment (`.2`) because `endPair` does not clear timers. |
| mate (`forceMate`) | no cleanup; `mateT` survives | frozen | resumes; `mateT` counts down | **Yes**: pregnancy kickoff, +.12 bond and one `mated` history entry per actor after exit. |
| gifting, collect phase (`forceGift`, recipient hunger raised) | `releaseFood` drops `ai.source` claim but leaves `giftOrigin`, `giftRole`/`giftPhase` and the receiver role set | frozen | `thinkGift` sees the origin source is no longer claimed and calls `cancelGift` | **No**: both gift roles, origin/claim and state clear; no bond/history. |
| gifting, carried delivery (`giftPhase: 'deliver'`) | no cleanup; `carriedFood`, both gift roles and partner survive | frozen | adjacent recipient: `thinkGift` moves straight to `gift`; otherwise travel resumes | **Yes** in the adjacent fixture: handover after exit granted +.04 bond and `gift`/`receivedGift` history; the carried portion was consumed (no dropped portion). This is a real reward-after-interruption path even though the collect phase cancels. |
| group (`forceGroup`, three actors) | no cleanup; shared group/slots survive | leader frozen; other members tick | resumes travel | Completion after a forced `act` phase granted .01 bond and group history per pair. **Leader in pond:** the leader's tick is frozen, so `group.t` never decrements; the whole group stayed in `travel` with `done:false` after 8 s (indefinite hold). **Non-leader in pond:** the leader ticks, arrival cannot succeed, and the join timeout dissolves the group at 5 s; all members return to `wander` with no bond/history. |
| family playdate (`forcePlaydate`) | no cleanup; `familyTask`/partner/playdate mirrors survive | frozen | resumes | forced `act` completion after exit granted .18 bond, playdate relief and `playdate` history per actor. |
| family meal (`forceMeal`) | no cleanup; solo task survives | frozen | resumes | completion after exit granted `-.28` hunger, meal history and the companion `.05` bond. |
| conflict (`forceConflict`) | no cleanup; partner/`conflictSource`/`conflictT` survive | frozen | resumes; `conflictT` counts down | **Yes**: conflict completion after exit wrote one `conflict` history entry per actor (bond clamped at 0 with the null source). |
| directives | applying a directive first calls `cancelPair` when the actor is paired/tasked, so it is not a pond writer | directive TTL still decreases because `preTick` runs before the `ready` gate | normal directive check | Not a pair/claim lifetime; no pond-specific directive cleanup was added. |
| Glass | Glass has no `inPond` branch in the shared adapter; its cleanup remains `stopGrabTasks`/`resetActor` | n/a | n/a | Not applicable to the Bear pond path. |

Save-record probe: after pond entry during a visit, `snapshotActor` still omits
`ai`, `partner`, visit fields and `familyTask`; pond state is runtime-only.

**Partner-in-pond asymmetry.** `inPond` freezes only that actor's own tick; the
other pair member keeps ticking. With the *partner* in the pond and the
initiator grounded, social, mate and conflict all completed normally after the
initiator's timer elapsed, granting bond/relief/history (and pregnancy for mate)
to **both** actors, including the pond actor. Group is the exception where the
leader's own freeze blocks the shared timer. So a pond interruption can be
one-sided: the actor in the water can still be credited with a completion it did
not act in.

### U-005 residual timers

`breakPair` clears partner, state (for the reciprocal side), visit flags and
`familyTask`, but not `visitT`, `visitRetryT`, `inviteT`, `socialT`, `declineT`,
`mateT`, `conflictT` or `giftT`. `engine.cancelPair` additionally resets the
acting state to `wander` for pair states and resets its timer fields only through
the module `interrupt` hooks (gift/chat/cuddle/reconcile/partner/group); social,
visit, mate and conflict have no interrupt and therefore keep their timers.
`ai.js` grab/disable paths clear several of these timers directly, but generic
`cancelPair` alone does not.

Probe result: a visit with `visitT = 7` survived `engine.cancelPair` as
`state: wander`, `partner: null`, `visitHome/visitPhase: null`, `visitT: 7`. A
fresh `forceVisit` reset `visitT` to `0`. Twenty adapter ticks in the reset state
did not re-enter any social/visit/mate/conflict state. Every read found in
`src/behaviors/social.js`, `mate.js`, `conflict.js`, `gifting.js` and
`engine.js` is guarded by the matching state (`inviteT` only in `invite`,
`socialT` only in `social`, `declineT` only in `decline`, `visitT` only in
`visit`, etc.), and `visitRetryT` has no reader at all. **No stale timer read was
reproduced.** The residue is inert and overwritten by the next entry to the same
family. No timer-cleanup change is recommended.

### U-007 remaining interaction families

Direct pair/task/claim writers beyond the social pilot, with their cleanup path
and the C11 evidence:

| Family / writer | Owner | Cleanup path | Evidence |
| --- | --- | --- | --- |
| social invite/visit entry and visit tick | `behaviors/social.js` | `endPair` on completion/decline; `finishVisitPair(false)` on interruption; `breakPair` on generic cancel | C2 tests + C11 matrix |
| mate seek/pair | `behaviors/mate.js` | `beginPair` entry; `endPair` on completion; own-side nulls in `thinkSeekMate`/missing-partner branch | C11 matrix; existing mate tests |
| conflict seek/pair/claim | `behaviors/conflict.js` | `beginPair` entry; `finishConflict` direct both-side clear and claim transfer; generic cancel leaves `conflictSource`/`contestSource`/`contestBear`/`conflictT` | C11 matrix; source inspection |
| gifting reserve/carry/handover | `behaviors/gifting.js` | `beginPair`; `cancelGift` release/drop and both roles; `finishGift` clears both roles; module `interrupt` | C11 matrix; existing gifting tests |
| group admission/lifecycle | `behaviors/groups.js` | `startGroup` clears partner/task on all members; `cancelGroup`/`dissolve`/`completeGroup` clear member fields; module `interrupt` | C11 matrix; existing group tests |
| family meal/lesson/playdate | `behaviors/family.js` + `interactions.js` | `startTask`/`cancelTask`/`endPair`; pair cancellation clears both reciprocal participants and their family mirrors; playdate mirrors on completion are cleared only on the finishing actor; meals remain solo/own-side | C11 matrix; N2 tests and probe; existing family tests |
| directives | `behaviors/directives.js` | `applyDirective` calls `cancelPair` before replacing an existing pair/task; `cancel`/`releaseToNormal` clear own directive state | Source inspection |
| Glass grab/reset/debug pair | `glass.js` | `stopGrabTasks` own+reciprocal subset; `resetActor` own side; `forceMateWithBear` debug only | Source inspection |
| possession/removal/disable | `ai.js`, `app.js`, engine | `setPossessed`/`detach`/`setEnabled` call `cancelPair` + `releaseFood` | Source inspection; existing removal tests |

**Legacy visit relief (U-025, resolved N7):** legacy `finishVisitPair(actor, completed = false)`
now matches the module path: `.22` social/`.16` affection relief and `.08`
bond are granted only when the visit completes (`completed=true` from the legacy
hangout timer branch). Interrupted, targetless, day/timer/home/target/replan and
stall closes grant no reward while still setting `socialCooldown=8` and closing
the pair through `endPair`. The module path keeps `finishVisitPair(ctx, false)`
on interruption (C2-F1). This is no longer a legacy/module divergence: the exact
seeded browser trace passes at 180, 300 and 600 steps (`scripts/behavior-browser-parity.mjs`,
seed `1234`, `.dev-shots/n7/`), and U-025 is resolved for this bounded alignment.

**Resolved bounded candidate: family pair-task cancellation symmetry (N2).**
`cancelTask` now cancels both reciprocal participants for pair tasks. It captures
the acting task and partner first, treats a task as pair mode when the task says
`mode: 'pair'` or the registry definition does, and requires a reciprocal partner
(`partner.ai.partner === actor`) running the same task id. The acting side is
always cleared (`familyTask`, `partner`, state `wander`, idle `.5`, `stop`); a
shared partner is cleared the same way and stopped. Pair tasks also clear
`familyPlay`, `playmateKind`, `playdate`, `playdateHome` and `playdateTarget` on
each cleared side. Solo tasks (family meal) and non-reciprocal or different-task
partners remain own-side, and a repeated cancel is inert. No bond, relief or
history is written by cancellation, so the previous survivor-completion defect
(scratch probe `.dev-shots/c11/family-cancel-asymmetry.mjs`) can no longer grant
`.18` bond, relief and `playdate` history to a cancelled actor. Reachable
triggers include the `family.js` tick path failure and the engine stall
recovery; both now clear both sides. Evidence: `tests/activity-extension.test.mjs`
(pair, solo, non-reciprocal, repeated), `tests/behavior-family.test.mjs`
(reciprocal playdate cancellation and real-modules stall path), and the post-fix
probe `.dev-shots/n2/family-cancel.mjs`. U-007 is resolved for this bounded
family task; broader M2 sampling of the other families remains outside this
change, and no central registry was added: each family keeps its primitive.

### U-004 recommendation (implemented in C11a)

At the C11 investigation baseline the behavior was inconsistent: grab, critical
need, disable and detach cancelled a pair, while pond entry froze only the pond
actor's tick and exit resumed it. The C11 matrix above documents that resumed
path granting **completion rewards and history after a pond interruption** for
social, mate, carried gifting, family meal/playdate, group and conflict, while
the collect-phase gift and visit paths closed without reward. If the *partner*
was in the pond, the grounded initiator could complete social/mate/conflict and
credit the pond actor anyway; a group whose leader was in the pond could stay
frozen indefinitely.

**Approved policy (now implemented): pond entry is an interaction interruption.**
On the first interruption tick, `src/ai.js` calls `shared.api.cancelPair(b)` in
addition to the existing `ai.interrupted = true`, hop/movement stop,
`releaseFood(b)` and `ready:false` freeze. `cancelPair` clears pair/task/visit
fields on both sides, releases both food claims and runs the gift/group module
interrupts, so exit cannot resume the interrupted pair or grant its completion
bond/relief/history. The guard on `ai.interrupted` keeps this once per entry and
avoids a second cleanup when the grab path already ran `cancelPair`. A grounded
actor whose `ai.partner` is in the pond also calls `cancelPair` before its
normal decisions and module ticks, clearing the pair symmetrically so it cannot
complete social/mate/conflict while the partner is frozen. New pairs remain
blocked because `actorAvailable` rejects `inPond`.

C11a coverage (`tests/social-cancellation.test.mjs`): pond entry cancels social
and visit with exactly one adapter cancellation and no repeated cleanup on
further pond ticks; no bond/relief/history after exit; mate cancellation grants
no pregnancy/bond/history; carried gifting drops the portion and clears roles;
a group leader in the pond dissolves the group; and a grounded actor cancels a
social or mate pair whose partner is in the pond. No save schema change is
needed; runtime state is already excluded from `snapshotActor`.

## Lifecycle outcomes

| Outcome | Partner / familyTask / group / claims | Evidence |
| --- | --- | --- |
| Completion | Social/visit/mate/conflict/gift use `endPair` or explicit cleanup. Family playdate and lesson use `endPair`; meal uses `cancelTask`. Group completion clears every member. Conflict transfers or releases the food claim. Gifting consumes the carried portion once. Playdate mirrors remain set on the non-finishing partner on completion; cancellation through `cancelTask` clears both sides symmetrically. | Inspected; modules tests cover social/visit, playdate, group, gift, conflict completion and family cancellation (see coverage map). |
| Refusal / decline | Social decline uses `startDeclinePair` (`beginPair` + `declineT`) then `endPair`; bonds are unchanged. Gifting refuses by cancelling and dropping/releasing the reservation. Conflict rejects an unhealthy claimant in `findContest` with `coverConflictOutcome('healthFloor')`. There is no generic refusal primitive. | Inspected; tested for social decline, gift refusal, conflict health floor. |
| Grab | App `makeGrab` calls `ai.onGrab`; Glass `beginDrag` calls `shared.onGrab` and then `stopGrabTasks`. Engine `cancelPair` runs module interrupts (gift/chat/cuddle/reconcile/partner/group), releases food, breaks reciprocal links and resets pair states. `ai.onGrab` also clears social timers. | Inspected; tested for a shared social pair (legacy and modules chooser), gifting, group detach. |
| Throw | Same grab-time cancellation as grab; `endGrab` changes physics only and does not re-pair. A thrown actor resumes normal decisions after grounding. | Inspected for grab path; throw-specific pair cleanup is unverified. |
| Pond entry | `ai.js` marks `interrupted`, releases food, sets `ready:false` (freezing module ticks) and calls `cancelPair` on the first interruption tick. Pair/task/visit fields clear on both sides, gift carried food drops and group membership dissolves, so exit resumes normal decisions but cannot credit the cancelled pair. A grounded actor whose partner is in the pond cancels that pair before its own decisions. See the C11 matrix and C11a implementation note above. New pairs are blocked because `actorAvailable` rejects `inPond`. | Inspected; `tests/social-cancellation.test.mjs` covers social/visit exactly-once and no-reward, mate, carried gifting, group leader and partner-in-pond. U-004 resolved. |
| AI disable | `engine.setEnabled(false)` calls `cancelPair` and `releaseFood` for every actor, then stops locomotion. `ai.js` additionally clears invite/social/decline/conflict/mate timers and shove for bears. Module cancellable states are interrupted; conflict pointers and playdate mirrors are not specifically cleared. | Inspected; disable is used in a preferences interruption test, but pair/claim cleanup is not asserted there. |
| Actor removal (Bear) | `app.removeBear` drops carried food, releases portion/food claims, calls `ai.detach` (which runs `cancelPair`), nulls `ai`, then clears persistent refs unless `preserveRefs`. Group membership is cancelled through the engine interrupt. | Inspected; group detach and gifting detach are tested with `engine.detach`. |
| Actor removal (Glass) | `app.removeGlassActor` drops carried food, releases claims, removes the colony actor, then calls `ai.detach` (which releases food and runs `cancelPair`) and clears persistent UID refs. Detach runs only when `glassColony.removeActor` returns true, so a refused removal leaves behavior and pair state untouched. The stars path commits a farewell first. | Tested by `tests/actor-remove.test.mjs`; `stars-test.mjs` covers the live farewell removal. |
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
| `completed` | Module timer, task or counter reaches its end: social, visit, mate, chat/cuddle, reconcile/partner, gift handover, conflict resolution, group completion, family task or hive raid. | `social.endSocialPair`, `finishVisitPair(true)`, `mate.finishMatePair`, `affection.finishActivity`, `relationships.finishReconcile`/`finishPartnership`, `gifting.finishGift`, `conflict.finishConflict`, `groups.completeGroup`, `family.finish`, `hive.finish`. | Per family: `endPair`/`cancelTask` clears pair/task/visit fields; `cancelTask` also clears family mirrors on both sides for pair tasks; gift roles and carried food; conflict pointers with claim transfer or release; group member fields; hive `ai.source`. | `actor.history` stores the completion kind when `interactionHistory` is enabled (`social`, `visit`/`hosted`, `mated`, `chat`/`cuddle`, `partnered`/`reconcile`, `gift`/`receivedGift`, `conflict`, group kind, `playdate`/`taught`/`lesson`/`meal`). No outcome or reason string is stored. | Inspected. |
| `refused` | Social invite rejected; gift offer cannot start or is declined/cancelled; conflict candidate is skipped at the health floor; pairing/reconcile preconditions fail. | `social.startDeclinePair`/`finishDeclinePair`, `gifting.cancelGift`, `conflict.findContest`, `relationships.cancellation`, `affection.cancelActivity`. | Social decline ends through `endPair`; gift cancellation releases the origin, drops carried food, clears roles/retry and `endPair`; conflict health-floor skip changes no state or claim; relationship/affection cancellation ends the pair and timers. | Social decline persists `decline`/`declined` when `interactionHistory` is enabled; gift, conflict and relationship refusals persist no interaction history. Conflict health-floor is a runtime coverage counter only. | Inspected. |
| `interrupted-grab` | App pointer/debug grab, or Glass `beginDrag`. | App `makeGrab` -> `ai.onGrab` -> engine `onGrab`; Glass `beginDrag` -> `shared.onGrab` + `stopGrabTasks`. | `cancelPair` runs module interrupts (gift/chat/cuddle/reconcile/partner/group), releases food on both sides, breaks reciprocal pair/task/visit fields and resets pair state; sets `ai.interrupted`; adapter clears social/invite/decline/conflict/mate timers. Glass `stopGrabTasks` additionally clears its own and reciprocal pair subset. Conflict pointers, playdate mirrors and social/mate-specific fields are not cleared. | None. | Inspected. |
| `interrupted-throw` | Throw release after a grab. | App `endGrab(g, true)`; Glass `endDrag(a, true)`. | No additional interaction cleanup: grab-time cancellation already ran. The app and Glass throw branches change physics/velocity only. | None. | Inspected for the throw branch; throw-specific residual cleanup is unverified. |
| `interrupted-pond` | Bear enters the pond. | `ai.js` `update`. | On the first interruption tick, sets `ai.interrupted`, stops hop/movement, calls `releaseFood(b)` and `cancelPair(b)` (module interrupts, both-side food release, reciprocal pair/task/visit clear, state reset). Later pond ticks only freeze (`ready:false`). A grounded actor cancels a pair whose partner is in the pond before deciding. Exiting the pond calls `resumeTask`. | None. | `tests/social-cancellation.test.mjs` covers social/visit/mate/gifting/group/partner-in-pond. |
| `interrupted-disable` | `setEnabled(false)` for the AI. | Engine `setEnabled` plus `ai.setEnabled`. | `cancelPair` for every actor (module interrupts, both-side food release, reciprocal pair/task clear, state reset), then `releaseFood`, movement/target reset; the bear adapter also clears invite/social/decline/conflict/mate timers, follow/shove and sleeping. It does not set `ai.interrupted`; playdate mirrors and conflict pointers are not specifically cleared. | None. | Inspected. |
| `interrupted-critical-need` | Thirst or hunger reaches its critical threshold while the actor is in the engine's optional-state list. | Engine tick. | `cancelPair`, then acquire water, food or a contest. Pair/task/claim handling is the same as generic cancellation. Conflict and `seekConflict` are not in the critical-need state list. | None. | Inspected. |
| `interrupted-stall` | No-progress recovery. | Engine `recoverStall`. | Chat/cuddle/reconcile/partner/group/gift states call `interruptActor(actor, 'no-progress')` and end through the module interrupt; visit calls `finishVisitPair(false)`; `familyTask` calls `cancelTask`, which clears both reciprocal participants and family mirrors for pair tasks and only the acting side for solo tasks; food/hive/conflict recovery releases the source and clears contest pointers. See the N2 note above. | None. | Inspected; N2 stall-path test drives the real modules engine. |
| `removed-ceiling` | Population ceiling trim. | App `removeBear(..., { departure: 'removed' })`. | Captures a departure snapshot, drops carried food, releases portion claims, `ai.detach` (release food and `cancelPair`), `food.releaseBear`, nulls `ai`, clears persistent references unless `preserveRefs`, and ends any active grab. | Departure `cause: 'removed'` is runtime-only; no actor history entry. | Inspected. |
| `removed-stars` | Stars farewell commits for `oldAge`, `starvation` or `sting`, then the fade completes. | `stars.start`/`onFarewell` -> app `startFarewell`/`commitFarewell` -> `removeBear` or `removeGlassActor`. | `commitFarewell` ends a partnership as `departed`, calls `cancelPair`, releases food and resets movement. Final removal drops carried food, releases portion/food claims, detaches (Bear and now Glass after successful colony removal) or disposes, and clears persistent references. | Departure `cause: 'stars'` and the star reason are runtime-only. A `separated` history entry is persisted if a partnership existed; the star reason is not written to actor history. | Inspected; `stars-test.mjs` covers Bear and Glass removal. |
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
| Family pair-task cancellation | `tests/activity-extension.test.mjs` pair/solo/non-reciprocal/repeated cases; `tests/behavior-family.test.mjs` reciprocal playdate cancellation and real-modules stall recovery; `.dev-shots/n2/family-cancel.mjs` | Direct primitive and modules engine |
| Family module write discipline | `tests/behavior-family.test.mjs` "family module does not write partner/familyTask directly" | Source-text assertion for `behaviors/family.js` |
| Conflict resolution | `tests/behavior-conflict.test.mjs` tie/order cases; `tests/behavior-world-resources.test.mjs` "conflict finish skips registry writes and still cleans up with a null provider" | Modules and module isolation |
| Gifting completion/refusal | `tests/gifting.test.mjs` accepted gift, hungry-receiver refusal, daily cap, critical thirst, unreachable timeout, two-giver reservation | Modules engine |
| Gifting interruption/removal/disable | `tests/gifting.test.mjs` detaching a giver, carried-gift interruption, recipient refusal after collection, disabling while carrying | Modules engine |
| Group completion/removal | `tests/relationship-features.test.mjs` group completion, exact-once effects, critical-thirst member removal, detach/map-switch proxy; `tests/behavior-navigation.test.mjs` group slot paths | Modules engine |
| Partnership and save reciprocity | `tests/relationship-features.test.mjs` partnership and farewell separation; `tests/relationship-save.test.mjs` v8 records, reciprocity and cross-map pruning | Modules/save |
| Interaction history | `tests/interaction-history.test.mjs` completion/decline/conflict/visit recording and interruption omission | Modules engine |
| Pond pair state | `tests/social-cancellation.test.mjs` pond cases (social/visit exactly-once, mate, carried gifting, group leader, partner-in-pond) | Modules engine and Bear adapter |
| Map switch and New Game live cleanup | No dedicated case found | Gap |
| Save/load live pair/task cleanup | No case; saved records are covered, runtime `ai` is excluded | Gap |
| Actor removal via Glass `removeGlassActor` | `tests/actor-remove.test.mjs` covers successful detach/reference order, refusal/no-remover with no detach, and unchanged departure/farewell/drop/portion/food order; `stars-test.mjs` covers live Glass farewell removal | App wrapper and portable ordering |
| Playdate partner mirrors after completion | Completion still clears mirrors only on the finishing actor; pair cancellation clears both sides (N2 tests) | Partial gap: completion mirror asymmetry remains by design |
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
| Group membership family | Group state is a single shared object with per-member fields and an existing module `interrupt`; below-three dissolution is explicit. | Live `members` array and leader UID must stay consistent across removal; Glass removal calls `detach` after successful colony removal, so membership cleanup uses the engine interrupt. |
| Family playdate/task mirrors | Task construction and most clearing already live in `interactions.js`/`family.js`; playdate completion is test-covered. | Partner-side playdate mirrors are not cleared by `endPair`; meals are solo tasks with a different cleanup path; lesson and playdate share the same `familyTask` shape. |
| Conflict pair and claimed source | Pair entry is shared and the conflict module owns a clear finish path with claim transfer. | Generic `cancelPair` does not clear conflict pointers; claim ownership can outlive an interrupted conflict; conflict is solo-claim plus pair interaction, not a simple pair family. |

## Open questions and unverified areas

- Whether every pair entry path should require a reciprocal write is unresolved;
  `startTask`, `startInvite`/`startVisit` and several recovery branches currently
  write directly.
- `cancelTask` now clears both reciprocal pair-task participants and their family
  mirrors (N2), while solo tasks and non-reciprocal/different-task partners stay
  own-side. A partial pair start failure was still not exercised: if only one side
  has the task, cancellation clears the acting side and leaves the other untouched.
- Pond interruption now invokes `cancelPair` on entry and cancels a grounded
  actor's pair when its partner is in the pond; the C11a tests cover social,
  visit, mate, carried gifting and group. The C11a policy did not change
  `cancelTask`; N2 later resolved the family pair-task cancellation asymmetry
  (U-007) separately. Broader M2 sampling of the remaining families is still
  open.
- Glass removal (`removeGlassActor`) now detaches behavior after a successful
  colony removal, before reference clearing. The stars path still calls
  `commitFarewell` first; map-clear/`glassColony.clear()` does not use this
  removal path and remains unverified for pair cleanup.
- Save/load intentionally drops runtime interaction state. Whether any UI or
  debug reader expects a restored `playdate`/`visit` mirror after load was not
  found in this pass.
- Legacy `src/behavior.js` remains a second implementation of these writers when
  `?behaviors=legacy` is selected. Parity tests sample it but this inventory does
  not enumerate every legacy branch.
