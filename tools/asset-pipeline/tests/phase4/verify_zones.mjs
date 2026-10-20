// Verify that the Phase 4 crate GLB preserves the intended material zones.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const args = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key.startsWith('--')) continue;
  args[key.slice(2)] = process.argv[index + 1];
  index += 1;
}
if (!args.glb) {
  console.error('usage: verify_zones.mjs --glb file.glb [--build zone_build.json] [--out report.json]');
  process.exit(2);
}

const bytes = readFileSync(args.glb);
if (bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB');
if (bytes.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2.0');
let offset = 12;
let doc = null;
let binary = null;
while (offset + 8 <= bytes.length) {
  const size = bytes.readUInt32LE(offset);
  const type = bytes.readUInt32LE(offset + 4);
  offset += 8;
  const chunk = bytes.subarray(offset, offset + size);
  if (type === 0x4e4f534a) doc = JSON.parse(chunk.toString('utf8'));
  if (type === 0x004e4942 && binary === null) binary = chunk;
  offset += size;
}
if (!doc) throw new Error('GLB has no JSON chunk');
if (!binary) throw new Error('GLB has no BIN chunk');

const accessors = doc.accessors || [];
const bufferViews = doc.bufferViews || [];
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function readAccessor(index) {
  const accessor = accessors[index];
  if (!accessor) throw new Error(`Missing accessor ${index}`);
  const view = bufferViews[accessor.bufferView];
  if (!view) throw new Error(`Accessor ${index} has no bufferView`);
  const size = componentBytes[accessor.componentType];
  const count = componentCount[accessor.type];
  if (!size || !count) throw new Error(`Unsupported accessor ${index}`);
  const stride = view.byteStride || size * count;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = [];
  for (let item = 0; item < accessor.count; item += 1) {
    const itemOffset = start + item * stride;
    if (count === 1) {
      if (accessor.componentType === 5126) values.push(binary.readFloatLE(itemOffset));
      else if (accessor.componentType === 5125) values.push(binary.readUInt32LE(itemOffset));
      else if (accessor.componentType === 5123) values.push(binary.readUInt16LE(itemOffset));
      else if (accessor.componentType === 5121) values.push(binary.readUInt8(itemOffset));
      else values.push(binary.readInt16LE(itemOffset));
    } else {
      const tuple = [];
      for (let part = 0; part < count; part += 1) {
        const partOffset = itemOffset + part * size;
        tuple.push(accessor.componentType === 5126
          ? binary.readFloatLE(partOffset)
          : accessor.componentType === 5125
            ? binary.readUInt32LE(partOffset)
            : accessor.componentType === 5123
              ? binary.readUInt16LE(partOffset)
              : binary.readUInt8(partOffset));
      }
      values.push(tuple);
    }
  }
  return values;
}

const materials = (doc.materials || []).map(material => material.name || '');
const primitives = [];
for (const mesh of doc.meshes || []) {
  for (const primitive of mesh.primitives || []) {
    const materialIndex = primitive.material ?? -1;
    const name = materials[materialIndex] || `material-${materialIndex}`;
    const positions = readAccessor(primitive.attributes.POSITION);
    const indices = Number.isInteger(primitive.indices)
      ? readAccessor(primitive.indices)
      : null;
    primitives.push({
      name,
      materialIndex,
      positions,
      indices,
      triangles: Math.floor((indices ? indices.length : positions.length) / 3),
    });
  }
}

const boundsMin = [Infinity, Infinity, Infinity];
const boundsMax = [-Infinity, -Infinity, -Infinity];
for (const primitive of primitives) {
  for (const point of primitive.positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      boundsMin[axis] = Math.min(boundsMin[axis], point[axis]);
      boundsMax[axis] = Math.max(boundsMax[axis], point[axis]);
    }
  }
}
const extent = Math.max(...boundsMax.map((value, axis) => value - boundsMin[axis]));
const boundaryTolerance = Math.max(1e-4, extent * 0.08);

function triangleNormal(primitive, triangle) {
  const index = triangle * 3;
  const point = offsetIndex => primitive.indices
    ? primitive.positions[primitive.indices[offsetIndex]]
    : primitive.positions[offsetIndex];
  const a = point(index);
  const b = point(index + 1);
  const c = point(index + 2);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return {
    normal: normal.map(value => Math.abs(value) / length),
    centroid: [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ],
  };
}

function boundaryAxes(centroid) {
  let count = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.min(
      Math.abs(centroid[axis] - boundsMin[axis]),
      Math.abs(boundsMax[axis] - centroid[axis]),
    ) <= boundaryTolerance) count += 1;
  }
  return count;
}

