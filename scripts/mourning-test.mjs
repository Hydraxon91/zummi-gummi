// Mourning lifecycle: stars departure -> per-save grief -> save/load isolation.
// Start launch.py first, then run with GAME_URL.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'mourning';
const REPORT = `${ROOT}/.dev-shots/mourning-${TAG}.json`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: 1440, height: 900 });
const evaluate = (expression, timeout = 30000) => page.evaluate(expression, timeout);
const report = { tag: TAG, pageErrors: browser.pageErrors, checks: [] };
const check = (name, pass, detail = {}) => {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value === undefined ? '' : ` (${detail.value})`}`);
};

try {
  await page.waitFor('!!window.__gummy?.booted', 60000);
  await page.waitFor('window.__gummy.glass().actors.every(a => a.ready)', 30000);
  const setup = await evaluate(`(() => {
    const g = window.__gummy;
    for (const id of ['settingsFarewells', 'settingsStarsOldAge', 'settingsMourning']) {
      const box = document.getElementById(id);
      if (box) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    g.setBehaviorFeature('mood', true);
    g.setBehaviorFeature('thoughtBubbles', true);
    g.thoughts(true);
    const actors = g.traits();
    const departed = actors.findIndex((a, i) => a.stage === 'adult' && !g.starsBlock(i));
    if (departed < 0) return { found: false };
    const survivor = actors.findIndex((a, i) => i !== departed && a.stage === 'adult');
    if (survivor < 0) return { found: false };
    g.setBond(survivor, departed, .85);
    g.setBond(departed, survivor, .85);
    g.setAge(departed, 99999);
    g.sim(.2, 0);
    const fading = g.fading(departed);
    g.starsAdvance(departed, 30.5);
    return {
      found: true, departed, survivor,
      departedUid: actors[departed].uid,
      survivorUid: actors[survivor].uid,
      features: g.behaviorConfig()?.features,
      startFading: fading,
    };
  })()`);
  await page.waitFor('window.__gummy.farewellVisuals() === 0', 8000);
  const afterFarewell = await evaluate(`(() => {
    const g = window.__gummy;
    const survivor = g.traits().findIndex(a => a.uid === ${setup.survivorUid});
    return {
      mourning: survivor >= 0 ? g.mourning(survivor) : [],
      label: survivor >= 0 ? g.mourningLabel(survivor) : null,
      present: g.traits().some(a => a.uid === ${setup.departedUid}),
      visuals: g.farewellVisuals(),
      details: g.farewellDetails(),
      paused: g.paused(),
      hidden: document.hidden,
      visibility: document.visibilityState,
      frameMs: g.stats().frameMs,
      fading: g.fading(${setup.departed}),
      mood: survivor >= 0 ? g.mood(survivor) : null,
      moodTarget: survivor >= 0 ? g.mood(survivor)?.target : null,
    };
  })()`);
  Object.assign(setup, afterFarewell);
  check('mourning feature and UI are on', setup.found && setup.features?.mourning && setup.features?.farewells, {
    value: JSON.stringify(setup.features),
  });
  check('old-age farewell starts', setup.startFading?.fading && setup.startFading.reason === 'oldAge', {
    value: JSON.stringify(setup.startFading),
  });
  check('departed actor is removed', setup.present === false, { value: setup.present });
  check('close survivor receives a mourning record',
    setup.mourning?.length === 1 && setup.mourning[0].uid === setup.departedUid, {
      value: JSON.stringify(setup.mourning),
    });
  check('mourning has a readable label', /missing /.test(setup.label || ''), { value: setup.label });
  check('mourning lowers the survivor mood target',
    Number.isFinite(setup.moodTarget) && setup.moodTarget < 0, { value: setup.moodTarget });
  report.setup = setup;

  const comfort = await evaluate(`(() => {
    const g = window.__gummy;
    const survivor = g.traits().findIndex(a => a.uid === ${setup.survivorUid});
    const comforter = g.traits().findIndex((a, i) => i !== survivor && a.stage === 'adult');
    if (survivor < 0 || comforter < 0) return { found: false };
    g.setBond(survivor, comforter, .9);
    g.setBond(comforter, survivor, .9);
    const before = g.mourning(survivor)[0]?.untilDay;
    const started = g.forceSocial(comforter, survivor);
    const after = g.mourning(survivor)[0]?.untilDay;
    return { found: true, started, before, after };
  })()`);
  check('social comfort eases a grieving actor',
    comfort.found && comfort.started?.ok && comfort.after < comfort.before, {
      value: JSON.stringify(comfort),
    });
  report.comfort = comfort;

  const saved = await evaluate(`(async () => {
    const g = window.__gummy;
    const i = g.traits().findIndex(a => a.uid === ${setup.survivorUid});
    const before = g.mourning(i);
    await g.save('slot1', 'mourning-test');
    await g.load('slot1');
    const afterIndex = g.traits().findIndex(a => a.uid === ${setup.survivorUid});
    const after = afterIndex >= 0 ? g.mourning(afterIndex) : [];
    const others = g.traits()
      .map((actor, index) => ({ actor, index }))
      .filter(row => row.actor.uid !== ${setup.survivorUid});
    return {
      before, after,
      fresh: others.every(row => g.mourning(row.index).length === 0),
    };
  })()`);
  check('mourning survives the same save slot',
    saved.before.length === 1 && saved.after.length === 1 &&
    saved.after[0].uid === saved.before[0].uid, { value: JSON.stringify(saved) });
  check('a fresh actor has no inherited mourning', saved.fresh, { value: saved.fresh });
  report.save = saved;

  const isolated = await evaluate(`(async () => {
    const g = window.__gummy;
    await g.newGame();
    await g.save('slot2', 'fresh game');
    const fresh = g.traits().every((actor, index) => g.mourning(index).length === 0);
    await g.load('slot1');
    const grievingIndex = g.traits().findIndex(a => a.uid === ${setup.survivorUid});
    const restored = grievingIndex >= 0 && g.mourning(grievingIndex).length === 1;
    await g.load('slot2');
    const leaked = g.traits().some((actor, index) => g.mourning(index).length > 0);
    return { fresh, restored, leaked };
  })()`);
  check('a new game starts without grief', isolated.fresh, { value: isolated.fresh });
  check('reloading the grieving game restores its record', isolated.restored, { value: isolated.restored });
  check("a second game does not inherit the first game's grief", !isolated.leaked, {
    value: JSON.stringify(isolated),
  });
  report.isolation = isolated;

  // A Glass survivor must persist its own record through the shared actor save.
  const glassSetup = await evaluate(`(() => {
    const g = window.__gummy;
    const glassActors = g.glass()?.actors || [];
    const survivorIndex = glassActors.findIndex(a => a.stage === 'adult');
    const bears = g.traits();
    const departedIndex = bears.findIndex((a, i) => a.stage === 'adult' && !g.starsBlock(i));
    if (survivorIndex < 0 || departedIndex < 0) return { found: false };
    const survivorUid = glassActors[survivorIndex].uid;
    const departedUid = bears[departedIndex].uid;
    g.glassSetBond(survivorIndex, departedUid, .9);
    g.setAge(departedIndex, 99999);
    g.sim(.2, 0);
    const startFading = g.fading(departedIndex);
    g.starsAdvance(departedIndex, 30.5);
    return { found: true, survivorIndex, survivorUid, departedIndex, departedUid, startFading };
  })()`);
  if (glassSetup.found) await page.waitFor('window.__gummy.farewellVisuals() === 0', 8000);
  const glassAfter = glassSetup.found ? await evaluate(`(() => {
    const g = window.__gummy;
    const actors = g.glass()?.actors || [];
    const index = actors.findIndex(a => a.uid === ${glassSetup.survivorUid});
    return {
      present: g.traits().some(a => a.uid === ${glassSetup.departedUid}),
      mourning: index >= 0 ? g.glassMourning(index) : [],
    };
  })()`) : { present: null, mourning: [] };
  check('a Glass survivor mourns a bonded stars departure',
    glassSetup.found && glassSetup.startFading?.fading === true && glassAfter.present === false &&
    glassAfter.mourning.length === 1 && glassAfter.mourning[0].uid === glassSetup.departedUid, {
      value: JSON.stringify({ glassSetup, glassAfter }),
    });
  const glassSave = glassSetup.found ? await evaluate(`(async () => {
    const g = window.__gummy;
    await g.save('slot3', 'glass-mourning');
    await g.load('slot3');
    const index = (g.glass()?.actors || []).findIndex(a => a.uid === ${glassSetup.survivorUid});
    const restored = index >= 0 ? g.glassMourning(index) : [];
    await g.newGame();
    const fresh = (g.glass()?.actors || []).every((a, i) => g.glassMourning(i).length === 0);
    await g.load('slot3');
    const againIndex = (g.glass()?.actors || []).findIndex(a => a.uid === ${glassSetup.survivorUid});
    const again = againIndex >= 0 ? g.glassMourning(againIndex) : [];
    return { restored, fresh, again };
  })()`) : { restored: [], fresh: null, again: [] };
  check('Glass grief survives its save slot and a new game starts clean',
    glassSave.restored.length === 1 && glassSave.restored[0].uid === glassSetup.departedUid &&
    glassSave.fresh === true && glassSave.again.length === 1, {
      value: JSON.stringify(glassSave),
    });
  report.glass = { setup: glassSetup, after: glassAfter, save: glassSave };
  report.errors = browser.pageErrors;
  console.log('REPORT', REPORT);
} catch (error) {
  report.failure = String(error.stack || error);
  console.log('STOP', report.failure.slice(0, 2000));
  process.exitCode = 1;
} finally {
  await writeFile(REPORT, JSON.stringify(report, null, 2));
  await browser.close();
}
// A recorded failure is a failed run even when no exception was thrown.
if (report.checks.some(entry => !entry.pass)) process.exitCode = 1;
