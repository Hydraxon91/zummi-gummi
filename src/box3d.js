// Thin JS wrapper around the Box3D WASM build (vendor/box3d).
// Handles live in C; this module batches state reads and force application.
import createBox3D from '../vendor/box3d/box3d.js';

let M = null;
let scratch = null;

function heap32(){ return M.HEAP32; }
function heapF32(){ return M.HEAPF32; }

function ensureScratch(n){
  if (scratch && scratch.cap >= n) return;
  const cap = Math.max(256, 1 << Math.ceil(Math.log2(n)));
  if (scratch){ M._free(scratch.handles); M._free(scratch.out); M._free(scratch.forces); M._free(scratch.impulses); M._free(scratch.vec); }
  scratch = {
    cap,
    handles: M._malloc(cap*4),
    out: M._malloc(cap*7*4),
    forces: M._malloc(cap*3*4),
    impulses: M._malloc(cap*3*4),
    vec: M._malloc(cap*3*4),
  };
}

export async function initPhysics(maxBodies, gravity){
  if (M) return wrapper;
  M = await createBox3D();
  const ok = M._g3_init(maxBodies, gravity.x, gravity.y, gravity.z);
  if (!ok) throw new Error('Box3D init failed');
  ensureScratch(maxBodies + 16);
  return wrapper;
}

function writeHandles(handles){
  const h32 = heap32(), base = scratch.handles >> 2;
  for (let i=0;i<handles.length;i++) h32[base+i] = handles[i];
}

const wrapper = {
  get module(){ return M; },
  ensure(n){ ensureScratch(n); },
  step(dt, substeps=1){ M._g3_step(dt, substeps); },
  bodyCount(){ return M._g3_body_count(); },

  staticBox(x,y,z,hx,hy,hz,friction,restitution,group=0){
    return M._g3_static_box(x,y,z,hx,hy,hz,friction,restitution,group);
  },
  staticSphere(x,y,z,r,friction,restitution,group=0){
    return M._g3_static_sphere(x,y,z,r,friction,restitution,group);
  },
  sphere(x,y,z,r,mass,group,friction,restitution,lockRotation=true,awake=true){
    return M._g3_sphere(x,y,z,r,mass,group,friction,restitution,lockRotation?1:0,awake?1:0);
  },
  destroy(handle){ M._g3_destroy(handle); },
  joint(a,b,length,hertz,damping,collide=false){
    return M._g3_joint(a,b,length,hertz,damping,collide?1:0);
  },

  // handles: Int32Array/number[]; out: Float32Array (7 per body)
  read(handles, out, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    M._g3_read(scratch.handles, scratch.out, n);
    const f = heapF32(), base = scratch.out >> 2;
    for (let i=0;i<n*7;i++) out[i] = f[base+i];
  },

  // forces: Float32Array (3 per body)
  applyForces(handles, forces, wake=true, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    const f = heapF32(), base = scratch.forces >> 2;
    for (let i=0;i<n*3;i++) f[base+i] = forces[i];
    M._g3_apply_forces(scratch.handles, scratch.forces, n, wake?1:0);
  },
  applyImpulses(handles, impulses, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    const f = heapF32(), base = scratch.impulses >> 2;
    for (let i=0;i<n*3;i++) f[base+i] = impulses[i];
    M._g3_apply_impulses(scratch.handles, scratch.impulses, n);
  },
  setPositions(handles, positions, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    const f = heapF32(), base = scratch.vec >> 2;
    for (let i=0;i<n*3;i++) f[base+i] = positions[i];
    M._g3_set_positions(scratch.handles, scratch.vec, n);
  },
  setVelocities(handles, velocities, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    const f = heapF32(), base = scratch.vec >> 2;
    for (let i=0;i<n*3;i++) f[base+i] = velocities[i];
    M._g3_set_velocities(scratch.handles, scratch.vec, n);
  },
  wake(handles, n = handles.length){
    ensureScratch(n);
    writeHandles(handles);
    M._g3_wake(scratch.handles, n);
  },
};
