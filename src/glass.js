// Meadow Glass life adapter.
//
// Glass keeps its authored, skinned GLB and its rigid Box3D proxy. This module
// adds the common life state (needs, bonds, pregnancy, stage growth, home) and a
// hover controller, without joining the 24-body metaball soft-body pool.

import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { getSpecies } from './species.js';
import { defaultGenome, expressGenome, normalizeGenome } from './dna.js';
import {
  advanceAge, advanceGestation, ageForStage, scaleForStage,
  canMate, HOME_CAPACITY, MATE_TIME, MATE_COOLDOWN,
  GESTATION_TIME, MATE_FOOD_MIN,
} from './life.js';

const GLASS_SPECIES = getSpecies('glass');
const ASSET_URL = new URL('../' + GLASS_SPECIES.asset, import.meta.url).href;
const DEFAULT_COLOR = '#a8e5ff';
const MAX_ACTORS = 8;
const HOVER = .18;
const HOVER_BOB = .035;
const MOVE_SPEED = 1.35;
const SEEK_HUNGER = .64;
const SEEK_THIRST = .70;
const STOP_HUNGER = .35;
const STOP_THIRST = .30;
const HUNGER_RATE = .0022;
const THIRST_RATE = .0032;
const SOCIAL_RATE = .0012;
const AFFECTION_RATE = .0009;
const SEEK_SOCIAL = .64;
const SEEK_AFFECTION = .68;
const STOP_SOCIAL = .32;
const SOCIAL_TIME = 3.4;
const SOCIAL_COOLDOWN = 15;
const VISIT_CHANCE = .35;
const VISIT_BOND = .16;
const VISIT_TIME = 4.8;
const VISIT_DIST = 1.55;
const MATE_RADIUS = 22;
const MATE_DIST = 1.25;
const WANDER_MIN = 4.0;
const WANDER_MAX = 12.0;
const DAY_START = 8;
const DAY_END = 18;
const SHELTER_START = 9;
const SHELTER_END = 16;
const STAGE_ORDER = ['baby', 'teen', 'adult'];

const GLASS = {
  thickness: .32,
  ior: 1.45,
  attenuationDistance: 1.8,
  attenuationColor: 0x4f9fc8,
  envMapIntensity: 1.6,
  clearcoat: 1,
  clearcoatRoughness: .04,
  reflectivity: 1,
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function hexColor(value, fallback = DEFAULT_COLOR) {
  return isHexColor(value) ? value : fallback;
}

function blendHex(a, b, rng = Math.random) {
  const ca = hexColor(a).slice(1);
  const cb = hexColor(b).slice(1);
  const mix = [0, 2, 4].map(i => {
    const va = parseInt(ca.slice(i, i + 2), 16);
    const vb = parseInt(cb.slice(i, i + 2), 16);
    return clamp(Math.round(va + (vb - va) * (.35 + rng() * .3)), 0, 255);
  });
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

let assetPromise = null;
function loadAsset() {
  if (!assetPromise) {
    assetPromise = import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(ASSET_URL))
      .catch(err => {
        assetPromise = null;
        throw err;
      });
  }
  return assetPromise;
}

function makeShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(22,18,12,.40)');
  gradient.addColorStop(.42, 'rgba(22,18,12,.23)');
  gradient.addColorStop(1, 'rgba(22,18,12,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, .92),
    new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false, opacity: .9,
    }),
  );
  mesh.name = 'glassContactShadow';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .004;
  mesh.renderOrder = 1;
  mesh.raycast = () => {};
  return mesh;
}

function makeAI() {
  return {
    state: 'wander',
    nextThink: .1,
    target: null,
    path: null,
    pathIndex: 0,
    moving: false,
    arrived: false,
    partner: null,
    source: null,
    waterSpot: null,
    follow: null,
    mateT: 0,
    waitForPartner: false,
    socialT: 0,
    idleT: 0,
    insideT: 0,
    visitHome: null,
    visitRole: null,
    visitPhase: null,
    visitT: 0,
    visitArrived: false,
    visitHearts: 0,
    faceYaw: null,
    socialCooldown: 0,
    taskCooldown: 0,
    familyPlay: false,
    playmateKind: null,
    familyPlayCooldown: 0,
    shelter: false,
    animT: 0,
    directive: null,
    directives: [],
    directiveStatus: null,
    possessed: false,
  };
}

function normalizeGlassGenome(input) {
  const genome = normalizeGenome(input ? JSON.parse(JSON.stringify(input)) : defaultGenome('glass'));
  genome.species = { glass: 1 };
  genome.phenotype = 'skinned-glass';
  genome.hybridTarget = null;
  genome.genes.material = 'glass';
  if (!isHexColor(genome.genes.color)) genome.genes.color = DEFAULT_COLOR;
  return genome;
}

