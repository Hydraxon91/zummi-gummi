// Headless browser regression for the current Meadow/species build.
//
// Start launch.py first, then:
//   node scripts/browser-regression.mjs
// or point GAME_URL at a served build. BROWSER_BIN/CHROME_BIN selects a
// Chromium-family browser; the harness uses a temporary profile and cleans up.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAG = process.env.TAG || 'current';
const base = process.env.GAME_URL || 'http://localhost:8000/';
const target = new URL(base);
target.searchParams.set('autostart', '1');
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
  await page.waitFor('window.__gummy.glass().actors.every(actor => actor.ready)', 90000);

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
    g.setTime(15);
    g.sim(2);
    const lesson = parentPair ? g.familyLesson(parentPair[0], parentPair[1]) : null;
    const childBefore = parentPair ? g.traits()[parentPair[1]] : null;
    g.sim(8);
    const childAfter = parentPair ? g.traits()[parentPair[1]] : null;
    if (parentPair) g.setBearState(parentPair[0], 'wander');
    const meal = parentPair ? g.familyMeal(parentPair[0]) : null;
    const mealBefore = parentPair ? g.traits()[parentPair[0]] : null;
    g.sim(10);
    const mealAfter = parentPair ? g.traits()[parentPair[0]] : null;
    const cross = g.bearGlassSocial(0, 0);
    g.sim(2);
    const crossState = g.ai().bears[0]?.state || null;
    const lineage = parentPair ? g.lineage(g.bears[parentPair[1]].uid) : null;
    if (parentPair) g.selectBear(parentPair[1]);
    const save2 = await g.save('slot1', 'family regression');
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
      familyDeep: {
        parentPair,
        childUid: parentPair ? g.bears[parentPair[1]].uid : null,
        lesson,
        childBefore: childBefore ? { skills: childBefore.skills, history: childBefore.history.slice(-3) } : null,
        childAfter: childAfter ? { skills: childAfter.skills, history: childAfter.history.slice(-3) } : null,
        meal,
        mealBefore: mealBefore ? mealBefore.hunger : null,
        mealAfter: mealAfter ? { hunger: mealAfter.hunger, history: mealAfter.history.slice(-3) } : null,
        cross,
        crossState,
        lineage: lineage ? { history: lineage.history.slice(-3), parents: lineage.parents, generation: lineage.self?.generation } : null,
        save2: !!(save2 && save2.ok),
      },
      stats: { nan: !!stats.nan, bears: stats.bears, glass: stats.glass },
    };
  })()`);

  const failures = [];
  if (!result.booted) failures.push('not booted');
  if (result.before.length !== 10) failures.push(`roster ${result.before.length}, expected 10`);
  if (result.after.length !== result.before.length) failures.push('roster changed across save/load');
  if (result.beforeMap.bears !== 8) failures.push(`soft-body count ${result.beforeMap.bears}, expected 8`);
  if (result.beforeMap.glass !== 2) failures.push(`Glass count ${result.beforeMap.glass}, expected 2`);
  if (!result.family || !result.family.parents.length) failures.push('starter family has no parents');
  if (!result.family || !result.family.siblings.length) failures.push('starter family has no sibling');
  if (!result.species.find(item => item.id === 'glass' && item.assetManifest)) {
    failures.push('Glass species has no asset manifest');
  }
  if (!result.familyPlay?.ok || result.familyPlay.kind !== 'sibling') {
    failures.push(`soft-body sibling play failed: ${JSON.stringify(result.familyPlay)}`);
  }
  if (!result.saveOk || !result.loadOk) failures.push('save/load failed');
  if (result.stats.nan) failures.push('non-finite physics state');
  const deep = result.familyDeep;
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
    if (!deep.cross?.ok || deep.crossState !== 'social') {
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
  if (browser.pageErrors.length) failures.push(`page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`);
  if (failures.length) throw new Error(failures.join('; '));

  if (process.env.STUDIO === '1') {
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
    if (restoredAssets[0].loads !== 1 || restoredAssets[0].refs !== 3) {
      throw new Error(`Meadow asset reuse failed: ${JSON.stringify(restoredAssets)}`);
    }
    console.log('ASSETS', JSON.stringify(restoredAssets));
    if (result.familyDeep?.childUid !== null && result.familyDeep?.childUid !== undefined) {
      const childUid = JSON.stringify(result.familyDeep.childUid);
      const familyRestored = await page.evaluate(`(async () => {
        const g = window.__gummy;
        const loaded = await g.load('slot1');
        await new Promise(resolve => setTimeout(resolve, 300));
        const child = g.traits().find(bear => bear.uid === ${childUid});
        return child ? { skills: child.skills, history: child.history.slice(-3) } : null;
      })()`);
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
