// Scene visuals for dropped and carried food portions.
//
// The behavior layer owns portion identity and ownership. This module only
// mirrors registry entries and carried records as small jelly berries, and hides
// portions that belong to the inactive map.

import * as THREE from 'three';

const COLORS = {
  flower: 0xf7a8cf,
  fruit: 0xe85d5d,
  hive: 0xe6b64a,
  default: 0xf29b4b,
};

export function createGiftVisuals({ scene, getPortions, getActors, getMapId, getActive }) {
  const group = new THREE.Group();
  group.name = 'giftPortions';
  scene.add(group);
  const geometry = new THREE.SphereGeometry(.085, 12, 8);
  const materials = new Map();
  const dropped = new Map();
  const carried = new Map();

  function materialFor(kind) {
    const color = COLORS[kind] || COLORS.default;
    if (!materials.has(color)) {
      materials.set(color, new THREE.MeshStandardMaterial({
        color, roughness: .34, metalness: 0,
        emissive: color, emissiveIntensity: .08,
      }));
    }
    return materials.get(color);
  }

  function syncDropped() {
    const active = typeof getActive === 'function' ? !!getActive() : true;
    const mapId = typeof getMapId === 'function' ? getMapId() : 'field';
    const list = active && typeof getPortions === 'function' ? (getPortions() || []) : [];
    const seen = new Set();
    for (const portion of list) {
      seen.add(portion.id);
      let mesh = dropped.get(portion.id);
      if (!mesh) {
        mesh = new THREE.Mesh(geometry, materialFor(portion.kind));
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        group.add(mesh);
        dropped.set(portion.id, mesh);
      }
      mesh.userData.kind = portion.kind;
      mesh.material = materialFor(portion.kind);
      mesh.position.set(portion.x, (Number.isFinite(portion.y) ? portion.y : .05) + .09, portion.z);
      mesh.scale.setScalar(1.1);
      mesh.visible = portion.mapId === mapId;
    }
    for (const [id, mesh] of dropped) {
      if (seen.has(id)) continue;
      group.remove(mesh);
      dropped.delete(id);
    }
  }

  function syncCarried() {
    const active = typeof getActive === 'function' ? !!getActive() : true;
    const list = active && typeof getActors === 'function' ? (getActors() || []) : [];
    const seen = new Set();
    for (const actor of list) {
      const food = actor && actor.carriedFood;
      if (!food || !actor.active) continue;
      seen.add(actor.uid);
      let mesh = carried.get(actor.uid);
      if (!mesh) {
        mesh = new THREE.Mesh(geometry, materialFor(food.kind));
        mesh.castShadow = false;
        group.add(mesh);
        carried.set(actor.uid, mesh);
      }
      mesh.material = materialFor(food.kind);
      mesh.userData.uid = actor.uid;
      const yaw = Number.isFinite(actor.ai?.faceYaw) ? actor.ai.faceYaw : 0;
      mesh.position.set(
        actor.cx + Math.sin(yaw) * .10,
        (Number.isFinite(actor.cy) ? actor.cy : 0) + 1.15,
        actor.cz + Math.cos(yaw) * .10,
      );
      mesh.scale.setScalar(1.4);
      mesh.visible = true;
    }
    for (const [uid, mesh] of carried) {
      if (seen.has(uid)) continue;
      group.remove(mesh);
      carried.delete(uid);
    }
  }

  function update() {
    syncDropped();
    syncCarried();
  }

  function statsNow() {
    return { dropped: dropped.size, carried: carried.size };
  }

  function debugNow() {
    return group.children.map(mesh => ({
      uid: Number.isInteger(mesh.userData.uid) ? mesh.userData.uid : null,
      position: [
        +mesh.position.x.toFixed(3),
        +mesh.position.y.toFixed(3),
        +mesh.position.z.toFixed(3),
      ],
      scale: +mesh.scale.x.toFixed(2),
      visible: !!mesh.visible,
    }));
  }

  function dispose() {
    group.removeFromParent();
    if (typeof geometry.dispose === 'function') geometry.dispose();
    for (const material of materials.values()) material.dispose();
    dropped.clear();
    carried.clear();
  }

  return { group, update, stats: statsNow, debug: debugNow, dispose };
}
