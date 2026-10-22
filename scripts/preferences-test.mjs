// Opt-in activity dispositions: real Meadow selection, saved state and isolation.
// Start launch.py first. No forced stargaze state or completion hook is used.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { connectBootedBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const target = new URL(process.env.GAME_URL || 'http://localhost:8000/');
target.searchParams.set('autostart', '1');
target.searchParams.set('behaviors', 'modules');
const report = { checks: [] };
const check = (name, value) => {
  report.checks.push({ name, pass: !!value });
  assert.ok(value, name);
  console.log(`PASS ${name}`);
};
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });
let browser, page;
try {
  ({ browser, page } = await connectBootedBrowser({
    attempts: 1,
    page: { url: target.href, width: 900, height: 600, initScript: `(() => {
      localStorage.setItem('gummy.qualityLevel', '3');
      localStorage.setItem('gummy.qualityCap', '3');
      localStorage.setItem('gummy.adaptive', '0');
      localStorage.setItem('gummy.renderScale', '0.6');
      localStorage.setItem('gummy.effects', 'off');
      localStorage.setItem('gummy.profile', 'performance');
    })()` },
  }));
  await page.waitFor('window.__gummy.glass().count === 2 && window.__gummy.glass().actors.every(a => a.ready)', 150000);
  const setup = await page.evaluate(`(() => {
    const g = window.__gummy;
    g.pause(true);
    window.__preferenceBaseline = g.exportSave();
    const uid = g.glass().actors[0].uid;
    const off = g.behaviorConfig().features;
    g.activityPreference(uid, 'stargaze', 1);
    const disabled = g.dispositions(uid);
    g.setBehaviorFeature('preferences', true);
    g.setBehaviorFeature('habits', true);
    g.setBehaviorModule('mate', false);
    g.setTime(20);
    g.seed(8127);
    for (let i = 0; i < 2; i++) {
      g.glassReset(i);
      for (const [key, value] of Object.entries({ hunger: .1, thirst: .1, energy: 1, social: 0, affection: 0 })) {
        g.glassSetNeed(i, key, value);
      }
    }
    window.__preferenceUid = uid;
    return { uid, off, disabled, on: g.dispositions(uid) };
  })()`);
  report.setup = setup;
  check('features default off; explicit preference has no effect until enabled',
    !setup.off.preferences && !setup.off.habits && setup.disabled.stargazeChance === .1);
  check('enabled preference changes the actual Glass profile', setup.on.stargazeChance === .14);
  const natural = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__preferenceUid;
    let entered = false, elapsed = 0;
    while (elapsed < 300 && !(g.dispositions(uid).habits.stargaze > 0)) {
      if (Math.round(elapsed * 4) % 40 === 0) {
        for (let i = 0; i < 2; i++) {
          for (const [key, value] of Object.entries({ hunger: .1, thirst: .1, energy: 1, social: 0, affection: 0 })) {
            g.glassSetNeed(i, key, value);
          }
        }
      }
      g.sim(.25, 0);
      elapsed += .25;
      entered ||= g.glass().actors.find(a => a.uid === uid)?.state === 'stargaze';
    }
    return { entered, elapsed, disposition: g.dispositions(uid) };
  })()`, 120000);
  report.natural = natural;
  check('natural ordered selection starts and completes a session', natural.entered && natural.disposition.habits.stargaze > 0);
  check('completion raises the bounded chance', natural.disposition.stargazeChance > .14 && natural.disposition.stargazeChance <= .16);
  const frozen = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__preferenceUid;
    const before = g.dispositions(uid);
    g.setBehaviorFeature('habits', false);
    g.sim(3, 0);
    const after = g.dispositions(uid);
    g.setBehaviorFeature('habits', true);
    return { before, after, resumed: g.dispositions(uid) };
  })()`);
  report.frozen = frozen;
  check('disabled habits retain saved strength but stop influencing selection',
    frozen.before.habits.stargaze === frozen.after.habits.stargaze && frozen.after.stargazeChance === .14 && frozen.resumed.stargazeChance > .14);
  await page.evaluate(`window.__gummy.save('slot1', 'Preferences prototype')`);
  const saved = await page.evaluate(`JSON.parse(window.__gummy.exportSave()).worlds.field.glass.find(a => a.uid === window.__preferenceUid)`);
  report.saved = saved;
  check('actual save emits v9 preferences and learned habit', saved.actorVersion === 9 && saved.preferences.stargaze === 1 && saved.habits.stargaze > 0);
  await page.evaluate(`window.__gummy.activityPreference(window.__preferenceUid, 'stargaze', 0)`);
  await page.evaluate(`window.__gummy.load('slot1')`);
  await page.waitFor('window.__gummy.map().id === "field" && window.__gummy.glass().actors.every(a => a.ready)', 150000);
  const restored = await page.evaluate('window.__gummy.dispositions(window.__preferenceUid)');
  check('saved preferences and habits round-trip through the real loader',
    restored.preferences.stargaze === 1 && restored.habits.stargaze === saved.habits.stargaze);
  await page.evaluate('window.__gummy.setMap("studio")');
  await page.waitFor('window.__gummy.map().id === "studio" && !document.getElementById("mapWipe").classList.contains("on")', 120000);
  const isolation = await page.evaluate(`(() => {
    const g = window.__gummy;
    g.sim(3, 0);
    const record = JSON.parse(g.exportSave()).worlds.field.glass.find(a => a.uid === window.__preferenceUid);
    return { absent: g.dispositions(window.__preferenceUid) === null, record };
  })()`);
  report.isolation = isolation;
  check('inactive-map record remains frozen and absent from active actors', isolation.absent && isolation.record.habits.stargaze === saved.habits.stargaze);
  await page.evaluate('window.__gummy.setMap("field")');
  await page.waitFor('window.__gummy.map().id === "field" && !document.getElementById("mapWipe").classList.contains("on") && window.__gummy.glass().actors.every(a => a.ready)', 150000);
  check('returning map restores its own preferences', (await page.evaluate('window.__gummy.dispositions(window.__preferenceUid)')).preferences.stargaze === 1);
  const birth = await page.evaluate(`(() => {
    const g = window.__gummy;
    const before = new Set(g.glass().actors.map(a => a.uid));
    const born = g.glassBirth(0);
    const child = g.glass().actors.find(a => !before.has(a.uid));
    return { born, child: child ? g.dispositions(child.uid) : null };
  })()`);
  report.birth = birth;
  check('newborn does not inherit preferences or learned habits', birth.born && birth.child && !Object.keys(birth.child.preferences).length && !Object.keys(birth.child.habits).length);
  await page.evaluate('window.__gummy.importSave(window.__preferenceBaseline)');
  await page.waitFor('window.__gummy.glass().actors.every(a => a.ready)', 150000);
  const clean = await page.evaluate('window.__gummy.dispositions(window.__preferenceUid)');
  check('loading another game clears preferences and habits even with reused uid', clean && !Object.keys(clean.preferences).length && !Object.keys(clean.habits).length);
  check('no page errors', browser.pageErrors.length === 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  report.harness = page?.diagnostics();
  await writeFile(`${ROOT}/.dev-shots/preferences-test.json`, JSON.stringify(report, null, 2));
  if (browser) await browser.close();
}
