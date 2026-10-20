// Meadow Glass life adapter.
//
// Glass keeps its authored, skinned GLB and its rigid Box3D proxy. This module
// adds the common life state (needs, bonds, pregnancy, stage growth, home) and a
// hover controller, without joining the 24-body metaball soft-body pool.

import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { getSpecies } from './species.js';
import { defaultGenome, expressGenome, normalizeGenome } from './dna.js';
import { assetStore, disposeInstanceSkeletons } from './assetstore.js';
import { snapshotActor } from './actorrecord.js';
import { pushHistory } from './family.js';
import { avoidanceYaw as steerAvoidance } from './avoidance.js';
import {
  advanceAge, advanceGestation, ageForStage, scaleForStage,
  HOME_CAPACITY, GESTATION_TIME,
} from './life.js';

const GLASS_SPECIES = getSpecies('glass');
const DEFAULT_COLOR = '#a8e5ff';
const MAX_ACTORS = 8;
const HOVER = .18;
const HOVER_BOB = .035;
const MOVE_SPEED = 1.35;
const DAY_START = 8;
const DAY_END = 18;
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
  behavior = null,
} = {}) {
  const actors = [];
  const shared = behavior;
  if (!shared) throw new Error('createGlassColony requires the shared behavior engine');
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

  const glassAdapter = shared ? {
    onStop(a) {
      if (a && a.ai) a.ai.moving = false;
    },
    onSleep(a, home, restKind) {
      if (!a || !a.ai) return;
      enterHome(a);
      a.ai.state = 'sleep';
      a.ai.restKind = restKind || 'shelter';
      a.ai.sleepHome = home ? home.name : a.home;
    },
    onWake(a) {
      if (!a || !a.ai) return;
      emerge(a);
      a.ai.state = 'exit';
      a.ai.restKind = null;
    },
    sleepDone(a) {
      if (!a) return true;
      if (!a.inside) return true;
      return !isDay(hoursNow()) || (a.ai && (a.ai.insideT || 0) <= 0);
    },
  } : null;
  if (shared && typeof shared.registerAdapter === 'function') {
    shared.registerAdapter('skinned', glassAdapter);
  }

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
      ? field.food.allRipe({ safe: true }).length
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
    a.walkDesired = null;
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
    if (!a.ai.moving) { a.walkDesired = null; return; }
    const p = routePoint(a);
    if (!p) { clearPath(a); a.walkDesired = null; return; }
    const dx = p.x - a.cx;
    const dz = p.z - a.cz;
    const d = Math.hypot(dx, dz);
    if (d < .22) {
      a.ai.pathIndex = (a.ai.pathIndex | 0) + 1;
      if (!a.ai.path || a.ai.pathIndex >= a.ai.path.length) {
        clearPath(a);
        a.ai.arrived = true;
        a.walkDesired = null;
        return;
      }
      return;
    }
    const yaw = steerAvoidance(a, Math.atan2(dx, dz), bearList().concat(actors));
    const ux = Math.sin(yaw);
    const uz = Math.cos(yaw);
    a.walkDesired = { x: ux * MOVE_SPEED, z: uz * MOVE_SPEED };
    a.yaw = yaw;
    a.ai.faceYaw = yaw;
  }

  function animateHover(a, dt) {
    const speed = Math.hypot(a.bodyVx || 0, a.bodyVz || 0);
    const moveT = clamp(speed / MOVE_SPEED, 0, 1);
    const targetYaw = a.ai && Number.isFinite(a.ai.faceYaw) ? a.ai.faceYaw : a.yaw;
    const dyaw = Math.atan2(Math.sin(targetYaw - (a.visualYaw || 0)),
      Math.cos(targetYaw - (a.visualYaw || 0)));
    a.visualYaw = (a.visualYaw || 0) + dyaw * (1 - Math.exp(-5.5 * dt));
    let leanX = clamp(-(a.bodyVz || 0) * .10, -.20, .20) * moveT;
    let leanZ = clamp((a.bodyVx || 0) * .10, -.20, .20) * moveT;
    const field = fieldNow();
    const wind = field && field.wind;
    if (wind) {
      const strength = clamp(wind.strength || 0, 0, 2) * .022;
      leanX += (wind.direction?.z || 0) * strength;
      leanZ -= (wind.direction?.x || 0) * strength;
    }
    const k = 1 - Math.exp(-7 * dt);
    a.leanX = (a.leanX || 0) + (leanX - (a.leanX || 0)) * k;
    a.leanZ = (a.leanZ || 0) + (leanZ - (a.leanZ || 0)) * k;
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
    // Quirk flag: route this draw through the engine RNG when enabled. The
    // default keeps the legacy Math.random stream.
    const engineRng = shared && shared.api && typeof shared.api.feature === 'function' &&
      shared.api.feature('glassEngineRng') && typeof shared.api.rng === 'function'
      ? shared.api.rng : Math.random;
    a.ai.insideT = 34 + engineRng() * 58;
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

  function applyStage(a, stage, opts = {}) {
    if (!a || !a.active || !STAGE_ORDER.includes(stage)) return false;
    const size = finite(a.genome?.genes?.size, 1);
    a.stage = stage;
    a.age = Number.isFinite(opts.age) ? opts.age : a.age;
    pushHistory(a, { kind: 'stage', uid: 0, day: 0, hour: hoursNow() });
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
    if (a.grabbing) return;
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
    if (a.freeBody || a.grabbing || a.walkDesired) {
      const rootY = Math.max(.01, a.cy - (a.height || 1.25) * visualScale * .5);
      const leanX = a.walkDesired ? (a.leanX || 0) : 0;
      const leanZ = a.walkDesired ? (a.leanZ || 0) : 0;
      a.root.position.set(a.cx, rootY, a.cz);
      a.root.rotation.set(a.tumbleX + leanX, a.walkDesired ? (a.visualYaw ?? a.yaw ?? 0) : (a.yaw || 0), a.tumbleZ + leanZ);
      a.root.scale.setScalar(visualScale);
      a.shadow.position.y = (.004 - rootY) / Math.max(.001, visualScale);
      a.shadow.scale.setScalar(1);
      a.root.visible = meadow;
      a.shadow.visible = meadow;
      a.root.updateMatrixWorld(true);
      return;
    }
    const wind = fieldNow() && fieldNow().wind;
    const windBob = wind ? Math.sin(clock * 1.6 + a.phase) * .006 * clamp(wind.strength || 0, 0, 2) : 0;
    const bob = a.inside || a.grabbing ? 0 : Math.sin(clock * 2.2 + a.phase) * HOVER_BOB + windBob;
    const y = a.grabbing || a.coasting ? a.grabY : HOVER * a.scale + bob;
    a.root.position.set(a.cx, y, a.cz);
    a.root.rotation.set(a.tumbleX + (a.leanX || 0), a.visualYaw ?? a.yaw ?? 0, a.tumbleZ + (a.leanZ || 0));
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
    a.walkDesired = null;
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
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const point = raycaster.ray.at(a.grabDepth, new THREE.Vector3());
    a.grabOffset = new THREE.Vector3(a.cx, a.cy, a.cz).sub(point);
    a.grabTarget = new THREE.Vector3(a.cx, a.cy, a.cz);
    ensureBody(a);
    if (shared) shared.onGrab(a);
    stopGrabTasks(a);
    drag(a, clientX, clientY, camera, renderer, false);
    return true;
  }

  function drag(a, clientX, clientY, camera, renderer, shift = false) {
    if (!a || !a.active || !a.grabbing || !camera || !renderer) return false;
    const now = performance.now();
    const dt = Math.max(.001, (now - (a.grabLastAt || now)) / 1000);
    const prevX = a.grabTarget.x, prevZ = a.grabTarget.z, prevY = a.grabTarget.y;
    if (shift) {
      a.grabTarget.y = clamp(prevY + (a.grabStartClientY - clientY) * .006,
        a.bodyRadius, 4);
    } else {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      a.grabTarget.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, a.grabDepth).add(a.grabOffset);
      a.grabTarget.y = Math.max(a.bodyRadius, a.grabTarget.y);
    }
    const delta = a.grabTarget.clone().sub(new THREE.Vector3(a.cx, a.cy, a.cz));
    if (delta.length() > 6) a.grabTarget.set(a.cx, a.cy, a.cz).add(delta.setLength(6));
    const k = 1 - Math.exp(-12 * dt);
    a.grabVx += ((a.grabTarget.x - prevX) / dt - a.grabVx) * k;
    a.grabVz += ((a.grabTarget.z - prevZ) / dt - a.grabVz) * k;
    a.grabVy += ((a.grabTarget.y - prevY) / dt - a.grabVy) * k;
    a.grabStartClientY = clientY;
    a.grabLastAt = now;
    return true;
  }

  function endDrag(a, throwIt = true) {
    if (!a || !a.grabbing) return false;
    a.grabbing = false;
    a.grabs = 0;
    a.ai.state = 'wander';
    a.ai.idleT = .35;
    a.ai.nextThink = 0;
    a.ai.faceYaw = null;
    if (shared) shared.onRelease(a);
    if (throwIt && physics) {
      ensureBody(a);
      if (a.bodyHandle >= 0) {
        a.freeBody = true;
        a.freeT = 2.2;
        a.coasting = false;
        physics.read([a.bodyHandle], bodyRead, 1);
        const decay = Math.exp(-14 * Math.max(0, (performance.now() - a.grabLastAt - 45) / 1000));
        const vx = clamp(bodyRead[3] + a.grabVx * decay * .25, -5, 5);
        const vy = clamp(bodyRead[4] + a.grabVy * decay * .25 + .8, .2, 3.4);
        const vz = clamp(bodyRead[5] + a.grabVz * decay * .25, -5, 5);
        a.spinX = clamp(-vz * .7, -7, 7);
        a.spinZ = clamp(vx * .7, -7, 7);
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

  function blastImpulse(bx, by, bz, radius, power) {
    if (!physics || !meadow) return 0;
    let hits = 0;
    for (const a of actors) {
      if (!a.active || a.inside || !a.ready) continue;
      const dx = a.cx - bx, dy = a.cy - by, dz = a.cz - bz;
      const d = Math.hypot(dx, dy, dz) || .001;
      if (d > radius) continue;
      if (a.grabbing) endDrag(a, false);
      ensureBody(a);
      if (a.bodyHandle < 0) continue;
      const fall = clamp(1 - d / radius, .15, 1);
      const ux = dx / d, uy = dy / d, uz = dz / d;
      const mag = power * (.45 + .55 * fall);
      const dvx = ux * mag + (Math.random() - .5) * .7;
      const dvy = Math.max(.8, uy * mag) * .6 + 3.6 * fall + Math.random() * 1.2;
      const dvz = uz * mag + (Math.random() - .5) * .7;
      a.freeBody = true;
      a.freeT = 2.2;
      a.coasting = false;
      a.spinX = clamp(-dvz * .7, -7, 7);
      a.spinZ = clamp(dvx * .7, -7, 7);
      a.tumbleX = 0;
      a.tumbleZ = 0;
      if (shared) shared.api.cancelPair(a);
      physics.applyImpulses([a.bodyHandle], [dvx * 1.2, dvy * 1.2, dvz * 1.2], 1);
      hits++;
    }
    return hits;
  }

  function loadModel(a) {
    assetStore.acquire(GLASS_SPECIES.assetId).then(lease => {
      if (!a.active || a.disposed) { lease.release(); return; }
      a.assetLease = lease;
      const gltf = lease.gltf;
      const model = cloneSkeleton(gltf.scene);
      model.name = 'GlassMeadowModel';
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      if (Number.isFinite(box.min.y)) model.position.y -= box.min.y;
      a.height = size.y || 1.25;
      a.model = model;
      a.holder.add(model);
      const materials = [];
      a.materials = materials;
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
      if (a.mixer) a.mixer.stopAllAction();
      if (a.model) {
        a.model.removeFromParent();
        disposeInstanceSkeletons(a.model);
      }
      for (const material of a.materials || []) material.dispose();
      a.materials = [];
      a.model = null;
      a.mixer = null;
      if (a.assetLease) { a.assetLease.release(); a.assetLease = null; }
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
      skills: opts.skills && typeof opts.skills === 'object' ? { ...opts.skills } : {},
      history: Array.isArray(opts.history) ? opts.history.slice(-16) : [],
      playdates: opts.playdates && typeof opts.playdates === 'object' ? { ...opts.playdates } : {},
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
      visualYaw: Number.isFinite(opts.yaw) ? opts.yaw : Math.random() * Math.PI * 2,
      leanX: 0,
      leanZ: 0,
      walkDesired: null,
      bodyVx: 0,
      bodyVz: 0,
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
      ai: null,
    };
    if (shared) shared.attach(a);
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
        skills: state.skills, history: state.history, playdates: state.playdates,
        pregnant: state.pregnant, gestation: state.gestation,
        mateCooldown: state.mateCooldown, fatherUid: state.fatherUid,
        parentUids: state.parentUids,
      });
    }
    return actors.length;
  }

  function snapshot() {
    return actors.filter(a => a.active).map(a => snapshotActor(a, { kind: 'glass', species: 'glass' }));
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
      playdate: !!(a.ai && a.ai.playdate),
      playdateHome: a.ai ? a.ai.playdateHome : null,
      playdateTarget: a.ai && a.ai.playdateTarget
        ? { x: +a.ai.playdateTarget.x.toFixed(2), z: +a.ai.playdateTarget.z.toFixed(2) }
        : null,
      moving: !!(a.ai && a.ai.moving),
      noProgressT: a.ai ? +(+a.ai.noProgressT || 0).toFixed(2) : 0,
      recoveries: a.ai ? (a.ai.recoveries | 0) : 0,
      doorEntries: a.ai ? (a.ai.doorEntries | 0) : 0,
      doorExits: a.ai ? (a.ai.doorExits | 0) : 0,
      shelteredToday: !!a.shelteredToday,
      path: a.ai && a.ai.path ? a.ai.path.slice(0, 6).map(p => [+p.x.toFixed(2), +p.z.toFixed(2)]) : null,
      pathIndex: a.ai && a.ai.pathIndex || 0,
      target: a.ai && a.ai.target ? [+a.ai.target.x.toFixed(2), +a.ai.target.z.toFixed(2)] : null,
      bodyV: [+(a.bodyVx || 0).toFixed(2), +(a.bodyVz || 0).toFixed(2)],
      lean: [+(a.leanX || 0).toFixed(3), +(a.leanZ || 0).toFixed(3)],
      visitRole: a.ai ? a.ai.visitRole : null,
      visitPhase: a.ai ? a.ai.visitPhase : null,
      visitHome: a.ai ? a.ai.visitHome : null,
      visitArrived: !!(a.ai && a.ai.visitArrived),
      familyTask: a.ai ? a.ai.familyTask : null,
      restKind: a.ai ? a.ai.restKind : null,
      skills: { ...(a.skills || {}) },
      history: Array.isArray(a.history) ? a.history.slice(-4) : [],
      playdates: a.playdates && typeof a.playdates === 'object' ? { ...a.playdates } : {},
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
      actors: actors.filter(a => a.active).map(a => stateFor(a, actors.indexOf(a))),
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
      const nextStage = advanceAge(a, dt);
      // Glass ages continuously but only takes its next growth step at night.
      if (nextStage !== a.stage && !day) applyStage(a, nextStage);
      if (a.mateCooldown > 0) a.mateCooldown = Math.max(0, a.mateCooldown - dt);
      if (a.birthRetryT > 0) a.birthRetryT = Math.max(0, a.birthRetryT - dt);

      if (a.pregnant && advanceGestation(a, dt) && a.birthRetryT <= 0) {
        if (typeof birthFromGlass !== 'function' || !birthFromGlass(a)) {
          a.birthRetryT = 3;
        }
      }

      if (a.grabbing) {
        if (shared) shared.tick(a, dt, { ready: false });
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.freeBody) {
        a.tumbleX += a.spinX * dt;
        a.tumbleZ += a.spinZ * dt;
        a.spinX *= Math.exp(-1.3 * dt);
        a.spinZ *= Math.exp(-1.3 * dt);
        if (shared) shared.tick(a, dt, { ready: false });
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
        if (shared) shared.tick(a, dt, { ready: false });
        updateVisual(a);
        syncBody(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.inside) {
        a.doorFade = Math.max(0, (a.doorFade || 0) - dt / .55);
        a.ai.insideT = Math.max(0, (a.ai.insideT || 0) - dt);
        if (shared) shared.tick(a, dt, { ready: false });
        else a.energy = Math.min(1, a.energy + .008 * dt);
        if (a.ai.insideT <= 0 || !day) {
          if (shared) shared.api.wake(a);
          else emerge(a);
        }
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (a.ai.state === 'exit') {
        a.doorFade = Math.min(1, (a.doorFade || 0) + dt / .55);
        if (a.doorFade >= .999) {
          a.doorFade = 1;
          a.ai.state = 'wander';
          a.ai.idleT = .4;
          a.ai.nextThink = 0;
        }
        if (shared) shared.tick(a, dt, { ready: false });
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }

      if (shared) {
        shared.tick(a, dt, { ready: true });
        if (a.ai.moving) move(a, dt);
        else a.walkDesired = null;
        animateHover(a, dt);
        updateVisual(a);
        if (a.mixer) a.mixer.update(dt);
        continue;
      }
    }
  }

  function physicsForces() {
    if (!meadow || !physics) return;
    for (const a of actors) {
      if (!a.active) continue;
      if (a.freeBody) continue;
      if (a.inside) { syncBody(a); continue; }
      ensureBody(a);
      if (a.bodyHandle < 0) continue;
      if (a.grabbing) {
        physics.read([a.bodyHandle], bodyRead, 1);
        // Same spring model as soft-body grabs, critically damped for a single
        // rigid proxy rather than a stretchy rig. The proxy has mass 1.2.
        const decay = Math.exp(-14 * Math.max(0, (performance.now() - a.grabLastAt - 45) / 1000));
        physics.applyForces([a.bodyHandle], [
          1.2 * (600 * (a.grabTarget.x - bodyRead[0]) - 48 * (bodyRead[3] - clamp(a.grabVx * decay, -5, 5))),
          1.2 * (600 * (a.grabTarget.y - bodyRead[1]) - 48 * (bodyRead[4] - clamp(a.grabVy * decay, -5, 5))),
          1.2 * (600 * (a.grabTarget.z - bodyRead[2]) - 48 * (bodyRead[5] - clamp(a.grabVz * decay, -5, 5))),
        ], true, 1);
        continue;
      }
      if (a.walkDesired) {
        physics.read([a.bodyHandle], bodyRead, 1);
        const targetY = HOVER * a.scale + (a.height || 1.25) * a.scale * .5;
        const ax = clamp((a.walkDesired.x - bodyRead[3]) * 14, -28, 28);
        const az = clamp((a.walkDesired.z - bodyRead[5]) * 14, -28, 28);
        const ay = clamp(9.8 + (targetY - bodyRead[1]) * 30 - bodyRead[4] * 9, -20, 40);
        physics.applyForces([a.bodyHandle], [1.2 * ax, 1.2 * ay, 1.2 * az], true, 1);
        continue;
      }
      syncBody(a);
    }
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
      if (!a.active || (!a.freeBody && !a.grabbing && !a.walkDesired) || a.bodyHandle < 0) continue;
      physics.read([a.bodyHandle], bodyRead, 1);
      a.cx = bodyRead[0];
      a.cy = bodyRead[1];
      a.cz = bodyRead[2];
      a.bodyVx = bodyRead[3];
      a.bodyVz = bodyRead[5];
      const speed = Math.hypot(bodyRead[3], bodyRead[4], bodyRead[5]);
      if (a.grabbing) {
        const blend = 1 - Math.exp(-10 * dt);
        a.tumbleX += (clamp(-bodyRead[5] * .15, -.8, .8) - a.tumbleX) * blend;
        a.tumbleZ += (clamp(bodyRead[3] * .15, -.8, .8) - a.tumbleZ) * blend;
        updateVisual(a);
        continue;
      }
      if (!a.freeBody) {
        updateVisual(a);
        continue;
      }
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
    if (a.model) disposeInstanceSkeletons(a.model);
    if (a.root) a.root.removeFromParent();
    for (const material of a.materials || []) {
      material.dispose();
    }
    if (a.assetLease) { a.assetLease.release(); a.assetLease = null; }
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
    a.inside = false;
    a.sleeping = false;
    a.ai.state = 'wander';
    a.ai.idleT = 0;
    a.ai.nextThink = 0;
    a.ai.socialCooldown = 0;
    a.ai.partner = null;
    a.ai.follow = null;
    a.ai.followRetryT = 0;
    a.ai.moving = false;
    a.ai.path = null;
    a.ai.pathIndex = 0;
    a.ai.target = null;
    a.ai.familyTask = null;
    a.ai.familyPlay = false;
    a.ai.playmateKind = null;
    a.ai.playdate = false;
    a.ai.playdateTarget = null;
    a.ai.playdateHome = null;
    a.ai.visitHome = null;
    a.ai.visitRole = null;
    a.ai.visitPhase = null;
    a.ai.visitT = 0;
    a.ai.visitArrived = false;
    a.ai.waitForPartner = false;
    a.ai.source = null;
    a.ai.waterSpot = null;
    a.ai.restKind = null;
    a.ai.sleepHome = null;
    a.ai.directive = null;
    a.ai.directives.length = 0;
    a.ai.directiveStatus = null;
    a.ai.directiveHome = false;
    a.ai.taskCooldown = 0;
    a.ai.familyPlayCooldown = 0;
    a.ai.noProgressT = 0;
    a.ai.recoveries = 0;
    a.ai.lastStuck = null;
    a.ai.doorEntries = 0;
    a.ai.doorExits = 0;
    a.ai.doorFirstAt = 0;
    a.ai.doorWarned = false;
    a.ai.restCooldown = 0;
    a.ai.avoidSourceId = null;
    a.ai.avoidSourceT = 0;
    a.ai.progressX = a.cx;
    a.ai.progressZ = a.cz;
    a.ai.progressTargetX = null;
    a.ai.progressTargetZ = null;
    a.ai.progressDist = Infinity;
    a.ai.progressPathIndex = 0;
    a.walkDesired = null;
    a.bodyVx = 0;
    a.bodyVz = 0;
    a.leanX = 0;
    a.leanZ = 0;
    a.visualYaw = a.yaw;
    return true;
  }

  function forceFamilyPlay(index) {
    const a = actors[index];
    if (!a) return false;
    const mate = shared.api.acquireFamilyPlaymate(a);
    if (!mate) return false;
    return shared.forcePlaydate(a, mate.actor, mate.kind).ok;
  }

  function forceVisit(indexA, indexB) {
    return { ok: shared.forceVisit(actors[indexA], actors[indexB]).ok, state: actors[indexA]?.ai?.state };
  }

  function forceVisitWithBear(index, bear) {
    return { ok: shared.forceVisit(actors[index], bear).ok, state: actors[index]?.ai?.state };
  }

  function forceShelter(index) {
    const a = actors[index];
    if (!a) return false;
    if (!isDay(hoursNow())) return false;
    return shared.api.startSeekHome(a, 'shelter');
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
    const result = shared.forceMate(a, b);
    return { ...result, partner: b.name };
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
    blastImpulse,
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
