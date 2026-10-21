// Physical gifting: settings, collection/carry, accepted gift, refusal, daily cap,
// map cleanup and v7 save.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { launchBrowser, connectBrowser } from './browser-harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TARGET = new URL(process.env.GAME_URL || 'http://localhost:8000/');
TARGET.searchParams.set('autostart', '1');
TARGET.searchParams.set('behaviors', 'modules');
const TAG = process.env.TAG || 'gifting';
const WIDTH = Number(process.env.WIDTH || 1440);
const HEIGHT = Number(process.env.HEIGHT || 900);
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
const REPORT = `${ROOT}/.dev-shots/gifting-${TAG}.json`;
await mkdir(`${ROOT}/.dev-shots`, { recursive: true });

const launched = await launchBrowser();
const browser = await connectBrowser(launched);
const page = await browser.openPage({ url: TARGET.href, width: WIDTH, height: HEIGHT, initScript });
const evaluate = (expression, timeout = 30000) => page.evaluate(expression, timeout);
const report = { tag: TAG, pageErrors: browser.pageErrors, checks: [] };
const check = (name, pass, detail = {}) => {
  report.checks.push({ name, pass: !!pass, ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail.value === undefined ? '' : ` (${detail.value})`}`);
};
const GLASS_READY = 'window.__gummy.glass().count > 0 && window.__gummy.glass().actors.every(a => a.ready)';
const glassState = () => evaluate(`(() => {
  const g = window.__gummy;
  if (!g) return { booted: false };
  const glass = g.glass();
  return { booted: !!g.booted, count: glass.count,
    actors: glass.actors.map(a => ({ uid: a.uid, ready: !!a.ready, error: a.error || null })) };
})()`, 10000).catch(error => ({ error: String(error && error.message || error) }));

try {
  await page.waitFor('!!window.__gummy?.booted', 90000);
  console.log('STEP glass ready');
  try {
    await page.waitFor(GLASS_READY, 150000);
  } catch (error) {
    console.log('STEP glass reload', JSON.stringify(await glassState()));
    await page.evaluate('location.reload()').catch(() => {});
    await page.waitFor('!!window.__gummy?.booted', 120000);
    try {
      await page.waitFor(GLASS_READY, 150000);
    } catch (retryError) {
      console.log('STEP glass failed', JSON.stringify(await glassState()));
      throw retryError;
    }
  }
  console.log('STEP glass done');

  const setup = await evaluate(`(() => {
    const g = window.__gummy;
    const box = document.getElementById('settingsGifting');
    if (box) {
      box.checked = true;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    }
    g.setBehaviorFeature('gifting', true);
    g.setCeiling(64);
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { found: false, reason: 'no source' };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    if (!giver || !receiver) return { found: false, reason: 'spawn failed' };
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setBond(giverIndex, receiverIndex, .1);
    g.setHunger(receiverIndex, .6);
    return {
      found: true,
      sourceId: source.id,
      giverUid: giver.uid,
      receiverUid: receiver.uid,
      giverIndex,
      receiverIndex,
      feature: g.behaviorConfig()?.features?.gifting,
    };
  })()`);
  check('gifting settings and feature are on', setup.found && setup.feature === true,
    { value: JSON.stringify(setup) });
  await evaluate("document.getElementById('settingsBtn').click()");
  await new Promise(resolve => setTimeout(resolve, 500));
  await page.screenshot(`${ROOT}/.dev-shots/gifting_settings.png`);
  await evaluate("document.getElementById('settingsClose').click()");
  await new Promise(resolve => setTimeout(resolve, 350));

  const started = await evaluate(`(() => {
    const g = window.__gummy;
    g.sim(.1, 0);
    const result = g.giftByUid(${setup.giverUid}, ${setup.receiverUid});
    if (result.ok) g.selectBear(${setup.giverIndex});
    return result;
  })()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot(`${ROOT}/.dev-shots/gifting_offer.png`);
  const accepted = await evaluate(`(() => {
    const g = window.__gummy;
    g.sim(5, 0);
    const giver = g.traits().find(a => a.uid === ${setup.giverUid});
    const receiver = g.traits().find(a => a.uid === ${setup.receiverUid});
    const sourceId = ${JSON.stringify(started.sourceId)};
    const portionId = ${JSON.stringify(started.portionId)};
    const source = sourceId ? g.foodSources().find(s => s.id === sourceId) : null;
    return {
      sourceRipe: source ? source.ripe : null,
      portionGone: portionId
        ? !(g.portions()?.list || []).some(portion => portion.id === portionId)
        : null,
      receiverHunger: receiver?.hunger,
      bond: giver?.bonds?.[String(${setup.receiverUid})],
      giftHistory: giver?.history?.some(e => e.kind === 'gift'),
      received: receiver?.history?.some(e => e.kind === 'receivedGift'),
      state: giver?.ai,
    };
  })()`);
  check('an accepted gift consumes one source, feeds the receiver and records both sides',
    started.ok === true &&
    (started.sourceId ? accepted.sourceRipe === false : accepted.portionGone === true) &&
    accepted.receiverHunger < .6 && accepted.bond > .1 &&
    accepted.giftHistory === true && accepted.received === true,
    { value: JSON.stringify({ started, accepted }) });

  const carrying = await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { found: false };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + 6, source.approachZ, 0, 0);
    const list = g.traits();
    const gi = list.findIndex(a => a.uid === giver.uid);
    const ri = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(gi, .2);
    g.setHunger(ri, .6);
    g.sim(.1, 0);
    const result = g.giftByUid(giver.uid, receiver.uid);
    g.sim(.6, 0);
    g.selectBear(gi);
    return {
      found: true, result,
      carried: (g.carried() || []).filter(item => item.uid === giver.uid),
      giverUid: giver.uid,
      giver: { cx: +giver.cx.toFixed(2), cy: +giver.cy.toFixed(2), cz: +giver.cz.toFixed(2), scale: giver.scale },
    };
  })()`);
  await new Promise(resolve => setTimeout(resolve, 900));
  if (carrying.result?.ok) {
    await page.waitFor(`(window.__gummy.giftVisuals() || []).some(item => item.uid === ${carrying.giverUid})`, 60000);
  }
  await page.screenshot(`${ROOT}/.dev-shots/gifting_carried.png`);
  const carriedVisual = await evaluate(`(() => ({
    giverUid: ${carrying.giverUid},
    visuals: window.__gummy.giftVisuals(),
  }))()`);
  check('a carried gift is visible while the giver approaches',
    carrying.result?.ok === true && carrying.carried.length === 1 &&
    (carriedVisual.visuals || []).some(item => item.uid === carriedVisual.giverUid && item.visible),
    { value: JSON.stringify({ ...carrying, visuals: carriedVisual.visuals }) });
  await evaluate("window.__gummy.setBehaviorFeature('gifting', false)");
  await evaluate("window.__gummy.setBehaviorFeature('gifting', true)");

  const cap = await evaluate(`(() => {
    const g = window.__gummy;
    const result = g.giftByUid(${setup.giverUid}, ${setup.receiverUid});
    return { result, lastGiftDay: JSON.parse(g.exportSave()).worlds.field.bears
      .find(a => a.uid === ${setup.giverUid})?.lastGiftDay };
  })()`);
  check('the daily gift cap blocks a second gift', cap.result?.ok === false &&
    Number.isFinite(cap.lastGiftDay), { value: JSON.stringify(cap) });

  const persisted = await evaluate(`(async () => {
    const g = window.__gummy;
    await g.save('slot5', 'gift');
    await g.load('slot5');
    const payload = JSON.parse(g.exportSave());
    const actor = payload.worlds.field.bears.find(a => a.uid === ${setup.giverUid});
    return { version: actor?.actorVersion, lastGiftDay: actor?.lastGiftDay };
  })()`, 120000);
  check('the gift day persists in actorVersion 7', persisted.version === 7 &&
    Number.isFinite(persisted.lastGiftDay), { value: JSON.stringify(persisted) });

  const refused = await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { found: false };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setHunger(receiverIndex, .1);
    g.sim(.1, 0);
    const result = g.gift(giverIndex, receiverIndex);
    return { found: true, result, ripe: g.foodSources().find(s => s.id === source.id)?.ripe };
  })()`);
  check('a receiver who is not hungry refuses without consuming the source',
    refused.found && refused.result?.ok === false && refused.ripe === true,
    { value: JSON.stringify(refused) });

  await evaluate("window.__gummy.setBehaviorFeature('gifting', false)");
  const off = await evaluate(`(() => {
    const g = window.__gummy;
    return { result: g.giftByUid(${setup.giverUid}, ${setup.receiverUid}) };
  })()`);
  check('gifting off prevents a new offer', off.result?.ok === false,
    { value: JSON.stringify(off) });

  await evaluate("window.__gummy.setBehaviorFeature('gifting', true)");
  const startedSwitch = await evaluate(`(() => {
    const g = window.__gummy;
    const source = g.foodSources().find(s => s.ripe && !s.claimed);
    if (!source) return { ok: false, reason: 'no source' };
    const giver = g.spawnAt(source.approachX, source.approachZ, 0, 0);
    const receiver = g.spawnAt(source.approachX + .8, source.approachZ, 0, 0);
    const list = g.traits();
    const giverIndex = list.findIndex(a => a.uid === giver.uid);
    const receiverIndex = list.findIndex(a => a.uid === receiver.uid);
    g.setHunger(giverIndex, .2);
    g.setHunger(receiverIndex, .6);
    g.sim(.1, 0);
    const result = g.gift(giverIndex, receiverIndex);
    return { ...result, sourceId: source.id, giverUid: giver.uid, receiverUid: receiver.uid };
  })()`);
  await evaluate("window.__gummy.setMap('studio')");
  await page.waitFor("window.__gummy.map().id === 'studio'", 30000);
  await new Promise(resolve => setTimeout(resolve, 500));
  await evaluate("window.__gummy.setBehaviorFeature('gifting', false)");
  await evaluate("window.__gummy.setMap('field')");
  await page.waitFor("window.__gummy.map().id === 'field'", 30000);
  await new Promise(resolve => setTimeout(resolve, 500));
  const switched = await evaluate(`(() => {
    const g = window.__gummy;
    const uids = new Set([${startedSwitch.giverUid || 0}, ${startedSwitch.receiverUid || 0}]);
    const actors = g.traits().filter(a => uids.has(a.uid));
    return {
      activeGift: actors.some(a => a.ai === 'seekGift' || a.ai === 'gift'),
      carried: actors.some(a => (g.carried() || []).some(item => item.uid === a.uid)),
      claimed: g.foodSources().some(s => s.claimedBy && uids.has(s.claimedBy)) ||
        (g.portions()?.list || []).some(p => p.claimedBy && uids.has(p.claimedBy)),
    };
  })()`);
  await evaluate("window.__gummy.setBehaviorFeature('gifting', true)");
  check('a map switch abandons an active offer and releases food claims',
    startedSwitch.ok === true && switched.activeGift === false &&
    switched.carried === false && switched.claimed === false,
    { value: JSON.stringify({ startedSwitch, switched }) });

  const mobile = await browser.openPage({ url: TARGET.href, width: 390, height: 844, initScript });
  await mobile.waitFor('!!window.__gummy?.booted', 60000);
  await mobile.evaluate("document.getElementById('settingsBtn').click()");
  await new Promise(resolve => setTimeout(resolve, 500));
  const mobileRow = await mobile.evaluate(`(() => {
    const card = document.querySelector('.settingscard');
    document.getElementById('settingsGifting').scrollIntoView({ block: 'center' });
    return {
      visible: !!document.getElementById('settingsGifting'),
      checked: document.getElementById('settingsGifting')?.checked,
      scrolled: card.scrollTop > 0,
    };
  })()`);
  check('the gifting setting is present at mobile width', mobileRow.visible === true &&
    mobileRow.scrolled === true, { value: JSON.stringify(mobileRow) });
  await mobile.screenshot(`${ROOT}/.dev-shots/gifting_settings_mobile.png`);

  report.setup = setup;
  report.started = started;
  report.accepted = accepted;
  report.cap = cap;
  report.persisted = persisted;
  report.refused = refused;
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
if (report.checks.some(entry => !entry.pass)) process.exitCode = 1;
