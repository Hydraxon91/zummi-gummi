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

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (err) { return {}; }
}

const saved = readStore();

function launcherFor(id, fallback = { x: null, z: null }) {
  const s = saved[id] && saved[id].launcher;
  if (s && Number.isFinite(s.x) && Number.isFinite(s.z)) return { x: s.x, z: s.z };
  if (id === 'studio') {
    try {
      const raw = localStorage.getItem('gummy.studio.launcher');
      if (raw) {
        const p = JSON.parse(raw);
        if (Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
      }
    } catch (err) {}
  }
  return { ...fallback };
}

export const worlds = {
  studio: {
    id: 'studio',
    launcher: launcherFor('studio'),
    bears: null,
    glass: null,
    camera: null,
    initialized: false,
    time: null,
    auto: false,
    speed: 1,
  },
  field: {
    id: 'field',
    launcher: launcherFor('field'),
    bears: null,
    glass: null,
    camera: null,
    initialized: false,
    time: (saved.field && Number.isFinite(saved.field.time)) ? saved.field.time : 7.0,
    auto: saved.field ? saved.field.auto !== false : true,
    speed: saved.field && saved.field.speed ? saved.field.speed : 1,
  },
};

function initialMapId() {
  try {
    const id = localStorage.getItem(MAP_KEY);
    if (id === 'studio' || id === 'field') return id;
  } catch (err) {}
  return 'field';
}

export const activeWorld = {
  mapId: initialMapId(),
  get launcher() { return worlds[this.mapId].launcher; },
  get state() { return worlds[this.mapId]; },
};

export function getActiveMap() {
  return MAPS[activeWorld.mapId] || FIELD;
}

export function getWorldState(id = activeWorld.mapId) {
  return worlds[id];
}

export function saveLauncherPos(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const w = worlds[activeWorld.mapId];
  w.launcher = { x, z };
  persistWorld(activeWorld.mapId);
  if (activeWorld.mapId === 'studio') {
    try { localStorage.setItem('gummy.studio.launcher', JSON.stringify({ x, z })); } catch (err) {}
  }
}

export function persistWorld(id = activeWorld.mapId) {
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
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (err) {}
}

export function setActiveMap(id) {
  if (!MAPS[id]) return activeWorld.mapId;
  activeWorld.mapId = id;
  try { localStorage.setItem(MAP_KEY, id); } catch (err) {}
  return id;
}
