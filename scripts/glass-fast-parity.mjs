// Compare identical fixed-step runs with and without surface rebuilding.
import assert from 'node:assert/strict';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const url = new URL(process.env.GAME_URL || 'http://localhost:8000/');
url.searchParams.set('autostart', '1');
url.searchParams.set('behaviors', process.env.BEHAVIORS || 'modules');
const launched = await launchBrowser();
const browser = await connectBrowser(launched);
try {
  const results = [];
  for (const rebuild of [8, 0]) {
    const page = await browser.openPage({ url: url.href, initScript: `(() => {
      let state = 12345;
      Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
      window.__testRng = () => state;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = callback => raf.call(window, time => {
        if (window.__gummy?.booted) window.__gummy.pause(true);
        callback(time);
      });
    })()` });
    await page.waitFor('window.__gummy?.booted && window.__gummy.glass().actors.every(a => a.ready)', 30000);
    results.push(await page.evaluate(`(() => {
      const g = window.__gummy;
      g.pause(true);
      const start = performance.now();
      const checkpoints = [];
      for (let i = 0; i < 5; i++) {
        g.sim(2, ${rebuild});
        checkpoints.push({
          rng: window.__testRng(),
          glass: g.glass(),
          bears: g.bears.map(b => ({ uid: b.uid, age: b.age, hunger: b.hunger,
            thirst: b.thirst, health: b.health, state: b.ai.state,
            position: Array.from(b.px), y: Array.from(b.py), z: Array.from(b.pz) })),
        });
      }
      return { ms: performance.now() - start, checkpoints };
    })()`, 30000));
    await browser.send('Target.closeTarget', { targetId: page.targetId });
  }
  assert.deepEqual(results[0].checkpoints, results[1].checkpoints);
  assert.deepEqual(browser.pageErrors, []);
  console.log('FAST PARITY PASS', JSON.stringify({ rebuildMs: results[0].ms, fastMs: results[1].ms }));
} finally {
  await browser.close();
}
