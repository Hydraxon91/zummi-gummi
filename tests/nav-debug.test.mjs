import test from 'node:test';
import assert from 'node:assert/strict';
import { createNavMesh } from '../src/navmesh.js';
import { buildNavDebugObject } from '../src/navdebug.js';

function fakeThree() {
  class Float32BufferAttribute {
    constructor(array, itemSize) { this.array = array; this.itemSize = itemSize; }
  }
  class BufferGeometry {
    setAttribute(name, attribute) {
      this.attributes ||= {};
      this.attributes[name] = attribute;
    }
  }
  class LineBasicMaterial {
    constructor(options) { Object.assign(this, options); }
  }
  class LineSegments {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
      this.visible = true;
    }
  }
  return { Float32BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments };
}

function makeNav() {
  const nav = createNavMesh({
    minX: -4, maxX: 4, minZ: -4, maxZ: 4,
    cell: 1, agentRadius: .1, extraClearance: 0,
  });
  nav.addSolid({ kind: 'rock', x: 0, z: 0, r: .8 });
  nav.bake();
  return nav;
}

test('the isolated debug builder keeps the existing mesh contract', () => {
  const nav = makeNav();
  const mesh = buildNavDebugObject(fakeThree(), nav);
  const position = mesh.geometry.attributes.position;

  assert.equal(mesh.visible, false);
  assert.equal(mesh.frustumCulled, false);
  assert.equal(mesh.renderOrder, 8);
  assert.equal(mesh.material.color, 0x6fe3ff);
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.opacity, 0.55);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.toneMapped, false);
  assert.equal(position.itemSize, 3);
  assert.equal(position.array.length / 6, 16);
  for (let i = 1; i < position.array.length; i += 3) assert.equal(position.array[i], 0.045);
  for (let i = 0; i < position.array.length; i += 3) {
    assert.ok(Number.isInteger(position.array[i]));
    assert.ok(Number.isInteger(position.array[i + 2]));
  }
});

test('debug rendering leaves the asymmetric path fixture unchanged', () => {
  const nav = makeNav();
  const path = nav.findPath(-1.5, -1.5, 1.5, 1.5);
  const sameCell = nav.findPath(.1, .1, .2, .2);
  buildNavDebugObject(fakeThree(), nav);

  assert.deepEqual(nav.nearestWalkable(-1.9, -1.9), { x: -1.5, z: -1.5, ix: 2, iz: 2 });
  assert.deepEqual(nav.nearestWalkable(1.9, 1.9), { x: 1.5, z: 1.5, ix: 5, iz: 5 });
  assert.deepEqual(path, [
    { x: -1.5, z: -1.5 },
    { x: 1.5, z: -1.5 },
    { x: 1.5, z: 1.5 },
  ]);
  assert.deepEqual(sameCell, [{ x: 1.5, z: 0.5 }]);
  assert.deepEqual(nav.findPath(-1.5, -1.5, 1.5, 1.5), path);
  assert.deepEqual(nav.findPath(.1, .1, .2, .2), sameCell);
  assert.deepEqual(nav.validate(), []);
});
