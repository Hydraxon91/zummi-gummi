// Gummy Bears — thin C wrapper around Box3D for the browser.
// One world, sphere bodies with locked rotation (so the soft-body solver can
// drive translations only), batched state reads / force application.
#include "box3d/box3d.h"
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <math.h>

static b3WorldId g_world;
static int g_valid = 0;

typedef struct { b3BodyId id; int alive; } BodySlot;
static BodySlot* g_bodies = NULL;
static int g_bodyCap = 0, g_bodyCount = 0, g_alive = 0;

static void ensure_cap(int n){
  if (n <= g_bodyCap) return;
  int cap = g_bodyCap ? g_bodyCap : 256;
  while (cap < n) cap *= 2;
  g_bodies = (BodySlot*)realloc(g_bodies, sizeof(BodySlot) * (size_t)cap);
  g_bodyCap = cap;
}

static b3Vec3 v3(float x, float y, float z){ b3Vec3 v = { x, y, z }; return v; }
static b3Transform identity_tf(void){
  b3Transform t;
  t.p = v3(0,0,0);
  t.q.v = v3(0,0,0);
  t.q.s = 1.0f;
  return t;
}

EMSCRIPTEN_KEEPALIVE
int g3_init(int maxBodies, float gx, float gy, float gz){
  if (g_valid) return 0;
  b3WorldDef wd = b3DefaultWorldDef();
  wd.gravity = v3(gx, gy, gz);
  wd.workerCount = 1;                 // single thread: no COOP/COEP needed
  wd.enableSleep = true;
  wd.enableContinuous = true;
  wd.restitutionThreshold = 0.5f;
  wd.maximumLinearSpeed = 40.0f;
  if (maxBodies > 0){
    wd.capacity.dynamicBodyCount = maxBodies;
    wd.capacity.dynamicShapeCount = maxBodies;
    wd.capacity.contactCount = maxBodies * 6;
  }
  wd.capacity.staticBodyCount = 512;
  wd.capacity.staticShapeCount = 512;
  g_world = b3CreateWorld(&wd);
  // soft, slightly damped contacts — jelly rather than billiard balls
  b3World_SetContactTuning(g_world, 55.0f, 0.72f, 2.4f);
  g_bodies = NULL; g_bodyCap = 0; g_bodyCount = 0; g_alive = 0;
  ensure_cap(maxBodies > 0 ? maxBodies : 4096);
  g_valid = 1;
  return 1;
}

EMSCRIPTEN_KEEPALIVE
void g3_shutdown(void){
  if (!g_valid) return;
  b3DestroyWorld(g_world);
  free(g_bodies);
  g_bodies = NULL; g_bodyCap = 0; g_bodyCount = 0; g_alive = 0;
  g_valid = 0;
}

EMSCRIPTEN_KEEPALIVE
void g3_step(float dt, int substeps){
  if (!g_valid) return;
  b3World_Step(g_world, dt, substeps);
}

// static circle collider for trunks, cottages, rocks and the cannon base
EMSCRIPTEN_KEEPALIVE
int g3_static_sphere(float x, float y, float z, float r,
                     float friction, float restitution, int group){
  if (!g_valid) return -1;
  ensure_cap(g_bodyCount + 1);
  b3BodyDef bd = b3DefaultBodyDef();
  bd.type = b3_staticBody;
  bd.position = (b3Pos){ (double)x, (double)y, (double)z };
  b3BodyId id = b3CreateBody(g_world, &bd);
  b3Sphere sph;
  sph.center = v3(0,0,0);
  sph.radius = r;
  b3ShapeDef sd = b3DefaultShapeDef();
  sd.baseMaterial.friction = friction;
  sd.baseMaterial.restitution = restitution;
  sd.filter.categoryBits = 1;
  sd.filter.maskBits = ~0ULL;
  sd.filter.groupIndex = group;
  b3CreateSphereShape(id, &sd, &sph);
  int h = g_bodyCount++;
  g_bodies[h].id = id;
  g_bodies[h].alive = 1;
  g_alive++;
  return h;
}

