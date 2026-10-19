import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const TAG = process.env.TAG || 'race';
const LOOK = process.env.LOOK || 'glass';
const LOOK_QUERY = LOOK === 'alpha' ? '&race=alpha' : '';
const MOBILE = process.env.MOBILE === '1';
const W = MOBILE ? 390 : 1440;
const H = MOBILE ? 844 : 900;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });
const launched = await launchBrowser({ port: Number(process.env.PORT) || undefined });
const browser = await connectBrowser(launched);
const page = await browser.openPage({
  url: `${GAME}?autostart=1${LOOK_QUERY}`,
  width: W, height: H, mobile: MOBILE,
});
const send = (method, params = {}, timeout = 120000) =>
  browser.send(method, params, page.sessionId, timeout);
const evaluate = expression => page.evaluate(expression, 120000);
const waitFor = (expression, timeout = 30000) => page.waitFor(expression, timeout);
const shot = name => page.screenshot(`${ROOT}/.dev-shots/race_${TAG}_${name}.png`);
const pageErrors = browser.pageErrors;
const report = { tag: TAG, mobile: MOBILE, pageErrors };
try {
  await waitFor('!!window.__gummy?.booted', 120000);
  await sleep(600);

  const species = await evaluate('window.__gummy.species()');
  const speciesIds = species.map(item => item.id).sort().join(',');
  const glassDef = species.find(item => item.id === 'glass');
  const bearDef = species.find(item => item.id === 'bear');
  const msnDef = species.find(item => item.id === 'msn');
  if (speciesIds !== 'bear,glass,msn' || glassDef?.kind !== 'skinned') {
    throw new Error(`species registry failed ${JSON.stringify(species)}`);
  }
  if (!bearDef?.canReproduce || !msnDef?.canReproduce || !glassDef?.canReproduce || !glassDef?.hasLife || !glassDef?.meadow) {
    throw new Error(`species reproduction flags failed ${JSON.stringify(species)}`);
  }
  if (!bearDef.genetics?.loci?.includes('rigidity') || !bearDef.hybrids?.length || !msnDef.compatibility?.includes('glass')) {
    throw new Error(`species DNA metadata failed ${JSON.stringify(species)}`);
  }
  report.species = species;

  const fieldState = await evaluate('window.__gummy.msn.state()');
  const fieldRequests = await evaluate(`performance.getEntriesByType('resource').filter(e => e.name.endsWith('msn.glb')).length`);
  const fieldBears = await evaluate('({ count: window.__gummy.map().bears, glass: window.__gummy.map().glass, nan: window.__gummy.stats().nan, gummy: window.__gummy.bears.filter(b => b.species === \'msn\').length })');
  if (fieldState.visible || fieldState.ready) throw new Error('Studio MSN prototype loaded in the Meadow');
  if (fieldRequests < 1) throw new Error(`Meadow Glass actor did not request the GLB: ${fieldRequests}`);
  if (fieldBears.count !== 8 || fieldBears.gummy !== 2 || fieldBears.nan) throw new Error(`Meadow bear regression ${JSON.stringify(fieldBears)}`);
  const fieldSim = await evaluate(`(() => {
    window.__gummy.sim(0.6, 8);
    const s = window.__gummy.stats();
    return { nan: s.nan, bears: s.bears, minY: s.minY, maxY: s.maxY };
  })()`);
  if (fieldSim.nan || fieldSim.bears !== 8 || !Number.isFinite(fieldSim.minY) || !Number.isFinite(fieldSim.maxY)) {
    throw new Error(`Meadow physics regression ${JSON.stringify(fieldSim)}`);
  }
  const fieldRoster = await evaluate(`(() => {
    const g = window.__gummy.bears.find(b => b.species === 'msn');
    const bear = window.__gummy.bears.find(b => b.species === 'bear');
    return {
      rows: document.querySelectorAll('#buddyList .buddyRow').length,
      msn: [...document.querySelectorAll('#buddyList .buddyName')].some(el => el.textContent.includes('MSN Buddy')),
      ai: g && g.ai ? g.ai.state : null,
      bearDna: bear && window.__gummy.genome(window.__gummy.bears.indexOf(bear)),
      gummyDna: g && window.__gummy.genome(window.__gummy.bears.indexOf(g)),
    };
  })()`);
  if (fieldRoster.rows !== 10 || !fieldRoster.msn || !fieldRoster.ai || fieldBears.glass !== 2) {
    throw new Error(`Gummy Meadow roster/AI failed ${JSON.stringify(fieldRoster)}`);
  }
  if (Math.abs(fieldRoster.bearDna.dna.rigidityScale - 1) > .001 ||
      Math.abs(fieldRoster.gummyDna.dna.rigidityScale - 1) > .001 ||
      fieldRoster.bearDna.dna.material !== 'bearGummy' ||
      fieldRoster.gummyDna.dna.material !== 'msnGummy') {
    throw new Error(`Default DNA traits changed ${JSON.stringify({ bear: fieldRoster.bearDna, gummy: fieldRoster.gummyDna })}`);
  }
  const meadowShot = await shot('meadow_gummy');
  report.field = { state: fieldState, requests: fieldRequests, bears: fieldBears, sim: fieldSim, roster: fieldRoster, meadowShot };

  const sleepControl = await evaluate(`(() => {
    const g = window.__gummy;
    const b = g.bears[0];
    if (!b.ai) g.setBearState(0, 'wander');
    b.sleeping = true;
    b.ai.state = 'sleep';
    const sleepingBefore = b.sleeping;
    const entered = g.possess(0);
    const possessed = g.possessed();
    const sleepingAfter = b.sleeping;
    g.exitPossession();
    return { sleepingBefore, entered, possessed, sleepingAfter };
  })()`);
  if (!sleepControl.sleepingBefore || !sleepControl.entered || !sleepControl.possessed || sleepControl.sleepingAfter) {
    throw new Error(`sleeping control failed ${JSON.stringify(sleepControl)}`);
  }
  await evaluate("window.__gummy.selectBear(0)");
  await evaluate("window.__gummy.setBearState(0, 'wander'); window.__gummy.setHunger(0, .98); window.__gummy.directive(0, 'drink')");
  await sleep(900);
  const refusal = await evaluate(`({
    emotes: window.__gummy.fieldInfo().emotes,
    status: window.__gummy.bears[0].ai && window.__gummy.bears[0].ai.directiveStatus,
    home: window.__gummy.bears[0].home,
  })`);
  if (!refusal.emotes) throw new Error(`house refusal did not emit an emote ${JSON.stringify(refusal)}`);
  const refusalShot = await shot('meadow_refusal');
  await evaluate("window.__gummy.setHunger(0, .3); window.__gummy.cancelDirectives(0)");

  const gummyLife = await evaluate(`(() => {
    const g = window.__gummy;
    const index = g.bears.findIndex(b => b.active && b.species === 'msn');
    if (index < 0) return { found: false };
    g.setBearState(index, 'wander');
    for (let i = 0; i < 40 && (g.bears[index].airborne || g.bears[index].grabs > 0 || g.bears[index].inPond); i++) g.sim(.12, 8);
    const baby = g.setStage(index, 'baby');
    const babyState = { stage: g.bears[index].stage, scale: +g.bears[index].scale.toFixed(2), verts: g.bears[index].vertCount };
    g.setStage(index, 'adult');
    const before = g.bears.filter(b => b.species === 'msn').length;
    const born = g.forceBirth(index);
    const after = g.bears.filter(b => b.species === 'msn').length;
    const child = g.bears[g.bears.length - 1];
    return {
      found: true, index, baby, babyState,
      adultStage: g.bears[index].stage,
      born, before, after,
      childSpecies: child && child.species,
      childRig: child && child.rig && child.rig.species,
      childStage: child && child.stage,
      childScale: child && +child.scale.toFixed(2),
      childGenomeVersion: child && child.genome && child.genome.version,
      childGenomeSpecies: child && child.genome && Object.keys(child.genome.species),
      childPhenotype: child && child.phenotype && child.phenotype.resolvedSpecies,
    };
  })()`);
  if (!gummyLife.found || !gummyLife.baby || gummyLife.babyState.stage !== 'baby' || gummyLife.babyState.verts <= 0) {
    throw new Error(`Gummy stage growth failed ${JSON.stringify(gummyLife)}`);
  }
  if (gummyLife.adultStage !== 'adult' || !gummyLife.born || gummyLife.after !== gummyLife.before + 1 ||
      gummyLife.childSpecies !== 'msn' || gummyLife.childRig !== 'msn' || gummyLife.childStage !== 'baby' ||
      gummyLife.childGenomeVersion !== 1 || !gummyLife.childGenomeSpecies.includes('msn') ||
      gummyLife.childPhenotype !== 'msn') {
    throw new Error(`Gummy birth/rig inheritance failed ${JSON.stringify(gummyLife)}`);
  }
  const crossBreeding = await evaluate(`(() => {
    const g = window.__gummy;
    const mother = g.bears.find(b => b.active && b.species === 'bear' && b.sex === 'F' && b.stage === 'adult' && !b.pregnant);
    const father = g.bears.find(b => b.active && b.species === 'msn' && b.sex === 'M' && b.stage === 'adult');
    if (!mother || !father) return { found: false };
    const motherIndex = g.bears.indexOf(mother);
    const fatherIndex = g.bears.indexOf(father);
    // Exercise the future Glass-parent material rule without needing a Glass
    // actor in the Meadow yet.
    father.genome.genes.material = 'glass';
    const mate = g.forceMate(motherIndex, fatherIndex);
    g.sim(3.4, 8);
    const pregnant = g.bears.find(b => b.active && b.pregnant && b.uid === mother.uid);
    if (!pregnant) return { found: true, motherIndex, fatherIndex, mate, born: false };
    const pregnantIndex = g.bears.indexOf(pregnant);
    const before = g.bears.length;
    const born = g.forceBirth(pregnantIndex);
    const child = g.bears[g.bears.length - 1];
    return {
      found: true, motherIndex, fatherIndex, mate, pregnantIndex, born,
      before, after: g.bears.length,
      childSpecies: child && child.species,
      childRig: child && child.rig && (child.rig.species || 'bear'),
      childGenomeSpecies: child && child.genome && Object.keys(child.genome.species),
      childPhenotype: child && child.phenotype && child.phenotype.resolvedSpecies,
      childMaterial: child && child.genome && child.genome.genes.material,
    };
  })()`);
  if (!crossBreeding.found || !crossBreeding.born || crossBreeding.after !== crossBreeding.before + 1 ||
      !['bear', 'msn'].includes(crossBreeding.childSpecies) ||
      crossBreeding.childRig !== crossBreeding.childSpecies ||
      !crossBreeding.childGenomeSpecies.includes(crossBreeding.childSpecies) ||
      crossBreeding.childPhenotype !== crossBreeding.childSpecies ||
      crossBreeding.childMaterial !== 'glass') {
    throw new Error(`cross-species birth failed ${JSON.stringify(crossBreeding)}`);
  }
  report.meadow = { sleepControl, refusal, refusalShot, gummyLife, crossBreeding };

  await evaluate("window.__gummy.setMap('studio')");
  await waitFor("window.__gummy.lastMap === 'studio'", 15000);
  await waitFor('window.__gummy.msn.state().ready', 30000);
  const initial = await evaluate('window.__gummy.msn.state()');
  if (initial.clips.length !== 10) throw new Error(`clip count ${initial.clips.length}`);
  if (initial.meshes !== 3) throw new Error(`mesh count ${initial.meshes}`);
  if (initial.bones !== 9) throw new Error(`bone count ${initial.bones}`);
  if (initial.look !== LOOK) throw new Error(`look ${initial.look} !== ${LOOK}`);
  if (LOOK === 'glass') {
    if (initial.material?.transmission !== 1) throw new Error(`glass transmission ${initial.material?.transmission}`);
    if (initial.material?.transparent) throw new Error('glass material is alpha-transparent');
    if (initial.material?.opacity !== 1) throw new Error('glass opacity is not 1');
    if (initial.material?.roughness > .1) throw new Error('glass roughness is not low');
    if (!(initial.material?.thickness > 0)) throw new Error('glass thickness is missing');
    if (!(initial.material?.clearcoat > .5)) throw new Error('glass has no reflective coat');
    if (!(initial.material?.envMapIntensity > 1)) throw new Error('glass environment reflection is weak');
    if (initial.material?.reflectivity < .9) throw new Error('glass reflectivity is low');
  } else {
    if (initial.material?.transmission !== 0) throw new Error('alpha transmission still enabled');
    if (!initial.material?.transparent) throw new Error('alpha material is not transparent');
  }
  if (!initial.visible) throw new Error('model is not visible in Studio');
  report.look = LOOK;
  report.initial = initial;

  await sleep(650);
  report.idleAdvance = await evaluate('window.__gummy.msn.state().time');
  if (!(report.idleAdvance > 0)) throw new Error('mixer did not advance');

  const idleShot = await shot('studio_idle');

  await evaluate('document.querySelector(\'#raceCast [data-cast="bears"]\').click()');
  await sleep(350);
  const castBears = await evaluate(`(() => ({
    state: window.__gummy.msn.state(),
    body: document.body.classList.contains('msn-only'),
    card: getComputedStyle(document.getElementById('card')).visibility,
    header: getComputedStyle(document.querySelector('.studioHeader')).visibility,
    bear: !!(window.__gummy.bears[0] && window.__gummy.bears[0].mesh.visible),
    gummy: !!(window.__gummy.bears.find(b => b.species === 'msn')?.mesh.visible),
    panel: document.getElementById('raceLab').hidden,
  }))()`);
  report.castBears = castBears;
  if (castBears.state.visible) throw new Error('Bears mode left MSN visible');
  if (castBears.panel) throw new Error('Bears mode hid the Race Lab panel');
  if (!castBears.bear) throw new Error('Bears mode hid the bears');
  if (castBears.gummy) throw new Error('Bears mode left the Gummy visible');
  if (castBears.card !== 'visible') throw new Error('Bears mode hid the bear card');
  const bearsShot = await shot('studio_bears_only');

  await evaluate('document.querySelector(\'#raceCast [data-cast="msn"]\').click()');
  await sleep(350);
  const castMsn = await evaluate(`(() => ({
    state: window.__gummy.msn.state(),
    body: document.body.classList.contains('msn-only'),
    card: getComputedStyle(document.getElementById('card')).visibility,
    header: getComputedStyle(document.querySelector('.studioHeader')).visibility,
    bear: !!(window.__gummy.bears[0] && window.__gummy.bears[0].mesh.visible),
    gummy: !!(window.__gummy.bears.find(b => b.species === 'msn')?.mesh.visible),
    panel: document.getElementById('raceLab').hidden,
  }))()`);
  report.castMsn = castMsn;
  if (!castMsn.state.visible) throw new Error('MSN mode hid the prototype');
  if (castMsn.panel) throw new Error('MSN mode hid the Race Lab panel');
  if (castMsn.bear) throw new Error('MSN mode left bear meshes visible');
  if (!castMsn.gummy) throw new Error('MSN mode hid the Gummy');
  if (castMsn.card !== 'hidden') throw new Error('MSN mode left the bear card visible');
  if (!castMsn.body) throw new Error('MSN mode missing body class');
  const msnShot = await shot('studio_msn_only');

  const gummy = await evaluate(`(() => {
    const g = window.__gummy;
    const index = g.bears.findIndex(b => b.active && b.species === 'msn');
    if (index < 0) return { index, found: false };
    const b = g.bears[index];
    const { camera, renderer, THREE } = g.three();
    const v = new THREE.Vector3(b.cx, b.cy, b.cz).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return {
      index, found: true, np: b.np, rig: b.rig.species, verts: b.vertCount,
      visible: b.mesh.visible, meshVisible: b.mesh.visible,
      materialColor: b.material.color.getHexString(),
      genomeVersion: b.genome && b.genome.version,
      phenotypeSpecies: b.phenotype && b.phenotype.resolvedSpecies,
      dna: {
        rigidityScale: b.dnaRigidityScale, dampingScale: b.dnaDampingScale,
        stretchScale: b.dnaStretchScale, material: b.dnaMaterial,
      },
      x: b.cx, y: b.cy, z: b.cz,
      screen: { x: (v.x * .5 + .5) * r.width + r.left, y: (-v.y * .5 + .5) * r.height + r.top },
    };
  })()`);
  if (!gummy.found) throw new Error('Gummy MSN missing from the Studio');
  if (gummy.np !== 24 || gummy.rig !== 'msn' || gummy.verts <= 0) throw new Error(`Gummy rig invalid ${JSON.stringify(gummy)}`);
  if (gummy.genomeVersion !== 1 || gummy.phenotypeSpecies !== 'msn') throw new Error(`Gummy genome/phenotype missing ${JSON.stringify(gummy)}`);
  if (Math.abs(gummy.dna.rigidityScale - 1) > .001 || Math.abs(gummy.dna.dampingScale - 1) > .001 ||
      Math.abs(gummy.dna.stretchScale - 1) > .001 || gummy.dna.material !== 'msnGummy') {
    throw new Error(`Gummy default DNA expression changed behavior ${JSON.stringify(gummy.dna)}`);
  }
  if (!gummy.visible) throw new Error('Gummy MSN is not visible in MSN cast');
  if (gummy.materialColor === initial.material.color) throw new Error('Glass and Gummy colours are identical');
  await evaluate(`window.__gummy.selectBear(${gummy.index})`);
  await sleep(350);
  const gummyShot = await shot('studio_gummy');
  // Isolate the Gummy pick on a narrow portrait viewport where the Glass
  // silhouette can overlap the same screen centre.
  await evaluate('window.__gummy.msn.visible(false)');
  await sleep(200);
  const gummyPoint = await evaluate(`(() => {
    const g = window.__gummy;
    const b = g.bears[${gummy.index}];
    const { camera, renderer, THREE } = g.three();
    const v = new THREE.Vector3(b.cx, b.cy, b.cz).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x * .5 + .5) * r.width + r.left, y: (-v.y * .5 + .5) * r.height + r.top };
  })()`);
  const gx = Math.round(gummyPoint.x), gy = Math.round(gummyPoint.y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gx, y: gy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(120);
  const gummyGrab = await evaluate(`({ grabs: window.__gummy.lastGrabs().length, y: window.__gummy.bears[${gummy.index}].cy })`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gx + 40, y: gy - 10, button: 'left', buttons: 1 });
  await sleep(180);
  const gummyMoved = await evaluate(`({ y: window.__gummy.bears[${gummy.index}].cy, nan: !Number.isFinite(window.__gummy.bears[${gummy.index}].cy) })`);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gx + 40, y: gy - 10, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(180);
  if (!gummyGrab.grabs) throw new Error('Gummy MSN did not accept a grab');
  if (gummyMoved.nan) throw new Error('Gummy MSN produced NaN');
  const clickPoint = await evaluate(`(() => {
    const g = window.__gummy;
    const b = g.bears[${gummy.index}];
    const { camera, renderer, THREE } = g.three();
    const v = new THREE.Vector3(b.cx, b.cy, b.cz).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: (v.x * .5 + .5) * r.width + r.left, y: (-v.y * .5 + .5) * r.height + r.top };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(clickPoint.x), y: Math.round(clickPoint.y), button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(clickPoint.x), y: Math.round(clickPoint.y), button: 'left', buttons: 0, clickCount: 1 });
  await sleep(220);
  const clickReaction = await evaluate(`window.__gummy.gummy(${gummy.index})`);
  if (!clickReaction.pose) throw new Error(`Gummy click reaction missing ${JSON.stringify(clickReaction)}`);
  await evaluate(`(() => {
    const b = window.__gummy.bears[${gummy.index}];
    b.gummyPose = null;
    b.gummyIdleT = 0;
    window.__gummy.sim(0.5, 8);
  })()`);
  const idleReaction = await evaluate(`window.__gummy.gummy(${gummy.index})`);
  if (!idleReaction.pose) throw new Error(`Gummy idle think missing ${JSON.stringify(idleReaction)}`);
  const forcedReaction = await evaluate(`window.__gummy.gummyReact(${gummy.index}, 'Wave')`);
  if (!forcedReaction) throw new Error('Gummy explicit reaction failed');
  await sleep(450);
  const forcedState = await evaluate(`window.__gummy.gummy(${gummy.index})`);
  if (!forcedState.pose || forcedState.pose.kind !== 'Wave') throw new Error(`Gummy Wave reaction missing ${JSON.stringify(forcedState)}`);
  const gummyPoseShot = await shot('studio_gummy_wave');
  await evaluate('window.__gummy.msn.visible(true)');
  await evaluate("document.getElementById('resetView').click()");
  await sleep(250);
  const saveResult = await evaluate("window.__gummy.save('slot1', 'Gummy test')");
  if (!saveResult?.ok) throw new Error(`Gummy save failed ${JSON.stringify(saveResult)}`);
  const loadResult = await evaluate("window.__gummy.load('slot1')");
  if (!loadResult?.ok) throw new Error(`Gummy load failed ${JSON.stringify(loadResult)}`);
  await sleep(500);
  const loadedGummy = await evaluate(`(() => {
    const b = window.__gummy.bears.find(item => item.species === 'msn');
    return b ? {
      np: b.np, rig: b.rig.species, verts: b.vertCount, name: b.name,
      genomeVersion: b.genome && b.genome.version,
      genomeSpecies: b.genome && Object.keys(b.genome.species),
      phenotypeSpecies: b.phenotype && b.phenotype.resolvedSpecies,
    } : null;
  })()`);
  if (!loadedGummy || loadedGummy.np !== 24 || loadedGummy.rig !== 'msn' ||
      loadedGummy.genomeVersion !== 1 || !loadedGummy.genomeSpecies.includes('msn') ||
      loadedGummy.phenotypeSpecies !== 'msn') {
    throw new Error(`Gummy did not survive save/load ${JSON.stringify(loadedGummy)}`);
  }
  report.gummy = { gummy, gummyShot, gummyGrab, gummyMoved, clickReaction, idleReaction, forcedReaction, forcedState, gummyPoseShot, saveResult, loadResult, loadedGummy };

  const beforeControl = await evaluate('window.__gummy.possessed()');
  await evaluate("document.getElementById('raceControl').click()");
  await sleep(220);
  const control = await evaluate('window.__gummy.possessed()');
  if (!control || control.index !== gummy.index || beforeControl) {
    throw new Error(`Gummy control did not start ${JSON.stringify({ beforeControl, control })}`);
  }
  const controlStart = { x: control.x, z: control.z };
  const controlShot = await shot('studio_gummy_control');
  await evaluate("window.__gummy.possessInput(0, -1); window.__gummy.sim(1.0, 8)");
  const controlled = await evaluate('window.__gummy.possessed()');
  const controlMoved = Math.hypot(controlled.x - controlStart.x, controlled.z - controlStart.z);
  if (controlMoved < .05) throw new Error(`Gummy possession did not move (${controlMoved})`);
  await evaluate("window.__gummy.possessInput(0, 0); document.getElementById('raceControl').click()");
  await sleep(180);
  const controlExit = await evaluate('window.__gummy.possessed()');
  if (controlExit) throw new Error('Gummy control did not exit');
  report.control = { beforeControl, control, controlled, controlMoved, controlExit, controlShot };
  await evaluate("document.getElementById('resetView').click()");
  await sleep(250);

  const point = await evaluate('window.__gummy.msn.screen()');
  if (!point || point.x < 0 || point.y < 0) throw new Error('no MSN screen point');
  const px = Math.round(point.x), py = Math.round(point.y);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: 'none' });
  await sleep(180);
  const hover = await evaluate(`({ hovered: window.__gummy.msn.state().hovered, cursor: document.getElementById('cursor').classList.contains('move') })`);
  if (!hover.hovered || !hover.cursor) throw new Error(`hover failed ${JSON.stringify(hover)}`);
  const hoverShot = await shot('studio_hover');

  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(220);
  const click = await evaluate(`({ state: window.__gummy.msn.state(), grabs: window.__gummy.lastGrabs().length })`);
  if (!click.state.selected || click.grabs) throw new Error(`click failed ${JSON.stringify(click)}`);
  if (!['Nod', 'Wave', 'Cheer'].includes(click.state.active)) throw new Error(`unexpected click clip ${click.state.active}`);
  const selectedShot = await shot('studio_selected');

  await evaluate("document.getElementById('raceReset').click()");
  await evaluate("document.getElementById('resetView').click()");
  await sleep(300);
  const grabPoint = await evaluate('window.__gummy.msn.screen()');
  const gpx = Math.round(grabPoint.x), gpy = Math.round(grabPoint.y);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: gpx, y: gpy, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(120);
  const glassGrab = await evaluate('window.__gummy.msn.state()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gpx + 25, y: gpy - 180, button: 'left', buttons: 1 });
  await sleep(220);
  const glassLift = await evaluate('window.__gummy.msn.state()');
  const glassGrabShot = await shot('studio_glass_grab');
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: gpx + 25, y: gpy - 180, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
  const glassDrop = await evaluate('window.__gummy.msn.state()');
  if (!glassGrab.body || !glassGrab.grabbing) throw new Error(`Glass Box3D grab did not start ${JSON.stringify(glassGrab)}`);
  if (glassLift.position[1] <= .08) throw new Error(`Glass did not lift ${JSON.stringify(glassLift)}`);
  if (glassDrop.grabbing || !Number.isFinite(glassDrop.position[1])) throw new Error(`Glass drop state invalid ${JSON.stringify(glassDrop)}`);

  await evaluate("document.getElementById('raceReset').click()");
  await evaluate("document.getElementById('resetView').click()");
  await evaluate("document.getElementById('raceDrag').value='turn'; document.getElementById('raceDrag').dispatchEvent(new Event('change'))");
  await sleep(300);
  const turnPoint = await evaluate('window.__gummy.msn.screen()');
  const tx = Math.round(turnPoint.x), ty = Math.round(turnPoint.y);
  const beforeDrag = await evaluate('window.__gummy.msn.state()');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tx, y: ty, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: tx + 70, y: ty, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tx + 70, y: ty, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(180);
  const afterDrag = await evaluate('window.__gummy.msn.state()');
  if (Math.abs(afterDrag.yaw - beforeDrag.yaw) < .15) throw new Error(`drag did not turn ${beforeDrag.yaw} -> ${afterDrag.yaw}`);

  const point2 = await evaluate('window.__gummy.msn.screen()');
  const beforeMove = await evaluate('window.__gummy.msn.state()');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(point2.x), y: Math.round(point2.y), button: 'left', buttons: 1, clickCount: 1, modifiers: 8 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(point2.x) + 42, y: Math.round(point2.y) - 18, button: 'left', buttons: 1, modifiers: 8 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(point2.x) + 42, y: Math.round(point2.y) - 18, button: 'left', buttons: 0, clickCount: 1, modifiers: 8 });
  await sleep(180);
  const afterMove = await evaluate('window.__gummy.msn.state()');
  const moved = Math.hypot(afterMove.position[0] - beforeMove.position[0], afterMove.position[2] - beforeMove.position[2]);
  if (moved < .05) throw new Error(`shift-drag did not move (${moved})`);

  const camBefore = await evaluate('window.__gummy.cam()');
  await evaluate("document.getElementById('raceFrame').click()");
  await sleep(180);
  const camAfter = await evaluate('window.__gummy.cam()');
  if (!(camAfter.dist < camBefore.dist)) throw new Error(`frame did not zoom ${camBefore.dist} -> ${camAfter.dist}`);
  const glassCloseShot = await shot('studio_glass_close');

  await evaluate("document.getElementById('raceReset').click()");
  await sleep(180);
  const resetState = await evaluate('window.__gummy.msn.state()');
  if (resetState.selected || Math.abs(resetState.yaw) > .001) throw new Error(`reset did not clear pose ${JSON.stringify(resetState)}`);
  if (Math.hypot(resetState.position[0] - castMsn.state.position[0], resetState.position[2] - castMsn.state.position[2]) > .05) throw new Error('reset did not restore placement');
  await evaluate("document.getElementById('resetView').click()");
  await sleep(180);
  report.interaction = { point, hover, hoverShot, selectedShot, glassCloseShot, click, glassGrab, glassLift, glassGrabShot, glassDrop, beforeDrag, afterDrag, beforeMove, afterMove, moved, camBefore, camAfter, resetState };
  const interactionShot = await shot('studio_interaction');

  await evaluate('document.querySelector(\'#raceCast [data-cast="both"]\').click()');
  await sleep(350);
  const castBoth = await evaluate('window.__gummy.msn.cast()');
  if (!castBoth.msnVisible || !castBoth.bearsVisible) throw new Error('Both mode did not restore both casts');
  report.cast = { castBears, castMsn, castBoth, shots: { bearsShot, msnShot } };

  if (!MOBILE) {
    const sideTest = await evaluate(`(() => {
      const g = window.__gummy;
      const { scene, THREE } = g.three();
      const root = scene.getObjectByName('msnRacePrototype');
      const materials = new Set();
      root.traverse(o => {
        if (!o.isMesh) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const material of list) if (material) materials.add(material);
      });
      for (const material of materials) { material.side = THREE.FrontSide; material.needsUpdate = true; }
      return { materials: materials.size };
    })()`);
    await sleep(500);
    const frontStats = await evaluate('window.__gummy.stats()');
    const frontShot = await shot('studio_frontside');
    await evaluate(`(() => {
      const g = window.__gummy;
      const { scene, THREE } = g.three();
      const root = scene.getObjectByName('msnRacePrototype');
      root.traverse(o => {
        if (!o.isMesh) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        for (const material of list) if (material) { material.side = THREE.DoubleSide; material.needsUpdate = true; }
      });
    })()`);
    await sleep(300);
    report.frontSide = { ...sideTest, stats: frontStats, shot: frontShot };
  }
  const wave = await evaluate("window.__gummy.msn.play('Wave', false)");
  await sleep(700);
  const waveShot = await shot('studio_wave');
  const cheer = await evaluate("window.__gummy.msn.play('Cheer', true)");
  await sleep(1250);
  const cheerShot = await shot('studio_cheer');
  await sleep(1100);
  report.onceReturn = await evaluate('window.__gummy.msn.state()');
  if (report.onceReturn.active !== 'Idle') throw new Error(`one-shot did not return to Idle: ${report.onceReturn.active}`);

  const opaque = await evaluate('window.__gummy.msn.clarity(1)');
  await sleep(350);
  const opaqueShot = await shot('studio_clarity_100');
  const clear = await evaluate('window.__gummy.msn.clarity(.25)');
  await sleep(350);
  const clearShot = await shot('studio_clarity_025');
  await evaluate(LOOK === 'glass' ? 'window.__gummy.msn.clarity(1)' : 'window.__gummy.msn.opacity(.55)');
  await sleep(250);

  await evaluate("window.__gummy.msn.play('Idle', false)");
  const visibleStats = await evaluate('window.__gummy.stats()');
  const visibleProbe = await evaluate('window.__gummy.renderProbe(20)');
  await evaluate('window.__gummy.msn.visible(false)');
  await sleep(250);
  const hiddenStats = await evaluate('window.__gummy.stats()');
  const hiddenProbe = await evaluate('window.__gummy.renderProbe(20)');
  await evaluate('window.__gummy.msn.visible(true)');
  await sleep(250);
  report.performance = { visibleStats, hiddenStats, visibleProbe, hiddenProbe };

  await evaluate("document.getElementById('uiToggle').click()");
  await sleep(250);
  const hiddenUiShot = await shot('studio_ui_hidden');
  await evaluate("document.getElementById('uiToggle').click()");
  await sleep(200);

  if (MOBILE) {
    const mobileShot = await shot('studio_mobile');
    report.mobile = { shot: mobileShot };
  } else {
    await evaluate(`(() => {
      const g = window.__gummy;
      const { camera } = g.three();
      camera.position.set(3.5, 1.55, 4.0);
      camera.lookAt(1.62, .82, 1.02);
      camera.updateMatrixWorld(true);
      g.freezeCamera(true);
    })()`);
    await sleep(350);
    const closeShot = await shot('studio_closeup');
    const back = await evaluate(`(() => {
      const g = window.__gummy;
      const { camera } = g.three();
      camera.position.set(1.62, 1.55, -2.8);
      camera.lookAt(1.62, .82, 1.02);
      camera.updateMatrixWorld(true);
    })()`);
    await sleep(350);
    const backShot = await shot('studio_back');
    await evaluate('window.__gummy.freezeCamera(false)');
    report.views = { closeShot, back, backShot };
  }

  await evaluate("window.__gummy.setMap('field')");
  await waitFor("window.__gummy.lastMap === 'field'", 15000);
  const backField = await evaluate(`(() => ({
    state: window.__gummy.msn.state(),
    panel: document.getElementById('raceLab').hidden,
    card: getComputedStyle(document.getElementById('card')).visibility,
    body: document.body.classList.contains('msn-only'),
    bear: !!(window.__gummy.bears[0] && window.__gummy.bears[0].mesh.visible),
    glError: window.__gummy.three().renderer.getContext().getError(),
  }))()`);
  if (backField.state.visible) throw new Error('MSN still visible in Meadow');
  if (!backField.panel) throw new Error('Race panel still visible in Meadow');
  if (backField.body) throw new Error('MSN-only class remained in Meadow');
  if (backField.card !== 'visible') throw new Error('Bear card remained hidden in Meadow');
  if (!backField.bear) throw new Error('Bears remained hidden in Meadow');
  report.backField = backField;

  await evaluate("window.__gummy.msn.cast('msn')");
  await send('Page.navigate', { url: `${GAME}?autostart=1${LOOK_QUERY}` });
  await waitFor('!!window.__gummy?.booted', 120000);
  await sleep(600);
  await evaluate("window.__gummy.setMap('studio')");
  await waitFor("window.__gummy.lastMap === 'studio'", 15000);
  await waitFor('window.__gummy.msn.state().ready', 30000);
  await sleep(350);
  const persisted = await evaluate(`(() => ({
    body: document.body.classList.contains('msn-only'),
    card: getComputedStyle(document.getElementById('card')).visibility,
    bear: !!(window.__gummy.bears[0] && window.__gummy.bears[0].mesh.visible),
    panel: document.getElementById('raceLab').hidden,
    activeCast: document.querySelector('#raceCast .on')?.dataset.cast,
  }))()`);
  if (!persisted.body) throw new Error('MSN-only cast did not persist');
  if (persisted.card !== 'hidden') throw new Error('Persisted MSN-only left the card visible');
  if (persisted.bear) throw new Error('Persisted MSN-only left bears visible');
  if (persisted.panel) throw new Error('Persisted MSN-only hid the panel');
  if (persisted.activeCast !== 'msn') throw new Error('Persisted cast control state is wrong');
  report.persistence = persisted;
  await evaluate("window.__gummy.msn.cast('both')");

  await send('Page.navigate', { url: `${GAME}?autostart=1&race=off` });
  await waitFor('!!window.__gummy?.booted', 120000);
  await sleep(600);
  await evaluate("window.__gummy.setMap('studio')");
  await waitFor("window.__gummy.map().id === 'studio'", 15000);
  await sleep(800);
  const disabled = await evaluate(`(() => ({
    state: window.__gummy.msn.state(),
    panel: document.getElementById('raceLab').hidden,
    requests: performance.getEntriesByType('resource').filter(e => e.name.endsWith('msn.glb')).length,
    gummy: window.__gummy.bears.filter(b => b.species === 'msn' && b.mesh.visible).length,
  }))()`);
  if (disabled.state.enabled) throw new Error('race=off did not disable the prototype');
  if (disabled.state.visible || disabled.state.ready) throw new Error('race=off loaded the prototype');
  if (!disabled.panel) throw new Error('race=off showed the panel');
  if (disabled.requests !== 0) throw new Error('race=off requested the GLB');
  if (disabled.gummy) throw new Error('race=off left the Gummy visible');
  report.disabled = disabled;

  report.errors = pageErrors;
  report.shots = { idleShot, waveShot, cheerShot, opaqueShot, clearShot, hiddenUiShot };
  console.log('STATE', JSON.stringify(report));
  console.log('ERRORS', JSON.stringify(pageErrors).slice(0, 1200));
} catch (error) {
  report.failure = String(error.stack || error);
  console.log('STOP', report.failure.slice(0, 1600));
  process.exitCode = 1;
} finally {
  await writeFile(`${ROOT}/.dev-shots/race-test-${TAG}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
