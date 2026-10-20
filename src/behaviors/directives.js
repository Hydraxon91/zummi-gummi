// Player directives for the soft-body adapter.
//
// The directive RNG stream stays separate from the behavior engine RNG (quirk
// 18). Queue limits/TTL come from the directives module config: 45 s / 3.

import { defineBehaviorModule } from './module.js';

const DIRECTIVE_KINDS = ['go', 'eat', 'drink', 'home', 'social'];
const DIRECTIVE_LABELS = { go: 'Go here', eat: 'Eat', drink: 'Drink', home: 'Home', social: 'Socialize' };

export const directivesModule = defineBehaviorModule({
  id: 'directives',
  label: 'Player directives',
  states: ['directive'],
  defaults: { enabled: false, params: { ttl: 45, max: 3 } },
});

function finite(n, fallback) {
  return Number.isFinite(n) ? n : fallback;
}

export function createDirectiveSystem({ behavior, field = null, getCompanions, rng = Math.random } = {}) {
  const shared = behavior;

  function paramsFor(b) {
    try {
      const config = shared && shared.api && shared.api.config;
      const resolved = config && typeof config.forActor === 'function' ? config.forActor(b) : null;
      const params = resolved && resolved.behaviorModules && resolved.behaviorModules.directives &&
        resolved.behaviorModules.directives.params;
      if (params) return { ttl: finite(params.ttl, 45), max: finite(params.max, 3) };
    } catch (error) {}
    const profile = shared && shared.api && typeof shared.api.profile === 'function' ? shared.api.profile(b) : null;
    const block = profile && profile.directives;
    return {
      ttl: finite(block && block.ttl, 45),
      max: finite(block && block.max, 3),
    };
  }

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
    if (!b || !b.ai) return null;
    if (!DIRECTIVE_KINDS.includes(kind)) return null;
    if (kind === 'go' && (!target || !Number.isFinite(target.x) || !Number.isFinite(target.z))) return null;
    const params = paramsFor(b);
    if (b.ai.directives.length >= params.max) b.ai.directives.shift();
    const d = {
      kind,
      target: kind === 'go' ? { x: +target.x, z: +target.z } : null,
      ttl: params.ttl,
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

  function nearestCompanyFor(b) {
    let best = null;
    let bestD = 22 * 22;
    const list = typeof getCompanions === 'function' ? getCompanions() : [];
    for (const other of list || []) {
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
    const p = shared.api.profile(b);
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

  function preTick(b, dt) {
    if (!b || !b.ai) return;
    if (b.ai.directive) {
      b.ai.directive.ttl = Math.max(0, b.ai.directive.ttl - dt);
      if (b.ai.directive.ttl <= 0) finishDirective(b, 'expired');
    }
    if (b.ai.directiveStatus && b.ai.directiveStatus.t > 0) {
      b.ai.directiveStatus.t = Math.max(0, b.ai.directiveStatus.t - dt);
    }
  }

  function preNeeds(b) {
    if (!b || !b.ai) return false;
    if (b.ai.directive) checkDirective(b);
    if (!b.ai.directive && b.ai.directives.length && startNextDirective(b)) return true;
    return false;
  }

  function cancel(b) {
    if (!b || !b.ai) return false;
    const had = b.ai.directives.length + (b.ai.directive ? 1 : 0);
    b.ai.directives.length = 0;
    b.ai.directive = null;
    releaseToNormal(b);
    directiveStatus(b, had ? 'cleared' : 'no directives');
    return true;
  }

  function state(b) {
    if (!b || !b.ai) return null;
    return {
      active: directiveSnapshot(b.ai.directive),
      queue: b.ai.directives.map(directiveSnapshot),
      status: b.ai.directiveStatus ? { ...b.ai.directiveStatus } : null,
    };
  }

  return {
    issueDirective, cancel, state, preTick, preNeeds,
    checkDirective, startNextDirective, applyDirective, directiveRefusal,
    paramsFor,
  };
}
