import * as THREE from 'three';
import { createLauncher } from './launcher.js';
import { createSky, DAY_SECONDS } from './sky.js';
import { buildField, POND_HOLE, POND } from './field.js';
import { createBearAI } from './ai.js';
import { createBehavior, behaviorEngineFromSearch } from './behaviors/index.js';
import { createAIDebug } from './aidebug.js';
import { createThoughtBubbleOverlay } from './thoughtbubble.js';
import { createDepartureHook } from './departures.js';
import { createEffects } from './effects.js';
import { GRAPHICS_GROUPS, GRAPHICS_DEFAULTS, normalizeGraphics, readGraphics, createGraphicsPanel } from './graphics.js';
import {
  DEFAULT_NATURE, SETTINGS_PROFILE_IDS, normalizeNature, createSettingsProfiles,
  resolveSettingsProfile,
} from './settings.js';
import { cameraHomeFor, cameraPositionFor } from './camera.js';
import {
  HOME_CAPACITY, MATE_COOLDOWN, GESTATION_TIME, STAGE_ORDER,
  advanceAge, advanceGestation, ageForStage, scaleForStage, stageForAge,
  blendTraits,
} from './life.js';
import { ensureTraits } from './behaviors/traits.js';
import { createStudioReturnPortal } from './studiohouse.js';
import { createMSNPrototype } from './msn.js';
import { createGlassColony } from './glass.js';
import { createGiftVisuals } from './giftvisuals.js';
import { assetStore } from './assetstore.js';
import { createActorView, isGlassActor } from './npc.js';
import { chooseBirthHome as chooseBirthHomeRule, countHomeResidents } from './homesim.js';
import { getSpecies, speciesForRig, listSpecies, requireSpeciesRuntime } from './species.js';
import { combineGenomes, defaultGenome, expressGenome, normalizeGenome } from './dna.js';
import { applyStageGrowth } from './actorlife.js';
import { planBirth } from './actorbirth.js';
import { removeSoftActor, removeGlassActor as removeGlassActorCore } from './actorremove.js';
import { FIELD_RADIUS, fieldClamp, fieldInside, fieldRadiusAt } from './fieldshape.js';
import { activeWorld, getActiveMap, saveLauncherPos, worlds, setActiveMap, persistWorld, MAPS, hydrateWorld } from './world.js';
import { SAVE_FORMAT, SAVE_VERSION, AUTOSAVE_ID, normalizeSave, listSaves, readSave, writeSave, removeSave } from './save.js';
import { snapshotActor, applyCommonActorState } from './actorrecord.js';
import { maxActorUid } from './actorsave.js';
import { buildRelationshipView } from './relationshipview.js';
import { buildRosterRows, rosterSignature } from './rosterview.js';
import { createSaveSlotsPanel, createMenuSaveList } from './savepanel.js';
import { createPanelView, escapeTarget } from './panelcontroller.js';
import { pruneActorRefs, familyFor as sharedFamilyFor, historyFor, routineWindowFor, teachSkill, pushHistory } from './family.js';
import { MAP_CONTENT } from './mapcontent.js';
import { enterMapSession, leaveCurrentMap } from './mapsession.js';
import { createSessionGate } from './sessiongate.js';
import { captureSavePayload, applySavePayloadPhases } from './savecoordination.js';
import { avoidanceYaw as steerAvoidance } from './avoidance.js';
import { SURFACE_LATTICE_LIMITS, surfaceBounds, chooseSurfaceLattice } from './surfacelattice.js';

// Explicit, early composition: hydrate world preferences before any
// activeWorld/map state is read. Storage denial stays inside world.js's
// documented best-effort getter.
hydrateWorld();

const BEHAVIOR_ENGINE = behaviorEngineFromSearch(typeof location !== 'undefined' ? location.search : '');
const nativeRandom = Math.random;
let launcher = null;
let field = null;
let sky = null;
let ai = null;
let behavior = null;
let aiDebug = null;
let thoughtBubbles = null;
let departures = null;
let giftVisuals = null;
const farewells = new Map();
let farewellGlowTex = null;
const FAREWELL_KEY = 'gummy.farewells';
const ADOPTION_KEY = 'gummy.adoption';
const GIFTING_KEY = 'gummy.gifting';
const SOCIAL_KEY = 'gummy.social';
const SOCIAL_FEATURES = Object.freeze({
  pairActivities: 'pairActivities',
  rivalry: 'rivalry',
  reconciliation: 'reconciliation',
  partnership: 'partnership',
  groupActivities: 'groupActivities',
});
let adoptionEnabled = false;
let giftingEnabled = false;
const socialFeatures = {
  pairActivities: false,
  rivalry: false,
  reconciliation: false,
  partnership: false,
  groupActivities: false,
};
const FAREWELL_FEATURES = {
  farewells: 'farewells',
  starsOldAge: 'starsOldAge',
  starsStarvation: 'starsStarvation',
  starsStings: 'starsStings',
  mourning: 'mourning',
};
const farewellSettings = {
  farewells: false, starsOldAge: false, starsStarvation: false, starsStings: false,
  mourning: false,
};
let selectedBear = null;
let directivePick = false;
let relationshipTab = 'relationships';
let expandedRelationshipKey = null;
let clickMode = 'grab';
try { clickMode = localStorage.getItem('gummy.clickMode') === 'select' ? 'select' : 'grab'; } catch (err) {}
let possessedBear = null;
let possessHopCd = 0;
const possessInput = { x: 0, y: 0 };
let effects = null;
let studioReturnPortal = null;
let msnPrototype = null;
let glassColony = null;
const RACE_ENABLED = new URLSearchParams(location.search).get('race') !== 'off';
const RACE_LOOK = new URLSearchParams(location.search).get('race') === 'alpha' ? 'alpha' : 'glass';
const STUDIO_CAST_KEY = 'gummy.studio.cast';
function readStudioCast(){
  try {
    const value = localStorage.getItem(STUDIO_CAST_KEY);
    if (value === 'bears' || value === 'both' || value === 'msn') return value;
  } catch (err) {}
  return 'both';
}
let studioCast = readStudioCast();
const fieldColliderHandles = [];
const cannonColliderHandles = { studio: -1, field: -1 };
const BEAR_NAMES = ['Mochi','Boba','Gumdrop','Taffy','Pip','Pebble','Juniper','Mallow','Biscuit','Clover','Poppy','Sundae','Nougat','Sprout','Marbles','Pudding','Fizz','Waffles'];
let nextBearName = 0;
function takeBearName(){ return BEAR_NAMES[(nextBearName++) % BEAR_NAMES.length]; }
function isMeadow(){ return getActiveMap().kind === 'life'; }
function speciesOf(b){ return b ? (b.speciesDef || getSpecies(b.species)) : null; }
function isGummyActor(b){ const def = speciesOf(b); return !!(def && def.hasTells); }
const actorView = createActorView({
  getSoft: () => bears,
  getGlass: () => (glassColony ? glassColony.actors : []),
});
function allActors(){ return actorView.all(); }
function actorName(a){
  return a ? (a.name || (a.kind === 'glass' ? 'Glass' : a.species === 'msn' ? 'Gummy' : 'Bear')) : '';
}
function familyFor(a) {
  return sharedFamilyFor(a, actorView.all());
}
function familyNames(list) {
  return (list || []).map(actorName).filter(Boolean).join(', ');
}
function familyLine(a) {
  const family = familyFor(a);
  const parts = [];
  if (family.parents.length) parts.push(`Parents: ${familyNames(family.parents)}`);
  if (family.grandparents.length) parts.push(`Grandparents: ${familyNames(family.grandparents)}`);
  if (family.siblings.length) parts.push(`Siblings: ${familyNames(family.siblings)}`);
  if (family.children.length) parts.push(`Children: ${familyNames(family.children)}`);
  if (family.grandchildren.length) parts.push(`Grandchildren: ${familyNames(family.grandchildren)}`);
  parts.push(`Generation ${family.generation}`);
  return parts.join(' · ');
}
function familyShort(a) {
  const family = familyFor(a);
  const siblings = family.siblings.length;
  const hasFamily = family.parents.length || siblings || family.children.length;
  if (!hasFamily) return '';
  const bits = [`Gen ${family.generation}`];
  if (siblings) bits.push(`${siblings} sibling${siblings === 1 ? '' : 's'}`);
  if (family.children.length) bits.push(`${family.children.length} child${family.children.length === 1 ? '' : 'ren'}`);
  return bits.join(' · ');
}
function reserveUid(value){
  if (Number.isFinite(value)) {
    if (value >= nextBearUid) nextBearUid = value + 1;
    return value;
  }
  return nextBearUid++;
}

function reserveWorldUids(world){
  const max = maxActorUid({ field: world });
  if (max >= nextBearUid) nextBearUid = max + 1;
}

function reserveGameUids(worlds){
  nextBearUid = Math.max(1, maxActorUid(worlds) + 1);
}
function applyDnaTraits(b){
  const defaults = speciesOf(b)?.genetics?.defaults || {};
  const genes = b.genome?.genes || {};
  const ratio = (value, base, fallback = 1) => {
    const v = Number(value), d = Number(base);
    return Number.isFinite(v) && Number.isFinite(d) && d > 0 ? v / d : fallback;
  };
  b.dnaRigidityScale = clamp(ratio(genes.rigidity, defaults.rigidity), .55, 1.8);
  b.dnaDampingScale = clamp(1 / Math.max(.5, ratio(genes.softness, defaults.softness)), .65, 1.45);
  b.dnaStretchScale = clamp(ratio(genes.stretch, defaults.stretch), .6, 1.5);
  b.dnaMaterial = genes.material || speciesOf(b)?.material || 'flavor';
}
function studioActorHidden(b){
  if (isMeadow()) return false;
  const def = b.speciesDef || getSpecies(b.species);
  if (def.id === 'msn' && !RACE_ENABLED) return true;
  if (studioCast === 'msn') return def.castGroup === 'bear';
  if (studioCast === 'bears') return def.castGroup === 'msn';
  return false;
}
function studioCannonHidden(){ return !isMeadow() && studioCast === 'msn'; }
try { document.body.dataset.map = activeWorld.mapId; } catch (err) {}

/* ============================================================================
   GUMMY BEARS
   ----------------------------------------------------------------------------
   Metaball soft-body bears. Every bear is ~10 mass points; the visible surface
   is one implicit surface (spheres + capsules) polygonised with surface nets.
   Physics has no net internal momentum; damping is relative to each bear's COM.
   ==========================================================================*/

/* ----------------------------- tunables ---------------------------------- */
const FIXED_DT   = 1/60;         // one outer step per frame; Box3D sub-solves
const SUBSTEPS   = 1;
const MAX_STEPS  = 8;            // accumulator ceiling (2 frames of catch-up)
const GRAV       = -12.0;
const VMAX       = 26;
const COARSE_POINTER = (typeof matchMedia !== 'undefined') && matchMedia('(pointer: coarse)').matches;
const BEAR_HARD_MAX = 256;                 // pooled capacity (eyes/instances)
let bearCeiling = 128;                     // user adjustable limit
const START_BEARS= 6;

const KSUP       = 1.48;    // field support = 1.40 × part radius (short tails keep parts crisp)
const THRESH     = Math.pow(1 - 1/(KSUP*KSUP), 3);  // isolated surface lands exactly at nominal radius
const MIN_R_F     = 0.85;                        // strands never thinner than ~0.85 cell
const MAXDIM     = SURFACE_LATTICE_LIMITS.maxDim; // cells per grid axis (cap)
const MAX_CELLS  = SURFACE_LATTICE_LIMITS.maxCells;
const MAX_V      = 16384;                        // vertices per bear mesh (pooled buffers)
const MAX_IDX    = MAX_V*6;
// one field + cell buffer shared by every bear (they are only needed during a
// build), which is what makes uncapped spawning affordable
const FIELD      = new Float32Array(MAX_CELLS);
const CELLVERT   = new Int32Array(MAX_CELLS);
// coarse occupancy mask (3^3 cells per block) so surface nets can skip empty space
const BS = 3;
const BLOCK_NMAX = Math.ceil(MAXDIM/BS);
const BLOCK = new Uint8Array(BLOCK_NMAX*BLOCK_NMAX*BLOCK_NMAX);
let BNX = 0, BNY = 0, BNZ = 0;
function markBlocks(i0,i1,j0,j1,k0,k1){
  const bx0 = Math.max(0, Math.floor((i0-1)/BS)), bx1 = Math.min(BNX-1, Math.floor((i1+1)/BS));
  const by0 = Math.max(0, Math.floor((j0-1)/BS)), by1 = Math.min(BNY-1, Math.floor((j1+1)/BS));
  const bz0 = Math.max(0, Math.floor((k0-1)/BS)), bz1 = Math.min(BNZ-1, Math.floor((k1+1)/BS));
  for (let bz=bz0; bz<=bz1; bz++){
    const zbase = bz*BNX*BNY;
    for (let by=by0; by<=by1; by++){
      const base = by*BNX + zbase;
      for (let bx=bx0; bx<=bx1; bx++) BLOCK[base+bx] = 1;
    }
  }
}

const FLOOR_REST  = 0.28;        // restitution of the table
const FRICTION_DECEL = 4.6;   // ground friction (units/s²)
const BOUNCE_V    = 2.4;         // impact speed that counts as a "bounce"
const WALL_K      = 62;          // soft wall stiffness (accel per unit)
const WALL_D      = 13;
const GRAB_K      = 600;         // grab spring (soft = visible taffy stretch)
const GRAB_D      = 14;
const GRAB_REACH  = 6.0;
const POSE_RATE   = 18;          // tracked pose follows measured rotation
const VOL_CREEP   = 2.2;         // creep time constant of the volume reference (1/s)
const VOL_GAIN    = 0.65;         // dynamic compression -> lateral bulge
const HOP_MIN     = 2.6, HOP_MAX = 8.0;

const TABLE = { hx: 3.4, hz: 2.9 };
const SHADOW_WORLD = 16;         // world units covered by the shadow canvas
const SHADOW_SIZE  = 640;
const BEAR_HEIGHT  = 1.375;      // rest height of a bear

let wobble = 0.55;               // 0 = firm, 1 = Mr. Fantastic

/* --------------------------- flavour presets ------------------------------ */
import { FLAVORS } from './config.js';
const DEFAULT_FLAVOR = 0;

/* ----------------------------- custom picker ------------------------------ */
const custom = { hue: 322, clarity: 0.18 };
const customMats = new Map();     // key -> material
const CUSTOM_CACHE = 44;

function customKey(){ return Math.round(custom.hue/2)*2 + '|' + Math.round(custom.clarity*8); }
function hsl(h, s, l){ return new THREE.Color().setHSL(h/360, s, l, THREE.SRGBColorSpace); }

function customFlavor(){
  const h = custom.hue, c = custom.clarity;
  const col = hsl(h, 0.88 - 0.34*c, 0.60 + 0.16*c);
  const att = hsl(h, 0.92, 0.40 + 0.22*c);
  const sh  = hsl(h, 0.52, 0.54);
  return {
    id:'custom:'+customKey(), name:'Custom',
    hex: col.getHex(THREE.SRGBColorSpace),
    att: att.getHex(THREE.SRGBColorSpace),
    attDist: 0.42 + 2.9*c,
    shadow: [Math.round(sh.r*255), Math.round(sh.g*255), Math.round(sh.b*255)],
  };
}
function customMaterial(key){
  if (customMats.has(key)) return customMats.get(key);
  const f = customFlavor();
  const m = makeGummyMaterial(f);
  if (customMats.size >= CUSTOM_CACHE) {
    for (const [k, mat] of customMats) { // evict oldest unused
      if (!bears.some(b => b.active && b.material === mat)) { customMats.delete(k); mat.dispose(); break; }
    }
  }
  customMats.set(key, m);
  return m;
}

/* ------------------------------- materials -------------------------------- */
function makeGummyMaterial(f){
  const m = new THREE.MeshPhysicalMaterial({
    color: f.hex,
    transmission: 1.0,
    thickness: 0.55,
    ior: 1.44,
    roughness: 0.055,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.075,
    attenuationColor: f.att,
    attenuationDistance: f.attDist,
    specularIntensity: 1.0,
    envMapIntensity: 1.05,
  });
  if ('dispersion' in m) m.dispersion = 0.018;
  return m;
}
const FLAVOR_MATS = FLAVORS.map(makeGummyMaterial);
const MSN_MAT = makeGummyMaterial(FLAVORS[3]);
MSN_MAT.name = 'MSN gummy';
MSN_MAT.color.set(0x86dd7d);
MSN_MAT.attenuationColor.set(0x4f9e4a);
MSN_MAT.attenuationDistance = 2.1;
const EYE_MAT = new THREE.MeshPhysicalMaterial({
  color:0x17130f, roughness:0.30, metalness:0.0, clearcoat:0.35, clearcoatRoughness:0.22, envMapIntensity:0.6,
  // 0.001 keeps the eyes out of the transmission pass (three.js classifies any
  // transmission > 0 as transmissive), so they cannot show through other bears
  // as floating black dots — while looking visually opaque.
  transmission: 0.001,
});

/* --------------------------- blob shadow sprites --------------------------- */
const spriteCache = new Map();
function blobSprite(f){
  const key = f.id;
  let cv = spriteCache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas'); cv.width=cv.height=128;
  const c = cv.getContext('2d');
  const [r,g,bl] = f.shadow;
  const grd = c.createRadialGradient(64,64,2, 64,64,62);
  grd.addColorStop(0.00, `rgba(${r},${g},${bl},0.26)`);
  grd.addColorStop(0.50, `rgba(${r},${g},${bl},0.16)`);
  grd.addColorStop(0.80, `rgba(${r},${g},${bl},0.05)`);
  grd.addColorStop(1.00, `rgba(${r},${g},${bl},0.00)`);
  c.fillStyle = grd; c.fillRect(0,0,128,128);
  if (spriteCache.size > 64){ // bound the cache; never evict a sprite that is in use
    for (const [k] of spriteCache){
      if (!bears.some(b => b.spriteId === k)){ spriteCache.delete(k); break; }
    }
  }
  spriteCache.set(key, cv);
  return cv;
}
const FLAVOR_SPRITES = FLAVORS.map(blobSprite);

/* ---------------------------- bear geometry def --------------------------- */
import * as RIGCFG from './config.js';
import { initPhysics } from './box3d.js';
const PTS = RIGCFG.PTS;
const NP = RIGCFG.NP;
const MASS = RIGCFG.MASS;
const RSURF = RIGCFG.RSURF;
const RCOLL = RIGCFG.RCOLL;
const REST = RIGCFG.REST;
const REST_H = RIGCFG.REST_H;
const TOTAL_M = RIGCFG.TOTAL_M;
const REST_COM_Y = RIGCFG.REST_COM_Y;
const REST_DY = RIGCFG.REST_DY;
const REST_DX = 0, REST_DZ = 0;
const PARENT = RIGCFG.PARENT;
const PARENT_LEN = RIGCFG.PARENT_LEN;
const CAPS = RIGCFG.CAPS;
const BRACES = RIGCFG.BRACES;
const JOINT_HZ = RIGCFG.JOINT_HZ;
const P_HEAD = RIGCFG.P_HEAD, P_SNOUT = RIGCFG.P_SNOUT, P_EARL = RIGCFG.P_EARL, P_EARR = RIGCFG.P_EARR;
const P_CHEST = RIGCFG.P_CHEST, P_BELLY = RIGCFG.P_BELLY, P_HANDL = RIGCFG.P_HANDL, P_HANDR = RIGCFG.P_HANDR;
const P_FOOTL = RIGCFG.P_FOOTL, P_FOOTR = RIGCFG.P_FOOTR;
function shapeStiffness(){ return 260 - 140*wobble; }
function shapeDamping(){ const k=shapeStiffness(); return 2*(0.36-0.16*wobble)*Math.sqrt(k); }

/* ------------------------------- three.js -------------------------------- */
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:false, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio||1, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = 0.5;

const scene = new THREE.Scene();
// Opt-in diagnostic lane: retain geometry and simulation, bypass appearance shaders.
// This is not evidence for real materials, transparency or asset rendering.
if (new URLSearchParams(location.search).get('testRender') === 'opaque') {
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x8099aa });
}
scene.background = new THREE.Color().setRGB(3.2,3.2,3.2, THREE.LinearSRGBColorSpace);
renderer.setClearColor(0xffffff, 1);

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
const CAM_TARGET = new THREE.Vector3(0.36, 0.62, 0.0);
const CAM_DIR = new THREE.Vector3(0.40, 0.95, 1.30).normalize();
const KEY_DIR = new THREE.Vector3(5.2, 8.0, 4.6).normalize();

// softbox environment (procedural, no assets)
(function buildEnv(){
  const env = new THREE.Scene();
  env.background = new THREE.Color().setRGB(0.46,0.46,0.48, THREE.SRGBColorSpace);
  const panel = (w,h,x,y,z,rx,ry,intensity,color)=>{
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w,h),
      new THREE.MeshBasicMaterial({ color, toneMapped:false }));
    m.material.color.multiplyScalar(intensity);
    m.position.set(x,y,z); m.rotation.set(rx,ry,0); env.add(m); return m;
  };
  panel(11,7,  0.0, 4.6,  0.4, -Math.PI/2,   0,        2.6, new THREE.Color(0xffffff)); // overhead softbox
  panel(6,4.5, -4.4, 1.9,  1.2,  0,          Math.PI/2, 1.9, new THREE.Color(0xfff3e6)); // warm left
  panel(4.5,5,  4.6, 2.3, -0.6,  0,         -Math.PI/2, 1.6, new THREE.Color(0xe9f1ff)); // cool right
  panel(12,5,  0.0, 1.6, -5.2,  0,           0,         1.2, new THREE.Color(0xffffff)); // back
  panel(18,18, 0.0, -0.2, 0.0, -Math.PI/2,   0,         0.9, new THREE.Color(0xffffff)); // floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.05).texture;
  scene.environment = tex;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 1.15;
  pmrem.dispose();
})();

const hemi = new THREE.HemisphereLight(0xffffff, 0xefe9df, 1.35);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e4, 8.5);  key.position.copy(KEY_DIR).multiplyScalar(12);  scene.add(key);
const back = new THREE.DirectionalLight(0xe6efff, 3.2); back.position.set(-6,-0.4,-0.4).multiplyScalar(9); scene.add(back);

/* ------------------------------- the table -------------------------------- */
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = shadowCanvas.height = SHADOW_SIZE;
const sctx = shadowCanvas.getContext('2d');
const baseCanvas = document.createElement('canvas');
baseCanvas.width = baseCanvas.height = SHADOW_SIZE;
(function(){ const c = baseCanvas.getContext('2d'); c.fillStyle='#ffffff'; c.fillRect(0,0,SHADOW_SIZE,SHADOW_SIZE); })();

const floorTex = new THREE.CanvasTexture(shadowCanvas);
floorTex.colorSpace = THREE.SRGBColorSpace;
floorTex.generateMipmaps = false;
floorTex.minFilter = THREE.LinearFilter;
floorTex.magFilter = THREE.LinearFilter;
floorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(SHADOW_WORLD, SHADOW_WORLD),
  // the table is painted, not lit: white base + tinted blobs, so it matches the white
  // backdrop exactly (no horizon seam) while the bears still refract it
  new THREE.MeshBasicMaterial({ map: floorTex, toneMapped: false })
);
floor.rotation.x = -Math.PI/2;
scene.add(floor);

/* ------------------------------- eyes mesh -------------------------------- */
// The eyes and nose ride the *face*: a frame rebuilt every frame from the head,
// snout and ear points, and they are placed on the polygonised isosurface itself
// (marching the bear's own field), so they cannot detach or float no matter how
// violently the bear deforms.
const EYE_PARTS = [
  { p:[-0.129, 0.082, 0.179], sq:[0.028,0.029,0.025], anchor:0, ref:0.250, inset:0.18 },  // eye L
  { p:[ 0.129, 0.082, 0.179], sq:[0.028,0.029,0.025], anchor:0, ref:0.250, inset:0.18 },  // eye R
  { p:[ 0.000,-0.075, 0.348], sq:[0.026,0.023,0.022], anchor:1, ref:0.098, inset:0.02 },  // nose
];
const FACE = (()=>{
  const h  = new THREE.Vector3(PTS[P_HEAD].x,  PTS[P_HEAD].y,  PTS[P_HEAD].z);
  const sn = new THREE.Vector3(PTS[P_SNOUT].x, PTS[P_SNOUT].y, PTS[P_SNOUT].z);
  const e1 = new THREE.Vector3(PTS[P_EARL].x,  PTS[P_EARL].y,  PTS[P_EARL].z);
  const e2 = new THREE.Vector3(PTS[P_EARR].x,  PTS[P_EARR].y,  PTS[P_EARR].z);
  const f  = sn.clone().sub(h).normalize();
  const upHint = e1.clone().add(e2).multiplyScalar(0.5).sub(h).normalize();
  const r  = new THREE.Vector3().crossVectors(upHint, f).normalize();
  const u  = new THREE.Vector3().crossVectors(f, r).normalize();
  const parts = EYE_PARTS.map(pt => {
    const o = new THREE.Vector3(pt.p[0], pt.p[1], pt.p[2]);
    const n = o.length() || 1;
    return {
      cR: o.dot(r), cU: o.dot(u), cF: o.dot(f),   // in face-frame units
      dR: o.dot(r)/n, dU: o.dot(u)/n, dF: o.dot(f)/n,  // unit direction in face frame
      sq: pt.sq, anchor: pt.anchor, ref: pt.ref, inset: pt.inset,
    };
  });
  return { refLen: sn.distanceTo(h), parts };
})();

function buildEyeGeometry(){
  const g = new THREE.SphereGeometry(1, 18, 14);
  return g;
}
const eyes = new THREE.InstancedMesh(buildEyeGeometry(), EYE_MAT, 3*BEAR_HARD_MAX);
eyes.frustumCulled = false;
eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
eyes.layers.enable(3);   // meadow-only bear fill
scene.add(eyes);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v3 = new THREE.Vector3();
const _thoughtPoint = new THREE.Vector3();

/* -------------------------------- the bear -------------------------------- */
class Bear{
  constructor(slot, rigCfg = RIGCFG){
    this.slot = slot;
    this.rig = rigCfg;
    this.species = rigCfg.species || 'bear';
    this.speciesDef = speciesForRig(rigCfg);
    this.np = rigCfg.NP;
    this.active = false;
    this.px=new Float32Array(this.np); this.py=new Float32Array(this.np); this.pz=new Float32Array(this.np);
    this.vx=new Float32Array(this.np); this.vy=new Float32Array(this.np); this.vz=new Float32Array(this.np);
    this.fx=new Float32Array(this.np); this.fy=new Float32Array(this.np); this.fz=new Float32Array(this.np);
    this.tx=new Float32Array(this.np); this.ty=new Float32Array(this.np); this.tz=new Float32Array(this.np);
    this.contact=new Uint8Array(this.np);
    this.cx=this.cy=this.cz=0; this.vcx=this.vcy=this.vcz=0;
    this.q = new THREE.Quaternion();
    this.rMat = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
    this.sy=1; this.sx=1; this.vol=1; this.volSlow=1; this.devSlow=0.05;
    this.grabs=0; this.stretchPt=0; this.stretch=1;
    this.airborne=false; this.contacts=0; this.antic=0; this.hopT=HOP_MIN+Math.random()*(HOP_MAX-HOP_MIN);
    this.flavor=DEFAULT_FLAVOR; this.material=FLAVOR_MATS[DEFAULT_FLAVOR];
    this.sprite=FLAVOR_SPRITES[DEFAULT_FLAVOR]; this.spriteId=FLAVORS[DEFAULT_FLAVOR].id;
    // life-sim foundation (full growth/needs arrive in later phases)
    this.scale=1; this.age=0; this.stage='adult';
    this.sex=(Math.random()<0.5?'F':'M');
    this.health=100; this.hunger=0.3; this.thirst=0.3;
    this.energy=1; this.bold=0.5; this.sleeping=false;
    this.uid=0; this.social=0.3; this.affection=0.25; this.bonds={};
    // Heritable pace range; sampled per bear at spawn and inherited in Phase 5.
    this.hopSpeedMin=0.80; this.hopSpeedMax=1.65;
    this.pregnant=false; this.gestation=0; this.mateCooldown=0; this.birthRetryT=0;
    this.parentUids=[]; this.fatherUid=0; this.pendingStage=null;
    this.bedtime=20; this.wakeTime=5;
    this.name=''; this.home=''; this.inPond=false;
    this.ai=null;
    this.gummyIdleT = 3 + Math.random() * 6;
    this.gummyPose = null;
    this.needsBuild=true;
    this.snap=new Float32Array(this.np*3);
    this.snapC = new THREE.Vector3();
    this.snapR = new Float32Array(9);
    this.meshM = new THREE.Matrix4();
    this.eyeLocal = new Float32Array(48);   // 3 parts x 4x4, in mesh-snapshot space
    this.lat = null;                        // stable field lattice { cell, ox..oz, nx..nz }
    this.deform = 0;                        // max point deviation from the last build's rigid fit
    this.nx=0; this.ny=0; this.nz=0; this.origin=[0,0,0]; this.cell=1;
    this.minx=0;this.miny=0;this.minz=0;this.maxx=0;this.maxy=0;this.maxz=0;
    // mesh buffers
    this.pos = new Float32Array(MAX_V*3);
    this.nrm = new Float32Array(MAX_V*3);
    this.idx = new Uint16Array(MAX_IDX);
    this.vertCount = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal',   new THREE.BufferAttribute(this.nrm,3).setUsage(THREE.DynamicDrawUsage));
    const ib = new THREE.BufferAttribute(this.idx,1); ib.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(ib);
    g.setDrawRange(0,0);
    this.geom = g;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = true;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
}

const pool = [];
function getFreeBear(rigCfg = RIGCFG){
  for (const b of pool) if (!b.active && b.species === (rigCfg.species || 'bear')) return b;
  if (pool.length >= BEAR_HARD_MAX) return null;
  const b = new Bear(pool.length, rigCfg);
  pool.push(b);
  return b;
}
// hide every pooled eye instance until a bear claims its slots
(function hideAllEyeInstances(){
  _m4.makeScale(1e-4, 1e-4, 1e-4);
  for (let i=0;i<3*BEAR_HARD_MAX;i++) eyes.setMatrixAt(i, _m4);
  eyes.instanceMatrix.needsUpdate = true;
})();
const bears = [];
let nextBearUid = 1;
let bounces = 0;
const lifeStats = { births: 0, stageUps: 0, blockedBirths: 0 };

function spawn(x, z, y, flavor, opts={}){
  const explicitSpecies = opts.species !== undefined;
  let requestedDef = null;
  if (explicitSpecies) {
    if (typeof opts.species !== 'string' || !opts.species) {
      throw new Error('spawn: species must be a non-empty registered id');
    }
    requestedDef = getSpecies(opts.species, null);
    if (!requestedDef) throw new Error(`spawn: species "${opts.species}" is not registered`);
  }
  const rigCfg = opts.rig || (requestedDef && requestedDef.rig) || (explicitSpecies ? null : RIGCFG);
  if (!explicitSpecies) {
    const marker = rigCfg && typeof rigCfg === 'object' && rigCfg.species !== undefined
      ? rigCfg.species : 'bear';
    if (typeof marker !== 'string' || !marker) {
      throw new Error('spawn: rig species marker must be a non-empty string');
    }
    requestedDef = getSpecies(marker, null);
    if (!requestedDef) throw new Error(`spawn: species "${marker}" is not registered`);
  }
  requireSpeciesRuntime(requestedDef, rigCfg, { expectedKind: 'softbody', context: 'spawn' });
  if (bears.length >= bearCeiling) removeBear(bears[0], { departure: 'removed' });
  const b = getFreeBear(rigCfg);
  if (!b) return null;
  clearFarewellRuntime(b);
  b.active = true; bears.push(b);
  b.rig = rigCfg;
  b.species = rigCfg.species || 'bear';
  b.speciesDef = speciesForRig(rigCfg);
  b.np = rigCfg.NP;
  b.flavor = flavor;
  b.genome = opts.genome ? normalizeGenome(opts.genome) : defaultGenome(b.species);
  b.phenotype = expressGenome(b.genome);
  applyDnaTraits(b);
  const speciesDef = b.speciesDef;
  const materialGene = b.phenotype.genes.material;
  const useMsnMaterial = materialGene === 'msnGummy' || materialGene === 'glass' || speciesDef.material === 'msn';
  const baseMaterial = useMsnMaterial ? MSN_MAT : FLAVOR_MATS[flavor];
  let material = useMsnMaterial
    ? baseMaterial.clone()
    : (toonEnabled ? (toonMaterialFor(baseMaterial) || baseMaterial) : baseMaterial);
  const dnaColor = b.phenotype.genes.color;
  if (typeof dnaColor === 'string' && dnaColor.startsWith('#')) {
    if (material === baseMaterial) material = material.clone();
    material.color.set(dnaColor);
  }
  if (materialGene === 'glass') {
    material.roughness = .03;
    material.clearcoat = 1;
    material.envMapIntensity = 1.6;
    material.needsUpdate = true;
  }
  b.material = material;
  b.sprite = FLAVOR_SPRITES[useMsnMaterial ? speciesDef.spriteFlavor : flavor];
  b.spriteId = useMsnMaterial ? 'msn' : FLAVORS[flavor].id;
  b.mesh.material = b.material;
  b.mesh.visible = true;
  const stage = opts.stage || 'adult';
  const sc = Number.isFinite(opts.scale)
    ? clamp(opts.scale, 0.42, 1.2)
    : scaleForStage(stage);
  const genomeSize = opts.applyGenomeSize === false ? 1 : b.phenotype.genes.size;
  b.scale = clamp(sc * genomeSize, .35, 1.8);
  b.stage = stage;
  b.pendingStage = null;
  if (opts.quat){
    b.q.copy(opts.quat); b.q.normalize();
  } else {
    b.q.setFromAxisAngle(_v3.set(0,1,0), Math.random()*Math.PI*2);
    if (opts.tilt){ const a=(Math.random()-0.5)*opts.tilt; b.q.multiply(_q.setFromAxisAngle(_v3.set(1,0,0), a)); _q.setFromAxisAngle(_v3.set(0,0,1), (Math.random()-0.5)*opts.tilt); b.q.multiply(_q); b.q.normalize(); }
  }
  const lift = opts.lift !== undefined ? opts.lift : 0.004;
  for (let i=0;i<b.np;i++){
    const xr = rigCfg.REST[i*3] * sc, yr = rigCfg.REST[i*3+1] * sc, zr = rigCfg.REST[i*3+2] * sc;
    _v3.set(xr,yr,zr).applyQuaternion(b.q);
    b.px[i] = x + _v3.x; b.py[i] = y + _v3.y + lift + rigCfg.REST_DY * sc; b.pz[i] = z + _v3.z;
    b.vx[i]=0; b.vy[i]=opts.vy||0; b.vz[i]=0;
    b.snap[i*3]=b.px[i]; b.snap[i*3+1]=b.py[i]; b.snap[i*3+2]=b.pz[i];
  }
  b.vol=1; b.volSlow=1; b.sy=1; b.sx=1; b.contacts=0; b.airborne=false; b.upTilt=0; b.press=0;
  // Refresh the centre of mass immediately: clearance checks and the AI read
  // b.cx/cz, and a recycled bear still carried its previous life's COM.
  bearCOM(b);
  b.antic=0; b.hopT=HOP_MIN+Math.random()*(HOP_MAX-HOP_MIN);
  b.grabs=0; b.stretch=1; b.stretchPt=rigCfg.P_HEAD; b.devSlow=0.05; b.wakeCd=0;
  b.age = Number.isFinite(opts.age) ? Math.max(0, opts.age) : ageForStage(stage);
  b.sex=(Math.random()<0.5?'F':'M');
  b.health=100; b.hunger=0.3; b.thirst=0.3; b.energy=1;
  b.bold=0.25+Math.random()*0.5; b.sleeping=false;
  b.uid = Number.isFinite(opts.uid) ? opts.uid : nextBearUid++;
  if (b.uid >= nextBearUid) nextBearUid = b.uid + 1;
  b.social = 0.28 + Math.random()*0.18;
  b.affection = 0.18 + Math.random()*0.18;
  b.bonds = {};
  b.hopSpeedMin=Number.isFinite(opts.hopSpeedMin) ? opts.hopSpeedMin : 0.70+Math.random()*0.25;
  b.hopSpeedMax=Number.isFinite(opts.hopSpeedMax) ? opts.hopSpeedMax : 1.45+Math.random()*0.35;
  b.pregnant=!!opts.pregnant; b.gestation=Number.isFinite(opts.gestation) ? Math.max(0, opts.gestation) : 0;
  b.mateCooldown=Number.isFinite(opts.mateCooldown) ? Math.max(0, opts.mateCooldown) : 0;
  b.birthRetryT=0;
  b.parentUids=Array.isArray(opts.parentUids) ? opts.parentUids.slice() : [];
  b.fatherUid=Number.isFinite(opts.fatherUid) ? opts.fatherUid : 0;
  delete b.guardianUid;
  delete b.lastGiftDay;
  delete b.carriedFood;
  delete b.partnerUid;
  delete b.rivals;
  b.bedtime=Number.isFinite(opts.bedtime) ? opts.bedtime : 20+Math.random()*2.5;
  b.wakeTime=Number.isFinite(opts.wakeTime) ? opts.wakeTime : 5+Math.random()*2;
  b.name=opts.name || takeBearName(); b.home=opts.home || ''; b.inPond=false;
  b.ai=null;
  b.gummyIdleT = 3 + Math.random() * 6;
  b.gummyPose = null;
  if (opts.sex) b.sex = opts.sex;
  b.lat = null; b.deform = 0;
  b.needsBuild = true;
  createBearBodies(b);
  buildBear(b);
  return b;
}
function clearGuardianReferences(uid){
  if (!Number.isFinite(uid)) return;
  for (const actor of actorView.all()) {
    if (!actor || actor.guardianUid !== uid) continue;
    delete actor.guardianUid;
    if (!actor.ai) continue;
    actor.ai.adoptionRetryAt = 0;
    if (actor.ai.follow && actor.ai.follow.uid === uid) {
      actor.ai.follow = null;
      if (actor.ai.state === 'follow') {
        actor.ai.state = 'wander';
        actor.ai.idleT = .5;
        actor.ai.nextThink = 0;
        actor.ai.path = null;
        actor.ai.moving = false;
        actor.ai.target = null;
        behavior?.api?.stop?.(actor);
      }
    }
  }
}

function clearRelationshipReferences(uid){
  if (!Number.isFinite(uid)) return;
  const clear = actor => {
    if (!actor) return;
    if (Number(actor.partnerUid) === uid) delete actor.partnerUid;
    if (actor.rivals && actor.rivals[String(uid)]) delete actor.rivals[String(uid)];
  };
  for (const actor of actorView.all()) clear(actor);
  for (const id of ['field', 'studio']) {
    const world = worlds[id];
    for (const actor of world.bears || []) clear(actor);
    for (const actor of world.glass || []) clear(actor);
  }
}

function partnerRecord(uid){
  const active = actorView.byUid(uid);
  if (active) return { actor: active, active: true };
  for (const id of ['field', 'studio']) {
    const world = worlds[id];
    const record = [...(world.bears || []), ...(world.glass || [])]
      .find(actor => Number(actor.uid) === Number(uid));
    if (record) return { actor: record, active: false };
  }
  return null;
}

function separatePartnershipFor(actor){
  if (!actor || !behavior || typeof behavior.separatePartnership !== 'function') return false;
  const partnerUid = Number(actor.partnerUid);
  const found = Number.isFinite(partnerUid) ? partnerRecord(partnerUid) : null;
  const ok = behavior.separatePartnership(actor);
  if (ok && found && !found.active) {
    delete found.actor.partnerUid;
    if (sky) {
      pushHistory(found.actor, {
        kind: 'separated', uid: actor.uid,
        day: Math.max(0, Math.floor(sky.day || 0)), hour: sky.hours || 0,
      });
    }
  }
  return ok;
}

function removeBear(b, opts = {}){
  removeSoftActor(b, {
    actors: bears,
    preserveRefs: opts.preserveRefs,
    departure: opts.departure,
    onDeparture: (actor, departure) => departures?.snapshot(actor, departure, opts),
    onDropCarried: actor => dropCarriedFood(actor, activeWorld.mapId),
    onReleasePortions: actor => { if (field && field.portions) field.portions.releaseActor(actor); },
    onDetach: actor => { if (ai) ai.detach(actor); },
    onReleaseFood: actor => { if (field && field.food) field.food.releaseBear(actor); },
    onClearFarewell: actor => clearFarewellRuntime(actor),
    onDestroyBodies: actor => destroyBearBodies(actor),
    onClearReferences: actor => {
      clearGuardianReferences(actor.uid);
      clearRelationshipReferences(actor.uid);
    },
    onEndGrabs: actor => {
      for (const g of Array.from(grabs.values())) if (g.bear === actor) endGrab(g, false);
    },
    onDeactivate: actor => {
      actor.mesh.visible=false;
      writeEyeInstance(actor, true);
    },
  });
}
function despawnAll(){
  cancelFarewellVisuals();
  // Map switches and save loads despawn the live roster but keep the saved
  // records' cross-map references intact. A real removal still clears them.
  while (bears.length) removeBear(bears[0], { preserveRefs: true });
}

function hashUid(text){
  let h = 2166136261 >>> 0;
  for (let i=0;i<text.length;i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function farewellGlowTexture(){
  if (farewellGlowTex) return farewellGlowTex;
  const s = 128;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 1, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(.18, 'rgba(255,255,255,.82)');
  g.addColorStop(.48, 'rgba(190,225,255,.28)');
  g.addColorStop(1, 'rgba(150,190,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  farewellGlowTex = new THREE.CanvasTexture(c);
  farewellGlowTex.colorSpace = THREE.SRGBColorSpace;
  return farewellGlowTex;
}

function farewellRoot(actor){
  return actor && (isGlassActor(actor) ? actor.root : actor.mesh);
}

function cancelFarewellVisuals(){
  for (const [actor, fx] of farewells){
    if (fx.sprite && fx.sprite.parent) fx.sprite.parent.remove(fx.sprite);
    fx.material?.dispose();
    delete actor.farewellLift;
  }
  farewells.clear();
  sky?.clearFarewells();
}

function clearFarewellRuntime(actor){
  if (!actor) return;
  delete actor.fading;
  delete actor.starveT;
  delete actor.starsRetryDay;
  delete actor.starsAgeReprieveUntil;
  delete actor.stay;
  delete actor.farewellLift;
  delete actor.mourning;
}

function cancelFarewellFor(actor){
  if (!actor || !actor.fading || actor.fading.committed) return false;
  behavior?.api?.cancelFarewell?.(actor);
  return true;
}

function removeGlassActor(actor, opts = {}){
  if (!glassColony || !actor) return false;
  const uid = actor.uid;
  return removeGlassActorCore(actor, {
    departure: opts.departure,
    onDeparture: (target, departure) => departures?.snapshot(target, departure, opts),
    onClearFarewell: target => clearFarewellRuntime(target),
    onDropCarried: target => dropCarriedFood(target, activeWorld.mapId),
    onReleasePortions: target => { if (field && field.portions) field.portions.releaseActor(target); },
    onReleaseFood: target => { if (field && field.food) field.food.releaseBear(target); },
    removeFromColony: target => glassColony.removeActor(target),
    onClearReferences: () => {
      clearGuardianReferences(uid);
      clearRelationshipReferences(uid);
    },
  });
}

function makeFarewellFx(actor, reason){
  const root = farewellRoot(actor);
  if (!root) return null;
  const h = hashUid(`${actor.species || 'bear'}|${actor.uid}|${reason || 'stars'}`);
  const hue = (h % 360) / 360;
  const material = new THREE.SpriteMaterial({
    map: farewellGlowTexture(),
    color: new THREE.Color().setHSL(hue, .35, .78),
    transparent: true, opacity: .55, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  });
  const sprite = new THREE.Sprite(material);
  root.updateMatrixWorld(true);
  const local = new THREE.Vector3(actor.cx, (actor.cy || 0) + .45 * (actor.scale || 1), actor.cz);
  root.worldToLocal(local);
  sprite.position.copy(local);
  sprite.scale.setScalar(1.25 * (actor.scale || 1));
  root.add(sprite);
  return {
    sprite, material, baseY: local.y, elapsed: 0, duration: 3,
    phase: 'fading', reason: reason || 'oldAge',
  };
}

function ensureFadingGlow(actor){
  if (!actor || !actor.fading || actor.fading.committed || farewells.has(actor)) return;
  const fx = makeFarewellFx(actor, actor.fading.reason);
  if (fx) farewells.set(actor, fx);
}

function startFarewell(actor, info = {}){
  if (!actor) return false;
  // Commit cleanup happens before this callback returns; the actor can no
  // longer be rescued once `fading.committed` is set by the stars module.
  behavior?.api?.commitFarewell(actor);
  behavior?.api?.mournDeparture?.(actor, { cause: 'stars', reason: info.reason });
  let fx = farewells.get(actor);
  if (!fx) {
    fx = makeFarewellFx(actor, info.reason);
    if (!fx) return false;
    farewells.set(actor, fx);
  }
  fx.phase = 'rise';
  fx.elapsed = 0;
  fx.reason = info.reason || fx.reason;
  fx.material.opacity = .9;
  fx.sprite.scale.setScalar(1.7 * (actor.scale || 1));
  actor.farewellLift = 0;
  sky?.addFarewellStar({ uid: actor.uid, species: actor.species, reason: info.reason });
  return true;
}

function updateFarewells(dt){
  for (const actor of bears) ensureFadingGlow(actor);
  if (glassColony) for (const actor of glassColony.actors) ensureFadingGlow(actor);
  if (!farewells.size) return;
  for (const [actor, fx] of Array.from(farewells)){
    fx.elapsed += dt;
    if (fx.phase === 'fading'){
      fx.material.opacity = .45 + .12 * Math.sin(fx.elapsed * 2.4);
      fx.sprite.position.y = fx.baseY + .04 * Math.sin(fx.elapsed * 1.7);
      if (!actor.fading || actor.fading.committed){
        if (fx.sprite.parent) fx.sprite.parent.remove(fx.sprite);
        fx.material.dispose();
        farewells.delete(actor);
      }
      continue;
    }
    const p = Math.min(1, fx.elapsed / fx.duration);
    fx.sprite.position.y = fx.baseY + p * 1.35 * (actor.scale || 1);
    fx.material.opacity = Math.max(0, (1 - p) * .9);
    fx.sprite.scale.setScalar((1.7 + p * .8) * (actor.scale || 1));
    actor.farewellLift = p * .55;
    if (p < 1) continue;
    if (fx.sprite.parent) fx.sprite.parent.remove(fx.sprite);
    fx.material.dispose();
    delete actor.farewellLift;
    farewells.delete(actor);
    if (isGlassActor(actor)) removeGlassActor(actor, { departure: 'stars', reason: fx.reason });
    else removeBear(actor, { departure: 'stars', reason: fx.reason });
  }
}

function homeResidents(name) {
  return countHomeResidents(actorView.all(), name);
}

function chooseBirthHome(mother) {
  return chooseBirthHomeRule({
    mother,
    homes: field && field.homes,
    residents: actorView.all(),
    capacity: HOME_CAPACITY,
  });
}

// The portable stage transition lives in actorlife.js. This wrapper keeps the
// live Bear/Gummy representation, spark presentation and life/history effects in
// the app so their RNG and callback order stays exactly as before.
function applyBearStage(b, nextStage) {
  return applyStageGrowth(b, nextStage, {
    isLifeActor: (actor) => speciesOf(actor).hasLife,
    represent(actor) {
      destroyBearBodies(actor);
      createBearBodies(actor);
      actor.lat = null;
      actor.contacts = 0;
      actor.airborne = false;
      actor.needsBuild = true;
      if (actor.ai) {
        actor.ai.hopState = null;
        actor.ai.hopWait = 0;
        actor.ai.turnWait = 0;
        actor.ai.stuckT = 0;
        actor.ai.interrupted = false;
        actor.ai.lastX = actor.cx;
        actor.ai.lastZ = actor.cz;
        actor.ai.nextThink = 0;
      }
      buildBear(actor);
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.12 + Math.random() * 0.34;
        spawnSpark(
          actor.cx + Math.cos(a) * r, actor.cy + 0.25 + Math.random() * 0.55, actor.cz + Math.sin(a) * r,
          Math.cos(a) * 0.45, 0.7 + Math.random() * 0.8, Math.sin(a) * 0.45,
          0.92, 0.78, 1.0, 0.035 + Math.random() * 0.03, 0.7 + Math.random() * 0.5, -0.35,
        );
      }
    },
    onStageUp(actor) {
      lifeStats.stageUps++;
      pushHistory(actor, { kind: 'stage', uid: 0, day: sky ? sky.day : 0, hour: sky ? sky.hours : 0 });
    },
  });
}

function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function blendGlassColor(mother, father) {
  const colorOf = (actor) => {
    const candidate = actor?.phenotype?.genes?.color || actor?.genome?.genes?.color;
    if (isHexColor(candidate)) return candidate;
    if (actor && !isGlassActor(actor) && Number.isFinite(actor.flavor) && FLAVORS[actor.flavor]) {
      return '#' + FLAVORS[actor.flavor].hex.toString(16).padStart(6, '0');
    }
    return '#a8e5ff';
  };
  const a = colorOf(mother).slice(1);
  const b = colorOf(father).slice(1);
  const mix = [0, 2, 4].map(i => {
    const va = parseInt(a.slice(i, i + 2), 16);
    const vb = parseInt(b.slice(i, i + 2), 16);
    return clamp(Math.round(va + (vb - va) * (.35 + Math.random() * .3)), 0, 255);
  });
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

function childGenomeFor(mother, father, childSpecies) {
  const genome = combineGenomes(
    mother.genome || defaultGenome(mother.species),
    (father && father.genome) || mother.genome || defaultGenome(mother.species),
    { mutation: .04 },
  );
  genome.species = { [childSpecies.id]: 1 };
  genome.phenotype = childSpecies.genetics?.phenotype || null;
  genome.hybridTarget = null;
  const glassParent = [mother, father].some(parent => parent && (
    parent.species === 'glass' ||
    parent.phenotype?.genes?.material === 'glass' ||
    parent.genome?.genes?.material === 'glass'
  ));
  if (childSpecies.id === 'glass') {
    genome.genes.material = 'glass';
    genome.genes.color = blendGlassColor(mother, father);
  } else if (glassParent) {
    genome.genes.material = 'glass';
  } else {
    genome.genes.material = childSpecies.material === 'msn' ? 'msnGummy' : 'bearGummy';
  }
  return genome;
}

function addSiblingBonds(child) {
  const parents = new Set(child?.parentUids || []);
  if (!parents.size) return;
  for (const other of actorView.active()) {
    if (other === child || !Array.isArray(other.parentUids)) continue;
    if (other.parentUids.some(uid => parents.has(uid))) addFamilyBond(other, child, .35);
  }
}

function addFamilyBond(parent, child, value = .62) {
  if (!parent || !child || parent === child) return;
  if (!parent.bonds || typeof parent.bonds !== 'object') parent.bonds = {};
  if (!child.bonds || typeof child.bonds !== 'object') child.bonds = {};
  parent.bonds[String(child.uid)] = Math.max(value, Number(parent.bonds[String(child.uid)]) || 0);
  child.bonds[String(parent.uid)] = Math.max(value, Number(child.bonds[String(parent.uid)]) || 0);
}

function personalityEnabled() {
  return BEHAVIOR_ENGINE === 'modules' && !!(behavior && behavior.api &&
    behavior.api.features && behavior.api.features.personality);
}

function birthChild(mother, father = null) {
  const plan = planBirth(mother, father, {
    speciesOf,
    fatherByUid: (uid) => actorView.byUid(uid),
    safeFood: () => (field && field.food ? field.food.allRipe({ safe: true }).length : 0),
    softCount: () => bears.length,
    softCapacity: () => bearCeiling,
    chooseHome: chooseBirthHome,
    homeDoor: (home) => (field && field.homes
      ? field.homes.find(item => item.name === home) || null
      : null),
    nearestWalkable: (x, z) => (field && field.nav ? field.nav.nearestWalkable(x, z) : null),
    childGenome: childGenomeFor,
  });
  if (!plan.ok) return false;
  father = plan.father;
  const { childSpecies, isGlass, flavor, pace, home, x, z, genome, sex, parentUids } = plan;
  let baby = null;
  if (isGlass) {
    baby = glassColony ? glassColony.spawnChild({
      x, z, genome, home,
      stage: 'baby', age: 0, sex,
      name: 'Glass ' + takeBearName(),
      parentUids,
      fatherUid: father ? father.uid : 0,
      color: genome.genes.color,
      bedtime: mother.bedtime,
      wakeTime: mother.wakeTime,
    }) : null;
  } else {
    baby = spawn(x, z, 0.004, flavor, {
      rig: childSpecies.rig,
      genome,
      stage: 'baby',
      scale: scaleForStage('baby'),
      age: 0,
      sex,
      name: takeBearName(),
      home,
      parentUids,
      fatherUid: father ? father.uid : 0,
      bedtime: mother.bedtime,
      wakeTime: mother.wakeTime,
      hopSpeedMin: pace.min,
      hopSpeedMax: pace.max,
    });
  }
  if (!baby) return false;
  if (personalityEnabled()) {
    // Inheritance is applied after all existing birth/spawn draws so the
    // feature-off RNG stream stays byte-identical.
    if (ensureTraits(mother)) behavior.api.invalidateActor(mother);
    if (father && ensureTraits(father)) behavior.api.invalidateActor(father);
    baby.traits = blendTraits(mother.traits, father ? father.traits : mother.traits, Math.random);
    if (behavior && behavior.api) behavior.api.invalidateActor(baby);
  }
  if (baby.kind === 'glass') {
    baby.genome = genome;
    baby.phenotype = expressGenome(genome);
  } else {
    baby.needsBuild = true;
  }
  addFamilyBond(mother, baby);
  if (father) addFamilyBond(father, baby);
  addSiblingBonds(baby);
  const birthDay = sky ? sky.day : 0;
  const birthHour = sky ? sky.hours : 0;
  pushHistory(baby, { kind: 'born', uid: mother.uid, day: birthDay, hour: birthHour });
  pushHistory(mother, { kind: 'child', uid: baby.uid, day: birthDay, hour: birthHour });
  if (father) pushHistory(father, { kind: 'child', uid: baby.uid, day: birthDay, hour: birthHour });
  mother.pregnant = false;
  mother.gestation = 0;
  mother.birthRetryT = 0;
  mother.mateCooldown = MATE_COOLDOWN;
  lifeStats.births++;
  if (field && field.emote) {
    field.emote(mother.cx, (mother.cy || 0) + 1.05, mother.cz, 'heart');
    field.emote(baby.cx, (baby.cy || 0) + .8, baby.cz, 'sparkle');
  }
  return true;
}

function tryBirth(mother) {
  if (!mother || !mother.active || !mother.pregnant) return false;
  return birthChild(mother);
}

function stepLife(dt) {
  if (!isMeadow() || !field || frozen) return;
  for (const b of bears) {
    if (!b.active || !speciesOf(b).hasLife) continue;
    if (b.mateCooldown > 0) b.mateCooldown = Math.max(0, b.mateCooldown - dt);
    if (b.birthRetryT > 0) b.birthRetryT = Math.max(0, b.birthRetryT - dt);
    if (b.pendingStage && b.grabs === 0 && !b.airborne && !b.inPond) {
      applyBearStage(b, b.pendingStage);
    }
    const nextStage = advanceAge(b, dt);
    if (nextStage !== b.stage) {
      if (b.grabs === 0 && !b.airborne && !b.inPond) applyBearStage(b, nextStage);
      else b.pendingStage = nextStage;
    }
    if (b.pregnant && advanceGestation(b, dt)) {
      if (b.birthRetryT <= 0) {
        if (!tryBirth(b)) {
          lifeStats.blockedBirths++;
          b.birthRetryT = 3.0;
        }
      }
    }
  }
}

/* ================================ PHYSICS ================================= */
const _up = new THREE.Vector3(), _yawAxis = new THREE.Vector3(0,1,0), _pitchAxis = new THREE.Vector3(1,0,0);
const _rmQ = new THREE.Quaternion(), _qYaw = new THREE.Quaternion(), _qPitch = new THREE.Quaternion();
const A3 = new Float64Array(9), R3 = new Float64Array(9), T3 = new Float64Array(9);

function matMul(out, a, b){
  for (let r=0;r<3;r++) for (let c=0;c<3;c++){
    out[r*3+c] = a[r*3]*b[c] + a[r*3+1]*b[3+c] + a[r*3+2]*b[6+c];
  }
}
function axisAngleMat(out, x,y,z, ang){
  const c=Math.cos(ang), s=Math.sin(ang), t=1-c;
  out[0]=t*x*x+c;   out[1]=t*x*y-s*z; out[2]=t*x*z+s*y;
  out[3]=t*x*y+s*z; out[4]=t*y*y+c;   out[5]=t*y*z-s*x;
  out[6]=t*x*z-s*y; out[7]=t*y*z+s*x; out[8]=t*z*z+c;
}
function extractRotation(A, R){
  // matrix -> quaternion seed
  _rmQ.setFromRotationMatrix(_m4.set(R[0],R[1],R[2],0, R[3],R[4],R[5],0, R[6],R[7],R[8],0));
  for (let it=0; it<12; it++){
    // M = A Rᵀ
    const m00=A[0]*R[0]+A[1]*R[1]+A[2]*R[2], m01=A[0]*R[3]+A[1]*R[4]+A[2]*R[5], m02=A[0]*R[6]+A[1]*R[7]+A[2]*R[8];
    const m10=A[3]*R[0]+A[4]*R[1]+A[5]*R[2], m11=A[3]*R[3]+A[4]*R[4]+A[5]*R[5], m12=A[3]*R[6]+A[4]*R[7]+A[5]*R[8];
    const m20=A[6]*R[0]+A[7]*R[1]+A[8]*R[2], m21=A[6]*R[3]+A[7]*R[4]+A[8]*R[5], m22=A[6]*R[6]+A[7]*R[7]+A[8]*R[8];
    const wx=m21-m12, wy=m02-m20, wz=m10-m01;
    const len=Math.hypot(wx,wy,wz);
    if (len < 1e-7) break;
    axisAngleMat(T3, wx/len, wy/len, wz/len, len);
    matMul(R3, T3, R);
    R.set(R3);
  }
  // orthogonalise
  let ax=R[0],ay=R[3],az=R[6]; let l=Math.hypot(ax,ay,az)||1; ax/=l;ay/=l;az/=l;
  let bx=R[1],by=R[4],bz=R[7]; const d=ax*bx+ay*by+az*bz; bx-=ax*d; by-=ay*d; bz-=az*d; l=Math.hypot(bx,by,bz)||1; bx/=l;by/=l;bz/=l;
  const cx=ay*bz-az*by, cy=az*bx-ax*bz, cz=ax*by-ay*bx;
  R[0]=ax;R[3]=ay;R[6]=az; R[1]=bx;R[4]=by;R[7]=bz; R[2]=cx;R[5]=cy;R[8]=cz;
}

function bearCOM(b){
  const rig = b.rig, n = b.np;
  let mx=0,my=0,mz=0;
  for (let i=0;i<n;i++){ const m=rig.MASS[i]; mx+=m*b.px[i]; my+=m*b.py[i]; mz+=m*b.pz[i]; }
  b.cx=mx/rig.TOTAL_M; b.cy=my/rig.TOTAL_M; b.cz=mz/rig.TOTAL_M;
}
function bearVelocity(b){
  const rig = b.rig, n = b.np;
  let mx=0,my=0,mz=0;
  for (let i=0;i<n;i++){ const m=rig.MASS[i]; mx+=m*b.vx[i]; my+=m*b.vy[i]; mz+=m*b.vz[i]; }
  b.vcx=mx/rig.TOTAL_M; b.vcy=my/rig.TOTAL_M; b.vcz=mz/rig.TOTAL_M;
}

function poseAndTargets(b, dt){
  const rig = b.rig, n = b.np;
  // weighted correspondence matrix  A = Σ m (p-c) ⊗ rest
  let a00=0,a01=0,a02=0,a10=0,a11=0,a12=0,a20=0,a21=0,a22=0;
  for (let i=0;i<n;i++){
    const qx=b.px[i]-b.cx, qy=b.py[i]-b.cy, qz=b.pz[i]-b.cz;
    const x=rig.REST[i*3], y=rig.REST[i*3+1], z=rig.REST[i*3+2], m=rig.MASS[i];
    a00+=m*qx*x; a01+=m*qx*y; a02+=m*qx*z;
    a10+=m*qy*x; a11+=m*qy*y; a12+=m*qy*z;
    a20+=m*qz*x; a21+=m*qz*y; a22+=m*qz*z;
  }
  const det = a00*(a11*a22-a12*a21) - a01*(a10*a22-a12*a20) + a02*(a10*a21-a11*a20);
  if (det < 0){ a00=-a00; a01=-a01; a02=-a02; }
  A3[0]=a00;A3[1]=a01;A3[2]=a02;A3[3]=a10;A3[4]=a11;A3[5]=a12;A3[6]=a20;A3[7]=a21;A3[8]=a22;
  extractRotation(A3, b.rMat);
  // tracked pose eases toward measured rotation, rate-capped so a bear stretched
  // from one point can never spin its own target pose (it used to flip 90° while
  // dangling from the grabbed head)
  _rmQ.setFromRotationMatrix(_m4.set(b.rMat[0],b.rMat[1],b.rMat[2],0, b.rMat[3],b.rMat[4],b.rMat[5],0, b.rMat[6],b.rMat[7],b.rMat[8],0));
  // upright assist biases the target pose; Box3D follows our shape forces, so
  // this actually rights the bear and still yields to pushes via the speed gate.
  if (uprightAssist && (b.grabs > 0 || (b.contacts > 0 && !b.airborne))){
    const speed = Math.hypot(b.vcx, b.vcy, b.vcz);
    if (b.grabs > 0 || speed < 1.35){
      const upY = _up.set(0,1,0).applyQuaternion(_rmQ).y;
      const ex = _v3.set(1,0,0).applyQuaternion(_rmQ);
      const yaw = Math.atan2(-ex.z, ex.x);
      _qYaw.setFromAxisAngle(_yawAxis, yaw);
      _rmQ.slerp(_qYaw, 1 - Math.exp(-(b.grabs > 0 ? 2.2 : 1.0)*dt*(upY > 0.55 ? 1.3 : 1.0)));
    }
  }
  // A travelling AI hop gets a level target pose with a small forward lean.
  // The contact-gated righting below is deliberately off in the air, so without
  // this the measured takeoff/landing pitch would persist through the whole arc
  // and make the bear look hunched over. Only the AI hop owns this pose; tossed
  // and carried bears keep their ballistic orientation.
  const aiHopping = b.ai && b.grabs === 0 && !b.inPond &&
      (b.ai.hopState === 'crouch' || b.ai.hopState === 'air' || b.ai.hopState === 'settle');
  if (aiHopping){
    const yaw = yawOfQuat(b.q);
    _qYaw.setFromAxisAngle(_yawAxis, yaw);
    _qPitch.setFromAxisAngle(_pitchAxis, AI_HOP_LEAN);
    _rmQ.copy(_qYaw).multiply(_qPitch);
  }
  // AI bears face their next hop; while an AI hop is airborne they may still
  // correct heading, but at a slower rate. Grabbed, carried and thrown bears
  // keep the player's/ballistic orientation. This is applied after the tracked
  // pose update below so the visible target cannot be out-voted by the measured
  // body rotation.
  const interacting = b.ai && (b.ai.state === 'eat' || b.ai.state === 'drink');
  const aiFace = b.ai && b.ai.faceYaw !== null && b.ai.faceYaw !== undefined &&
      b.grabs === 0 && (interacting || (!b.airborne && b.contacts > 0) || b.ai.hopState === 'air');
  // upright assist (force version): compute the tilt axis; the torque itself is
  // applied in accumulateForces so Box3D contacts can resist/yield naturally.
  b.upTilt = 0;
  if (uprightAssist && b.grabs === 0 && b.contacts > 0){
    const speed = Math.hypot(b.vcx, b.vcy, b.vcz);
    if (speed < 1.7){
      _up.set(b.rMat[1], b.rMat[4], b.rMat[7]).normalize();
      const upy = clamp(_up.y, -1, 1);
      const tilt = Math.acos(upy);
      if (tilt > 0.02){
        _v3.crossVectors(_up, WORLD_UP);
        const l = _v3.length();
        if (l > 1e-5){
          b.upAx = _v3.x/l; b.upAy = _v3.y/l; b.upAz = _v3.z/l;
          b.upTilt = Math.min(tilt, 1.45);
        }
      }
    }
  }
  const qdot = clamp(Math.abs(b.q.dot(_rmQ)), 0, 1);
  const ang = 2*Math.acos(qdot);
  const rateStep = 1-Math.exp(-POSE_RATE*dt);
  const stepT = ang > 1e-5 ? Math.min(rateStep, 0.04/ang) : 0;
  if (stepT > 0) b.q.slerp(_rmQ, stepT);
  if (aiFace && b.rMat[4] > 0.55) {
    const yaw = Math.atan2(2*(b.q.w*b.q.y + b.q.x*b.q.z), 1 - 2*(b.q.y*b.q.y + b.q.z*b.q.z));
    let delta = b.ai.faceYaw - yaw;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (Math.abs(delta) > 0.012) {
      const rate = b.ai.hopState === 'air' && b.airborne ? AI_FACE_RATE_AIR : AI_FACE_RATE_GROUND;
      _qYaw.setFromAxisAngle(_yawAxis, clamp(delta, -rate*dt, rate*dt));
      b.q.premultiply(_qYaw).normalize();
    }
  }
  // volume preservation: *dynamic* compression bulges sideways (and vice versa).
  // Measured on world up rather than the pose axis, and driven by a fast creeping
  // reference, so a bear resting under its own weight can never feed its own pose
  // (that feedback loop collapsed the bears into pancakes); impacts and pulls still
  // read as jelly, and the resting shape stays exactly the rest pose.
  let h2=0;
  for (let i=0;i<n;i++){
    const dy = b.py[i]-b.cy;
    h2 += rig.MASS[i]*dy*dy/rig.TOTAL_M;
  }
  const ratio = Math.sqrt(h2)/(rig.REST_H * (b.scale || 1));
  b.volSlow += (ratio - b.volSlow)*(1-Math.exp(-VOL_CREEP*dt));
  const comp = clamp((b.volSlow - ratio)*VOL_GAIN*(b.dnaStretchScale || 1), -0.16, 0.16);
  b.sy = 1 - comp;
  b.sx = clamp(1/Math.sqrt(b.sy), 0.90, 1.12);
  // world-space targets:  g = c + q · diag(sx, sy, sx) · rest
  const sx=b.sx, sy=b.sy;
  const qx=b.q.x, qy=b.q.y, qz=b.q.z, qw=b.q.w;
  const bs = b.scale || 1;
  for (let i=0;i<n;i++){
    const lx=rig.REST[i*3]*bs*sx, ly=rig.REST[i*3+1]*bs*sy, lz=rig.REST[i*3+2]*bs*sx;
    // q * v
    const ix =  qw*lx + qy*lz - qz*ly;
    const iy =  qw*ly + qz*lx - qx*lz;
    const iz =  qw*lz + qx*ly - qy*lx;
    const iw = -qx*lx - qy*ly - qz*lz;
    b.tx[i] = b.cx + ix*qw + iw*(-qx) + iy*(-qz) - iz*(-qy);
    b.ty[i] = b.cy + iy*qw + iw*(-qy) + iz*(-qx) - ix*(-qz);
    b.tz[i] = b.cz + iz*qw + iw*(-qz) + ix*(-qy) - iy*(-qx);
  }
  // Eating and drinking are different small target-pose cycles: a nibbling
  // chew with a forward nudge, versus a lower, faster lap with a slight sway.
  // The soft-body solver still owns contacts and jelly motion.
  if (b.ai && (b.ai.state === 'eat' || b.ai.state === 'drink') && b.grabs === 0) {
    const t = b.ai.animT || 0;
    if (b.ai.state === 'eat') {
      const chew = 0.5 - 0.5*Math.cos(t * Math.PI * 4.8);
      const dip = 0.10 + chew * 0.035;
      const push = 0.035 + chew * 0.015;
      b.ty[P_HEAD] -= dip;
      b.ty[P_SNOUT] -= dip * 0.92;
      b.tz[P_HEAD] += push;
      b.tz[P_SNOUT] += push * 1.1;
    } else {
      const lap = 0.5 - 0.5*Math.cos(t * Math.PI * 6.6);
      const dip = 0.16 + lap * 0.025;
      const sway = Math.sin(t * Math.PI * 3.3) * 0.008;
      b.ty[P_HEAD] -= dip;
      b.ty[P_SNOUT] -= dip * 1.02;
      b.tz[P_HEAD] += 0.012;
      b.tz[P_SNOUT] += 0.018;
      b.tx[P_HEAD] += sway;
      b.tx[P_SNOUT] += sway;
    }
  }
  // Social states use small target-pose gestures: a soft nuzzle bounce while
  // hanging out, a polite lean when inviting, a head shake on a decline, and a
  // braced shove during a food contest.
  if (b.ai && b.grabs === 0) {
    const t = b.ai.animT || 0;
    if (b.ai.state === 'social' || b.ai.state === 'visit' || b.ai.state === 'mate') {
      const bob = Math.max(0, Math.sin(t * 5.4));
      const sway = Math.sin(t * 3.0) * .012;
      b.ty[P_HEAD] += .012 + bob * .022;
      b.ty[P_SNOUT] += .008 + bob * .018;
      b.tx[P_HEAD] += sway;
      b.tx[P_SNOUT] += sway * 1.15;
    } else if (b.ai.state === 'invite') {
      b.ty[P_HEAD] -= .018;
      b.tz[P_HEAD] += .045;
      b.tz[P_SNOUT] += .055;
    } else if (b.ai.state === 'conflict') {
      const brace = .5 - .5 * Math.cos(t * 12);
      b.ty[P_HEAD] -= .022 + brace * .012;
      b.tz[P_HEAD] += .035 + brace * .02;
      b.tz[P_SNOUT] += .045 + brace * .02;
    } else if (b.ai.state === 'decline') {
      b.tx[P_HEAD] += Math.sin(t * 24) * .018;
      b.tx[P_SNOUT] += Math.sin(t * 24) * .022;
    }
  }
  // finger-press squash: compress the target shape toward the table and let
  // volume preservation bulge it outward (releasing pops back)
  let pressed = 0;
  for (const g of grabs.values()){
    if (g.bear !== b) continue;
    if (g.target.y < b.cy - 0.12 * (b.scale || 1) && b.py[g.grabIdx] < b.cy) pressed = 1;
  }
  b.press += (pressed - b.press)*(1 - Math.exp(-16*dt));
  if (b.press > 0.002){
    const p = b.press*0.42;
    for (let i=0;i<b.np;i++){
      b.ty[i] = 0.015 + (b.ty[i]-0.015)*(1-p);
      b.tx[i] = b.cx + (b.tx[i]-b.cx)*(1+p*0.35);
      b.tz[i] = b.cz + (b.tz[i]-b.cz)*(1+p*0.35);
    }
  }
  applyGummyPose(b);
}
/* ---------------------------- Gummy Studio tells -------------------------- */
// The Gummy has no skeletal clips. These are soft-body target poses named after
// the authored Glass clips, chosen by a small idle "think" timer.
const GUMMY_ACTIONS = [
  ['Idle', 3.0], ['Nod', 2.0], ['Lean', 1.5], ['Wiggle', 1.5],
  ['Wave', 1.2], ['BigWave', .8], ['Cheer', .8], ['Handshake', 1.0],
  ['Squash', 1.3], ['Hop', .9],
];
const GUMMY_POSE_DUR = {
  Idle: 2.0, Nod: .85, Lean: 1.1, Wiggle: 1.2, Wave: 1.25,
  BigWave: 1.55, Cheer: 1.5, Handshake: 1.15, Squash: .8, Hop: .55,
};
const GUMMY_HEAD = 0, GUMMY_NECK = 1, GUMMY_CHEST = 6, GUMMY_WAIST = 4, GUMMY_BELLY = 5;
const GUMMY_ARM_L = [12, 13, 14, 15];
const GUMMY_ARM_R = [16, 17, 18, 19];

function startGummyPose(b, kind) {
  if (!b || !isGummyActor(b) || !b.active) return false;
  const action = GUMMY_POSE_DUR[kind] ? kind : 'Idle';
  b.gummyPose = { kind: action, t: 0, dur: GUMMY_POSE_DUR[action] };
  if ((action === 'Hop' || action === 'Cheer') && b.grabs === 0 && !b.airborne && b.contacts > 0) {
    hopBear(b, action === 'Cheer' ? 2.4 : 2.0, 0, 0, true);
    b.airborne = true;
    if (b.ai) { b.ai.hopState = 'air'; b.ai.hopWait = 0; }
  }
  return true;
}

function gummyReact(b, kind = null) {
  if (!b || !isGummyActor(b) || !b.active) return false;
  const choices = ['Nod', 'Wave', 'Cheer'];
  const action = kind || choices[(Math.random() * choices.length) | 0];
  const ok = startGummyPose(b, action);
  if (ok && isMeadow() && field && field.emote) {
    field.emote(b.cx, b.cy + 1.05, b.cz, 'heart');
  }
  return ok;
}

function stepGummyBehavior(dt) {
  if (!dt || !Number.isFinite(dt)) return;
  for (const b of bears) {
    if (!b.active || !isGummyActor(b)) continue;
    if (b.sleeping || b.grabs > 0 || b.inPond) continue;
    if (b.ai && b.ai.possessed) continue;
    if (b.gummyPose) {
      b.gummyPose.t += dt;
      if (b.gummyPose.t >= b.gummyPose.dur) b.gummyPose = null;
      continue;
    }
    // Let locomotion, eating, sleeping and social states own the body.
    if (b.ai && !(b.ai.state === 'wander' && !b.ai.moving)) {
      if (b.gummyIdleT < 1.2) b.gummyIdleT = 1.2;
      continue;
    }
    b.gummyIdleT -= dt;
    if (b.gummyIdleT > 0) continue;
    let roll = Math.random() * 100;
    let action = 'Idle';
    for (const [name, weight] of GUMMY_ACTIONS) {
      roll -= weight;
      if (roll <= 0) { action = name; break; }
    }
    startGummyPose(b, action);
    b.gummyIdleT = 6 + Math.random() * 9;
  }
}

function applyGummyPose(b) {
  const p = b.gummyPose;
  if (!p || !isGummyActor(b)) return;
  const tx = b.tx, ty = b.ty, tz = b.tz;
  const k = Math.min(1, p.t / p.dur);
  const env = p.kind === 'Idle' ? 1 : Math.sin(Math.PI * k);
  const add = (i, x, y, z) => {
    if (i === undefined || tx[i] === undefined) return;
    tx[i] += x; ty[i] += y; tz[i] += z;
  };
  const wobble = Math.sin(p.t * 14);
  switch (p.kind) {
    case 'Nod':
      add(GUMMY_HEAD, 0, -.085 * env, .025 * env);
      add(GUMMY_NECK, 0, -.035 * env, .012 * env);
      break;
    case 'Lean':
      add(GUMMY_HEAD, .10 * env, -.015 * env, .02 * env);
      add(GUMMY_CHEST, .055 * env, 0, 0);
      add(GUMMY_WAIST, .02 * env, 0, 0);
      break;
    case 'Wiggle':
      add(GUMMY_HEAD, Math.sin(p.t * 18) * .055 * env, 0, 0);
      add(GUMMY_CHEST, Math.sin(p.t * 18) * .025 * env, 0, 0);
      break;
    case 'Wave':
      for (const [n, i] of GUMMY_ARM_R.entries()) {
        add(i, (.17 - n * .01) * env, (.30 - n * .025) * env + wobble * .035 * env, .02 * env);
      }
      break;
    case 'BigWave':
      for (const [n, i] of GUMMY_ARM_R.entries()) {
        add(i, (.24 - n * .015) * env, (.43 - n * .03) * env + wobble * .045 * env, .03 * env);
      }
      add(GUMMY_HEAD, 0, .025 * env, 0);
      break;
    case 'Cheer':
      for (const i of GUMMY_ARM_L) add(i, -.19 * env, .32 * env, 0);
      for (const i of GUMMY_ARM_R) add(i, .19 * env, .32 * env, 0);
      add(GUMMY_HEAD, 0, .045 * env, 0);
      break;
    case 'Handshake':
      for (const [n, i] of GUMMY_ARM_R.entries()) {
        add(i, (.08 - n * .01) * env, (.12 - n * .015) * env, (.27 + wobble * .035) * env);
      }
      break;
    case 'Squash':
      add(GUMMY_HEAD, 0, -.095 * env, 0);
      add(GUMMY_CHEST, 0, -.045 * env, 0);
      for (const i of GUMMY_ARM_R) add(i, 0, -.03 * env, 0);
      break;
    case 'Hop':
      add(GUMMY_HEAD, 0, Math.sin(p.t * 9) * .012, 0);
      break;
    case 'Idle':
    default:
      add(GUMMY_HEAD, 0, Math.sin(p.t * 2.6) * .007, 0);
      break;
  }
}

function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

// Gentle righting assist: rotate the whole bear (points + velocities) about its COM
// toward upright by a few milliradians per substep. Kinematic, so it always wins
// over friction, but it is skipped whenever the bear is moving — pushes and throws
// stay authoritative; it just slowly stands back up once things settle.
const _qI = new THREE.Quaternion(), _qInc = new THREE.Quaternion();
/* ======================== BOX3D SOFT-BODY COUPLING ======================== */
// Box3D owns contacts/friction/CCD/sleep. Each body has locked rotation; the
// jelly comes from shape matching + volume + damping forces applied every step.
let PHYS = null;
let flatHandles = null, flatOut = null, flatForces = null;
const _physV = new Float32Array(NP*3), _physImp = new Float32Array(NP*3);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function ensurePhysicsBuffers(n){
  if (flatHandles && flatHandles.length >= n) return;
  const cap = Math.max(1024, 1 << Math.ceil(Math.log2(Math.max(1, n))));
  flatHandles = new Int32Array(cap);
  flatOut = new Float32Array(cap * 7);
  flatForces = new Float32Array(cap * 3);
}
function bearGroup(slot){ return -(slot + 1); }

function createBearBodies(b){
  const rig = b.rig, n = b.np;
  ensurePhysicsBuffers((bears.length + 1) * n);
  const g = bearGroup(b.slot);
  const sc = b.scale || 1;
  b.handles = new Int32Array(n);
  for (let i=0;i<n;i++){
    b.handles[i] = PHYS.sphere(b.px[i], b.py[i], b.pz[i], rig.RSURF[i] * sc, rig.MASS[i] * sc * sc * sc, g, 0.82, 0.10, true, true);
  }
  for (let i=0;i<n;i++){
    const p = rig.PARENT[i];
    if (p >= 0) PHYS.joint(b.handles[i], b.handles[p], rig.PARENT_LEN[i] * sc, rig.JOINT_HZ[i], 0.75, false);
  }
  for (const [a, bb, hz, d] of rig.BRACES){
    const len = Math.hypot(rig.REST[a*3]-rig.REST[bb*3], rig.REST[a*3+1]-rig.REST[bb*3+1], rig.REST[a*3+2]-rig.REST[bb*3+2]) * sc;
    PHYS.joint(b.handles[a], b.handles[bb], len, hz, d, false);
  }
  b.awake = true;
}
function destroyBearBodies(b){
  if (!b.handles) return;
  for (let i=0;i<b.np;i++) if (b.handles[i] >= 0) PHYS.destroy(b.handles[i]);
  b.handles = null;
  b.awake = false;
}
function uploadBearVelocities(b){
  if (!b.handles || !PHYS) return;
  for (let i=0;i<b.np;i++){ _physV[i*3]=b.vx[i]; _physV[i*3+1]=b.vy[i]; _physV[i*3+2]=b.vz[i]; }
  PHYS.setVelocities(b.handles, _physV, b.np);
  PHYS.wake(b.handles, b.np);
  b.awake = true;
}
function uploadBearPositions(b, zeroVel){
  if (!b.handles || !PHYS) return;
  for (let i=0;i<b.np;i++){ _physV[i*3]=b.px[i]; _physV[i*3+1]=b.py[i]; _physV[i*3+2]=b.pz[i]; }
  PHYS.setPositions(b.handles, _physV, b.np);
  if (zeroVel){ for (let i=0;i<b.np*3;i++) _physV[i]=0; PHYS.setVelocities(b.handles, _physV, b.np); }
  PHYS.wake(b.handles, b.np);
  b.awake = true;
}
function hopBear(b, power, dirX = 0, dirZ = 0, liftAll = false){
  if (!b.handles || !PHYS) return;
  const n = b.np;
  for (let i=0;i<n;i++){
    _physV[i*3]=b.vx[i] + dirX;
    _physV[i*3+1]=b.vy[i] + (liftAll ? power : 0);
    _physV[i*3+2]=b.vz[i] + dirZ;
  }
  const add = (i,x,y,z)=>{ _physV[i*3]+=x; _physV[i*3+1]+=y; _physV[i*3+2]+=z; };
  if (!liftAll) {
    add(b.rig.P_BELLY, 0, power, 0);
    add(b.rig.P_CHEST, (Math.random()-0.5)*0.5, power*0.75, (Math.random()-0.5)*0.5);
    add(b.rig.P_FOOTL, 0, power, 0);
    add(b.rig.P_FOOTR, 0, power, 0);
  }
  PHYS.setVelocities(b.handles, _physV, n);
  PHYS.wake(b.handles, n);
  b.awake = true;
}

function accumulateForces(b, dt){
  const rig = b.rig, n = b.np;
  const fx=b.fx, fy=b.fy, fz=b.fz;
  fx.fill(0); fy.fill(0); fz.fill(0);
  const ks = shapeStiffness() * (b.dnaRigidityScale || 1);
  const cd = shapeDamping() * (b.dnaDampingScale || 1);
  for (let i=0;i<n;i++){
    const m = rig.MASS[i];
    fx[i] += m*ks*(b.tx[i]-b.px[i]);
    fy[i] += m*ks*(b.ty[i]-b.py[i]);
    fz[i] += m*ks*(b.tz[i]-b.pz[i]);
    fx[i] -= cd*m*(b.vx[i]-b.vcx);
    fy[i] -= cd*m*(b.vy[i]-b.vcy);
    fz[i] -= cd*m*(b.vz[i]-b.vcz);
  }
  // upright torque: tangential forces about the COM (bodies have locked spin)
  if (b.upTilt > 0){
    const k = 55 * b.upTilt;
    const ax=b.upAx, ay=b.upAy, az=b.upAz;
    for (let i=0;i<n;i++){
      const rx=b.px[i]-b.cx, ry=b.py[i]-b.cy, rz=b.pz[i]-b.cz;
      const tx = ay*rz - az*ry, ty = az*rx - ax*rz, tz = ax*ry - ay*rx;
      const m = rig.MASS[i] * k;
      fx[i] += m*tx; fy[i] += m*ty; fz[i] += m*tz;
    }
  }
  // anticipation crouch before an idle or travel hop
  if (b.antic > 0 || (b.ai && b.ai.hopState === 'crouch')){
    for (const i of [rig.P_CHEST,rig.P_BELLY]) fy[i] -= rig.MASS[i]*30;
  }
  // pressing assist: if a grabbed point is driven down near the table, push the
  // torso down too so the whole bear pancakes (volume logic then bulges it out)
  for (const g of grabs.values()){
    if (g.bear !== b) continue;
    if (g.target.y < b.py[g.grabIdx] - 0.16 * (b.scale || 1) && b.py[g.grabIdx] < rig.REST_COM_Y * (b.scale || 1) * 0.9){
      for (const j of [rig.P_CHEST, rig.P_BELLY]) fy[j] -= rig.MASS[j]*24;
    }
  }
  // grab springs, one per active pointer
  for (const g of grabs.values()){
    if (g.bear !== b) continue;
    const i = g.grabIdx, m = rig.MASS[i];
    fx[i] += m*(GRAB_K*(g.target.x-b.px[i]) - GRAB_D*(b.vx[i]-g.vel.x));
    fy[i] += m*(GRAB_K*(g.target.y-b.py[i]) - GRAB_D*(b.vy[i]-g.vel.y));
    fz[i] += m*(GRAB_K*(g.target.z-b.pz[i]) - GRAB_D*(b.vz[i]-g.vel.z));
  }
  // pond buoyancy + paddling (thrown/launched bears)
  if (b.inPond && field){
    const shore = field.pond.nearestShore(b.cx, b.cz);
    let sdx = shore.x - b.cx, sdz = shore.z - b.cz;
    const sl = Math.hypot(sdx, sdz) || 1;
    sdx /= sl; sdz /= sl;
    const targetY = 0.36;
    for (let i=0;i<n;i++){
      const m = rig.MASS[i];
      fy[i] += m*(12 + 30*(targetY - b.cy) - 4.2*b.vy[i]);
      fx[i] += m*(1.05*sdx - 1.8*b.vx[i]);
      fz[i] += m*(1.05*sdz - 1.8*b.vz[i]);
    }
  }
}

function rescuePondBear(b, inside) {
  if (!b || !b.active || !field) return false;
  let dx = 0, dz = 0;
  if (!inside) {
    const p = field.nav && field.nav.nearestWalkable ? field.nav.nearestWalkable(b.cx, b.cz) : null;
    if (p) { dx = p.x - b.cx; dz = p.z - b.cz; }
  }
  const targetY = inside ? 0.36 : 0.34;
  const dy = targetY - b.cy;
  if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) < .001) return false;
  for (let i = 0; i < b.np; i++) {
    b.px[i] += dx; b.py[i] += dy; b.pz[i] += dz;
    b.vx[i] = 0; b.vy[i] = 0; b.vz[i] = 0;
    b.snap[i*3] = b.px[i]; b.snap[i*3+1] = b.py[i]; b.snap[i*3+2] = b.pz[i];
  }
  b.cx += dx; b.cy += dy; b.cz += dz;
  b.inPond = inside;
  b.needsBuild = true;
  uploadBearPositions(b, true);
  return true;
}

function physicsStep(dt){
  if (!PHYS) return;
  let n = 0;
  for (const b of bears){
    if (!b.active || !b.handles) continue;
    for (let i=0;i<b.np;i++) flatHandles[n++] = b.handles[i];
  }
  if (!n) return;
  PHYS.read(flatHandles, flatOut, n);
  let o = 0;
  for (const b of bears){
    if (!b.active || !b.handles) continue;
    let awake = 0;
    for (let i=0;i<b.np;i++){
      const base = (o+i)*7;
      b.px[i]=flatOut[base]; b.py[i]=flatOut[base+1]; b.pz[i]=flatOut[base+2];
      b.vx[i]=flatOut[base+3]; b.vy[i]=flatOut[base+4]; b.vz[i]=flatOut[base+5];
      if (flatOut[base+6] > 0.5) awake = 1;
    }
    o += b.np;
    b.awake = (awake === 1);
    bearCOM(b); bearVelocity(b);
    let contacts = 0, minVy = 0;
    for (let i=0;i<b.np;i++){
      if (b.py[i]-b.rig.RSURF[i]*(b.scale||1) < 0.035){ contacts++; if (b.vy[i] < minVy) minVy = b.vy[i]; }
    }
    if (contacts > 0 && b.airborne && minVy < -BOUNCE_V){ bounces++; pulseBounce(); }
    b.contacts = contacts;
    b.airborne = (contacts === 0);
    if (isMeadow() && field){
      const inside = field.pond.contains(b.cx, b.cz);
      if (!inside) b.inPond = false;
      else if (!b.inPond && b.cy < 0.50){ b.inPond = true; b.wakeCd = .28; field.splash(b.cx, b.cz, 1.0); }
      else if (b.inPond && b.cy > 1.05) b.inPond = false;
      if (b.inPond && b.grabs === 0){
        b.wakeCd = Math.max(0, (b.wakeCd || 0) - dt);
        const swimSpeed = Math.hypot(b.vcx, b.vcz);
        if (swimSpeed > .16 && b.wakeCd <= 0){
          field.splash(b.cx, b.cz, Math.min(.60, .12 + swimSpeed * .20));
          b.wakeCd = .26;
        }
      } else {
        b.wakeCd = 0;
      }
      // The rectangular physics cutout is deliberately larger than the water
      // mesh at its corners. If a bear ends up below the lawn or basin, recover
      // it instead of leaving it wedged under the ground after a swim.
      if (b.grabs === 0 && ((inside && b.cy < 0.10) || (!inside && b.cy < -0.12))) {
        rescuePondBear(b, inside);
      }
    } else if (b.inPond) b.inPond = false;
    if (b.grabs > 0 && !b.awake){ PHYS.wake(b.handles, b.np); b.awake = true; }
    // gentle kinematic righting when settled (yields to pushes via the speed gate)
    if (uprightAssist && b.grabs === 0 && b.contacts > 0 && !b.airborne){
      const spd = Math.hypot(b.vcx, b.vcy, b.vcz);
      if (spd < 1.15){
        _up.set(b.rMat[1], b.rMat[4], b.rMat[7]).normalize();
        const tilt = Math.acos(clamp(_up.y, -1, 1));
        if (tilt > 0.035){
          _v3.crossVectors(_up, WORLD_UP);
          const l = _v3.length();
          if (l > 1e-5){
            const ang = Math.min(tilt, 1.6*dt);
            const ax=_v3.x/l, ay=_v3.y/l, az=_v3.z/l;
            const ca=Math.cos(ang), sa=Math.sin(ang);
            for (let i=0;i<b.np;i++){
              const rx=b.px[i]-b.cx, ry=b.py[i]-b.cy, rz=b.pz[i]-b.cz;
              const dot=ax*rx+ay*ry+az*rz;
              const crx=ay*rz-az*ry, cry=az*rx-ax*rz, crz=ax*ry-ay*rx;
              b.px[i]=b.cx + rx*ca + crx*sa + ax*dot*(1-ca);
              b.py[i]=b.cy + ry*ca + cry*sa + ay*dot*(1-ca);
              b.pz[i]=b.cz + rz*ca + crz*sa + az*dot*(1-ca);
            }
            uploadBearPositions(b, false);
          }
        }
      }
    }
    if (b.awake || b.grabs > 0){ poseAndTargets(b, dt); accumulateForces(b, dt); }
    else { b.fx.fill(0); b.fy.fill(0); b.fz.fill(0); }
  }
  let k = 0;
  for (const b of bears){
    if (!b.active || !b.handles) continue;
    for (let i=0;i<b.np;i++){ flatForces[k*3]=b.fx[i]; flatForces[k*3+1]=b.fy[i]; flatForces[k*3+2]=b.fz[i]; k++; }
  }
  if (msnPrototype) msnPrototype.physicsForces(dt);
  if (glassColony) glassColony.physicsForces();
  PHYS.applyForces(flatHandles, flatForces, false, n);
  PHYS.step(dt, 3);   // Box3D contact sub-solve at 180 Hz
  if (msnPrototype) msnPrototype.physicsRead();
  if (glassColony) glassColony.physicsRead(dt);
}

/* ========================= SURFACE (METABALLS) ============================ */
const CFX = new Int8Array([0,1,0,1,0,1,0,1]);   // corner offsets, flat tables (fast indexing)
const CFY = new Int8Array([0,0,1,1,0,0,1,1]);
const CFZ = new Int8Array([0,0,0,0,1,1,1,1]);
const CE0 = new Int8Array([0,2,4,6,0,1,4,5,0,1,2,3]);
const CE1 = new Int8Array([1,3,5,7,2,3,6,7,4,5,6,7]);
const CVCORNER_V = new Float32Array(8);
const PROF = { on:false, field:0, nets:0, eyes:0, shadow:0, n:0 };

// raw trilinear sample of a field grid (used by the Newton vertex snap)
function samRaw(F, nx, ny, nz, ox, oy, oz, cell, x, y, z){
  const fx = (x-ox)/cell, fy = (y-oy)/cell, fz = (z-oz)/cell;
  if (fx < 0 || fy < 0 || fz < 0 || fx > nx-1.001 || fy > ny-1.001 || fz > nz-1.001) return 0;
  const i0 = fx|0, j0 = fy|0, k0 = fz|0;
  const i1 = i0+1 < nx ? i0+1 : i0, j1 = j0+1 < ny ? j0+1 : j0, k1 = k0+1 < nz ? k0+1 : k0;
  const tx = fx-i0, ty = fy-j0, tz = fz-k0;
  const sZ = nx*ny;
  const a = F[i0+j0*nx+k0*sZ], b_ = F[i1+j0*nx+k0*sZ], c = F[i0+j1*nx+k0*sZ], d = F[i1+j1*nx+k0*sZ];
  const e = F[i0+j0*nx+k1*sZ], f2 = F[i1+j0*nx+k1*sZ], g = F[i0+j1*nx+k1*sZ], h = F[i1+j1*nx+k1*sZ];
  const c00 = a+(b_-a)*tx, c10 = c+(d-c)*tx, c01 = e+(f2-e)*tx, c11 = g+(h-g)*tx;
  const c0 = c00+(c10-c00)*ty, c1 = c01+(c11-c01)*ty;
  return c0+(c1-c0)*tz;
}

// one metaball kernel scattered into the cells its support overlaps
function scatterSphere(F, nx, ny, nz, ox, oy, oz, cell, cx, cy, cz, rSurf){
  const R = rSurf*KSUP, r2 = R*R;
  const strideY = nx, strideZ = nx*ny;
  let i0=Math.floor((cx-R-ox)/cell), i1=Math.ceil((cx+R-ox)/cell);
  let j0=Math.floor((cy-R-oy)/cell), j1=Math.ceil((cy+R-oy)/cell);
  let k0=Math.floor((cz-R-oz)/cell), k1=Math.ceil((cz+R-oz)/cell);
  i0=Math.max(0,i0); j0=Math.max(0,j0); k0=Math.max(0,k0);
  i1=Math.min(nx-1,i1); j1=Math.min(ny-1,j1); k1=Math.min(nz-1,k1);
  markBlocks(i0,i1,j0,j1,k0,k1);
  for (let k=k0;k<=k1;k++){
    const dz = oz + k*cell - cz; const dz2 = dz*dz;
    const kz = k*strideZ;
    for (let j=j0;j<=j1;j++){
      const dy = oy + j*cell - cy; const dyz2 = dz2+dy*dy;
      if (dyz2 >= r2) continue;
      const jy = j*strideY + kz;
      for (let i=i0;i<=i1;i++){
        const dx = ox + i*cell - cx;
        const d2 = dyz2 + dx*dx;
        if (d2 >= r2) continue;
        const q = 1 - d2/r2;
        F[jy+i] += q*q*q;
      }
    }
  }
}
// exact swept-capsule kernel: distance to the segment, so limbs and neck are
// perfectly smooth tubes (a chain of spheres leaves a visible ripple)
function scatterCapsule(F, nx, ny, nz, ox, oy, oz, cell, ax, ay, az, bx, by, bz, rSurf){
  const R = rSurf*KSUP, r2 = R*R;
  const strideY = nx, strideZ = nx*ny;
  const abx = bx-ax, aby = by-ay, abz = bz-az;
  const ab2 = abx*abx+aby*aby+abz*abz || 1e-9;
  const inv = 1/ab2;
  let i0=Math.floor((Math.min(ax,bx)-R-ox)/cell), i1=Math.ceil((Math.max(ax,bx)+R-ox)/cell);
  let j0=Math.floor((Math.min(ay,by)-R-oy)/cell), j1=Math.ceil((Math.max(ay,by)+R-oy)/cell);
  let k0=Math.floor((Math.min(az,bz)-R-oz)/cell), k1=Math.ceil((Math.max(az,bz)+R-oz)/cell);
  i0=Math.max(0,i0); j0=Math.max(0,j0); k0=Math.max(0,k0);
  i1=Math.min(nx-1,i1); j1=Math.min(ny-1,j1); k1=Math.min(nz-1,k1);
  markBlocks(i0,i1,j0,j1,k0,k1);
  for (let k=k0;k<=k1;k++){
    const zz = oz + k*cell;
    const kz = k*strideZ;
    for (let j=j0;j<=j1;j++){
      const yy = oy + j*cell;
      const jy = j*strideY + kz;
      for (let i=i0;i<=i1;i++){
        const apx = ox + i*cell - ax, apy = yy - ay, apz = zz - az;
        let t = (apx*abx + apy*aby + apz*abz)*inv;
        t = t<0?0:(t>1?1:t);
        const dx = apx - abx*t, dy = apy - aby*t, dz = apz - abz*t;
        const d2 = dx*dx + dy*dy + dz*dz;
        if (d2 >= r2) continue;
        const q = 1 - d2/r2;
        F[jy+i] += q*q*q;
      }
    }
  }
}

function crowdGrid(n){ return n > 96 ? 22 : n > 64 ? 28 : n > 40 ? 32 : n > 24 ? 36 : 42; }
function buildBear(b){
  // resolution follows both the quality governor and the crowd size, so a big
  // pour stays interactive instead of stretching the per-frame budget
  const tier = Math.min(quality.grid, crowdGrid(bears.length));

  // ---- grid box + stable lattice ----
  // Numeric bounds/lattice math lives in surfacelattice.js so it can be pinned
  // headlessly. The lattice stays world-aligned with hysteresis, so consecutive
  // builds sample the same points and the surface does not crawl as a bear moves.
  const bounds = surfaceBounds(b.px, b.py, b.pz, b.rig.RSURF, b.np, b.scale || 1);
  if (!bounds) return;
  const { minX: tminx, minY: tminy, minZ: tminz,
          maxX: tmaxx, maxY: tmaxy, maxZ: tmaxz } = bounds;
  const lattice = chooseSurfaceLattice({
    bounds, tier, previous: b.lat, maxDim: MAXDIM, maxCells: MAX_CELLS,
  });
  if (!lattice) return;
  const { cell, ox, oy, oz, nx, ny, nz, total } = lattice;
  const L = b.lat;
  if (!L || L.cell !== cell || L.ox !== ox || L.oy !== oy || L.oz !== oz ||
      L.nx !== nx || L.ny !== ny || L.nz !== nz) {
    b.lat = { cell, ox, oy, oz, nx, ny, nz };
  }
  b.nx=nx; b.ny=ny; b.nz=nz; b.origin[0]=ox; b.origin[1]=oy; b.origin[2]=oz; b.cell=cell;
  b.fieldReady = true;
  BNX = Math.ceil(nx/BS); BNY = Math.ceil(ny/BS); BNZ = Math.ceil(nz/BS);
  BLOCK.fill(0, 0, BNX*BNY*BNZ);

  const F = FIELD;
  F.fill(0, 0, total);
  const minR = MIN_R_F*cell;   // strands never thinner than ~0.85 cell
  const strideZ = nx*ny;
  const tProf0 = PROF.on ? performance.now() : 0;

  // ---- scatter sources ----
  const bs = b.scale || 1;
  for (let p=0;p<b.np;p++) scatterSphere(F, nx, ny, nz, ox, oy, oz, cell, b.px[p], b.py[p], b.pz[p], Math.max(b.rig.RSURF[p] * bs, minR));
  for (let c=0;c<b.rig.CAPS.length;c++){
    const [ia,ib,cr] = b.rig.CAPS[c];
    scatterCapsule(F, nx, ny, nz, ox, oy, oz, cell,
      b.px[ia], b.py[ia], b.pz[ia], b.px[ib], b.py[ib], b.pz[ib], Math.max(cr * bs, minR));
  }

  const tProf1 = PROF.on ? performance.now() : 0;

  // ---- surface nets in one pass ----
  // Vertices are placed at the average of the cell's edge crossings and every quad
  // is emitted from the cell that owns the edge, so nothing is scanned twice and
  // no per-cell allocation happens at all (this is the hot loop of the whole app).
  const vert = CELLVERT;
  vert.fill(-1, 0, total);
  const pos=b.pos, nrm=b.nrm, idx=b.idx;
  let vc=0, ic=0;
  const T = THRESH;
  const NX = nx-1, NY = ny-1, NZ = nz-1;
  const sYZ = strideZ;
  const CVA = CVCORNER_V;
  for (let k=0;k<NZ;k++){
    const bzRow = ((k/BS)|0)*BNX*BNY;
    for (let j=0;j<NY;j++){
      const bRow = bzRow + ((j/BS)|0)*BNX;
      for (let i=0;i<NX;i++){
        if (!BLOCK[((i/BS)|0) + bRow]) continue;   // empty block: no surface here
        const p0 = i + j*nx + k*sYZ;
        const c0 = F[p0], c1 = F[p0+1], c2 = F[p0+nx], c3 = F[p0+nx+1];
        const c4 = F[p0+sYZ], c5 = F[p0+sYZ+1], c6 = F[p0+sYZ+nx], c7 = F[p0+sYZ+nx+1];
        const b0 = c0>=T, b1 = c1>=T, b2 = c2>=T, b3 = c3>=T;
        const b4 = c4>=T, b5 = c5>=T, b6 = c6>=T, b7 = c7>=T;
        if (b0===b1 && b0===b2 && b0===b3 && b0===b4 && b0===b5 && b0===b6 && b0===b7) continue;
        if (vc >= MAX_V-1) break;
        CVA[0]=c0; CVA[1]=c1; CVA[2]=c2; CVA[3]=c3; CVA[4]=c4; CVA[5]=c5; CVA[6]=c6; CVA[7]=c7;
        // ---- vertex: average of crossed edges ----
        let ax=0, ay=0, az=0, cnt=0;
        for (let e=0;e<12;e++){
          const e0 = CE0[e], e1 = CE1[e];
          const f0 = CVA[e0], f1 = CVA[e1];
          if ((f0>=T) === (f1>=T)) continue;
          const t = (T-f0)/(f1-f0);
          const x0 = CFX[e0], y0 = CFY[e0], z0 = CFZ[e0];
          ax += x0 + (CFX[e1]-x0)*t;
          ay += y0 + (CFY[e1]-y0)*t;
          az += z0 + (CFZ[e1]-z0)*t;
          cnt++;
        }
        if (!cnt) continue;
        let lx = ax/cnt, ly = ay/cnt, lz = az/cnt;
        let wx = ox + (i+lx)*cell, wy = oy + (j+ly)*cell, wz = oz + (k+lz)*cell;
        if (quality.snap){
          // one Newton step onto the true isosurface (kills the stair-step look)
          const fv = samRaw(F, nx, ny, nz, ox, oy, oz, cell, wx, wy, wz);
          const h = cell*0.7;
          const gx = samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx+h,wy,wz) - samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx-h,wy,wz);
          const gy = samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx,wy+h,wz) - samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx,wy-h,wz);
          const gz = samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx,wy,wz+h) - samRaw(F,nx,ny,nz,ox,oy,oz,cell, wx,wy,wz-h);
          const gl = Math.hypot(gx,gy,gz);
          if (gl > 1e-9){
            let step = (T-fv)/gl;
            const cap = cell*0.25;
            if (step > cap) step = cap; else if (step < -cap) step = -cap;
            wx += gx/gl*step; wy += gy/gl*step; wz += gz/gl*step;
          }
        }
        pos[vc*3]=wx; pos[vc*3+1]=wy; pos[vc*3+2]=wz;
        // ---- normal from the field gradient (2-cell stencil: soft, crease-free) ----
        const xm = i>1?i-2:i, xp = i<nx-2?i+2:i;
        const ym = j>1?j-2:j, yp = j<ny-2?j+2:j;
        const zm = k>1?k-2:k, zp = k<nz-2?k+2:k;
        const gx = F[xp + j*nx + k*sYZ] - F[xm + j*nx + k*sYZ];
        const gy = F[i + yp*nx + k*sYZ] - F[i + ym*nx + k*sYZ];
        const gz = F[i + j*nx + zp*sYZ] - F[i + j*nx + zm*sYZ];
        const gl2 = Math.hypot(gx,gy,gz);
        if (gl2 < 1e-7){
          // flat/saddle field: use the outward radial direction instead of a
          // constant, so creases never go black
          const rx2 = wx-b.cx, ry2 = wy-b.cy, rz2 = wz-b.cz;
          const rl = Math.hypot(rx2,ry2,rz2)||1;
          nrm[vc*3]=rx2/rl; nrm[vc*3+1]=ry2/rl; nrm[vc*3+2]=rz2/rl;
        } else { nrm[vc*3]=-gx/gl2; nrm[vc*3+1]=-gy/gl2; nrm[vc*3+2]=-gz/gl2; }
        vert[p0] = vc;
        // ---- quads for the three edges owned by this cell (min corner) ----
        if (b0 !== b1 && j>0 && k>0){
          const q0 = vert[p0-nx-sYZ], q1 = vert[p0-sYZ], q3 = vert[p0-nx];
          if (q0>=0 && q1>=0 && q3>=0 && ic+6<=MAX_IDX){
            idx[ic++]=q0; idx[ic++]=q1; idx[ic++]=vc;
            idx[ic++]=q0; idx[ic++]=vc; idx[ic++]=q3;
          }
        }
        if (b0 !== b2 && i>0 && k>0){
          const q0 = vert[p0-1-sYZ], q1 = vert[p0-1], q3 = vert[p0-sYZ];
          if (q0>=0 && q1>=0 && q3>=0 && ic+6<=MAX_IDX){
            idx[ic++]=q0; idx[ic++]=q1; idx[ic++]=vc;
            idx[ic++]=q0; idx[ic++]=vc; idx[ic++]=q3;
          }
        }
        if (b0 !== b4 && i>0 && j>0){
          const q0 = vert[p0-1-nx], q1 = vert[p0-1], q3 = vert[p0-nx];
          if (q0>=0 && q1>=0 && q3>=0 && ic+6<=MAX_IDX){
            idx[ic++]=q0; idx[ic++]=q1; idx[ic++]=vc;
            idx[ic++]=q0; idx[ic++]=vc; idx[ic++]=q3;
          }
        }
        vc++;
      }
    }
  }
  // ---- winding sanity: face outward (normals come from the field gradient) ----
  for (let t=0;t<ic;t+=3){
    const i0=idx[t], i1=idx[t+1], i2=idx[t+2];
    const ax=pos[i1*3]-pos[i0*3], ay=pos[i1*3+1]-pos[i0*3+1], az=pos[i1*3+2]-pos[i0*3+2];
    const bx=pos[i2*3]-pos[i0*3], by=pos[i2*3+1]-pos[i0*3+1], bz=pos[i2*3+2]-pos[i0*3+2];
    const nx_=ay*bz-az*by, ny_=az*bx-ax*bz, nz_=ax*by-ay*bx;
    const area = Math.hypot(nx_,ny_,nz_);
    if (area < 1e-9){ idx[t+1]=i0; idx[t+2]=i0; }   // drop degenerate slivers
    else {
      const mx=(nrm[i0*3]+nrm[i1*3]+nrm[i2*3])/3, my=(nrm[i0*3+1]+nrm[i1*3+1]+nrm[i2*3+1])/3, mz=(nrm[i0*3+2]+nrm[i1*3+2]+nrm[i2*3+2])/3;
      if (nx_*mx+ny_*my+nz_*mz < 0){ idx[t+1]=i2; idx[t+2]=i1; }
    }
  }
  b.vertCount = vc;
  if (PROF.on){
    const tProf2 = performance.now();
    PROF.field += tProf1 - tProf0;
    PROF.nets += tProf2 - tProf1;
    PROF.n++;
  }
  const g = b.geom;
  // upload only the live range: capacity no longer costs per-build bandwidth
  g.attributes.position.clearUpdateRanges();
  g.attributes.normal.clearUpdateRanges();
  g.index.clearUpdateRanges();
  g.attributes.position.addUpdateRange(0, vc*3);
  g.attributes.normal.addUpdateRange(0, vc*3);
  g.index.addUpdateRange(0, ic);
  g.attributes.position.needsUpdate = true;
  g.attributes.normal.needsUpdate = true;
  g.index.needsUpdate = true;
  g.setDrawRange(0, ic);
  if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const bcx=(tminx+tmaxx)/2, bcy=(tminy+tmaxy)/2, bcz=(tminz+tmaxz)/2;
  g.boundingSphere.center.set(bcx,bcy,bcz);
  g.boundingSphere.radius = Math.hypot(tmaxx-tminx,tmaxy-tminy,tmaxz-tminz)/2 + cell*3;
  // remember build state for the motion gate
  for (let i=0;i<b.np;i++){ b.snap[i*3]=b.px[i]; b.snap[i*3+1]=b.py[i]; b.snap[i*3+2]=b.pz[i]; }
  b.needsBuild = false;
  // thickness follows the bear's current bulk
  b.material.thickness = clamp(0.36*b.sy, 0.14, 0.95);
  // remember the frame this mesh was generated in; between builds the mesh is
  // rigidly reprojected from here, so motion stays smooth even when the surface
  // is not regenerated every frame
  b.snapC.set(b.cx, b.cy, b.cz);
  b.snapR.set(b.rMat);
  b.deform = 0;
  b.meshM.identity();
  b.mesh.matrix.identity();
  b.mesh.matrixWorldNeedsUpdate = true;
  // eyes/nose are placed against the field we just built (and the snap it produced);
  // with a shared field buffer this must happen now, before the next bear overwrites it
  writeEyeInstance(b, false);
}

/* ------------------------------- eyes ------------------------------------- */
const _hH = new THREE.Vector3(), _hS = new THREE.Vector3(), _hF = new THREE.Vector3(),
      _hR = new THREE.Vector3(), _hU = new THREE.Vector3(), _hUp = new THREE.Vector3(),
      _eP = new THREE.Vector3(), _eD = new THREE.Vector3();

// trilinear sample of the bear's scattered field (0 outside the grid)
function samBear(b, x, y, z){
  const nx=b.nx, ny=b.ny, nz=b.nz, F=FIELD, cell=b.cell;
  const fx = (x-b.origin[0])/cell, fy = (y-b.origin[1])/cell, fz = (z-b.origin[2])/cell;
  if (fx < 0 || fy < 0 || fz < 0 || fx > nx-1.001 || fy > ny-1.001 || fz > nz-1.001) return 0;
  const i0 = fx|0, j0 = fy|0, k0 = fz|0;
  const i1 = i0+1 < nx ? i0+1 : i0, j1 = j0+1 < ny ? j0+1 : j0, k1 = k0+1 < nz ? k0+1 : k0;
  const tx = fx-i0, ty = fy-j0, tz = fz-k0;
  const sZ = nx*ny;
  const a = F[i0+j0*nx+k0*sZ], bb = F[i1+j0*nx+k0*sZ], c = F[i0+j1*nx+k0*sZ], d = F[i1+j1*nx+k0*sZ];
  const e = F[i0+j0*nx+k1*sZ], f2 = F[i1+j0*nx+k1*sZ], g = F[i0+j1*nx+k1*sZ], h = F[i1+j1*nx+k1*sZ];
  const c00 = a+(bb-a)*tx, c10 = c+(d-c)*tx, c01 = e+(f2-e)*tx, c11 = g+(h-g)*tx;
  const c0 = c00+(c10-c00)*ty, c1 = c01+(c11-c01)*ty;
  return c0+(c1-c0)*tz;
}
// walk outward from an interior anchor until the field drops below the isolevel
function marchSurface(b, ax, ay, az, dx, dy, dz, maxD, fallback){
  if (!b.fieldReady) return fallback;
  const step = Math.max(0.015, b.cell*0.55);
  let prev = 0;
  for (let d=step; d<=maxD; d+=step){
    const v = samBear(b, ax+dx*d, ay+dy*d, az+dz*d);
    if (v < THRESH){
      let lo = d-step, hi = d;
      for (let it=0; it<9; it++){
        const mid = (lo+hi)/2;
        if (samBear(b, ax+dx*mid, ay+dy*mid, az+dz*mid) >= THRESH) lo = mid; else hi = mid;
      }
      return hi;
    }
    prev = v;
  }
  return maxD;
}
function writeEyeInstance(b, vanish){
  if (!speciesOf(b).hasEyes) return;
  const slotBase = b.slot*3;
  if (vanish){
    _m4.makeScale(1e-4, 1e-4, 1e-4);
    for (let k=0;k<3;k++) eyes.setMatrixAt(slotBase+k, _m4);
    eyes.instanceMatrix.needsUpdate = true;
    return;
  }
  // Anchor on the *snapshot* the current mesh was built from (b.snap), not the
  // live physics points. The field the eyes are marched against is that same
  // snapshot, so this keeps eyes and rendered face in one frame of reference —
  // live points would slide the eyes over a not-yet-rebuilt surface (worst when
  // frames are slow and the motion gate holds the mesh back).
  const S = b.snap;
  _hH.set(S[P_HEAD*3],  S[P_HEAD*3+1],  S[P_HEAD*3+2]);
  _hS.set(S[P_SNOUT*3], S[P_SNOUT*3+1], S[P_SNOUT*3+2]);
  _hF.copy(_hS).sub(_hH);
  const faceLen = _hF.length() || 1e-4;
  _hF.multiplyScalar(1/faceLen);
  _hUp.set((S[P_EARL*3]+S[P_EARR*3])*0.5, (S[P_EARL*3+1]+S[P_EARR*3+1])*0.5, (S[P_EARL*3+2]+S[P_EARR*3+2])*0.5).sub(_hH);
  if (_hUp.lengthSq() < 1e-10) _hUp.set(0,1,0);
  _hUp.normalize();
  _hR.crossVectors(_hUp, _hF);
  if (_hR.lengthSq() < 1e-10) _hR.set(1,0,0);
  _hR.normalize();
  _hU.crossVectors(_hF, _hR).normalize();
  const grow = clamp(faceLen/FACE.refLen, 0.62, 1.5);
  for (let k=0;k<3;k++){
    const P3 = FACE.parts[k];
    const ax = P3.anchor ? _hS : _hH;
    _eD.set(_hR.x*P3.dR + _hU.x*P3.dU + _hF.x*P3.dF,
            _hR.y*P3.dR + _hU.y*P3.dU + _hF.y*P3.dF,
            _hR.z*P3.dR + _hU.z*P3.dU + _hF.z*P3.dF);
    const l = _eD.length() || 1; _eD.multiplyScalar(1/l);
    const maxD = P3.ref*(0.2 + 1.9*grow);
    const surfR = marchSurface(b, ax.x, ax.y, ax.z, _eD.x, _eD.y, _eD.z, maxD, P3.ref*grow);
    const out = Math.max(0.012, surfR - P3.inset*(P3.sq[0]+P3.sq[1]+P3.sq[2])/3*grow);
    _eP.copy(ax).addScaledVector(_eD, out);
    const sx = P3.sq[0]*grow, sy = P3.sq[1]*grow, sz = P3.sq[2]*grow;
    _m4.set(
      _hR.x*sx, _hU.x*sy, _hF.x*sz, _eP.x,
      _hR.y*sx, _hU.y*sy, _hF.y*sz, _eP.y,
      _hR.z*sx, _hU.z*sy, _hF.z*sz, _eP.z,
      0, 0, 0, 1
    );
    b.eyeLocal.set(_m4.elements, k*16);
    eyes.setMatrixAt(slotBase+k, _m4);
  }
  eyes.instanceMatrix.needsUpdate = true;
}

/* ------------------------ rigid mesh reprojection ------------------------- */
// The surface mesh is world-space and only rebuilt when the *shape* deviates.
// Every frame in between, the last mesh is rigidly moved by the bear's measured
// rigid motion (COM + best-fit rotation), so translation/rotation/hops are smooth
// at the display rate while polygonisation stays sparse.
const _mDelta = new THREE.Matrix4(), _mSnapInv = new THREE.Matrix4(), _mTr = new THREE.Matrix4(), _mEye = new THREE.Matrix4();
function updateMeshTransforms(){
  for (const b of bears){
    if (!b.active) continue;
    if (b.sleeping || studioActorHidden(b)){
      b.mesh.visible = false;
      writeEyeInstance(b, true);
      continue;
    }
    b.mesh.visible = true;
    _mDelta.set(
      b.rMat[0], b.rMat[3], b.rMat[6], b.cx,
      b.rMat[1], b.rMat[4], b.rMat[7], b.cy,
      b.rMat[2], b.rMat[5], b.rMat[8], b.cz,
      0, 0, 0, 1
    );
    _mSnapInv.set(
      b.snapR[0], b.snapR[1], b.snapR[2], 0,
      b.snapR[3], b.snapR[4], b.snapR[5], 0,
      b.snapR[6], b.snapR[7], b.snapR[8], 0,
      0, 0, 0, 1
    );
    _mTr.makeTranslation(-b.snapC.x, -b.snapC.y, -b.snapC.z);
    b.meshM.copy(_mDelta).multiply(_mSnapInv).multiply(_mTr);
    if (b.farewellLift) b.meshM.elements[13] += b.farewellLift;
    b.mesh.matrix.copy(b.meshM);
    b.mesh.matrixWorldNeedsUpdate = true;
    // deformation residual = how far the live shape has drifted from this mesh
    let maxD2 = 0;
    for (let i=0;i<b.np;i++){
      _v3.set(b.snap[i*3], b.snap[i*3+1], b.snap[i*3+2]).applyMatrix4(b.meshM);
      const dx = b.px[i]-_v3.x, dy = b.py[i]-_v3.y, dz = b.pz[i]-_v3.z;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 > maxD2) maxD2 = d2;
    }
    b.deform = Math.sqrt(maxD2);
    // eyes ride the same rigid correction
    if (speciesOf(b).hasEyes){
      for (let k=0;k<3;k++){
        _mEye.fromArray(b.eyeLocal, k*16);
        _m4.multiplyMatrices(b.meshM, _mEye);
        eyes.setMatrixAt(b.slot*3+k, _m4);
      }
    }
  }
  eyes.instanceMatrix.needsUpdate = true;
}

/* ------------------------------ blob shadows ------------------------------ */
let shadowTick = 0;
let fieldShadowTick = 0;
function drawShadows(){
  if (isMeadow()){
    // Real directional maps cover the meadow on the high tiers; the canvas
    // blobs are only a low-tier fallback and are hidden in that case.
    if (quality.shadowMap > 0) return;
    const tick = fieldShadowTick++;
    if (tick % 2 !== 0) return;
    const p = launcher ? launcher.getPosition() : null;
    if (field) field.drawShadows(bears, p);
    return;
  }
  drawStudioShadows();
}
function drawStudioShadows(force = false){
  shadowTick++;
  const every = fwRings.length ? 1 : Math.max(quality.shadowEvery, bears.length > 64 ? 2 : 1);
  if (!force && shadowTick % every !== 0 && shadowTick !== 1) return;
  const px = SHADOW_SIZE / SHADOW_WORLD;
  const hideLauncher = !isMeadow() && studioCast === 'msn';
  sctx.globalCompositeOperation='source-over';
  sctx.globalAlpha=1;
  sctx.drawImage(baseCanvas,0,0);
  sctx.globalCompositeOperation='multiply';
  for (const b of bears){
    if (!b.active || b.sleeping || studioActorHidden(b)) continue;
    const h = Math.max(0, b.cy - b.rig.REST_COM_Y);
    const scale = 1 + h*0.52;
    const wx = b.cx - KEY_DIR.x*h*0.34;
    const wz = b.cz - KEY_DIR.z*h*0.34;
    const cxpx = (wx + SHADOW_WORLD/2)*px;
    const cypx = (wz + SHADOW_WORLD/2)*px;   // canvas top row = -Z after the plane's flipY
    // soft cast shadow
    let sz = 1.62*scale*px;
    sctx.globalAlpha = 1.05/(1 + h*1.4);
    sctx.drawImage(b.sprite, cxpx-sz/2, cypx-sz*0.41, sz, sz*0.82);
    // tighter contact core keeps the bear anchored to the table
    sz *= 0.62;
    sctx.globalAlpha = 1.15/(1 + h*2.2);
    sctx.drawImage(b.sprite, cxpx-sz/2, cypx-sz*0.41, sz, sz*0.82);
  }
  const ls = hideLauncher ? null : (launcher ? launcher.getShadow() : null);
  if (ls && ls.canvas){
    const lx = (ls.x + SHADOW_WORLD/2)*px;
    const lz = (ls.z + SHADOW_WORLD/2)*px;
    const lsz = 1.0*px;
    sctx.globalAlpha = 0.9;
    sctx.drawImage(ls.canvas, lx - lsz/2, lz - lsz*0.36, lsz, lsz*0.72);
  }
  // shockwave ripples, painted into the table so the bears refract them too
  for (const ring of fwRings){
    const p = clamp(ring.t / ring.dur, 0, 1);
    const ease = 1 - Math.pow(1-p, 3);
    const r = (0.25 + 5.6*ease) * px;
    const cxr = (ring.x + SHADOW_WORLD/2) * px;
    const cyr = (ring.z + SHADOW_WORLD/2) * px;
    sctx.globalCompositeOperation = 'multiply';
    sctx.globalAlpha = 1;
    sctx.strokeStyle = `rgba(${Math.round(ring.col[0]*255)},${Math.round(ring.col[1]*255)},${Math.round(ring.col[2]*255)},${(0.5*Math.pow(1-p,1.7)).toFixed(3)})`;
    sctx.lineWidth = Math.max(2, (0.05 + 0.16*(1-p)) * px);
    sctx.beginPath(); sctx.arc(cxr, cyr, Math.max(1, r), 0, Math.PI*2); sctx.stroke();
    sctx.strokeStyle = `rgba(255,255,255,${(0.5*Math.pow(1-p,2.4)).toFixed(3)})`;
    sctx.lineWidth = Math.max(1, (0.02 + 0.06*(1-p)) * px);
    sctx.beginPath(); sctx.arc(cxr, cyr, Math.max(1, r*0.88), 0, Math.PI*2); sctx.stroke();
  }
  sctx.globalAlpha=1;
  sctx.globalCompositeOperation='source-over';
  floorTex.needsUpdate = true;
}

/* =============================== VIEW / QUALITY ============================ */
const quality = {
  dpr:2, grid:42, shadowEvery:1, shadowMap:2048, transmission:0.5,
  dispersion:true, snap:true, level:0, cap:0, adaptive:true, renderScale:1,
};
const surfaceStats = { built:0, builtMs:0, crowdGrid:42 };
const LOW_POWER_DEVICE = (() => {
  try { return matchMedia('(pointer: coarse)').matches || innerWidth < 720; }
  catch (err) { return innerWidth < 720; }
})();
const DEFAULT_EFFECTS = LOW_POWER_DEVICE ? 'off' : 'soft';
let effectsMode = DEFAULT_EFFECTS;
let effectsDof = false;
let natureState = { ...DEFAULT_NATURE };
let settingsProfile = 'auto';
let graphicsState = readGraphics();
let graphicsPanel = null;
let toonEnabled = false;
try {
  const saved = localStorage.getItem('gummy.effects');
  if (saved === 'off' || saved === 'soft' || saved === 'full') effectsMode = saved;
  effectsDof = localStorage.getItem('gummy.effectsDof') === 'on';

  const savedLevel = +localStorage.getItem('gummy.qualityLevel');
  if (Number.isInteger(savedLevel) && savedLevel >= 0 && savedLevel < 4) {
    quality.level = savedLevel;
  }
  const savedCap = +localStorage.getItem('gummy.qualityCap');
  if (Number.isInteger(savedCap) && savedCap >= 0 && savedCap < 4) {
    quality.cap = savedCap;
  }
  const savedAdaptive = localStorage.getItem('gummy.adaptive');
  if (savedAdaptive !== null) quality.adaptive = savedAdaptive !== '0';
  const savedScaleRaw = localStorage.getItem('gummy.renderScale');
  if (savedScaleRaw !== null) {
    const savedScale = +savedScaleRaw;
    if (Number.isFinite(savedScale)) quality.renderScale = clamp(savedScale, .6, 1);
  }
  const savedProfile = localStorage.getItem('gummy.profile');
  const storedProfileValid = savedProfile === 'custom' || SETTINGS_PROFILE_IDS.includes(savedProfile);
  const hasLegacySettings = !storedProfileValid && (
    localStorage.getItem('gummy.effects') !== null ||
    localStorage.getItem('gummy.effectsDof') !== null ||
    localStorage.getItem('gummy.nature') !== null
  );
  settingsProfile = resolveSettingsProfile({ storedProfile: savedProfile, hasLegacySettings });
  const savedNature = JSON.parse(localStorage.getItem('gummy.nature') || 'null');
  if (savedNature && typeof savedNature === 'object') natureState = normalizeNature(savedNature);
  toonEnabled = localStorage.getItem('gummy.toon') === '1';
} catch (err) {}
function applyRealShadows(){
  const size = graphicsState.shadows < 0 ? quality.shadowMap | 0 : graphicsState.shadows;
  const on = size > 0;
  renderer.shadowMap.enabled = on;
  if (sky && sky.setShadows) sky.setShadows(on, size || 1024);
  const blob = field && field.group ? field.group.getObjectByName('meadowShadow') : null;
  if (blob) blob.visible = !on;
}

const LEVELS = [
  { dpr:2.0,  grid:42, shadowEvery:1, shadowMap:2048, transmission:0.50, dispersion:true,  snap:true  },
  { dpr:1.75, grid:36, shadowEvery:1, shadowMap:1024, transmission:0.50, dispersion:true,  snap:true  },
  { dpr:1.5,  grid:30, shadowEvery:2, shadowMap:0,    transmission:0.42, dispersion:false, snap:false },
  { dpr:1.25, grid:25, shadowEvery:3, shadowMap:0,    transmission:0.36, dispersion:false, snap:false },
];

const PROFILES = createSettingsProfiles({ autoEffects: DEFAULT_EFFECTS });

function saveSettings() {
  try {
    localStorage.setItem('gummy.profile', settingsProfile);
    localStorage.setItem('gummy.qualityLevel', String(quality.level));
    localStorage.setItem('gummy.qualityCap', String(quality.cap));
    localStorage.setItem('gummy.adaptive', quality.adaptive ? '1' : '0');
    localStorage.setItem('gummy.renderScale', String(quality.renderScale));
    localStorage.setItem('gummy.nature', JSON.stringify(natureState));
    localStorage.setItem('gummy.toon', toonEnabled ? '1' : '0');
    localStorage.setItem('gummy.effects', effectsMode);
    localStorage.setItem('gummy.effectsDof', effectsDof ? 'on' : 'off');
    localStorage.setItem('gummy.graphics', JSON.stringify(graphicsState));
  } catch (err) {}
}

function markSettingsCustom() {
  if (settingsProfile === 'custom') return;
  settingsProfile = 'custom';
  syncSettingsUI();
}

function settingsSummary() {
  return {
    profile: settingsProfile,
    quality: quality.level,
    cap: quality.cap,
    adaptive: quality.adaptive,
    renderScale: quality.renderScale,
    effects: effectsMode,
    activeEffects: effects ? effects.active : null,
    dof: effectsDof,
    toon: toonEnabled,
    nature: { ...natureState },
    graphics: { ...graphicsState },
    shadows: sky && sky.shadowState ? sky.shadowState : null,
  };
}

function applyProfile(name) {
  const p = PROFILES[name];
  if (!p) return null;
  settingsProfile = name;
  graphicsState = { ...GRAPHICS_DEFAULTS };
  quality.level = p.tier;
  quality.cap = p.tier;
  quality.adaptive = p.adaptive;
  quality.renderScale = p.renderScale;
  effectsMode = p.effects;
  effectsDof = p.dof;
  natureState = normalizeNature(p.nature);
  if (field) field.setNature(natureState);
  applyQuality();
  applyGraphics();
  applyEffectsUI();
  if (isMeadow()) syncAeroUI(true);
  syncSettingsUI();
  saveSettings();
  return settingsSummary();
}

function applyRenderScale(v) {
  quality.renderScale = clamp(Number(v) || 1, .6, 1);
  setPixelRatioBudget();
  if (effects) effects.resize(innerWidth, innerHeight);
  syncSettingsUI();
  saveSettings();
  return quality.renderScale;
}

// A lightweight material-mode toggle. Custom shader systems (water, sky,
// mist, grass path injection) keep their own programs; standard/physical
// environment materials get a MeshToonMaterial equivalent. Bears and eyes are
// deliberately excluded because transmission is the jelly look.
let toonGradient = null;
const toonCache = new Map();
const toonSwaps = [];

function toonGradientTexture() {
  if (toonGradient) return toonGradient;
  toonGradient = new THREE.DataTexture(new Uint8Array([
    42, 42, 42, 255,
    105, 105, 105, 255,
    180, 180, 180, 255,
    255, 255, 255, 255,
  ]), 4, 1, THREE.RGBAFormat);
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  toonGradient.colorSpace = THREE.NoColorSpace;
  toonGradient.needsUpdate = true;
  return toonGradient;
}

function toonMaterialFor(src) {
  if (!src || src.isShaderMaterial || src.isMeshBasicMaterial || src.isMeshToonMaterial) return null;
  if (!(src.isMeshStandardMaterial || src.isMeshPhysicalMaterial ||
        src.isMeshLambertMaterial || src.isMeshPhongMaterial)) return null;
  if (toonCache.has(src)) return toonCache.get(src);
  const t = new THREE.MeshToonMaterial({
    color: src.color ? src.color.clone() : 0xffffff,
    map: src.map || null,
    gradientMap: toonGradientTexture(),
    vertexColors: !!src.vertexColors,
    transparent: !!src.transparent,
    opacity: src.opacity !== undefined ? src.opacity : 1,
    alphaTest: src.alphaTest || 0,
    side: src.side,
    shadowSide: src.shadowSide,
    emissive: src.emissive ? src.emissive.clone() : 0x000000,
    emissiveIntensity: src.emissiveIntensity !== undefined ? src.emissiveIntensity : 1,
    emissiveMap: src.emissiveMap || null,
    alphaMap: src.alphaMap || null,
    depthWrite: src.depthWrite,
    depthTest: src.depthTest,
    toneMapped: src.toneMapped,
  });
  t.name = `${src.name || src.type} · toon`;
  t.fog = src.fog;
  t.flatShading = !!src.flatShading;
  t.onBeforeCompile = src.onBeforeCompile.bind(src);
  const key = src.customProgramCacheKey ? src.customProgramCacheKey() : src.type;
  t.customProgramCacheKey = () => `toon:${key}`;
  toonCache.set(src, t);
  return t;
}

function applyToonMaterials() {
  if (!scene || toonSwaps.length) return;
  const swap = (object, source) => {
    if (Array.isArray(source)) {
      let changed = false;
      const next = source.map(m => {
        const t = toonMaterialFor(m);
        if (t) changed = true;
        return t || m;
      });
      if (changed) {
        toonSwaps.push({ object, source });
        object.material = next;
      }
    } else {
      const t = toonMaterialFor(source);
      if (t) {
        toonSwaps.push({ object, source });
        object.material = t;
      }
    }
  };
  scene.traverse(object => {
    if (object.isMesh && object.material) swap(object, object.material);
  });
}

function restoreToonMaterials() {
  for (const { object, source } of toonSwaps) object.material = source;
  toonSwaps.length = 0;
  for (const b of bears) {
    if (!b.active || !b.material || !b.material.isMeshToonMaterial) continue;
    b.material = FLAVOR_MATS[b.flavor] || b.material;
    b.mesh.material = b.material;
  }
}

function setToonMode(on, persist = true) {
  const next = !!on;
  if (next === toonEnabled) {
    syncSettingsUI();
    return toonEnabled;
  }
  toonEnabled = next;
  if (toonEnabled) applyToonMaterials();
  else restoreToonMaterials();
  if (persist) saveSettings();
  syncSettingsUI();
  return toonEnabled;
}
function applyQuality(){
  const q = LEVELS[quality.level];
  quality.grid=q.grid; quality.shadowEvery=q.shadowEvery; quality.shadowMap=q.shadowMap;
  quality.transmission=q.transmission; quality.dispersion=q.dispersion; quality.snap=q.snap;
  setPixelRatioBudget();
  if ('transmissionResolutionScale' in renderer) renderer.transmissionResolutionScale = q.transmission;
  applyRealShadows();
  if (effects){
    effects.setQuality(quality.level);
    effects.resize(innerWidth, innerHeight);
    syncEffectsUI();
  }
  for (const m of [...FLAVOR_MATS, ...customMats.values()]){
    if ('dispersion' in m){
      const v = q.dispersion ? 0.018 : 0;
      if (m.dispersion !== v){ m.dispersion = v; m.needsUpdate = true; }  // toggles a shader define
    }
  }
  onResize();
}
// never render more than a fixed pixel budget: ultrawide / retina windows would
// otherwise explode the transmission cost
const MAX_PIXELS = 5.6e6;
function setPixelRatioBudget(){
  const q = LEVELS[quality.level];
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const budget = Math.min(2, Math.max(0.7, Math.sqrt(MAX_PIXELS/(w*h))));
  const scale = clamp(Number(quality.renderScale) || 1, .6, 1);
  const ratio = Math.min(devicePixelRatio || 1, q.dpr, budget) * scale;
  renderer.setPixelRatio(clamp(ratio, .6, 2));
}
function layoutStudioReturnPortal(){
  if (!studioReturnPortal) return;
  const x = -Math.min(2.15, Math.max(1.05, TABLE.hx * .68));
  const z = -TABLE.hz * .52;
  studioReturnPortal.group.position.set(x, 0, z);
  studioReturnPortal.doorPoint.set(x, 1.0, z + .1);
}
function fitView(){
  camera.aspect = innerWidth/Math.max(1,innerHeight);
  camera.updateProjectionMatrix();
  // A long, product-photography lens at a fixed distance keeps the bears a
  // consistent height on screen; the table simply grows sideways with the aspect
  // (6 bears spread across 32:9, a narrow strip on a phone). Because the table is
  // white-on-white, its cropped edges are invisible; only the bears matter.
  const aspect = camera.aspect;
  const map = getActiveMap();
  if (map.kind === 'life') {
    TABLE.hx = map.bounds.hx;
    TABLE.hz = map.bounds.hz;
  } else {
    TABLE.hz = 2.40;
    TABLE.hx = clamp(1.95*aspect, 1.55, 6.50);
    if (!cam.moved) camHomeTarget(cam.goal);
  }
  clampCamGoal();
  fitWallsToTable();
  layoutStudioReturnPortal();
  if (msnPrototype) msnPrototype.layout();
  if (launcher) launcher.layout();
  applyCamera(0);
}
function onResize(){
  const w = innerWidth, h = innerHeight;
  setPixelRatioBudget();
  renderer.setSize(w, h, false);
  if (effects) effects.resize(w, h);
  camera.aspect = w/Math.max(1,h);
  camera.updateProjectionMatrix();
  fitView();
  syncSettingsUI();
}

/* ================================= INPUT ================================== */
/* ----- camera rig ----- */
const CAM_HOME = {
  yaw: Math.atan2(CAM_DIR.x, CAM_DIR.z),
  pitch: Math.asin(clamp(CAM_DIR.y, -1, 1)),
  dist: 8.0,
};
const cam = {
  yaw: CAM_HOME.yaw, pitch: CAM_HOME.pitch, dist: CAM_HOME.dist,
  lookUp: 0,
  target: new THREE.Vector3(0.36, 0.62, 0),
  goal: new THREE.Vector3(0.36, 0.62, 0),
  moved: false,
};
const _camHome = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _dofRay = new THREE.Raycaster();
const _dofNdc = new THREE.Vector2(0, 0);
const _dofScale = new THREE.Vector3();
// A small centre fan picks up a bear that sits just below the exact screen
// centre, while the nearest-hit rule keeps a foreground object from being
// mistaken for the tree/house behind it.
const DOF_FOCUS_OFFSETS = [
  [0, 0], [0, -.16], [0, .16], [-.16, 0], [.16, 0],
  [-.12, -.12], [.12, -.12], [-.12, .12], [.12, .12],
  [0, -.26], [-.12, -.26], [.12, -.26],
];
// DOF is a close-subject portrait effect. It is full strength within 5 m,
// fades to zero at 10 m, and is completely off for the default/far orbit.
const DOF_FOCUS_FULL = 5;
const DOF_FOCUS_OFF = 10;
let dofFocusClock = 0;
let dofFocusDistance = 8;
let dofFocusTarget = 8;
let dofFocusAmount = 0;
let dofFocusHas = false;
let dofFocusHold = 0;
let dofLastHit = 0;

function dofFocusStrengthFor(distance) {
  if (distance <= DOF_FOCUS_FULL) return 1;
  if (distance >= DOF_FOCUS_OFF) return 0;
  return 1 - (distance - DOF_FOCUS_FULL) / (DOF_FOCUS_OFF - DOF_FOCUS_FULL);
}
function cameraHome(){
  const map = getActiveMap();
  const h = cameraHomeFor({
    mapKind: map.kind,
    mapCamera: map.camera,
    camTarget: CAM_TARGET,
    camHome: CAM_HOME,
    aspect: camera.aspect,
  });
  return { ...h, target: new THREE.Vector3(h.target[0], h.target[1], h.target[2]) };
}
function camHomeTarget(out){ return out.copy(cameraHome().target); }
function camZoomLimits(){
  const h = cameraHome();
  return [h.minDist, h.maxDist];
}
function applyCamera(dt){
  if (cam.frozen) return;
  if (dt > 0) cam.target.lerp(cam.goal, 1 - Math.exp(-14*dt));
  else cam.target.copy(cam.goal);
  const p = cameraPositionFor({
    target: cam.target, yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist,
  });
  camera.position.set(p.x, p.y, p.z);
  // Third-person possession keeps the camera above the ground and inside the
  // arena, so orbiting cannot clip through the meadow floor or boundary.
  if (possessedBear){
    camera.position.y = Math.max(camera.position.y, 0.55);
    if (isMeadow()){
      const maxR = (Number.isFinite(FIELD_RADIUS) ? FIELD_RADIUS : 60) - 1.2;
      const r = Math.hypot(camera.position.x, camera.position.z);
      if (r > maxR){
        camera.position.x *= maxR / r;
        camera.position.z *= maxR / r;
      }
    } else {
      camera.position.x = clamp(camera.position.x, -TABLE.hx - .45, TABLE.hx + .45);
      camera.position.z = clamp(camera.position.z, -TABLE.hz - .45, TABLE.hz + .45);
    }
  }
  if (dt > 0 && camShakeT > 0){
    camShakeT = Math.max(0, camShakeT - dt);
    const k = camShakeT / CAM_SHAKE_DUR;
    const amp = 0.17 * k * k;
    camera.position.x += (Math.random()-0.5) * amp;
    camera.position.y += (Math.random()-0.5) * amp;
    camera.position.z += (Math.random()-0.5) * amp;
  }
  if (cam.lookUp > 0.001) {
    _lookTarget.copy(cam.target);
    _lookTarget.y += Math.tan(cam.lookUp) * cam.dist;
    camera.lookAt(_lookTarget);
  } else {
    camera.lookAt(cam.target);
  }
  camera.updateMatrixWorld(true);
}

function dofHitRadius(hit) {
  const obj = hit.object;
  const geo = obj && obj.geometry;
  if (!geo) return .6;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = geo.boundingSphere;
  if (!bs) return .6;
  obj.getWorldScale(_dofScale);
  const scale = Math.max(Math.abs(_dofScale.x), Math.abs(_dofScale.y), Math.abs(_dofScale.z));
  return clamp(bs.radius * scale, .25, 3.0);
}

function updateDofFocus(dt) {
  if (!effects || !effectsDof) return;
  dofFocusClock -= dt;
  if (dofFocusClock <= 0) {
    dofFocusClock = .11;
    const bearRoots = [];
    for (const b of bears) {
      if (b.active && b.mesh && b.mesh.visible) bearRoots.push(b.mesh);
    }
    const envRoots = [];
    if (isMeadow() && field) {
      if (field.aeroHomes && field.aeroHomes.group) envRoots.push(field.aeroHomes.group);
      if (field.studioHouse && field.studioHouse.group) envRoots.push(field.studioHouse.group);
      if (field.trees && field.trees.group) envRoots.push(field.trees.group);
      if (field.bushes && field.bushes.group) envRoots.push(field.bushes.group);
    }

    let best = null;
    if (bearRoots.length) {
      for (const [x, y] of DOF_FOCUS_OFFSETS) {
        _dofNdc.set(x, y);
        _dofRay.setFromCamera(_dofNdc, camera);
        const hits = _dofRay.intersectObjects(bearRoots, true);
        if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
      }
    }
    if (envRoots.length) {
      _dofNdc.set(0, 0);
      _dofRay.setFromCamera(_dofNdc, camera);
      const hits = _dofRay.intersectObjects(envRoots, true);
      if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
    }

    dofLastHit = best ? best.distance : 0;
    if (best && best.distance < DOF_FOCUS_OFF) {
      // Put the focal plane at the back of the viewed object, not on its front
      // surface. The whole object stays sharp and the background starts to
      // soften immediately behind it.
      dofFocusTarget = clamp(best.distance + dofHitRadius(best), .8, 60);
      dofFocusAmount = dofFocusStrengthFor(best.distance);
      dofFocusHold = .20;
      dofFocusHas = true;
    } else {
      dofFocusAmount = Math.max(0, dofFocusAmount - dt * 4);
      dofFocusHold = Math.max(0, dofFocusHold - dt);
      if (dofFocusHold <= 0) dofFocusHas = false;
    }
  }
  if (dofFocusHas) {
    dofFocusDistance += (dofFocusTarget - dofFocusDistance) * Math.min(1, dt * 8);
    effects.setFocus(dofFocusDistance, true, dofFocusAmount);
  } else {
    effects.setFocus(dofFocusDistance, false, 0);
  }
}

function clampCamGoal(){
  if (isMeadow()) {
    const c = fieldClamp(cam.goal.x, cam.goal.z, 2.5);
    cam.goal.x = c.x;
    cam.goal.z = c.z;
    cam.goal.y = clamp(cam.goal.y, 0.35, 4.0);
  } else {
    cam.goal.x = clamp(cam.goal.x, -5.5, 5.5);
    cam.goal.z = clamp(cam.goal.z, -5.5, 5.5);
    cam.goal.y = clamp(cam.goal.y, 0.25, 1.40);
  }
}
let resetViewBtn = null, hintEl = null, hintTimer = 0;
function orbitVertical(dy){
  if (!dy) return;
  // Low orbit transitions into a separate skyward look instead of pushing the
  // camera underground. A positive drag raises overhead orbit; a negative drag
  // at the low limit raises the view toward the sky.
  if (dy < 0) {
    if (cam.pitch <= 0.061) {
      cam.lookUp = clamp(cam.lookUp - dy * 0.0038, 0, .55);
    } else {
      cam.pitch = clamp(cam.pitch + dy * 0.0038, .06, 1.42);
    }
  } else {
    if (cam.lookUp > 0.001) {
      cam.lookUp = clamp(cam.lookUp - dy * 0.0038, 0, .55);
    } else {
      cam.pitch = clamp(cam.pitch + dy * 0.0038, .06, 1.42);
    }
  }
}
function showCamHint(){
  if (!hintEl) return;
  if (innerWidth <= 900 && innerHeight > 560){
    const card = document.getElementById('card');
    hintEl.style.bottom = Math.round(card.getBoundingClientRect().height + 18) + 'px';
  } else if (innerHeight <= 560){
    hintEl.style.bottom = 'auto';
    hintEl.style.top = '62px';
  } else {
    hintEl.style.top = 'auto';
    hintEl.style.bottom = '22px';
  }
  hintEl.classList.add('show');
  hintTimer = 7.5;
}
function markCamMoved(){
  cam.moved = true;
  if (resetViewBtn) resetViewBtn.hidden = false;
  hideCamHint();
}
function resetCamera(){
  const h = cameraHome();
  cam.goal.copy(h.target); cam.target.copy(h.target);
  cam.yaw = h.yaw; cam.pitch = h.pitch; cam.dist = h.dist;
  cam.lookUp = 0;
  cam.moved = false;
  if (resetViewBtn) resetViewBtn.hidden = true;
  applyCamera(0);
}
function captureCamera(){
  return { yaw:cam.yaw, pitch:cam.pitch, dist:cam.dist, lookUp:cam.lookUp,
    target:cam.target.toArray(), goal:cam.goal.toArray(), moved:cam.moved };
}
function applyCameraState(st){
  if (!st) return false;
  cam.yaw = st.yaw; cam.pitch = st.pitch; cam.dist = st.dist;
  cam.lookUp = Number.isFinite(st.lookUp) ? st.lookUp : 0;
  cam.target.fromArray(st.target); cam.goal.fromArray(st.goal);
  cam.moved = !!st.moved;
  if (resetViewBtn) resetViewBtn.hidden = !cam.moved;
  applyCamera(0);
  return true;
}
function hideCamHint(){ if (hintEl) hintEl.classList.remove('show'); }
const keys = new Set();
function updateCameraKeys(dt){
  if (!keys.size) return;
  let f = 0, r = 0, dolly = 0;
  if (keys.has('w') || keys.has('arrowup')) f += 1;
  if (keys.has('s') || keys.has('arrowdown')) f -= 1;
  if (keys.has('a') || keys.has('arrowleft')) r -= 1;
  if (keys.has('d') || keys.has('arrowright')) r += 1;
  if (keys.has('q')) dolly += 1;
  if (keys.has('e')) dolly -= 1;
  if (f || r){
    const speed = cam.dist * 0.9;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx =  Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.goal.x += (fx*f + rx*r) * speed * dt;
    cam.goal.z += (fz*f + rz*r) * speed * dt;
    clampCamGoal();
    markCamMoved();
  }
  if (dolly){
    const [zmin, zmax] = camZoomLimits();
    cam.dist = clamp(cam.dist * Math.exp(dolly * 1.4 * dt), zmin, zmax);
    markCamMoved();
  }
}

/* ----- ray picking ----- */
const _rc = new THREE.Raycaster();
const _portalRay = new THREE.Raycaster();
const _rayOrigin = new THREE.Vector3(), _rayDir = new THREE.Vector3();
function rayFromClient(cx, cy){
  const rect = canvas.getBoundingClientRect();
  _rc.setFromCamera(
    { x: ((cx-rect.left)/rect.width)*2-1, y: -((cy-rect.top)/rect.height)*2+1 },
    camera
  );
  _rayOrigin.copy(_rc.ray.origin);
  _rayDir.copy(_rc.ray.direction);
}
const _directivePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.02);
const _directiveHit = new THREE.Vector3();
function groundPointAt(cx, cy){
  rayFromClient(cx, cy);
  if (!_rc.ray.intersectPlane(_directivePlane, _directiveHit)) return null;
  return { x: _directiveHit.x, z: _directiveHit.z };
}
function pickPortal(cx, cy){
  const target = isMeadow()
    ? (field && field.studioHouse ? field.studioHouse.portal : null)
    : (studioReturnPortal ? studioReturnPortal.hit : null);
  if (!target || !target.visible) return null;
  const rect = canvas.getBoundingClientRect();
  _portalRay.setFromCamera({
    x: ((cx-rect.left)/rect.width)*2-1,
    y: -((cy-rect.top)/rect.height)*2+1,
  }, camera);
  const hits = _portalRay.intersectObject(target, true);
  return hits.length ? hits[0].distance : null;
}

function pickMsn(cx, cy){
  return msnPrototype ? msnPrototype.hitTest(cx, cy) : null;
}

function pickGlass(cx, cy){
  return glassColony && isMeadow() ? glassColony.pick(cx, cy, camera, renderer) : null;
}

function pickMsnUnderPointer(cx, cy){
  const race = pickMsn(cx, cy);
  if (!race) return null;
  rayFromClient(cx, cy);
  const bearHit = pickBear();
  return (!bearHit || race.distance <= bearHit.depth) ? race : null;
}

function pickBear(){
  let bestB=null, bestI=-1, bestT=Infinity;
  for (const b of bears){
    if (studioActorHidden(b)) continue;
    for (let i=0;i<b.np;i++){
      const ox = b.px[i]-_rayOrigin.x, oy = b.py[i]-_rayOrigin.y, oz = b.pz[i]-_rayOrigin.z;
      const tca = ox*_rayDir.x + oy*_rayDir.y + oz*_rayDir.z;
      if (tca < 0) continue;
      const r = b.rig.RCOLL[i]*(b.scale||1)*1.25;
      const d2 = ox*ox+oy*oy+oz*oz - tca*tca;
      if (d2 > r*r) continue;
      const t = tca - Math.sqrt(Math.max(0, r*r-d2));
      if (t < bestT){ bestT=t; bestB=b; bestI=i; }
    }
  }
  return bestB ? {bear:bestB, idx:bestI, depth:Math.max(0.6,bestT)} : null;
}

/* ----- grabs ----- */
const grabs = new Map();       // pointerId or 'dbgN' -> grab
const pointers = new Map();    // pointerId -> gesture state
const cursorEl = document.getElementById('cursor');
let dbgSeq = 0;

function makeGrab(b, i, id, offX, offY, offZ, depth){
  const now = performance.now();
  const g = {
    id, bear:b, grabIdx:i, depth,
    offset:new THREE.Vector3(offX||0, offY||0, offZ||0),
    target:new THREE.Vector3(b.px[i], b.py[i], b.pz[i]),
    vel:new THREE.Vector3(),
    prev:new THREE.Vector3(b.px[i], b.py[i], b.pz[i]),
    prevT:now, lastMove:now,
    dbg:typeof id === 'string' && id.indexOf('dbg') === 0,
  };
  b.grabs++; b.stretchPt = i; b.hopT = Math.max(b.hopT, 2.0);
  if (ai && isMeadow()) ai.onGrab(b);
  grabs.set(id, g);
  return g;
}
function lastDbgGrab(){
  let last = null;
  for (const g of grabs.values()) if (g.dbg) last = g;
  return last;
}
function anyGrab(){ return grabs.size > 0; }
function endGrab(g, throwIt){
  if (!g || grabs.get(g.id) !== g) return;
  grabs.delete(g.id);
  const b = g.bear;
  b.grabs = Math.max(0, b.grabs - 1);
  const pv = g.vel, sp = Math.hypot(pv.x,pv.y,pv.z);
  if (throwIt && sp > 0.7 && b.grabs === 0){
    const k = 0.85;
    for (let i=0;i<b.np;i++){
      b.vx[i] = b.vx[i]*0.25 + pv.x*k;
      b.vy[i] = b.vy[i]*0.25 + (pv.y > 0 ? pv.y*k : pv.y*0.3);
      b.vz[i] = b.vz[i]*0.25 + pv.z*k;
    }
    const i = g.grabIdx;
    b.vx[i] += pv.x*0.28; b.vy[i] += pv.y*0.28; b.vz[i] += pv.z*0.28;
    for (let j=0;j<b.np;j++){
      const v = Math.hypot(b.vx[j],b.vy[j],b.vz[j]);
      if (v > VMAX*0.85){ const s2 = VMAX*0.85/v; b.vx[j]*=s2; b.vy[j]*=s2; b.vz[j]*=s2; }
    }
  }
  if (throwIt && b.grabs === 0){
    // jelly rebound when released on/near the table
    let lowest = 1e9;
    for (let i=0;i<b.np;i++) lowest = Math.min(lowest, b.py[i]);
    if (lowest < 0.30){
      const pop = Math.min(2.9, Math.abs(b.sy - 1)*20);
      if (pop > 0.3){ for (let i=0;i<b.np;i++) b.vy[i] += pop; b.airborne = true; }
    }
  }
  uploadBearVelocities(b);
  if (ai && isMeadow() && b.grabs === 0) ai.onRelease(b);
  cursorEl.classList.toggle('grab', anyGrab());
}
function releaseAllGrabs(){
  for (const g of Array.from(grabs.values())) endGrab(g, false);
  if (glassColony) glassColony.cancelDrag();
  pointers.clear();
  cursorEl.classList.remove('grab');
}
function updateGrabTarget(g, cx, cy){
  const rect = canvas.getBoundingClientRect();
  _rc.setFromCamera({ x: ((cx-rect.left)/rect.width)*2-1, y: -((cy-rect.top)/rect.height)*2+1 }, camera);
  const t = g.depth;
  let tx = _rc.ray.origin.x + _rc.ray.direction.x*t + g.offset.x;
  let ty = _rc.ray.origin.y + _rc.ray.direction.y*t + g.offset.y;
  let tz = _rc.ray.origin.z + _rc.ray.direction.z*t + g.offset.z;
  const b = g.bear;
  const dx = tx-b.cx, dy = ty-b.cy, dz = tz-b.cz;
  const d = Math.hypot(dx,dy,dz);
  if (d > GRAB_REACH){ const k=GRAB_REACH/d; tx=b.cx+dx*k; ty=b.cy+dy*k; tz=b.cz+dz*k; }
  const now = performance.now();
  const dt = Math.max(0.001, (now-g.prevT)/1000);
  const s = 1-Math.exp(-dt*18);
  g.vel.x += (clamp((tx-g.prev.x)/dt,-24,24)-g.vel.x)*s;
  g.vel.y += (clamp((ty-g.prev.y)/dt,-24,24)-g.vel.y)*s;
  g.vel.z += (clamp((tz-g.prev.z)/dt,-24,24)-g.vel.z)*s;
  g.prev.set(tx,ty,tz); g.prevT = now; g.lastMove = now;
  g.target.set(tx,ty,tz);
}
function grabScreen(cx, cy, id){
  rayFromClient(cx, cy);
  const hit = pickBear();
  if (!hit) return null;
  const b = hit.bear, i = hit.idx;
  const ox = b.px[i]-_rayOrigin.x, oy = b.py[i]-_rayOrigin.y, oz = b.pz[i]-_rayOrigin.z;
  const tca = Math.max(0.5, ox*_rayDir.x + oy*_rayDir.y + oz*_rayDir.z);
  const rx = _rayOrigin.x + _rayDir.x*tca, ry = _rayOrigin.y + _rayDir.y*tca, rz = _rayOrigin.z + _rayDir.z*tca;
  const g = makeGrab(b, i, id, b.px[i]-rx, b.py[i]-ry, b.pz[i]-rz, tca);
  cursorEl.classList.add('grab');
  return g;
}

/* ----- gesture routing ----- */
function cameraGestureCount(){
  let n = 0;
  for (const p of pointers.values()) if (p.mode === 'pending' || p.mode === 'orbit' || p.mode === 'pinch') n++;
  return n;
}
function panCameraPx(dx, dy){
  const k = cam.dist * 0.0016;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx =  Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  cam.goal.x += (-rx*dx + fx*dy) * k;
  cam.goal.z += (-rz*dx + fz*dy) * k;
  clampCamGoal();
  markCamMoved();
}
function pinchPointers(){
  const ps = [];
  for (const p of pointers.values()) if (p.mode === 'pinch') ps.push(p);
  return ps.length === 2 ? ps : null;
}
addEventListener('pointerdown', (e)=>{
  if (e.target !== canvas) return;
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  const p = { id:e.pointerId, type:e.pointerType, button:e.button,
              mode:'none', lx:e.clientX, ly:e.clientY, sx:e.clientX, sy:e.clientY, grab:null };
  pointers.set(e.pointerId, p);
  if (directivePick && (e.pointerType !== 'mouse' || e.button === 0)) {
    const pt = groundPointAt(e.clientX, e.clientY);
    directivePick = false;
    p.mode = 'ignore';
    if (pt && selectedBear && ai && isMeadow()) {
      let target = pt;
      if (field && field.nav && !field.nav.isWalkable(target.x, target.z)) {
        const near = field.nav.nearestWalkable(target.x, target.z);
        if (near) target = { x: near.x, z: near.z };
      }
      ai.issueDirective(selectedBear, 'go', target);
    }
    syncDirectivePanel();
    return;
  }
  if (!studioCannonHidden() && launcher && launcher.pointerDown(e)){
    p.mode = 'launcher';
    return;
  }
  // Primary click/tap on the Aero portal switches maps through the existing
  // state-preserving transition. A visible MSN or bear in front of the door
  // must win, otherwise clicking the character can switch maps through it.
  if (e.pointerType !== 'mouse' || e.button === 0){
    const portalDist = pickPortal(e.clientX, e.clientY);
    if (portalDist){
      rayFromClient(e.clientX, e.clientY);
      const raceHit = pickMsn(e.clientX, e.clientY);
      const bearHit = pickBear();
      const glassHit = pickGlass(e.clientX, e.clientY);
      const actorDist = Math.min(
        raceHit ? raceHit.distance : Infinity,
        bearHit ? bearHit.depth : Infinity,
        glassHit ? glassHit.distance : Infinity,
      );
      if (portalDist <= actorDist){
        p.mode = 'ignore';
        requestMapSwitch(isMeadow() ? 'studio' : 'field');
        hideCamHint();
        return;
      }
    }
  }
  // Studio race prototype: the GLB is a separate actor, so give it priority
  // only when its hit proxy is closer than any bear under the same pointer.
  if (e.pointerType !== 'mouse' || e.button === 0){
    const raceHit = pickMsnUnderPointer(e.clientX, e.clientY);
    if (raceHit){
      p.mode = 'msn';
      p.moved = false;
      msnPrototype.select(true);
      msnPrototype.beginDrag(e.clientX, e.clientY, e.shiftKey);
      hideCamHint();
      return;
    }
  }
  if (msnPrototype) msnPrototype.select(false);

  // Meadow Glass is rigid, so a primary click selects and frames it instead of
  // starting a soft-body grab.
  if ((e.pointerType !== 'mouse' || e.button === 0) && isMeadow()) {
    const glassHit = pickGlass(e.clientX, e.clientY);
    if (glassHit) {
      selectBear(glassHit.actor);
      if (glassHit.actor.grabbing) {
        p.mode = 'ignore';
        return;
      }
      if (clickMode === 'grab' && glassColony &&
          glassColony.beginDrag(glassHit.actor, e.clientX, e.clientY, camera, renderer)) {
        p.mode = 'glassGrab';
        p.glass = glassHit.actor;
        p.moved = false;
        if (hintEl) {
          hintEl.textContent = `${glassHit.actor.name || 'Glass'} — drag to move the hovering Glass`;
          showCamHint();
        }
        return;
      }
      p.mode = 'orbit';
      if (hintEl) {
        hintEl.textContent = `${glassHit.actor.name || 'Glass'} selected — Switch to Grab click to drag it`;
        showCamHint();
      }
      return;
    }
  }

  // Select-click mode: pick the bear under the pointer without grabbing it, so
  // left-click can select while a drag still orbits. Grab mode is unchanged.
  if ((e.pointerType !== 'mouse' || e.button === 0) && clickMode === 'select'){
    rayFromClient(e.clientX, e.clientY);
    const hit = pickBear();
    if (hit){
      selectBear(hit.bear);
      if (isGummyActor(hit.bear)) gummyReact(hit.bear);
      p.mode = 'orbit';
      if (hintEl){
        hintEl.textContent = `${hit.bear.name || 'Bear'} selected — choose a command or Control`;
        showCamHint();
      }
      return;
    }
  }
  // only the primary button pulls bears; right/middle always drive the camera
  if (e.pointerType !== 'mouse' || e.button === 0){
    const g = grabScreen(e.clientX, e.clientY, e.pointerId);
    if (g){ p.mode = 'grab'; p.grab = g; return; }
  }
  if (e.pointerType === 'mouse'){
    p.mode = (e.button === 1) ? 'pan' : 'orbit';
    hideCamHint();
    return;
  }
  if (anyGrab()){ p.mode = 'ignore'; return; }          // never move the camera mid-pull
  if (cameraGestureCount() >= 1){
    for (const q of pointers.values()) if (q.mode === 'pending' || q.mode === 'orbit') q.mode = 'pinch';
    p.mode = 'pinch';
  } else p.mode = 'pending';
  hideCamHint();
}, {passive:true});
addEventListener('pointermove', (e)=>{
  lastPX = e.clientX; lastPY = e.clientY; lastPValid = true;
  cursorEl.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
  if (e.pointerType !== 'touch'){
    const overUI = !!(e.target && e.target.closest && e.target.closest('#card, header, footer'));
    cursorEl.classList.toggle('on', !overUI || anyGrab());
  } else cursorEl.classList.remove('on');
  const p = pointers.get(e.pointerId);
  if (!p){
    if (!studioCannonHidden() && launcher) launcher.pointerHover(e);
    const overMsn = e.target === canvas && !!pickMsnUnderPointer(e.clientX, e.clientY);
    if (msnPrototype) msnPrototype.setHovered(overMsn);
    cursorEl.classList.toggle('move', overMsn);
    return;
  }
  const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
  if (p.mode === 'launcher'){
    if (launcher) launcher.pointerMove(e);
    p.lx = e.clientX; p.ly = e.clientY;
    return;
  }
  if (p.mode === 'msn'){
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) p.moved = true;
    if (msnPrototype) msnPrototype.drag(e.clientX, e.clientY, dx, dy, e.shiftKey);
    p.lx = e.clientX; p.ly = e.clientY;
    return;
  }
  if (p.mode === 'glassGrab'){
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 4) p.moved = true;
    if (glassColony && p.glass) glassColony.drag(p.glass, e.clientX, e.clientY, camera, renderer, e.shiftKey);
  } else if (p.mode === 'grab'){
    if (p.grab) updateGrabTarget(p.grab, e.clientX, e.clientY);
  } else if (p.mode === 'pending'){
    if (Math.hypot(e.clientX-p.sx, e.clientY-p.sy) > 5){
      p.mode = 'orbit';
      cam.yaw -= dx * 0.0052;
      orbitVertical(dy);
      markCamMoved();
    }
  } else if (p.mode === 'orbit'){
    cam.yaw -= dx * 0.0052;
    orbitVertical(dy);
    markCamMoved();
  } else if (p.mode === 'pan'){
    panCameraPx(dx, dy);
  } else if (p.mode === 'pinch'){
    const ps = pinchPointers();
    if (ps){
      const A = ps[0], B = ps[1];
      const other = (p === A) ? B : A;
      const prevMidX = (p.lx + other.lx)/2, prevMidY = (p.ly + other.ly)/2;
      const prevD = Math.hypot(p.lx - other.lx, p.ly - other.ly) || 1;
      const newMidX = (e.clientX + other.lx)/2, newMidY = (e.clientY + other.ly)/2;
      const newD = Math.hypot(e.clientX - other.lx, e.clientY - other.ly) || 1;
      const [zmin, zmax] = camZoomLimits();
      cam.dist = clamp(cam.dist * (prevD/newD), zmin, zmax);
      panCameraPx(newMidX - prevMidX, newMidY - prevMidY);
    }
  }
  p.lx = e.clientX; p.ly = e.clientY;
}, {passive:true});
function pointerUp(e){
  const p = pointers.get(e.pointerId);
  if (p){
    if (p.mode === 'launcher'){
      if (launcher) launcher.pointerUp(e);
    } else if (p.mode === 'msn'){
      if (msnPrototype){
        if (p.moved) msnPrototype.endDrag();
        else if (e.type === 'pointerup'){
          msnPrototype.endDrag();
          msnPrototype.activate();
          if (hintEl){
            hintEl.textContent = 'MSN Buddy — drag to grab or turn · double-click to frame';
            showCamHint();
          }
        }
      }
    } else if (p.mode === 'glassGrab' && p.glass){
      if (glassColony) glassColony.endDrag(p.glass);
      if (e.type === 'pointerup' && !p.moved) selectBear(p.glass);
    } else if (p.mode === 'grab' && p.grab){
      const clicked = e.type === 'pointerup' && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 4;
      if (clicked && isGummyActor(p.grab.bear)){
        endGrab(p.grab, false);
        gummyReact(p.grab.bear);
      } else {
        endGrab(p.grab, true);
      }
    } else if (p.mode === 'pinch'){
      for (const q of pointers.values()) if (q !== p && q.mode === 'pinch') q.mode = 'orbit';
    }
    pointers.delete(e.pointerId);
  }
  if (!anyGrab()) cursorEl.classList.remove('grab');
}
addEventListener('pointerup', pointerUp, {passive:true});
addEventListener('pointercancel', pointerUp, {passive:true});
canvas.addEventListener('dblclick', (e)=>{
  if (pickMsnUnderPointer(e.clientX, e.clientY)) focusMsn();
});
addEventListener('blur', ()=>{ releaseAllGrabs(); keys.clear(); });
canvas.addEventListener('contextmenu', (e)=>e.preventDefault());
canvas.addEventListener('wheel', (e)=>{
  e.preventDefault();
  const [zmin, zmax] = camZoomLimits();
  cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0011), zmin, zmax);
  markCamMoved();
}, {passive:false});
addEventListener('keydown', (e)=>{
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (helpOpen) return;
  if (menuOpen || paused) return;
  const k = e.key.toLowerCase();
  if (k === 'v'){ if (!e.repeat) togglePossession(); return; }
  if (k === 'c'){ if (!e.repeat) toggleClickMode(); return; }
  if (possessedBear && k === ' '){ if (!e.repeat) possessionJump(); e.preventDefault(); return; }
  if (k === 'u'){ if (!e.repeat) toggleUi(); return; }
  if (k === 'g'){ if (!e.repeat && aiDebug && isMeadow()) aiDebug.toggle(); return; }
  if (k === 'f'){
    if (!e.repeat){
      fwHeld = true;
      if (e.shiftKey){
        launchFirework(true, -0.55, 0.28); launchFirework(true, 0.55, -0.28); launchFirework(true, 0, 0);
        fwPressCd = 0.2;
      } else if (fwPressCd <= 0){
        launchFirework(true, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2);
        fwPressCd = 0.12;
      }
      fwAutoT = 0.24;
    }
    return;
  }
  if (k === 'l'){ if (!e.repeat && launcher && !studioCannonHidden()) launcher.toggleAiming(); return; }
  if (k === 'n'){ if (field && field.navDebug) field.navDebug.visible = !field.navDebug.visible; return; }
  if (k === 'r'){ resetCamera(); return; }
  if (k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'q' || k === 'e' ||
      k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright'){
    keys.add(k);
    if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright') e.preventDefault();
    markCamMoved();
  }
});
addEventListener('keyup', (e)=>{
  const k = e.key.toLowerCase();
  keys.delete(k);
  if (k === 'f') fwHeld = false;
});
document.addEventListener('mouseleave', ()=>{ cursorEl.classList.remove('on'); });

/* ================================== UI ==================================== */
const elStretch = document.getElementById('vStretch');
const elBounces = document.getElementById('vBounces');
const elBears = document.getElementById('vBears');
const swatchWrap = document.getElementById('swatches');
for (let i=0;i<FLAVORS.length;i++){
  const f = FLAVORS[i];
  const b = document.createElement('button');
  b.className='swatch'; b.title = f.name + ' — drop a bear';
  b.setAttribute('aria-label', 'Drop a ' + f.name + ' bear');
  b.style.background = `radial-gradient(120% 120% at 32% 24%, ${hslHexLight(f.hex)} 0%, #${f.hex.toString(16).padStart(6,'0')} 46%, ${hslHexDark(f.hex)} 100%)`;
  b.addEventListener('click', ()=>dropFromAbove(i));
  swatchWrap.appendChild(b);
}
function hslHexLight(hex){ const c=new THREE.Color(hex); c.lerp(new THREE.Color(0xffffff), 0.55); return '#'+c.getHexString(); }
function hslHexDark(hex){ const c=new THREE.Color(hex); c.lerp(new THREE.Color(0x2a2018), 0.28); return '#'+c.getHexString(); }

const hueEl = document.getElementById('hue');
const hueKnob = document.getElementById('hueKnob');
const customDrop = document.getElementById('customDrop');
const clarityEl = document.getElementById('clarity');
function refreshCustomUI(){
  hueKnob.style.left = (custom.hue/360*100) + '%';
  const f = customFlavor();
  customDrop.style.background = `radial-gradient(120% 120% at 32% 24%, ${hslHexLight(f.hex)} 0%, #${f.hex.toString(16).padStart(6,'0')} 48%, ${hslHexDark(f.hex)} 100%)`;
}
let draggingHue=false;
function hueFromEvent(e){
  const r = hueEl.getBoundingClientRect();
  custom.hue = clamp((e.clientX-r.left)/r.width, 0, 1)*360;
  refreshCustomUI();
}
hueEl.addEventListener('pointerdown', e=>{ draggingHue=true; hueEl.setPointerCapture(e.pointerId); hueFromEvent(e); });
hueEl.addEventListener('pointermove', e=>{ if (draggingHue) hueFromEvent(e); });
hueEl.addEventListener('pointerup', ()=>{ draggingHue=false; });
hueEl.addEventListener('pointercancel', ()=>{ draggingHue=false; });
clarityEl.addEventListener('input', ()=>{ custom.clarity = clarityEl.value/100; refreshCustomUI(); });
customDrop.addEventListener('click', ()=>{ dropCustom(); });
refreshCustomUI();

const wobbleEl = document.getElementById('wobble');
wobbleEl.addEventListener('input', ()=>{ wobble = wobbleEl.value/100; });
document.getElementById('pour').addEventListener('click', ()=>pourBears());
function resetBears(){
  releaseAllGrabs();
  despawnAll();
  dropQueue.length = 0;
  bounces = 0;
  bouncePulse = 0;
  lifeStats.births = 0;
  lifeStats.stageUps = 0;
  lifeStats.blockedBirths = 0;
  elStretch.textContent = '1.00×';
  elBounces.textContent = '0';
  elBears.textContent = '0';
  drawShadows();
}
const explodeBtn = document.getElementById('explode');
explodeBtn.addEventListener('click', ()=>{
  launchFirework(false, -0.5, 0.3);
  launchFirework(false, 0.5, -0.3);
  launchFirework(false, 0, 0);
});
document.getElementById('clearBears').addEventListener('click', resetBears);
resetViewBtn = document.getElementById('resetView');
hintEl = document.getElementById('camHint');
resetViewBtn.addEventListener('click', resetCamera);
hintEl.textContent = COARSE_POINTER
  ? 'Drag empty space to orbit · pinch to pan & zoom'
  : 'Right-drag to orbit · WASD to pan · scroll to zoom · ? for help';
setTimeout(showCamHint, 1300);
/* upright assist toggle */
let uprightAssist = true;
const uprightBtn = document.getElementById('uprightBtn');
function setUpright(on, persist){
  uprightAssist = !!on;
  uprightBtn.textContent = uprightAssist ? 'On' : 'Off';
  uprightBtn.classList.toggle('off', !uprightAssist);
  uprightBtn.setAttribute('aria-pressed', String(uprightAssist));
  if (persist){ try { localStorage.setItem('gummy.upright', uprightAssist ? '1' : '0'); } catch(err){} }
}
uprightBtn.addEventListener('click', ()=>setUpright(!uprightAssist, true));
(function initUpright(){
  let v = true;
  try { const sv = localStorage.getItem('gummy.upright'); if (sv !== null) v = (sv === '1'); } catch(err){}
  setUpright(v, false);
})();

/* controls sheet + settings */
let helpOpen = false;
let settingsOpen = false;
let menuSlotsOpen = false;
let pausePanelOpen = false;
const helpEl = document.getElementById('help');
const settingsEl = document.getElementById('settings');
const panelView = createPanelView({
  documentRef: document,
  menu: document.getElementById('mainMenu'),
  pause: document.getElementById('pauseMenu'),
  slots: document.getElementById('menuSlots'),
  help: helpEl,
  settings: settingsEl,
  body: document.body,
  onBackdrop(kind) {
    if (kind === 'help') setHelp(false);
    else if (kind === 'settings') setSettings(false);
  },
});
function panelState() {
  return { menu: menuOpen, paused, slots: menuSlotsOpen, help: helpOpen, settings: settingsOpen };
}
function panelRenderState() {
  return { menu: menuOpen, paused: pausePanelOpen, slots: menuSlotsOpen, help: helpOpen, settings: settingsOpen };
}
function setHelp(open){
  helpOpen = !!open;
  if (helpOpen) setSettings(false);
  panelView.render(panelRenderState());
}
function setSettings(open){
  settingsOpen = !!open;
  if (settingsOpen) setHelp(false);
  panelView.render(panelRenderState());
  if (settingsOpen) { syncSettingsUI(); refreshSavesUI(); }
}
document.getElementById('helpBtn').addEventListener('click', ()=>setHelp(true));
document.getElementById('helpClose').addEventListener('click', ()=>setHelp(false));
document.getElementById('settingsBtn')?.addEventListener('click', ()=>setSettings(true));
document.getElementById('settingsClose')?.addEventListener('click', ()=>setSettings(false));
document.getElementById('settingsDone')?.addEventListener('click', ()=>setSettings(false));
addEventListener('keydown', (e)=>{
  if (e.key === 'Escape'){
    if (possessedBear){ exitPossession(); return; }
    if (directivePick){ directivePick = false; syncDirectivePanel(); return; }
    const target = escapeTarget(panelState());
    if (target === 'slots') { openMenuSlots(false); return; }
    if (target === 'modal'){ setHelp(false); setSettings(false); return; }
    if (target === 'pause'){ setPaused(false); return; }
    if (!menuOpen && window.__gummy && window.__gummy.booted) setPaused(true);
    return;
  }
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  if (!uiHidden && (e.key === '?' || e.key.toLowerCase() === 'h')) setHelp(true);
});

/* whole-interface visibility, including phone layouts */
let uiHidden = false;
const uiToggleBtn = document.getElementById('uiToggle');
function syncUiToggle(){
  document.body.classList.toggle('ui-hidden', uiHidden);
  if (!uiToggleBtn) return;
  const mark = uiToggleBtn.querySelector('.uiToggleMark');
  const label = uiToggleBtn.querySelector('.uiToggleLabel');
  uiToggleBtn.setAttribute('aria-pressed', String(uiHidden));
  uiToggleBtn.setAttribute('aria-label', uiHidden ? 'Show interface' : 'Hide interface');
  uiToggleBtn.title = `${uiHidden ? 'Show' : 'Hide'} interface (U)`;
  if (mark) mark.textContent = uiHidden ? '◌' : '◉';
  if (label) label.textContent = uiHidden ? 'Show UI' : 'Hide UI';
}
function setUiHidden(hidden){
  uiHidden = !!hidden;
  if (uiHidden){
    keys.clear();
    setHelp(false);
    setSettings(false);
    if (aiDebug) aiDebug.setOpen(false);
  }
  syncUiToggle();
  try { localStorage.setItem('gummy.uiHidden', uiHidden ? '1' : '0'); } catch (err) {}
}
function toggleUi(){ setUiHidden(!uiHidden); }
try { uiHidden = localStorage.getItem('gummy.uiHidden') === '1'; } catch (err) {}
syncUiToggle();
uiToggleBtn?.addEventListener('click', toggleUi);

const limitEl = document.getElementById('limit');
const limitValEl = document.getElementById('limitVal');
function setCeiling(n, persist){
  bearCeiling = clamp(Math.round(n/8)*8, 8, 256);
  limitEl.value = String(bearCeiling);
  limitValEl.textContent = String(bearCeiling);
  document.getElementById('pfBearsMax').textContent = '/ ' + bearCeiling;
  while (bears.length > bearCeiling) removeBear(bears[0], { departure: 'removed' });
  if (persist){ try { localStorage.setItem('gummy.limit', String(bearCeiling)); } catch(err){} }
}
limitEl.addEventListener('input', ()=>setCeiling(+limitEl.value, true));
(function initCeiling(){
  let v = 128;
  try { const saved = +localStorage.getItem('gummy.limit'); if (saved >= 8) v = saved; } catch(err){}
  setCeiling(v, false);
})();

function readAdoptionSetting(){
  try { adoptionEnabled = localStorage.getItem(ADOPTION_KEY) === '1'; } catch (err) {}
}

function readGiftingSetting(){
  try { giftingEnabled = localStorage.getItem(GIFTING_KEY) === '1'; } catch (err) {}
}

function applyGiftingSetting(){
  if (!behavior || BEHAVIOR_ENGINE !== 'modules') return false;
  behavior.setFeature('gifting', !!giftingEnabled);
  return true;
}

function syncGiftingSettingsUI(){
  const legacy = BEHAVIOR_ENGINE !== 'modules';
  const box = document.getElementById('settingsGifting');
  if (box) {
    box.checked = !!giftingEnabled;
    box.disabled = legacy;
  }
  const value = document.getElementById('settingsGiftingVal');
  if (value) value.textContent = giftingEnabled ? 'On' : 'Off';
  const note = document.getElementById('settingsGiftingNote');
  if (note) {
    note.textContent = legacy
      ? 'Gifting needs the modules engine; it is disabled with ?behaviors=legacy.'
      : 'Off by default. An adult can collect and hand over one safe food portion per day.';
  }
}

function setGiftingSetting(value){
  giftingEnabled = !!value;
  try { localStorage.setItem(GIFTING_KEY, giftingEnabled ? '1' : '0'); } catch (err) {}
  applyGiftingSetting();
  syncGiftingSettingsUI();
  return giftingEnabled;
}

function readSocialSettings(){
  try {
    const saved = JSON.parse(localStorage.getItem(SOCIAL_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(SOCIAL_FEATURES)) socialFeatures[key] = !!saved[key];
    }
  } catch (err) {}
}

function applySocialSettings(){
  if (!behavior || BEHAVIOR_ENGINE !== 'modules') return false;
  for (const [key, feature] of Object.entries(SOCIAL_FEATURES)) {
    behavior.setFeature(feature, !!socialFeatures[key]);
  }
  return true;
}

function socialFeatureLabel(key){
  return key[0].toUpperCase() + key.slice(1);
}

function syncSocialSettingsUI(){
  const legacy = BEHAVIOR_ENGINE !== 'modules';
  for (const [key, feature] of Object.entries(SOCIAL_FEATURES)) {
    const box = document.getElementById(`settings${socialFeatureLabel(key)}`);
    if (box) {
      box.checked = !!socialFeatures[key];
      box.disabled = legacy;
    }
    const value = document.getElementById(`settings${socialFeatureLabel(key)}Val`);
    if (value) value.textContent = socialFeatures[key] ? 'On' : 'Off';
    const note = document.getElementById(`settings${socialFeatureLabel(key)}Note`);
    if (note) {
      if (!note.dataset.on) note.dataset.on = note.textContent;
      note.textContent = legacy
        ? `${key} needs the modules engine; it is disabled with ?behaviors=legacy.`
        : note.dataset.on;
    }
  }
}

function setSocialSetting(key, value){
  if (!(key in SOCIAL_FEATURES)) return false;
  socialFeatures[key] = !!value;
  try { localStorage.setItem(SOCIAL_KEY, JSON.stringify(socialFeatures)); } catch (err) {}
  applySocialSettings();
  syncSocialSettingsUI();
  return socialFeatures[key];
}

function applyAdoptionSetting(){
  if (!behavior || BEHAVIOR_ENGINE !== 'modules') return false;
  behavior.setFeature('adoption', !!adoptionEnabled);
  return true;
}

function syncAdoptionSettingsUI(){
  const legacy = BEHAVIOR_ENGINE !== 'modules';
  const box = document.getElementById('settingsAdoption');
  if (box) {
    box.checked = !!adoptionEnabled;
    box.disabled = legacy;
  }
  const value = document.getElementById('settingsAdoptionVal');
  if (value) value.textContent = adoptionEnabled ? 'On' : 'Off';
  const note = document.getElementById('settingsAdoptionNote');
  if (note) {
    note.textContent = legacy
      ? 'Guardians need the modules engine; they are disabled with ?behaviors=legacy.'
      : 'Off by default. A parentless baby gets an automatic same-species guardian.';
  }
}

function setAdoptionSetting(value){
  adoptionEnabled = !!value;
  try { localStorage.setItem(ADOPTION_KEY, adoptionEnabled ? '1' : '0'); } catch (err) {}
  applyAdoptionSetting();
  syncAdoptionSettingsUI();
  return adoptionEnabled;
}

function readFarewellSettings(){
  try {
    const saved = JSON.parse(localStorage.getItem(FAREWELL_KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const key of Object.keys(farewellSettings)) farewellSettings[key] = !!saved[key];
    }
  } catch (err) {}
}

function writeFarewellSettings(){
  try { localStorage.setItem(FAREWELL_KEY, JSON.stringify(farewellSettings)); } catch (err) {}
}

function syncFarewellSettingsUI(){
  const legacy = BEHAVIOR_ENGINE !== 'modules';
  const master = document.getElementById('settingsFarewells');
  if (master) {
    master.checked = !!farewellSettings.farewells;
    master.disabled = legacy;
  }
  const masterVal = document.getElementById('settingsFarewellsVal');
  if (masterVal) masterVal.textContent = farewellSettings.farewells ? 'On' : 'Off';
  for (const key of ['starsOldAge', 'starsStarvation', 'starsStings', 'mourning']) {
    const box = document.getElementById(`settings${key[0].toUpperCase()}${key.slice(1)}`);
    if (box) {
      box.checked = !!farewellSettings[key];
      box.disabled = legacy || !farewellSettings.farewells;
    }
    const value = document.getElementById(`settings${key[0].toUpperCase()}${key.slice(1)}Val`);
    if (value) value.textContent = farewellSettings[key] ? 'On' : 'Off';
  }
  const note = document.getElementById('settingsFarewellNote');
  if (note) {
    note.textContent = legacy
      ? 'Farewells need the modules engine; they are disabled with ?behaviors=legacy.'
      : 'Off by default. A committed farewell cannot be rescued.';
  }
}

function applyFarewellSettings(){
  if (!behavior || BEHAVIOR_ENGINE !== 'modules') return false;
  for (const [key, feature] of Object.entries(FAREWELL_FEATURES)) {
    behavior.setFeature(feature, !!farewellSettings[key]);
  }
  if (!farewellSettings.farewells) behavior.api.cancelFarewells();
  return true;
}

function setFarewellSetting(key, value){
  if (!(key in farewellSettings)) return false;
  farewellSettings[key] = !!value;
  writeFarewellSettings();
  applyFarewellSettings();
  syncFarewellSettingsUI();
  return farewellSettings[key];
}

readFarewellSettings();
for (const key of Object.keys(FAREWELL_FEATURES)) {
  const id = `settings${key[0].toUpperCase()}${key.slice(1)}`;
  document.getElementById(id)?.addEventListener('change', event => {
    setFarewellSetting(key, event.target.checked);
  });
}
syncFarewellSettingsUI();
readAdoptionSetting();
document.getElementById('settingsAdoption')?.addEventListener('change', event => {
  setAdoptionSetting(event.target.checked);
});
syncAdoptionSettingsUI();
readGiftingSetting();
document.getElementById('settingsGifting')?.addEventListener('change', event => {
  setGiftingSetting(event.target.checked);
});
syncGiftingSettingsUI();
readSocialSettings();
for (const key of Object.keys(SOCIAL_FEATURES)) {
  const id = `settings${socialFeatureLabel(key)}`;
  document.getElementById(id)?.addEventListener('change', event => {
    setSocialSetting(key, event.target.checked);
  });
}
syncSocialSettingsUI();

/* ------------------------------ Aero / MSN -------------------------------- */
const skyClockEl = document.getElementById('skyClock');
const skyPeriodEl = document.getElementById('skyPeriod');
const skyIconEl = document.getElementById('skyIcon');
const onlineCountEl = document.getElementById('onlineCount');
const buddyListEl = document.getElementById('buddyList');
const directivePanelEl = document.getElementById('directivePanel');
const directiveNameEl = document.getElementById('directiveName');
const directiveStatusEl = document.getElementById('directiveStatus');
const directiveFamilyEl = document.getElementById('directiveFamily');
const directiveHistoryEl = document.getElementById('directiveHistory');
const directiveActionsEl = document.getElementById('directiveActions');
const directiveCloseEl = document.getElementById('directiveClose');
const relRelationshipsEl = document.getElementById('relRelationships');
const relEventsEl = document.getElementById('relEvents');
const relTabButtons = Array.from(document.querySelectorAll('[data-rel-tab]'));
const possessBtnEl = document.getElementById('possessBtn');
const possessHudEl = document.getElementById('possessHud');
const possessStickEl = document.getElementById('possessStick');
const possessKnobEl = document.getElementById('possessKnob');
const possessExitEl = document.getElementById('possessExit');
const possessNameEl = document.getElementById('possessName');
const clickModeEl = document.getElementById('clickMode');
const directiveButtons = directiveActionsEl
  ? Array.from(directiveActionsEl.querySelectorAll('[data-directive]'))
  : [];
const timeSliderEl = document.getElementById('timeSlider');
const timeAutoEl = document.getElementById('timeAuto');
const timeSpeedEl = document.getElementById('timeSpeed');
const skyLooksEl = document.getElementById('skyLooks');
const skyLookButtons = skyLooksEl ? Array.from(skyLooksEl.querySelectorAll('[data-look]')) : [];
const SKY_LOOK_KEY = 'gummy.skyLook';
const windStrengthEl = document.getElementById('windStrength');
const windValueEl = document.getElementById('windValue');
const canopyFullnessEl = document.getElementById('canopyFullness');
const leafSizeEl = document.getElementById('leafSize');
const grassCoverageEl = document.getElementById('grassCoverage');
const grassDistanceEl = document.getElementById('grassDistance');
const effectsLevelEl = document.getElementById('effectsLevel');
const effectsDofEl = document.getElementById('effectsDof');
const settingsReset = document.getElementById('settingsReset');
const settingsProfileNote = document.getElementById('settingsProfileNote');
const settingsProfileBtns = [...document.querySelectorAll('[data-profile]')];
const settingsAdaptiveEl = document.getElementById('settingsAdaptive');
const settingsAdaptiveVal = document.getElementById('settingsAdaptiveVal');
const settingsScaleEl = document.getElementById('settingsScale');
const settingsScaleVal = document.getElementById('settingsScaleVal');
const settingsEffectsEl = document.getElementById('settingsEffects');
const settingsDofEl = document.getElementById('settingsDof');
const settingsToonEl = document.getElementById('settingsToon');
const settingsToonVal = document.getElementById('settingsToonVal');
const settingsTierEl = document.getElementById('settingsTier');
const settingsShadowEl = document.getElementById('settingsShadow');
const settingsCanopyEl = document.getElementById('settingsCanopy');
const settingsCanopyVal = document.getElementById('settingsCanopyVal');
const settingsLeafSizeEl = document.getElementById('settingsLeafSize');
const settingsLeafSizeVal = document.getElementById('settingsLeafSizeVal');
const settingsGrassCoverageEl = document.getElementById('settingsGrassCoverage');
const settingsGrassCoverageVal = document.getElementById('settingsGrassCoverageVal');
const settingsGrassDistanceEl = document.getElementById('settingsGrassDistance');
const settingsGrassDistanceVal = document.getElementById('settingsGrassDistanceVal');
const meadowMoodEl = document.getElementById('meadowMood');
let buddySig = '';
let lastBuddyStatusTick = 0;

const natureBindings = [
  { key:'canopy', quick:canopyFullnessEl, modal:settingsCanopyEl, quickVal:document.getElementById('canopyFullnessVal'), modalVal:settingsCanopyVal, digits:2 },
  { key:'leafSize', quick:leafSizeEl, modal:settingsLeafSizeEl, quickVal:document.getElementById('leafSizeVal'), modalVal:settingsLeafSizeVal, digits:2 },
  { key:'coverage', quick:grassCoverageEl, modal:settingsGrassCoverageEl, quickVal:document.getElementById('grassCoverageVal'), modalVal:settingsGrassCoverageVal, digits:2 },
  { key:'drawDistance', quick:grassDistanceEl, modal:settingsGrassDistanceEl, quickVal:document.getElementById('grassDistanceVal'), modalVal:settingsGrassDistanceVal, digits:0 },
];

function syncNatureUI(){
  for (const b of natureBindings){
    const v = natureState[b.key];
    if (b.quick && document.activeElement !== b.quick) b.quick.value = String(v);
    if (b.modal && document.activeElement !== b.modal) b.modal.value = String(v);
    const text = b.digits ? Number(v).toFixed(b.digits) : String(Math.round(v));
    if (b.quickVal) b.quickVal.textContent = text;
    if (b.modalVal) b.modalVal.textContent = text;
  }
}

function bindNatureInput(input, key){
  if (!input) return;
  input.addEventListener('input', () => {
    natureState = normalizeNature({ ...natureState, [key]: Number(input.value) });
    if (field) field.setNature(natureState);
    markSettingsCustom();
    saveSettings();
    syncNatureUI();
  });
}
for (const b of natureBindings) {
  bindNatureInput(b.quick, b.key);
  bindNatureInput(b.modal, b.key);
}

function updateMapButtons(){
  const cur = activeWorld.mapId;
  const a = document.getElementById('mapMeadow'), b = document.getElementById('mapStudio');
  if (a) a.setAttribute('aria-pressed', String(cur === 'field'));
  if (b) b.setAttribute('aria-pressed', String(cur === 'studio'));
}
function updateAeroVisibility(){
  // visibility is CSS-driven via body[data-map]; kept as a seam for future themes
}
function timePeriod(hours){
  if (hours >= 5.0 && hours < 8.0) return 'dawn';
  if (hours >= 8.0 && hours < 16.5) return 'day';
  if (hours >= 16.5 && hours < 20.0) return 'dusk';
  return 'night';
}
function formatClock(hours){
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function flavorHex(b){
  if (isGlassActor(b)) {
    const color = b.phenotype?.genes?.color;
    return isHexColor(color) ? color : '#a8e5ff';
  }
  if (b.flavor < 0) return '#ff4fa3';
  return '#' + (FLAVORS[b.flavor] ? FLAVORS[b.flavor].hex.toString(16).padStart(6,'0') : 'd51f3c');
}
function buddyPartnerName(b){
  const p = b && b.ai ? b.ai.partner : null;
  return p ? (p.name || 'a friend') : 'a friend';
}
function familyTaskStatus(b){
  const task = b && b.ai ? b.ai.familyTask : null;
  if (!task) return null;
  const who = buddyPartnerName(b);
  if (task.id === 'familyPlaydate') {
    return task.phase === 'travel' ? `heading to a playdate with ${who}` : `on a playdate with ${who}`;
  }
  if (task.id === 'familyLesson') {
    return task.role === 'teacher' ? `teaching ${who}` : `learning from ${who}`;
  }
  if (task.id === 'familyMeal') {
    const routine = task.data && task.data.routine ? task.data.routine : 'a meal';
    const place = task.anchor && task.anchor.home ? ` at ${task.anchor.home}` : '';
    return task.phase === 'travel' ? `heading to ${routine}${place}` : `sharing ${routine}${place}`;
  }
  return null;
}
function buddyStatus(b){
  if (!field) return 'settling in';
  if (isGlassActor(b)) {
    if (b.inside) return `resting inside at ${b.home || 'home'}`;
    if (b.pregnant) return b.gestation > 0 ? 'expecting a little glassling' : 'ready to welcome a glassling';
    if (b.ai) {
      const task = familyTaskStatus(b);
      if (task) return task;
      if (b.ai.state === 'follow') return `following ${b.ai.follow ? (b.ai.follow.name || 'a parent') : 'a parent'}`;
      if (b.ai.state === 'visit') {
        const who = buddyPartnerName(b);
        return b.ai.visitRole === 'guest'
          ? `visiting ${who}`
          : `hosting ${who} at ${b.ai.visitHome || b.home || 'home'}`;
      }
      if (b.ai.state === 'seekMate') return 'looking for a mate';
      if (b.ai.state === 'mate') return 'courting';
      if (b.ai.state === 'seekPlaydate') return `heading to a playdate with ${buddyPartnerName(b)}`;
      if (b.ai.state === 'social') return b.ai.familyPlay
        ? `on a playdate with ${b.ai.playmateKind || 'family'} ${buddyPartnerName(b)}${b.ai.playdateHome ? ` at ${b.ai.playdateHome}` : ''}`
        : `hovering with ${buddyPartnerName(b)}`;
      if (b.ai.state === 'seekSocial') return 'drifting toward a friend';
      if (b.ai.state === 'seekHome') return 'drifting inside for the day';
      if (b.ai.state === 'eat') return 'sipping nectar';
      if (b.ai.state === 'drink') return 'skimming the pond';
      if (b.ai.state === 'seekWater') return 'drifting to the pond';
      if (b.ai.state === 'seekFood') return 'looking for a sweet flower';
      if (b.ai.state === 'stargaze') return 'counting stars';
      if (b.thirst >= .82) return 'getting thirsty';
      if (b.hunger >= .82) return 'getting hungry';
    }
    if (sky && sky.night > .5) return 'hovering under the stars';
    return 'drifting through the meadow';
  }
  if (b.ai && b.ai.state === 'sleep') return `sleeping at ${b.home || 'home'}`;
  if (b.health < 15) return 'woozy — needs a quiet corner';
  if (b.pregnant) return b.gestation > 0 ? 'expecting a cub' : 'ready to welcome a cub';
  if (b.ai) {
    const task = familyTaskStatus(b);
    if (task) return task;
    if (b.ai.state === 'seekMate') return 'looking for a mate';
    if (b.ai.state === 'mate') return 'courting';
    if (b.ai.state === 'follow') return `following ${b.ai.follow ? (b.ai.follow.name || 'a parent') : 'a parent'}`;
    if (b.ai.state === 'seekCompany') return 'looking for a friend';
    if (b.ai.state === 'invite') return 'offering a nuzzle';
    if (b.ai.state === 'social') return b.ai.familyPlay
      ? `on a playdate with ${b.ai.playmateKind || 'family'} ${buddyPartnerName(b)}`
      : `hanging out with ${buddyPartnerName(b)}`;
    if (b.ai.state === 'decline') return 'needs a little space';
    if (b.ai.state === 'visit') {
      const who = buddyPartnerName(b);
      const home = b.ai.visitHome || 'home';
      return b.ai.visitRole === 'guest' ? `visiting ${who}'s villa` : `hosting ${who} at ${home}`;
    }
    if (b.ai.state === 'seekConflict') return 'eyeing someone else’s snack';
    if (b.ai.state === 'conflict') return 'shoving over a snack';
    if (b.ai.state === 'seekHome') return 'heading home to rest';
    if (b.ai.state === 'raidHive') return 'raiding a beehive';
    if (b.ai.state === 'seekHive') return 'eyeing the beehive';
    if (b.ai.state === 'flee') return 'fleeing the bees';
    if (b.ai.state === 'eat') return b.ai.source
      ? `nibbling a ${b.ai.source.label}` : 'nibbling a jelly flower';
    if (b.ai.state === 'drink') return 'sipping from the pond';
    if (b.ai.state === 'seekWater') return 'hopping to the pond';
    if (b.ai.state === 'seekFood') return 'looking for a snack';
    if (b.energy < 0.18) return 'ready for a nap';
    if (b.thirst >= 0.82) return 'getting thirsty';
    if (b.hunger >= 0.82) return 'getting hungry';
  }
  const p = field.pond;
  const distPond = Math.hypot(b.cx - p.x, b.cz - p.z);
  if (distPond < Math.max(p.rx, p.rz) + 2.8) return 'pondside, watching ripples';
  const home = field.homes.find(h => h.name === b.home);
  if (home && Math.hypot(b.cx - home.x, b.cz - home.z) < 5.5) return `at ${home.name}`;
  if (Math.hypot(b.cx, b.cz) < 7.5) return 'on the village green';
  if (b.cy > 1.4) return 'airborne!';
  if (sky && sky.night > 0.5) return 'counting stars';
  return 'out exploring the meadow';
}
function syncBuddyHealth(b){
  if (!b || !b._buddyHealthEl || !b._buddyHealthFill) return;
  const hp = clamp(Number.isFinite(b.health) ? b.health : 100, 1, 100);
  const label = Math.round(hp);
  b._buddyHealthFill.style.width = `${hp}%`;
  b._buddyHealthEl.className = `buddyHealth${hp < 15 ? ' woozy' : hp < 35 ? ' low' : ''}`;
  b._buddyHealthEl.title = `Health ${label} / 100`;
  b._buddyHealthEl.setAttribute('aria-label', `Health ${label} out of 100`);
  if (b._buddyHpText) b._buddyHpText.textContent = String(label);
}
function makeBuddyRow(data){
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'buddyRow';
  row.dataset.uid = data.key;
  const dot = document.createElement('span');
  dot.className = 'buddyDot';
  const mid = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'buddyName';
  const sex = document.createElement('span');
  sex.className = 'buddySex';
  const stage = document.createElement('span');
  stage.className = 'buddyStage';
  const status = document.createElement('span');
  status.className = 'buddyStatus';
  const family = document.createElement('span');
  family.className = 'buddyFamily';
  mid.append(name, document.createElement('br'), status, family);
  const right = document.createElement('span');
  right.className = 'buddyRight';
  const health = document.createElement('span');
  health.className = 'buddyHealth';
  health.setAttribute('role', 'img');
  const healthFill = document.createElement('i');
  health.appendChild(healthFill);
  const hpText = document.createElement('span');
  hpText.className = 'buddyHpText';
  hpText.textContent = '100';
  const vitals = document.createElement('span');
  vitals.className = 'buddyVitals';
  vitals.append(hpText, health);
  const home = document.createElement('span');
  home.className = 'buddyHome';
  right.append(vitals, home);
  row.append(dot, mid, right);
  row.addEventListener('click', () => {
    if (row._buddyActor) focusBuddy(row._buddyActor);
  });
  row._buddyDot = dot;
  row._buddyNameEl = name;
  row._buddySexEl = sex;
  row._buddyStageEl = stage;
  row._buddyStatusEl = status;
  row._buddyFamilyEl = family;
  row._buddyHomeEl = home;
  row._buddyHealthEl = health;
  row._buddyHealthFill = healthFill;
  row._buddyHpText = hpText;
  return row;
}
function updateBuddyRow(data, b, row){
  row.dataset.uid = data.key;
  row.title = `Find ${data.name || 'this bear'}`;
  row._buddyActor = b;
  b._buddyDot = row._buddyDot;
  b._buddyNameEl = row._buddyNameEl;
  b._buddySexEl = row._buddySexEl;
  b._buddyStageEl = row._buddyStageEl;
  b._buddyStatusEl = row._buddyStatusEl;
  b._buddyFamilyEl = row._buddyFamilyEl;
  b._buddyHomeEl = row._buddyHomeEl;
  b._buddyHealthEl = row._buddyHealthEl;
  b._buddyHealthFill = row._buddyHealthFill;
  b._buddyHpText = row._buddyHpText;
  b._buddyDot.style.background = `radial-gradient(circle at 32% 30%, #fff9, ${data.color} 48%, #5c1b2c)`;
  b._buddyNameEl.textContent = data.name || 'Gummy';
  b._buddyNameEl.appendChild(b._buddySexEl);
  b._buddySexEl.textContent = data.sex === 'F' ? '♀' : '♂';
  b._buddyStageEl.textContent = data.stage && data.stage !== 'adult' ? data.stage : '';
  if (b._buddyStageEl.textContent) b._buddyNameEl.appendChild(b._buddyStageEl);
  b._buddyStatusEl.textContent = data.status;
  b._buddyFamilyEl.textContent = data.family;
  b._buddyHomeEl.textContent = data.home || '—';
  row.classList.toggle('selected', data.selected);
  syncBuddyHealth(b);
}
function isRosterActor(b){ return !!speciesOf(b)?.roster; }
function rosterOptions(){
  return {
    isRosterActor,
    selectedUid: selectedBear ? selectedBear.uid : null,
    statusFor: buddyStatus,
    familyFor: familyShort,
    colorFor: flavorHex,
  };
}
function refreshBuddyList(roster = null, rosterActors = null){
  if (!buddyListEl) return;
  if (!isMeadow()) { buddyListEl.replaceChildren(); return; }
  if (!roster) {
    const active = actorView.active();
    roster = buildRosterRows(active, rosterOptions());
    rosterActors = active.filter(isRosterActor);
  }
  if (!rosterActors) rosterActors = actorView.active().filter(isRosterActor);
  const existing = new Map();
  for (const row of buddyListEl.children) existing.set(row.dataset.uid, row);
  for (let i = 0; i < roster.length; i++){
    const data = roster[i];
    const b = rosterActors[i];
    const key = data.key;
    const row = existing.get(key) || makeBuddyRow(data);
    existing.delete(key);
    updateBuddyRow(data, b, row);
    buddyListEl.append(row);
  }
  for (const row of existing.values()) row.remove();
  if (onlineCountEl) onlineCountEl.textContent = `${roster.length} online`;
  buddySig = buddySignature(roster);
  lastBuddyStatusTick = 0;
}
function buddySignature(rows){
  return rosterSignature(rows);
}
function updateBuddyStatuses(force = false){
  if (!isMeadow()) return;
  const now = performance.now();
  if (!force && now - lastBuddyStatusTick < 650) return;
  lastBuddyStatusTick = now;
  for (const b of actorView.active()){
    if (!b.active) continue;
    if (b._buddyStatusEl) b._buddyStatusEl.textContent = buddyStatus(b);
    syncBuddyHealth(b);
  }
  if (selectedBear) syncDirectivePanel();
}
const DIRECTIVE_TEXT = { go: 'Go here', eat: 'Eat', drink: 'Drink', home: 'Home', social: 'Socialize' };
function selectedBearIndex(){
  return selectedBear ? bears.indexOf(selectedBear) : -1;
}
function historyActorName(uid) {
  if (!uid) return 'family';
  const entry = gameActorIndex().get(Number(uid));
  return entry && entry.actor ? actorName(entry.actor) : 'someone';
}
function bondDeltaText(event) {
  const before = Number(event && event.bondBefore);
  const after = Number(event && event.bondAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === after) return '';
  return `${Math.round(before * 100)}% → ${Math.round(after * 100)}%`;
}

function historyLabel(event) {
  const name = historyActorName(event.uid);
  switch (event.kind) {
    case 'born': return `was born (${name})`;
    case 'mated': return `mated with ${name}`;
    case 'child': return `welcomed ${name}`;
    case 'meal': return `shared a meal with ${name}`;
    case 'lesson': return `taught ${name}`;
    case 'taught': return `learned from ${name}`;
    case 'playdate': return `played with ${name}`;
    case 'visit': return `visited ${name}`;
    case 'hosted': return `was visited by ${name}`;
    case 'social': return `spent time with ${name}`;
    case 'decline': return `had an invitation declined by ${name}`;
    case 'declined': return `declined an invitation from ${name}`;
    case 'conflict': return `contested food with ${name}`;
    case 'gift': return `gave food to ${name}`;
    case 'receivedGift': return `received food from ${name}`;
    case 'chat': return `chatted with ${name}`;
    case 'cuddle': return `cuddled with ${name}`;
    case 'reconcile': return `reconciled with ${name}`;
    case 'groupPlay': return `played with ${name} and others`;
    case 'groupGather': return `gathered with ${name} and others`;
    case 'partnered': return `became partners with ${name}`;
    case 'separated': return `ended a partnership with ${name}`;
    case 'stage': return 'grew up';
    case 'home': return 'went home';
    case 'moved': return 'moved home';
    case 'bond': return `grew closer to ${name}`;
    default: return event.kind;
  }
}
function speciesDisplay(entry) {
  const species = entry && entry.actor ? entry.actor.species : null;
  if (species === 'bear') return 'Bear';
  if (species === 'msn') return 'Gummy';
  if (species === 'glass') return 'Glass';
  return species ? String(species) : '';
}

function mapDisplay(mapId) {
  if (!mapId || mapId === activeWorld.mapId) return '';
  return mapId === 'studio' ? 'Studio' : 'Meadow';
}

function relationshipMeta(row) {
  const bits = [];
  const species = row.species === 'bear' ? 'Bear'
    : row.species === 'msn' ? 'Gummy'
    : row.species === 'glass' ? 'Glass'
    : row.species || '';
  if (species) bits.push(species);
  if (row.relation && row.relation !== 'Bond') bits.push(row.relation);
  const map = mapDisplay(row.mapId);
  if (map) bits.push(map);
  if (row.missing) bits.push('record unavailable');
  return bits.join(' · ');
}

function relationshipInteractions(actor, row) {
  const box = document.createElement('div');
  box.className = 'relInteractions';
  const title = document.createElement('b');
  title.textContent = 'Recent interactions';
  box.append(title);
  if (!row.interactions.length) {
    const empty = document.createElement('span');
    empty.className = 'hEmpty';
    empty.textContent = 'No recent interactions recorded.';
    box.append(empty);
    return box;
  }
  for (const event of row.interactions) {
    const line = document.createElement('span');
    line.className = 'hLine';
    const when = document.createElement('b');
    when.textContent = `Day ${(event.day || 0) + 1} · ${formatClock(event.hour || 0)}`;
    const delta = bondDeltaText(event);
    line.append(when, document.createTextNode(` — ${historyLabel(event)}${delta ? ` · ${delta}` : ''}`));
    box.append(line);
  }
  return box;
}

function relationshipRow(actor, row, section) {
  const key = `${section}:${row.uid}:${row.relation}`;
  const item = document.createElement('div');
  item.className = 'relItem';
  const body = document.createElement(row.missing ? 'div' : 'button');
  body.className = 'relRow' + (row.missing ? ' missing' : '');
  body.dataset.uid = String(row.uid);
  body.dataset.relation = row.relation;
  if (!row.missing) body.type = 'button';
  const main = document.createElement('span');
  main.className = 'relMain';
  const name = document.createElement('b');
  name.className = 'relName';
  name.textContent = row.name || 'Record unavailable';
  const meta = document.createElement('span');
  meta.className = 'relMeta';
  meta.textContent = relationshipMeta(row);
  main.append(name, meta);
  body.append(main);

  if (row.bond !== undefined) {
    const percent = Math.round(row.bond * 100);
    const value = document.createElement('span');
    value.className = 'relValue';
    value.textContent = `${percent}%`;
    const meter = document.createElement('span');
    meter.className = 'relMeter';
    const fill = document.createElement('i');
    fill.style.width = `${percent}%`;
    meter.append(fill);
    const detail = document.createElement('span');
    detail.className = 'relDetail';
    detail.textContent = row.asymmetric
      ? `${row.friendship || 'bond'} · theirs ${Math.round(row.reverse * 100)}%${row.friendshipReverse ? ` (${row.friendshipReverse})` : ''}`
      : (row.friendship || 'bond');
    const bondBox = document.createElement('span');
    bondBox.className = 'relBond';
    bondBox.append(value, meter, detail);
    body.append(bondBox);
  } else if (!row.missing) {
    const chevron = document.createElement('span');
    chevron.className = 'relChevron';
    chevron.textContent = expandedRelationshipKey === key ? '▾' : '▸';
    body.append(chevron);
  }
  if (!row.missing) {
    body.setAttribute('aria-expanded', String(expandedRelationshipKey === key));
    body.addEventListener('click', () => {
      expandedRelationshipKey = expandedRelationshipKey === key ? null : key;
      renderRelationships(actor);
    });
  }
  item.append(body);
  if (!row.missing && expandedRelationshipKey === key) {
    item.append(relationshipInteractions(actor, row));
  }
  return item;
}

function relationshipSection(title, rows, actor) {
  if (!rows.length) return null;
  const section = document.createElement('div');
  section.className = 'relSection';
  const head = document.createElement('h4');
  head.textContent = title;
  section.append(head);
  for (const row of rows) section.append(relationshipRow(actor, row, title));
  if (title === 'Partnership' && rows.some(row => !row.missing)) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'relAction';
    action.textContent = 'End partnership';
    action.addEventListener('click', event => {
      event.stopPropagation();
      if (!behavior || typeof behavior.separatePartnership !== 'function') return;
      if (!separatePartnershipFor(actor)) return;
      relViewSig = '';
      renderRelationships(actor);
      syncDirectivePanel();
    });
    section.append(action);
  }
  return section;
}

let relViewSig = '';

function relationshipSignature(actor) {
  const known = gameActorIndex();
  const bonds = Object.entries(actor.bonds || {})
    .map(([uid, value]) => `${uid}:${value}`).join(',');
  const history = (actor.history || []).slice(-8)
    .map(event => `${event.kind}:${event.uid}:${event.day}:${event.hour}`).join(',');
  const rivals = Object.entries(actor.rivals || {})
    .map(([uid, record]) => `${uid}:${record.sinceDay}:${record.sinceHour}`).join(',');
  const others = [...known.values()].map(entry =>
    `${entry.actor.uid}:${entry.mapId}:${entry.actor.guardianUid || 0}:${
      (entry.actor.parentUids || []).join('.')}:${
      entry.actor.bonds ? entry.actor.bonds[String(actor.uid)] || 0 : 0}`).join(',');
  return [actor.uid, actor.name, actor.guardianUid || 0, actor.partnerUid || 0, rivals,
    bonds, history, others].join('|');
}

function renderRelationships(actor) {
  if (!relRelationshipsEl || !actor) return;
  const view = buildRelationshipView(actor, [...gameActorIndex().values()]);
  relRelationshipsEl.replaceChildren();
  const family = relationshipSection('Family', view.family, actor);
  const care = relationshipSection('Care', view.care, actor);
  const partner = relationshipSection('Partnership', view.partner ? [view.partner] : [], actor);
  const rivals = relationshipSection('Rivals', view.rivals, actor);
  const bonds = relationshipSection('Bonds', view.bonds, actor);
  if (family) relRelationshipsEl.append(family);
  if (care) relRelationshipsEl.append(care);
  if (partner) relRelationshipsEl.append(partner);
  if (rivals) relRelationshipsEl.append(rivals);
  if (bonds) relRelationshipsEl.append(bonds);
  if (!family && !care && !partner && !rivals && !bonds) {
    const empty = document.createElement('span');
    empty.className = 'hEmpty';
    empty.textContent = 'No recorded relationships yet.';
    relRelationshipsEl.append(empty);
  } else if (bonds) {
    const note = document.createElement('p');
    note.className = 'relNote';
    note.textContent = 'Bond strength and its display-only friendship label; directional values are shown separately.';
    relRelationshipsEl.append(note);
  }
  relViewSig = relationshipSignature(actor);
}

function syncRelationshipTabs() {
  for (const button of relTabButtons) {
    const active = button.dataset.relTab === relationshipTab;
    button.classList.toggle('on', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  }
  if (relRelationshipsEl) relRelationshipsEl.hidden = relationshipTab !== 'relationships';
  if (relEventsEl) relEventsEl.hidden = relationshipTab !== 'events';
}

function setRelationshipTab(tab) {
  relationshipTab = tab === 'events' ? 'events' : 'relationships';
  expandedRelationshipKey = null;
  syncRelationshipTabs();
  if (!selectedBear) return;
  if (relationshipTab === 'relationships') renderRelationships(selectedBear);
  else refreshDirectiveHistory(selectedBear);
}

function refreshDirectiveHistory(b) {
  if (!directiveHistoryEl) return;
  directiveHistoryEl.innerHTML = '';
  if (!b) return;
  const events = historyFor(b).slice(-5).reverse();
  if (!events.length) {
    const empty = document.createElement('span');
    empty.className = 'hEmpty';
    empty.textContent = 'No recorded events yet.';
    directiveHistoryEl.append(empty);
    return;
  }
  for (const event of events) {
    const line = document.createElement('span');
    line.className = 'hLine';
    const when = document.createElement('b');
    when.textContent = `Day ${(event.day || 0) + 1} · ${formatClock(event.hour || 0)}`;
    const delta = bondDeltaText(event);
    line.append(when, document.createTextNode(` — ${historyLabel(event)}${delta ? ` · ${delta}` : ''}`));
    directiveHistoryEl.append(line);
  }
}
function syncDirectivePanel(){
  if (!directivePanelEl) return;
  const b = selectedBear;
  const show = !!b && b.active && isMeadow() && !helpOpen;
  directivePanelEl.hidden = !show;
  if (!show) return;
  if (directiveNameEl) directiveNameEl.textContent = b.name || (isGlassActor(b) ? 'Glass' : 'Gummy');
  const controlling = possessedBear === b;
  const glass = isGlassActor(b);
  if (directiveActionsEl) directiveActionsEl.hidden = controlling || glass;
  if (possessBtnEl) {
    possessBtnEl.textContent = controlling ? 'Exit control' : 'Control';
    possessBtnEl.classList.toggle('on', controlling);
    possessBtnEl.hidden = glass;
  }
  let text = glass ? 'Glass drifts on its own · watch its hover life' : 'Pick a command.';
  if (controlling) {
    text = 'WASD / stick to move · Space hop · V exit';
  } else if (glass) {
    text = b.inside ? 'Resting inside for the day.' : 'Glass hovers, feeds and socialises autonomously.';
  } else if (b.ai && b.ai.directiveStatus && b.ai.directiveStatus.t > 0) {
    text = b.ai.directiveStatus.text;
  } else if (b.ai && b.ai.state === 'seekGift') {
    text = b.ai.giftRole === 'giver' ? 'Offering food nearby.' : 'Waiting for an offer.';
  } else if (b.ai && b.ai.state === 'gift') {
    text = b.ai.giftRole === 'giver' ? 'Handing over food.' : 'Receiving food.';
  } else if (b.ai && b.ai.directive) {
    text = `${DIRECTIVE_TEXT[b.ai.directive.kind] || 'Directive'} — ${Math.ceil(b.ai.directive.ttl)}s`;
  } else if (b.ai && b.ai.directives && b.ai.directives.length) {
    text = `${b.ai.directives.length} queued`;
  }
  if (directiveStatusEl) directiveStatusEl.textContent = text;
  if (directiveFamilyEl) directiveFamilyEl.textContent = familyLine(b);
  refreshDirectiveHistory(b);
  syncRelationshipTabs();
  if (relationshipTab === 'relationships' &&
      relViewSig !== relationshipSignature(b)) renderRelationships(b);
  for (const btn of directiveButtons) {
    btn.classList.toggle('active', directivePick && btn.dataset.directive === 'go');
  }
}
function selectBear(b){
  selectedBear = b && b.active ? b : null;
  directivePick = false;
  expandedRelationshipKey = null;
  relViewSig = '';
  if (buddyListEl) {
    for (const row of buddyListEl.children) {
      row.classList.toggle('selected', !!b && row.dataset.uid === String(b.uid));
    }
  }
  syncDirectivePanel();
}
function syncClickMode(){
  if (!clickModeEl) return;
  const select = clickMode === 'select';
  clickModeEl.textContent = select ? 'Select click' : 'Grab click';
  clickModeEl.setAttribute('aria-pressed', String(select));
  clickModeEl.title = select
    ? 'Left click selects a bear; drag still orbits'
    : 'Left click grabs and throws a bear';
}
function toggleClickMode(){
  clickMode = clickMode === 'select' ? 'grab' : 'select';
  try { localStorage.setItem('gummy.clickMode', clickMode); } catch (err) {}
  syncClickMode();
  if (hintEl){
    hintEl.textContent = clickMode === 'select'
      ? 'Select click — click a bear to command it, drag to orbit'
      : 'Grab click — drag a bear to stretch and throw';
    showCamHint();
  }
}
clickModeEl?.addEventListener('click', toggleClickMode);
syncClickMode();
function issueSelectedDirective(kind){
  if (!selectedBear || !selectedBear.active || isGlassActor(selectedBear) || !ai || !isMeadow()) return;
  if (kind === 'go') {
    directivePick = true;
    if (directiveStatusEl) directiveStatusEl.textContent = 'Tap the meadow to send this bear there.';
    for (const btn of directiveButtons) btn.classList.toggle('active', btn.dataset.directive === 'go');
    return;
  }
  const d = ai.issueDirective(selectedBear, kind);
  if (directiveStatusEl) {
    directiveStatusEl.textContent = d
      ? `${DIRECTIVE_TEXT[kind] || kind} — asked`
      : 'That command is not available.';
  }
}
for (const btn of directiveButtons) {
  btn.addEventListener('click', () => issueSelectedDirective(btn.dataset.directive));
}
for (const btn of relTabButtons) {
  btn.addEventListener('click', () => setRelationshipTab(btn.dataset.relTab));
  btn.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' &&
        event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const index = relTabButtons.indexOf(btn);
    const last = relTabButtons.length - 1;
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + relTabButtons.length) % relTabButtons.length;
    setRelationshipTab(relTabButtons[next].dataset.relTab);
    relTabButtons[next].focus();
  });
}
syncRelationshipTabs();
directiveCloseEl?.addEventListener('click', () => {
  directivePick = false;
  selectBear(null);
});

function syncPossessHud(){
  if (!possessHudEl) return;
  const on = !!possessedBear;
  possessHudEl.hidden = !on;
  document.body.classList.toggle('possessing', on);
  if (possessNameEl) {
    possessNameEl.textContent = on ? `Controlling ${possessedBear.name || 'Gummy'}` : 'In control';
  }
  syncRaceControlUI();
}
function enterPossession(b){
  if (!b || !b.active || !ai) return false;
  const def = speciesOf(b);
  if (!def || !def.canPossess) return false;
  if (!isMeadow() && !def.studio) return false;
  if (possessedBear && possessedBear !== b) exitPossession();
  // Sleeping is not a refusal: possession wakes the bear and hands control over.
  if (b.sleeping){
    b.sleeping = false;
    b.needsBuild = true;
  }
  if (!ai.setPossessed(b, true)) return false;
  possessedBear = b;
  selectedBear = b;
  directivePick = false;
  possessInput.x = 0; possessInput.y = 0; possessHopCd = 0;
  cam.dist = clamp(Math.max(cam.dist, 5.5), 4.6, 9.5);
  cam.goal.set(b.cx, clamp(b.cy + 0.55, 0.6, 1.4), b.cz);
  syncDirectivePanel();
  syncPossessHud();
  return true;
}
function exitPossession(){
  if (!possessedBear) return false;
  if (ai) ai.setPossessed(possessedBear, false);
  possessedBear = null;
  possessInput.x = 0; possessInput.y = 0; possessHopCd = 0;
  if (possessKnobEl) possessKnobEl.style.transform = '';
  syncDirectivePanel();
  syncPossessHud();
  return true;
}
function gummyActor(){
  return bears.find(b => b.active && isGummyActor(b)) || null;
}
function syncRaceControlUI(){
  const btn = document.getElementById('raceControl');
  if (!btn) return;
  const g = gummyActor();
  const available = !!g && speciesOf(g).canPossess && !studioActorHidden(g);
  btn.disabled = !available;
  const controlling = !!possessedBear && possessedBear === g;
  btn.textContent = controlling ? 'Exit control' : 'Control Gummy';
  btn.classList.toggle('on', controlling);
}
function toggleGummyPossession(){
  if (possessedBear) return exitPossession();
  const g = gummyActor();
  if (!g || studioActorHidden(g)) return false;
  selectedBear = g;
  return enterPossession(g);
}
function togglePossession(){
  if (possessedBear) return exitPossession();
  return selectedBear ? enterPossession(selectedBear) : false;
}
function possessionJump(){
  const b = possessedBear;
  if (!b || b.airborne || b.contacts === 0 || possessHopCd > 0) return;
  hopBear(b, 3.4, 0, 0, true);
  b.ai.hopState = 'air';
  b.ai.hopWait = 0;
  b.airborne = true;
  b.antic = 0;
  possessHopCd = 0.55;
}
function updatePossessionLocomotion(dt){
  if (!possessedBear) return;
  const possessedDef = speciesOf(possessedBear);
  if (!possessedBear.active || (!isMeadow() && !possessedDef.studio)) { exitPossession(); return; }
  const b = possessedBear;
  if (possessHopCd > 0) possessHopCd = Math.max(0, possessHopCd - dt);
  if (b.grabs > 0 || b.inPond) return;
  let fwd = 0, right = 0;
  if (keys.has('w') || keys.has('arrowup')) fwd += 1;
  if (keys.has('s') || keys.has('arrowdown')) fwd -= 1;
  if (keys.has('d') || keys.has('arrowright')) right += 1;
  if (keys.has('a') || keys.has('arrowleft')) right -= 1;
  fwd -= possessInput.y;
  right += possessInput.x;
  const mag = Math.hypot(fwd, right);
  if (mag < 0.08) return;
  const nf = fwd / mag, nr = right / mag;
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const dx = fx * nf + rx * nr, dz = fz * nf + rz * nr;
  b.ai.faceYaw = Math.atan2(dx, dz);
  // Reuse the AI hop pose/settle cycle so the waddle and lean stay identical.
  if (b.ai.hopState === 'air' && !b.airborne && b.contacts > 0) {
    b.ai.hopState = 'settle';
    b.ai.hopWait = 0.10;
  }
  if (b.ai.hopState === 'settle') {
    b.ai.hopWait -= dt;
    if (b.ai.hopWait > 0) return;
    b.ai.hopState = null;
  }
  if (b.airborne || b.contacts === 0 || possessHopCd > 0) return;
  if ((b.rMat[4] || 0) < 0.5) return;
  const speed = 2.15;
  hopBear(b, 2.9, dx * speed, dz * speed, true);
  b.ai.hopState = 'air';
  b.ai.hopWait = 0;
  b.airborne = true;
  b.antic = 0;
  possessHopCd = 0.48;
}
function updatePossessionCamera(){
  if (!possessedBear) return;
  cam.goal.set(possessedBear.cx, clamp(possessedBear.cy + 0.55, 0.6, 1.4), possessedBear.cz);
}
function stickVector(e){
  const r = possessStickEl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let x = (e.clientX - cx) / (r.width * 0.42);
  let y = (e.clientY - cy) / (r.height * 0.42);
  const m = Math.hypot(x, y);
  if (m > 1) { x /= m; y /= m; }
  possessInput.x = x;
  possessInput.y = y;
  if (possessKnobEl) {
    possessKnobEl.style.transform = `translate(${x * r.width * 0.30}px,${y * r.height * 0.30}px)`;
  }
}
let stickPointer = null;
possessStickEl?.addEventListener('pointerdown', (e) => {
  stickPointer = e.pointerId;
  try { possessStickEl.setPointerCapture(e.pointerId); } catch (err) {}
  stickVector(e);
  e.preventDefault();
});
possessStickEl?.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickPointer) stickVector(e);
});
const releaseStick = (e) => {
  if (e.pointerId !== stickPointer) return;
  stickPointer = null;
  possessInput.x = 0;
  possessInput.y = 0;
  if (possessKnobEl) possessKnobEl.style.transform = '';
};
possessStickEl?.addEventListener('pointerup', releaseStick);
possessStickEl?.addEventListener('pointercancel', releaseStick);
possessBtnEl?.addEventListener('click', togglePossession);
possessExitEl?.addEventListener('click', exitPossession);
function focusBuddy(b){
  if (!b || !b.active) return;
  selectBear(b);
  cam.goal.set(b.cx, Math.min(1.15, Math.max(0.45, b.cy + 0.2)), b.cz);
  cam.target.copy(cam.goal);
  const [zmin, zmax] = camZoomLimits();
  cam.dist = clamp(Math.min(cam.dist, 9), zmin, zmax);
  cam.moved = true;
  if (resetViewBtn) resetViewBtn.hidden = false;
  applyCamera(0);
  if (hintEl){
    hintEl.textContent = `${b.name || 'Your bear'} is right here`;
    showCamHint();
  }
}

function focusMsn(){
  if (!msnPrototype) return false;
  const s = msnPrototype.state();
  if (!s.visible || !s.ready) return false;
  const info = msnPrototype.focusInfo();
  msnPrototype.select(true);
  cam.goal.set(info.x, info.y, info.z);
  cam.target.copy(cam.goal);
  const [zmin, zmax] = camZoomLimits();
  cam.dist = clamp(Math.min(cam.dist, info.dist), zmin, zmax);
  cam.moved = true;
  if (resetViewBtn) resetViewBtn.hidden = false;
  applyCamera(0);
  if (hintEl){
    hintEl.textContent = 'MSN Buddy — drag to turn · Shift-drag to move';
    showCamHint();
  }
  return true;
}
function syncAeroUI(force){
  if (!isMeadow()) return;
  const active = actorView.active();
  const roster = buildRosterRows(active, rosterOptions());
  const list = active.filter(isRosterActor);
  const sig = buddySignature(roster);
  if (force || sig !== buddySig) refreshBuddyList(roster, list);
  updateBuddyStatuses(force);
  for (const b of list) syncBuddyHealth(b);
  if (!sky) return;
  if (skyClockEl) skyClockEl.textContent = formatClock(sky.hours);
  const per = timePeriod(sky.hours);
  if (skyPeriodEl) skyPeriodEl.textContent = per;
  if (skyIconEl) skyIconEl.textContent = (per === 'night') ? '☾' : (per === 'dusk' ? '☀' : (per === 'dawn' ? '◐' : '☀'));
  if (meadowMoodEl) meadowMoodEl.textContent = `${per} · ${list.length} buddies`;
  if (timeSliderEl && document.activeElement !== timeSliderEl){
    timeSliderEl.value = String(sky.hours);
  }
  if (timeAutoEl){
    timeAutoEl.classList.toggle('on', sky.auto);
    timeAutoEl.setAttribute('aria-pressed', String(sky.auto));
  }
  for (const btn of skyLookButtons){
    const on = sky.look === btn.dataset.look;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  if (timeSpeedEl){
    timeSpeedEl.textContent = `${sky.speed}×`;
  }
  if (field && field.wind){
    const ws = field.wind.strength;
    if (windStrengthEl && document.activeElement !== windStrengthEl) windStrengthEl.value = String(ws);
    if (windValueEl) windValueEl.textContent = ws.toFixed(1);
  }
  if (field && field.natureControls) natureState = normalizeNature(field.natureControls);
  syncNatureUI();
}
(function initAeroCollapse(){
  const btn = document.getElementById('aeroMin');
  const hud = document.getElementById('aeroHud');
  if (!btn || !hud) return;
  btn.addEventListener('click', ()=>{
    hud.classList.toggle('min');
    const collapsed = hud.classList.contains('min');
    btn.textContent = collapsed ? '+' : '–';
    btn.title = collapsed ? 'Expand panel' : 'Collapse panel';
    // Phones show one sheet at a time: expanding the meadow stack closes the
    // bear controls so the two do not cover the whole viewport.
    if (!collapsed && innerWidth <= 900){
      const card = document.getElementById('card');
      const cardToggle = document.getElementById('cardToggle');
      if (card){
        card.classList.add('mobileCollapsed');
        cardToggle?.setAttribute('aria-expanded', 'false');
      }
    }
  });
  // Phones start with the meadow stack collapsed so the game view is visible;
  // the same + button expands it.
  if (innerWidth <= 900 && !hud.classList.contains('min')){
    hud.classList.add('min');
    btn.textContent = '+';
    btn.title = 'Expand panel';
  }
})();
(function initMobileCard(){
  const card = document.getElementById('card');
  const toggle = document.getElementById('cardToggle');
  if (!card || !toggle) return;
  const setCollapsed = (collapsed) => {
    card.classList.toggle('mobileCollapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    // The transient camera hint is anchored above the collapsed sheet; dismiss
    // it rather than let it land on the expanded controls.
    const hint = document.getElementById('camHint');
    if (hint) hint.classList.remove('show');
  };
  toggle.addEventListener('click', ()=>{
    const collapsed = !card.classList.contains('mobileCollapsed');
    setCollapsed(collapsed);
    // One sheet at a time on phones.
    if (!collapsed && innerWidth <= 900){
      const aero = document.getElementById('aeroHud');
      const aeroMin = document.getElementById('aeroMin');
      if (aero && !aero.classList.contains('min')){
        aero.classList.add('min');
        if (aeroMin){ aeroMin.textContent = '+'; aeroMin.title = 'Expand panel'; }
      }
    }
  });
  if (innerWidth <= 900) setCollapsed(true);
  addEventListener('resize', ()=>{
    if (innerWidth > 900) setCollapsed(false);
  });
})();
function refreshAeroSoon(){ setTimeout(()=>{ if (isMeadow()) syncAeroUI(true); }, 0); }

document.getElementById('mapMeadow')?.addEventListener('click', ()=>requestMapSwitch('field'));
document.getElementById('mapStudio')?.addEventListener('click', ()=>requestMapSwitch('studio'));
if (timeSliderEl) timeSliderEl.addEventListener('input', ()=>{
  if (!sky) return;
  sky.setAuto(false);
  sky.setTime(+timeSliderEl.value);
  if (worlds.field){ worlds.field.time = sky.hours; worlds.field.auto = false; }
  try { localStorage.removeItem(SKY_LOOK_KEY); } catch (err) {}
  syncAeroUI(true);
});
for (const btn of skyLookButtons){
  btn.addEventListener('click', ()=>{
    if (!sky) return;
    const name = sky.setLook(btn.dataset.look);
    if (!name) return;
    if (worlds.field){ worlds.field.time = sky.hours; worlds.field.auto = false; }
    try { localStorage.setItem(SKY_LOOK_KEY, name); } catch (err) {}
    try { persistWorld('field'); } catch (err) {}
    syncAeroUI(true);
  });
}
if (timeAutoEl) timeAutoEl.addEventListener('click', ()=>{
  if (!sky) return;
  sky.setAuto(!sky.auto);
  worlds.field.auto = sky.auto;
  worlds.field.time = sky.hours;
  try { if (sky.auto) localStorage.removeItem(SKY_LOOK_KEY); } catch (err) {}
  syncAeroUI(true);
  try { persistWorld('field'); } catch (err) {}
});
if (timeSpeedEl) timeSpeedEl.addEventListener('click', ()=>{
  if (!sky) return;
  const next = sky.speed >= 4 ? 1 : sky.speed * 2;
  sky.setSpeed(next);
  worlds.field.speed = sky.speed;
  syncAeroUI(true);
  try { persistWorld('field'); } catch (err) {}
});
if (windStrengthEl) windStrengthEl.addEventListener('input', ()=>{
  if (!field || !field.wind) return;
  field.wind.setStrength(+windStrengthEl.value);
  graphicsState.wind = +windStrengthEl.value;
  markSettingsCustom();
  saveSettings();
  syncAeroUI(false);
});
function syncEffectsUI(){
  if (effectsLevelEl) effectsLevelEl.value = effectsMode;
  if (settingsEffectsEl) settingsEffectsEl.value = effectsMode;
  const disabled = !effects || (effects.active === 'off');
  if (effectsDofEl){
    effectsDofEl.value = effectsDof ? 'on' : 'off';
    effectsDofEl.disabled = disabled;
  }
  if (settingsDofEl){
    settingsDofEl.value = effectsDof ? 'on' : 'off';
    settingsDofEl.disabled = disabled;
  }
  if (effects){
    const state = effects.state();
    const note = state.active !== state.requested
      ? `Active: ${state.active} (quality fallback)`
      : '';
    if (effectsLevelEl) effectsLevelEl.title = note;
    if (settingsEffectsEl) settingsEffectsEl.title = note;
  }
  syncSettingsUI();
}

function syncSettingsUI(){
  if (settingsProfileNote){
    const label = settingsProfile === 'custom'
      ? 'Custom settings'
      : `Preset: ${PROFILES[settingsProfile] ? PROFILES[settingsProfile].label : 'Auto'}`;
    settingsProfileNote.textContent = label;
  }
  for (const btn of settingsProfileBtns){
    const on = btn.dataset.profile === settingsProfile;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  if (settingsAdaptiveEl) settingsAdaptiveEl.checked = quality.adaptive;
  if (settingsAdaptiveVal) settingsAdaptiveVal.textContent = quality.adaptive ? 'On' : 'Off';
  if (settingsToonEl) settingsToonEl.checked = toonEnabled;
  if (settingsToonVal) settingsToonVal.textContent = toonEnabled ? 'On' : 'Off';
  if (settingsScaleEl && document.activeElement !== settingsScaleEl){
    settingsScaleEl.value = String(quality.renderScale);
  }
  if (settingsScaleVal) settingsScaleVal.textContent = `${Math.round(quality.renderScale * 100)}%`;
  if (settingsTierEl){
    const q = LEVELS[quality.level];
    settingsTierEl.textContent = `Tier ${quality.level + 1} · ${renderer.getPixelRatio().toFixed(2)}×`;
    const shadowSize = graphicsState.shadows < 0 ? q.shadowMap : graphicsState.shadows;
    if (settingsShadowEl) settingsShadowEl.textContent = shadowSize
      ? `Directional · ${shadowSize}px`
      : 'Blob fallback';
  }
  syncNatureUI();
  if (graphicsPanel) graphicsPanel.sync('⚠ Higher sample counts, shadow sizes and ray resolution increase GPU cost. AO and god rays require Full effects and tier 1 or 2; god rays also require directional shadows. Existing time controls remain in Meadow.');
  const hourEl = document.getElementById('settingsHour');
  if (sky && hourEl && document.activeElement !== hourEl) hourEl.value = sky.hours;
  if (sky) {
    document.getElementById('settingsHourVal').textContent = formatClock(sky.hours);
    document.getElementById('settingsTimeAuto').checked = sky.auto;
  }
}

function applyGraphics(){
  if (effects) effects.setControls(graphicsState);
  if (field) {
    field.setGrassControls({ lodNear: graphicsState.grassNear, lodFar: graphicsState.grassFar });
    field.trees.setControls({ lodNear: graphicsState.leafNear, lodFar: graphicsState.leafFar, farKeep: graphicsState.leafKeep });
    field.trees.setShadows(graphicsState.foliageShadows);
    field.bushes.setShadows(graphicsState.foliageShadows);
    field.wind.setStrength(graphicsState.wind);
  }
  applyRealShadows();
}
function changeGraphics(values){
  graphicsState = normalizeGraphics({ ...graphicsState, ...values });
  if (values.tier !== undefined && graphicsState.tier >= 0) {
    quality.level = graphicsState.tier;
    quality.cap = quality.level;
    quality.adaptive = false;
    applyQuality();
  }
  markSettingsCustom();
  applyGraphics();
  saveSettings();
  syncSettingsUI();
  return settingsSummary();
}
graphicsPanel = createGraphicsPanel(document.getElementById('graphicsAdvanced'), {
  get: () => graphicsState,
  change: changeGraphics,
  reset: id => {
    const group = GRAPHICS_GROUPS.find(g => g[0] === id);
    changeGraphics(Object.fromEntries(group[2].map(row => [row[0], row[3]])));
  },
});
syncSettingsUI();

document.getElementById('settingsHour').addEventListener('input', e => {
  setMeadowTime(+e.target.value);
  syncSettingsUI();
});
document.getElementById('settingsTimeAuto').addEventListener('change', e => {
  if (sky && sky.auto !== e.target.checked) toggleMeadowAuto();
});
for (const button of document.querySelectorAll('[data-settings-reset]')) {
  button.addEventListener('click', () => {
    const section = button.dataset.settingsReset;
    if (section === 'display') {
      quality.level = 0; quality.cap = 0; quality.adaptive = true; quality.renderScale = 1;
      changeGraphics({ tier: -1, shadows: -1, foliageShadows: false });
      applyQuality();
    } else if (section === 'effects') {
      effectsMode = DEFAULT_EFFECTS; effectsDof = false; setToonMode(false);
      changeGraphics(Object.fromEntries(GRAPHICS_GROUPS.find(g => g[0] === 'effects')[2].map(row => [row[0], row[3]])));
      applyEffectsUI();
    } else {
      natureState = { ...DEFAULT_NATURE };
      if (field) field.setNature(natureState);
      changeGraphics(Object.fromEntries(GRAPHICS_GROUPS.find(g => g[0] === 'foliage')[2].map(row => [row[0], row[3]])));
    }
    saveSettings(); syncSettingsUI();
  });
}

function setEffectsModeFromUI(mode){
  effectsMode = ['off', 'soft', 'full'].includes(mode) ? mode : 'soft';
  markSettingsCustom();
  saveSettings();
  applyEffectsUI();
}

function setDofFromUI(on){
  effectsDof = !!on;
  markSettingsCustom();
  saveSettings();
  if (effects) effects.setDof(effectsDof);
  syncEffectsUI();
}

function applyEffectsUI(){
  if (effects){
    effects.setMode(effectsMode);
    effects.setQuality(quality.level);
    effects.setDof(effectsDof);
  }
  syncEffectsUI();
}
if (effectsLevelEl) {
  effectsLevelEl.value = effectsMode;
  effectsLevelEl.addEventListener('change', () => setEffectsModeFromUI(effectsLevelEl.value));
}
if (settingsEffectsEl) {
  settingsEffectsEl.addEventListener('change', () => setEffectsModeFromUI(settingsEffectsEl.value));
}
if (effectsDofEl) {
  effectsDofEl.value = effectsDof ? 'on' : 'off';
  effectsDofEl.addEventListener('change', () => setDofFromUI(effectsDofEl.value === 'on'));
}
if (settingsDofEl) {
  settingsDofEl.addEventListener('change', () => setDofFromUI(settingsDofEl.value === 'on'));
}
if (settingsToonEl) {
  settingsToonEl.addEventListener('change', () => {
    markSettingsCustom();
    setToonMode(settingsToonEl.checked);
  });
}
for (const btn of settingsProfileBtns) {
  btn.addEventListener('click', () => applyProfile(btn.dataset.profile));
}
if (settingsAdaptiveEl) {
  settingsAdaptiveEl.addEventListener('change', () => {
    quality.adaptive = settingsAdaptiveEl.checked;
    qualityCooldown = 0;
    markSettingsCustom();
    saveSettings();
    syncSettingsUI();
  });
}
if (settingsScaleEl) {
  settingsScaleEl.addEventListener('input', () => {
    const value = Number(settingsScaleEl.value);
    if (settingsScaleVal) settingsScaleVal.textContent = `${Math.round(value * 100)}%`;
    markSettingsCustom();
    applyRenderScale(value);
  });
}
if (settingsReset) {
  settingsReset.addEventListener('click', () => {
    setToonMode(false);
    applyProfile('auto');
  });
}

/* --------------------------- performance overlay -------------------------- */
const perfEl = document.getElementById('perf');
const perfBtn = document.getElementById('perfBtn');
const pfEl = {
  fps: document.getElementById('pfFps'),
  frame: document.getElementById('pfFrame'),
  phys: document.getElementById('pfPhys'),
  surf: document.getElementById('pfSurf'),
  builds: document.getElementById('pfBuilds'),
  bears: document.getElementById('pfBears'),
  tier: document.getElementById('pfTier'),
  tierNote: document.getElementById('pfTierNote'),
  draw: document.getElementById('pfDraw'),
  tris: document.getElementById('pfTris'),
  graph: document.getElementById('pfGraph'),
};
const perfLive = { physMs:0, surfMs:0, builds:0, calls:0, tris:0 };
const frameHist = new Float32Array(72);
let frameHistI = 0, frameHistN = 0;
let perfOnFlag = false;

function placePerf(){
  const card = document.getElementById('card');
  perfEl.classList.remove('pos-desktop','pos-mobile','pos-short','compact');
  perfEl.style.top = ''; perfEl.style.left = ''; perfEl.style.right = ''; perfEl.style.bottom = '';
  if (innerHeight <= 560){
    perfEl.classList.add('pos-short','compact');
  } else if (innerWidth <= 900){
    perfEl.classList.add('pos-mobile');
    perfEl.style.bottom = Math.round(card.getBoundingClientRect().height + 22) + 'px';
  } else {
    perfEl.classList.add('pos-desktop');
  }
}
function setPerf(on){
  perfOnFlag = !!on;
  perfEl.classList.toggle('on', perfOnFlag);
  perfEl.setAttribute('aria-hidden', String(!perfOnFlag));
  perfBtn.setAttribute('aria-pressed', String(perfOnFlag));
  perfBtn.classList.toggle('on', perfOnFlag);
  if (perfOnFlag){ placePerf(); updatePerfPanel(); }
}
function drawPerfGraph(){
  const c = pfEl.graph;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height, maxMs = 50;
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = 'rgba(25,24,23,.12)'; ctx.lineWidth = 1; ctx.setLineDash([2,3]);
  const y16 = H - (16.7/maxMs)*H;
  ctx.beginPath(); ctx.moveTo(0,y16); ctx.lineTo(W,y16); ctx.stroke();
  ctx.setLineDash([]);
  const n = frameHistN, N = frameHist.length;
  if (n < 2) return;
  const xOf = i => (i/(n-1))*W;
  const yOf = v => H - (Math.min(v,maxMs)/maxMs)*H;
  ctx.beginPath();
  for (let i=0;i<n;i++){
    const idx = (frameHistI - n + i + N*2) % N;
    const x = xOf(i), y = yOf(frameHist[idx]);
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }
  ctx.strokeStyle = fpsEma < 50 ? 'rgba(198,45,85,.8)' : 'rgba(25,24,23,.55)';
  ctx.lineWidth = 1.25; ctx.stroke();
  ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
  ctx.fillStyle = fpsEma < 50 ? 'rgba(198,45,85,.08)' : 'rgba(25,24,23,.05)';
  ctx.fill();
}
function updatePerfPanel(){
  pfEl.fps.textContent = String(Math.round(fpsEma));
  pfEl.frame.textContent = frameMsEma.toFixed(1);
  pfEl.phys.textContent = perfLive.physMs.toFixed(2);
  pfEl.surf.textContent = perfLive.surfMs.toFixed(1);
  pfEl.builds.textContent = perfLive.builds.toFixed(1);
  pfEl.bears.textContent = String(bears.length);
  pfEl.tier.textContent = String(quality.level + 1);
  pfEl.tierNote.textContent = renderer.getPixelRatio().toFixed(2) + '× · g' + quality.grid;
  pfEl.draw.textContent = String(perfLive.calls);
  pfEl.tris.textContent = (perfLive.tris/1000).toFixed(0) + 'k tri';
  pfEl.frame.parentElement.classList.toggle('warn', frameMsEma > 20);
  drawPerfGraph();
}
perfBtn.addEventListener('click', ()=>setPerf(!perfOnFlag));
addEventListener('keydown', (e)=>{
  if (e.key !== 'p' && e.key !== 'P') return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
  setPerf(!perfOnFlag);
});
addEventListener('resize', ()=>{ if (perfOnFlag) placePerf(); });

let bouncePulse = 0;
function pulseBounce(){ bouncePulse = 1; }

// The cannon must not spawn a bear inside a house, tree, bush, rock or another
// bear; blocked shots are skipped rather than left stuck in the obstacle.
function launcherSpotClear(x, z, r, includeBears = true){
  if (isMeadow() && field && field.colliders){
    for (const c of field.colliders){
      if (Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
    }
  }
  if (!includeBears) return true;
  for (const a of actorView.active()){
    if (Math.hypot(x - a.cx, z - a.cz) < 0.62 + r * .5) return false;
  }
  return true;
}

/* ------------------------------ spawning ---------------------------------- */
// Distance from (x,z) to the nearest active bear; used to scatter rapid drops.
function bearClearanceAt(x, z) {
  let best = Infinity;
  for (const b of actorView.active()){
    const d = Math.hypot(x - b.cx, z - b.cz);
    if (d < best) best = d;
  }
  return best;
}
// Pick a random spot in the central table area, preferring the emptiest of a
// handful of candidates. Rapid drops then spread out instead of stacking into
// one blob; if even the best candidate is too close to a bear the drop is
// refused rather than piled on top.
const MIN_DROP_GAP = 0.55;
function freeDropSpot(){
  // The meadow's TABLE is the whole field, so cap the spread: drops stay in a
  // readable central patch instead of scattering across the map.
  const rx = clamp(TABLE.hx * 0.52, 1.0, 2.0);
  const rz = clamp(TABLE.hz * 0.48, 0.8, 1.6);
  let best = { x: (Math.random() - .5) * 1.6, z: (Math.random() - .5) * 1.1 };
  let bestD = bearClearanceAt(best.x, best.z);
  for (let i = 0; i < 14; i++){
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random());
    const x = Math.cos(a) * rx * r;
    const z = Math.sin(a) * rz * r;
    const d = bearClearanceAt(x, z);
    if (d > bestD){ bestD = d; best = { x, z }; }
    if (bestD > .95) break;
  }
  return bestD >= MIN_DROP_GAP ? best : null;
}
function dropFromAbove(flavor){
  const spot = freeDropSpot();
  if (!spot) return false;
  spawn(spot.x, spot.z, 2.6, flavor, {tilt:0.22});
  return true;
}
function dropCustom(){
  const key = customKey();
  const f = customFlavor();
  const spot = freeDropSpot();
  if (!spot) return false;
  const b = spawn(spot.x, spot.z, 2.6, DEFAULT_FLAVOR, {tilt:0.22});
  if (b){
    b.flavor = -1;
    b.material = customMaterial(key);
    b.mesh.material = b.material;
    b.spriteId = f.id;
    b.sprite = blobSprite(f);
  }
}
const dropQueue = [];
function pourBears(){
  for (let i=0;i<5;i++){
    dropQueue.push({ t: i*0.13, f: Math.floor(Math.random()*FLAVORS.length), y:3.3+Math.random()*0.5 });
  }
}

/* ------------------------------- framing ---------------------------------- */
let frozen = false;   // debug: pauses idle hops, AI ticks + the quality governor

const AI_HOP_CROUCH = 0.15;
const AI_HOP_SETTLE = 0.16;
const AI_HOP_VERTICAL = 2.90;
const AI_HOP_SPEED_MIN = 0.80;
const AI_HOP_SPEED_MAX = 1.65;
const AI_HOP_MIN_UP = 0.86;
const AI_HOP_LEAN = 10 * Math.PI / 180;
const AI_WOOZY_HEALTH = 15;
const AI_WOOZY_SPEED = 0.65;
const AI_FACE_RATE_GROUND = 9.0;
const AI_FACE_RATE_AIR = 4.0;
const AI_TURN_WAIT = 0.75;

function aiRoutePoint(b) {
  const a = b.ai;
  if (!a) return null;
  const path = a.path;
  if (!path || !path.length) return a.target;
  let i = a.pathIndex | 0;
  while (i < path.length - 1) {
    const p = path[i];
    if (Math.hypot(p.x - b.cx, p.z - b.cz) > 0.42) break;
    i++;
  }
  a.pathIndex = i;
  return path[i] || a.target;
}

function updateAiLocomotion(dt) {
  if (!isMeadow() || !field || !ai || !ai.enabled || frozen) return;
  for (const b of bears) {
    const a = b.ai;
    if (!b.active || !a) continue;
    if (a.possessed) {
      a.hopState = null;
      a.hopWait = 0;
      a.turnWait = 0;
      continue;
    }
    if (b.grabs > 0 || b.inPond || a.interrupted || a.state === 'eat' || a.state === 'drink') {
      if (a.hopState === 'crouch') a.hopState = null;
      a.turnWait = 0;
      continue;
    }
    if (!a.moving) {
      a.hopState = null;
      a.hopWait = 0;
      a.turnWait = 0;
      continue;
    }
    if (a.hopState === 'air') {
      if (b.airborne || b.contacts === 0) continue;
      a.hopState = 'settle';
      a.hopWait = AI_HOP_SETTLE;
      continue;
    }
    if (a.hopState === 'settle') {
      a.hopWait -= dt;
      if (a.hopWait > 0) continue;
      a.hopState = null;
    }
    if (b.airborne || b.contacts === 0 || b.rMat[4] < AI_HOP_MIN_UP) continue;

    const p = aiRoutePoint(b);
    if (!p) { a.moving = false; continue; }
    let dx = p.x - b.cx, dz = p.z - b.cz;
    const d = Math.hypot(dx, dz);
    if (d < 0.52) {
      // Let the next 5 Hz think switch SEEK -> EAT/DRINK or finish WANDER.
      a.moving = false;
      a.faceYaw = null;
      if (a.state === 'wander') a.arrived = true;
      continue;
    }
    const wantYaw = steerAvoidance(b, Math.atan2(dx, dz),
      glassColony ? bears.concat(glassColony.actors) : bears);
    a.faceYaw = wantYaw;
    const visualYaw = yawOfQuat(b.q);
    const dyaw = Math.atan2(Math.sin(wantYaw - visualYaw),
                            Math.cos(wantYaw - visualYaw));
    if (Math.abs(dyaw) > 0.22) {
      a.turnWait = (a.turnWait || 0) + dt;
      if (a.turnWait < AI_TURN_WAIT) continue;
    } else {
      a.turnWait = 0;
    }

    if (a.hopState !== 'crouch') {
      a.hopState = 'crouch';
      a.hopWait = AI_HOP_CROUCH;
    }
    a.hopWait -= dt;
    if (a.hopWait > 0) continue;

    const speedMin = Number.isFinite(b.hopSpeedMin) ? b.hopSpeedMin : AI_HOP_SPEED_MIN;
    const speedMax = Number.isFinite(b.hopSpeedMax) ? b.hopSpeedMax : AI_HOP_SPEED_MAX;
    const speed = clamp(d / 0.55, Math.min(speedMin, speedMax), Math.max(speedMin, speedMax)) *
      (b.health < AI_WOOZY_HEALTH ? AI_WOOZY_SPEED : 1);
    const ux = Math.sin(wantYaw), uz = Math.cos(wantYaw);
    hopBear(b, AI_HOP_VERTICAL, ux * speed, uz * speed, true);
    a.hopState = 'air';
    a.hopWait = 0;
    b.airborne = true;
    b.antic = 0;
  }
}

function stepMeadowAI(dt) {
  if (!isMeadow() || !field || frozen) return;
  if (field.food) field.food.update(dt);
  if (!ai || !ai.enabled) return;
  ai.update(dt);
  stepLife(dt);
  if (glassColony) glassColony.update(dt);
  // Social conflicts queue a small shove; app.js owns body impulses.
  for (const b of bears) {
    if (!b.active || !b.ai || !b.ai.shove) continue;
    const s = b.ai.shove;
    b.ai.shove = null;
    if (b.grabs > 0 || b.inPond || b.airborne) continue;
    if (field && field.pond && field.pond.contains(b.cx, b.cz)) continue;
    if (Number.isFinite(FIELD_RADIUS) && Math.hypot(b.cx, b.cz) > FIELD_RADIUS - 1.8) continue;
    // A conflict nudge is a small horizontal impulse, not a launch. Keeping it
    // away from the pond and arena rim avoids the rare solver tunnel at a seam.
    const sx = clamp(s.x, -0.65, 0.65);
    const sz = clamp(s.z, -0.65, 0.65);
    hopBear(b, 0, sx, sz, true);
  }
  updateAiLocomotion(dt);
}

function frameTick(dt){
  stepMeadowAI(dt);
  stepGummyBehavior(dt);
  updatePossessionLocomotion(dt);
  // pointer velocity decays when the pointer stops, so a hold-then-release
  // doesn't fling the bear with stale momentum
  {
    const nowMs = performance.now();
    for (const g of grabs.values()) if (nowMs - g.lastMove > 45) g.vel.multiplyScalar(Math.exp(-14*dt));
  }
  // staggered pour
  for (let i=dropQueue.length-1;i>=0;i--){
    const d = dropQueue[i];
    d.t -= dt;
    if (d.t <= 0){
      const spot = freeDropSpot();
      if (spot) spawn(spot.x, spot.z, d.y, d.f, {tilt:0.3});
      dropQueue.splice(i,1);
    }
  }
  // idle hops + anticipation. An AI bear that is travelling or eating has its
  // own hop controller; only genuinely idle meadow bears keep the random hop.
  for (const b of bears){
    if (isGummyActor(b)) continue;
    const aiBusy = b.ai && (b.ai.moving || b.ai.state !== 'wander' ||
      b.ai.hopState === 'crouch');
    if (!frozen && b.grabs === 0 && !aiBusy){
      const speed = Math.hypot(b.vcx,b.vcy,b.vcz);
      if (b.antic > 0){
        b.antic -= dt;
        if (b.antic <= 0){
          const power = 2.2 + Math.random()*1.2;
          hopBear(b, power);
          b.hopT = HOP_MIN + Math.random()*(HOP_MAX-HOP_MIN);
          b.airborne = true;
        }
      } else {
        if (b.contacts > 0 && speed < 1.8) b.hopT -= dt;
        if (b.hopT <= 0) b.antic = 0.13;
      }
    }
    // live stretch readout: how far the grabbed point has been pulled away from
    // its rest position, measured as the strain of its link to the body
    // (neck/arm/leg length over its rest length) — 1.00× when idle
    const i = b.stretchPt, pi = b.rig.PARENT[i];
    const nowLen = Math.hypot(b.px[i]-b.px[pi], b.py[i]-b.py[pi], b.pz[i]-b.pz[pi]);
    b.stretchDev = nowLen;
    b.stretch = Math.max(1, nowLen/b.rig.PARENT_LEN[i]);
  }
  let stretchTarget = 1;
  for (const g of grabs.values()) if (g.bear.stretch > stretchTarget) stretchTarget = g.bear.stretch;
  stretchShown += (stretchTarget - stretchShown) * (1 - Math.exp(-10*dt));
  if (bouncePulse > 0) bouncePulse = Math.max(0, bouncePulse - dt*2.2);
}

/* --------------------------- surface scheduling --------------------------- */
const buildOrder = [];
const SURFACE_BUDGET_MS = 6.0;    // per-frame CPU ceiling for polygonisation
function updateSurfaces(){
  const cg = crowdGrid(bears.length);
  if (cg !== surfaceStats.crowdGrid){
    surfaceStats.crowdGrid = cg;
    for (const b of bears) b.needsBuild = true;
  }
  buildOrder.length = 0;
  for (const b of bears){
    if (!b.active || b.sleeping || studioActorHidden(b)) continue;
    if (b.grabs > 0 || b.needsBuild){ buildOrder.push(b); continue; }
    // rigid motion is handled by the mesh matrix, so only *shape* changes rebuild
    if (b.deform > 0.30*b.cell) buildOrder.push(b);
  }
  if (buildOrder.length > 1){
    buildOrder.sort((a,b)=>{
      const g = (a.grabs>0?0:1) - (b.grabs>0?0:1);
      if (g) return g;
      return b.deform - a.deform;
    });
  }
  const t0 = performance.now();
  let built = 0;
  for (let i=0;i<buildOrder.length && built<20;i++){
    buildBear(buildOrder[i]);
    built++;
    if (built >= 2 && performance.now() - t0 > SURFACE_BUDGET_MS) break;
  }
  surfaceStats.built = built;
  surfaceStats.builtMs = performance.now() - t0;
}

/* ================================ FIREWORK ================================= */
/* Rockets are launched at the pointer: the burst point is where the cursor ray
   crosses a fixed height plane, so the explosion happens exactly under the mouse.
   Hold F to spray, Shift+F fans three, the Explode button fires a volley of three. */
const BURST_Y = 1.4;
const MAX_ROCKETS = 8;
const rockets = [];
const fwRings = [];
const burstQueue = [];
let fwHeld = false, fwAutoT = 0, fwPressCd = 0, fwFlash = 0;
let fwTicks = 0, frameTicks = 0;
let camShakeT = 0;
const CAM_SHAKE_DUR = 0.45;
const _fwTarget = new THREE.Vector3();
let lastBurst = null;
const _UP = new THREE.Vector3(0,1,0);
let lastPX = 0, lastPY = 0, lastPValid = false;

const PALETTES = [
  { p:[0.98,0.24,0.26], s:[1.00,0.70,0.16], a:[1.00,0.94,0.82], ring:[0.92,0.34,0.36] }, // coral + gold
  { p:[0.80,0.14,0.58], s:[1.00,0.52,0.84], a:[1.00,0.92,0.66], ring:[0.82,0.28,0.62] }, // berry
  { p:[0.05,0.52,0.88], s:[0.12,0.84,0.78], a:[0.86,0.98,1.00], ring:[0.20,0.55,0.90] }, // ocean
  { p:[0.34,0.78,0.10], s:[0.94,0.93,0.34], a:[1.00,1.00,1.00], ring:[0.50,0.78,0.28] }, // lime
  { p:[0.45,0.24,0.92], s:[0.96,0.44,0.82], a:[1.00,0.86,0.46], ring:[0.58,0.38,0.92] }, // violet
  { p:[1.00,0.62,0.08], s:[1.00,0.88,0.40], a:[0.96,0.26,0.14], ring:[1.00,0.66,0.22] }, // gold
];

/* ----- particle pool: soft round points, normal blending (white table) ----- */
const PMAX = 2000;
const pPos = new Float32Array(PMAX*3), pVel = new Float32Array(PMAX*3), pCol = new Float32Array(PMAX*3);
const pSize = new Float32Array(PMAX), pAlpha = new Float32Array(PMAX), pLife = new Float32Array(PMAX), pMaxLife = new Float32Array(PMAX), pGrav = new Float32Array(PMAX);
let pCount = 0;
const pGeo = new THREE.BufferGeometry();
const pAttrPos = new THREE.BufferAttribute(new Float32Array(PMAX*3), 3).setUsage(THREE.DynamicDrawUsage);
const pAttrCol = new THREE.BufferAttribute(new Float32Array(PMAX*3), 3).setUsage(THREE.DynamicDrawUsage);
const pAttrSize = new THREE.BufferAttribute(new Float32Array(PMAX), 1).setUsage(THREE.DynamicDrawUsage);
const pAttrAlpha = new THREE.BufferAttribute(new Float32Array(PMAX), 1).setUsage(THREE.DynamicDrawUsage);
pGeo.setAttribute('position', pAttrPos);
pGeo.setAttribute('color', pAttrCol);
pGeo.setAttribute('size', pAttrSize);
pGeo.setAttribute('alpha', pAttrAlpha);
pGeo.setDrawRange(0, 0);
const pMat = new THREE.ShaderMaterial({
  vertexShader: `
    attribute float size; attribute float alpha; attribute vec3 color;
    varying vec3 vC; varying float vA;
    void main(){
      vC = color; vA = alpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * (300.0 / max(0.001, -mv.z));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main(){
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.0, r);
      gl_FragColor = vec4(vC, a * vA);
    }`,
  transparent: true, depthWrite: false,
});
const sparks = new THREE.Points(pGeo, pMat);
sparks.frustumCulled = false;
scene.add(sparks);

/* ----- rocket model ----- */
function makeRocketModel(){
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color:0xcf3f52, roughness:0.42, metalness:0.15 });
  const trimMat = new THREE.MeshStandardMaterial({ color:0xffc24a, roughness:0.32, metalness:0.35 });
  const paperMat = new THREE.MeshStandardMaterial({ color:0xf6e9d4, roughness:0.72 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.24, 12), bodyMat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 12), paperMat);
  band.position.y = 0.03;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.125, 12), trimMat);
  nose.position.y = 0.185;
  g.add(body, band, nose);
  for (let k=0;k<3;k++){
    const a = k*Math.PI*2/3;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.085, 0.072), trimMat);
    fin.position.set(Math.sin(a)*0.058, -0.105, Math.cos(a)*0.058);
    fin.rotation.y = a;
    g.add(fin);
  }
  const exhaust = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 10, 8),
    new THREE.MeshBasicMaterial({ color:0xffa63a, toneMapped:false })
  );
  exhaust.position.y = -0.155;
  g.add(exhaust);
  g.scale.setScalar(0.9);
  g.visible = false;
  scene.add(g);
  return g;
}
const rocketPool = [];
for (let i=0;i<MAX_ROCKETS;i++) rocketPool.push(makeRocketModel());
const fwLight = new THREE.PointLight(0xffb070, 0, 7.5, 2);
fwLight.position.set(0, 2, 0);
scene.add(fwLight);

/* ----- sparks ----- */
function spawnSpark(x,y,z, vx,vy,vz, r,g,b, size, life, grav){
  if (pCount >= PMAX) return;
  const i = pCount++;
  pPos[i*3]=x; pPos[i*3+1]=y; pPos[i*3+2]=z;
  pVel[i*3]=vx; pVel[i*3+1]=vy; pVel[i*3+2]=vz;
  pCol[i*3]=r; pCol[i*3+1]=g; pCol[i*3+2]=b;
  pSize[i]=size; pLife[i]=life; pMaxLife[i]=life; pGrav[i]=grav; pAlpha[i]=1;
}
function updateSparks(dt){
  let i = 0;
  while (i < pCount){
    pLife[i] -= dt;
    if (pLife[i] <= 0){
      pCount--;
      if (i !== pCount){
        for (let c=0;c<3;c++){
          pPos[i*3+c]=pPos[pCount*3+c]; pVel[i*3+c]=pVel[pCount*3+c]; pCol[i*3+c]=pCol[pCount*3+c];
        }
        pSize[i]=pSize[pCount]; pLife[i]=pLife[pCount]; pMaxLife[i]=pMaxLife[pCount];
        pGrav[i]=pGrav[pCount]; pAlpha[i]=pAlpha[pCount];
      }
      continue;
    }
    const drag = Math.exp(-0.85*dt);
    pVel[i*3] *= drag; pVel[i*3+2] *= drag;
    pVel[i*3+1] = pVel[i*3+1]*drag + pGrav[i]*dt;
    pPos[i*3] += pVel[i*3]*dt;
    pPos[i*3+1] += pVel[i*3+1]*dt;
    pPos[i*3+2] += pVel[i*3+2]*dt;
    if (pPos[i*3+1] < 0.01){
      pPos[i*3+1] = 0.01;
      pVel[i*3+1] *= -0.18;
      pVel[i*3] *= 0.5; pVel[i*3+2] *= 0.5;
      pLife[i] = Math.min(pLife[i], 0.12);
    }
    const t = pLife[i] / pMaxLife[i];
    pAlpha[i] = t*t;
    i++;
  }
  const ap = pAttrPos.array, ac = pAttrCol.array, as = pAttrSize.array, aa = pAttrAlpha.array;
  for (let k=0;k<pCount;k++){
    const t = pLife[k] / pMaxLife[k];
    ap[k*3]=pPos[k*3]; ap[k*3+1]=pPos[k*3+1]; ap[k*3+2]=pPos[k*3+2];
    ac[k*3]=pCol[k*3]; ac[k*3+1]=pCol[k*3+1]; ac[k*3+2]=pCol[k*3+2];
    as[k]=pSize[k] * (0.5 + 0.5*t);
    aa[k]=pAlpha[k];
  }
  pAttrPos.needsUpdate = pAttrCol.needsUpdate = pAttrSize.needsUpdate = pAttrAlpha.needsUpdate = true;
  pGeo.setDrawRange(0, pCount);
}

/* ----- targeting: exactly under the cursor at burst height ----- */
function fireworkTarget(out, usePointer){
  if (usePointer && lastPValid){
    const rect = canvas.getBoundingClientRect();
    _rc.setFromCamera({ x: ((lastPX-rect.left)/rect.width)*2-1, y: -((lastPY-rect.top)/rect.height)*2+1 }, camera);
    const o = _rc.ray.origin, d = _rc.ray.direction;
    if (Math.abs(d.y) > 1e-4){
      const t = (BURST_Y - o.y) / d.y;
      if (t > 0.1){
        out.set(clamp(o.x + d.x*t, -14, 14), BURST_Y, clamp(o.z + d.z*t, -14, 14));
        return out;
      }
    }
  }
  let cx = 0, cz = 0, n = 0;
  for (const b of bears){ cx += b.cx; cz += b.cz; n++; }
  out.set(n ? cx/n : 0, BURST_Y, n ? cz/n : 0);
  return out;
}

function mixc(a, b, t){
  return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t];
}
function applyBlastImpulse(bx, by, bz, radius, power){
  if (!PHYS) return;
  const axis = new THREE.Vector3(), rel = new THREE.Vector3();
  for (const b of bears){
    if (!b.handles) continue;
    const dx = b.cx - bx, dy = b.cy - by, dz = b.cz - bz;
    const d = Math.hypot(dx, dy, dz) || 0.001;
    if (d > radius) continue;
    const fall = clamp(1 - d/radius, 0.15, 1);
    const ux = dx/d, uy = dy/d, uz = dz/d;
    const mag = power * (0.45 + 0.55*fall);
    axis.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize();
    const spin = 2.2 + Math.random()*4.4;
    for (let i=0;i<b.np;i++){
      rel.set(b.px[i]-b.cx, b.py[i]-b.cy, b.pz[i]-b.cz);
      const sx = (axis.y*rel.z - axis.z*rel.y)*spin;
      const sy = (axis.z*rel.x - axis.x*rel.z)*spin;
      const sz = (axis.x*rel.y - axis.y*rel.x)*spin;
      const dvx = ux*mag + sx + (Math.random()-0.5)*0.7;
      const dvy = Math.max(1.0, uy*mag)*0.6 + 4.2*fall + Math.random()*1.8 + sy*0.3;
      const dvz = uz*mag + sz + (Math.random()-0.5)*0.7;
      _physImp[i*3]   = dvx * b.rig.MASS[i];
      _physImp[i*3+1] = dvy * b.rig.MASS[i];
      _physImp[i*3+2] = dvz * b.rig.MASS[i];
      b.vx[i]+=dvx; b.vy[i]+=dvy; b.vz[i]+=dvz;
    }
    PHYS.applyImpulses(b.handles, _physImp, b.np);
    b.airborne = true;
    b.awake = true;
    b.hopT = Math.max(b.hopT, 2.4);
  }
  if (glassColony) glassColony.blastImpulse(bx, by, bz, radius, power);
}

function burstAt(x, y, z, pal, shape, small){
  lastBurst = { x, y, z };
  const k = small ? 0.55 : 1;
  // core flash
  for (let n=0;n<(small?6:12);n++)
    spawnSpark(x, y, z, (Math.random()-0.5)*1.6*k, (Math.random()-0.5)*1.6*k, (Math.random()-0.5)*1.6*k,
               pal.a[0], pal.a[1], pal.a[2], (0.30 + Math.random()*0.22)*k, 0.2 + Math.random()*0.12, 0);
  // inner shell (primary → accent)
  const inner = small ? 26 : 74;
  for (let n=0;n<inner;n++){
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    const sp = (1.5 + Math.random()*2.2) * (small?0.85:1);
    const c = mixc(pal.p, pal.a, Math.random()*0.45);
    spawnSpark(x, y, z,
      Math.sin(ph)*Math.cos(th)*sp, Math.cos(ph)*sp*0.82 + 1.1, Math.sin(ph)*Math.sin(th)*sp,
      c[0], c[1], c[2], (0.09 + Math.random()*0.12)*k, 0.55 + Math.random()*0.55, -3.1);
  }
  // outer shell (secondary → primary)
  const outer = small ? 20 : 56;
  for (let n=0;n<outer;n++){
    const th = Math.random()*Math.PI*2, ph = Math.acos(2*Math.random()-1);
    const sp = (3.2 + Math.random()*3.2) * (small?0.85:1);
    const c = mixc(pal.s, pal.p, Math.random()*0.55);
    spawnSpark(x, y, z,
      Math.sin(ph)*Math.cos(th)*sp, Math.cos(ph)*sp*0.85 + 1.4, Math.sin(ph)*Math.sin(th)*sp,
      c[0], c[1], c[2], (0.07 + Math.random()*0.09)*k, 0.7 + Math.random()*0.7, -3.6);
  }
  // flat ring shell (the "peony-ring" look)
  if (shape !== 2 || small){
    const nx = Math.random()-0.5, ny = Math.random()-0.5, nz = Math.random()-0.5;
    const ax = new THREE.Vector3(nx, ny, nz).normalize();
    const u = new THREE.Vector3().crossVectors(ax, Math.abs(ax.y) > 0.9 ? new THREE.Vector3(1,0,0) : _UP).normalize();
    const v = new THREE.Vector3().crossVectors(ax, u).normalize();
    const ringN = small ? 16 : 40;
    for (let n=0;n<ringN;n++){
      const a = (n/ringN)*Math.PI*2 + Math.random()*0.05;
      const sp = (4.2 + Math.random()*1.8) * (small?0.8:1);
      spawnSpark(x, y, z,
        (u.x*Math.cos(a) + v.x*Math.sin(a))*sp,
        (u.y*Math.cos(a) + v.y*Math.sin(a))*sp*0.9 + 0.8,
        (u.z*Math.cos(a) + v.z*Math.sin(a))*sp,
        pal.p[0], pal.p[1], pal.p[2], (0.085 + Math.random()*0.055)*k, 0.75 + Math.random()*0.4, -2.6);
    }
  }
  // slow glitter
  const glitter = small ? 10 : 30;
  for (let n=0;n<glitter;n++){
    const th = Math.random()*Math.PI*2, sp = 0.4 + Math.random()*1.5;
    spawnSpark(x, y, z, Math.cos(th)*sp, 1.3 + Math.random()*1.9, Math.sin(th)*sp,
               pal.a[0], pal.a[1], pal.a[2], 0.055 + Math.random()*0.06, 1.4 + Math.random()*1.2, -0.55);
  }
  // smoke haze
  if (!small){
    for (let n=0;n<14;n++){
      const th = Math.random()*Math.PI*2, sp = 0.2 + Math.random()*0.9;
      spawnSpark(x, y, z, Math.cos(th)*sp, (Math.random()-0.25)*0.5, Math.sin(th)*sp,
                 0.63, 0.585, 0.55, 0.30 + Math.random()*0.35, 1.3 + Math.random()*0.9, 0.12);
    }
  }
  applyBlastImpulse(x, y, z, small ? 3.0 : 4.8, small ? 3.6 : 7.6);
  fwRings.push({ x, z, t:0, dur: small ? 0.8 : 1.1, col: pal.ring });
  fwFlash = small ? 0.35 : 0.62;
  fwLight.position.set(x, y, z);
  fwLight.color.setRGB(pal.p[0], pal.p[1], pal.p[2]);
  camShakeT = CAM_SHAKE_DUR * (small ? 0.55 : 1);
}

function launchFirework(usePointer, spreadX, spreadZ){
  if (rockets.length >= MAX_ROCKETS) return false;
  let model = null;
  for (const m of rocketPool) if (!m.visible){ model = m; break; }
  if (!model) return false;
  fireworkTarget(_fwTarget, usePointer);
  const tx = _fwTarget.x + (spreadX || 0);
  const tz = _fwTarget.z + (spreadZ || 0);
  const dx = tx - camera.position.x, dz = tz - camera.position.z;
  const len = Math.hypot(dx, dz) || 1;
  const sx = tx - dx/len*1.5, sz = tz - dz/len*1.5;
  const pal = PALETTES[(Math.random()*PALETTES.length)|0];
  rockets.push({
    model, pal, shape: (Math.random()*3)|0,
    sx, sz, x:tx, z:tz, t:0, dur: 0.48 + Math.random()*0.2,
    lx:sx, ly:0.08, lz:sz,
  });
  model.visible = true;
  model.position.set(sx, 0.08, sz);
  model.quaternion.identity();
  hideCamHint();
  return true;
}

function updateFirework(dt){
  fwTicks++;
  if (fwPressCd > 0) fwPressCd -= dt;
  if (fwHeld){
    fwAutoT -= dt;
    if (fwAutoT <= 0){
      fwAutoT = 0.19;
      launchFirework(true, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.4);
    }
  }
  for (let i=rockets.length-1;i>=0;i--){
    const r = rockets[i];
    r.t += dt;
    const p = Math.min(1, r.t / r.dur);
    const e = p*p*(3-2*p);
    const x = r.sx + (r.x - r.sx)*e;
    const z = r.sz + (r.z - r.sz)*e;
    const y = 0.08 + (BURST_Y - 0.08)*Math.pow(p, 0.8) + Math.sin(p*Math.PI)*0.12;
    r.model.position.set(x, y, z);
    const dxm = x - r.lx, dym = y - r.ly, dzm = z - r.lz;
    _v3.set(dxm, dym, dzm);
    if (_v3.lengthSq() > 1e-10){
      _v3.normalize();
      r.model.quaternion.setFromUnitVectors(_UP, _v3);
      r.model.rotateY(r.t*13);
    }
    // exhaust trail, emitted behind the rocket
    for (let k=0;k<4;k++){
      const c = mixc(r.pal.s, r.pal.a, Math.random()*0.45);
      spawnSpark(x - dxm*0.35 + (Math.random()-0.5)*0.035,
                 y - 0.12 - dym*0.15 + (Math.random()-0.5)*0.035,
                 z - dzm*0.35 + (Math.random()-0.5)*0.035,
                 (Math.random()-0.5)*0.35, -0.25 - Math.random()*0.4, (Math.random()-0.5)*0.35,
                 c[0], c[1], c[2],
                 0.07 + Math.random()*0.06, 0.24 + Math.random()*0.3, -1.1);
    }
    r.lx = x; r.ly = y; r.lz = z;
    fwLight.position.set(x, y + 0.1, z);
    fwLight.color.setRGB(r.pal.s[0], r.pal.s[1], r.pal.s[2]);
    fwLight.intensity = 7 + Math.sin(p*42)*2.2;
    if (p >= 1){
      burstAt(r.x, BURST_Y, r.z, r.pal, r.shape, false);
      burstQueue.push({ t:0.17, x:r.x + (Math.random()-0.5)*0.8, y:BURST_Y + (Math.random()-0.5)*0.3, z:r.z + (Math.random()-0.5)*0.8, pal:r.pal, shape:r.shape });
      if (burstQueue.length > 10) burstQueue.shift();
      r.model.visible = false;
      rockets.splice(i,1);
    }
  }
  for (let i=burstQueue.length-1;i>=0;i--){
    const b = burstQueue[i];
    b.t -= dt;
    if (b.t <= 0){ burstAt(b.x, b.y, b.z, b.pal, b.shape, true); burstQueue.splice(i,1); }
  }
  for (let i=fwRings.length-1;i>=0;i--){
    fwRings[i].t += dt;
    if (fwRings[i].t >= fwRings[i].dur) fwRings.splice(i,1);
  }
  if (fwFlash > 0){
    fwFlash -= dt;
    fwLight.intensity = Math.max(0, 55 * Math.exp(-Math.max(0, 0.62 - fwFlash)*6));
    if (fwFlash <= 0) fwLight.intensity = 0;
  }
  updateSparks(dt);
}

/* ================================= LOOP =================================== */
let lastNow = performance.now();
let acc = 0;
let frameMsEma = 16.7;
let hudAcc = 0;
let qualityCooldown = 0;
let fpsEma = 60;
let stretchShown = 1;

function animate(now){
  requestAnimationFrame(animate);
  frameTicks++;
  const dtMsRaw = now - lastNow;
  lastNow = now;
  if (document.hidden) return;
  if (paused) return;
  const dtMs = Math.min(Math.max(dtMsRaw, 1), 50);
  const dt = dtMs/1000;
  frameMsEma += (dtMs - frameMsEma)*0.08;
  fpsEma += (1000/Math.max(dtMs,0.1) - fpsEma)*0.08;

  frameTick(dt);
  maybeAutosave(dt);
  updateFirework(dt);
  if (launcher) launcher.update(dt);
  if (isMeadow() && field){
    field.update(dt, bears);
    if (scene.fog) scene.fog.color.copy(sky.fogColor);
  }
  if (aiDebug) aiDebug.update(dt);
  if (giftVisuals) giftVisuals.update(dt);
  if (msnPrototype) msnPrototype.update(dt);

  const tPhys0 = performance.now();
  acc += dt;
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_STEPS){ physicsStep(FIXED_DT); acc -= FIXED_DT; steps++; }
  if (acc > FIXED_DT*MAX_STEPS) acc = 0;
  const tPhys1 = performance.now();

  updateFarewells(dt);
  updateSurfaces();
  updateMeshTransforms();
  drawShadows();
  if (!possessedBear) updateCameraKeys(dt);
  updatePossessionCamera();
  applyCamera(dt);
  if (hintTimer > 0){ hintTimer -= dt; if (hintTimer <= 0) hideCamHint(); }
  const tSurf1 = performance.now();
  perfLive.physMs += ((tPhys1-tPhys0) - perfLive.physMs)*0.08;
  perfLive.surfMs += ((tSurf1-tPhys1) - perfLive.surfMs)*0.08;
  perfLive.builds += (surfaceStats.built - perfLive.builds)*0.18;

  if (effects){
    effects.setEnabled(isMeadow());
    if (sky) effects.setTimeOfDay(sky.hours);
    updateDofFocus(dt);
  }
  const fxRendered = effects ? effects.render(dt) : false;
  if (!fxRendered){
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
  const renderStats = fxRendered && effects ? effects.stats() : {
    calls: renderer.info.render.calls,
    tris: renderer.info.render.triangles,
  };
  if (thoughtBubbles) thoughtBubbles.update(dt);
  perfLive.calls = renderStats.calls;
  perfLive.tris = renderStats.tris;

  // frame-time history for the perf sparkline
  frameHist[frameHistI] = dtMs;
  frameHistI = (frameHistI+1) % frameHist.length;
  if (frameHistN < frameHist.length) frameHistN++;

  // HUD (throttled)
  hudAcc += dtMs;
  if (hudAcc > 110){
    hudAcc = 0;
    elStretch.textContent = stretchShown.toFixed(2) + '×';
    elBounces.textContent = String(bounces);
    elBears.textContent = String(bears.filter(b => speciesOf(b).countsAsBear).length);
    elBounces.classList.toggle('hit', bouncePulse > 0.25);
    if (isMeadow()) syncAeroUI(false);
    if (perfOnFlag) updatePerfPanel();
  }

  // quality governor: react early, drop fast when the machine is loaded
  if (frozen) { /* debug: hold the current tier */ }
  else if (!quality.adaptive) qualityCooldown = 250;
  else if (qualityCooldown > 0) qualityCooldown -= dtMs;
  else if (frameMsEma > 17.5 && quality.level < LEVELS.length-1){
    quality.level = Math.min(LEVELS.length-1, quality.level + (frameMsEma > 30 ? 2 : 1));
    applyQuality(); qualityCooldown = 1600;
  }
  else if (frameMsEma < 10.0 && quality.level > quality.cap){ quality.level--; applyQuality(); qualityCooldown = 5200; }
  else qualityCooldown = 250;
}

/* ============================== WORLD / MAPS ============================== */
function setJellyGlow(on){
  const mats = [...FLAVOR_MATS, ...customMats.values()];
  for (const m of mats){
    if (!m) continue;
    if (!m.userData._baseEmissive){
      m.userData._baseEmissive = m.emissive.clone();
      m.userData._baseEI = m.emissiveIntensity;
    }
    if (on){
      m.emissive.copy(m.color).multiplyScalar(0.14);
      m.emissiveIntensity = 1;
    } else {
      m.emissive.copy(m.userData._baseEmissive);
      m.emissiveIntensity = m.userData._baseEI;
    }
  }
}

function configureMeadowShadows(){
  if (!field) return;
  const cast = (root) => {
    if (!root || !root.traverse) return;
    root.traverse(o => {
      if (o.isMesh || o.isInstancedMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
  };
  cast(field.aeroHomes && field.aeroHomes.group);
  cast(field.trees && field.trees.group);
  cast(field.bushes && field.bushes.group);
  cast(field.studioHouse && field.studioHouse.group);
  const lawn = field.group.getObjectByName('meadowLawn');
  if (lawn) lawn.receiveShadow = true;
  const bank = field.group.getObjectByName('meadowPondBank');
  if (bank) bank.receiveShadow = true;
}

function ensureMeadow(){
  if (field) return;
  sky = createSky(scene, renderer);
  sky.setVisible(false);
  field = buildField({ scene, camera, renderer, sky });
  // Prototype only: ?foliageShadows=1 lets the raymarch see canopy occlusion.
  if (new URLSearchParams(location.search).get('foliageShadows') === '1' && field){
    if (field.trees && field.trees.setShadows) field.trees.setShadows(true);
    if (field.bushes && field.bushes.setShadows) field.bushes.setShadows(true);
  }
  field.setVisible(false);
  field.setNature(natureState);
  configureMeadowShadows();
  applyRealShadows();
  for (const c of field.colliders){
    fieldColliderHandles.push(PHYS.staticSphere(c.x, c.y, c.z, c.r, 0.62, 0.08, 0));
    // Tree trunks flare toward the ground; the chest sphere alone leaves the
    // base open, so a low/lying bear could enter the visible trunk.
    if (c.baseR) fieldColliderHandles.push(PHYS.staticSphere(c.x, c.baseY, c.z, c.baseR, 0.62, 0.08, 0));
  }
  if (field.layoutErrors && field.layoutErrors.length){
    console.warn('[meadow] collision/layout warnings:', field.layoutErrors);
  }
  field.navDebug.visible = false;
  scene.fog = null;
}

function setCeilingForMap(map){
  const cap = map.kind === 'life' ? 40 : 128;
  if (limitEl) limitEl.max = map.kind === 'life' ? '128' : '256';
  setCeiling(cap, false);
}

function seedStudioBears(){
  const flavors = MAP_CONTENT.studio.starter.flavors;
  const N = START_BEARS;
  const rx = Math.max(0.55, TABLE.hx*0.62);
  const rz = Math.max(0.50, TABLE.hz*0.60);
  const placed = [];
  for (let i=0;i<N;i++){
    let x=0, z=0;
    for (let t=0;t<100;t++){
      const a = Math.random()*Math.PI*2;
      const r = Math.sqrt(Math.random());
      x = Math.cos(a)*rx*r; z = Math.sin(a)*rz*r;
      let ok = true;
      for (const p of placed) if (Math.hypot(p.x-x,p.z-z) < 1.28){ ok = false; break; }
      if (ok) break;
    }
    placed.push({x,z});
    const b = spawn(x, z, 0.004, flavors[i%flavors.length], {tilt:0.05, name:takeBearName()});
    if (b) { b.stage='adult'; b.sex = (i % 2 ? 'M' : 'F'); }
  }
  if (RACE_ENABLED && getSpecies('msn').studio){
    const gummy = spawn(-Math.min(.72, TABLE.hx * .42), 0.45, 0.004, 3, {
      rig: getSpecies('msn').rig, name: 'MSN Buddy', stage: 'adult', scale: 1, tilt: 0.02, lift: 0.004,
    });
    if (gummy) gummy.home = '';
  }
}

function seedMeadowBears(){
  const { spots, colony, flavors } = MAP_CONTENT.field.starter;
  for (let i=0;i<spots.length;i++){
    let [x,z] = spots[i];
    if (field && !field.nav.isWalkable(x,z)){
      const p = field.nav.nearestWalkable(x,z);
      if (p){ x=p.x; z=p.z; }
    }
    const home = field && field.homes.length ? field.homes[i % field.homes.length].name : '';
    const c = colony[i];
    const b = spawn(x, z, 0.004, flavors[i], {
      tilt:0.02, name:takeBearName(), sex:c.sex, stage:c.stage, scale:c.scale, age:c.age,
    });
    if (b){
      b.home=home;
      // The starter teen and baby belong to the first adult pair; their home
      // moves with the family instead of remaining a round-robin slot.
      if (i >= 4 && bears[0]) {
        b.parentUids = [bears[0].uid, bears[2] ? bears[2].uid : 0].filter(Boolean);
        b.home = bears[0].home || home;
        b.bedtime = bears[0].bedtime;
        b.wakeTime = bears[0].wakeTime;
      }
    }
  }
  if (RACE_ENABLED && field && field.nav && getSpecies('msn').meadow){
    const gummies = MAP_CONTENT.field.starter.gummies;
    for (const item of gummies){
      const spot = field.nav.nearestWalkable(item.x, item.z) || { x: item.x, z: item.z };
      const gummy = spawn(spot.x, spot.z, 0.004, 3, {
        rig: getSpecies('msn').rig, name: item.name, sex: item.sex, stage: 'adult', scale: 1, tilt: 0.02, lift: 0.004,
      });
      if (gummy) gummy.home = '';
    }
  }
}

function yawOfQuat(q){
  return Math.atan2(2*(q.w*q.y + q.x*q.z), 1 - 2*(q.y*q.y + q.z*q.z));
}
function snapshotDirective(d){
  return d ? { kind: d.kind, target: d.target ? { x: d.target.x, z: d.target.z } : null, ttl: d.ttl } : null;
}
function snapshotBear(b){
  return snapshotActor(b, {
    flavor: b.flavor,
    bedtime: b.bedtime, wakeTime: b.wakeTime,
    hopSpeedMin: b.hopSpeedMin, hopSpeedMax: b.hopSpeedMax,
    directives: b.ai ? {
      active: snapshotDirective(b.ai.directive),
      queue: (b.ai.directives || []).map(snapshotDirective),
    } : null,
    yaw: yawOfQuat(b.q),
  });
}
function spawnFromState(st){
  if (!st || typeof st !== 'object') throw new Error('spawnFromState: actor record is invalid');
  let speciesDef;
  if (st.species === undefined) {
    speciesDef = getSpecies('bear', null);
  } else {
    if (typeof st.species !== 'string' || !st.species) {
      throw new Error('spawnFromState: species must be a non-empty registered id');
    }
    speciesDef = getSpecies(st.species, null);
    if (!speciesDef) throw new Error(`spawnFromState: species "${st.species}" is not registered`);
  }
  requireSpeciesRuntime(speciesDef, speciesDef.rig, {
    expectedKind: 'softbody', context: 'spawnFromState',
  });
  let x = st.x, z = st.z;
  if (isMeadow() && field){
    if (!field.nav.isWalkable(x,z)){
      const p = field.nav.nearestWalkable(x,z);
      if (p){ x=p.x; z=p.z; }
    }
  } else {
    x = clamp(x, -TABLE.hx+0.28, TABLE.hx-0.28);
    z = clamp(z, -TABLE.hz+0.28, TABLE.hz-0.28);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), st.yaw || 0);
  if (speciesDef.id === 'msn' && !RACE_ENABLED) return null;
  const rigCfg = speciesDef.rig;
  const genome = st.genome ? normalizeGenome(st.genome) : defaultGenome(speciesDef.id);
  const b = spawn(x, z, 0.004, st.flavor >= 0 ? st.flavor : 0, {
    rig: rigCfg,
    genome,
    applyGenomeSize: false,
    quat: q, lift: 0, name: st.name || takeBearName(), sex: st.sex || 'F', home: st.home || '',
    stage: st.stage || 'adult', scale: st.scale || scaleForStage(st.stage || 'adult'), uid: st.uid,
    age: Number.isFinite(st.age) ? st.age : ageForStage(st.stage || 'adult'),
    pregnant: !!st.pregnant, gestation: Number.isFinite(st.gestation) ? st.gestation : 0,
    mateCooldown: Number.isFinite(st.mateCooldown) ? st.mateCooldown : 0,
    parentUids: Array.isArray(st.parentUids) ? st.parentUids : [],
    fatherUid: Number.isFinite(st.fatherUid) ? st.fatherUid : 0,
    bedtime: Number.isFinite(st.bedtime) ? st.bedtime : undefined,
    wakeTime: Number.isFinite(st.wakeTime) ? st.wakeTime : undefined,
  });
  if (!b) return null;
  applyCommonActorState(b, st);
  b.hopSpeedMin = Number.isFinite(st.hopSpeedMin) ? st.hopSpeedMin : b.hopSpeedMin;
  b.hopSpeedMax = Number.isFinite(st.hopSpeedMax) ? st.hopSpeedMax : b.hopSpeedMax;
  b._directiveSave = st.directives && typeof st.directives === 'object' ? st.directives : null;
  return b;
}

function dropCarriedFood(actor, mapId){
  if (!actor || !actor.carriedFood || !field || !field.portions) return null;
  const carried = actor.carriedFood;
  actor.carriedFood = null;
  return field.portions.add({
    id: carried.id,
    kind: carried.kind,
    satiation: carried.satiation,
    x: actor.cx,
    y: Math.max(.04, Number.isFinite(actor.cy) ? actor.cy - .12 : .04),
    z: actor.cz,
    mapId,
  }) || field.portions.add({
    id: field.portions.nextId(),
    kind: carried.kind,
    satiation: carried.satiation,
    x: actor.cx,
    y: Math.max(.04, Number.isFinite(actor.cy) ? actor.cy - .12 : .04),
    z: actor.cz,
    mapId,
  });
}

function saveCurrentWorld({ dropCarried = false } = {}){
  const id = activeWorld.mapId;
  if (dropCarried){
    for (const actor of actorView.all()) dropCarriedFood(actor, id);
  }
  const w = worlds[id];
  w.bears = actorView.soft().filter(b => b.active).map(snapshotBear);
  w.glass = id === 'field' && glassColony ? glassColony.snapshot() : [];
  w.camera = captureCamera();
  if (launcher){
    const p = launcher.getPosition();
    if (p){ w.launcher = { ...p }; saveLauncherPos(p.x, p.z); }
  }
  if (id === 'field' && sky){
    w.time = sky.hours;
    w.auto = sky.auto;
    w.speed = sky.speed;
  }
  if (field && field.portions) w.gifts = field.portions.snapshot(id);
  w.initialized = true;
  persistWorld(id);
}

function applyMapVisuals(id){
  const meadow = id === 'field';
  if (meadow){
    setJellyGlow(true);
    if (field) field.setVisible(true);
    if (sky) sky.setVisible(true);
    if (studioReturnPortal) studioReturnPortal.group.visible = false;
    floor.visible = false;
    hemi.visible = false; key.visible = false; back.visible = false;
    camera.far = 400; camera.fov = 44; camera.updateProjectionMatrix();
    renderer.setClearColor(0x91cbe0, 1);
    scene.environmentIntensity = 0.55;
    scene.fog = new THREE.Fog(sky ? sky.fogColor.getHex() : 0xcfe8f2, 260, 520);
    if (sky){
      sky.setTime(worlds.field.time ?? 7.0);
      sky.setAuto(worlds.field.auto !== false);
      sky.setSpeed(worlds.field.speed || 1);
      // A saved named look wins over the stored clock time: it owns the look
      // (mist, cloud density, exposure) as well as the hour.
      let savedLook = null;
      try { savedLook = localStorage.getItem(SKY_LOOK_KEY); } catch (err) {}
      if (savedLook && sky.setLook(savedLook)){
        worlds.field.time = sky.hours;
        worlds.field.auto = false;
      }
      renderer.toneMappingExposure = sky.exposure;
    }
    document.body.dataset.map = 'field';
  } else {
    setJellyGlow(false);
    if (field) field.setVisible(false);
    if (sky) sky.setVisible(false);
    if (studioReturnPortal) studioReturnPortal.group.visible = true;
    floor.visible = true;
    hemi.visible = true; key.visible = true; back.visible = true;
    camera.far = 120; camera.fov = 34; camera.updateProjectionMatrix();
    renderer.setClearColor(0xffffff, 1);
    scene.environmentIntensity = 1.15;
    scene.fog = null;
    renderer.toneMappingExposure = 1.0;
    document.body.dataset.map = 'studio';
  }
  applyStudioCast(studioCast, false);
  updateMapButtons();
  updateAeroVisibility();
  if (effects) effects.setEnabled(!!meadow);
  if (aiDebug) aiDebug.onMapChanged();
  if (!meadow) {
    selectedBear = null;
    directivePick = false;
    syncDirectivePanel();
  }
}

function syncStudioCastPhysics(){
  if (isMeadow()) return;
  if (grabs.size) releaseAllGrabs();
  for (const b of bears){
    const hidden = studioActorHidden(b);
    if (hidden && b.handles){
      destroyBearBodies(b);
      b.physicsSuspended = true;
      b.needsBuild = true;
    } else if (!hidden && b.physicsSuspended){
      createBearBodies(b);
      b.needsBuild = true;
      b.physicsSuspended = false;
    }
  }
}

function syncStudioCastUI(){
  for (const btn of document.querySelectorAll('#raceCast [data-cast]')){
    const on = btn.dataset.cast === studioCast;
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('on', on);
  }
}

function applyStudioCast(value = studioCast, persist = true){
  if (value !== 'bears' && value !== 'both' && value !== 'msn') value = 'both';
  studioCast = value;
  if (persist){
    try { localStorage.setItem(STUDIO_CAST_KEY, studioCast); } catch (err) {}
  }
  const meadow = isMeadow();
  const msnOn = !meadow && studioCast !== 'bears';
  if (msnPrototype){
    msnPrototype.setPanelVisible(!meadow);
    msnPrototype.setVisible(msnOn);
  }
  const cannonOn = !(!meadow && studioCast === 'msn');
  if (launcher && launcher.group) launcher.group.visible = cannonOn;
  if (!cannonOn && launcher){
    launcher.setAiming(false);
    launcher.cancelMove();
  }
  if (!meadow && studioCast === 'msn'){
    releaseAllGrabs();
    selectedBear = null;
    directivePick = false;
    syncDirectivePanel();
  }
  if (!meadow && studioCast === 'bears' && possessedBear && isGummyActor(possessedBear)) exitPossession();
  syncRaceControlUI();
  if (!msnOn) cursorEl.classList.remove('move');
  document.body.classList.toggle('msn-only', !meadow && studioCast === 'msn');
  syncStudioCastUI();
  if (!meadow){
    syncStudioCastPhysics();
    drawStudioShadows(true);
  }
  return {
    cast: studioCast,
    msnVisible: !!(msnPrototype && msnPrototype.state().visible),
    bearsVisible: !(!isMeadow() && studioCast === 'msn'),
    cannonVisible: cannonOn,
  };
}

function syncCannonCollider(){
  if (!PHYS || !launcher) return;
  const id = activeWorld.mapId;
  const p = launcher.getPosition();
  if (!p) return;
  if (cannonColliderHandles[id] >= 0){
    PHYS.destroy(cannonColliderHandles[id]);
    cannonColliderHandles[id] = -1;
  }
  cannonColliderHandles[id] = PHYS.staticSphere(p.x, 0.23, p.z, 0.32, 0.7, 0.1, 0);
  if (id === 'field' && field){
    field.setCannon(p.x, p.z);
  }
}

function activateMap(id, opts = {}){
  leaveCurrentMap({
    initial: !!opts.initial,
    possessed: !!possessedBear,
    onExitPossession: exitPossession,
    onReleaseGrabs: releaseAllGrabs,
    onClearPointers: () => pointers.clear(),
    onClearDropQueue: () => { dropQueue.length = 0; },
    onDespawnActors: despawnAll,
    onClearGlass: () => { if (glassColony) glassColony.clear(); },
  });
  const target = MAPS[id] || getActiveMap();
  let map;
  let w;
  enterMapSession({
    onEnter(){
      setActiveMap(id);
      applyMapVisuals(id);
      map = getActiveMap();
    },
    onConfigure(){
      if (map.kind === 'life'){
        TABLE.hx = map.bounds.hx;
        TABLE.hz = map.bounds.hz;
      } else {
        TABLE.hz = 2.40;
        TABLE.hx = clamp(1.95*camera.aspect, 1.55, 6.50);
      }
      layoutStudioReturnPortal();
      if (msnPrototype) msnPrototype.layout();
      setCeilingForMap(map);
      buildWorldBounds();
      if (launcher){
        launcher.setMapState(worlds[id].launcher);
        syncCannonCollider();
      }
    },
    onCamera(){
      if (!opts.initial && worlds[id].camera) applyCameraState(worlds[id].camera);
      else resetCamera();
    },
    onReserveUids(){
      w = worlds[id];
      reserveWorldUids(w);
    },
    onRestorePortions(){
      if (field && field.portions && Array.isArray(w.gifts)) {
        const others = field.portions.all().filter(portion => portion.mapId !== id);
        field.portions.restore([...others.map(portion => ({ ...portion })), ...w.gifts]);
      }
    },
    onSpawnActors(){
      if (Array.isArray(w.bears)) {
        for (const st of w.bears) spawnFromState(st);
      } else if (map.kind === 'life') {
        seedMeadowBears();
      } else {
        seedStudioBears();
      }
    },
    onSyncGlass(){
      if (glassColony) {
        if (map.kind === 'life' && RACE_ENABLED) {
          glassColony.setMeadow(true);
          if (Array.isArray(w.glass)) glassColony.restore(w.glass);
          else glassColony.seedMeadow();
        } else {
          glassColony.clear();
          glassColony.setMeadow(false);
        }
      }
    },
    onSyncUi(){
      syncStudioCastPhysics();
      syncRaceControlUI();
      w.initialized = true;
      selectedBear = null;
      directivePick = false;
      syncDirectivePanel();
      updateMapButtons();
      updateAeroVisibility();
      syncAeroUI(true);
      drawShadows();
      if (window.__gummy && window.__gummy.booted){
        window.__gummy.lastMap = id;
      }
    },
  });
}

/* --------------------------------------------------------------- save/load */

let loadingSave = false;

// One session-mutating operation at a time. A second request is rejected before
// it reads or mutates game state; there is no queue and no rollback claim.
const sessionGate = createSessionGate({ onChange: syncSessionBusyUI });

function sessionBusyError(kind) {
  return new Error(`Session busy: ${sessionGate.current() || kind}`);
}

function syncSessionBusyUI(kind = sessionGate.current()) {
  const busy = !!kind;
  for (const id of ['saveExport', 'saveImportFile', 'newGame', 'mapMeadow', 'mapStudio']) {
    const el = document.getElementById(id);
    if (el) el.disabled = busy;
  }
  for (const btn of document.querySelectorAll('#savesList button')) btn.disabled = busy;
  document.body.classList.toggle('session-busy', busy);
  if (busy) document.body.dataset.sessionBusy = kind;
  else delete document.body.dataset.sessionBusy;
}

function savedSkyState() {
  let look = null;
  try { look = localStorage.getItem(SKY_LOOK_KEY); } catch (err) {}
  return sky ? { hours: sky.hours, day: sky.day, auto: sky.auto, speed: sky.speed, look } : null;
}

// Parent lookup across the current game, not across save slots. The active map
// uses its live actors; the other map uses the snapshot taken when it was left.
function gameActorIndex(){
  const actors = new Map();
  for (const actor of actorView.all()) {
    if (actor && Number.isFinite(actor.uid)) {
      actors.set(actor.uid, { actor, mapId: activeWorld.mapId });
    }
  }
  for (const id of ['field', 'studio']) {
    if (id === activeWorld.mapId) continue;
    const world = worlds[id];
    for (const actor of world.bears || []) {
      if (actor && Number.isFinite(actor.uid) && !actors.has(actor.uid)) {
        actors.set(actor.uid, { actor, mapId: id });
      }
    }
    for (const actor of world.glass || []) {
      if (actor && Number.isFinite(actor.uid) && !actors.has(actor.uid)) {
        actors.set(actor.uid, { actor, mapId: id });
      }
    }
  }
  return actors;
}

function gameActorUids(){
  return new Set(gameActorIndex().keys());
}

function worldSaveState(id) {
  const w = worlds[id];
  const l = w.launcher;
  const out = {
    bears: Array.isArray(w.bears) ? w.bears : [],
    glass: Array.isArray(w.glass) ? w.glass : [],
    camera: w.camera || null,
    launcher: l && Number.isFinite(l.x) && Number.isFinite(l.z) ? { x: l.x, z: l.z } : null,
    time: Number.isFinite(w.time) ? w.time : null,
    auto: !!w.auto,
    speed: Number.isFinite(w.speed) && w.speed > 0 ? w.speed : 1,
    initialized: !!w.initialized,
  };
  if (id === 'field' && field && field.food) out.food = field.food.snapshot();
  if (field && field.portions) out.gifts = field.portions.snapshot(id);
  return out;
}

function buildSavePayload() {
  // Capture the live active map first; the inactive map keeps the snapshot it
  // had when it was last left.
  return captureSavePayload({
    captureActive: () => saveCurrentWorld(),
    build: () => normalizeSave({
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      savedAt: Date.now(),
      mapId: activeWorld.mapId,
      sky: savedSkyState(),
      worlds: { field: worldSaveState('field'), studio: worldSaveState('studio') },
    }),
  });
}

function restoreSavedCarriedFood(payload){
  if (!field || !field.portions) return 0;
  let restored = 0;
  for (const id of ['field', 'studio']) {
    const world = payload.worlds[id];
    for (const actor of [...(world.bears || []), ...(world.glass || [])]) {
      const carried = actor && actor.carriedFood;
      if (!carried) continue;
      const portion = field.portions.add({
        id: carried.id,
        kind: carried.kind,
        satiation: carried.satiation,
        x: actor.x,
        y: 0,
        z: actor.z,
        mapId: id,
      });
      if (portion) restored++;
    }
  }
  return restored;
}

function applySavePayloadCore(raw) {
  // Validate everything before touching the live session.
  const payload = normalizeSave(raw);
  loadingSave = true;
  try {
    return applySavePayloadPhases(payload, {
      // Reserve every loaded identity before any restored actor can spawn,
      // including actors on the inactive map and Glass actors.
      onReserveUids: () => reserveGameUids(payload.worlds),
      onInstallWorlds: () => {
        for (const id of ['field', 'studio']) {
          const src = payload.worlds[id];
          const all = [...(Array.isArray(src.bears) ? src.bears : []), ...(Array.isArray(src.glass) ? src.glass : [])];
          const w = worlds[id];
          w.bears = src.initialized || src.bears.length ? src.bears : null;
          w.glass = Array.isArray(src.glass) ? src.glass : null;
          w.camera = src.camera;
          w.gifts = Array.isArray(src.gifts) ? src.gifts : [];
          if (src.launcher) w.launcher = { ...src.launcher };
          if (id === 'field') {
            w.time = Number.isFinite(src.time) ? src.time : 7.0;
            w.auto = !!src.auto;
            w.speed = Number.isFinite(src.speed) && src.speed > 0 ? src.speed : 1;
          }
          w.initialized = !!(src.initialized || src.bears.length);
        }
      },
      onPrune: () => {
        // References are game-wide, not per map: a partner or rival on the
        // inactive map must survive pruning while the active map loads.
        const gameUids = new Set();
        for (const id of ['field', 'studio']) {
          const src = payload.worlds[id];
          for (const actor of [...(src.bears || []), ...(src.glass || [])]) {
            if (actor && Number.isFinite(actor.uid)) gameUids.add(actor.uid);
          }
        }
        for (const id of ['field', 'studio']) {
          const src = payload.worlds[id];
          for (const actor of [...(src.bears || []), ...(src.glass || [])]) {
            pruneActorRefs(actor, gameUids);
          }
        }
      },
      onPortions: () => {
        // Replace portions from the previous session before map activation
        // merges the target map's saved list.
        if (field && field.portions) {
          field.portions.restore([
            ...(payload.worlds.field.gifts || []),
            ...(payload.worlds.studio.gifts || []),
          ]);
        }
      },
      onActivate: () => activateMap(payload.mapId),
      onRestoreCarried: () => restoreSavedCarriedFood(payload),
      onRestoreFood: () => {
        if (payload.mapId === 'field' && field && field.food && Array.isArray(payload.worlds.field.food)) {
          field.food.restore(payload.worlds.field.food);
        }
      },
      onRestoreSky: () => {
        if (payload.mapId === 'field' && sky && payload.sky) {
          if (payload.sky.look) {
            try { localStorage.setItem(SKY_LOOK_KEY, payload.sky.look); } catch (err) {}
            if (sky.setLook(payload.sky.look)) {
              worlds.field.time = sky.hours;
              worlds.field.auto = false;
            }
          } else {
            try { localStorage.removeItem(SKY_LOOK_KEY); } catch (err) {}
            sky.setTime(payload.sky.hours);
            sky.setAuto(!!payload.sky.auto);
            sky.setSpeed(payload.sky.speed);
            worlds.field.time = sky.hours;
            worlds.field.auto = sky.auto;
            worlds.field.speed = sky.speed;
            renderer.toneMappingExposure = sky.exposure;
          }
          if (Number.isFinite(payload.sky.day)) sky.setDay(payload.sky.day);
        }
      },
      onRestoreLauncher: () => {
        const l = payload.worlds[payload.mapId].launcher;
        if (launcher && l) {
          launcher.setMapState(l);
          syncCannonCollider();
          saveLauncherPos(l.x, l.z);
        }
      },
      onFinish: () => {
        persistWorld('field');
        syncAeroUI(true);
        return { ok: true, map: payload.mapId, bears: bears.length, savedAt: payload.savedAt };
      },
    });
  } finally {
    loadingSave = false;
  }
}

// Public/debug apply entry points share the session gate. Slot loads call the
// core directly while already holding `load` to avoid a nested acquisition.
function applySavePayload(raw, operation = 'import') {
  if (!sessionGate.begin(operation)) throw sessionBusyError(operation);
  try {
    return applySavePayloadCore(raw);
  } finally {
    sessionGate.end(operation);
  }
}

function resetNewGame() {
  if (!window.__gummy || !window.__gummy.booted) throw new Error('Game is still loading');
  if (!sessionGate.begin('new-game')) throw sessionBusyError('new-game');
  try {
    despawnAll();
    if (glassColony) glassColony.clear();
    if (field && field.food) field.food.reset();
    if (field && field.portions) field.portions.reset();
    for (const id of ['field', 'studio']) {
      const w = worlds[id];
      w.bears = null;
      w.glass = null;
      w.camera = null;
      w.gifts = [];
      w.initialized = false;
    }
    // A new game starts its own identity space; never continue a loaded game's
    // allocator.
    nextBearUid = 1;
    worlds.field.time = 7.0;
    worlds.field.auto = true;
    worlds.field.speed = 1;
    try {
      worlds.field.launcher = MAPS.field.launcherHome(TABLE, false);
      worlds.studio.launcher = MAPS.studio.launcherHome(TABLE, false);
    } catch (err) {}
    try {
      localStorage.removeItem(SKY_LOOK_KEY);
      localStorage.removeItem('gummy.worlds.v2');
    } catch (err) {}
    setActiveMap('field');
    if (sky) { sky.setTime(7.0); sky.setAuto(true); sky.setSpeed(1); }
    activateMap('field');
    resetCamera();
    persistWorld('field');
    persistWorld('studio');
    return { ok: true, bears: bears.length };
  } finally {
    sessionGate.end('new-game');
  }
}

async function saveToSlot(slot, name = '') {
  if (!window.__gummy || !window.__gummy.booted) throw new Error('Game is still loading');
  if (!sessionGate.begin('save')) throw sessionBusyError('save');
  try {
    const payload = buildSavePayload();
    await writeSave(slot, payload, name);
    return { ok: true, slot, savedAt: payload.savedAt, saves: await listSaves() };
  } finally {
    sessionGate.end('save');
  }
}

async function loadFromSlot(slot) {
  if (!sessionGate.begin('load')) throw sessionBusyError('load');
  loadingSave = true;
  try {
    const record = await readSave(slot);
    if (!record) throw new Error('Save slot is empty');
    return applySavePayloadCore(record.payload);
  } finally {
    loadingSave = false;
    sessionGate.end('load');
  }
}

// Menu Continue reads and applies the autosave under one `load` lease, so the
// read cannot overlap another session operation. A missing record releases before
// the caller falls back to a guarded New Game.
async function continueFromAutosave() {
  if (!sessionGate.begin('load')) throw sessionBusyError('load');
  try {
    const record = await readSave(AUTOSAVE_ID);
    if (!record) return false;
    applySavePayloadCore(record.payload);
    return true;
  } finally {
    sessionGate.end('load');
  }
}

async function autosaveNow() {
  if (loadingSave || mapSwitching || !window.__gummy || !window.__gummy.booted) return null;
  if (!sessionGate.begin('autosave')) return null;
  try {
    const payload = buildSavePayload();
    await writeSave(AUTOSAVE_ID, payload, 'Autosave');
    return payload.savedAt;
  } finally {
    sessionGate.end('autosave');
  }
}

let autosaveTick = 0;
function maybeAutosave(dt) {
  autosaveTick += dt;
  if (autosaveTick < 120) return;
  autosaveTick = 0;
  autosaveNow().catch(() => {});
}

/* ---------------------------------------------------------- saves UI wiring */

const SAVE_SLOT_LABELS = { slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3', slot4: 'Slot 4', slot5: 'Slot 5', autosave: 'Autosave' };

function setSaveNote(text) {
  const el = document.getElementById('saveNote');
  if (el) el.textContent = text;
}

function saveTimeLabel(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return '';
  try { return new Date(ts).toLocaleString(); } catch (err) { return ''; }
}

function saveSlotMetaText(rec) {
  return `${rec.mapId === 'studio' ? 'Studio' : 'Meadow'} · ${rec.bears} bears · ${saveTimeLabel(rec.savedAt)}`;
}

function saveButton(label, action, primary = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'saveBtn' + (primary ? ' primary' : '');
  btn.textContent = label;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try { await action(); } catch (err) { setSaveNote(String(err && err.message || err)); }
    finally { btn.disabled = sessionGate.isBusy(); }
  });
  return btn;
}

const saveSlotsPanel = createSaveSlotsPanel({
  list: document.getElementById('savesList'),
  labels: SAVE_SLOT_LABELS,
  autosaveId: AUTOSAVE_ID,
  metaText: saveSlotMetaText,
  makeButton: saveButton,
  confirm: (message) => confirm(message),
  documentRef: document,
  actions: {
    async save(id, rec) {
      const name = rec ? rec.name : SAVE_SLOT_LABELS[id];
      await saveToSlot(id, name);
      await refreshSavesUI();
      setSaveNote(`Saved to ${name}.`);
    },
    async load(id, rec) {
      await loadFromSlot(id);
      await refreshSavesUI();
      setSaveNote(`Loaded ${rec.name}.`);
    },
    async delete(id) {
      await removeSave(id);
      await refreshSavesUI();
      setSaveNote('Save deleted.');
    },
    async rename(id, rec) {
      const name = prompt('Save name', rec.name);
      if (!name) return;
      const latest = await readSave(id);
      if (!latest) return;
      await writeSave(id, latest.payload, name);
      await refreshSavesUI();
      setSaveNote('Save renamed.');
    },
  },
});

async function refreshSavesUI() {
  const list = document.getElementById('savesList');
  if (!list) return;
  let records = [];
  try { records = await listSaves(); }
  catch (err) { list.textContent = 'Saves unavailable in this browser.'; return; }
  saveSlotsPanel.render(records);
  syncSessionBusyUI();
}

function captureExportPayload() {
  if (!sessionGate.begin('export')) throw sessionBusyError('export');
  try { return buildSavePayload(); }
  finally { sessionGate.end('export'); }
}

async function exportSaveFile() {
  const payload = captureExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gummy-save-${new Date(payload.savedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  setSaveNote('Exported JSON.');
}

function initSavesUI() {
  const exportBtn = document.getElementById('saveExport');
  if (exportBtn) exportBtn.addEventListener('click', () => { exportSaveFile().catch(err => setSaveNote(String(err.message || err))); });
  const importInput = document.getElementById('saveImportFile');
  if (importInput) {
    importInput.addEventListener('change', async () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        await applySavePayload(JSON.parse(text));
        await refreshSavesUI();
        setSaveNote(`Imported ${file.name}.`);
      } catch (err) {
        setSaveNote('Import failed: ' + String(err.message || err));
      }
    });
  }
  const newGameBtn = document.getElementById('newGame');
  if (newGameBtn) {
    newGameBtn.addEventListener('click', async () => {
      if (!confirm('Start a new game? Current progress will be replaced.')) return;
      try {
        resetNewGame();
        await refreshSavesUI();
        setSaveNote('New game started.');
      } catch (err) { setSaveNote(String(err.message || err)); }
    });
  }
}
initSavesUI();

let mapSwitching = false;
function requestMapSwitch(id){
  if (!field || mapSwitching || id === activeWorld.mapId) return false;
  if (!sessionGate.begin('map-switch')) return false;
  mapSwitching = true;
  const wipe = document.getElementById('mapWipe');
  if (wipe) wipe.classList.add('on');
  setTimeout(()=>{
    try {
      saveCurrentWorld({ dropCarried: true });
      activateMap(id);
    } catch (err) {
      console.error('map switch failed', err);
    }
    setTimeout(()=>{
      try {
        if (wipe) wipe.classList.remove('on');
      } finally {
        mapSwitching = false;
        sessionGate.end('map-switch');
      }
    }, 260);
  }, 220);
  return true;
}

function ensureCannonColliderInitial(){
  // called after the launcher is built and a map is active
  syncCannonCollider();
}

function setMeadowTime(h){
  if (!sky) return;
  sky.setTime(h);
  sky.setAuto(false);
  const w = worlds.field;
  w.time = sky.hours; w.auto = false;
  syncAeroUI(true);
}
function toggleMeadowAuto(){
  if (!sky) return;
  sky.setAuto(!sky.auto);
  const w = worlds.field;
  w.auto = sky.auto; w.time = sky.hours;
  syncAeroUI(true);
}
function cycleMeadowSpeed(){
  if (!sky) return;
  const next = sky.speed >= 4 ? 1 : sky.speed * 2;
  sky.setSpeed(next);
  worlds.field.speed = sky.speed;
  syncAeroUI(true);
}

/* ================================= BOOT =================================== */
const worldWalls = { ready: false, grounds: [], walls: [], hx: 0, hz: 0 };
function ensureWorldGround(){
  if (worldWalls.ready) return;
  // One huge lawn floor with a real pond depression. The pond is far outside the
  // Studio arena, so the same ground can serve both maps.
  const X0 = -90, X1 = 90, Z0 = -70, Z1 = 70;
  const hx0 = POND.x - POND_HOLE.hx, hx1 = POND.x + POND_HOLE.hx;
  const hz0 = POND.z - POND_HOLE.hz, hz1 = POND.z + POND_HOLE.hz;
  const add = (x,z,hx,hz) => PHYS.staticBox(x, -0.5, z, hx, 0.5, hz, 0.9, 0.08, 0);
  // south + north slabs (full width)
  worldWalls.grounds.push(add(0, (Z0 + hz0)/2, (X1-X0)/2, (hz0-Z0)/2));
  worldWalls.grounds.push(add(0, (hz1 + Z1)/2, (X1-X0)/2, (Z1-hz1)/2));
  // west + east slabs around the hole
  worldWalls.grounds.push(add((X0 + hx0)/2, POND.z, (hx0-X0)/2, (hz1-hz0)/2));
  worldWalls.grounds.push(add((hx1 + X1)/2, POND.z, (X1-hx1)/2, (hz1-hz0)/2));
  // basin under the pond
  worldWalls.grounds.push(PHYS.staticBox(
    POND.x, POND_HOLE.floorY - 0.25, POND.z,
    POND_HOLE.hx + 0.25, 0.25, POND_HOLE.hz + 0.25,
    0.55, 0.05, 0
  ));
  worldWalls.ready = true;
}
function buildWorldBounds(){
  if (!PHYS) return;
  ensureWorldGround();
  const map = getActiveMap();
  const H = Math.max(2.5, map.wallHeight || 8);
  for (const h of worldWalls.walls) if (h >= 0) PHYS.destroy(h);
  worldWalls.walls.length = 0;
  if (map.kind === 'life') {
    // A smooth ring wall follows the same wobbled disc as nav/camera. Each
    // segment is an oriented hull, so there are no square corners to snag on.
    const N = 96;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2;
      const am = (a0 + a1) * 0.5;
      const r0 = fieldRadiusAt(a0) + 0.22, r1 = fieldRadiusAt(a1) + 0.22;
      const x0 = Math.cos(a0) * r0, z0 = Math.sin(a0) * r0;
      const x1 = Math.cos(a1) * r1, z1 = Math.sin(a1) * r1;
      const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
      const chord = Math.hypot(x1 - x0, z1 - z0);
      worldWalls.walls.push(PHYS.staticBoxRot(
        mx, H/2, mz, chord * 0.5 + 0.16, H/2, 0.34,
        am + Math.PI / 2, 0.35, 0.15, 0
      ));
    }
  } else {
    const wx = TABLE.hx + 0.55, wz = TABLE.hz + 0.55;
    for (const s of [-1, 1]){
      worldWalls.walls.push(PHYS.staticBox(s*wx, H/2, 0, 0.60, H/2, wz + 1.1, 0.35, 0.15, 0));
      worldWalls.walls.push(PHYS.staticBox(0, H/2, s*wz, wx + 1.1, H/2, 0.60, 0.35, 0.15, 0));
    }
  }
  worldWalls.hx = TABLE.hx; worldWalls.hz = TABLE.hz;
  worldWalls.shape = map.kind === 'life' ? 'circle' : 'rect';
}
function fitWallsToTable(){
  if (!PHYS || !worldWalls.ready) return;
  if (Math.abs(TABLE.hx - worldWalls.hx) > 0.02 || Math.abs(TABLE.hz - worldWalls.hz) > 0.02){
    buildWorldBounds();
  }
}

async function bootGame(){
  try {
    effects = createEffects({
      renderer, scene, camera,
      width: innerWidth, height: innerHeight,
      getSky: () => sky,
    });
    effects.setMode(effectsMode);
    effects.setQuality(quality.level);
    effects.setDof(effectsDof);
  } catch (err) {
    console.warn('[effects] post-processing unavailable, using direct render:', err);
    effects = null;
  }
  syncEffectsUI();
  onResize();
  applyQuality();

  PHYS = await initPhysics(24 * BEAR_HARD_MAX, { x: 0, y: GRAV, z: 0 });
  ensureMeadow();
  applyGraphics();
  behavior = createBehavior({
    engine: BEHAVIOR_ENGINE,
    field,
    getActors: () => actorView.all(),
    getHours: () => (sky ? sky.hours : 12),
    getDay: () => (sky ? sky.day : 0),
    getPopulationCap: () => bearCeiling,
    getKnownActorUids: gameActorUids,
    getMapId: () => activeWorld.mapId,
    emitEmote: (x, y, z, kind) => {
      if (field && typeof field.emote === 'function') return field.emote(x, y, z, kind);
      return false;
    },
    getNavigation: () => (field && field.nav ? field.nav : null),
    getHomes: () => (field && field.homes ? field.homes : null),
    getFood: () => (field && field.food ? field.food : null),
    getWaterSpots: () => (field && field.waterSpots ? field.waterSpots : null),
    getPortions: () => (field && field.portions ? field.portions : null),
    daySeconds: DAY_SECONDS,
    onFarewell: (actor, info) => startFarewell(actor, info),
    // Read Math.random at call time so __gummy.seed() also drives the engine.
    rng: () => Math.random(),
  });
  departures = createDepartureHook({
    isEnabled: () => BEHAVIOR_ENGINE === 'modules' && !!(behavior && behavior.api &&
      behavior.api.features && behavior.api.features.departures),
    getActors: () => actorView.all(),
    getMapId: () => activeWorld.mapId,
    getTime: () => ({ day: sky ? sky.day : 0, hours: sky ? sky.hours : 0 }),
  });
  giftVisuals = createGiftVisuals({
    scene,
    getPortions: () => (field && field.portions ? field.portions.all() : []),
    getActors: () => actorView.all(),
    getMapId: () => activeWorld.mapId,
    getActive: () => !!window.__gummy && window.__gummy.booted,
  });
  applyFarewellSettings();
  syncFarewellSettingsUI();
  applyAdoptionSetting();
  syncAdoptionSettingsUI();
  applyGiftingSetting();
  syncGiftingSettingsUI();
  applySocialSettings();
  syncSocialSettingsUI();
  // Interaction history feeds the selected-actor relationship view. It stays
  // off in the engine/parity defaults so the legacy oracle is unaffected.
  if (behavior && typeof behavior.setFeature === 'function') {
    behavior.setFeature('interactionHistory', true);
  }
  ai = createBearAI({
    field,
    getBears: () => bears,
    getCompanions: () => allActors(),
    getHours: () => (sky ? sky.hours : 12),
    getPopulationCap: () => bearCeiling,
    behavior,
  });
  aiDebug = createAIDebug({
    getBears: () => bears,
    getAI: () => ai,
    getField: () => field,
    isMeadow,
  });
  thoughtBubbles = createThoughtBubbleOverlay({
    container: document.getElementById('thoughtLayer'),
    project: actor => {
      camera.updateMatrixWorld(true);
      _thoughtPoint.set(actor.cx, (actor.cy || 0) + 1.22, actor.cz).project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: (_thoughtPoint.x * .5 + .5) * rect.width + rect.left,
        y: (-_thoughtPoint.y * .5 + .5) * rect.height + rect.top,
        z: _thoughtPoint.z,
        width: rect.width,
        height: rect.height,
      };
    },
    getActors: () => actorView.all(),
    getPlan: actor => (behavior && typeof behavior.plan === 'function' ? behavior.plan(actor) : null),
    isEnabled: () => isMeadow() && !!(behavior && behavior.api &&
      behavior.api.features && behavior.api.features.thoughtBubbles),
    maxBubbles: 8,
  });
  launcher = createLauncher({
    scene, camera, canvas,
    getTable: () => TABLE,
    getBears: () => bears,
    spawnBear: (x, z, y, f, opts) => spawn(x, z, y, f, opts),
    canSpawnAt: (x, z, r, includeBears) => launcherSpotClear(x, z, r, includeBears),
    uploadVelocities: uploadBearVelocities,
    restDY: REST_DY, np: NP, flavors: FLAVORS,
    isPhysicsReady: () => !!PHYS,
    getHome: () => getActiveMap().launcherHome(TABLE, innerWidth < 760),
    insideBounds: (x, z, margin) => {
      if (isMeadow()) return fieldInside(x, z, margin);
      return Math.abs(x) <= TABLE.hx - margin && Math.abs(z) <= TABLE.hz - margin;
    },
    clampBounds: (x, z, margin) => {
      if (isMeadow()) return fieldClamp(x, z, margin);
      return { x: clamp(x, -TABLE.hx + margin, TABLE.hx - margin), z: clamp(z, -TABLE.hz + margin, TABLE.hz - margin) };
    },
    placementExtra: (x, z) => {
      const map = getActiveMap();
      return map.kind === 'life' && field ? field.isCannonSpot(x, z) : true;
    },
    state: activeWorld.launcher,
    onPlace: (x, z) => {
      saveLauncherPos(x, z);
      syncCannonCollider();
    },
    ui: {
      launchBtn: document.getElementById('launchBtn'),
      moveBtn: document.getElementById('moveCannonBtn'),
      note: document.getElementById('note'),
      cursor: cursorEl,
      hint: hintEl,
      coarse: COARSE_POINTER,
      showHint: (text) => { hintEl.textContent = text; showCamHint(); },
      hideHint: () => hideCamHint(),
    },
  });
  launcher.build();
  studioReturnPortal = createStudioReturnPortal({
    x: -2.1,
    z: -1.25,
    yaw: .16,
  });
  studioReturnPortal.group.scale.setScalar(.82);
  studioReturnPortal.group.visible = false;
  scene.add(studioReturnPortal.group);
  layoutStudioReturnPortal();
  msnPrototype = createMSNPrototype({ scene, camera, renderer, physics: PHYS, enabled: RACE_ENABLED, getTable: () => TABLE, look: RACE_LOOK });
  glassColony = createGlassColony({
    scene,
    physics: PHYS,
    getField: () => field,
    getHours: () => (sky ? sky.hours : 12),
    getBears: () => bears,
    nextUid: reserveUid,
    takeName: () => 'Glass ' + takeBearName(),
    beginCrossMate: (glass, bear) => (ai ? ai.beginMatePair(glass, bear) : false),
    birthFromGlass: (mother) => birthChild(mother),
    behavior,
  });
  activateMap(activeWorld.mapId, { initial: true });
  if (toonEnabled) applyToonMaterials();
  drawShadows();
  addEventListener('resize', onResize);
  addEventListener('orientationchange', ()=>setTimeout(onResize, 120));
  document.addEventListener('visibilitychange', ()=>{ lastNow = performance.now(); acc = 0; });
  requestAnimationFrame(animate);
  requestAnimationFrame(()=>{ document.body.classList.add('ready'); });
  if (window.__gummy) window.__gummy.booted = true;
}

/* --------------------------------------------------------------- main menu */

let bootStarted = null;
function startGame() {
  if (!bootStarted) {
    bootStarted = bootGame().catch(err => {
      bootStarted = null;
      throw err;
    });
  }
  return bootStarted;
}

let paused = false;
let menuOpen = true;

function setMenuNote(text) {
  const el = document.getElementById('menuNote');
  if (el) el.textContent = text;
}

function setMenu(open) {
  menuOpen = !!open;
  panelView.render(panelRenderState());
  if (menuOpen) refreshMenuSaves();
}

function setPaused(v) {
  paused = !!v;
  pausePanelOpen = paused;
  panelView.render(panelRenderState());
  if (paused) refreshMenuSaves();
  if (!paused) hideCamHint();
}

function openMenuSlots(open) {
  menuSlotsOpen = !!open;
  panelView.render(panelRenderState());
  if (menuSlotsOpen) refreshMenuSaves();
}

function setMenuBusy(busy) {
  for (const id of ['menuContinue', 'menuLoad', 'menuNew', 'menuHelp']) {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = !!busy;
  }
}

function saveMetaText(rec) {
  return `${rec.mapId === 'studio' ? 'Studio' : 'Meadow'} · ${rec.bears} bears · ${saveTimeLabel(rec.savedAt)}${rec.id === AUTOSAVE_ID ? ' · autosave' : ''}`;
}

const menuSaveList = createMenuSaveList({
  list: document.getElementById('menuSaveList'),
  makeButton: saveButton,
  metaText: saveMetaText,
  documentRef: document,
  actions: {
    load(id) {
      openMenuSlots(false);
      return startFromMenu('load', id);
    },
  },
});

async function refreshMenuSaves() {
  let records = [];
  try { records = await listSaves(); } catch (err) { records = []; }
  const auto = records.find(r => r.id === AUTOSAVE_ID);
  const cont = document.getElementById('menuContinue');
  if (cont) cont.disabled = !auto && !(window.__gummy && window.__gummy.booted);
  const note = document.getElementById('menuNote');
  if (note && !note.dataset.busy && !note.dataset.fixed) {
    note.textContent = auto
      ? `Autosave ready · ${saveTimeLabel(auto.savedAt)}`
      : (window.__gummy && window.__gummy.booted ? 'Paused.' : 'No autosave yet — start a new meadow.');
  }
  menuSaveList.render(records);
}

async function startFromMenu(action, slot) {
  const note = document.getElementById('menuNote');
  setMenuBusy(true);
  if (note) { delete note.dataset.fixed; note.dataset.busy = '1'; note.textContent = 'Waking the meadow…'; }
  try {
    if (action === 'continue' && window.__gummy && window.__gummy.booted) {
      setMenu(false);
      setPaused(false);
      return;
    }
    await startGame();
    if (action === 'continue') {
      if (await continueFromAutosave()) {
        if (note) note.textContent = 'Resumed autosave.';
      } else {
        resetNewGame();
        if (note) note.textContent = 'New meadow started.';
      }
    } else if (action === 'load') {
      await loadFromSlot(slot);
      if (note) note.textContent = 'Save loaded.';
    } else if (action === 'new') {
      resetNewGame();
      if (note) note.textContent = 'New game started.';
    }
    setMenu(false);
    setPaused(false);
  } catch (err) {
    if (note) { note.dataset.fixed = '1'; note.textContent = 'Could not start: ' + (err && err.message || err); }
    console.error('start failed', err);
  } finally {
    if (note) delete note.dataset.busy;
    setMenuBusy(false);
    refreshMenuSaves();
  }
}

async function returnToMenu() {
  setPaused(false);
  try { await autosaveNow(); } catch (err) {}
  setMenu(true);
  paused = true;
  document.body.classList.add('menu-open');
  refreshMenuSaves();
}

function initMenu() {
  document.getElementById('menuContinue')?.addEventListener('click', () => startFromMenu('continue'));
  document.getElementById('menuLoad')?.addEventListener('click', () => openMenuSlots(true));
  document.getElementById('menuNew')?.addEventListener('click', () => startFromMenu('new'));
  document.getElementById('menuHelp')?.addEventListener('click', () => setHelp(true));
  document.getElementById('menuSlotsClose')?.addEventListener('click', () => openMenuSlots(false));
  document.getElementById('menuSlotsBack')?.addEventListener('click', () => openMenuSlots(false));
  document.getElementById('pauseResume')?.addEventListener('click', () => setPaused(false));
  document.getElementById('pauseSettings')?.addEventListener('click', () => { setPaused(false); setSettings(true); });
  document.getElementById('pauseMenuBtn')?.addEventListener('click', () => returnToMenu());
  setMenu(true);
}

/* ----------------------------- debug / selftest --------------------------- */
function simulateSeconds(sec, rebuildEverySubsteps){
  const steps = Math.round(sec/FIXED_DT);
  let built = 0;
  for (let s=0;s<steps;s++){
    physicsStep(FIXED_DT);
    if (s % 4 === 3) frameTick(FIXED_DT*4);
    if (rebuildEverySubsteps && s % rebuildEverySubsteps === 0){ for (const b of bears) buildBear(b); built++; }
  }
  return built;
}
window.__gummy = {
  assets(){ return assetStore.status(); },
  booted: false,
  bears,
  seed(value){
    const seed = Number(value);
    if (!Number.isFinite(seed)) {
      Math.random = nativeRandom;
      return null;
    }
    let state = (Math.floor(seed) >>> 0) || 1;
    Math.random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
    return state;
  },
  unseed(){ Math.random = nativeRandom; return true; },
  family(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    if (!actor) return null;
    const family = familyFor(actor);
    return {
      uid: actor.uid, name: actorName(actor), home: actor.home || '',
      generation: family.generation,
      parents: family.parents.map(parent => ({ uid: parent.uid, name: actorName(parent) })),
      grandparents: family.grandparents.map(parent => ({ uid: parent.uid, name: actorName(parent) })),
      siblings: family.siblings.map(sibling => ({ uid: sibling.uid, name: actorName(sibling) })),
      children: family.children.map(child => ({ uid: child.uid, name: actorName(child) })),
      grandchildren: family.grandchildren.map(child => ({ uid: child.uid, name: actorName(child) })),
      history: historyFor(actor).map(event => ({ ...event })),
    };
  },
  lineage(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    if (!actor) return null;
    const all = actorView.all();
    const byUid = new Map(all.map(item => [item.uid, item]));
    const family = familyFor(actor);
    const node = (item) => item ? { uid: item.uid, name: actorName(item), generation: familyFor(item).generation } : null;
    return {
      self: node(actor),
      parents: family.parents.map(node),
      grandparents: family.grandparents.map(node),
      siblings: family.siblings.map(node),
      children: family.children.map(node),
      grandchildren: family.grandchildren.map(node),
      household: all.filter(item => item.active && item.home && item.home === actor.home)
        .map(item => ({ uid: item.uid, name: actorName(item), species: item.species })),
      history: historyFor(actor).map(event => ({
        ...event,
        name: event.uid ? actorName(byUid.get(event.uid)) || null : null,
      })),
    };
  },
  behavior(){ return behavior ? behavior.stats() : null; },
  behaviorEngine(){ return BEHAVIOR_ENGINE; },
  behaviorConfig(){
    const api = behavior && behavior.api;
    if (!api || !api.config) return null;
    return {
      engine: BEHAVIOR_ENGINE,
      version: api.config.getVersion(),
      features: { ...api.features },
      modules: [...api.modules.keys()],
    };
  },
  setBehaviorModule(id, enabled, scope){
    return behavior && typeof behavior.setModuleEnabled === 'function'
      ? behavior.setModuleEnabled(id, enabled, scope || null) : false;
  },
  setBehaviorFeature(name, value){
    return behavior && typeof behavior.setFeature === 'function'
      ? behavior.setFeature(name, value) : false;
  },
  activityPreference(uid, id, value){
    if (!behavior || typeof behavior.setPreference !== 'function') return false;
    return behavior.setPreference(actorView.byUid(uid), id, value);
  },
  dispositions(uid){
    if (!behavior || typeof behavior.dispositions !== 'function') return null;
    return behavior.dispositions(actorView.byUid(uid));
  },
  activityProposals(uid){
    if (!behavior || typeof behavior.activityProposals !== 'function') return null;
    return behavior.activityProposals(actorView.byUid(uid));
  },
  activityDecision(uid){
    if (!behavior || typeof behavior.activityDecision !== 'function') return null;
    return behavior.activityDecision(actorView.byUid(uid));
  },
  departures(){ return departures ? departures.list() : []; },
  clearDepartures(){ if (departures) departures.clear(); return true; },
  routines(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    if (!actor) return null;
    return { home: actor.home || '', hours: sky ? sky.hours : null, window: routineWindowFor(actor, sky ? sky.hours : 12) };
  },
  playdates(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    return actor ? { ...(actor.playdates || {}) } : null;
  },
  familyTask(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    return actor && actor.ai ? actor.ai.familyTask : null;
  },
  teach(parentUid, childUid, key = null){
    const parent = actorView.byUid(parentUid) || bears[parentUid];
    const child = actorView.byUid(childUid) || bears[childUid];
    return teachSkill(child, parent, key);
  },
  roster(){
    return actorView.active()
      .filter(actor => speciesOf(actor)?.roster)
      .map(actor => ({
        uid: actor.uid, name: actorName(actor), species: speciesOf(actor)?.id || actor.species,
        kind: actor.kind || (isGlassActor(actor) ? 'glass' : 'softbody'),
        sex: actor.sex, stage: actor.stage, home: actor.home || '',
        status: buddyStatus(actor), family: familyShort(actor),
      }));
  },
  rig: { rest: Array.from(REST), parent: Array.from(PARENT), parentLen: Array.from(PARENT_LEN), comY: REST_COM_Y }, get bounces(){ return bounces; },
  stats(){
    let nan=false, minY=1e9, maxY=-1e9, maxXZ=0, verts=[], stretch=1, syMin=9, syMax=-9, sxMin=9, sxMax=-9, built=surfaceStats.built||0;
    const fx = effects && effects.enabled ? effects.stats() : null;
    for (const b of bears){
      verts.push(b.vertCount);
      stretch = Math.max(stretch, b.stretch);
      syMin=Math.min(syMin,b.sy); syMax=Math.max(syMax,b.sy);
      sxMin=Math.min(sxMin,b.sx); sxMax=Math.max(sxMax,b.sx);
      for (let i=0;i<NP;i++){
        if (!Number.isFinite(b.px[i])||!Number.isFinite(b.py[i])||!Number.isFinite(b.pz[i])) nan=true;
        minY=Math.min(minY,b.py[i]); maxY=Math.max(maxY,b.py[i]);
        maxXZ=Math.max(maxXZ, Math.abs(b.px[i]), Math.abs(b.pz[i]));
      }
    }
    return { nan, bears:bears.length, glass:glassColony ? glassColony.count : 0, bounces, activeGrabs:grabs.size, stretchShown:+stretchShown.toFixed(2), minY, maxY, maxXZ, verts, stretch, sy:[+syMin.toFixed(2),+syMax.toFixed(2)], sx:[+sxMin.toFixed(2),+sxMax.toFixed(2)],
             builtThisFrame:built, fps:Math.round(fpsEma), frameMs:+frameMsEma.toFixed(2),
             table:{hx:+TABLE.hx.toFixed(2),hz:+TABLE.hz.toFixed(2)}, dpr:renderer.getPixelRatio(), quality:quality.level,
             calls:fx ? fx.calls : renderer.info.render.calls,
             tris:fx ? fx.tris : renderer.info.render.triangles };
  },
  pour: pourBears,
  drop(f){ return dropFromAbove(f===undefined?0:f); },
  dropCustom,
  spawnAt(x,z,y,f){ return spawn(x,z,y,f===undefined?0:f,{tilt:0.04}); },
  spawnGlass(opts = {}){ return glassColony ? glassColony.spawnChild(opts) : null; },
  setWobble(v){ wobble = v; wobbleEl.value = String(Math.round(v*100)); },
  setCustom(h, c){ custom.hue=h; custom.clarity=c; clarityEl.value=String(Math.round(c*100)); refreshCustomUI(); },
  sim(sec, rebuild){ return simulateSeconds(sec, rebuild===undefined?8:rebuild); },
  bench(frames, force){
    const N = Math.max(1, frames|0);
    let phys=0, surf=0;
    PROF.on = true; PROF.field = 0; PROF.nets = 0; PROF.eyes = 0; PROF.shadow = 0; PROF.n = 0;
    for (let f=0; f<N; f++){
      let t = performance.now();
      for (let s=0;s<SUBSTEPS;s++) physicsStep(FIXED_DT);
      phys += performance.now()-t;
      t = performance.now();
      if (force) for (const b of bears) b.needsBuild = true;
      updateSurfaces();
      updateMeshTransforms();
      const t2 = performance.now();
      drawShadows();
      surf += performance.now()-t;
      PROF.shadow += performance.now()-t2;
    }
    PROF.on = false;
    return { frames:N, forced:!!force, bears:bears.length,
      physMsPerFrame:+(phys/N).toFixed(2), surfaceMsPerFrame:+(surf/N).toFixed(2),
      totalMsPerFrame:+((phys+surf)/N).toFixed(2),
      buildsPerFrame:+(PROF.n/N).toFixed(1),
      fieldMsPerBuild:+(PROF.field/Math.max(1,PROF.n)).toFixed(3),
      netsMsPerBuild:+(PROF.nets/Math.max(1,PROF.n)).toFixed(3),
      eyesMsPerFrame:+(PROF.eyes/N).toFixed(2),
      shadowMsPerFrame:+(PROF.shadow/N).toFixed(2),
      verts: bears.map(b=>b.vertCount),
      grid: { cell:+bears[0].cell.toFixed(4), dims:[bears[0].nx,bears[0].ny,bears[0].nz] } };
  },
  grabPoint(bearIdx, ptIdx, x, y, z){
    const b = bears[bearIdx]; if (!b) return;
    const depth = Math.max(0.6, camera.position.distanceTo(new THREE.Vector3(b.px[ptIdx], b.py[ptIdx], b.pz[ptIdx])));
    const g = makeGrab(b, ptIdx, 'dbg'+(++dbgSeq), 0, 0, 0, depth);
    if (x !== undefined) g.target.set(x, y, z);
  },
  moveGrab(x,y,z){ const g = lastDbgGrab(); if (g){ g.target.set(x,y,z); g.vel.set(0,0,0); } },
  release(){ const g = lastDbgGrab(); if (g) endGrab(g, true); },
  releaseThrow(vx,vy,vz){ const g = lastDbgGrab(); if (g){ g.vel.set(vx,vy,vz); endGrab(g, true); } },
  hit(v){ const g = lastDbgGrab(); if (g) g.bear.vx[g.grabIdx] += v; },
  clear(){ despawnAll(); },
  setYaw(i, deg){
    const b = bears[i]; if (!b) return false;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), deg*Math.PI/180);
    b.q.copy(q);
    const qm = new THREE.Matrix4().makeRotationFromQuaternion(q);
    const e = qm.elements;
    b.rMat[0]=e[0]; b.rMat[1]=e[4]; b.rMat[2]=e[8];
    b.rMat[3]=e[1]; b.rMat[4]=e[5]; b.rMat[5]=e[9];
    b.rMat[6]=e[2]; b.rMat[7]=e[6]; b.rMat[8]=e[10];
    const sc = b.scale || 1;
    for (let k=0;k<NP;k++){
      _v3.set(REST[k*3] * sc, REST[k*3+1] * sc, REST[k*3+2] * sc).applyQuaternion(q);
      b.px[k]=b.cx+_v3.x; b.py[k]=b.cy+_v3.y; b.pz[k]=b.cz+_v3.z;
      b.vx[k]=b.vy[k]=b.vz[k]=0;
      b.snap[k*3]=b.px[k]; b.snap[k*3+1]=b.py[k]; b.snap[k*3+2]=b.pz[k];
    }
    b.vol = 1; b.volSlow = 1; b.sy = 1; b.sx = 1;
    uploadBearPositions(b, true);
    b.needsBuild = true;
    return true;
  },
  freeze(v){ frozen = !!v; },
  meshPos(i){ const b = bears[i]; if (!b) return null; const e = b.mesh.matrix.elements; return [+e[12].toFixed(4), +e[13].toFixed(4), +e[14].toFixed(4)]; },
  meshHead(i){ const b = bears[i]; if (!b) return null; _v3.set(b.snap[0], b.snap[1], b.snap[2]).applyMatrix4(b.meshM); return [+_v3.x.toFixed(4), +_v3.y.toFixed(4), +_v3.z.toFixed(4)]; },
  meshInfo(i){ const b = bears[i]; if (!b) return null; return { deform:+b.deform.toFixed(4), cell:+b.cell.toFixed(4),
    dims:[b.nx,b.ny,b.nz], lat:b.lat ? [ +b.lat.cell.toFixed(4), b.lat.nx, b.lat.ny, b.lat.nz ] : null }; },
  freezeCamera(v){ cam.frozen = !!v; if (!v) applyCamera(0); },
  diag(){ return { uprightAssist, bears: bears.map(b => {
    const ux=b.rMat[1], uy=b.rMat[4], uz=b.rMat[7]; const ul=Math.hypot(ux,uy,uz)||1;
    return { tilt:+(Math.acos(clamp(uy/ul,-1,1))*57.2958).toFixed(1), up4:+b.rMat[4].toFixed(2), contacts:b.contacts,
      speed:+Math.hypot(b.vcx,b.vcy,b.vcz).toFixed(2), awake:b.awake, press:+b.press.toFixed(2), upTilt:+(b.upTilt||0).toFixed(2),
      sy:+b.sy.toFixed(2), qUpY:+(new (THREE.Vector3)(0,1,0).applyQuaternion(b.q)).y.toFixed(2) };
  }) }; },
  launcher(){ return launcher ? launcher.state() : null; },
  foodRegistry(){ return field && field.food ? field.food : null; },
  selectBear(i){ const b = bears[i]; if (b && b.active) focusBuddy(b); return selectedBear ? selectedBear.name : null; },
  selectGlass(i){
    const a = glassColony && glassColony.actors[i];
    if (a && a.active) focusBuddy(a);
    return selectedBear ? selectedBear.name : null;
  },
  guardianFollow(i){
    const b = bears[i];
    const guardian = b && Number.isFinite(b.guardianUid) ? actorView.byUid(b.guardianUid) : null;
    if (!b || !b.ai || !guardian || !guardian.ai) return false;
    b.ai.state = 'follow';
    b.ai.follow = guardian;
    b.ai.target = { x: guardian.cx, z: guardian.cz };
    b.ai.moving = false;
    return true;
  },
  relationships(uid){
    const actor = uid === undefined || uid === null
      ? selectedBear
      : actorView.all().find(item => String(item.uid) === String(uid));
    return actor ? buildRelationshipView(actor, [...gameActorIndex().values()]) : null;
  },
  directive(i, kind, target){ return ai ? ai.issueDirective(bears[i], kind, target) : null; },
  directives(i){ return ai ? ai.directiveState(i) : null; },
  cancelDirectives(i){ return ai ? ai.cancelDirectives(bears[i]) : false; },
  possess(i){ const b = bears[i]; return enterPossession(b) ? (possessedBear.name || '') : null; },
  exitPossession(){ return exitPossession(); },
  gummy(i){ const b = bears[i]; return b && isGummyActor(b) ? {
    index: i, name: b.name, idleT: +b.gummyIdleT.toFixed(2),
    pose: b.gummyPose ? { ...b.gummyPose, t: +b.gummyPose.t.toFixed(2) } : null,
    ai: b.ai ? b.ai.state : null,
  } : null; },
  gummyReact(i, kind){ const b = bears[i]; return b && isGummyActor(b) ? gummyReact(b, kind) : false; },
  genome(i){ const b = bears[i]; return b ? {
    genome: b.genome, phenotype: b.phenotype,
    dna: {
      rigidityScale: b.dnaRigidityScale, dampingScale: b.dnaDampingScale,
      stretchScale: b.dnaStretchScale, material: b.dnaMaterial,
    },
  } : null; },
  species(){ return listSpecies().map(({ id, label, kind, castGroup, breedGroup, compatibility, studio, meadow, roster, countsAsBear, canPossess, canBreed, canReproduce, hasLife, hasEyes, hasTells, asset, assetManifest, genetics, hybrids }) => ({
    id, label, kind, castGroup, breedGroup, compatibility, studio, meadow, roster, countsAsBear, canPossess, canBreed, canReproduce, hasLife, hasEyes, hasTells, asset, assetManifest, genetics, hybrids,
  })); },
  possessed(){ return possessedBear ? {
    index: bears.indexOf(possessedBear), name: possessedBear.name || '',
    x: +possessedBear.cx.toFixed(2), z: +possessedBear.cz.toFixed(2), y: +possessedBear.cy.toFixed(2),
    airborne: !!possessedBear.airborne,
    camera: { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) },
  } : null; },
  possessInput(x, z){ possessInput.x = clamp(+x || 0, -1, 1); possessInput.y = clamp(+z || 0, -1, 1); return { ...possessInput }; },
  fieldInfo(){
    if (!field) return null;
    return {
      valid: field.valid,
      layoutErrors: field.layoutErrors,
      layoutCheck: field.validateLayout(),
      nav: field.navStats,
      bounds: { shape: field.bounds.shape || 'rect', radius: field.bounds.radius || null },
      homes: field.homes.length,
      doorClearance: field.aeroHomes ? field.aeroHomes.doorClearance : null,
      blades: field.group.userData.grassBlades || 0,
      bushes: field.bushes ? { count: field.bushes.count, segments: field.bushes.segments, lobes: field.bushes.lobes } : null,
      backdrop: field.backdrop ? {
        trees: field.backdrop.trees,
        branches: field.backdrop.branches,
        canopy: field.backdrop.canopy,
        leaves: field.backdrop.leaves,
        hedges: field.backdrop.hedges,
      } : null,
      colliders: field.colliders.length,
      pond: { x:field.pond.x, z:field.pond.z, rx:field.pond.rx, rz:field.pond.rz, waterY:field.pond.waterY, depth:+(POND.waterY - POND_HOLE.floorY).toFixed(2), hole:field.pond.hole },
      trees: field.trees ? field.trees.stats : null,
      horizon: field.horizon ? { towers:field.horizon.towers, windmills:field.horizon.windmills, windmillSpeed:+field.horizon.windmillSpeed().toFixed(3), windmillYaw:+field.horizon.windmillYaw().toFixed(3) } : null,
      wind: field.wind ? { strength:field.wind.strength, dir:field.wind.direction, gust:field.wind.gust } : null,
      food: field.food ? field.food.stats() : null,
      gifts: field.portions ? field.portions.stats() : null,
      hives: field.hives ? field.hives.length : 0,
      waterSpots: field.waterSpots ? field.waterSpots.length : 0,
      emotes: field.emoteCount || 0,
      nature: field.natureControls,
      grass: field.grassControls,
      mist: field.mist,
      camera: { fov:camera.fov, far:camera.far },
      time: sky ? { hours:sky.hours, auto:sky.auto, speed:sky.speed, night:sky.night, look:sky.look, mist:sky.mist } : null,
    };
  },
  setWind(v){
    if (!field || !field.wind) return null;
    if (v && v.strength !== undefined) field.wind.setStrength(v.strength);
    if (v && v.dir) field.wind.setDirection(v.dir.x, v.dir.z);
    if (v && v.gust !== undefined) field.wind.setGust(v.gust);
    syncAeroUI(true);
    return { strength:field.wind.strength, dir:field.wind.direction, gust:field.wind.gust };
  },
  setNature(v){ if (!field) return null; field.setNature(v); syncAeroUI(true); return field.natureControls; },
  splash(x, z, strength){
    if (!field) return null;
    field.splash(Number(x) || 0, Number(z) || 0, Number.isFinite(strength) ? strength : 1);
    return { x:field.pond.x, z:field.pond.z, waterY:field.pond.waterY };
  },
  emote(kind, x, z, y = 1.3){
    if (!field || typeof field.emote !== 'function') return false;
    return field.emote(Number(x) || 0, Number(y) || 1.3, Number(z) || 0, kind || 'heart');
  },
  setMist(v){ if (!sky) return null; sky.setMistOverride(v); return sky.mist; },
  setGrassVisible(v){ if (!field) return null; field.setGrassVisible(v); return v; },
  setWaterCellScale(v){ return field ? field.setWaterCellScale(v) : null; },
  portal(){
    const active = isMeadow();
    const obj = active ? (field && field.studioHouse ? field.studioHouse.portal : null) : (studioReturnPortal ? studioReturnPortal.hit : null);
    const p = active ? (field && field.studioHouse ? field.studioHouse.doorPoint : null) : (studioReturnPortal ? studioReturnPortal.doorPoint : null);
    if (!obj || !p) return null;
    const v = p.clone().project(camera);
    return {
      map: active ? 'field' : 'studio', visible: !!obj.visible,
      screen: { x: +(((v.x + 1) * .5) * canvas.clientWidth + canvas.getBoundingClientRect().left).toFixed(1),
                y: +(((-v.y + 1) * .5) * canvas.clientHeight + canvas.getBoundingClientRect().top).toFixed(1) },
      world: [ +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2) ],
      cam: { x:+camera.position.x.toFixed(2), y:+camera.position.y.toFixed(2), z:+camera.position.z.toFixed(2) },
    };
  },
  setTime(h){ if (!sky) return null; sky.setAuto(false); sky.setTime(+h); if (worlds.field){ worlds.field.time=sky.hours; worlds.field.auto=false; } try { localStorage.removeItem(SKY_LOOK_KEY); } catch (err) {} syncAeroUI(true); return sky.hours; },
  setSkyLook(name){
    if (!sky) return null;
    const n = sky.setLook(name);
    if (n){
      if (worlds.field){ worlds.field.time = sky.hours; worlds.field.auto = false; }
      try { localStorage.setItem(SKY_LOOK_KEY, n); } catch (err) {}
      syncAeroUI(true);
    }
    return n;
  },
  sun(){ return sky ? { dir: sky.sunDir, visible: sky.sunVisible, hours: sky.hours } : null; },
  shadows(){ return {
    renderer: renderer.shadowMap.enabled,
    quality: quality.level,
    targetSize: quality.shadowMap,
    sky: sky && sky.shadowState ? sky.shadowState : null,
    blob: !!(field && field.group && field.group.getObjectByName('meadowShadow')?.visible),
  }; },
  setMap(id){ requestMapSwitch(id); return activeWorld.mapId; },
  save(slot, name){ return saveToSlot(slot, name); },
  load(slot){ return loadFromSlot(slot); },
  saves(){ return listSaves(); },
  deleteSave(slot){ return removeSave(slot); },
  exportSave(){ return JSON.stringify(buildSavePayload()); },
  importSave(json){ return applySavePayload(typeof json === 'string' ? JSON.parse(json) : json); },
  newGame(){ return resetNewGame(); },
  autosave(){ return autosaveNow(); },
  navPath(x0,z0,x1,z1){ if (!field) return null; return field.nav.findPath(x0,z0,x1,z1); },
  navDebug(on){ if (!field) return null; field.navDebug.visible = on === undefined ? !field.navDebug.visible : !!on; return field.navDebug.visible; },
  navStats(){ return field ? field.navStats : null; },
  setMeadowPartVisible(name, v){
    if (!field) return null;
    const found = [];
    scene.traverse(o => { if (o.name === name){ o.visible = !!v; found.push(o.type); } });
    return found.length;
  },
  hideClouds(v){
    if (!sky) return 0;
    sky.setCloudsVisible(!v);
    return 1;
  },
  map(){ return { id:activeWorld.mapId, sky: sky ? { hours:sky.hours, auto:sky.auto, speed:sky.speed } : null, bears:bears.length, glass:glassColony ? glassColony.count : 0, gifts: field && field.portions ? field.portions.stats() : null, launcher:launcher ? launcher.state() : null }; },
  launcherToggle(on){ return launcher ? launcher.toggleAiming(on) : false; },
  launcherAim(x, z){ if (!launcher) return null; launcher.aimAt(x, z); return launcher.state(); },
  launcherFire(){ return launcher ? launcher.fire() : false; },
  launcherMove(x, z){ return launcher ? launcher.placeAt(x, z) : false; },
  launcherFreeSpot(){ return launcher ? launcher.findSpot() : null; },
  launcherScreenOf(x, z){ return launcher ? launcher.screenOf(x, z) : null; },
  launcherMoveMode(on){ return launcher ? launcher.toggleMoveMode(on) : false; },
  world(){ return { map: activeWorld.mapId, wallHeight: getActiveMap().wallHeight, walls: worldWalls.walls.slice(), ground: worldWalls.ground, bounds: [worldWalls.hx, worldWalls.hz], launcher: launcher ? launcher.state() : null }; },
  traits(){ return bears.map(b => ({ uid:b.uid, sex:b.sex, stage:b.stage, scale:b.scale, age:b.age, health:b.health, hunger:b.hunger, thirst:b.thirst, energy:b.energy, social:b.social, affection:b.affection, bonds:{ ...(b.bonds || {}) }, skills:{ ...(b.skills || {}) }, history:(b.history || []).slice(-4), playdates:{ ...(b.playdates || {}) }, bold:b.bold, hopSpeedMin:b.hopSpeedMin, hopSpeedMax:b.hopSpeedMax, pregnant:!!b.pregnant, gestation:b.gestation, mateCooldown:b.mateCooldown, parentUids:(b.parentUids || []).slice(), fatherUid:b.fatherUid || 0, bedtime:b.bedtime, wakeTime:b.wakeTime, sleeping:!!b.sleeping, home:b.home, ai:b.ai ? b.ai.state : null, familyTask:b.ai ? b.ai.familyTask : null, partner:b.ai && b.ai.partner ? b.ai.partner.name : null })); },
  ai(){ return ai ? ai.stats() : null; },
  aiStall(i, state = 'seekFood'){
    const b = bears[i];
    if (!b || !b.ai || !b.active || !field || !field.food) return null;
    const kind = state === 'seekHive' ? 'hive' : null;
    const source = field.food.sources.find(s => s.ripe && (!kind || s.kind === kind));
    if (!source || !field.food.claim(source, b)) return null;
    b.ai.source = source;
    b.ai.state = state;
    b.ai.target = { x: source.approachX, z: source.approachZ };
    b.ai.path = [{ x: source.approachX, z: source.approachZ }];
    b.ai.pathIndex = 0;
    b.ai.moving = false;
    b.ai.nextThink = 999;
    b.ai.noProgressT = 0;
    b.ai.progressX = b.cx;
    b.ai.progressZ = b.cz;
    b.ai.progressTargetX = source.approachX;
    b.ai.progressTargetZ = source.approachZ;
    b.ai.progressDist = Math.hypot(source.approachX - b.cx, source.approachZ - b.cz);
    b.ai.progressPathIndex = 0;
    return { state: b.ai.state, source: source.id, path: b.ai.path.length };
  },
  setAI(v){ return ai ? ai.setEnabled(v) : false; },
  food(){ return field && field.food ? field.food.stats() : null; },
  foodReset(){ if (!field || !field.food) return false; field.food.reset(); return true; },
  foodSources(){ return field && field.food ? field.food.sources.map(s => ({
    id:s.id, kind:s.kind, x:s.x, z:s.z,
    approachX:s.approachX, approachZ:s.approachZ,
    ripe:s.ripe, claimed:!!s.claim, claimedBy:s.claim ? s.claim.uid : null, visualIndex:s.visualIndex,
  })) : []; },
  homes(){ return field ? field.homes.map(h => ({
    name:h.name, x:h.x, z:h.z, yaw:h.yaw,
    door:{ x:h.door.x, z:h.door.z },
  })) : []; },
  setHunger(i, v){ const b = bears[i]; if (!b) return false; b.hunger = clamp(+v || 0, 0, 1); if (b.ai) b.ai.nextThink = 0; return b.hunger; },
  setThirst(i, v){ const b = bears[i]; if (!b) return false; b.thirst = clamp(+v || 0, 0, 1); if (b.ai) b.ai.nextThink = 0; return b.thirst; },
  setStay(i, value){
    const b = bears[i];
    if (!b) return false;
    b.stay = !!value;
    if (b.stay && b.ai) cancelFarewellFor(b);
    return b.stay;
  },
  stay(i){ return !!(bears[i] && bears[i].stay); },
  fading(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.starsState === 'function'
      ? behavior.api.starsState(b) : null;
  },
  starsBlock(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.starsBlockReason === 'function'
      ? behavior.api.starsBlockReason(b) : null;
  },
  starsAdvance(i, seconds){
    const b = bears[i];
    if (!b || !behavior || !behavior.api || typeof behavior.api.starsUpdate !== 'function') return null;
    behavior.api.starsUpdate(b, Math.max(0, Number(seconds) || 0));
    return this.fading(i);
  },
  stars(){
    return behavior && behavior.stars ? behavior.stars.stats() : null;
  },
  mourning(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.mourning === 'function'
      ? behavior.api.mourning(b) : [];
  },
  mourningLabel(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.mourningLabel === 'function'
      ? behavior.api.mourningLabel(b) : null;
  },
  adoption(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.adoption === 'function'
      ? behavior.api.adoption(b) : null;
  },
  guardian(i){
    const info = this.adoption(i);
    return info ? info.guardianUid : null;
  },
  glassAdoption(i){
    const a = glassColony && glassColony.actors[i];
    return a && behavior && behavior.api && typeof behavior.api.adoption === 'function'
      ? behavior.api.adoption(a) : null;
  },
  glassGuardian(i){
    const info = this.glassAdoption(i);
    return info ? info.guardianUid : null;
  },
  skyFarewells(){
    return sky && typeof sky.farewellStats === 'function' ? sky.farewellStats() : null;
  },
  farewellVisuals(){ return farewells.size; },
  farewellDetails(){
    return [...farewells].map(([actor, fx]) => ({
      uid: actor.uid, phase: fx.phase, elapsed: +fx.elapsed.toFixed(2),
      duration: fx.duration, committed: !!actor.fading?.committed,
    }));
  },
  setHealth(i, v){
    const b = bears[i]; if (!b) return false;
    const n = Number(v); if (!Number.isFinite(n)) return false;
    b.health = clamp(n, 1, 100);
    if (b.ai) b.ai.nextThink = 0;
    return b.health;
  },
  setEnergy(i, v){
    const b = bears[i]; if (!b) return false;
    const n = Number(v); if (!Number.isFinite(n)) return false;
    b.energy = clamp(n, 0, 1);
    if (b.ai) b.ai.nextThink = 0;
    return b.energy;
  },
  setSocial(i, v){
    const b = bears[i]; if (!b) return false;
    const n = Number(v); if (!Number.isFinite(n)) return false;
    b.social = clamp(n, 0, 1);
    if (b.ai) b.ai.nextThink = 0;
    return b.social;
  },
  setAffection(i, v){
    const b = bears[i]; if (!b) return false;
    const n = Number(v); if (!Number.isFinite(n)) return false;
    b.affection = clamp(n, 0, 1);
    if (b.ai) b.ai.nextThink = 0;
    return b.affection;
  },
  setBond(i, j, v){
    if (!ai) return false;
    return ai.setBond(bears[i], bears[j], v);
  },
  forceSocial(i, j, accept = true){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugSocial(bears[i], bears[j], accept);
  },
  familyPlay(i, j){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugFamilyPlay(bears[i], bears[j]);
  },
  familyMeal(i){
    if (!behavior) return { ok:false, note:'meadow only' };
    return behavior.forceMeal(bears[i]);
  },
  familyLesson(i, j){
    if (!behavior) return { ok:false, note:'meadow only' };
    return behavior.forceLesson(bears[i], bears[j]);
  },
  forceInvite(i, j, accept = true){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugInvite(bears[i], bears[j], accept);
  },
  forceVisit(i, j){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugVisit(bears[i], bears[j]);
  },
  forceConflict(i, j){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugConflict(bears[i], bears[j]);
  },
  gift(i, j){
    if (!behavior || typeof behavior.forceGift !== 'function') {
      return { ok:false, note:'modules only' };
    }
    return behavior.forceGift(bears[i], bears[j]);
  },
  giftByUid(a, b){
    if (!behavior) return { ok:false, note:'modules only' };
    return behavior.forceGift(actorView.byUid(a), actorView.byUid(b));
  },
  socialByUid(a, b, kind = 'chat'){
    if (!behavior) return { ok:false, note:'modules only' };
    const left = actorView.byUid(a);
    const right = actorView.byUid(b);
    if (kind === 'cuddle') return behavior.forceCuddle(left, right);
    if (kind === 'reconcile') return behavior.forceReconcile(left, right);
    if (kind === 'partner') return behavior.forcePartnership(left, right);
    return behavior.forceChat(left, right);
  },
  groupByUids(leader, others = []){
    if (!behavior) return { ok:false, note:'modules only' };
    return behavior.forceGroup(actorView.byUid(leader),
      (others || []).map(uid => actorView.byUid(uid)).filter(Boolean));
  },
  separate(uid){
    if (!behavior) return false;
    return separatePartnershipFor(actorView.byUid(uid));
  },
  socialFeature(name, value){
    if (!behavior) return false;
    if (value === undefined) return !!(behavior.api && behavior.api.feature(name));
    return behavior.setFeature(name, !!value);
  },
  portions(){
    if (!field || !field.portions) return null;
    return {
      stats: field.portions.stats(),
      list: field.portions.all().map(portion => ({
        id: portion.id, kind: portion.kind, satiation: portion.satiation,
        x: +portion.x.toFixed(2), z: +portion.z.toFixed(2), mapId: portion.mapId,
        claimedBy: portion.claim ? portion.claim.uid : null,
      })),
    };
  },
  carried(){
    return actorView.all().filter(actor => actor.carriedFood).map(actor => ({
      uid: actor.uid, name: actor.name, food: { ...actor.carriedFood },
    }));
  },
  giftVisuals(){
    return giftVisuals && typeof giftVisuals.debug === 'function'
      ? giftVisuals.debug() : null;
  },
  forceMate(i, j){
    if (!ai) return { ok:false, note:'meadow only' };
    return ai.debugMate(bears[i], bears[j]);
  },
  forceBirth(i){
    const b = bears[i];
    if (!b) return false;
    b.pregnant = true;
    b.gestation = 0;
    b.birthRetryT = 0;
    return tryBirth(b);
  },
  glass(){ return glassColony ? glassColony.state() : null; },
  glassSetNeed(i, key, value){ return glassColony ? glassColony.setNeed(i, key, value) : false; },
  glassSetBond(i, uid, value){ return glassColony ? glassColony.setBond(i, uid, value) : false; },
  glassFading(i){
    const a = glassColony && glassColony.actors[i];
    return a && behavior && behavior.api && typeof behavior.api.starsState === 'function'
      ? behavior.api.starsState(a) : null;
  },
  glassStarsBlock(i){
    const a = glassColony && glassColony.actors[i];
    return a && behavior && behavior.api && typeof behavior.api.starsBlockReason === 'function'
      ? behavior.api.starsBlockReason(a) : null;
  },
  glassStarsAdvance(i, seconds){
    const a = glassColony && glassColony.actors[i];
    if (!a || !behavior || !behavior.api || typeof behavior.api.starsUpdate !== 'function') return null;
    behavior.api.starsUpdate(a, Math.max(0, Number(seconds) || 0));
    return this.glassFading(i);
  },
  glassMourning(i){
    const a = glassColony && glassColony.actors[i];
    return a && behavior && behavior.api && typeof behavior.api.mourning === 'function'
      ? behavior.api.mourning(a) : [];
  },
  glassSetStage(i, stage){ return glassColony ? glassColony.setStage(i, stage) : false; },
  glassSetPosition(i, x, z, exact){ return glassColony ? glassColony.setPosition(i, x, z, !!exact) : false; },
  glassWalkTo(i, x, z){ return glassColony ? glassColony.walkTo(i, x, z) : false; },
  glassSetCooldown(i, value){ return glassColony ? glassColony.setCooldown(i, value) : false; },
  glassSetAge(i, value){ return glassColony ? glassColony.setAge(i, value) : false; },
  glassSetPregnant(i, on, gestation){ return glassColony ? glassColony.setPregnant(i, on, gestation) : false; },
  glassReset(i){ return glassColony ? glassColony.resetActor(i) : false; },
  glassShelter(i){ return glassColony ? glassColony.forceShelter(i) : false; },
  glassDragStart(i, x, y){
    const a = glassColony ? glassColony.actors[i] : null;
    return a ? glassColony.beginDrag(a, x, y, camera, renderer) : false;
  },
  glassDragTo(i, x, y, shift){ const a = glassColony ? glassColony.actors[i] : null; return a ? glassColony.drag(a, x, y, camera, renderer, !!shift) : false; },
  glassDragEnd(i){ const a = glassColony ? glassColony.actors[i] : null; return a ? glassColony.endDrag(a) : false; },
  glassFamilyPlay(i){ return glassColony ? glassColony.forceFamilyPlay(i) : false; },
  glassVisit(i, j){ return glassColony ? glassColony.forceVisit(i, j) : false; },
  glassVisitBear(i, j){ return glassColony ? glassColony.forceVisitWithBear(i, bears[j]) : false; },
  glassMate(i, j){ return glassColony ? glassColony.forceMate(i, j) : { ok:false, note:'meadow only' }; },
  glassMateBear(i, j){
    return glassColony ? glassColony.forceMateWithBear(i, bears[j]) : { ok:false, note:'meadow only' };
  },
  bearGlassSocial(i, j){
    return ai && glassColony ? ai.debugSocial(bears[i], glassColony.actors[j], true) : { ok:false, note:'meadow only' };
  },
  bearGlassMate(i, j){
    return ai && glassColony ? ai.beginMatePair(bears[i], glassColony.actors[j]) : false;
  },
  glassBirth(i){ return glassColony ? glassColony.forceBirth(i) : false; },
  glassScreen(i){
    const a = glassColony ? glassColony.actors[i] : null;
    if (!a) return null;
    const v = new THREE.Vector3(a.cx, a.cy, a.cz).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x * .5 + .5) * rect.width + rect.left,
      y: (-v.y * .5 + .5) * rect.height + rect.top,
    };
  },
  glassCanMate(i, j){ return glassColony && ai ? ai.canMatePair(glassColony.actors[i], bears[j]) : false; },
  glassMateDebug(i, j){ return glassColony && ai ? ai.matePairDebug(glassColony.actors[i], bears[j]) : null; },
  setAge(i, v){
    const b = bears[i];
    const n = Number(v);
    if (!b || !Number.isFinite(n)) return false;
    b.age = Math.max(0, n);
    b.pendingStage = stageForAge(b.age);
    if (b.ai) b.ai.nextThink = 0;
    return b.pendingStage;
  },
  setStage(i, stage){
    const b = bears[i];
    if (!b || !STAGE_ORDER.includes(stage)) return false;
    b.age = ageForStage(stage);
    if (b.grabs > 0 || b.airborne || b.inPond) { b.pendingStage = stage; return false; }
    return applyBearStage(b, stage);
  },
  setPregnant(i, on, gestation = GESTATION_TIME){
    const b = bears[i];
    if (!b) return false;
    b.pregnant = !!on;
    b.gestation = b.pregnant ? Math.max(0, Number(gestation) || 0) : 0;
    b.birthRetryT = 0;
    return b.pregnant;
  },
  setCeiling(n){ setCeiling(Number(n), false); return bearCeiling; },
  setEffects(mode){
    setEffectsModeFromUI(mode);
    return effects ? effects.state() : null;
  },
  effectsState(){ return effects ? effects.state() : null; },
  setGodrays(mode){ return effects ? effects.setGodrays(mode) : null; },
  godrays(){ return effects ? effects.state().godrays : null; },
  dofInfo(){ return { hit:dofLastHit, active:dofFocusHas, distance:dofFocusDistance, amount:dofFocusAmount }; },
  setEffectsDof(on){
    setDofFromUI(!!on);
    return effects ? effects.state() : null;
  },
  settings(){ return settingsSummary(); },
  setGraphics(values){ return changeGraphics(values); },
  setProfile(name){ return applyProfile(name); },
  setAdaptive(on){
    quality.adaptive = !!on;
    qualityCooldown = 0;
    markSettingsCustom();
    saveSettings();
    syncSettingsUI();
    return settingsSummary();
  },
  setRenderScale(v){
    markSettingsCustom();
    applyRenderScale(v);
    return settingsSummary();
  },
  setToon(v){
    markSettingsCustom();
    return setToonMode(!!v);
  },
  resetSettings(){
    setToonMode(false);
    return applyProfile('auto');
  },
  setEffectsBloom(v){ return effects ? effects.setBloomScale(v) : null; },
  setEffectsExposure(v){ return effects ? effects.setExposureScale(v) : null; },
  renderProbe(frames = 30){
    const n = Math.max(1, frames | 0);
    const gl = renderer.getContext();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      if (!(effects && effects.render(0.016))){
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      }
      gl.finish();
    }
    return { frames:n, msPerFrame:+((performance.now() - t0) / n).toFixed(2) };
  },
  life(){ return { ...lifeStats, bears: bears.length, glass: glassColony ? glassColony.count : 0 }; },
  setBearState(i, state){
    const b = bears[i];
    if (!b || !ai || !isMeadow()) return { ok:false, note:'meadow only or no bear' };
    return ai.debugState(b, state);
  },
  aiPlan(i){ const b = bears[i]; return b && ai ? ai.plan(b) : null; },
  personalityTraits(i){ const b = bears[i]; return b && b.traits ? { ...b.traits } : null; },
  mood(i){
    const b = bears[i];
    return b && behavior && behavior.api && typeof behavior.api.mood === 'function'
      ? behavior.api.mood(b) : null;
  },
  setMood(i, value){
    const b = bears[i];
    if (!b || !b.ai || !behavior || !behavior.api || !behavior.api.features?.mood) return null;
    const v = clamp(Number(value) || 0, -1, 1);
    b.ai.mood = v;
    b.ai.moodBucket = Math.round(v / .05) * .05;
    b.ai.moodAt = 0;
    behavior.api.invalidateActor(b);
    return this.mood(i);
  },
  thoughts(on){
    if (on !== undefined && behavior && typeof behavior.setFeature === 'function') {
      behavior.setFeature('thoughtBubbles', !!on);
    }
    if (thoughtBubbles) thoughtBubbles.refresh();
    return thoughtBubbles ? thoughtBubbles.state() : null;
  },
  thoughtState(){ return thoughtBubbles ? thoughtBubbles.state() : null; },
  aiRoute(i, on){
    if (!aiDebug || !isMeadow()) return null;
    if (i !== undefined) aiDebug.selectByIndex(i);
    if (on !== undefined) aiDebug.showRoute(!!on);
    return aiDebug.state();
  },
  aiDebug(){ return aiDebug ? aiDebug.state() : null; },
  firework(){ return { rockets:rockets.length, particles:pCount, queued:burstQueue.length, rings:fwRings.length, fwTicks, frameTicks }; },
  launchFirework(usePointer, sx, sz){ return launchFirework(!!usePointer, sx, sz); },
  rocketTargets(){ return rockets.map(r => [ +r.x.toFixed(3), BURST_Y, +r.z.toFixed(3) ]); },
  lastBurst(){ return lastBurst ? { x:+lastBurst.x.toFixed(3), y:+lastBurst.y.toFixed(3), z:+lastBurst.z.toFixed(3) } : null; },
  cam(){ return { yaw:+cam.yaw.toFixed(3), pitch:+cam.pitch.toFixed(3), lookUp:+cam.lookUp.toFixed(3), dist:+cam.dist.toFixed(2),
                  target:[+cam.goal.x.toFixed(2),+cam.goal.y.toFixed(2),+cam.goal.z.toFixed(2)], moved:cam.moved, frozen:!!cam.frozen }; },
  tipBear(i, deg){
    const b = bears[i]; if (!b) return false;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), deg*Math.PI/180);
    b.q.copy(q);
    const pts = new Float32Array(NP*3);
    let minY = 1e9;
    for (let k=0;k<NP;k++){
      _v3.set(REST[k*3], REST[k*3+1], REST[k*3+2]).applyQuaternion(q);
      pts[k*3]=_v3.x; pts[k*3+1]=_v3.y; pts[k*3+2]=_v3.z;
      minY = Math.min(minY, b.cy + _v3.y);
    }
    const lift = 0.02 - minY;
    for (let k=0;k<NP;k++){
      b.px[k] = b.cx + pts[k*3];
      b.py[k] = b.cy + pts[k*3+1] + lift;
      b.pz[k] = b.cz + pts[k*3+2];
      b.vx[k]=b.vy[k]=b.vz[k]=0;
      b.snap[k*3]=b.px[k]; b.snap[k*3+1]=b.py[k]; b.snap[k*3+2]=b.pz[k];
    }
    b.vol=1; b.volSlow=1; b.sy=1; b.sx=1;
    uploadBearPositions(b, true);
    b.needsBuild=true;
    return true;
  },
  poseUp(i){ const b = bears[i]; if (!b) return null; return +(new THREE.Vector3(0,1,0).applyQuaternion(b.q)).y.toFixed(2); },
  lastGrabs(){ const out=[]; for (const g of grabs.values()) out.push({bear:bears.indexOf(g.bear), idx:g.grabIdx, dbg:!!g.dbg}); return out; },
  setQuality(level){ quality.level = clamp(level|0, 0, LEVELS.length-1); applyQuality(); },
  eyeInfo(bi){
    const out = [];
    for (let k=0;k<3;k++){
      const m = new THREE.Matrix4();
      eyes.getMatrixAt(bi*3+k, m);
      out.push([+m.elements[12].toFixed(4), +m.elements[13].toFixed(4), +m.elements[14].toFixed(4)]);
    }
    const b = bears[bi];
    return {
      parts: out,
      snapHead: b ? [+b.snap[0].toFixed(4), +b.snap[1].toFixed(4), +b.snap[2].toFixed(4)] : null,
      liveHead: b ? [+b.px[0].toFixed(4), +b.py[0].toFixed(4), +b.pz[0].toFixed(4)] : null,
    };
  },
  render(){ renderer.render(scene,camera); },
  three(){ return { THREE, scene, camera, renderer }; },
  msn: {
    load(){ return msnPrototype ? msnPrototype.load() : null; },
    state(){ return msnPrototype ? msnPrototype.state() : null; },
    play(name, once){ return msnPrototype ? msnPrototype.play(name, once) : null; },
    opacity(v){ return msnPrototype ? msnPrototype.setOpacity(v) : null; },
    clarity(v){ return msnPrototype ? msnPrototype.setClarity(v) : null; },
    roughness(v){ return msnPrototype ? msnPrototype.setRoughness(v) : null; },
    speed(v){ return msnPrototype ? msnPrototype.setSpeed(v) : null; },
    visible(v){ return msnPrototype ? msnPrototype.setVisible(v) : null; },
    reset(){ return msnPrototype ? msnPrototype.reset() : null; },
    cast(mode){ return applyStudioCast(mode); },
    hit(x, y){ return msnPrototype ? msnPrototype.hitTest(x, y) : null; },
    hover(x, y){ return msnPrototype ? msnPrototype.hoverAt(x, y) : false; },
    screen(){ return msnPrototype ? msnPrototype.screen() : null; },
    select(v){ return msnPrototype ? msnPrototype.select(v) : null; },
    activate(){ return msnPrototype ? msnPrototype.activate() : null; },
    beginDrag(x, y, shift){ return msnPrototype ? msnPrototype.beginDrag(x, y, shift) : false; },
    drag(x, y, dx, dy, shift){ return msnPrototype ? msnPrototype.drag(x, y, dx, dy, shift) : null; },
    endDrag(){ return msnPrototype ? msnPrototype.endDrag() : null; },
    focus(){ return focusMsn(); },
  },
  start(){ return startGame(); },
  menu(open){ setMenu(open); return menuOpen; },
  pause(v){ setPaused(v === undefined ? !paused : !!v); return paused; },
  paused(){ return paused; },
  returnToMenu(){ return returnToMenu(); },
};

for (const btn of document.querySelectorAll('#raceCast [data-cast]')){
  btn.addEventListener('click', () => applyStudioCast(btn.dataset.cast));
}
document.getElementById('raceFrame')?.addEventListener('click', focusMsn);
document.getElementById('raceControl')?.addEventListener('click', toggleGummyPossession);
syncStudioCastUI();
syncRaceControlUI();

initMenu();
if (new URLSearchParams(location.search).get('autostart') === '1') {
  setMenu(false);
  startGame().catch(err => {
    setMenu(true);
    setMenuNote('Could not start: ' + (err && err.message || err));
    console.error('autostart failed', err);
  });
}
