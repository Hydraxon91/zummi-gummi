// Stars farewell lifecycle + screenshots. Start launch.py first.
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
const evaluate = expression => page.evaluate(expression, 120000);
const waitFor = (expression, timeout = 30000) => page.waitFor(expression, timeout);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const shot = name => page.screenshot(`${ROOT}/.dev-shots/stars_${name}.png`);
const report = { pageErrors: browser.pageErrors, checks: [] };

function check(name, pass, detail = {}) {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value !== undefined ? ` (${detail.value})` : ''}`);
}

try {
  await waitFor('!!window.__gummy?.booted', 120000);
  await waitFor('window.__gummy.map().id === "field"', 30000);
  await sleep(500);

  const setup = await evaluate(`(() => {
    const g = window.__gummy;
    const ui = {
      master: document.getElementById('settingsFarewells'),
      oldAge: document.getElementById('settingsStarsOldAge'),
      starvation: document.getElementById('settingsStarsStarvation'),
      stings: document.getElementById('settingsStarsStings'),
    };
    const defaults = {
      master: ui.master?.checked,
      oldAgeDisabled: ui.oldAge?.disabled,
    };
    for (const key of ['master', 'oldAge', 'starvation', 'stings']) {
      const box = ui[key];
      if (!box) continue;
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    g.setBehaviorFeature('thoughtBubbles', true);
    g.thoughts(true);
    const adult = g.traits().findIndex((actor, i) => actor.stage === 'adult' && !g.starsBlock(i));
    const uid = g.traits()[adult]?.uid;
    g.setAge(adult, 99999);
    g.setHunger(adult, .20);
    g.setThirst(adult, .20);
    g.setEnergy(adult, 1);
    g.setSocial(adult, .90);
    g.setAffection(adult, .90);
    return {
      adult, uid, before: g.traits().length,
      defaults,
      features: g.behaviorConfig()?.features,
      block: g.starsBlock(adult),
      actors: g.traits().map(actor => ({ uid: actor.uid, stage: actor.stage, home: actor.home, parents: actor.parentUids })),
      actor: g.traits()[adult],
    };
  })()`);
  console.log('SETUP ' + JSON.stringify(setup));
  check('farewell UI defaults off', setup.defaults.master === false && setup.defaults.oldAgeDisabled === true, {
    value: JSON.stringify(setup.defaults),
  });
  check('farewell UI toggles the feature flags',
    setup.features?.farewells && setup.features?.starsOldAge &&
    setup.features?.starsStarvation && setup.features?.starsStings,
    { value: JSON.stringify(setup.features) });
  check('adult index found', setup.adult >= 0, { value: setup.adult });

  await evaluate("window.__gummy.sim(0.2, 0)");
  const fading = await evaluate(`(() => {
    const g = window.__gummy;
    const i = ${setup.adult};
    const state = g.fading(i);
    const b = g.bears[i];
    const { camera } = g.three();
    g.freezeCamera(true);
    camera.position.set(b.cx + 4.2, 1.8, b.cz + 4.2);
    camera.lookAt(b.cx, (b.cy || 0) + .55, b.cz);
    camera.updateMatrixWorld(true);
    return { state, label: g.behavior()?.actors?.[i]?.reason || null };
  })()`);
  check('old age starts fading', fading.state?.fading && fading.state.reason === 'oldAge', {
    value: JSON.stringify(fading.state),
  });
  check('fading thought reads feeling faint', fading.label === 'feeling faint', { value: fading.label });
  await sleep(250);
  report.glowShot = await shot('a_fading_glow_day');

  // Advance to commitment; the visual runs in the real animation loop.
  await evaluate(`window.__gummy.starsAdvance(${setup.adult}, 30.5)`);
  await sleep(700);
  const committed = await evaluate(`(() => ({
    count: window.__gummy.traits().length,
    visuals: window.__gummy.farewellVisuals(),
    stars: window.__gummy.skyFarewells(),
  }))()`);
  report.committed = committed;
  check('daytime farewell star is queued for night', committed.stars.queued === 1, {
    value: JSON.stringify(committed.stars),
  });
  report.riseShot = await shot('b_rise_day');
  await sleep(900);
  report.fadeShot = await shot('c_fade_day');

  await evaluate("window.__gummy.setTime(23); window.__gummy.sim(0.2, 0)");
  await sleep(900);
  report.nightShot = await shot('d_star_night');
  const night = await evaluate('window.__gummy.skyFarewells()');
  check('night star is shown', night && night.shown > 0, { value: JSON.stringify(night) });
  const removed = await evaluate(`({ visuals: window.__gummy.farewellVisuals(),
    present: window.__gummy.traits().some(actor => actor.uid === ${setup.uid}) })`);
  check('farewell visual ends with actor removal', removed.visuals === 0 && !removed.present, {
    value: JSON.stringify(removed),
  });
  if (night?.points?.length) {
    await evaluate(`(() => {
      const g = window.__gummy;
      const p = ${JSON.stringify(night.points[0])};
      const { camera } = g.three();
      document.body.classList.add('ui-hidden');
      camera.position.set(0, 2, 0);
      camera.lookAt(p.x, p.y, p.z);
      camera.updateMatrixWorld(true);
    })()`);
    await sleep(500);
    report.starCloseShot = await shot('d_star_close_night');
    await evaluate("document.body.classList.remove('ui-hidden')");
  }

  await waitFor('window.__gummy.glass()?.actors?.every(a => a.ready) !== false', 60000);
  const glass = await evaluate(`(() => {
    const g = window.__gummy;
    const actors = g.glass()?.actors || [];
    const index = actors.findIndex((actor, i) =>
      actor.stage === 'adult' && !g.glassStarsBlock(i));
    if (index < 0) return { skipped: true };
    g.glassSetAge(index, 99999);
    g.glassSetNeed(index, 'hunger', .20);
    g.glassSetNeed(index, 'thirst', .20);
    const before = g.glass().count;
    g.glassStarsAdvance(index, .1);
    const fading = g.glassFading(index);
    g.glassStarsAdvance(index, 30.5);
    return { index, before, fading };
  })()`);
  await sleep(3500);
  const glassAfter = glass.skipped ? { count: null } : await evaluate(`(() => ({
    count: window.__gummy.glass().count,
    stars: window.__gummy.skyFarewells(),
  }))()`);
  check('Glass farewell fades and removes the actor',
    !glass.skipped && glass.fading?.fading && glassAfter.count === glass.before - 1,
    { value: JSON.stringify({ glass, after: glassAfter }) });

  // A map switch must dispose the transient star and pending visuals.
  await evaluate("window.__gummy.clearDepartures(); window.__gummy.setMap('studio')");
  await waitFor('window.__gummy.map().id === "studio"', 30000);
  await sleep(900);
  const switched = await evaluate(`({
    stars: window.__gummy.skyFarewells(),
    visuals: window.__gummy.farewellVisuals(),
    departures: window.__gummy.departures().length,
  })`);
  check('map switch clears star and visual state', switched.stars.active === 0 && switched.visuals === 0, {
    value: JSON.stringify(switched),
  });
  check('map switch is not a departure', switched.departures === 0, { value: switched.departures });
  await evaluate("window.__gummy.setMap('field')");
  await waitFor('window.__gummy.map().id === "field"', 30000);
  await sleep(900);

  const stay = await evaluate(`(() => {
    const g = window.__gummy;
    const i = g.traits().findIndex(actor => actor.stage === 'adult');
    g.setStay(i, true);
    g.setAge(i, 99999);
    g.sim(0.3, 0);
    const state = g.fading(i);
    g.setStay(i, false);
    return { state, stay: g.stay(i) };
  })()`);
  check('stay override prevents fading', !!stay.state && !stay.state.fading, { value: JSON.stringify(stay) });
  check('stay override is runtime-only', stay.stay === false);

  const cleanup = await evaluate(`(() => {
    const g = window.__gummy;
    g.setTime(23);
    g.sim(0.1, 0);
    g.newGame();
    return { stars: g.skyFarewells(), visuals: g.farewellVisuals() };
  })()`);
  check('new game clears star and visual state', cleanup.stars.active === 0 && cleanup.visuals === 0, {
    value: JSON.stringify(cleanup),
  });

  const kill = await evaluate(`(() => {
    const g = window.__gummy;
    const i = g.traits().findIndex((actor, index) => actor.stage === 'adult' && !g.starsBlock(index));
    g.setAge(i, 99999);
    g.sim(.2, 0);
    const before = g.fading(i);
    const box = document.getElementById('settingsFarewells');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after: g.fading(i), feature: g.behaviorConfig()?.features?.farewells };
  })()`);
  check('settings kill switch clears pending fading',
    kill.before?.fading && !kill.after?.fading && kill.feature === false,
    { value: JSON.stringify(kill) });

  if (browser.pageErrors.length) throw new Error(browser.pageErrors.slice(0, 3).join(' | '));
  console.log(JSON.stringify(report));
  const passed = report.checks.every(row => row.pass);
  console.log(passed ? 'STARS PASS' : 'STARS FAIL');
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ ...report, error: String(error), pageErrors: browser.pageErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
