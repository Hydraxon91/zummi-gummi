import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGlassActor,
  isSoftBodyActor,
  actorKind,
  actorUid,
  actorActive,
  actorPosition,
  actorHome,
  createActorView,
} from '../src/npc.js';

const soft = { uid: 1, active: true, px: [0, 0, 0], cx: 1, cy: 2, cz: 3, home: 'Honeydew Cottage' };
const glass = { uid: 2, active: true, kind: 'glass', cx: 4, cy: 5, cz: 6, home: 'Juniper House' };
const inactive = { uid: 3, active: false, px: [0, 0, 0], cx: 7, cy: 8, cz: 9, home: 'Honeydew Cottage' };

test('actor predicates distinguish soft bodies and Glass', () => {
  assert.equal(isGlassActor(glass), true);
  assert.equal(isGlassActor(soft), false);
  assert.equal(isSoftBodyActor(soft), true);
  assert.equal(isSoftBodyActor(glass), false);
  assert.equal(isSoftBodyActor({ active: true }), false);
  assert.equal(actorKind(soft), 'softbody');
  assert.equal(actorKind(glass), 'glass');
  assert.equal(actorKind(null), null);
  assert.equal(actorUid(soft), 1);
  assert.equal(actorUid({ uid: '1' }), null);
  assert.equal(actorActive(soft), true);
  assert.equal(actorActive(inactive), false);
  assert.deepEqual(actorPosition(soft), { x: 1, y: 2, z: 3 });
  assert.equal(actorPosition(null), null);
  assert.equal(actorHome(soft), 'Honeydew Cottage');
  assert.equal(actorHome({}), '');
});

test('the shared actor view filters active actors and resolves by uid', () => {
  const view = createActorView({
    getSoft: () => [soft, inactive],
    getGlass: () => [glass],
  });

  assert.equal(view.all().length, 3);
  assert.equal(view.active().length, 2);
  assert.equal(view.byUid(1), soft);
  assert.equal(view.byUid('2'), glass);
  assert.equal(view.byUid(3), null);
  assert.equal(view.byUid('bad'), null);
  assert.equal(view.homeResidents('Honeydew Cottage'), 1);
  assert.equal(view.homeResidents('Juniper House'), 1);
  assert.equal(view.homeResidents(''), 0);
});

test('the actor view accepts fixed arrays as well as getters', () => {
  const view = createActorView({ getSoft: [soft, inactive], getGlass: [glass] });
  assert.equal(view.active().length, 2);
  assert.equal(view.byUid(2), glass);
});
