// UI-only thought-bubble scenario.
//
// Verifies the off-by-default flag, plan().reason text, DOM projection, and
// captures day/night/close-up/UI-hidden screenshots. Start launch.py first.

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const TAG = process.env.TAG || 'thoughts';
const TARGET = new URL(GAME);
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', process.env.BEHAVIORS || 'modules');
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: 1440, height: 900 });
const evaluate = (expression, timeout = 120000) => page.evaluate(expression, timeout);
const capture = process.env.SHOTS !== '0';
const shot = name => capture
  ? page.screenshot(`${ROOT}/.dev-shots/${TAG}_${name}.png`)
  : Promise.resolve(null);

const report = { tag: TAG, url: TARGET.href, pageErrors: browser.pageErrors };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await page.waitFor('!!window.__gummy?.booted', 120000);
  await page.waitFor('window.__gummy.glass()?.actors?.every(a => a.ready) !== false', 60000);
  const initial = await evaluate(`(() => {
    const g = window.__gummy;
    return {
      feature: g.behaviorConfig()?.features?.thoughtBubbles,
      state: g.thoughtState(),
      hidden: document.getElementById('thoughtLayer')?.hidden,
      children: document.getElementById('thoughtLayer')?.children?.length || 0,
    };
  })()`);
  if (initial.feature !== false || initial.hidden !== true || (initial.state?.count || 0) !== 0) {
    throw new Error(`thought bubbles were not off by default: ${JSON.stringify(initial)}`);
  }

  const enabled = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(12);
    g.sim(1, 0);
    const state = g.thoughts(true);
    const plans = g.bears.map((b, i) => ({
      uid: b.uid,
      reason: g.aiPlan(i)?.reason || null,
      text: [...document.querySelectorAll('#thoughtLayer .thoughtBubble')]
        .find(el => el.textContent === (g.aiPlan(i)?.reason || ''))?.textContent || null,
    })).filter(row => row.reason);
    return {
      state,
      plans,
      hidden: document.getElementById('thoughtLayer')?.hidden,
      children: document.getElementById('thoughtLayer')?.children?.length || 0,
    };
  })()`);
  if (!enabled.state?.enabled || enabled.state.count < 1 || enabled.hidden !== false) {
    throw new Error(`thought overlay did not enable: ${JSON.stringify(enabled)}`);
  }
  const missing = enabled.plans.filter(row => !row.text);
  if (missing.length) throw new Error(`thought text missing for plans: ${JSON.stringify(missing)}`);
  report.day = await shot('a_thoughts_day_on');
  report.enabled = enabled.state;

  const close = await evaluate(`(() => {
    const g = window.__gummy;
    const b = g.bears.find(item => item.active && item.ai);
    if (!b) return null;
    const { camera } = g.three();
    g.freezeCamera(true);
    camera.position.set(b.cx + 7.5, 3.3, b.cz + 7.5);
    camera.lookAt(b.cx, Math.max(.3, (b.cy || 0) + .65), b.cz);
    camera.updateMatrixWorld(true);
    return { uid: b.uid, state: g.thoughts() };
  })()`);
  if (!close) throw new Error('no actor for close-up');
  report.close = await shot('a_thoughts_close_on');
  await evaluate(`(() => {
    window.__gummy.freezeCamera(false);
    window.__gummy.thoughts(false);
  })()`);
  report.offDay = await shot('a_thoughts_day_off');
  const off = await evaluate(`(() => ({
    state: window.__gummy.thoughtState(),
    hidden: document.getElementById('thoughtLayer')?.hidden,
  }))()`);
  if (off.state?.enabled || off.hidden !== true) throw new Error(`thought overlay did not hide: ${JSON.stringify(off)}`);

  await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(23);
    g.sim(.5, 0);
    g.thoughts(true);
  })()`);
  report.night = await shot('a_thoughts_night_on');
  await evaluate("document.body.classList.add('ui-hidden')");
  await sleep(420);
  report.uiHidden = await shot('a_thoughts_ui_hidden');
  await evaluate("document.body.classList.remove('ui-hidden')");
  await sleep(420);

  const final = await evaluate(`(() => ({
    feature: window.__gummy.behaviorConfig()?.features?.thoughtBubbles,
    state: window.__gummy.thoughtState(),
    hidden: document.getElementById('thoughtLayer')?.hidden,
  }))()`);
  if (browser.pageErrors.length) throw new Error(`page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`);
  report.final = final;
  console.log(JSON.stringify(report));
  console.log('THOUGHT BUBBLE PASS');
} catch (error) {
  console.log(JSON.stringify({ ...report, error: String(error), pageErrors: browser.pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
