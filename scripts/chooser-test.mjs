// Optional activity chooser: real Meadow selection, lifecycle and isolation.
// Start launch.py first. No forced activity state or completion hook is used.
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
    window.__chooserBaseline = g.exportSave();
    const uid = g.glass().actors[0].uid;
    const off = g.behaviorConfig().features;
    g.setBehaviorFeature('activityChooser', true);
    g.setBehaviorFeature('preferences', true);
    g.setBehaviorFeature('habits', true);
    g.setBehaviorModule('mate', false);
    g.activityPreference(uid, 'stargaze', 1);
    g.setTime(20);
    g.seed(4242);
    for (let i = 0; i < 2; i++) {
      g.glassReset(i);
      g.glassSetNeed(i, 'hunger', .1);
      g.glassSetNeed(i, 'thirst', .1);
      g.glassSetNeed(i, 'energy', 1);
      g.glassSetNeed(i, 'social', .7);
      g.glassSetNeed(i, 'affection', 0);
    }
    window.__chooserUid = uid;
    return { uid, off, on: g.behaviorConfig().features.activityChooser };
  })()`);
  report.setup = setup;
  check('activity chooser is off by default and only enabled explicitly',
    setup.off.activityChooser === false && setup.on === true);
  check('no explanation exists before the chooser is consulted',
    (await page.evaluate('window.__gummy.activityDecision(window.__chooserUid)')) === null);
  const proposals = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    const list = g.activityProposals(uid);
    return list.map(c => ({ id: c.id, eligible: c.eligible, reason: c.reason,
      score: c.score, contributions: c.contributions }));
  })()`);
  report.proposals = proposals;
  const social = proposals.find(p => p.id === 'social.company');
  const stars = proposals.find(p => p.id === 'stargaze.seek');
  check('both optional activities are eligible for direct comparison',
    proposals.length === 2 && social.eligible && stars.eligible);
  check('scores are the approved normalized pressure and chance share',
    Math.abs(social.score - (.7 - .64) / .36) < 1e-3 && Math.abs(stars.score - .56) < 1e-3);
  // Wait for an actual stargazing start (not merely any started candidate), then
  // let that session finish so completion effects can be counted exactly once.
  const natural = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    const needs = { hunger: .1, thirst: .1, energy: 1, social: .7, affection: 0 };
    const hold = () => {
      for (let i = 0; i < 2; i++) {
        for (const [key, value] of Object.entries(needs)) g.glassSetNeed(i, key, value);
      }
    };
    let elapsed = 0, decision = null;
    while (elapsed < 240 && !(decision && decision.started === 'stargaze.seek')) {
      if (Math.round(elapsed * 4) % 20 === 0) hold();
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    const startedState = g.glass().actors.find(a => a.uid === uid)?.state;
    const before = g.dispositions(uid).habits.stargaze || 0;
    if (decision && decision.started === 'stargaze.seek') {
      while (elapsed < 300 && (g.dispositions(uid).habits.stargaze || 0) <= before) {
        if (Math.round(elapsed * 4) % 20 === 0) hold();
        g.sim(.25, 0);
        elapsed += .25;
      }
    }
    return { elapsed, decision, startedState, before,
      habitAfter: g.dispositions(uid).habits.stargaze || 0 };
  })()`, 180000);
  report.natural = natural;
  check('a real simulation decision starts the ranked stargazing candidate',
    natural.decision?.started === 'stargaze.seek' && natural.startedState === 'stargaze');
  check('the explanation reports every candidate reason and score',
    natural.decision.candidates.length === 2 &&
    natural.decision.candidates.every(c => c.reason && Number.isFinite(c.score)) &&
    natural.decision.chosen === natural.decision.ranked[0]);
  check('stargazing outranks moderate social pressure and is attempted first',
    natural.decision.ranked[0] === 'stargaze.seek');
  check('the chooser-started session completes and reinforces the habit once',
    Math.abs(natural.habitAfter - natural.before - .1) < 1e-3);
  const save = await page.evaluate(`(() => {
    const g = window.__gummy;
    const record = JSON.parse(g.exportSave()).worlds.field.glass.find(a => a.uid === window.__chooserUid);
    return { record, decision: g.activityDecision(window.__chooserUid) };
  })()`);
  report.save = save;
  check('the decision snapshot is runtime-only and never saved',
    !('activityDecision' in save.record) && !('activityChoices' in save.record));
  const socialWin = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    g.activityPreference(uid, 'stargaze', 0);
    let elapsed = 0, decision = null;
    while (elapsed < 240 && !(decision && decision.started === 'social.company')) {
      for (let i = 0; i < 2; i++) {
        for (const [key, value] of Object.entries({ hunger: .1, thirst: .1, energy: 1, social: .95, affection: 0 })) {
          g.glassSetNeed(i, key, value);
        }
        g.glassSetCooldown(i, 0);
      }
      g.glassSetPosition(0, 8.5, 7.0, true);
      g.glassSetPosition(1, 9.5, 8.6, true);
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    return { elapsed, decision, state: g.glass().actors.find(a => a.uid === uid)?.state };
  })()`, 180000);
  report.socialWin = socialWin;
  check('strong social pressure outranks a disliked stargazing attempt',
    socialWin.decision?.started === 'social.company' &&
    socialWin.decision.ranked[0] === 'social.company' &&
    ['seekCompany', 'invite', 'social'].includes(socialWin.state));
  // Disable and re-enable while a chooser-started session is running.
  const lifecycle = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    g.activityPreference(uid, 'stargaze', 1);
    const needs = { hunger: .1, thirst: .1, energy: 1, social: .7, affection: 0 };
    const hold = () => {
      for (let i = 0; i < 2; i++) {
        for (const [key, value] of Object.entries(needs)) g.glassSetNeed(i, key, value);
      }
    };
    let elapsed = 0, decision = null;
    while (elapsed < 240 && !(decision && decision.started === 'stargaze.seek')) {
      if (Math.round(elapsed * 4) % 20 === 0) hold();
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    const state = () => g.glass().actors.find(a => a.uid === uid)?.state;
    const active = state();
    g.setBehaviorFeature('activityChooser', false);
    const cleared = g.activityDecision(uid);
    g.sim(1, 0);
    const during = state();
    while (elapsed < 360 && state() === 'stargaze') {
      g.sim(.25, 0);
      elapsed += .25;
    }
    const after = state();
    g.setBehaviorFeature('activityChooser', true);
    let resumedAt = null;
    while (elapsed < 420 && !resumedAt) {
      hold();
      g.sim(.25, 0);
      elapsed += .25;
      const next = g.activityDecision(uid);
      if (next) resumedAt = next.started || next.outcome;
    }
    return { active, cleared, during, after, resumedAt, features: g.behaviorConfig().features };
  })()`, 180000);
  report.lifecycle = lifecycle;
  check('disabling leaves the running session untouched and clears the explanation',
    lifecycle.active === 'stargaze' && lifecycle.during === 'stargaze' && lifecycle.cleared === null);
  check('re-enabling resumes ranked selection without a stale decision',
    lifecycle.features.activityChooser === true && !!lifecycle.resumedAt);
  await page.evaluate(`window.__gummy.save('slot1', 'Chooser lifecycle')`);
  await page.evaluate(`window.__gummy.load('slot1')`);
  await page.waitFor('window.__gummy.map().id === "field" && window.__gummy.glass().actors.every(a => a.ready) && !document.getElementById("mapWipe").classList.contains("on")', 150000);
  const loaded = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    const cleared = g.activityDecision(uid);
    const feature = g.behaviorConfig().features.activityChooser;
    g.sim(2, 0);
    return { cleared, feature, decision: g.activityDecision(uid) };
  })()`);
  report.loaded = loaded;
  check('a real save/load clears the runtime decision and keeps the chooser working',
    loaded.cleared === null && loaded.feature === true && !!loaded.decision);
  await page.evaluate('window.__gummy.setMap("studio")');
  await page.waitFor('window.__gummy.map().id === "studio" && !document.getElementById("mapWipe").classList.contains("on")', 120000);
  const isolation = await page.evaluate(`(() => {
    const g = window.__gummy;
    g.sim(2, 0);
    return { decision: g.activityDecision(window.__chooserUid) };
  })()`);
  report.isolation = isolation;
  check('inactive-map actors carry no chooser decision', isolation.decision === null);
  await page.evaluate('window.__gummy.setMap("field")');
  await page.waitFor('window.__gummy.map().id === "field" && !document.getElementById("mapWipe").classList.contains("on") && window.__gummy.glass().actors.every(a => a.ready)', 150000);
  const returned = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    const cleared = g.activityDecision(uid);
    let elapsed = 0, decision = null;
    while (elapsed < 120 && !decision) {
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    return { cleared, decision };
  })()`);
  report.returned = returned;
  check('returning to the map starts fresh with no stale decision',
    returned.cleared === null && !!returned.decision);
  await page.evaluate('window.__gummy.importSave(window.__chooserBaseline)');
  await page.waitFor('window.__gummy.glass().actors.every(a => a.ready)', 150000);
  check('restoring another game leaves no decision state behind',
    (await page.evaluate('window.__gummy.activityDecision(window.__chooserUid)')) === null);
  check('no page errors', browser.pageErrors.length === 0);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  console.error(report.failure);
} finally {
  report.harness = page?.diagnostics();
  await writeFile(`${ROOT}/.dev-shots/chooser-test.json`, JSON.stringify(report, null, 2));
  if (browser) await browser.close();
}
