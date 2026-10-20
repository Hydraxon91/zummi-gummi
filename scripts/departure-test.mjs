// Departure-hook lifecycle check: ceiling culling records; map/save/new-game
// teardown does not. Start launch.py first and point GAME_URL at it.
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const GAME = process.env.GAME_URL || 'http://localhost:8000/';
const TARGET = new URL(GAME);
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: 1440, height: 900 });
const evaluate = expression => page.evaluate(expression, 120000);
const waitFor = (expression, timeout = 30000) => page.waitFor(expression, timeout);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { checks: [], pageErrors: browser.pageErrors };

function check(name, pass, detail = {}) {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value !== undefined ? ` (${detail.value})` : ''}`);
}

try {
  await waitFor('!!window.__gummy?.booted', 120000);
  await waitFor('window.__gummy.map().id === "field"', 30000);

  const off = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('departures', false);
    g.clearDepartures();
    const before = g.traits().length;
    const limit = document.getElementById('limit');
    limit.value = '8';
    limit.dispatchEvent(new Event('input', { bubbles: true }));
    if (g.traits().length >= 8) g.spawnAt(0, 0, .5, 0);
    return { before, after: g.traits().length, records: g.departures().length };
  })()`);
  check('departures off records nothing', off.records === 0, { value: JSON.stringify(off) });

  const on = await evaluate(`(() => {
    const g = window.__gummy;
    g.setBehaviorFeature('departures', true);
    g.clearDepartures();
    g.setBond(0, 1, .73);
    const before = g.traits().length;
    g.spawnAt(0, 0, .5, 0);
    const records = g.departures();
    const survivors = records[0] ? records[0].survivors : [];
    return {
      before,
      after: g.traits().length,
      count: records.length,
      cause: records[0]?.cause || null,
      maxBond: survivors.reduce((max, row) => Math.max(max, row.bond || 0), 0),
      hasSurvivor: survivors.length > 0,
    };
  })()`);
  check('ceiling culling records one removed departure', on.count === 1, { value: JSON.stringify(on) });
  check('ceiling culling cause is removed', on.cause === 'removed');
  check('survivor bond is captured', on.hasSurvivor && on.maxBond >= .73, { value: on.maxBond });

  const save = await evaluate(`(() => {
    const g = window.__gummy;
    g.clearDepartures();
    const save = g.exportSave();
    return { hasDepartureFields: /departure|departedUid/.test(save) };
  })()`);
  check('save payload has no departure fields', !save.hasDepartureFields);

  await evaluate("window.__gummy.clearDepartures(); window.__gummy.setMap('studio')");
  await waitFor('window.__gummy.map().id === "studio"', 30000);
  await sleep(700);
  await evaluate("window.__gummy.setMap('field')");
  await waitFor('window.__gummy.map().id === "field"', 30000);
  await sleep(700);
  const switched = await evaluate('window.__gummy.departures().length');
  check('map switch produces no departures', switched === 0, { value: switched });

  const restored = await evaluate(`(() => {
    const g = window.__gummy;
    g.clearDepartures();
    const save = g.exportSave();
    g.importSave(save);
    return { departures: g.departures().length };
  })()`);
  check('save/load restore produces no departures', restored.departures === 0, {
    value: restored.departures,
  });

  const fresh = await evaluate(`(() => {
    const g = window.__gummy;
    g.clearDepartures();
    g.newGame();
    return { departures: g.departures().length };
  })()`);
  check('new game produces no departures', fresh.departures === 0, { value: fresh.departures });

  if (browser.pageErrors.length) throw new Error(browser.pageErrors.slice(0, 3).join(' | '));
  console.log(JSON.stringify(report));
  console.log(report.checks.every(row => row.pass) ? 'DEPARTURE HOOK PASS' : 'DEPARTURE HOOK FAIL');
} catch (error) {
  console.log(JSON.stringify({ ...report, error: String(error), pageErrors: browser.pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
