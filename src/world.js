// Map registry and per-map state.

import { FIELD_BOUNDS } from './fieldshape.js';
// The meadow and the Studio are independent worlds: bears, camera, clock,
// cannon and counters are saved/restored when switching maps.

export const STUDIO = {
  id: 'studio',
  name: 'Studio',
  kind: 'sandbox',
  theme: 'editorial',
  hasLife: false,
  wallHeight: 8.0,
  defaultCeiling: 128,
  launcherHome(table, narrow) {
    return {
      x: -table.hx * (narrow ? 0.56 : 0.70),
      z:  table.hz * (narrow ? 0.42 : 0.74),
    };
  },
  placementExtra: null,
};

export const FIELD = {
  id: 'field',
  name: 'Meadow',
  kind: 'life',
  theme: 'aero',
  hasLife: true,
  wallHeight: 8.0,
  defaultCeiling: 40,
  bounds: FIELD_BOUNDS,
  camera: {
    target: [0, 1.7, 0],
    yaw: 0.30,
    pitch: 0.07,
    dist: 27,
    minDist: 3.2,
    maxDist: 88,
  },
  launcherHome() {
    return { x: -18, z: 22 };
  },
  placementExtra: null,
};

export const MAPS = { studio: STUDIO, field: FIELD };

const STORE_KEY = 'gummy.worlds.v2';
const MAP_KEY = 'gummy.map';
const STUDIO_LAUNCHER_KEY = 'gummy.studio.launcher';

// Storage is a best-effort preference store. Resolving the browser global,
// reading or writing may be denied; callers then fall back to in-memory state.
function defaultStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (err) { return null; }
}

function emptyLauncher() { return { x: null, z: null }; }

function emptyWorld(id) {
  return {
    id,
    launcher: emptyLauncher(),
    bears: null,
    glass: null,
    camera: null,
    gifts: [],
    initialized: false,
    time: id === 'field' ? 7.0 : null,
    auto: id === 'field',
    speed: 1,
  };
}

// Factory over injected storage access. `getStorage` is a getter (or storage
// object) resolved on every operation; construction and `hydrate` never touch
// the browser global unless the default getter is called by an explicit
// hydrate/persist/set operation.
export function createWorldState({ getStorage = defaultStorage } = {}) {
  function storage() {
    try {
      return typeof getStorage === 'function' ? getStorage() : getStorage;
    } catch (err) { return null; }
  }
  function readItem(key) {
    const store = storage();
    if (!store) return null;
    try { return store.getItem(key); } catch (err) { return null; }
  }
  function writeItem(key, value) {
    const store = storage();
    if (!store) return;
    try {
      store.setItem(key, value);
    } catch (err) {
      // Preference writes are best-effort; in-memory state remains authoritative.
      return;
    }
  }
  function readStore() {
    const raw = readItem(STORE_KEY);
    if (!raw) return {};
    try {
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (err) { return {}; }
  }
  function launcherFor(id, saved, fallback = emptyLauncher()) {
    const s = saved[id] && saved[id].launcher;
    if (s && Number.isFinite(s.x) && Number.isFinite(s.z)) return { x: s.x, z: s.z };
    if (id === 'studio') {
      const raw = readItem(STUDIO_LAUNCHER_KEY);
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
        } catch (err) {
          // A malformed legacy launcher falls through to the default position.
        }
      }
    }
    return { ...fallback };
  }
  function initialMapId() {
    const id = readItem(MAP_KEY);
    if (id === 'studio' || id === 'field') return id;
    return 'field';
  }

  const worlds = {
    studio: emptyWorld('studio'),
    field: emptyWorld('field'),
  };

  const activeWorld = {
    mapId: 'field',
    get launcher() { return worlds[this.mapId].launcher; },
    get state() { return worlds[this.mapId]; },
  };

  // Explicit hydration mutates the existing exported state (world objects,
  // gift arrays, activeWorld) instead of replacing it with a second store.
  function hydrate() {
    const saved = readStore();
    worlds.studio.launcher = launcherFor('studio', saved);
    worlds.field.launcher = launcherFor('field', saved);
    worlds.field.time = (saved.field && Number.isFinite(saved.field.time)) ? saved.field.time : 7.0;
    worlds.field.auto = saved.field ? saved.field.auto !== false : true;
    worlds.field.speed = saved.field && saved.field.speed ? saved.field.speed : 1;
    activeWorld.mapId = initialMapId();
    return activeWorld.mapId;
  }

  function getActiveMap() {
    return MAPS[activeWorld.mapId] || FIELD;
  }

  function getWorldState(id = activeWorld.mapId) {
    return worlds[id];
  }

  function saveLauncherPos(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const w = worlds[activeWorld.mapId];
    w.launcher = { x, z };
    persistWorld(activeWorld.mapId);
    if (activeWorld.mapId === 'studio') {
      writeItem(STUDIO_LAUNCHER_KEY, JSON.stringify({ x, z }));
    }
  }

  function persistWorld(id = activeWorld.mapId) {
    const w = worlds[id];
    try {
      const store = readStore();
      store[id] = {
        ...(store[id] || {}),
        launcher: w.launcher,
        time: w.time,
        auto: w.auto,
        speed: w.speed,
      };
      writeItem(STORE_KEY, JSON.stringify(store));
    } catch (err) {
      // Legacy preference persistence is best-effort. An unknown map id or an
      // unserializable value keeps the in-memory state but reports no write.
      return;
    }
  }

  function setActiveMap(id) {
    if (!MAPS[id]) return activeWorld.mapId;
    activeWorld.mapId = id;
    writeItem(MAP_KEY, id);
    return id;
  }

  return {
    worlds,
    activeWorld,
    hydrate,
    getActiveMap,
    getWorldState,
    saveLauncherPos,
    persistWorld,
    setActiveMap,
  };
}

const defaultState = createWorldState();

export const worlds = defaultState.worlds;
export const activeWorld = defaultState.activeWorld;

// App composition calls this once before its first `activeWorld` use. The
// default getter resolves browser storage only here, preserving the legacy
// best-effort behavior when storage is absent or denied.
export function hydrateWorld() {
  return defaultState.hydrate();
}

export function getActiveMap() {
  return defaultState.getActiveMap();
}

export function getWorldState(id = activeWorld.mapId) {
  return defaultState.getWorldState(id);
}

export function saveLauncherPos(x, z) {
  return defaultState.saveLauncherPos(x, z);
}

export function persistWorld(id = activeWorld.mapId) {
  return defaultState.persistWorld(id);
}

export function setActiveMap(id) {
  return defaultState.setActiveMap(id);
}
