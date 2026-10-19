// Common actor queries for the two simulation representations in the Meadow.
//
// Soft-body bears/Gummies live in one array; Glass actors live in the colony
// adapter. Roster, save, home and interaction code should ask this view rather
// than growing another `bears`-vs-Glass branch.

export function isGlassActor(actor) {
  return !!(actor && actor.kind === 'glass');
}

export function isSoftBodyActor(actor) {
  return !!(actor && !isGlassActor(actor) && Array.isArray(actor.px));
}

export function actorKind(actor) {
  if (!actor) return null;
  if (isGlassActor(actor)) return 'glass';
  return isSoftBodyActor(actor) ? 'softbody' : null;
}

export function actorUid(actor) {
  return actor && Number.isFinite(actor.uid) ? actor.uid : null;
}

export function actorActive(actor) {
  return !!(actor && actor.active);
}

export function actorPosition(actor) {
  if (!actor) return null;
  return { x: actor.cx, y: actor.cy, z: actor.cz };
}

export function actorHome(actor) {
  return actor && typeof actor.home === 'string' ? actor.home : '';
}

export function createActorView({ getSoft = () => [], getGlass = () => [] } = {}) {
  const soft = () => {
    const list = typeof getSoft === 'function' ? getSoft() : getSoft;
    return Array.isArray(list) ? list : [];
  };
  const glass = () => {
    const list = typeof getGlass === 'function' ? getGlass() : getGlass;
    return Array.isArray(list) ? list : [];
  };
  const all = () => [...soft(), ...glass()];

  function active() {
    return all().filter(actorActive);
  }

  function byUid(uid) {
    const value = Number(uid);
    if (!Number.isFinite(value)) return null;
    return all().find(actor => actorActive(actor) && actorUid(actor) === value) || null;
  }

  function homeResidents(name) {
    if (!name) return 0;
    return all().filter(actor => actorActive(actor) && actorHome(actor) === name).length;
  }

  return { soft, glass, all, active, byUid, homeResidents };
}