// rotated static box used by the circular meadow wall
EMSCRIPTEN_KEEPALIVE
int g3_static_box_rot(float x, float y, float z, float hx, float hy, float hz,
                      float yaw, float friction, float restitution, int group){
  if (!g_valid) return -1;
  ensure_cap(g_bodyCount + 1);
  b3BodyDef bd = b3DefaultBodyDef();
  bd.type = b3_staticBody;
  bd.position = (b3Pos){ (double)x, (double)y, (double)z };
  bd.rotation.v = v3(0.0f, sinf(yaw * 0.5f), 0.0f);
  bd.rotation.s = cosf(yaw * 0.5f);
  b3BodyId id = b3CreateBody(g_world, &bd);
  b3BoxHull hull = b3MakeBoxHull(hx, hy, hz);
  b3ShapeDef sd = b3DefaultShapeDef();
  sd.baseMaterial.friction = friction;
  sd.baseMaterial.restitution = restitution;
  sd.filter.categoryBits = 1;
  sd.filter.maskBits = ~0ULL;
  sd.filter.groupIndex = group;
  b3CreateHullShape(id, &sd, &hull.base);
  int h = g_bodyCount++;
  g_bodies[h].id = id;
  g_bodies[h].alive = 1;
  g_alive++;
  return h;
}

// returns a handle so walls/bounds can be rebuilt without leaking bodies
EMSCRIPTEN_KEEPALIVE
int g3_static_box(float x, float y, float z, float hx, float hy, float hz,
                  float friction, float restitution, int group){
  if (!g_valid) return -1;
  ensure_cap(g_bodyCount + 1);
  b3BodyDef bd = b3DefaultBodyDef();
  bd.type = b3_staticBody;
  bd.position = (b3Pos){ (double)x, (double)y, (double)z };
  b3BodyId id = b3CreateBody(g_world, &bd);
  b3BoxHull hull = b3MakeBoxHull(hx, hy, hz);
  b3ShapeDef sd = b3DefaultShapeDef();
  sd.baseMaterial.friction = friction;
  sd.baseMaterial.restitution = restitution;
  sd.filter.categoryBits = 1;
  sd.filter.maskBits = ~0ULL;
  sd.filter.groupIndex = group;
  b3CreateHullShape(id, &sd, &hull.base);
  int h = g_bodyCount++;
  g_bodies[h].id = id;
  g_bodies[h].alive = 1;
  g_alive++;
  return h;
}

// returns a stable handle (index into the slot table) or -1
EMSCRIPTEN_KEEPALIVE
int g3_sphere(float x, float y, float z, float r, float mass,
              int group, float friction, float restitution,
              int lockRotation, int awake){
  if (!g_valid) return -1;
  ensure_cap(g_bodyCount + 1);
  b3BodyDef bd = b3DefaultBodyDef();
  bd.type = b3_dynamicBody;
  bd.position = (b3Pos){ (double)x, (double)y, (double)z };
  bd.motionLocks.angularX = lockRotation != 0;
  bd.motionLocks.angularY = lockRotation != 0;
  bd.motionLocks.angularZ = lockRotation != 0;
  bd.enableSleep = true;
  bd.isAwake = awake != 0;
  bd.linearDamping = 0.0f;
  bd.angularDamping = 0.0f;
  b3BodyId id = b3CreateBody(g_world, &bd);
  b3Sphere sph;
  sph.center = v3(0,0,0);
  sph.radius = r;
  b3ShapeDef sd = b3DefaultShapeDef();
  const float vol = 4.1887902f * r * r * r;      // 4/3 pi r^3
  sd.density = (vol > 1e-9f) ? (mass / vol) : 1.0f;
  sd.baseMaterial.friction = friction;
  sd.baseMaterial.restitution = restitution;
  sd.baseMaterial.rollingResistance = 0.55f;
  sd.filter.categoryBits = 2;                     // bear parts
  sd.filter.maskBits = ~0ULL;
  sd.filter.groupIndex = group;                   // negative groups: no intra-bear collisions
  sd.updateBodyMass = true;
  b3CreateSphereShape(id, &sd, &sph);
  int h = g_bodyCount++;
  g_bodies[h].id = id;
  g_bodies[h].alive = 1;
  g_alive++;
  return h;
}

