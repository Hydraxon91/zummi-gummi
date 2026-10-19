// Headless frame-time profile for the current Meadow.
//
// Start launch.py first, then:
//   node scripts/perf-profile.mjs
// Optional: GAME_URL, TAG, BROWSER_BIN/CHROME_BIN.
//
// Method: 1440x900, DPR 1, quality 2, effects off, adaptive off, day look,
// current starter roster (8 soft bodies + 2 Glass), six simulated seconds to
// settle family/Glass state, then frozen AI/camera. Five 60-frame renderProbe
// samples after a discarded warm-up; report median and range. This is a
// forced-sync frame time, not a refresh-rate claim.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TAG = process.env.TAG || 'current';
const LOW_QUALITY = process.env.LOW_QUALITY === '1';
const WIDTH = Number(process.env.WIDTH || (LOW_QUALITY ? 900 : 1440));
const HEIGHT = Number(process.env.HEIGHT || (LOW_QUALITY ? 600 : 900));
const base = process.env.GAME_URL || 'http://localhost:8000/';
const target = new URL(base);
target.searchParams.set('autostart', '1');

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = value => +Number(value).toFixed(2);

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
let failure = null;
try {
  const page = await browser.openPage({
    url: target.href,
    width: WIDTH,
    height: HEIGHT,
  });
  await page.waitFor('!!window.__gummy?.booted', 90000);
  await page.waitFor('window.__gummy.glass().actors.every(actor => actor.ready)', 90000);

  const setup = await page.evaluate(`(() => {
    const g = window.__gummy;
    g.seed(424242);
    if (!document.body.classList.contains('ui-hidden')) document.getElementById('uiToggle').click();
    ${LOW_QUALITY
      ? "g.setProfile('performance'); g.setAdaptive(false); g.setRenderScale(0.6); g.setQuality(3); g.setEffects('off');"
      : "g.setAdaptive(false); g.setQuality(2); g.setEffects('off'); g.setNature({ canopy: 1, leafSize: 1, coverage: 1, drawDistance: 56 });"}
    g.setSkyLook('day');
    g.sim(6, 8);
    g.freeze(true);
    g.freezeCamera(true);
    g.renderProbe(120);
    return { stats: g.stats(), field: g.fieldInfo(), settings: g.settings(), map: g.map() };
  })()`);

  const probe = async (name) => {
    const result = await page.evaluate(`(() => {
      const g = window.__gummy;
      const samples = [];
      for (let i = 0; i < 7; i += 1) samples.push(g.renderProbe(60).msPerFrame);
      const stats = g.stats();
      return { samples, calls: stats.calls, tris: stats.tris, frameMs: stats.frameMs, aiMs: g.ai().ms };
    })()`);
    await page.screenshot(`${ROOT}/.dev-shots/perf_${TAG}_${name}.png`);
    const stable = result.samples.slice(2);
    return {
      name,
      samples: result.samples,
      stableSamples: stable,
      medianMs: round(median(stable)),
      minMs: round(Math.min(...stable)),
      maxMs: round(Math.max(...stable)),
      meanMs: round(mean(stable)),
      calls: result.calls,
      tris: result.tris,
      frameMs: result.frameMs,
      aiMs: result.aiMs,
    };
  };

  const baseNature = setup.field?.nature || { canopy: 1, leafSize: 1, coverage: 1, drawDistance: 56 };
  const setNature = (nature) => page.evaluate(`window.__gummy.setNature(${JSON.stringify(nature)})`);

  const rows = [];
  rows.push(await probe('baseline'));
  await setNature({ ...baseNature, coverage: 0 });
  rows.push(await probe('grass_coverage_min'));
  await setNature({ ...baseNature, drawDistance: 28 });
  rows.push(await probe('grass_distance_min'));
  await setNature(baseNature);
  rows.push(await probe('baseline_repeat'));

  const report = rows.map(row => ({
    name: row.name,
    medianMs: row.medianMs,
    minMs: row.minMs,
    maxMs: row.maxMs,
    meanMs: row.meanMs,
    stableSamples: row.stableSamples.map(round),
    allSamples: row.samples.map(round),
    calls: row.calls,
    tris: row.tris,
    frameMs: row.frameMs,
    aiMs: row.aiMs,
  }));
  console.log(JSON.stringify({ tag: TAG, lowQuality: LOW_QUALITY, width: WIDTH, height: HEIGHT, url: target.href, setup: {
    map: setup.map.id, bears: setup.stats.bears, glass: setup.stats.glass,
    dpr: setup.stats.dpr, quality: setup.stats.quality, calls: setup.stats.calls,
    tris: setup.stats.tris, nature: setup.field?.nature || null, settings: setup.settings,
  }, rows: report, pageErrors: browser.pageErrors }, null, 2));

  if (browser.pageErrors.length) failure = `page errors: ${browser.pageErrors.slice(0, 3).join(' | ')}`;
  if (setup.stats.nan) failure = 'non-finite physics state';
  if (!report.length) failure = 'no probe rows';
} catch (error) {
  failure = error;
} finally {
  await browser.close();
}
if (failure) {
  console.error('PERF FAIL', failure);
  process.exit(1);
}
