// Food sources, ripeness, claims and respawn.
//
// This module is deliberately data-only: field.js owns the visible instances and
// passes a visibility callback in, while ai.js owns deciding which bear wants
// what. That keeps the browser scene, the registry and the state machine from
// growing into each other.

const UPDATE_STEP = 0.20;

export function createFoodRegistry({ sources = [], rng = Math.random, onVisibility = null } = {}) {
  let seq = 0;
  const list = sources.map((s) => {
    const kind = s.kind || 'food';
    const respawnMin = Number.isFinite(s.respawnMin) ? s.respawnMin : 25;
    const respawnMax = Number.isFinite(s.respawnMax) ? s.respawnMax : 45;
    return {
      ...s,
      id: s.id || `${kind}-${seq++}`,
      kind,
      label: s.label || kind,
      approachX: Number.isFinite(s.approachX) ? s.approachX : s.x,
      approachZ: Number.isFinite(s.approachZ) ? s.approachZ : s.z,
      satiation: Number.isFinite(s.satiation) ? s.satiation : 0.20,
      respawnMin,
      respawnMax,
      respawn: Number.isFinite(s.respawn) ? s.respawn : respawnMin + rng() * (respawnMax - respawnMin),
      ripe: s.ripe !== false,
      claim: null,
      timer: 0,
      visible: s.ripe !== false,
    };
  });

  let updateAcc = 0;
  const stats = { consumed: 0, respawned: 0 };

  function notify(source, visible) {
    if (onVisibility) onVisibility(source, visible);
  }

  function update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    updateAcc += dt;
    if (updateAcc < UPDATE_STEP) return;
    const step = updateAcc;
    updateAcc = 0;
    for (const s of list) {
      if (s.ripe) continue;
      s.timer -= step;
      if (s.timer > 0) continue;
      s.timer = 0;
      s.ripe = true;
      s.visible = true;
      stats.respawned++;
      notify(s, true);
    }
  }

  function claim(source, bear) {
    if (!source || !source.ripe) return false;
    if (source.claim && source.claim !== bear) return false;
    source.claim = bear;
    return true;
  }

  function release(source, bear) {
    if (source && source.claim === bear) source.claim = null;
  }

  function releaseBear(bear) {
    let n = 0;
    for (const s of list) {
      if (s.claim === bear) { s.claim = null; n++; }
    }
    return n;
  }

  function consume(source, bear) {
    if (!source || !source.ripe || source.claim !== bear) return false;
    source.ripe = false;
    source.claim = null;
    source.visible = false;
    source.timer = source.respawn;
    stats.consumed++;
    notify(source, false);
    return true;
  }

  function nearestRipe(x, z, { maxDistance = 40, bear = null, exclude = null, kinds = null } = {}) {
    let best = null;
    let bestD = maxDistance;
    for (const s of list) {
      if (!s.ripe) continue;
      if (s.claim && s.claim !== bear) continue;
      if (exclude && exclude.has(s.id)) continue;
      if (kinds && !kinds.includes(s.kind)) continue;
      const d = Math.hypot(s.approachX - x, s.approachZ - z);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function allRipe({ kinds = null } = {}) {
    return list.filter(s => s.ripe && (!kinds || kinds.includes(s.kind)));
  }

  function validate() {
    const errors = [];
    for (const s of list) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) errors.push(`${s.id} has invalid position`);
      if (!Number.isFinite(s.approachX) || !Number.isFinite(s.approachZ)) errors.push(`${s.id} has invalid approach`);
      if (!Number.isFinite(s.satiation) || s.satiation <= 0) errors.push(`${s.id} has invalid satiation`);
      if (!Number.isFinite(s.respawn) || s.respawn <= 0) errors.push(`${s.id} has invalid respawn`);
    }
    return errors;
  }

  function reset() {
    updateAcc = 0;
    for (const s of list) {
      if (!s.ripe) notify(s, true);
      s.ripe = true;
      s.visible = true;
      s.claim = null;
      s.timer = 0;
    }
  }

  function get(id) {
    return list.find(s => s.id === id) || null;
  }

  function statsNow() {
    let ripe = 0, claimed = 0, depleted = 0;
    let next = Infinity;
    const kinds = {};
    for (const s of list) {
      kinds[s.kind] = (kinds[s.kind] || 0) + 1;
      if (s.ripe) ripe++;
      else {
        depleted++;
        if (s.timer < next) next = s.timer;
      }
      if (s.claim) claimed++;
    }
    return {
      total: list.length,
      ripe,
      depleted,
      claimed,
      kinds,
      nextRespawn: Number.isFinite(next) ? +next.toFixed(2) : null,
      consumed: stats.consumed,
      respawned: stats.respawned,
    };
  }

  return {
    update, claim, release, releaseBear, consume, nearestRipe, allRipe,
    validate, reset, get,
    get sources() { return list; },
    stats() { return statsNow(); },
  };
}
