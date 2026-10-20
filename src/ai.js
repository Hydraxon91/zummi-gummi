// Soft-body bear/Gummy representation adapter.
//
// The shared behavior engine (behavior.js) owns needs, utilities, pair states,
// hive/conflict and family tasks. This module keeps the Box3D hop host, the
// player directive system and the bear-only debug/status surface.

import { profileFor } from './behaviorprofiles.js';
import { pairBond } from './family.js';

const DIRECTIVE_TTL = 45;
const DIRECTIVE_MAX = 3;
const DIRECTIVE_KINDS = ['go', 'eat', 'drink', 'home', 'social'];
const DIRECTIVE_LABELS = { go: 'Go here', eat: 'Eat', drink: 'Drink', home: 'Home', social: 'Socialize' };

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
      if (!b || !b.ai) return;
      if (b.ai.directive) {
        b.ai.directive.ttl = Math.max(0, b.ai.directive.ttl - dt);
        if (b.ai.directive.ttl <= 0) finishDirective(b, 'expired');
      }
      if (b.ai.directiveStatus && b.ai.directiveStatus.t > 0) {
        b.ai.directiveStatus.t = Math.max(0, b.ai.directiveStatus.t - dt);
      }
    },
    preNeeds(b) {
      if (!b || !b.ai) return false;
      if (b.ai.directive) checkDirective(b);
      if (!b.ai.directive && b.ai.directives.length && startNextDirective(b)) return true;
      return false;
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
        }
        shared.tick(b, dt, { ready: false });
        continue;
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

  function directiveSnapshot(d) {
    return d ? {
      kind: d.kind,
      target: d.target ? { x: d.target.x, z: d.target.z } : null,
      ttl: +d.ttl.toFixed(2),
    } : null;
  }

  function directiveStatus(b, text, kind) {
    b.ai.directiveStatus = { text, kind: kind || null, t: 4.5 };
  }

  function issueDirective(b, kind, target) {
    if (!b || !b.ai || !enabled) return null;
    if (!DIRECTIVE_KINDS.includes(kind)) return null;
    if (kind === 'go' && (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z))) return null;
    if (b.ai.directives.length >= DIRECTIVE_MAX) b.ai.directives.shift();
    const d = {
      kind,
      target: kind === 'go' ? { x: +target.x, z: +target.z } : null,
      ttl: DIRECTIVE_TTL,
    };
    b.ai.directives.push(d);
    b.ai.nextThink = 0;
    directiveStatus(b, `${DIRECTIVE_LABELS[kind]} — asked`, kind);
    return { ...d, queued: b.ai.directives.length };
  }

  function releaseToNormal(b) {
    if (!b || !b.ai) return;
    b.ai.directiveHome = false;
    const ai = b.ai;
    if (['seekHome', 'seekFood', 'seekWater'].includes(ai.state)) {
      if (ai.state === 'seekFood') shared.api.releaseFood(b);
      ai.source = null;
      ai.waterSpot = null;
      ai.target = null;
      ai.path = null;
      ai.pathIndex = 0;
      ai.moving = false;
      ai.state = 'wander';
      ai.idleT = .4;
      ai.nextThink = 0;
    } else if (ai.state === 'wander' && !ai.moving) {
      ai.target = null;
    }
  }

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

  function cancelDirectives(b) {
    if (!b || !b.ai) return false;
    const had = b.ai.directives.length + (b.ai.directive ? 1 : 0);
    b.ai.directives.length = 0;
    b.ai.directive = null;
    releaseToNormal(b);
    directiveStatus(b, had ? 'cleared' : 'no directives');
    return true;
  }

  function nearestCompanyFor(b) {
    let best = null;
    let bestD = 22 * 22;
    for (const other of companions()) {
      if (other === b || !other.active || !other.ai || other.sleeping || other.inPond) continue;
      const d = (other.cx - b.cx) ** 2 + (other.cz - b.cz) ** 2;
      if (d < bestD) { bestD = d; best = other; }
    }
    return best;
  }

  function applyDirective(b, d) {
    if (b.ai.familyTask || b.ai.partner) shared.api.cancelPair(b);
    if (d.kind === 'go') {
      if (!shared.api.setDestination(b, d.target.x, d.target.z)) return false;
      b.ai.target = { x: d.target.x, z: d.target.z };
      b.ai.state = 'wander';
      b.ai.idleT = 0;
      b.ai.moving = true;
      return true;
    }
    if (d.kind === 'eat') return !!shared.api.acquireFood(b);
    if (d.kind === 'drink') return !!shared.api.acquireWater(b);
    if (d.kind === 'home') {
      if (!shared.api.homeFor(b)) return false;
      shared.api.startSeekHome(b);
      b.ai.directiveHome = true;
      return true;
    }
    if (d.kind === 'social') {
      const other = nearestCompanyFor(b);
      if (!other || !shared.api.startInvite(b, other)) return false;
      return true;
    }
    return false;
  }

  function directiveRefusal(b, d) {
    if (b.health < 28) return 'too hurt';
    if (b.energy < 0.10) return 'too tired';
    if (d.kind !== 'drink' && b.thirst >= 0.94) return 'too thirsty';
    if (d.kind !== 'eat' && b.hunger >= 0.94) return 'too hungry';
    if (d.kind === 'eat' && b.hunger < 0.28) return 'not hungry';
    if (d.kind === 'drink' && b.thirst < 0.28) return 'not thirsty';
    if (d.kind === 'home' && !shared.api.homeFor(b)) return 'no home';
    const p = profileFor(b);
    const pressures = [];
    if (d.kind !== 'eat' && b.hunger > 0.50) pressures.push('hungry');
    if (d.kind !== 'drink' && b.thirst > 0.50) pressures.push('thirsty');
    if (d.kind !== 'social' && b.stage === 'adult' && b.mateCooldown <= 0 &&
        (b.social >= p.thresholds.seekSocial || b.affection >= p.thresholds.seekAffection ||
          b.ai.state === 'seekMate')) {
      pressures.push('looking for company');
    }
    if (b.ai.state === 'seekMate' && d.kind !== 'social') pressures.push('busy courting');
    let willing = d.kind === 'social' ? 0.50 + b.bold * 0.35 : 0.84 + b.bold * 0.08;
    if (d.kind !== 'eat') willing -= Math.max(0, b.hunger - 0.50) * 0.55;
    if (d.kind !== 'drink') willing -= Math.max(0, b.thirst - 0.50) * 0.65;
    if (pressures.length) willing -= 0.18;
    willing = Math.max(0.08, Math.min(0.96, willing));
    return rng() < willing ? null : (pressures[0] || 'not right now');
  }

  function finishDirective(b, text) {
    if (!b || !b.ai) return;
    if (b.ai.directive) directiveStatus(b, `${DIRECTIVE_LABELS[b.ai.directive.kind]} — ${text}`, b.ai.directive.kind);
    b.ai.directive = null;
    releaseToNormal(b);
  }

  function startNextDirective(b) {
    if (!b.ai || !b.ai.directives.length) return false;
    const d = b.ai.directives.shift();
    const refusal = directiveRefusal(b, d);
    if (refusal) {
      directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — ${refusal}`, d.kind);
      if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'no');
      if (field && field.emoteHouse) field.emoteHouse(shared.api.homeFor(b), 'refuse');
      b.ai.nextThink = 0.5;
      return false;
    }
    if (!applyDirective(b, d)) {
      directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — cannot do that here`, d.kind);
      if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'no');
      if (field && field.emoteHouse) field.emoteHouse(shared.api.homeFor(b), 'refuse');
      b.ai.nextThink = 0.6;
      return false;
    }
    b.ai.directive = d;
    directiveStatus(b, `${DIRECTIVE_LABELS[d.kind]} — on it`, d.kind);
    if (field && field.emote) field.emote(b.cx, b.cy + 1.08, b.cz, 'yes');
    return true;
  }

  function checkDirective(b) {
    const d = b.ai.directive;
    if (!d) return;
    if (d.kind === 'go' && d.target &&
        Math.hypot(d.target.x - b.cx, d.target.z - b.cz) < 0.9) {
      finishDirective(b, 'arrived');
      return;
    }
    if (d.kind === 'eat' && b.hunger <= 0.36) { finishDirective(b, 'fed'); return; }
    if (d.kind === 'drink' && b.thirst <= 0.36) { finishDirective(b, 'watered'); return; }
    if (d.kind === 'home' && b.ai.state === 'sleep') { finishDirective(b, 'home'); return; }
    if (d.kind === 'social' && b.ai.state === 'social') { finishDirective(b, 'nuzzling'); return; }
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

  function directiveState(index) {
    const b = bears[index];
    if (!b || !b.active || !b.ai) return null;
    return {
      index,
      name: b.name || '',
      active: directiveSnapshot(b.ai.directive),
      queue: b.ai.directives.map(directiveSnapshot),
      status: b.ai.directiveStatus ? { ...b.ai.directiveStatus } : null,
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
    issueDirective, cancelDirectives, directiveState, setPossessed,
    get enabled() { return enabled; },
  };
}