EMSCRIPTEN_KEEPALIVE
int g3_joint(int a, int b, float length, float hertz, float damping, int collide){
  if (!g_valid || a < 0 || b < 0 || a >= g_bodyCount || b >= g_bodyCount) return 0;
  if (!g_bodies[a].alive || !g_bodies[b].alive) return 0;
  b3DistanceJointDef jd = b3DefaultDistanceJointDef();
  jd.base.bodyIdA = g_bodies[a].id;
  jd.base.bodyIdB = g_bodies[b].id;
  jd.base.localFrameA = identity_tf();
  jd.base.localFrameB = identity_tf();
  jd.base.collideConnected = collide != 0;
  jd.length = length;
  jd.enableSpring = true;
  jd.hertz = hertz;
  jd.dampingRatio = damping;
  b3CreateDistanceJoint(g_world, &jd);
  return 1;
}

EMSCRIPTEN_KEEPALIVE
void g3_destroy(int h){
  if (!g_valid || h < 0 || h >= g_bodyCount || !g_bodies[h].alive) return;
  b3DestroyBody(g_bodies[h].id);     // joints on this body are destroyed with it
  g_bodies[h].alive = 0;
  g_alive--;
}

EMSCRIPTEN_KEEPALIVE
int g3_body_count(void){ return g_alive; }

// out: 7 floats per body — x,y,z, vx,vy,vz, awake
EMSCRIPTEN_KEEPALIVE
void g3_read(const int* handles, float* out, int n){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3WorldTransform t = b3Body_GetTransform(g_bodies[h].id);
    b3Vec3 v = b3Body_GetLinearVelocity(g_bodies[h].id);
    out[i*7+0] = (float)t.p.x;
    out[i*7+1] = (float)t.p.y;
    out[i*7+2] = (float)t.p.z;
    out[i*7+3] = v.x;
    out[i*7+4] = v.y;
    out[i*7+5] = v.z;
    out[i*7+6] = b3Body_IsAwake(g_bodies[h].id) ? 1.0f : 0.0f;
  }
}

EMSCRIPTEN_KEEPALIVE
void g3_apply_forces(const int* handles, const float* f, int n, int wake){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3Body_ApplyForceToCenter(g_bodies[h].id, v3(f[i*3], f[i*3+1], f[i*3+2]), wake != 0);
  }
}

EMSCRIPTEN_KEEPALIVE
void g3_apply_impulses(const int* handles, const float* imp, int n){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3Body_ApplyLinearImpulseToCenter(g_bodies[h].id, v3(imp[i*3], imp[i*3+1], imp[i*3+2]), true);
  }
}

EMSCRIPTEN_KEEPALIVE
void g3_set_positions(const int* handles, const float* pos, int n){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3Quat q; q.v = v3(0,0,0); q.s = 1.0f;
    b3Body_SetTransform(g_bodies[h].id, (b3Pos){ (double)pos[i*3], (double)pos[i*3+1], (double)pos[i*3+2] }, q);
    b3Body_SetAwake(g_bodies[h].id, true);
  }
}

EMSCRIPTEN_KEEPALIVE
void g3_set_velocities(const int* handles, const float* vel, int n){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3Body_SetLinearVelocity(g_bodies[h].id, v3(vel[i*3], vel[i*3+1], vel[i*3+2]));
  }
}

EMSCRIPTEN_KEEPALIVE
void g3_wake(const int* handles, int n){
  for (int i = 0; i < n; i++){
    int h = handles[i];
    if (h < 0 || h >= g_bodyCount || !g_bodies[h].alive) continue;
    b3Body_SetAwake(g_bodies[h].id, true);
  }
}
