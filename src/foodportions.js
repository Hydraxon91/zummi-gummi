// Dropped and carried food portions for physical gifting.
//
// A portion is a durable identity, separate from an authored food source. It
// can be dropped, reserved by one actor, picked up once and handed over once.
// The registry is pure so Node tests can exercise ownership without a renderer.

const MAP_IDS = new Set(['field', 'studio']);

function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

export function normalizeCarriedFood(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.id !== 'string' || !value.id) return null;
  if (typeof value.kind !== 'string' || !value.kind) return null;
  const satiation = finite(value.satiation, NaN);
  if (!Number.isFinite(satiation) || satiation <= 0) return null;
  return { id: value.id, kind: value.kind, satiation: +satiation.toFixed(4) };
}

function normalizeNewPortion(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.kind !== 'string' || !value.kind) return null;
  const satiation = finite(value.satiation, NaN);
  if (!Number.isFinite(satiation) || satiation <= 0) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : '',
    kind: value.kind,
    satiation: +satiation.toFixed(4),
  };
}

function normalizePortion(value) {
  const carried = normalizeNewPortion(value);
  if (!carried) return null;
  const x = finite(value.x, NaN);
  const z = finite(value.z, NaN);
  const y = finite(value.y, 0);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const mapId = MAP_IDS.has(value.mapId) ? value.mapId : 'field';
  return {
    ...carried,
    x: +x.toFixed(3),
    y: +y.toFixed(3),
    z: +z.toFixed(3),
    mapId,
    claim: null,
  };
}

export function createFoodPortionRegistry({ portions = [] } = {}) {
  let seq = 0;
  let list = [];
  const stats = { created: 0, picked: 0, restored: 0 };

  function nextId() {
    seq += 1;
    return `gift-${seq}`;
  }

  function trackId(portion) {
    const match = /^gift-(\d+)$/.exec(portion.id);
    if (match) seq = Math.max(seq, Number(match[1]));
  }

  function add(input) {
    const portion = normalizePortion(input);
    if (!portion) return null;
    if (!portion.id) portion.id = nextId();
    if (list.some(item => item.id === portion.id)) return null;
    trackId(portion);
    list.push(portion);
    stats.created++;
    return portion;
  }

  function restore(entries) {
    list = [];
    seq = 0;
    if (!Array.isArray(entries)) return 0;
    for (const entry of entries) {
      const portion = normalizePortion(entry);
      if (!portion || !portion.id) continue;
      if (list.some(item => item.id === portion.id)) continue;
      trackId(portion);
      list.push(portion);
      stats.restored++;
    }
    return list.length;
  }

  function all(mapId = null) {
    return mapId ? list.filter(item => item.mapId === mapId) : list.slice();
  }

  function get(id) {
    return list.find(item => item.id === id) || null;
  }

  function claim(portion, actor) {
    if (!portion || !actor || !list.includes(portion)) return false;
    if (portion.claim && portion.claim !== actor) return false;
    portion.claim = actor;
    return true;
  }

  function release(portion, actor) {
    if (portion && portion.claim === actor) portion.claim = null;
  }

  function releaseActor(actor) {
    let released = 0;
    for (const portion of list) {
      if (portion.claim === actor) { portion.claim = null; released++; }
    }
    return released;
  }

  // Remove a claimed portion and return an immutable carried record.
  function take(portion, actor) {
    if (!portion || !actor || portion.claim !== actor || !list.includes(portion)) return null;
    const index = list.indexOf(portion);
    list.splice(index, 1);
    stats.picked++;
    return {
      id: portion.id,
      kind: portion.kind,
      satiation: portion.satiation,
    };
  }

  function nearest(x, z, { maxDistance = 16, mapId = null, bear = null } = {}) {
    let best = null;
    let bestD = maxDistance;
    for (const portion of list) {
      if (mapId && portion.mapId !== mapId) continue;
      if (portion.claim && portion.claim !== bear) continue;
      const d = Math.hypot(portion.x - x, portion.z - z);
      if (d < bestD) { bestD = d; best = portion; }
    }
    return best;
  }

  function snapshot(mapId = null) {
    return all(mapId).map(({ id, kind, satiation, x, y, z, mapId: idMap }) => ({
      id, kind, satiation, x, y, z, mapId: idMap,
    }));
  }

  function reset() {
    list = [];
    seq = 0;
  }

  function statsNow() {
    const byMap = {};
    for (const portion of list) {
      byMap[portion.mapId] = (byMap[portion.mapId] || 0) + 1;
    }
    return {
      total: list.length,
      field: byMap.field || 0,
      studio: byMap.studio || 0,
      created: stats.created,
      picked: stats.picked,
      restored: stats.restored,
    };
  }

  for (const entry of portions) {
    const portion = normalizePortion(entry);
    if (!portion) continue;
    portion.id = portion.id || nextId();
    trackId(portion);
    list.push(portion);
  }

  return {
    add, restore, all, get, claim, release, releaseActor, take, nearest,
    snapshot, reset, nextId, stats: statsNow,
    get sources() { return list; },
  };
}