const surfaces = {};
const byMaterial = {};
for (const primitive of primitives) {
  if (!byMaterial[primitive.name]) byMaterial[primitive.name] = [];
  byMaterial[primitive.name].push(primitive);
}
for (const [name, group] of Object.entries(byMaterial)) {
  let total = 0;
  let axisAligned = 0;
  let boundaryFaces = 0;
  let edgeBoundary = 0;
  for (const primitive of group) {
    for (let triangle = 0; triangle < primitive.triangles; triangle += 1) {
      const { normal, centroid } = triangleNormal(primitive, triangle);
      const maxComponent = Math.max(...normal);
      const otherComponents = normal.filter(value => value !== maxComponent);
      const isAxisAligned = maxComponent > 0.99
        && otherComponents.every(value => value < 0.02);
      const boundary = boundaryAxes(centroid);
      total += 1;
      if (isAxisAligned) axisAligned += 1;
      if (boundary >= 1) boundaryFaces += 1;
      if (boundary >= 2) edgeBoundary += 1;
    }
  }
  surfaces[name] = {
    triangles: total,
    axisAlignedTriangles: axisAligned,
    boundaryTriangles: boundaryFaces,
    edgeBoundaryTriangles: edgeBoundary,
  };
}

const zones = Object.fromEntries(Object.entries(byMaterial)
  .map(([name, group]) => [name, group.reduce(
    (total, primitive) => total + primitive.triangles, 0)]));
const triangles = Object.values(zones).reduce((total, value) => total + value, 0);
const mainName = materials.find(name => name.includes('Main')) || null;
const edgeName = materials.find(name => name.includes('Pilot')) || null;
const mainSurface = mainName ? surfaces[mainName] : null;
const edgeSurface = edgeName ? surfaces[edgeName] : null;
const checks = {
  twoMaterials: materials.length === 2,
  mainMaterial: Boolean(mainName),
  edgeMaterial: Boolean(edgeName),
  totalTriangles: triangles === 108,
  mainTriangles: mainName ? zones[mainName] === 12 : false,
  edgeTriangles: edgeName ? zones[edgeName] === 96 : false,
  mainSurface: Boolean(mainSurface)
    && mainSurface.axisAlignedTriangles === mainSurface.triangles
    && mainSurface.boundaryTriangles === mainSurface.triangles,
  edgeSurface: Boolean(edgeSurface)
    && edgeSurface.axisAlignedTriangles === 0
    && edgeSurface.edgeBoundaryTriangles === edgeSurface.triangles,
};
let build = null;
if (args.build) {
  build = JSON.parse(readFileSync(args.build, 'utf8'));
  checks.buildHash = build.glb_sha256
    === createHash('sha256').update(bytes).digest('hex');
  checks.buildMain = build.zones?.main?.triangles === zones[mainName];
  checks.buildEdge = build.zones?.edge?.triangles === zones[edgeName];
}
const report = {
  glb: args.glb,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  materials,
  zones,
  surfaces,
  primitiveCount: primitives.length,
  triangles,
  checks,
  status: Object.values(checks).every(Boolean) ? 'pass' : 'fail',
};
if (args.out) writeFileSync(args.out, JSON.stringify(report, null, 2));
console.log('PHASE4_ZONE_VERIFY', JSON.stringify(report, null, 2));
process.exit(report.status === 'pass' ? 0 : 1);