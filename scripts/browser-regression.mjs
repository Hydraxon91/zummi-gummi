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

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
let failure = null;
try {
  const page = await browser.openPage({
    url: target.href,
    width: Number(process.env.WIDTH || 1440),
    height: Number(process.env.HEIGHT || 900),
    mobile: process.env.MOBILE === '1',
  });
  await page.waitFor('!!window.__gummy?.booted', 45000);
  await page.waitFor('window.__gummy.glass().actors.every(actor => actor.ready)', 30000);

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
  if (browser.pageErrors.length) failures.push(`page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`);
  if (failures.length) throw new Error(failures.join('; '));

  if (process.env.STUDIO === '1') {
    await page.evaluate("window.__gummy.setMap('studio')");
    await page.waitFor("window.__gummy.map().id === 'studio'", 15000);
    await page.waitFor("window.__gummy.msn.state().ready", 30000);
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
    await page.waitFor("window.__gummy.map().id === 'field' && window.__gummy.glass().actors.every(a => a.ready)");
    await page.waitFor("!document.getElementById('mapWipe').classList.contains('on')");
    const restoredAssets = await page.evaluate('window.__gummy.assets()');
    if (restoredAssets[0].loads !== 1 || restoredAssets[0].refs !== 3) {
      throw new Error(`Meadow asset reuse failed: ${JSON.stringify(restoredAssets)}`);
    }
    console.log('ASSETS', JSON.stringify(restoredAssets));
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
  console.error('STOP', String(error && error.stack || error).slice(0, 2400));
  if (browser.pageErrors.length) console.error('ERRORS', JSON.stringify(browser.pageErrors.slice(0, 5)));
} finally {
  await browser.close();
}
if (failure) process.exitCode = 1;
