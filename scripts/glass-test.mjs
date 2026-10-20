import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const TARGET = new URL(GAME);
TARGET.searchParams.set('autostart', '1');
if (process.env.BEHAVIORS) TARGET.searchParams.set('behaviors', process.env.BEHAVIORS);
const TAG = process.env.TAG || 'glass';
const RUN_ID = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
const SCENARIO = process.env.SCENARIO || 'all';
const FAST = process.env.FAST === '1';
if (!['all', 'drag', 'growth', 'social', 'hover', 'needs', 'night', 'lifecycle'].includes(SCENARIO)) {
  throw new Error(`Unknown SCENARIO: ${SCENARIO}`);
}
const selected = name => SCENARIO === 'all' || SCENARIO === name;
const REPORT_PATH = `${ROOT}/.dev-shots/glass-test-${TAG}-${RUN_ID}.json`;
const W = 1440, H = 900;
let phase = 'boot';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });
const launched = await launchBrowser({ port: Number(process.env.PORT) || undefined });
const browser = await connectBrowser(launched);
const page = await browser.openPage({
  url: TARGET.href,
  width: W, height: H, mobile: false,
});
const send = (method, params = {}, timeout = 120000) =>
  browser.send(method, params, page.sessionId, timeout);
const timings = [];
const evaluate = async (expression, timeout = 30000) => {
  const start = performance.now();
  try {
    return await page.evaluate(expression, timeout);
  } catch (error) {
    error.phase = phase;
    error.expression = String(expression).slice(0, 240);
    throw error;
  } finally {
    timings.push({ phase, ms: +(performance.now() - start).toFixed(1), expression: String(expression).slice(0, 100) });
  }
};
const waitFor = (expression, timeout = 30000) => page.waitFor(expression, timeout);
const capture = process.env.SHOTS !== '0';
const shot = async name => {
  if (!capture) return null;
  const paused = await page.evaluate('window.__gummy.paused()');
  try {
    if (paused) {
      await page.evaluate('window.__gummy.pause(false)');
      await sleep(100);
    }
    return await page.screenshot(`${ROOT}/.dev-shots/glass_${TAG}_${name}.png`);
  } finally {
    if (paused) await page.evaluate('window.__gummy.pause(true)');
  }
};
const pageErrors = browser.pageErrors;
const report = { tag: TAG, runId: RUN_ID, scenario: SCENARIO, fast: FAST, reportPath: REPORT_PATH, pageErrors };
try {
  phase = 'boot';
  console.log(`PHASE ${phase}`);
  await waitFor('!!window.__gummy?.booted', 120000);
  phase = 'glass-roster';
  console.log(`PHASE ${phase}`);
  await waitFor('window.__gummy.glass()?.actors?.length === 2', 30000);
  phase = 'glass-ready';
  console.log(`PHASE ${phase}`);
  await waitFor('window.__gummy.glass().actors.every(a => a.ready)', 300000);
  await sleep(800);
  phase = 'boot-state';
  console.log(`PHASE ${phase}`);

  const boot = await evaluate(`(() => {
    const g = window.__gummy;
    return {
      map: g.map(),
      glass: g.glass(),
      roster: {
        rows: document.querySelectorAll('#buddyList .buddyRow').length,
        glassRows: [...document.querySelectorAll('#buddyList .buddyName')].filter(el => (el.textContent || '').includes('Glass ')).length,
        online: document.getElementById('onlineCount')?.textContent,
      },
    };
  })()`);
  report.boot = boot;
  phase = 'boot-gl';
  boot.gl = await evaluate('window.__gummy.three().renderer.getContext().getError()', 5000);
  if (boot.gl) throw new Error(`Glass boot WebGL error: ${boot.gl}`);
  if (boot.map.id !== 'field' || boot.glass.count !== 2 || boot.glass.actors.some(a => a.state === null)) {
    throw new Error(`Glass boot failed ${JSON.stringify(boot)}`);
  }
  if (boot.glass.actors.some(a => a.material.color == null || a.material.transmission < .5)) {
    throw new Error(`Glass material failed ${JSON.stringify(boot.glass)}`);
  }
  if (boot.roster.rows !== 10 || boot.roster.glassRows !== 2 || boot.roster.online !== '10 online') {
    throw new Error(`Glass roster failed ${JSON.stringify(boot.roster)}`);
  }
  report.boot = boot;
  report.shots = { meadow: await shot('meadow') };

  if (selected('drag')) {
  phase = 'drag';
  const dragScreen = await evaluate('window.__gummy.glassScreen(0)');
  const dragBefore = await evaluate('window.__gummy.glass().actors[0].position');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragScreen.x, y: dragScreen.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragScreen.x + 70, y: dragScreen.y - 35, button: 'left', buttons: 1 });
  const targetUpdate = await evaluate(`(() => {
    const g = window.__gummy;
    const before = g.glass().actors[0].position;
    g.glassDragTo(0, ${dragScreen.x + 85}, ${dragScreen.y - 35});
    return { before, after: g.glass().actors[0].position };
  })()`);
  if (targetUpdate.before.some((v, i) => v !== targetUpdate.after[i])) {
    throw new Error(`Glass pointer update teleported body ${JSON.stringify(targetUpdate)}`);
  }
  await sleep(240);
  let held = await evaluate('window.__gummy.glass().actors[0]');
  if (!held.grabbing) {
    // The Glass hovers while the pointer is moving; retry once against its
    // current screen position rather than asserting on a stale hit point.
    const retryScreen = await evaluate('window.__gummy.glassScreen(0)');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: retryScreen.x, y: retryScreen.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: retryScreen.x + 70, y: retryScreen.y - 35, button: 'left', buttons: 1 });
    await sleep(260);
    held = await evaluate('window.__gummy.glass().actors[0]');
  }
  report.shots.held = await shot('held');
  if (!held.grabbing || Math.abs(held.rotation[0]) + Math.abs(held.rotation[2]) < .01) {
    throw new Error(`Glass spring grab did not tilt ${JSON.stringify(held)}`);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragScreen.x + 105, y: dragScreen.y - 55, button: 'left', buttons: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragScreen.x + 70, y: dragScreen.y - 35, button: 'left', buttons: 0, clickCount: 1 });
  const releaseState = await evaluate('window.__gummy.glass().actors[0]');
  if (!releaseState.freeBody) throw new Error(`Glass throw did not enter rigid-body mode ${JSON.stringify(releaseState)}`);
  await sleep(250);
  const dragAfter = await evaluate('window.__gummy.glass().actors[0]');
  const dragMoved = Math.hypot(dragAfter.position[0] - dragBefore[0], dragAfter.position[2] - dragBefore[2]);
  if (dragMoved < .1 || dragAfter.grabbing || dragAfter.grabs !== 0 ||
      Math.abs(dragAfter.rotation?.[0] || 0) + Math.abs(dragAfter.rotation?.[2] || 0) < .01) {
    throw new Error(`Glass drag/tumble failed ${JSON.stringify({ dragScreen, dragBefore, dragAfter, dragMoved })}`);
  }
  await sleep(700);
  await evaluate('window.__gummy.freeze(true)');
  const liftScreen = await evaluate('window.__gummy.glassScreen(0)');
  const liftBefore = await evaluate('window.__gummy.glass().actors[0].position[1]');
  const afterPress = await evaluate(`window.__gummy.glassDragStart(0, ${liftScreen.x}, ${liftScreen.y})`);
  await evaluate(`window.__gummy.glassDragTo(0, ${liftScreen.x}, ${liftScreen.y - 55}, true)`);
  await page.waitFor(`window.__gummy.glass().actors[0].position[1] > ${liftBefore + .08}`, 3000);
  const liftHeld = await evaluate('window.__gummy.glass().actors[0]');
  await evaluate('window.__gummy.glassDragEnd(0)');
  await sleep(250);
  const liftAfter = await evaluate('window.__gummy.glass().actors[0]');
  await evaluate('window.__gummy.freeze(false)');
  if (!afterPress || !(liftHeld.position[1] > liftBefore + .08) || liftAfter.grabbing) {
    throw new Error(`Glass vertical drag failed ${JSON.stringify({ liftBefore, afterPress, liftHeld, liftAfter })}`);
  }
  report.drag = {
    screen: dragScreen, moved: +dragMoved.toFixed(3),
    after: dragAfter.position, coasting: dragAfter.coasting,
    lift: { before: liftBefore, held: liftHeld.position[1], after: liftAfter.position[1] },
  };
  }

  if (FAST) await evaluate(`(() => {
    const g = window.__gummy;
    g.pause(true);
    window.__glassTestSim = g.sim;
    g.sim = (seconds) => window.__glassTestSim.call(g, seconds, 0);
  })()`);

  if (selected('growth')) {
  phase = 'growth';
  const growth = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(11);
    g.glassSetStage(0, 'baby');
    g.glassSetAge(0, 500);
    g.sim(1.0, 8);
    const day = g.glass().actors[0];
    g.setTime(23);
    g.sim(1.0, 8);
    const night = g.glass().actors[0];
    return { day: day.stage, night: night.stage, scale: night.scale };
  })()`);
  if (growth.day !== 'baby' || growth.night !== 'adult') {
    throw new Error(`Glass night growth failed ${JSON.stringify(growth)}`);
  }
  report.growth = growth;
  }

  if (selected('social')) {
  phase = 'social';
  const reciprocal = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    const glass = g.glass().actors[0];
    const bear = g.bears.find(b => b.active && b.species === 'bear' && b.stage === 'adult' && !b.sleeping);
    if (!glass || !bear) return { found: false };
    const bi = g.bears.indexOf(bear);
    const gi = 0;
    const before = (glass.bonds || {})[String(bear.uid)] || 0;
    const started = g.bearGlassSocial(bi, gi);
    g.sim(5.0, 8);
    const after = g.glass().actors[gi];
    const bond = (after.bonds || {})[String(bear.uid)] || 0;
    return {
      found: true, started, before, bond,
      glassState: after.state, bearState: g.bears[bi].ai && g.bears[bi].ai.state,
      glassBonds: after.bonds,
    };
  })()`);
  if (!reciprocal.found || !reciprocal.started?.ok || !(reciprocal.bond > reciprocal.before)) {
    throw new Error(`Reciprocal Glass social failed ${JSON.stringify(reciprocal)}`);
  }
  report.reciprocal = reciprocal;
  }

  if (selected('hover')) {
  phase = 'hover';
  const hover = await evaluate(`(() => {
    const g = window.__gummy;
    g.sim(1.0, 8);
    const s = g.glass();
    return {
      y: s.actors.map(a => a.position[1]),
      states: s.actors.map(a => a.state),
      visible: s.actors.map(a => a.ready),
    };
  })()`);
  if (hover.y.some(y => !(y > .12)) || hover.states.some(s => !s)) {
    throw new Error(`Glass hover failed ${JSON.stringify(hover)}`);
  }
  report.hover = hover;
  }

  if (selected('needs')) {
  phase = 'needs';
  const needs = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    g.glassSetNeed(0, 'hunger', .92);
    g.glassSetNeed(0, 'thirst', .20);
    g.sim(5.0, 8);
    const food = g.glass().actors[0];
    g.glassSetNeed(0, 'hunger', .20);
    g.glassSetNeed(0, 'thirst', .94);
    g.sim(5.0, 8);
    const water = g.glass().actors[0];
    return { food: food.state, water: water.state, foodNeed: food.hunger, waterNeed: water.thirst };
  })()`);
  const foodOk = ['seekFood', 'eat'].includes(needs.food) || needs.foodNeed < .80;
  const waterOk = ['seekWater', 'drink'].includes(needs.water) || needs.waterNeed < .80;
  if (!foodOk || !waterOk) {
    throw new Error(`Glass needs failed ${JSON.stringify(needs)}`);
  }
  report.needs = needs;
  }

  if (selected('night')) {
  phase = 'night';
  const night = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(23);
    g.sim(1.2, 8);
    return { hours: g.map().sky.hours, glass: g.glass().actors.map(a => ({ state: a.state, inside: a.inside })) };
  })()`);
  if (!night.glass.every(a => !a.inside)) throw new Error(`Glass sheltered at night ${JSON.stringify(night)}`);
  report.night = night;
  }

  if (selected('lifecycle')) {
  phase = 'lifecycle';
  const dayStage = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(11);
    g.glassSetStage(0, 'baby');
    const baby = g.glass().actors[0];
    g.glassSetStage(0, 'adult');
    const adult = g.glass().actors[0];
    return { baby: { stage: baby.stage, scale: baby.scale }, adult: { stage: adult.stage, scale: adult.scale } };
  })()`);
  if (dayStage.baby.stage !== 'baby' || !(dayStage.baby.scale < dayStage.adult.scale)) {
    throw new Error(`Glass stage failed ${JSON.stringify(dayStage)}`);
  }
  report.dayStage = dayStage;

  const glassBirth = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    const before = g.glass().actors;
    g.glassReset(0);
    g.glassReset(1);
    g.glassSetPregnant(0, false);
    g.glassSetPregnant(1, false);
    g.glassSetNeed(0, 'hunger', .2);
    g.glassSetNeed(0, 'thirst', .2);
    g.glassSetNeed(1, 'hunger', .2);
    g.glassSetNeed(1, 'thirst', .2);
    const a = before[0], b = before[1];
    const f = a.sex === 'F' ? 0 : 1;
    const m = 1 - f;
    const mate = g.glassMate(f, m);
    g.sim(3.6, 8);
    const after = g.glass().actors;
    const pregnant = after[f];
    const born = g.glassBirth(f);
    const child = g.glass().actors.find(x => x.uid !== a.uid && x.uid !== b.uid) || null;
    return { mate, beforeCount: before.length, afterCount: after.length, f, pregnant: pregnant && pregnant.pregnant, born, count: g.glass().count, child: child && { stage: child.stage, species: child.species, color: child.material.color, scale: child.scale } };
  })()`);
  if (!glassBirth.mate.ok || !glassBirth.pregnant || !glassBirth.born || glassBirth.count !== 3 || !glassBirth.child || glassBirth.child.stage !== 'baby') {
    throw new Error(`Glass birth failed ${JSON.stringify(glassBirth)}`);
  }
  report.glassBirth = glassBirth;
  const sibling = await evaluate(`(() => {
    const g = window.__gummy;
    const first = g.glass().actors[2];
    g.glassReset(0);
    g.glassSetPregnant(0, true, 0);
    const born = g.glassBirth(0);
    const liveFirst = g.glass().actors.find(a => a.uid === first.uid);
    const second = g.glass().actors[g.glass().actors.length - 1];
    return {
      born,
      firstUid: first.uid,
      secondUid: second.uid,
      secondParents: second.parentUids,
      bond: second.bonds?.[String(first.uid)] || 0,
      reverse: liveFirst && liveFirst.bonds?.[String(second.uid)] || 0,
    };
  })()`);
  if (!sibling.born || !sibling.secondParents?.length || !(sibling.bond > 0) || !(sibling.reverse > 0)) {
    throw new Error(`Glass sibling bond failed ${JSON.stringify(sibling)}`);
  }
  report.sibling = sibling;
  const familyPlay = await evaluate(`(() => {
    const g = window.__gummy;
    g.glassReset(2);
    g.glassReset(3);
    g.glassSetNeed(2, 'hunger', .2);
    g.glassSetNeed(2, 'thirst', .2);
    g.glassSetNeed(3, 'hunger', .2);
    g.glassSetNeed(3, 'thirst', .2);
    const started = g.glassFamilyPlay(2);
    const actor = g.glass().actors[2];
    const playmate = g.glass().actors.find(x => x.name === actor.partner);
    const playmateUid = playmate ? String(playmate.uid) : null;
    const before = playmateUid ? (actor.bonds?.[playmateUid] || 0) : 0;
    g.sim(20.0, 8);
    const a = g.glass().actors[2];
    const b = playmateUid ? g.glass().actors.find(x => String(x.uid) === playmateUid) : null;
    return {
      started,
      mate: actor.partner,
      before,
      after: a && playmateUid ? (a.bonds?.[playmateUid] || 0) : 0,
      state: a && a.state,
      familyPlay: !!(a && a.familyPlay),
      playmateKind: a && a.playmateKind,
      a: a && { uid:a.uid, pos:a.position, target:a.playdateTarget, home:a.playdateHome, moving:a.moving, state:a.state, partner:a.partner },
      b: b && { uid:b.uid, pos:b.position, target:b.playdateTarget, home:b.playdateHome, moving:b.moving, state:b.state, partner:b.partner },
    };
  })()`);
  if (!familyPlay.started || !(familyPlay.after > familyPlay.before)) {
    throw new Error(`Glass family play failed ${JSON.stringify(familyPlay)}`);
  }
  report.familyPlay = familyPlay;
  await waitFor('window.__gummy.glass().actors.every(a => a.ready)', 30000);
  const babyVisual = await evaluate(`(() => {
    const c = window.__gummy.glass().actors[2];
    return { color: c.material.color, genomeColor: c.genome.genes.color, scale: c.scale, stage: c.stage };
  })()`);
  if (!babyVisual.color || babyVisual.color !== babyVisual.genomeColor) {
    throw new Error(`Glass baby colour failed ${JSON.stringify(babyVisual)}`);
  }
  report.glassBirth.child = babyVisual;
  await evaluate(`(() => {
    const g = window.__gummy;
    const a = g.glass().actors[2];
    const { camera } = g.three();
    camera.position.set(a.position[0] + 1.8, 1.1, a.position[2] + 1.8);
    camera.lookAt(a.position[0], Math.max(.2, a.position[1] - .25), a.position[2]);
    camera.updateMatrixWorld(true);
    g.freezeCamera(true);
  })()`);
  await sleep(250);
  report.shots.baby = await shot('baby');
  await evaluate('window.__gummy.freezeCamera(false)');

  const family = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(8);
    const childIndex = g.glass().actors.length - 1;
    const childBefore = g.glass().actors[childIndex];
    const motherIndex = g.glass().actors.findIndex(a => (childBefore.parentUids || []).includes(a.uid));
    const mother = g.glass().actors[motherIndex];
    if (!mother) return { childIndex, missingParent: childBefore.parentUids };
    // Clear any family task/inside state on the mother so this check measures
    // the follow link rather than an unrelated scheduling race.
    g.glassReset(motherIndex);
    const motherNow = g.glass().actors[motherIndex];
    g.glassSetPosition(childIndex, motherNow.position[0] + 5.5, motherNow.position[2] + 5.5);
    const placed = g.glass().actors[childIndex];
    const before = Math.hypot(placed.position[0] - motherNow.position[0], placed.position[2] - motherNow.position[2]);
    g.sim(4.0, 8);
    let afterChild = g.glass().actors[childIndex];
    let afterMother = g.glass().actors.find(a => a.uid === mother.uid);
    if (!afterChild.familyTask && afterChild.state !== 'follow') {
      // A previous task cooldown or a missed think tick can leave the child
      // standing. Re-place it once and give the follow decision another window.
      g.glassSetPosition(childIndex, afterMother.position[0] + 5.5, afterMother.position[2] + 5.5);
      g.sim(5.0, 8);
      afterChild = g.glass().actors[childIndex];
      afterMother = g.glass().actors.find(a => a.uid === mother.uid);
    }
    const after = Math.hypot(afterChild.position[0] - afterMother.position[0], afterChild.position[2] - afterMother.position[2]);
    const task = afterChild.familyTask || null;
    const taskPartner = task && task.partnerUid
      ? g.glass().actors.find(a => a.uid === task.partnerUid) || null
      : null;
    const taskPartnerIsSibling = !!(taskPartner && taskPartner.uid !== mother.uid &&
      (taskPartner.parentUids || []).some(uid => (afterChild.parentUids || []).includes(uid)));
    const parentActors = [...g.glass().actors, ...g.bears].filter(a =>
      (afterChild.parentUids || []).includes(a.uid));
    const parentFollow = !!afterChild.follow && parentActors.some(a => a.name === afterChild.follow);
    return {
      childIndex, before, after, state: afterChild.state,
      parents: afterChild.parentUids,
      follow: afterChild.follow,
      parentFollow,
      mother: mother.name,
      motherState: afterMother.state,
      motherInside: !!afterMother.inside,
      motherSleeping: !!afterMother.sleeping,
      motherTask: afterMother.familyTask ? afterMother.familyTask.id : null,
      motherAvailable: !afterMother.inside && !afterMother.sleeping && !afterMother.familyTask,
      home: afterChild.home,
      motherHome: afterMother.home,
      motherBond: (mother.bonds || {})[String(afterChild.uid)] || 0,
      task: task ? { id: task.id, phase: task.phase, partnerUid: task.partnerUid } : null,
      taskPartner: taskPartner ? taskPartner.name : null,
      taskPartnerIsSibling,
    };
  })()`);
  // A family task can legitimately claim the child before it reaches the
  // mother. A sibling playdate/lesson is valid evidence even though follow is
  // no longer the mother; otherwise the follow link and a non-increasing
  // distance are the evidence.
  const familyTask = family.state === 'familyTask';
  const taskClaim = familyTask && (family.taskPartnerIsSibling || !family.task?.partnerUid);
  const pursued = familyTask
    ? taskClaim || family.after <= family.before + .1
    : family.state === 'wander' && !family.motherAvailable
      ? true
      : family.after < family.before - .2;
  const unavailableWander = family.state === 'wander' && !family.motherAvailable;
  if (!family.parents?.length || !family.home || !pursued ||
      !(family.state === 'follow' || family.state === 'wander' || family.state === 'familyTask') ||
      (family.state === 'follow' && !family.parentFollow) ||
      (family.state === 'wander' && !unavailableWander) ||
      (familyTask && family.follow !== family.mother && !taskClaim && !family.parentFollow) ||
      family.motherBond <= 0) {
    throw new Error(`Glass family follow failed ${JSON.stringify(family)}`);
  }
  report.family = family;

  const visits = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    g.glassReset(0);
    g.glassReset(1);
    const started = g.glassVisit(0, 1);
    const initial = g.glass().actors.slice(0, 2).map(a => ({ state: a.state, phase: a.visitPhase, home: a.visitHome }));
    g.sim(1.0, 8);
    const traveling = g.glass().actors.slice(0, 2).map(a => ({ state: a.state, phase: a.visitPhase, arrived: a.visitArrived }));
    g.sim(24, 8);
    const pair = g.glass().actors.slice(0, 2);
    const done = pair.map(a => ({ state: a.state, phase: a.visitPhase }));
    const bond = pair[0].bonds?.[String(pair[1].uid)] || 0;
    return { started, initial, traveling, done, bond };
  })()`);
  if (!visits.started || visits.initial.some(a => a.state !== 'visit') ||
      visits.traveling.some(a => !['visit'].includes(a.state)) ||
      visits.done.some(a => a.state === 'visit') || !(visits.bond > 0)) {
    throw new Error(`Glass visit failed ${JSON.stringify(visits)}`);
  }
  report.visits = visits;

  const mixedVisit = await evaluate(`(() => {
    const g = window.__gummy;
    g.glassReset(0);
    g.glassReset(1);
    g.setTime(12);
    g.sim(.5, 8);
    const actors = g.glass().actors;
    const glass = actors.find(a => a.stage === 'adult' && !a.inside) ||
      actors.find(a => a.stage === 'adult');
    const bear = g.bears.find(b => b.active && b.species === 'bear' && b.stage === 'adult') ||
      g.bears.find(b => b.active && b.species === 'bear');
    if (bear) { bear.sleeping = false; bear.inPond = false; bear.grabs = 0; }
    if (!glass || !bear) return { found: false };
    const gi = glass.index;
    const bi = g.bears.indexOf(bear);
    const started = g.glassVisitBear(gi, bi);
    g.sim(2.0, 8);
    const state = g.glass().actors[gi].state;
    return { found: true, started, state, bearState: bear.ai && bear.ai.state };
  })()`);
  if (!mixedVisit.found || !mixedVisit.started ||
      !['visit', 'wander'].includes(mixedVisit.state)) {
    throw new Error(`Glass/Bear visit failed ${JSON.stringify(mixedVisit)}`);
  }
  report.mixedVisit = mixedVisit;

  const shelter = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    g.glassShelter(1);
    let dayState = null;
    for (let step = 0; step < 18; step++) {
      g.sim(2, 8);
      const day = g.glass().actors[1];
      if (day.inside && day.doorFade <= .15) {
        dayState = { inside: day.inside, state: day.state, fade: day.doorFade };
        break;
      }
    }
    if (!dayState) {
      const day = g.glass().actors[1];
      dayState = { inside: day.inside, state: day.state, fade: day.doorFade };
    }
    g.setTime(23);
    g.sim(1.2, 8);
    const night = g.glass().actors[1];
    return { day: dayState, night: { inside: night.inside, state: night.state, fade: night.doorFade } };
  })()`);
  if (!shelter.day.inside || shelter.night.inside ||
      !(shelter.day.fade <= .15) || !(shelter.night.fade >= .85)) {
    throw new Error(`Glass day shelter failed ${JSON.stringify(shelter)}`);
  }
  report.shelter = shelter;

  const cross = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    g.sim(2.5, 8);
    const actors = g.glass().actors;
    const glass = actors.find(a => a.stage === 'adult' && !a.pregnant);
    if (!glass) return { found: false, reason: 'no glass', actors: actors.map(a => ({ uid: a.uid, stage: a.stage, pregnant: a.pregnant, inside: a.inside })) };
    const gi = glass.index;
    const setNeeds = [
      g.glassSetNeed(gi, 'hunger', .2),
      g.glassSetNeed(gi, 'thirst', .2),
      g.glassSetNeed(gi, 'health', 100),
      g.glassSetNeed(gi, 'energy', 1),
      g.glassSetCooldown(gi, 0),
    ];
    const afterSet = g.glass().actors[gi];
    const bear = g.bears.find(b => b.active && b.species === 'bear' && b.stage === 'adult' &&
      b.sex !== glass.sex && !b.pregnant && !b.sleeping && !b.inPond && b.grabs === 0);
    if (!bear) return { found: false, reason: 'no bear', glass: { uid: glass.uid, sex: glass.sex }, bears: g.bears.map((b, i) => ({ i, species: b.species, sex: b.sex, stage: b.stage, sleeping: b.sleeping, hunger: b.hunger, thirst: b.thirst, energy: b.energy, health: b.health, pregnant: b.pregnant, state: b.ai && b.ai.state })) };
    const bi = g.bears.indexOf(bear);
    g.bears[bi].mateCooldown = 0;
    g.setHunger(bi, .2);
    g.setThirst(bi, .2);
    g.setEnergy(bi, 1);
    g.setHealth(bi, 100);
    const beforeBears = g.bears.length;
    const beforeGlass = g.glass().count;
    const canMate = g.glassCanMate(gi, bi);
    const mateDebug = g.glassMateDebug(gi, bi);
    const mate = g.glassMateBear(gi, bi);
    g.sim(3.8, 8);
    const pg = g.glass().actors[gi];
    const born = mate.ok ? g.glassBirth(gi) : false;
    const newBear = g.bears[g.bears.length - 1];
    const newGlass = g.glass().actors[g.glass().count - 1];
    const bearBorn = g.bears.length > beforeBears && newBear && newBear.parentUids?.includes(glass.uid);
    const child = bearBorn ? newBear : newGlass;
    return {
      found: true, gi, bi, setNeeds,
      afterSet: afterSet && { uid: afterSet.uid, hunger: afterSet.hunger, thirst: afterSet.thirst },
      canMate, mateDebug, mate,
      all: g.glass().actors.map(a => ({ index: a.index, uid: a.uid, thirst: a.thirst, hunger: a.hunger, stage: a.stage })),
      glass: glass && { uid: glass.uid, hunger: glass.hunger, thirst: glass.thirst, energy: glass.energy, health: glass.health, stage: glass.stage, sex: glass.sex, inside: glass.inside, sleeping: glass.sleeping, grabs: glass.grabs, inPond: glass.inPond, pregnant: glass.pregnant },
      bear: { hunger: bear.hunger, thirst: bear.thirst, energy: bear.energy, health: bear.health, state: bear.ai && bear.ai.state, sleeping: bear.sleeping, inPond: bear.inPond, grabs: bear.grabs, pregnant: bear.pregnant },
      pregnant: pg && pg.pregnant, born,
      beforeBears, beforeGlass, afterBears: g.bears.length, afterGlass: g.glass().count,
      childSpecies: child && child.species,
      childStage: child && child.stage,
      childMaterial: child && child.genome && child.genome.genes.material,
      childColor: child && child.genome && child.genome.genes.color,
      childRig: child && child.rig && (child.rig.species || 'bear'),
    };
  })()`);
  const crossGrew = cross.afterBears + cross.afterGlass > cross.beforeBears + cross.beforeGlass;
  if (!cross.found || !cross.mate.ok || !cross.born || !crossGrew ||
      !['bear', 'glass'].includes(cross.childSpecies) || cross.childStage !== 'baby' ||
      cross.childMaterial !== 'glass' ||
      (cross.childSpecies === 'glass' && (!cross.childColor || cross.childColor === '#a8e5ff'))) {
    throw new Error(`Glass cross birth failed ${JSON.stringify(cross)}`);
  }
  report.cross = cross;

  const bearMother = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    const actors = g.glass().actors;
    const glass = actors.find(a => a.stage === 'adult' && a.sex === 'M' && !a.pregnant);
    const bear = g.bears.find(b => b.active && b.species === 'bear' && b.stage === 'adult' &&
      b.sex === 'F' && !b.pregnant && !b.sleeping && !b.inPond && b.grabs === 0);
    if (!glass || !bear) return { found: false };
    const gi = glass.index;
    const bi = g.bears.indexOf(bear);
    g.glassSetNeed(gi, 'hunger', .2);
    g.glassSetNeed(gi, 'thirst', .2);
    g.glassSetNeed(gi, 'health', 100);
    g.glassSetNeed(gi, 'energy', 1);
    g.glassSetCooldown(gi, 0);
    g.setHunger(bi, .2);
    g.setThirst(bi, .2);
    g.setEnergy(bi, 1);
    g.setHealth(bi, 100);
    bear.mateCooldown = 0;
    const beforeBears = g.bears.length;
    const beforeGlass = g.glass().count;
    const mate = g.glassMateBear(gi, bi);
    g.sim(3.8, 8);
    const pregnantBear = g.bears[bi];
    const wasPregnant = !!(pregnantBear && pregnantBear.pregnant);
    const born = mate.ok ? g.forceBirth(bi) : false;
    const newBear = g.bears[g.bears.length - 1];
    const newGlass = g.glass().actors[g.glass().count - 1];
    const bearBorn = g.bears.length > beforeBears;
    const child = bearBorn ? newBear : newGlass;
    return {
      found: true, gi, bi, mate, pregnant: wasPregnant, born,
      beforeBears, beforeGlass, afterBears: g.bears.length, afterGlass: g.glass().count,
      childSpecies: child && child.species,
      childStage: child && child.stage,
      childMaterial: child && child.genome && child.genome.genes.material,
    };
  })()`);
  const bearMotherGrew = bearMother.afterBears + bearMother.afterGlass > bearMother.beforeBears + bearMother.beforeGlass;
  if (!bearMother.found || !bearMother.mate?.ok || !bearMother.pregnant || !bearMother.born ||
      !bearMotherGrew || !['bear', 'glass'].includes(bearMother.childSpecies) ||
      bearMother.childStage !== 'baby' || bearMother.childMaterial !== 'glass') {
    throw new Error(`Bear mother x Glass father birth failed ${JSON.stringify(bearMother)}`);
  }
  report.bearMother = bearMother;
  report.shots.final = await shot('final');

  await evaluate('window.__gummy.glassSetPregnant(1, true, 12)');
  const savedCount = await evaluate(`(async () => {
    await window.__gummy.save('slot1', 'glass-test');
    return window.__gummy.glass().count;
  })()`);
  const loaded = await evaluate(`(async () => {
    await window.__gummy.load('slot1');
    return { map: window.__gummy.map().id, count: window.__gummy.glass().count, states: window.__gummy.glass().actors.map(a => ({ uid: a.uid, stage: a.stage, sex: a.sex, pregnant: a.pregnant, gestation: a.gestation })) };
  })()`);
  await waitFor('window.__gummy.glass().actors.every(a => a.ready)', 30000);
  if (loaded.map !== 'field' || loaded.count !== savedCount || loaded.states.length !== savedCount ||
      !loaded.states[1]?.pregnant || !(loaded.states[1].gestation > 10)) {
    throw new Error(`Glass save/load failed ${JSON.stringify({ savedCount, loaded })}`);
  }
  report.saveLoad = { savedCount, loaded };

  const reciprocalMate = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    const actors = g.glass().actors;
    const glass = actors.find(a => a.stage === 'adult' && !a.pregnant);
    const bear = g.bears.find(b => b.active && b.species === 'bear' && b.stage === 'adult' &&
      b.sex !== glass.sex && !b.pregnant && !b.sleeping);
    if (!glass || !bear) return { found: false };
    const bi = g.bears.indexOf(bear);
    const gi = glass.index;
    g.setBearState(bi, 'wander');
    g.glassReset(gi);
    g.glassSetNeed(gi, 'hunger', .2);
    g.glassSetNeed(gi, 'thirst', .2);
    g.glassSetNeed(gi, 'health', 100);
    g.glassSetNeed(gi, 'energy', 1);
    g.glassSetCooldown(gi, 0);
    g.setHunger(bi, .2);
    g.setThirst(bi, .2);
    g.setEnergy(bi, 1);
    g.setHealth(bi, 100);
    bear.mateCooldown = 0;
    const started = g.bearGlassMate(bi, gi);
    g.sim(3.8, 8);
    return {
      found: true, started,
      glassPregnant: g.glass().actors[gi].pregnant,
      bearPregnant: g.bears[bi].pregnant,
      glassState: g.glass().actors[gi].state,
      bearState: g.bears[bi].ai && g.bears[bi].ai.state,
    };
  })()`);
  if (!reciprocalMate.found || !reciprocalMate.started ||
      (!reciprocalMate.glassPregnant && !reciprocalMate.bearPregnant)) {
    throw new Error(`Reciprocal Glass mating failed ${JSON.stringify(reciprocalMate)}`);
  }
  report.reciprocalMate = reciprocalMate;
  }

  phase = 'post-sim';
  console.log(`PHASE ${phase}`);
  const postSim = await evaluate(`(() => {
    const g = window.__gummy;
    const start = performance.now();
    const built = g.sim(1.0, 8);
    return { built, ms: +(performance.now() - start).toFixed(1) };
  })()`, 30000);
  phase = 'post-stats';
  console.log(`PHASE ${phase}`);
  const postStats = await evaluate('window.__gummy.stats()', 30000);
  phase = 'post-glass';
  console.log(`PHASE ${phase}`);
  const postGlass = await evaluate('window.__gummy.glass()', 30000);
  phase = 'post-gl';
  console.log(`PHASE ${phase}`);
  const postGl = await evaluate('window.__gummy.three().renderer.getContext().getError()', 30000);
  const after = { ...postSim, stats: postStats, glass: postGlass, gl: postGl, errors: 0 };
  if (after.stats.nan || after.gl) throw new Error(`Glass post-sim failed ${JSON.stringify(after)}`);
  report.after = after;
  report.errors = pageErrors;
  report.phase = 'complete';
  console.log('STATE', JSON.stringify(report));
  console.log('ERRORS', JSON.stringify(pageErrors).slice(0, 1600));
} catch (error) {
  phase = error.phase || phase;
  report.phase = phase;
  report.failure = String(error.stack || error);
  report.expression = error.expression || null;
  report.harness = page.diagnostics();
  const pageErrorSnapshot = JSON.stringify(pageErrors).slice(0, 4000);
  try {
    report.snapshot = await evaluate(`(() => {
      const g = window.__gummy;
      return {
        readyState: document.readyState,
        booted: !!g?.booted,
        map: g?.map?.() || null,
        glass: g?.glass?.() || null,
        errors: ${JSON.stringify(pageErrorSnapshot)},
      };
    })()`, 3000);
  } catch (snapshotError) {
    report.snapshotError = String(snapshotError && snapshotError.stack || snapshotError);
  }
  console.log('STOP', report.failure.slice(0, 2400));
  process.exitCode = 1;
} finally {
  if (FAST) await page.evaluate(`(() => {
    const g = window.__gummy;
    if (window.__glassTestSim) { g.sim = window.__glassTestSim; delete window.__glassTestSim; }
    g.pause(false);
  })()`, 1000).catch(() => {});
  report.timings = timings;
  report.phase = report.phase || phase;
  await writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log('REPORT', REPORT_PATH);
  await browser.close();
}
