// Mood-driven thought-bubble tint scenario. Start launch.py first.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const TARGET = new URL(GAME);
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: 1440, height: 900 });
const evaluate = (expression, timeout = 120000) => page.evaluate(expression, timeout);
const shot = name => page.screenshot(`${ROOT}/.dev-shots/mood_${name}.png`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { pageErrors: browser.pageErrors };
try {
  await page.waitFor('!!window.__gummy?.booted', 120000);
  await page.waitFor('window.__gummy.glass()?.actors?.every(a => a.ready) !== false', 60000);
  const setup = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('mood', true);
    g.thoughts(true);
    g.setTime(12);
    g.sim(1, 0);
    for (const b of g.bears) {
      g.setHunger(g.bears.indexOf(b), .95);
      g.setThirst(g.bears.indexOf(b), .90);
      g.setHealth(g.bears.indexOf(b), 20);
      g.setMood(g.bears.indexOf(b), -.8);
    }
    g.thoughts();
    const rows = [...document.querySelectorAll('#thoughtLayer .thoughtBubble')];
    return {
      mood: g.mood(0),
      bubbles: rows.length,
      labels: [...new Set(rows.map(el => el.dataset.mood))],
    };
  })()`);
  if (!setup.mood || setup.bubbles < 1 || !setup.labels.includes('miserable')) {
    throw new Error(`mood low state not rendered: ${JSON.stringify(setup)}`);
  }
  report.low = setup;
  report.lowShot = await shot('a_low_day');

  const high = await evaluate(`(() => {
    const g = window.__gummy;
    for (const b of g.bears) {
      const i = g.bears.indexOf(b);
      g.setHunger(i, .2);
      g.setThirst(i, .2);
      g.setHealth(i, 100);
      g.setEnergy(i, 1);
      g.setSocial(i, .9);
      g.setAffection(i, .9);
      g.setMood(i, .8);
    }
    g.thoughts();
    const rows = [...document.querySelectorAll('#thoughtLayer .thoughtBubble')];
    return {
      mood: g.mood(0),
      bubbles: rows.length,
      labels: [...new Set(rows.map(el => el.dataset.mood))],
    };
  })()`);
  if (!high.mood || !high.labels.includes('cheerful')) {
    throw new Error(`mood high state not rendered: ${JSON.stringify(high)}`);
  }
  report.high = high;
  report.highShot = await shot('b_high_day');

  const close = await evaluate(`(() => {
    const g = window.__gummy;
    const b = g.bears.find(item => item.active && item.ai);
    const { camera } = g.three();
    g.freezeCamera(true);
    camera.position.set(b.cx + 7.5, 3.3, b.cz + 7.5);
    camera.lookAt(b.cx, Math.max(.3, (b.cy || 0) + .65), b.cz);
    camera.updateMatrixWorld(true);
    return g.thoughts();
  })()`);
  report.close = close;
  report.closeShot = await shot('c_mixed_close');

  await evaluate(`(() => {
    const g = window.__gummy;
    g.freezeCamera(false);
    g.setTime(23);
    g.sim(.2, 0);
    g.thoughts(true);
  })()`);
  await sleep(250);
  report.nightShot = await shot('d_night_high');

  await evaluate("document.body.classList.add('ui-hidden')");
  await sleep(420);
  report.hiddenShot = await shot('e_ui_hidden');
  await evaluate("document.body.classList.remove('ui-hidden')");
  if (browser.pageErrors.length) throw new Error(`page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`);
  console.log(JSON.stringify(report));
  console.log('MOOD BUBBLE PASS');
} catch (error) {
  console.log(JSON.stringify({ ...report, error: String(error), pageErrors: browser.pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
