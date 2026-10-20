// Headless browser regression for the current Meadow/species build.
//
//   node scripts/browser-regression.mjs                  # full Meadow + Glass
//   BROWSER_SCOPE=core node scripts/browser-regression.mjs  # bear-only CI lane
//
// Start launch.py first, or point GAME_URL at a served build. BROWSER_BIN/CHROME_BIN
// selects a Chromium-family browser; the harness uses a temporary profile and cleans up.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAG = process.env.TAG || 'current';
const SCOPE = process.env.BROWSER_SCOPE === 'core' ? 'core' : 'full';
const CORE = SCOPE === 'core';
const STUDIO = !CORE && process.env.STUDIO === '1';
const base = process.env.GAME_URL || 'http://localhost:8000/';
const target = new URL(base);
target.searchParams.set('autostart', '1');
if (process.env.BEHAVIORS) target.searchParams.set('behaviors', process.env.BEHAVIORS);
if (CORE) target.searchParams.set('race', 'off');
const lowQuality = process.env.LOW_QUALITY === '1';
const initScript = lowQuality ? `(() => {
  try {
    localStorage.setItem('gummy.qualityLevel', '3');
    localStorage.setItem('gummy.qualityCap', '3');
    localStorage.setItem('gummy.adaptive', '0');
    localStorage.setItem('gummy.renderScale', '0.6');
    localStorage.setItem('gummy.effects', 'off');
    localStorage.setItem('gummy.profile', 'performance');
  } catch (error) {}
})()` : null;

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
let failure = null;
let page = null;
try {
  page = await browser.openPage({
    url: target.href,
    width: Number(process.env.WIDTH || 1440),
    height: Number(process.env.HEIGHT || 900),
    mobile: process.env.MOBILE === '1',
    initScript,
  });
  await page.waitFor('!!window.__gummy?.booted', 90000);
  if (!CORE) {
    console.log('STEP glass ready');
    try {
      await page.waitFor('window.__gummy.glass().actors.every(actor => actor.ready)', 150000);
    } catch (error) {
      console.log('STEP glass reload');
      await page.evaluate('location.reload()').catch(() => {});
      await page.waitFor('!!window.__gummy?.booted', 120000);
      await page.waitFor('window.__gummy.glass().actors.every(actor => actor.ready)', 150000);
    }
    console.log('STEP glass done');
  } else {
    console.log('STEP glass skipped (core)');
  }

  console.log('STEP base');
  const result = await page.evaluate(`(async () => {
    const g = window.__gummy;
    g.seed(421337);
    const species = g.species();
    const before = g.roster();
    const familyTarget = before.find(actor => actor.family && actor.stage !== 'adult') ||
      before.find(actor => actor.family) || before[0] || null;
    const family = familyTarget ? g.family(familyTarget.uid) : null;
    const beforeMap = g.map();
    const save = await g.save('slot1', 'browser regression');
    const load = await g.load('slot1');
    g.sim(1, 8);
    const stats = g.stats();
    const after = g.roster();
    let familyPair = null;
    for (let i = 0; i < g.bears.length && !familyPair; i += 1) {
      for (let j = i + 1; j < g.bears.length; j += 1) {
        const a = g.bears[i], b = g.bears[j];
        if (a.parentUids && b.parentUids &&
            a.parentUids.some(uid => b.parentUids.includes(uid))) {
          familyPair = [i, j];
          break;
        }
      }
    }
    const familyPlay = familyPair ? g.familyPlay(familyPair[0], familyPair[1]) : null;
    let parentPair = null;
    for (let i = 0; i < g.bears.length && !parentPair; i += 1) {
      const child = g.bears[i];
      if (child.stage === 'adult') continue;
      for (let j = 0; j < g.bears.length; j += 1) {
        const parent = g.bears[j];
        if (i === j) continue;
        if ((child.parentUids || []).includes(parent.uid)) {
          parentPair = [j, i];
          break;
        }
      }
    }
    return {
      booted: !!g.booted,
      species: species.map(item => ({ id: item.id, kind: item.kind, assetManifest: item.assetManifest || null })),
      before,
      familyTarget,
      family,
      beforeMap,
      saveOk: !!(save && save.ok),
      loadOk: !!(load && (load.ok === undefined || load.ok)),
      after,
      familyPair,
      familyPlay,
      parentPair,
      parentUid: parentPair ? g.bears[parentPair[0]].uid : null,
      childUid: parentPair ? g.bears[parentPair[1]].uid : null,
      stats: { nan: !!stats.nan, bears: stats.bears, glass: stats.glass },
    };
  })()`, 300000);
  console.log('STEP base done');

  const parentUid = result.parentUid;
  const childUid = result.childUid;
  let familyDeep = null;
  if (parentUid !== null && childUid !== null) {
    console.log('STEP lesson');
    const lesson = await page.evaluate(`(() => {
      const g = window.__gummy;
      const parentIndex = g.bears.findIndex(bear => bear.uid === ${JSON.stringify(parentUid)});
      const childIndex = g.bears.findIndex(bear => bear.uid === ${JSON.stringify(childUid)});
      if (parentIndex < 0 || childIndex < 0) return { ok: false, note: 'pair missing' };
      g.setTime(15);
      const childBefore = g.traits()[childIndex];
      const lesson = g.familyLesson(parentIndex, childIndex);
      g.sim(6, 0);
      const childAfter = g.traits()[childIndex];
      return {
        ok: true,
        lesson,
        childBefore: { skills: childBefore.skills, history: childBefore.history.slice(-3) },
        childAfter: { skills: childAfter.skills, history: childAfter.history.slice(-3) },
      };
    })()`, 300000);
    console.log('STEP lesson done');

    console.log('STEP meal');
    const meal = await page.evaluate(`(() => {
      const g = window.__gummy;
      const parentIndex = g.bears.findIndex(bear => bear.uid === ${JSON.stringify(parentUid)});
      if (parentIndex < 0) return { ok: false, note: 'parent missing' };
      g.setBearState(parentIndex, 'wander');
      const meal = g.familyMeal(parentIndex);
      const mealBefore = g.traits()[parentIndex].hunger;
      g.sim(7, 0);
      const mealAfter = g.traits()[parentIndex];
      return {
        ok: true,
        meal,
        mealBefore,
        mealAfter: { hunger: mealAfter.hunger, history: mealAfter.history.slice(-3) },
      };
    })()`, 300000);
    console.log('STEP meal done');

    console.log('STEP social');
    const social = await page.evaluate(`(async () => {
      const g = window.__gummy;
      const cross = ${CORE ? 'null' : 'g.bearGlassSocial(0, 0)'};
      ${CORE ? '' : 'g.sim(1, 0);'}
      const crossState = ${CORE ? 'null' : 'g.ai().bears[0]?.state || null'};
      const childIndex = g.bears.findIndex(bear => bear.uid === ${JSON.stringify(childUid)});
      if (childIndex >= 0) g.selectBear(childIndex);
      const lineage = g.lineage(${JSON.stringify(childUid)});
      const save2 = await g.save('slot1', 'family regression');
      return {
        ok: true,
        cross,
        crossState,
        lineage: lineage ? {
          history: lineage.history.slice(-3),
          parents: lineage.parents,
          generation: lineage.self?.generation,
        } : null,
        save2: !!(save2 && save2.ok),
      };
    })()`, 300000);
    console.log('STEP social done');

    familyDeep = {
      parentPair: result.parentPair,
      parentUid,
      childUid,
      ...lesson,
      ...meal,
      ...social,
    };
  }

  const failures = [];
  if (!result.booted) failures.push('not booted');
  const expectedRoster = CORE ? 6 : 10;
  const expectedBears = CORE ? 6 : 8;
  const expectedGlass = CORE ? 0 : 2;
  if (result.before.length !== expectedRoster) failures.push(`roster ${result.before.length}, expected ${expectedRoster}`);
  if (result.after.length !== result.before.length) failures.push('roster changed across save/load');
  if (result.beforeMap.bears !== expectedBears) failures.push(`soft-body count ${result.beforeMap.bears}, expected ${expectedBears}`);
  if (result.beforeMap.glass !== expectedGlass) failures.push(`Glass count ${result.beforeMap.glass}, expected ${expectedGlass}`);
  if (!result.family || !result.family.parents.length) failures.push('starter family has no parents');
  if (!result.family || !result.family.siblings.length) failures.push('starter family has no sibling');
  if (!CORE && !result.species.find(item => item.id === 'glass' && item.assetManifest)) {
    failures.push('Glass species has no asset manifest');
  }
  if (!result.familyPlay?.ok || result.familyPlay.kind !== 'sibling') {
    failures.push(`soft-body sibling play failed: ${JSON.stringify(result.familyPlay)}`);
  }
  if (!result.saveOk || !result.loadOk) failures.push('save/load failed');
  if (result.stats.nan) failures.push('non-finite physics state');
  const deep = familyDeep;
  if (!deep || !deep.parentPair) failures.push('no parent/child pair for family regression');
  else {
    if (!deep.lesson?.ok) failures.push(`family lesson failed: ${JSON.stringify(deep.lesson)}`);
    const skillRaised = deep.childAfter && Object.values(deep.childAfter.skills).some(value => value > 0);
    if (!skillRaised) failures.push('lesson did not raise a child skill');
    if (!deep.childAfter?.history.some(event => event.kind === 'taught')) {
      failures.push('child taught history missing');
    }
    if (!deep.meal?.ok) failures.push(`family meal failed: ${JSON.stringify(deep.meal)}`);
    if (!(deep.mealAfter?.hunger < deep.mealBefore)) failures.push('family meal did not reduce hunger');
    if (!deep.mealAfter?.history.some(event => event.kind === 'meal')) {
      failures.push('meal history missing');
    }
    if (!CORE && (!deep.cross?.ok || deep.crossState !== 'social')) {
      failures.push(`cross-species social failed: ${JSON.stringify(deep.cross)} ${deep.crossState}`);
    }
    if (!deep.lineage?.history.some(event => event.kind === 'taught')) {
      failures.push('lineage history missing the lesson');
    }
    if (!deep.save2) failures.push('family save failed');
  }
  await new Promise(resolve => setTimeout(resolve, 350));
  const familyPanel = await page.evaluate(`(() => ({
    family: document.getElementById('directiveFamily')?.textContent || '',
    history: document.getElementById('directiveHistory')?.textContent || '',
    lines: document.querySelectorAll('#directiveHistory .hLine').length,
  }))()`);
  if (!familyPanel.lines) failures.push('family history panel is empty');
  if (!familyPanel.family) failures.push('family lineage line is empty');
  const panelStability = await page.evaluate(`(async () => {
    const row = document.querySelector('.buddyRow');
    await new Promise(resolve => setTimeout(resolve, 600));
    return { connected: !!row && row.isConnected, rows: document.querySelectorAll('.buddyRow').length };
  })()`);
  if (!panelStability.connected || panelStability.rows < 2) {
    failures.push(`citizen panel replaced rows during idle: ${JSON.stringify(panelStability)}`);
  }
  const commandCheck = await page.evaluate(`(() => {
    const g = window.__gummy;
    const parent = g.bears.find(b => b.uid === ${JSON.stringify(parentUid)});
    const child = g.bears.find(b => b.uid === ${JSON.stringify(childUid)});
    if (!parent || !child) return { ok: false, note: 'pair missing' };
    const pi = g.bears.indexOf(parent), ci = g.bears.indexOf(child);
    const started = g.familyLesson(pi, ci);
    const originalTask = g.bears[ci].ai.familyTask?.id ?? null;
    const originalPartner = g.bears[ci].ai.partner?.uid ?? null;
    let accepted = false;
    for (let n = 0; n < 12; n++) {
      g.directive(ci, 'go', { x: 0, z: 0 });
      g.sim(.3, 0);
      if (g.bears[ci].ai.directive) { accepted = true; break; }
    }
    g.sim(2, 0);
    const after = g.bears[ci];
    return { ok: true, started, accepted, originalTask, originalPartner, state: after.ai.state, task: after.ai.familyTask?.id ?? null, partner: after.ai.partner?.uid ?? null };
  })()`, 180000);
  const originalPairRestarted = commandCheck.task === commandCheck.originalTask &&
    commandCheck.partner === commandCheck.originalPartner;
  if (!commandCheck.ok || !commandCheck.started || !commandCheck.accepted ||
      originalPairRestarted) {
    failures.push(`command did not interrupt family task: ${JSON.stringify(commandCheck)}`);
  }
  const growthCheck = await page.evaluate(`(() => {
    const g = window.__gummy;
    const i = g.bears.findIndex(b => b.active && b.stage === 'adult' && b.grabs === 0);
    if (i < 0) return { ok: false, note: 'no adult bear' };
    g.setStage(i, 'baby');
    g.setHunger(i, .9);
    g.setThirst(i, .9);
    g.setBearState(i, 'wander');
    g.sim(1, 0);
    g.setAge(i, 900);
    g.sim(3, 0);
    const b = g.bears[i];
    const pos = [b.cx, b.cz];
    g.sim(2, 0);
    return {
      ok: true, stage: b.stage, contacts: b.contacts, air: b.airborne,
      state: b.ai.state, moved: Math.hypot(b.cx - pos[0], b.cz - pos[1]),
    };
  })()`, 180000);
  if (!growthCheck.ok || growthCheck.stage !== 'adult' || growthCheck.moved < .02) {
    failures.push(`stage growth did not resume locomotion: ${JSON.stringify(growthCheck)}`);
  }
  const stallCheck = await page.evaluate(`(() => {
    const g = window.__gummy;
    const i = g.bears.findIndex(b => b.active && !b.sleeping && !b.inPond && b.grabs === 0 &&
      !b.airborne && b.contacts > 0 && b.rMat[4] > .62 && !(b.ai && b.ai.familyTask));
    if (i < 0) return { ok: false, note: 'no grounded free bear' };
    const beforeRecoveries = g.bears[i].ai.recoveries | 0;
    const injected = g.aiStall(i, 'seekFood');
    if (!injected) return { ok: false, note: 'no ripe food source' };
    let recovery = null;
    for (let n = 0; n < 70 && !recovery; n++) {
      g.sim(.2, 0);
      const b = g.bears[i];
      if ((b.ai.recoveries | 0) > beforeRecoveries) {
        recovery = {
          state: b.ai.state,
          source: b.ai.source ? b.ai.source.id : null,
          path: b.ai.path ? b.ai.path.length : 0,
          avoidSourceT: +(b.ai.avoidSourceT || 0).toFixed(2),
        };
      }
    }
    const before = [g.bears[i].cx, g.bears[i].cz];
    g.sim(2, 0);
    const b = g.bears[i];
    return {
      ok: true, injected, recovery, state: b.ai.state,
      recoveries: b.ai.recoveries, stuck: b.ai.lastStuck ? b.ai.lastStuck.reason : null,
      moved: Math.hypot(b.cx - before[0], b.cz - before[1]),
    };
  })()`, 180000);
  if (!stallCheck.ok || !stallCheck.recovery ||
      stallCheck.recovery.source === stallCheck.injected.source ||
      stallCheck.stuck !== 'no-progress') {
    failures.push(`stationary seek watchdog failed: ${JSON.stringify(stallCheck)}`);
  }
  if (!CORE) {
    const collisionCheck = await page.evaluate(`(() => {
      const g = window.__gummy;
      const gi = g.glass().actors.findIndex(a => a.ready && !a.inside && !a.grabbing);
      if (gi < 0) return { ok: false, note: 'no free Glass actor' };
      let bi = -1, startDistance = Infinity;
      const tried = [];
      for (let i = 0; i < g.bears.length; i++) {
        const bear = g.bears[i];
        if (!bear.active || bear.sleeping || bear.inPond || bear.grabs > 0 ||
            bear.airborne || bear.contacts < 1 || !bear.ai) continue;
        const set = g.glassSetPosition(gi, bear.cx, bear.cz, true);
        const a = g.glass().actors[gi];
        const d = set ? Math.hypot(a.position[0] - bear.cx, a.position[2] - bear.cz) : null;
        tried.push({ i, set, d: d === null ? null : +d.toFixed(2), contacts: bear.contacts });
        if (set && d <= .2) { bi = i; startDistance = d; break; }
      }
      if (bi < 0) return { ok: false, note: 'no bear/Glass overlap fixture', tried };
      const start = g.glass().actors[gi];
      const bearStart = g.bears[bi];
      const vertical = Math.abs(start.position[1] - bearStart.cy);
      const walking = g.glassWalkTo(gi, bearStart.cx + 1.5, bearStart.cz);
      let distance = startDistance, steps = 0;
      const samples = [];
      for (; steps < 6; steps++) {
        g.sim(.5, 0);
        const a = g.glass().actors[gi], b = g.bears[bi];
        distance = Math.hypot(a.position[0] - b.cx, a.position[2] - b.cz);
        samples.push(+distance.toFixed(3));
        if (distance >= .25) break;
      }
      const a = g.glass().actors[gi];
      return {
        ok: true, bi, gi, startDistance, vertical, walking, steps, samples,
        distance,
        free: a.freeBody,
      };
    })()`, 180000);
    if (!collisionCheck.ok || !collisionCheck.walking || collisionCheck.vertical > .8 ||
        collisionCheck.distance < .25 || collisionCheck.free) {
      failures.push(`Glass did not collide with a bear: ${JSON.stringify(collisionCheck)}`);
    }
    const doorCheck = await page.evaluate(`(() => {
      const g = window.__gummy;
      g.setTime(12);
      const index = g.glass().actors.findIndex(a => a.ready && !a.inside && !a.grabbing);
      if (index < 0) return { ok: false, note: 'no shelter candidate' };
      const started = g.glassShelter(index);
      if (!started) return { ok: false, note: 'shelter refused' };
      g.sim(120, 0);
      const a = g.glass().actors[index];
      return {
        ok: true, inside: a.inside, state: a.state, sheltered: a.shelteredToday,
        entries: a.doorEntries, exits: a.doorExits,
      };
    })()`, 180000);
    if (!doorCheck.ok || doorCheck.entries + doorCheck.exits > 2) {
      failures.push(`Glass shelter door loop: ${JSON.stringify(doorCheck)}`);
    }
  }
  const sleepCheck = await page.evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(23.5);
    g.sim(1, 0);
    const flips = g.bears.map(() => 0);
    const previous = g.bears.map(b => !!b.sleeping);
    for (let n = 0; n < 16; n++) {
      g.sim(.5, 0);
      for (let i = 0; i < g.bears.length; i++) {
        const now = !!g.bears[i].sleeping;
        if (now !== previous[i]) flips[i]++;
        previous[i] = now;
      }
    }
    return { maxFlips: Math.max(...flips), flips };
  })()`, 180000);
  if (sleepCheck.maxFlips > 2) {
    failures.push(`repeated sleep/wake cycling: ${JSON.stringify(sleepCheck)}`);
  }
  if (browser.pageErrors.length) failures.push(`page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`);
  if (failures.length) throw new Error(failures.join('; '));

  if (STUDIO) {
    await page.evaluate("window.__gummy.setMap('studio')");
    await page.waitFor("window.__gummy.map().id === 'studio'", 15000);
    await page.waitFor("window.__gummy.msn.state().ready", 90000);
    await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')");
    const studio = await page.evaluate(`(() => {
      const g = window.__gummy;
      const state = g.msn.state();
      return {
        ready: state.ready, meshes: state.meshes, bones: state.bones,
        clips: state.clips.length, height: state.height, error: state.error,
        transmission: state.material?.transmission,
      };
    })()`);
    const studioFailures = [];
    if (!studio.ready) studioFailures.push(`Studio not ready: ${studio.error}`);
    if (studio.meshes !== 3) studioFailures.push(`Studio meshes ${studio.meshes}`);
    if (studio.bones !== 9) studioFailures.push(`Studio bones ${studio.bones}`);
    if (studio.clips !== 10) studioFailures.push(`Studio clips ${studio.clips}`);
    if (studio.transmission !== 1) studioFailures.push(`Studio transmission ${studio.transmission}`);
    if (studioFailures.length) throw new Error(studioFailures.join('; '));
    console.log('STUDIO', JSON.stringify(studio));
    const assets = await page.evaluate('window.__gummy.assets()');
    if (assets.length !== 1 || assets[0].loads !== 1 || assets[0].refs !== 1) {
      throw new Error(`Studio asset ownership failed: ${JSON.stringify(assets)}`);
    }
    await page.evaluate("window.__gummy.setMap('field')");
    await page.waitFor("window.__gummy.map().id === 'field' && window.__gummy.glass().actors.every(a => a.ready)", 90000);
    await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')");
    const restoredAssets = await page.evaluate('window.__gummy.assets()');
    const meadowGlass = await page.evaluate('window.__gummy.glass().count');
    if (restoredAssets[0].loads !== 1 || restoredAssets[0].refs !== 1 + meadowGlass) {
      throw new Error(`Meadow asset reuse failed: ${JSON.stringify({ restoredAssets, meadowGlass })}`);
    }
    console.log('ASSETS', JSON.stringify(restoredAssets));
    if (familyDeep?.childUid !== null && familyDeep?.childUid !== undefined) {
      const restoreUid = JSON.stringify(familyDeep.childUid);
      const familyRestored = await page.evaluate(`(async () => {
        const g = window.__gummy;
        const loaded = await g.load('slot1');
        await new Promise(resolve => setTimeout(resolve, 300));
        const child = g.traits().find(bear => bear.uid === ${restoreUid});
        return child ? { skills: child.skills, history: child.history.slice(-3) } : null;
      })()`, 300000);
      if (!familyRestored || !Object.values(familyRestored.skills || {}).some(value => value > 0) ||
          !familyRestored.history.some(event => event.kind === 'taught')) {
        throw new Error(`family fields did not survive the map/save round trip: ${JSON.stringify(familyRestored)}`);
      }
      console.log('FAMILY', JSON.stringify(familyRestored));
    }
  }
  if (process.env.SHOTS === '1') {
    await mkdir(`${ROOT}/.dev-shots`, { recursive: true });
    await page.evaluate(`(() => {
      const row = document.querySelector('.buddyRow[data-uid="${result.familyTarget.uid}"]');
      if (row) row.click();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 350));
    await page.screenshot(`${ROOT}/.dev-shots/browser-regression-${TAG}.png`);
    const ui = await page.evaluate(`(() => ({
      family: document.getElementById('directiveFamily')?.textContent || '',
      hidden: document.getElementById('directivePanel')?.hidden ?? null,
    }))()`);
    console.log('UI', JSON.stringify(ui));
  }
  console.log('INFO', JSON.stringify({
    tag: TAG,
    scope: SCOPE,
    url: target.href,
    roster: result.after.length,
    bears: result.beforeMap.bears,
    glass: result.beforeMap.glass,
    family: result.family,
    species: result.species,
    errors: browser.pageErrors.length,
  }));
  console.log('BROWSER OK');
} catch (error) {
  failure = error;
  if (page) {
    try {
      const diagnostics = await page.evaluate(`(() => {
        const g = window.__gummy;
        if (!g) return { booted: false, now: performance.now(), readyState: document.readyState };
        let assets = null;
        try { assets = g.assets(); } catch (err) { assets = { error: String(err) }; }
        let glass = null;
        try {
          const state = g.glass();
          glass = state ? {
            count: state.count,
            actors: state.actors.map(a => ({
              uid: a.uid, ready: a.ready, error: a.error,
              inside: a.inside, state: a.state, position: a.position,
            })),
          } : null;
        } catch (err) { glass = { error: String(err) }; }
        let map = null;
        try { map = g.map(); } catch (err) { map = { error: String(err) }; }
        const resources = performance.getEntriesByType('resource')
          .filter(entry => /(GLTFLoader|msn\\.glb|asset\\.json|catalog\\.json|three)/.test(entry.name))
          .map(entry => ({
            name: entry.name.replace(location.origin, ''),
            start: Math.round(entry.startTime),
            duration: Math.round(entry.duration),
            size: entry.transferSize,
          }));
        return {
          booted: !!g.booted,
          now: Math.round(performance.now()),
          readyState: document.readyState,
          assets, glass, map, resources,
        };
      })()`, 10000);
      console.error('DIAG', JSON.stringify(diagnostics));
    } catch (diagnosticError) {
      console.error('DIAG ERROR', String(diagnosticError).slice(0, 800));
    }
  }
  console.error('STOP', String(error && error.stack || error).slice(0, 2400));
  if (browser.pageErrors.length) console.error('ERRORS', JSON.stringify(browser.pageErrors.slice(0, 5)));
} finally {
  await browser.close();
}
if (failure) process.exitCode = 1;