export function createGlassColony({
  scene,
  physics,
  getField,
  getHours,
  getBears,
  nextUid,
  takeName,
  beginCrossMate,
  birthFromGlass,
} = {}) {
  const actors = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const bodyRead = new Float32Array(7);
  let meadow = false;
  let nextLocalUid = 100000;
  let clock = 0;

  const uid = typeof nextUid === 'function'
    ? () => nextUid()
    : () => nextLocalUid++;
  const nameFor = typeof takeName === 'function'
    ? () => takeName()
    : () => `Glass ${nextLocalUid}`;
  const hoursNow = typeof getHours === 'function' ? getHours : () => 12;
  const bearList = () => {
    const list = typeof getBears === 'function' ? getBears() : [];
    return Array.isArray(list) ? list : [];
  };
  const fieldNow = () => (typeof getField === 'function' ? getField() : null);

  function homeResidents(name) {
    if (!name) return 0;
    let n = 0;
    for (const b of bearList()) if (b && b.active && b.home === name) n++;
    for (const a of actors) if (a.active && a.home === name) n++;
    return n;
  }

  function assignHome(a) {
    const field = fieldNow();
    if (!field || !Array.isArray(field.homes) || !field.homes.length) return '';
    if (a.home) {
      const existing = field.homes.find(h => h.name === a.home);
      if (existing && homeResidents(a.home) < HOME_CAPACITY) return existing.name;
    }
    let best = null;
    let bestCount = Infinity;
    for (const home of field.homes) {
      const n = homeResidents(home.name);
      if (n < bestCount) { best = home; bestCount = n; }
    }
    a.home = best ? best.name : '';
    return a.home;
  }

  function isDay(hours = hoursNow()) {
    return Number.isFinite(hours) && hours >= DAY_START && hours < DAY_END;
  }

  function safeFoodCount() {
    const field = fieldNow();
    return field && field.food && field.food.allRipe
      ? field.food.allRipe({ kinds: ['flower', 'fruit'] }).length
      : 0;
  }

  function setMoving(a, x, z) {
    const field = fieldNow();
    if (!field || !field.nav) return false;
    const near = field.nav.nearestWalkable(x, z);
    if (!near) return false;
    const path = field.nav.findPath(a.cx, a.cz, near.x, near.z);
    a.ai.path = path && path.length ? path : [{ x: near.x, z: near.z }];
    a.ai.pathIndex = 0;
    a.ai.target = { x: near.x, z: near.z };
    a.ai.moving = true;
    a.ai.arrived = false;
    a.ai.faceYaw = Math.atan2(near.x - a.cx, near.z - a.cz);
    return true;
  }

  function clearPath(a) {
    a.ai.path = null;
    a.ai.pathIndex = 0;
    a.ai.moving = false;
    a.ai.arrived = false;
  }

  function routePoint(a) {
    const path = a.ai.path;
    if (!path || !path.length) return a.ai.target;
    let i = a.ai.pathIndex | 0;
    while (i < path.length - 1) {
      const p = path[i];
      if (Math.hypot(p.x - a.cx, p.z - a.cz) > .25) break;
      i++;
    }
    a.ai.pathIndex = i;
    return path[i] || a.ai.target;
  }

  function move(a, dt) {
    if (!a.ai.moving) return;
    const p = routePoint(a);
    if (!p) { clearPath(a); return; }
    const dx = p.x - a.cx;
    const dz = p.z - a.cz;
    const d = Math.hypot(dx, dz);
    if (d < .06) {
      a.cx = p.x;
      a.cz = p.z;
      a.ai.pathIndex = (a.ai.pathIndex | 0) + 1;
      if (!a.ai.path || a.ai.pathIndex >= a.ai.path.length) {
        clearPath(a);
        a.ai.arrived = true;
      }
      return;
    }
    const step = Math.min(d, MOVE_SPEED * Math.max(0, dt));
    const ux = dx / d;
    const uz = dz / d;
    a.cx += ux * step;
    a.cz += uz * step;
    a.yaw = Math.atan2(ux, uz);
    a.ai.faceYaw = a.yaw;
  }

  function moveToward(a, x, z, dt, speed = MOVE_SPEED) {
    const dx = x - a.cx;
    const dz = z - a.cz;
    const d = Math.hypot(dx, dz);
    if (d < .01) return d;
    const step = Math.min(d, speed * Math.max(0, dt));
    const ux = dx / d;
    const uz = dz / d;
    a.cx += ux * step;
    a.cz += uz * step;
    a.yaw = Math.atan2(ux, uz);
    a.ai.faceYaw = a.yaw;
    return d;
  }

  function releaseFood(a) {
    const field = fieldNow();
    if (field && field.food && a.ai.source) field.food.release(a.ai.source, a);
    a.ai.source = null;
  }

  function acquireFood(a) {
    const field = fieldNow();
    if (!field || !field.food || a.ai.source) return false;
    const source = field.food.nearestRipe(a.cx, a.cz, {
      maxDistance: 44,
      bear: a,
      kinds: ['flower', 'fruit'],
    });
    if (!source || !field.food.claim(source, a)) return false;
    if (!setMoving(a, source.approachX, source.approachZ)) {
      field.food.release(source, a);
      return false;
    }
    a.ai.source = source;
    a.ai.state = 'seekFood';
    a.ai.faceYaw = Math.atan2(source.approachX - a.cx, source.approachZ - a.cz);
    return true;
  }

  function acquireWater(a) {
    const field = fieldNow();
    if (!field || !Array.isArray(field.waterSpots) || !field.waterSpots.length) return false;
    let best = null;
    let bestD = Infinity;
    for (const spot of field.waterSpots) {
      const d = Math.hypot(spot.x - a.cx, spot.z - a.cz);
      if (d < bestD) { bestD = d; best = spot; }
    }
    if (!best || !setMoving(a, best.x, best.z)) return false;
    a.ai.waterSpot = best;
    a.ai.state = 'seekWater';
    a.ai.faceYaw = Math.atan2(best.x - a.cx, best.z - a.cz);
    return true;
  }

  function finishFood(a) {
    const field = fieldNow();
    const source = a.ai.source;
    if (source && field && field.food && field.food.consume(source, a)) {
      a.hunger = Math.max(0, a.hunger - source.satiation);
    }
    a.ai.source = null;
    a.ai.waterSpot = null;
    a.ai.state = 'wander';
    a.ai.idleT = .5;
    a.ai.taskCooldown = 1.2;
    clearPath(a);
  }

  function finishWater(a) {
    a.thirst = Math.max(0, a.thirst - .52);
    a.ai.waterSpot = null;
    a.ai.state = 'wander';
    a.ai.idleT = .5;
    a.ai.taskCooldown = 1.0;
    clearPath(a);
  }

  function parentFor(a) {
    for (const uid of a.parentUids || []) {
      const parent = [...actors, ...bearList()].find(actor => actor && actor.active && actor.uid === uid);
      if (parent) return parent;
    }
    return null;
  }

  function parentTarget(parent) {
    if (!parent) return null;
    if (parent.inside || parent.sleeping) {
      const field = fieldNow();
      const home = field && Array.isArray(field.homes)
        ? field.homes.find(h => h.name === parent.home)
        : null;
      if (home) return { x: home.door.x, z: home.door.z };
    }
    return { x: parent.cx, z: parent.cz };
  }

  function startFollow(a, parent) {
    const target = parentTarget(parent);
    if (!target) return false;
    a.ai.follow = parent;
    a.ai.state = 'follow';
    a.ai.idleT = 0;
    if (!setMoving(a, target.x, target.z)) {
      a.ai.state = 'wander';
      return false;
    }
    return true;
  }

  function pairBond(a, b) {
    const av = a.bonds && Number(a.bonds[String(b.uid)]);
    const bv = b.bonds && Number(b.bonds[String(a.uid)]);
    return (finite(av, 0) + finite(bv, 0)) * .5;
  }

  function addBond(a, b, amount) {
    if (!a || !b || a === b) return 0;
    if (!a.bonds || typeof a.bonds !== 'object') a.bonds = {};
    if (!b.bonds || typeof b.bonds !== 'object') b.bonds = {};
    const next = clamp(pairBond(a, b) + amount, 0, 1);
    a.bonds[String(b.uid)] = next;
    b.bonds[String(a.uid)] = next;
    return next;
  }

  function canSocialWith(a, other) {
    if (!a || !other || other === a || !other.active || other.inside) return false;
    if (other.grabs > 0 || other.inPond || other.sleeping) return false;
    if (!other.ai || other.ai.partner) return false;
    if (!['wander', 'stargaze'].includes(other.ai.state)) return false;
    return other.health >= 15;
  }

  function findSocial(a) {
    if (a.ai.socialCooldown > 0) return null;
    if (a.social < SEEK_SOCIAL && a.affection < SEEK_AFFECTION) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of [...bearList(), ...actors]) {
      if (!canSocialWith(a, other)) continue;
      const d = Math.hypot(other.cx - a.cx, other.cz - a.cz);
      if (d > 22) continue;
      const score = pairBond(a, other) * 1.2 + finite(other.social, .3) * .5 - d * .025;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    return best;
  }

  function familyRelation(a, other) {
    if (!a || !other || other === a) return null;
    const aParents = a.parentUids || [];
    const bParents = other.parentUids || [];
    if (aParents.length && bParents.some(uid => aParents.includes(uid))) return 'sibling';
    if (aParents.includes(other.uid)) return 'parent';
    if (bParents.includes(a.uid)) return 'child';
    return null;
  }

  function findFamilyPlaymate(a) {
    if (!a || a.stage === 'adult' || a.ai.familyPlayCooldown > 0) return null;
    if (!a.parentUids || !a.parentUids.length) return null;
    if (a.ai.socialCooldown > 0) return null;
    let best = null;
    let bestScore = -Infinity;
    let bestKind = null;
    for (const other of [...actors, ...bearList()]) {
      if (!canSocialWith(a, other)) continue;
      const kind = familyRelation(a, other);
      if (!kind) continue;
      if (kind !== 'sibling' && kind !== 'parent') continue;
      const d = Math.hypot(other.cx - a.cx, other.cz - a.cz);
      if (d > 12) continue;
      const score = (kind === 'sibling' ? .35 : .2) + pairBond(a, other) * .8 - d * .03;
      if (score > bestScore) {
        bestScore = score;
        best = other;
        bestKind = kind;
      }
    }
    return best ? { actor: best, kind: bestKind } : null;
  }

  function startFamilyPlay(a, mate) {
    if (!a || !mate || !mate.actor) return false;
    a.ai.familyPlay = true;
    a.ai.playmateKind = mate.kind;
    a.ai.partner = mate.actor;
    a.ai.state = 'seekSocial';
    if (mate.actor.kind === 'glass' && mate.actor.ai) {
      mate.actor.ai.partner = a;
      mate.actor.ai.state = 'seekSocial';
      mate.actor.ai.familyPlay = true;
      mate.actor.ai.playmateKind = mate.kind;
      mate.actor.ai.target = { x: a.cx, z: a.cz };
      mate.actor.ai.moving = false;
      mate.actor.ai.path = null;
    }
    if (!setMoving(a, mate.actor.cx, mate.actor.cz)) {
      a.ai.familyPlay = false;
      a.ai.partner = null;
      a.ai.state = 'wander';
      return false;
    }
    return true;
  }

  function startSeekSocial(a, partner) {
    a.ai.partner = partner;
    a.ai.state = 'seekSocial';
    if (!setMoving(a, partner.cx, partner.cz)) {
      a.ai.partner = null;
      a.ai.state = 'wander';
      return false;
    }
    return true;
  }

  function startSocial(a) {
    const partner = a.ai.partner;
    if (!partner || !partner.active) {
      a.ai.partner = null;
      a.ai.state = 'wander';
      return;
    }
    a.ai.state = 'social';
    a.ai.socialT = SOCIAL_TIME;
    a.ai.moving = false;
    clearPath(a);
    a.ai.faceYaw = Math.atan2(partner.cx - a.cx, partner.cz - a.cz);
    const field = fieldNow();
    if (field && field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
  }

  function startVisitPair(a, b) {
    if (!a || !b || !a.active || !b.active || a === b) return false;
    if (a.inside || b.inside || a.sleeping || b.sleeping || a.freeBody || b.freeBody) return false;
    const field = fieldNow();
    if (!field || !Array.isArray(field.homes) || !field.nav) return false;
    if (!isDay(hoursNow())) return false;
    const host = a.home ? a : (b.home ? b : null);
    if (!host) return false;
    const guest = host === a ? b : a;
    const home = field.homes.find(h => h.name === host.home);
    if (!home) return false;
    const dx = home.door.x - home.x;
    const dz = home.door.z - home.z;
    const len = Math.hypot(dx, dz) || 1;
    let gx = home.door.x - dz / len * .72;
    let gz = home.door.z + dx / len * .72;
    const near = field.nav.nearestWalkable(gx, gz);
    if (near) {
      gx = near.x;
      gz = near.z;
    }
    const setup = (actor, partner, role, target) => {
      if (!actor || !actor.ai) return;
      actor.ai.state = 'visit';
      actor.ai.partner = partner;
      actor.ai.visitHome = home.name;
      actor.ai.visitRole = role;
      actor.ai.visitPhase = 'travel';
      actor.ai.visitT = 0;
      actor.ai.visitArrived = false;
      actor.ai.visitHearts = 0;
      actor.ai.moving = false;
      actor.ai.path = null;
      actor.ai.target = target;
      actor.ai.faceYaw = Math.atan2(target.x - actor.cx, target.z - actor.cz);
      setMoving(actor, target.x, target.z);
    };
    setup(host, guest, 'host', { x: home.door.x, z: home.door.z });
    setup(guest, host, 'guest', { x: gx, z: gz });
    return true;
  }

  function finishVisit(a) {
    const partner = a.ai.partner;
    const finishSide = (actor) => {
      if (!actor || !actor.ai) return;
      actor.ai.state = 'wander';
      actor.ai.partner = null;
      actor.ai.visitHome = null;
      actor.ai.visitRole = null;
      actor.ai.visitPhase = null;
      actor.ai.visitT = 0;
      actor.ai.visitArrived = false;
      actor.ai.moving = false;
      actor.ai.path = null;
      actor.ai.idleT = .55;
      actor.ai.taskCooldown = 1.0;
    };
    if (partner && partner.active) addBond(a, partner, .08);
    a.social = Math.max(0, a.social - .22);
    a.affection = Math.max(0, a.affection - .16);
    a.ai.socialCooldown = 8;
    finishSide(a);
    if (partner && partner.ai && partner.ai.partner === a) {
      partner.social = Math.max(0, finite(partner.social, .3) - .22);
      partner.affection = Math.max(0, finite(partner.affection, .25) - .16);
      finishSide(partner);
    }
  }

  function updateVisit(a, dt) {
    const partner = a.ai.partner;
    if (!isDay(hoursNow())) {
      finishVisit(a);
      return;
    }
    if (!partner || !partner.active || !a.ai.visitHome) {
      finishVisit(a);
      return;
    }
    const field = fieldNow();
    const home = field && Array.isArray(field.homes)
      ? field.homes.find(h => h.name === a.ai.visitHome)
      : null;
    if (!home) {
      finishVisit(a);
      return;
    }
    if (a.ai.visitPhase === 'hangout') {
      a.ai.visitT = Math.max(0, (a.ai.visitT || 0) - dt);
      a.ai.visitHearts = Math.max(0, (a.ai.visitHearts || 0) - dt);
      if (a.ai.visitHearts <= 0) {
        a.ai.visitHearts = 1.1;
        if (field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
      }
      if (a.ai.visitT <= 0) finishVisit(a);
      return;
    }
    a.ai.visitT = (a.ai.visitT || 0) + dt;
    if (a.ai.visitT > 12) {
      finishVisit(a);
      return;
    }
    const target = a.ai.target;
    if (!target) {
      finishVisit(a);
      return;
    }
    const d = Math.hypot(target.x - a.cx, target.z - a.cz);
    if (d <= VISIT_DIST) {
      a.ai.visitArrived = true;
      a.ai.moving = false;
      clearPath(a);
      if (partner.ai && partner.ai.visitArrived) {
        a.ai.visitPhase = 'hangout';
        a.ai.visitT = VISIT_TIME;
        a.ai.visitHearts = 0;
        if (partner.ai) {
          partner.ai.visitPhase = 'hangout';
          partner.ai.visitT = VISIT_TIME;
          partner.ai.visitHearts = 0;
        }
        if (field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
      }
      return;
    }
    if (!a.ai.path || !a.ai.path.length) setMoving(a, target.x, target.z);
    move(a, dt);
  }

  function finishSocial(a) {
    const partner = a.ai.partner;
    let canVisit = false;
    const familyPlay = !!a.ai.familyPlay;
    if (partner && partner.active) {
      const bond = addBond(a, partner, (familyPlay ? .18 : .14) + Math.random() * .06);
      a.social = Math.max(0, a.social - .42);
      a.affection = Math.max(0, a.affection - .30);
      if (familyPlay) {
        addBond(a, partner, .08);
        a.ai.familyPlayCooldown = 18;
        if (partner.ai && partner.ai.familyPlay) {
          partner.ai.familyPlayCooldown = 18;
          partner.ai.familyPlay = false;
          partner.ai.playmateKind = null;
        }
      }
      if (partner.kind !== 'glass') {
        partner.social = Math.max(0, finite(partner.social, .3) - .18);
        partner.affection = Math.max(0, finite(partner.affection, .25) - .12);
      }
      canVisit = bond >= VISIT_BOND && isDay(hoursNow()) && Math.random() < VISIT_CHANCE;
      a.ai.familyPlay = false;
      a.ai.playmateKind = null;
      if (canVisit && startVisitPair(a, partner)) return;
    }
    a.ai.partner = null;
    a.ai.state = 'wander';
    a.ai.idleT = .5;
    a.ai.socialCooldown = SOCIAL_COOLDOWN;
    a.ai.taskCooldown = 1.0;
    clearPath(a);
  }

  function canMateWith(a, other) {
    if (!a || !other || other === a || !other.active || other.inside || a.freeBody || other.freeBody) return false;
    if (other.sleeping || other.grabs > 0 || other.inPond) return false;
    if (!other.ai || other.ai.partner) return false;
    if (!['wander', 'seekMate', 'stargaze'].includes(other.ai.state)) return false;
    return canMate(a, other, { room: true, food: safeFoodCount() >= MATE_FOOD_MIN });
  }

  function findMate(a) {
    if (a.freeBody || a.pregnant || a.stage !== 'adult' || a.mateCooldown > 0) return null;
    if (a.health < 70 || a.hunger > .40 || a.thirst > .60 || a.energy < .30) return null;
    if (safeFoodCount() < MATE_FOOD_MIN) return null;
    let best = null;
    let bestScore = -Infinity;
    for (const other of [...actors, ...bearList()]) {
      if (!canMateWith(a, other)) continue;
      const d = Math.hypot(other.cx - a.cx, other.cz - a.cz);
      if (d > MATE_RADIUS) continue;
      const score = pairBond(a, other) * .4 - d * .02 + (Math.random() - .5) * .05;
      if (score > bestScore) { bestScore = score; best = other; }
    }
    return best;
  }

  function startSeekMate(a, partner) {
    a.ai.partner = partner;
    a.ai.state = 'seekMate';
    if (!setMoving(a, partner.cx, partner.cz)) {
      a.ai.partner = null;
      a.ai.state = 'wander';
      return false;
    }
    return true;
  }

  function startLocalMate(a, b) {
    if (!a || !b || !a.ai || !b.ai) return false;
    a.ai.state = 'mate';
    b.ai.state = 'mate';
    a.ai.partner = b;
    b.ai.partner = a;
    a.ai.mateT = MATE_TIME;
    b.ai.mateT = MATE_TIME;
    a.ai.waitForPartner = false;
    b.ai.waitForPartner = false;
    a.ai.moving = false;
    b.ai.moving = false;
    clearPath(a);
    clearPath(b);
    a.ai.faceYaw = Math.atan2(b.cx - a.cx, b.cz - a.cz);
    b.ai.faceYaw = Math.atan2(a.cx - b.cx, a.cz - b.cz);
    const field = fieldNow();
    if (field && field.emote) {
      field.emote(a.cx, a.cy + 1.0, a.cz, 'heart');
      field.emote(b.cx, b.cy + 1.0, b.cz, 'heart');
    }
    return true;
  }

  function finishLocalMate(a) {
    if (!a || !a.ai || a.ai.state !== 'mate') return;
    const b = a.ai.partner;
    if (!b || !b.active) {
      a.ai.state = 'wander';
      a.ai.partner = null;
      a.ai.mateT = 0;
      return;
    }
    const female = a.sex === 'F' ? a : b;
    const male = female === a ? b : a;
    if (!female.pregnant) {
      female.pregnant = true;
      female.gestation = GESTATION_TIME;
      female.fatherUid = male.uid;
      female.birthRetryT = 0;
    }
    a.mateCooldown = MATE_COOLDOWN;
    b.mateCooldown = MATE_COOLDOWN;
    addBond(a, b, .12);
    for (const item of [a, b]) {
      item.ai.state = 'wander';
      item.ai.partner = null;
      item.ai.mateT = 0;
      item.ai.waitForPartner = false;
      item.ai.idleT = .55;
      item.ai.taskCooldown = 1.6;
      clearPath(item);
    }
    const field = fieldNow();
    if (field && field.emote) field.emote(female.cx, female.cy + 1.1, female.cz, 'heart');
  }

  function finishSeekMate(a) {
    const partner = a.ai.partner;
    if (!partner || !partner.active || partner.ai?.partner !== a) {
      a.ai.partner = null;
      a.ai.state = 'wander';
      clearPath(a);
      return;
    }
    const d = Math.hypot(partner.cx - a.cx, partner.cz - a.cz);
    if (d > MATE_DIST) {
      setMoving(a, partner.cx, partner.cz);
      return;
    }
    clearPath(a);
    if (partner.kind === 'glass') {
      if (partner.ai.state === 'seekMate' || partner.ai.state === 'wander') startLocalMate(a, partner);
      else a.ai.state = 'wander';
      return;
    }
    if (typeof beginCrossMate === 'function' && beginCrossMate(a, partner)) {
      a.ai.state = 'mate';
      a.ai.partner = partner;
      a.ai.waitForPartner = true;
      a.ai.moving = false;
    } else {
      a.ai.partner = null;
      a.ai.state = 'wander';
      a.ai.idleT = .5;
    }
  }

  function startSeekHome(a) {
    const field = fieldNow();
    if (!field || !Array.isArray(field.homes)) return false;
    const home = field.homes.find(h => h.name === a.home) || null;
    if (!home) return false;
    a.ai.shelter = true;
    a.ai.state = 'seekHome';
    if (!setMoving(a, home.door.x, home.door.z)) {
      a.ai.shelter = false;
      a.ai.state = 'wander';
      return false;
    }
    return true;
  }

  function enterHome(a) {
    const field = fieldNow();
    const home = field && Array.isArray(field.homes)
      ? field.homes.find(h => h.name === a.home)
      : null;
    if (home) {
      a.cx = home.door.x;
      a.cz = home.door.z;
    }
    a.inside = true;
    a.doorFade = 1;
    a.doorTarget = 0;
    a.ai.state = 'inside';
    a.ai.insideT = 34 + Math.random() * 58;
    a.ai.moving = false;
    a.ai.shelter = false;
    clearPath(a);
    a.shelteredToday = true;
    destroyBody(a);
    if (home && field && field.emote) field.emote(home.door.x, .85, home.door.z, 'sparkle');
  }

  function emerge(a) {
    const field = fieldNow();
    const home = field && Array.isArray(field.homes)
      ? field.homes.find(h => h.name === a.home)
      : null;
    if (home && field.emote) field.emote(home.door.x, .85, home.door.z, 'sparkle');
    a.inside = false;
    a.doorFade = 0;
    a.doorTarget = 1;
    a.ai.state = 'exit';
    a.ai.insideT = 0;
    a.ai.idleT = .4;
    a.shelteredToday = true;
    ensureBody(a);
  }

  function pickWanderTarget(a) {
    const field = fieldNow();
    if (!field || !field.nav) return false;
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
      const x = a.cx + Math.cos(angle) * radius;
      const z = a.cz + Math.sin(angle) * radius;
      const near = field.nav.nearestWalkable(x, z);
      if (!near || Math.hypot(near.x - x, near.z - z) > 2.2) continue;
      if (field.pond && field.pond.contains && field.pond.contains(near.x, near.z)) continue;
      if (!setMoving(a, near.x, near.z)) continue;
      a.ai.state = 'wander';
      return true;
    }
    return false;
  }

  function think(a) {
    const field = fieldNow();
    if (!field) return;
    const hours = hoursNow();
    const day = isDay(hours);
    const canShelter = day && hours >= SHELTER_START && hours < SHELTER_END &&
      !a.shelteredToday && a.home && a.shelterCheckT <= 0;
    if (canShelter) {
      a.shelterCheckT = 24 + Math.random() * 24;
      if (Math.random() < .34 && startSeekHome(a)) return;
    }
    if (!a.pregnant && a.stage === 'adult' && a.mateCooldown <= 0 &&
        a.health >= 70 && a.hunger <= .40 && a.thirst <= .60 && a.energy >= .30 &&
        safeFoodCount() >= MATE_FOOD_MIN && Math.random() < .10) {
      const mate = findMate(a);
      if (mate && startSeekMate(a, mate)) return;
    }
    if (a.hunger > SEEK_HUNGER && acquireFood(a)) return;
    if (a.thirst > SEEK_THIRST && acquireWater(a)) return;
    if (a.stage !== 'adult' && a.ai.familyPlayCooldown <= 0 &&
        (a.social > .45 || Math.random() < .035)) {
      const mate = findFamilyPlaymate(a);
      if (mate && startFamilyPlay(a, mate)) return;
    }
    if (a.stage === 'baby') {
      const parent = parentFor(a);
      if (parent) {
        const target = parentTarget(parent);
        const d = target ? Math.hypot(target.x - a.cx, target.z - a.cz) : Infinity;
        if (d > 2.2) {
          if (startFollow(a, parent)) return;
        } else {
          a.ai.follow = parent;
          a.ai.state = 'follow';
          a.ai.idleT = .4;
          a.ai.moving = false;
          clearPath(a);
          return;
        }
      }
    }
    if ((a.social > SEEK_SOCIAL || a.affection > SEEK_AFFECTION) && a.ai.socialCooldown <= 0) {
      const friend = findSocial(a);
      if (friend && startSeekSocial(a, friend)) return;
      a.ai.socialCooldown = 4;
    }
    if (!day && Math.random() < .10) {
      a.ai.state = 'stargaze';
      a.ai.idleT = 3 + Math.random() * 5;
      clearPath(a);
      return;
    }
    if (pickWanderTarget(a)) return;
    a.ai.state = 'wander';
    a.ai.idleT = 1.5;
  }

  function applyStage(a, stage, opts = {}) {
    if (!a || !a.active || !STAGE_ORDER.includes(stage)) return false;
    const size = finite(a.genome?.genes?.size, 1);
    a.stage = stage;
    a.age = Number.isFinite(opts.age) ? opts.age : a.age;
    if (a.freeBody) endFreeBody(a);
    a.scale = clamp(scaleForStage(stage) * size, .35, 1.8);
    a.root.scale.setScalar(a.scale);
    if (stage !== 'baby') {
      a.ai.follow = null;
      if (a.ai.state === 'follow') {
        a.ai.state = 'wander';
        a.ai.idleT = .4;
        clearPath(a);
      }
    }
    destroyBody(a);
    ensureBody(a);
    return true;
  }

  function ensureBody(a) {
    if (!physics || !a.active || a.inside || !meadow || a.bodyHandle >= 0) return;
    const radius = Math.max(.12, .33 * a.scale);
    a.bodyRadius = radius;
    a.bodyHandle = physics.sphere(
      a.cx, a.cy, a.cz, radius, 1.2, -2000 - a.uid,
      .55, .52, true, true,
    );
    a.bodyY = a.cy;
  }

  function destroyBody(a) {
    if (a.bodyHandle >= 0 && physics) physics.destroy(a.bodyHandle);
    a.bodyHandle = -1;
  }

  function syncBody(a) {
    if (!physics || !a.active || a.inside || !meadow || a.freeBody) {
      if (!a.freeBody) destroyBody(a);
      return;
    }
    if (a.bodyHandle < 0) ensureBody(a);
    if (a.bodyHandle < 0) return;
    const radius = Math.max(.12, .33 * a.scale);
    if (Math.abs(radius - a.bodyRadius) > .01) {
      destroyBody(a);
      ensureBody(a);
      if (a.bodyHandle < 0) return;
    }
    physics.setPositions([a.bodyHandle], [a.cx, a.cy, a.cz], 1);
    physics.setVelocities([a.bodyHandle], [0, 0, 0], 1);
  }

  function updateVisual(a) {
    const fade = clamp(a.doorFade ?? 1, 0, 1);
    const visualScale = a.scale * (a.pregnant ? 1.035 : 1) * fade;
    if (fade <= .01) {
      a.root.visible = false;
      a.shadow.visible = false;
      a.root.updateMatrixWorld(true);
      return;
    }
    if (a.freeBody) {
      const rootY = Math.max(.01, a.cy - (a.height || 1.25) * visualScale * .5);
      a.root.position.set(a.cx, rootY, a.cz);
      a.root.rotation.set(a.tumbleX, a.yaw || 0, a.tumbleZ);
      a.root.scale.setScalar(visualScale);
      a.shadow.position.y = (.004 - rootY) / Math.max(.001, visualScale);
      a.shadow.scale.setScalar(1);
      a.root.visible = meadow;
      a.shadow.visible = meadow;
      a.root.updateMatrixWorld(true);
      return;
    }
    const bob = a.inside || a.grabbing ? 0 : Math.sin(clock * 2.2 + a.phase) * HOVER_BOB;
    const y = a.grabbing || a.coasting ? a.grabY : HOVER * a.scale + bob;
    a.root.position.set(a.cx, y, a.cz);
    a.root.rotation.set(a.tumbleX, a.yaw || 0, a.tumbleZ);
    a.root.scale.setScalar(visualScale);
    a.cy = y + (a.height || 1.25) * visualScale * .5;
    a.shadow.position.y = (.004 - y) / Math.max(.001, visualScale);
    a.shadow.scale.setScalar(1);
    const visible = meadow;
    a.root.visible = visible;
    a.shadow.visible = visible;
    a.root.updateMatrixWorld(true);
  }

  function stopGrabTasks(a) {
    releaseFood(a);
    if (a.ai.partner) {
      const partner = a.ai.partner;
      if (partner.ai && partner.ai.partner === a) {
        partner.ai.partner = null;
        partner.ai.moving = false;
        partner.ai.path = null;
        if (['social', 'invite', 'decline', 'mate', 'seekCompany', 'seekMate', 'seekSocial', 'visit'].includes(partner.ai.state)) {
          partner.ai.state = 'wander';
          partner.ai.idleT = .4;
          partner.ai.visitHome = null;
          partner.ai.visitRole = null;
          partner.ai.visitPhase = null;
        }
      }
      a.ai.partner = null;
    }
    a.ai.state = 'wander';
    a.ai.visitHome = null;
    a.ai.visitRole = null;
    a.ai.visitPhase = null;
    a.ai.visitT = 0;
    a.ai.visitArrived = false;
    a.ai.moving = false;
    a.ai.path = null;
    a.ai.pathIndex = 0;
    a.ai.waitForPartner = false;
    a.ai.mateT = 0;
    a.ai.socialT = 0;
    a.ai.inviteT = 0;
  }

  function beginDrag(a, clientX, clientY, camera, renderer) {
    if (!a || !a.active || a.inside || a.grabbing || !meadow || !camera || !renderer) return false;
    a.grabbing = true;
    a.grabs = 1;
    a.freeBody = false;
    a.freeT = 0;
    a.coasting = false;
    a.throwT = 0;
    a.grabVx = 0;
    a.grabVz = 0;
    a.grabVy = 0;
    a.grabY = a.root.position.y;
    a.grabStartY = a.cy;
    a.grabStartClientY = clientY;
    a.grabLastAt = performance.now();
    a.grabDepth = Math.max(2.5, camera.position.distanceTo(a.root.position));
    stopGrabTasks(a);
    drag(a, clientX, clientY, camera, renderer, false);
    return true;
  }

  function drag(a, clientX, clientY, camera, renderer, shift = false) {
    if (!a || !a.active || !a.grabbing || !camera || !renderer) return false;
    const now = performance.now();
    const dt = Math.max(.001, (now - (a.grabLastAt || now)) / 1000);
    const prevX = a.cx, prevZ = a.cz, prevY = a.grabY;
    if (shift) {
      a.grabY = clamp(
        a.grabY + (a.grabStartClientY - clientY) * .006,
        HOVER * a.scale + .02,
        2.9,
      );
    } else {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const point = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, a.grabDepth);
      const field = fieldNow();
      const near = field && field.nav && field.nav.nearestWalkable
        ? field.nav.nearestWalkable(point.x, point.z)
        : point;
      if (near) {
        a.cx = near.x;
        a.cz = near.z;
      }
      a.ai.faceYaw = Math.atan2(point.x - a.cx, point.z - a.cz);
    }
    const k = 1 - Math.exp(-12 * dt);
    a.grabVx += ((a.cx - prevX) / dt - a.grabVx) * k;
    a.grabVz += ((a.cz - prevZ) / dt - a.grabVz) * k;
    a.grabVy += ((a.grabY - prevY) / dt - a.grabVy) * k;
    a.grabStartClientY = clientY;
    a.grabLastAt = now;
    updateVisual(a);
    syncBody(a);
    return true;
  }

  function endDrag(a, throwIt = true) {
    if (!a || !a.grabbing) return false;
    const speed = Math.hypot(a.grabVx, a.grabVz);
    a.grabbing = false;
    a.grabs = 0;
    a.ai.state = 'wander';
    a.ai.idleT = .35;
    a.ai.nextThink = 0;
    a.ai.faceYaw = null;
    if (throwIt && physics && (speed > .18 || Math.abs(a.grabVy) > .18)) {
      ensureBody(a);
      if (a.bodyHandle >= 0) {
        a.freeBody = true;
        a.freeT = 2.2;
        a.coasting = false;
        const vx = clamp(a.grabVx, -5, 5);
        const vy = clamp(a.grabVy + .8, .2, 3.4);
        const vz = clamp(a.grabVz, -5, 5);
        a.spinX = clamp(-vz * .7, -7, 7);
        a.spinZ = clamp(vx * .7, -7, 7);
        physics.setPositions([a.bodyHandle], [a.cx, a.cy, a.cz], 1);
        physics.setVelocities([a.bodyHandle], [vx, vy, vz], 1);
      }
    } else {
      a.freeBody = false;
      a.coasting = false;
      a.throwT = 0;
    }
    updateVisual(a);
    if (!a.freeBody) syncBody(a);
    return true;
  }

  function cancelDrag() {
    let count = 0;
    for (const a of actors) if (endDrag(a, false)) count++;
    return count;
  }

  function loadModel(a) {
    loadAsset().then(gltf => {
      if (!a.active || a.disposed) return;
      const model = cloneSkeleton(gltf.scene);
      model.name = 'GlassMeadowModel';
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (Number.isFinite(box.min.y)) model.position.y -= box.min.y;
      a.height = size.y || 1.25;
      a.model = model;
      a.holder.add(model);
      const materials = [];
      model.traverse(object => {
        if (!object.isMesh) return;
        object.castShadow = false;
        object.receiveShadow = false;
        object.frustumCulled = false;
        const list = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = list.map(material => {
          if (!material) return material;
          const copy = material.clone();
          copy.name = `${material.name || 'glass'} · meadow`;
          copy.userData.authoredColor = copy.color.clone();
          copy.userData.authoredRoughness = copy.roughness;
          materials.push(copy);
          return copy;
        });
        object.material = Array.isArray(object.material) ? cloned : cloned[0];
      });
      a.materials = materials;
      a.mixer = new THREE.AnimationMixer(model);
      a.actions = new Map(gltf.animations.map(clip => [clip.name, a.mixer.clipAction(clip)]));
      a.idle = a.actions.get('Idle') || [...a.actions.values()][0] || null;
      if (a.idle) {
        a.idle.reset();
        a.idle.setLoop(THREE.LoopRepeat, Infinity);
        a.idle.play();
      }
      applyGlassMaterial(a);
      a.ready = true;
      updateVisual(a);
    }).catch(err => {
      a.error = String(err && err.message || err);
      console.warn('[glass] meadow actor failed to load:', err);
    });
  }

  function applyGlassMaterial(a) {
    const color = hexColor(a.genome?.genes?.color);
    for (const material of a.materials || []) {
      material.transmission = .94;
      material.thickness = GLASS.thickness;
      material.ior = GLASS.ior;
      material.transparent = false;
      material.opacity = 1;
      material.roughness = .05;
      material.metalness = 0;
      material.attenuationDistance = GLASS.attenuationDistance;
      material.attenuationColor.setHex(GLASS.attenuationColor);
      material.envMapIntensity = GLASS.envMapIntensity;
      material.clearcoat = GLASS.clearcoat;
      material.clearcoatRoughness = GLASS.clearcoatRoughness;
      material.reflectivity = GLASS.reflectivity;
      if ('dispersion' in material) material.dispersion = .015;
      material.color.set(color);
      material.depthWrite = true;
      material.needsUpdate = true;
    }
  }

  function makeActor(opts = {}) {
    if (!scene) return null;
    if (actors.length >= MAX_ACTORS) return null;
    const stage = opts.stage || 'adult';
    const genome = normalizeGlassGenome(opts.genome);
    genome.genes.color = hexColor(opts.color || genome.genes.color);
    const phenotype = expressGenome(genome);
    const size = finite(genome.genes.size, 1);
    const scale = Number.isFinite(opts.scale)
      ? clamp(opts.scale, .35, 1.8)
      : clamp(scaleForStage(stage) * size, .35, 1.8);
    const field = fieldNow();
    const position = opts.x !== undefined && opts.z !== undefined
      ? { x: opts.x, z: opts.z }
      : { x: 0, z: 0 };
    const walkable = field && field.nav && field.nav.nearestWalkable
      ? field.nav.nearestWalkable(position.x, position.z)
      : null;
    const root = new THREE.Group();
    root.name = 'glassMeadowActor';
    const holder = new THREE.Group();
    holder.name = 'glassMeadowHolder';
    root.add(holder);
    const shadow = makeShadow();
    root.add(shadow);
    root.visible = false;
    scene.add(root);
    const a = {
      kind: 'glass',
      active: true,
      species: 'glass',
      speciesDef: GLASS_SPECIES,
      genome,
      phenotype,
      uid: Number.isFinite(opts.uid) ? opts.uid : uid(),
      name: opts.name || nameFor(),
      sex: opts.sex === 'M' || opts.sex === 'F' ? opts.sex : (Math.random() < .5 ? 'F' : 'M'),
      stage,
      age: Number.isFinite(opts.age) ? Math.max(0, opts.age) : ageForStage(stage),
      scale,
      health: finite(opts.health, 100),
      hunger: finite(opts.hunger, .30),
      thirst: finite(opts.thirst, .30),
      energy: finite(opts.energy, 1),
      social: finite(opts.social, .28 + Math.random() * .16),
      affection: finite(opts.affection, .18 + Math.random() * .16),
      bold: finite(opts.bold, .35 + Math.random() * .4),
      bonds: opts.bonds && typeof opts.bonds === 'object' ? { ...opts.bonds } : {},
      home: opts.home || '',
      pregnant: !!opts.pregnant,
      gestation: Number.isFinite(opts.gestation) ? Math.max(0, opts.gestation) : 0,
      mateCooldown: Number.isFinite(opts.mateCooldown) ? Math.max(0, opts.mateCooldown) : 0,
      birthRetryT: 0,
      fatherUid: Number.isFinite(opts.fatherUid) ? opts.fatherUid : 0,
      parentUids: Array.isArray(opts.parentUids) ? opts.parentUids.slice() : [],
      sleeping: false,
      inside: false,
      grabs: 0,
      inPond: false,
      airborne: false,
      contacts: 1,
      flavor: 3,
      hopSpeedMin: .7,
      hopSpeedMax: 1.8,
      bedtime: 20,
      wakeTime: 5,
      cx: walkable ? walkable.x : position.x,
      cz: walkable ? walkable.z : position.z,
      cy: .65,
      yaw: Number.isFinite(opts.yaw) ? opts.yaw : Math.random() * Math.PI * 2,
      height: 1.25,
      bodyHandle: -1,
      bodyRadius: 0,
      bodyY: 0,
      grabbing: false,
      freeBody: false,
      freeT: 0,
      grabY: 0,
      grabDepth: 6,
      grabStartY: 0,
      grabStartClientY: 0,
      grabVx: 0,
      grabVz: 0,
      grabVy: 0,
      coasting: false,
      throwT: 0,
      throwVx: 0,
      throwVz: 0,
      throwVy: 0,
      tumbleX: 0,
      tumbleZ: 0,
      spinX: 0,
      spinZ: 0,
      doorFade: 1,
      doorTarget: 1,
      ready: false,
      error: null,
      disposed: false,
      shelteredToday: false,
      shelterCheckT: 18 + Math.random() * 24,
      phase: Math.random() * Math.PI * 2,
      root,
      holder,
      shadow,
      materials: [],
      actions: new Map(),
      idle: null,
      mixer: null,
      model: null,
      ai: makeAI(),
    };
    a.ai.faceYaw = a.yaw;
    assignHome(a);
    if (opts.sex !== 'M' && opts.sex !== 'F') a.sex = Math.random() < .5 ? 'F' : 'M';
    actors.push(a);
    updateVisual(a);
    loadModel(a);
    ensureBody(a);
    return a;
  }

  function seedMeadow() {
    if (actors.length) return actors.length;
    const spots = [
      { x: 5.8, z: -2.0, sex: 'F' },
      { x: 7.2, z: -1.2, sex: 'M' },
    ];
    for (const spot of spots) {
      makeActor({
        x: spot.x, z: spot.z, sex: spot.sex, stage: 'adult', age: 600,
        name: nameFor(), color: DEFAULT_COLOR,
      });
    }
    return actors.length;
  }

  function restore(states) {
    if (!Array.isArray(states)) return 0;
    for (const state of states.slice(0, MAX_ACTORS)) {
      if (!state || state.kind === 'bear' || state.species && state.species !== 'glass') continue;
      makeActor({
        x: state.x, z: state.z, uid: state.uid, name: state.name,
        sex: state.sex, stage: state.stage, age: state.age, scale: state.scale,
        genome: state.genome,
        health: state.health, hunger: state.hunger, thirst: state.thirst,
        energy: state.energy, social: state.social, affection: state.affection,
        bold: state.bold, bonds: state.bonds, home: state.home,
        pregnant: state.pregnant, gestation: state.gestation,
        mateCooldown: state.mateCooldown, fatherUid: state.fatherUid,
        parentUids: state.parentUids,
      });
    }
    return actors.length;
  }

  function snapshot() {
    return actors.filter(a => a.active).map(a => ({
      kind: 'glass',
      species: 'glass',
      uid: a.uid,
      name: a.name,
      sex: a.sex,
      stage: a.stage,
      age: +a.age.toFixed(2),
      scale: +a.scale.toFixed(4),
      health: +a.health.toFixed(2),
      hunger: +a.hunger.toFixed(4),
      thirst: +a.thirst.toFixed(4),
      energy: +a.energy.toFixed(4),
      social: +a.social.toFixed(4),
      affection: +a.affection.toFixed(4),
      bold: +a.bold.toFixed(4),
      bonds: { ...(a.bonds || {}) },
      home: a.home || '',
      pregnant: !!a.pregnant,
      gestation: +(a.gestation || 0).toFixed(2),
      mateCooldown: +(a.mateCooldown || 0).toFixed(2),
      fatherUid: a.fatherUid || 0,
      parentUids: (a.parentUids || []).slice(),
      genome: a.genome,
      x: +a.cx.toFixed(3),
      z: +a.cz.toFixed(3),
    }));
  }

  function stateFor(a, index) {
    return {
      index,
      uid: a.uid,
      name: a.name,
      species: a.species,
      sex: a.sex,
      stage: a.stage,
      age: +a.age.toFixed(1),
      scale: +a.scale.toFixed(3),
      health: +a.health.toFixed(1),
      hunger: +a.hunger.toFixed(3),
      thirst: +a.thirst.toFixed(3),
      energy: +a.energy.toFixed(3),
      social: +a.social.toFixed(3),
      affection: +a.affection.toFixed(3),
      bonds: { ...(a.bonds || {}) },
      home: a.home,
      inside: !!a.inside,
      grabbing: !!a.grabbing,
      coasting: !!a.coasting,
      freeBody: !!a.freeBody,
      freeT: +(a.freeT || 0).toFixed(2),
      doorFade: +(a.doorFade ?? 1).toFixed(2),
      rotation: [+a.root.rotation.x.toFixed(3), +a.root.rotation.y.toFixed(3), +a.root.rotation.z.toFixed(3)],
      sleeping: !!a.sleeping,
      grabs: a.grabs,
      inPond: !!a.inPond,
      pregnant: !!a.pregnant,
      gestation: +(a.gestation || 0).toFixed(1),
      ready: !!a.ready,
      error: a.error,
      state: a.ai ? a.ai.state : null,
      partner: a.ai && a.ai.partner ? a.ai.partner.name : null,
      follow: a.ai && a.ai.follow ? (a.ai.follow.name || null) : null,
      familyPlay: !!(a.ai && a.ai.familyPlay),
      playmateKind: a.ai ? a.ai.playmateKind : null,
      visitRole: a.ai ? a.ai.visitRole : null,
      visitPhase: a.ai ? a.ai.visitPhase : null,
      visitHome: a.ai ? a.ai.visitHome : null,
      visitArrived: !!(a.ai && a.ai.visitArrived),
      parentUids: (a.parentUids || []).slice(),
      position: [+a.cx.toFixed(2), +a.cy.toFixed(2), +a.cz.toFixed(2)],
      genome: a.genome,
      phenotype: a.phenotype,
      material: {
        color: a.materials[0] ? '#' + a.materials[0].color.getHexString() : null,
        transmission: a.materials[0] ? a.materials[0].transmission : null,
        roughness: a.materials[0] ? a.materials[0].roughness : null,
      },
    };
  }

  function state() {
    return {
      meadow,
      count: actors.filter(a => a.active).length,
      actors: actors.filter(a => a.active).map(stateFor),
      food: safeFoodCount(),
    };
  }

  function update(dt) {
    if (!meadow || !Number.isFinite(dt) || dt <= 0) return;
    clock += dt;
    const hours = Number(hoursNow());
    const day = isDay(hours);
    for (const a of actors.slice()) {
      if (!a.active || a.disposed) continue;
      if (day) a.shelteredToday = a.shelteredToday || false;
      else a.shelteredToday = false;
      a.shelterCheckT = Math.max(0, (a.shelterCheckT || 0) - dt);
      const nextStage = advanceAge(a, dt);
      // Glass ages continuously but only takes its next growth step at night.
      if (nextStage !== a.stage && !day) applyStage(a, nextStage);
      if (a.mateCooldown > 0) a.mateCooldown = Math.max(0, a.mateCooldown - dt);
      if (a.birthRetryT > 0) a.birthRetryT = Math.max(0, a.birthRetryT - dt);
      if (a.ai.familyPlayCooldown > 0) a.ai.familyPlayCooldown = Math.max(0, a.ai.familyPlayCooldown - dt);

      a.hunger = Math.min(1, a.hunger + HUNGER_RATE * (a.pregnant ? 1.2 : 1) * dt);
      a.thirst = Math.min(1, a.thirst + THIRST_RATE * dt);
      a.social = Math.min(1, a.social + SOCIAL_RATE * dt);
      a.affection = Math.min(1, a.affection + AFFECTION_RATE * dt);
      a.health = Math.min(100, Math.max(1, a.health + .01 * dt));
      a.energy = Math.max(0, Math.min(1, a.energy - .0004 * dt));

      if (a.pregnant && advanceGestation(a, dt) && a.birthRetryT <= 0) {
        if (typeof birthFromGlass !== 'function' || !birthFromGlass(a)) {
          a.birthRetryT = 3;
        }
      }

      if (a.grabbing) {
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.freeBody) {
        a.tumbleX += a.spinX * dt;
        a.tumbleZ += a.spinZ * dt;
        a.spinX *= Math.exp(-1.3 * dt);
        a.spinZ *= Math.exp(-1.3 * dt);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      a.tumbleX *= Math.exp(-8 * dt);
      a.tumbleZ *= Math.exp(-8 * dt);

      if (a.coasting) {
        a.throwT = Math.max(0, (a.throwT || 0) - dt);
        if (a.throwT <= 0) {
          a.coasting = false;
          a.grabY = HOVER * a.scale;
          a.ai.state = 'wander';
          a.ai.idleT = .3;
          a.ai.nextThink = 0;
        } else {
          const beforeX = a.cx;
          const beforeZ = a.cz;
          a.cx += a.throwVx * dt;
          a.cz += a.throwVz * dt;
          const field = fieldNow();
          const near = field && field.nav && field.nav.nearestWalkable
            ? field.nav.nearestWalkable(a.cx, a.cz)
            : null;
          if (near) {
            a.cx = near.x;
            a.cz = near.z;
          }
          if (Math.abs(a.cx - beforeX) < 1e-5 && Math.abs(a.cz - beforeZ) < 1e-5) {
            a.throwVx = 0;
            a.throwVz = 0;
          }
          const minY = HOVER * a.scale + .02;
          a.grabY = clamp(a.grabY + a.throwVy * dt, minY, 2.9);
          a.throwVy -= 4.5 * dt;
          if (a.grabY <= minY) a.throwVy = 0;
          const damp = Math.exp(-2.4 * dt);
          a.throwVx *= damp;
          a.throwVz *= damp;
          a.throwVy *= Math.exp(-1.6 * dt);
        }
        updateVisual(a);
        syncBody(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.inside) {
        a.doorFade = Math.max(0, (a.doorFade || 0) - dt / .55);
        a.ai.insideT = Math.max(0, (a.ai.insideT || 0) - dt);
        a.energy = Math.min(1, a.energy + .008 * dt);
        if (a.ai.insideT <= 0 || !day) emerge(a);
        else {
          updateVisual(a);
          if (a.mixer) a.mixer.update(dt);
          continue;
        }
      }

      if (a.ai.state === 'exit') {
        a.doorFade = Math.min(1, (a.doorFade || 0) + dt / .55);
        if (a.doorFade >= .999) {
          a.doorFade = 1;
          a.ai.state = 'wander';
          a.ai.idleT = .4;
          a.ai.nextThink = 0;
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.ai.state === 'mate') {
        a.ai.animT = (a.ai.animT || 0) + dt;
        const partner = a.ai.partner;
        if (!partner || !partner.active || partner.ai?.state !== 'mate') {
          a.ai.state = 'wander';
          a.ai.partner = null;
          a.ai.waitForPartner = false;
          a.ai.mateT = 0;
        } else if (partner.kind === 'glass' && !a.ai.waitForPartner) {
          a.ai.mateT = Math.max(0, (a.ai.mateT || 0) - dt);
          if (a.ai.mateT <= 0) finishLocalMate(a);
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.ai.state === 'eat') {
        a.ai.animT = (a.ai.animT || 0) + dt;
        a.ai.mateT = 0;
        a.ai.eatT = Math.max(0, (a.ai.eatT || 0) - dt);
        if (a.ai.eatT <= 0) finishFood(a);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'drink') {
        a.ai.animT = (a.ai.animT || 0) + dt;
        a.ai.drinkT = Math.max(0, (a.ai.drinkT || 0) - dt);
        if (a.ai.drinkT <= 0) finishWater(a);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'social') {
        a.ai.animT = (a.ai.animT || 0) + dt;
        a.ai.socialT = Math.max(0, (a.ai.socialT || 0) - dt);
        if (a.ai.socialT <= 0) finishSocial(a);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'stargaze') {
        a.ai.idleT = Math.max(0, (a.ai.idleT || 0) - dt);
        if (a.ai.idleT <= 0 || a.hunger > .85 || a.thirst > .88) {
          a.ai.state = 'wander';
          a.ai.idleT = 0;
          a.ai.nextThink = 0;
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'visit') {
        updateVisit(a, dt);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'invite') {
        a.ai.inviteT = Math.max(0, (a.ai.inviteT || 0) - dt);
        if (a.ai.inviteT <= 0) {
          const partner = a.ai.partner;
          if (a.ai.inviteAccepted && partner && partner.active) {
            a.ai.state = 'social';
            a.ai.socialT = SOCIAL_TIME;
            a.ai.moving = false;
            clearPath(a);
            if (partner.ai) {
              partner.ai.state = 'social';
              partner.ai.partner = a;
              partner.ai.socialT = SOCIAL_TIME;
              partner.ai.moving = false;
              partner.ai.path = null;
              partner.ai.faceYaw = Math.atan2(a.cx - partner.cx, a.cz - partner.cz);
            }
            const field = fieldNow();
            if (field && field.emote) field.emote(a.cx, a.cy + .95, a.cz, 'heart');
          } else {
            a.ai.state = 'wander';
            a.ai.partner = null;
            a.ai.idleT = .45;
            a.ai.socialCooldown = Math.max(a.ai.socialCooldown, 4);
            clearPath(a);
            if (partner && partner.ai && partner.ai.partner === a) {
              partner.ai.partner = null;
              partner.ai.state = 'wander';
              partner.ai.idleT = .45;
              partner.ai.moving = false;
              partner.ai.path = null;
            }
          }
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'decline') {
        a.ai.declineT = Math.max(0, (a.ai.declineT || 0) - dt);
        if (a.ai.declineT <= 0) {
          const partner = a.ai.partner;
          a.ai.state = 'wander';
          a.ai.partner = null;
          a.ai.idleT = .45;
          clearPath(a);
          if (partner && partner.ai && partner.ai.partner === a) {
            partner.ai.partner = null;
            partner.ai.state = 'wander';
            partner.ai.idleT = .45;
            partner.ai.moving = false;
            partner.ai.path = null;
          }
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'seekMate') {
        finishSeekMate(a);
        move(a, dt);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'follow') {
        const parent = a.ai.follow || parentFor(a);
        const target = parentTarget(parent);
        if (!parent || !parent.active || !target) {
          a.ai.follow = null;
          a.ai.state = 'wander';
          clearPath(a);
        } else {
          const d = Math.hypot(target.x - a.cx, target.z - a.cz);
          if (d > 2.2) {
            a.ai.moving = true;
            moveToward(a, target.x, target.z, dt, 1.8);
          } else {
            a.ai.moving = false;
            clearPath(a);
            a.ai.faceYaw = Math.atan2(parent.cx - a.cx, parent.cz - a.cz);
          }
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'seekCompany') {
        const partner = a.ai.partner;
        if (!partner || !partner.active) {
          a.ai.partner = null;
          a.ai.state = 'wander';
          clearPath(a);
        } else if (Math.hypot(partner.cx - a.cx, partner.cz - a.cz) <= 1.35) {
          a.ai.moving = false;
          clearPath(a);
          a.ai.faceYaw = Math.atan2(partner.cx - a.cx, partner.cz - a.cz);
        } else {
          setMoving(a, partner.cx, partner.cz);
          move(a, dt);
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'seekSocial') {
        const partner = a.ai.partner;
        if (!partner || !partner.active) {
          a.ai.partner = null;
          a.ai.state = 'wander';
          clearPath(a);
        } else if (Math.hypot(partner.cx - a.cx, partner.cz - a.cz) <= 1.35) {
          startSocial(a);
        } else {
          setMoving(a, partner.cx, partner.cz);
          move(a, dt);
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
      if (a.ai.state === 'seekFood' || a.ai.state === 'seekWater' || a.ai.state === 'seekHome') {
        move(a, dt);
        if (!a.ai.moving) {
          if (a.ai.state === 'seekFood') {
            const source = a.ai.source;
            if (source && source.ripe && Math.hypot(source.approachX - a.cx, source.approachZ - a.cz) <= .9) {
              a.ai.state = 'eat';
              a.ai.eatT = 1.0;
              a.ai.moving = false;
            } else {
              releaseFood(a);
              a.ai.state = 'wander';
            }
          } else if (a.ai.state === 'seekWater') {
            const spot = a.ai.waterSpot;
            if (spot && Math.hypot(spot.x - a.cx, spot.z - a.cz) <= .9) {
              a.ai.state = 'drink';
              a.ai.drinkT = 1.1;
              a.ai.moving = false;
            } else {
              a.ai.waterSpot = null;
              a.ai.state = 'wander';
            }
          } else if (a.ai.state === 'seekHome') {
            enterHome(a);
          }
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      // Wander / idle. Locomotion only runs along a valid nav path.
      if (a.ai.moving) {
        move(a, dt);
      } else {
        a.ai.idleT = Math.max(0, (a.ai.idleT || 0) - dt);
      }
      a.ai.nextThink = Math.max(0, (a.ai.nextThink || 0) - dt);
      if (a.ai.nextThink <= 0 && a.ai.idleT <= 0) {
        a.ai.nextThink = .2 + Math.random() * .25;
        think(a);
      }
      updateVisual(a);
      if (a.mixer) a.mixer.update(dt);
    }
  }

  function physicsForces() {
    if (!meadow) return;
    for (const a of actors) if (a.active) syncBody(a);
  }

  function endFreeBody(a) {
    if (!a || !a.freeBody) return;
    a.freeBody = false;
    a.freeT = 0;
    a.spinX = 0;
    a.spinZ = 0;
    a.ai.state = 'wander';
    a.ai.idleT = .35;
    a.ai.nextThink = 0;
    updateVisual(a);
    syncBody(a);
  }

  function physicsRead(dt = 1 / 60) {
    if (!physics || !meadow) return;
    for (const a of actors) {
      if (!a.active || !a.freeBody || a.bodyHandle < 0) continue;
      physics.read([a.bodyHandle], bodyRead, 1);
      a.cx = bodyRead[0];
      a.cy = bodyRead[1];
      a.cz = bodyRead[2];
      const speed = Math.hypot(bodyRead[3], bodyRead[4], bodyRead[5]);
      a.freeT = Math.max(0, (a.freeT || 0) - dt);
      updateVisual(a);
      if (a.freeT <= 0 || (speed < .3 && a.cy < .75)) endFreeBody(a);
    }
  }

  function setMeadow(value) {
    meadow = !!value;
    if (!meadow) cancelDrag();
    for (const a of actors) {
      if (!meadow) {
        a.freeBody = false;
        a.freeT = 0;
        destroyBody(a);
      }
      if (a.root) a.root.visible = meadow && !a.inside;
      if (meadow) ensureBody(a);
    }
    return meadow;
  }

  function clear() {
    for (const a of actors) disposeActor(a);
    actors.length = 0;
    return 0;
  }

  function disposeActor(a) {
    if (!a) return;
    a.disposed = true;
    a.active = false;
    destroyBody(a);
    if (a.mixer) a.mixer.stopAllAction();
    if (a.root) a.root.removeFromParent();
    for (const material of a.materials || []) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
    const shadow = a.shadow;
    if (shadow) {
      if (shadow.material) {
        if (shadow.material.map) shadow.material.map.dispose();
        shadow.material.dispose();
      }
      if (shadow.geometry) shadow.geometry.dispose();
    }
  }

  function pick(clientX, clientY, camera, renderer) {
    if (!meadow || !camera || !renderer) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    let best = null;
    for (const a of actors) {
      if (!a.active || !a.root.visible || !a.ready) continue;
      a.root.updateMatrixWorld(true);
      const hits = raycaster.intersectObject(a.root, true);
      if (!hits.length) continue;
      const distance = hits[0].distance;
      if (!best || distance < best.distance) best = { actor: a, distance };
    }
    return best;
  }

  function findActor(uidValue) {
    return actors.find(a => a.active && a.uid === uidValue) || null;
  }

  function setNeed(index, key, value) {
    const a = actors[index];
    if (!a || !['hunger', 'thirst', 'energy', 'health', 'social', 'affection'].includes(key)) return false;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    a[key] = key === 'health' ? clamp(n, 1, 100) : clamp(n, 0, 1);
    a.ai.nextThink = 0;
    return a[key];
  }

  function setStage(index, stage) {
    const a = actors[index];
    if (!a || !['baby', 'teen', 'adult'].includes(stage)) return false;
    return applyStage(a, stage, { age: ageForStage(stage) });
  }

  function setPosition(index, x, z) {
    const a = actors[index];
    if (!a || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return false;
    const field = fieldNow();
    const near = field && field.nav && field.nav.nearestWalkable
      ? field.nav.nearestWalkable(Number(x), Number(z))
      : { x: Number(x), z: Number(z) };
    if (!near) return false;
    a.cx = near.x;
    a.cz = near.z;
    a.ai.state = 'wander';
    a.ai.moving = false;
    a.ai.path = null;
    a.ai.nextThink = 0;
    updateVisual(a);
    syncBody(a);
    return true;
  }

  function setCooldown(index, value) {
    const a = actors[index];
    if (!a) return false;
    const n = Number(value);
    if (!Number.isFinite(n)) return false;
    a.mateCooldown = Math.max(0, n);
    return a.mateCooldown;
  }

  function setAge(index, value) {
    const a = actors[index];
    const n = Number(value);
    if (!a || !Number.isFinite(n)) return false;
    a.age = Math.max(0, n);
    return a.age;
  }

  function setPregnant(index, on, gestation = GESTATION_TIME) {
    const a = actors[index];
    if (!a) return false;
    a.pregnant = !!on;
    a.gestation = a.pregnant ? Math.max(0, Number(gestation) || 0) : 0;
    a.birthRetryT = 0;
    return a.pregnant;
  }

  function resetActor(index) {
    const a = actors[index];
    if (!a) return false;
    stopGrabTasks(a);
    a.grabbing = false;
    a.grabs = 0;
    a.freeBody = false;
    a.freeT = 0;
    a.coasting = false;
    a.throwT = 0;
    a.doorFade = 1;
    a.doorTarget = 1;
    a.tumbleX = 0;
    a.tumbleZ = 0;
    a.spinX = 0;
    a.spinZ = 0;
    a.ai.state = 'wander';
    a.ai.idleT = 0;
    a.ai.nextThink = 0;
    a.ai.socialCooldown = 0;
    return true;
  }

  function forceFamilyPlay(index) {
    const a = actors[index];
    if (!a) return false;
    const mate = findFamilyPlaymate(a);
    return mate ? startFamilyPlay(a, mate) : false;
  }

  function forceVisit(indexA, indexB) {
    return startVisitPair(actors[indexA], actors[indexB]);
  }

  function forceVisitWithBear(index, bear) {
    return startVisitPair(actors[index], bear);
  }

  function forceShelter(index) {
    const a = actors[index];
    if (!a) return false;
    if (isDay(hoursNow())) return startSeekHome(a);
    return false;
  }

  function forceMate(indexA, indexB) {
    const a = actors[indexA];
    const b = actors[indexB];
    if (!a || !b || a === b) return { ok: false, note: 'need two glass actors' };
    if (a.stage !== 'adult' || b.stage !== 'adult') return { ok: false, note: 'adults only' };
    if (a.sex === b.sex) return { ok: false, note: 'opposite sexes required' };
    if (a.pregnant || b.pregnant) return { ok: false, note: 'already pregnant' };
    if (a.ai.partner && a.ai.partner !== b) return { ok: false, note: 'partner busy' };
    if (b.ai.partner && b.ai.partner !== a) return { ok: false, note: 'partner busy' };
    startLocalMate(a, b);
    return { ok: true, state: a.ai.state, partner: b.name };
  }

  function forceMateWithBear(index, bear) {
    const a = actors[index];
    if (!a || !bear || !bear.active) return { ok: false, note: 'need a glass actor and a bear' };
    if (a.stage !== 'adult' || bear.stage !== 'adult') return { ok: false, note: 'adults only' };
    if (a.sex === bear.sex) return { ok: false, note: 'opposite sexes required' };
    if (a.pregnant || bear.pregnant) return { ok: false, note: 'already pregnant' };
    if (typeof beginCrossMate !== 'function' || !beginCrossMate(a, bear)) {
      return { ok: false, note: 'cross-species pair refused' };
    }
    a.ai.state = 'mate';
    a.ai.partner = bear;
    a.ai.waitForPartner = true;
    a.ai.moving = false;
    return { ok: true, state: a.ai.state, partner: bear.name };
  }

  function forceBirth(index) {
    const a = actors[index];
    if (!a) return false;
    a.pregnant = true;
    a.gestation = 0;
    a.birthRetryT = 0;
    if (typeof birthFromGlass !== 'function' || !birthFromGlass(a)) {
      a.birthRetryT = 3;
      return false;
    }
    return true;
  }

  return {
    actors,
    seedMeadow,
    restore,
    snapshot,
    state,
    update,
    physicsForces,
    physicsRead,
    setMeadow,
    clear,
    pick,
    findActor,
    beginDrag,
    drag,
    endDrag,
    cancelDrag,
    spawnChild(opts = {}) { return makeActor({ ...opts, stage: opts.stage || 'baby' }); },
    setNeed,
    setStage,
    setPosition,
    setCooldown,
    setAge,
    setPregnant,
    resetActor,
    forceFamilyPlay,
    forceVisit,
    forceVisitWithBear,
    forceShelter,
    forceMate,
    forceMateWithBear,
    forceBirth,
    get count() { return actors.filter(a => a.active).length; },
    get meadow() { return meadow; },
  };
}
