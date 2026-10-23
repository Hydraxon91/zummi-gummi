// Soft-body bear/Gummy representation adapter.
//
// The shared behavior engine owns needs, utilities, pair states,
// hive/conflict and family tasks. This module keeps the Box3D hop host and the
// bear-only debug/status surface; player directives live in behaviors/directives.js.

import { createDirectiveSystem } from './behaviors/directives.js';
import { pairBond } from './family.js';

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

export function createBearAI({
  field,
  getBears,
  getCompanions,
  behavior = null,
  rng = Math.random,
} = {}) {
  if (!behavior) throw new Error('createBearAI requires the shared behavior engine');
  const shared = behavior;
  const bears = getBears ? getBears() : [];
  const companions = () => {
    const list = typeof getCompanions === 'function' ? getCompanions() : bears;
    return Array.isArray(list) ? list : bears;
  };
  const directives = createDirectiveSystem({
    behavior: shared, field, getCompanions: companions, rng,
  });
  let enabled = true;
  const stats = { ticks: 0, ms: 0 };

  const bearAdapter = {
    onStop(b) {
      if (!b || !b.ai) return;
      b.ai.hopState = null;
      b.ai.hopWait = 0;
      b.ai.turnWait = 0;
    },
    onGrab(b) {
      if (!b || !b.ai) return;
      b.ai.raidT = 0;
      b.ai.fleeT = 0;
      b.ai.inviteT = 0;
      b.ai.socialT = 0;
      b.ai.declineT = 0;
      b.ai.conflictT = 0;
      b.ai.mateT = 0;
      b.ai.follow = null;
      b.ai.shove = null;
      b.sleeping = false;
    },
    preTick(b, dt) {
      directives.preTick(b, dt);
    },
    preNeeds(b) {
      return directives.preNeeds(b);
    },
  };
  shared.registerAdapter('softbody', bearAdapter);

  function update(dt) {
    if (!enabled || !field || !bears.length) return;
    const t0 = performance.now();
    for (const b of bears) {
      if (!b.active) continue;
      if (!b.ai) shared.attach(b);
      const ai = b.ai;
      if (!ai) continue;

      const grounded = !b.airborne && b.contacts > 0 && (b.rMat[4] || 0) > 0.62;

      // Possession keeps needs and vitals ticking but suspends decisions and
      // hop locomotion for this bear; app.js drives movement instead.
      if (ai.possessed) {
        shared.tick(b, dt, { ready: false });
        continue;
      }

      if (b.grabs > 0 || b.inPond) {
        if (!ai.interrupted) {
          ai.interrupted = true;
          ai.moving = false;
          ai.hopState = null;
          shared.api.releaseFood(b);
          // Pond entry is an interaction interruption: close the pair/task on
          // both sides through the shared primitive instead of letting it
          // resume and reward after exit. Grab entry already ran this cleanup
          // (and set interrupted), so this branch is the once-per-entry guard.
          if (b.inPond) shared.api.cancelPair(b);
        }
        shared.tick(b, dt, { ready: false });
        continue;
      }
      // A grounded actor may not complete a pair while its partner is frozen in
      // the pond; cancel symmetrically before decisions and module ticks run.
      if (grounded && ai.partner && ai.partner.inPond) {
        shared.api.cancelPair(b);
      }
      if (!grounded && ai.interrupted) {
        shared.tick(b, dt, { ready: false });
        continue;
      }
      if (ai.interrupted) {
        ai.interrupted = false;
        ai.nextThink = 0;
        ai.hopState = null;
        ai.path = null;
        shared.resumeTask(b);
      }

      // Check for a hop that never made progress (a tree/root or a bad path).
      if (ai.moving) {
        const dx = b.cx - ai.lastX;
        const dz = b.cz - ai.lastZ;
        if (dx * dx + dz * dz > 0.04) {
          ai.lastX = b.cx;
          ai.lastZ = b.cz;
          ai.stuckT = 0;
        } else {
          ai.stuckT += dt;
          if (ai.stuckT > 1.9) {
            ai.stuckT = 0;
            if (ai.state === 'seekFood') shared.api.releaseFood(b);
            ai.source = ai.state === 'seekFood' ? null : ai.source;
            ai.target = null;
            ai.path = null;
            ai.moving = false;
            ai.nextThink = 0;
          }
        }
      }

      shared.tick(b, dt, { ready: grounded });
    }
    stats.ticks++;
    stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  function onGrab(b) {
    shared.onGrab(b);
  }

  function onRelease(b) {
    shared.onRelease(b);
    if (b.ai) {
      b.ai.hopState = null;
      b.ai.hopWait = 0;
      b.ai.turnWait = 0;
      b.ai.faceYaw = null;
    }
  }

  function detach(b) {
    shared.detach(b);
  }

  function setEnabled(v) {
    enabled = !!v;
    shared.setEnabled(enabled);
    for (const b of bears) {
      if (!b.active || !b.ai) continue;
      b.ai.hopState = null;
      b.ai.hopWait = 0;
      b.ai.turnWait = 0;
      b.ai.faceYaw = null;
      b.ai.raidT = 0;
      b.ai.fleeT = 0;
      b.ai.inviteT = 0;
      b.ai.socialT = 0;
      b.ai.declineT = 0;
      b.ai.conflictT = 0;
      b.ai.mateT = 0;
      b.ai.follow = null;
      b.ai.shove = null;
      b.sleeping = false;
    }
    return enabled;
  }

  /* -------------------------------------------------------------- directives */

  function setPossessed(b, on) {
    if (!b) return false;
    if (!b.ai) shared.attach(b);
    if (!b.ai) return false;
    b.ai.possessed = !!on;
    if (on) {
      shared.api.cancelPair(b);
      shared.api.releaseFood(b);
      b.ai.source = null;
      b.ai.waterSpot = null;
      b.ai.partner = null;
      b.ai.target = null;
      b.ai.path = null;
      b.ai.pathIndex = 0;
      b.ai.moving = false;
      b.ai.faceYaw = null;
      b.ai.hopState = null;
      b.ai.directives.length = 0;
      b.ai.directive = null;
      b.ai.directiveStatus = null;
      if (b.sleeping) shared.api.wake(b);
      b.ai.state = 'wander';
      b.ai.idleT = 0;
      b.ai.nextThink = 0;
    } else {
      b.ai.state = 'wander';
      b.ai.idleT = .3;
      b.ai.nextThink = 0;
      b.ai.faceYaw = null;
      b.ai.hopState = null;
      b.ai.moving = false;
      b.ai.path = null;
    }
    return true;
  }

  /* ------------------------------------------------------------------ debug */

  function setNeed(b, kind, value) {
    return shared.setNeed(b, kind, value);
  }

  function setBond(a, b, value) {
    return shared.setBond(a, b, value);
  }

  function debugState(b, state) {
    return shared.debugState(b, state);
  }

  function debugConflict(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) {
      return { ok: false, note: 'need two active bears' };
    }
    const result = shared.forceConflict(a, b);
    return { ...result, partner: b.name || 'bear' };
  }

  function matePairDebug(a, b) {
    const ok = shared.api.canMatePair(a, b);
    return {
      ok,
      a: a ? { uid: a.uid, stage: a.stage, sex: a.sex, pregnant: !!a.pregnant, cooldown: a.mateCooldown || 0 } : null,
      b: b ? { uid: b.uid, stage: b.stage, sex: b.sex, pregnant: !!b.pregnant, cooldown: b.mateCooldown || 0 } : null,
    };
  }

  function beginMatePair(a, b) {
    return shared.forceMate(a, b).ok;
  }

  function debugMate(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    if (a.stage !== 'adult' || b.stage !== 'adult') return { ok: false, note: 'adults only' };
    if (a.sex === b.sex) return { ok: false, note: 'opposite sexes required' };
    if (a.pregnant || b.pregnant) return { ok: false, note: 'already pregnant' };
    const result = shared.forceMate(a, b);
    return { ...result, partner: b.name || 'bear' };
  }

  function debugSocial(a, b, accept = true) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    const result = shared.forceSocial(a, b, accept);
    return { ...result, accepted: !!accept, partner: b.name || 'bear' };
  }

  function familyKind(a, b) {
    const parentsA = a.parentUids || [];
    const parentsB = b.parentUids || [];
    if (parentsA.length && parentsB.some(uid => parentsA.includes(uid))) return 'sibling';
    if (parentsA.includes(b.uid)) return 'parent';
    if (parentsB.includes(a.uid)) return 'child';
    return null;
  }

  function debugFamilyPlay(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    const kind = familyKind(a, b);
    if (!kind) return { ok: false, note: 'not siblings or parent/child' };
    const result = shared.forcePlaydate(a, b, kind);
    return { ...result, kind, partner: b.name || 'bear' };
  }

  function debugInvite(a, b, accept = true) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    const result = shared.forceInvite(a, b, accept);
    return { ...result, accepted: !!accept, partner: b.name || 'bear' };
  }

  function debugVisit(a, b) {
    if (!a || !b || a === b || !a.active || !b.active) return { ok: false, note: 'need two active bears' };
    const result = shared.forceVisit(a, b);
    return { ...result, home: a.ai?.visitHome || null, partner: b.name || 'bear' };
  }

  function plan(b) {
    return shared.plan(b);
  }

  function statsNow() {
    const list = [];
    for (let i = 0; i < bears.length; i++) {
      const b = bears[i];
      if (!b.active || !b.ai) continue;
      list.push({
        index: i,
        state: b.ai.state,
        hunger: +finite(b.hunger, 0).toFixed(3),
        thirst: +finite(b.thirst, 0).toFixed(3),
        health: +finite(b.health, 0).toFixed(1),
        energy: +finite(b.energy, 0).toFixed(3),
        age: +finite(b.age, 0).toFixed(1),
        stage: b.stage,
        pregnant: !!b.pregnant,
        gestation: +finite(b.gestation, 0).toFixed(1),
        social: +finite(b.social, 0).toFixed(3),
        affection: +finite(b.affection, 0).toFixed(3),
        partner: b.ai.partner ? (b.ai.partner.name || 'a friend') : null,
        bond: b.ai.partner ? +pairBond(b, b.ai.partner).toFixed(3) : null,
        familyPlay: !!b.ai.familyPlay,
        playmateKind: b.ai.playmateKind || null,
        follow: b.ai.follow ? (b.ai.follow.name || 'parent') : null,
        visitHome: b.ai.visitHome || null,
        visitRole: b.ai.visitRole || null,
        home: b.home || '',
        sleeping: !!b.sleeping,
        woozy: b.health < 15,
        stungT: +finite(b.ai.stungT, 0).toFixed(2),
        moving: !!b.ai.moving,
        noProgressT: +finite(b.ai.noProgressT, 0).toFixed(2),
        recoveries: b.ai.recoveries | 0,
        restCooldown: +finite(b.ai.restCooldown, 0).toFixed(2),
        doorEntries: b.ai.doorEntries | 0,
        doorExits: b.ai.doorExits | 0,
        lastStuck: b.ai.lastStuck || null,
        interrupted: !!b.ai.interrupted,
        hopState: b.ai.hopState,
        faceYaw: b.ai.faceYaw === null || b.ai.faceYaw === undefined ? null : +b.ai.faceYaw.toFixed(3),
        animT: +finite(b.ai.animT, 0).toFixed(3),
        source: b.ai.source ? b.ai.source.id : null,
        contest: b.ai.contestSource ? b.ai.contestSource.id : null,
        target: b.ai.target ? [+b.ai.target.x.toFixed(2), +b.ai.target.z.toFixed(2)] : null,
        path: b.ai.path ? b.ai.path.length : 0,
        familyTask: b.ai.familyTask ? b.ai.familyTask.id : null,
      });
    }
    return { enabled, ticks: stats.ticks, ms: +stats.ms.toFixed(3), bears: list };
  }

  function moduleDirectiveState(index) {
    const b = bears[index];
    if (!b || !b.active || !b.ai) return null;
    return {
      index, name: b.name || '',
      ...directives.state(b),
      state: b.ai.state,
      hunger: +b.hunger.toFixed(2),
      thirst: +b.thirst.toFixed(2),
      energy: +b.energy.toFixed(2),
      health: +b.health.toFixed(1),
    };
  }

  return {
    update, onGrab, onRelease, detach, setEnabled,
    setNeed, setBond, debugState, debugSocial, debugInvite, debugVisit, debugConflict, debugMate,
    debugFamilyPlay,
    beginMatePair, canMatePair: (a, b) => shared.api.canMatePair(a, b), matePairDebug,
    plan, stats: statsNow,
    issueDirective: (b, kind, target) => enabled ? directives.issueDirective(b, kind, target) : null,
    cancelDirectives: directives.cancel,
    directiveState: moduleDirectiveState,
    setPossessed,
    preNeeds: (b) => enabled && directives.preNeeds(b),
    preTick: (b, dt) => directives.preTick(b, dt),
    get enabled() { return enabled; },
  };
}
