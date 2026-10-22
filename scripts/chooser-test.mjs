// Optional activity chooser: real Meadow selection, explanations and isolation.
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
  const natural = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    let elapsed = 0, decision = null;
    while (elapsed < 240 && !(decision && decision.started)) {
      if (Math.round(elapsed * 4) % 40 === 0) {
        for (let i = 0; i < 2; i++) {
          for (const [key, value] of Object.entries({ hunger: .1, thirst: .1, energy: 1, social: .7, affection: 0 })) {
            g.glassSetNeed(i, key, value);
          }
        }
      }
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    return { elapsed, decision, state: g.glass().actors.find(a => a.uid === uid)?.state };
  })()`, 120000);
  report.natural = natural;
  const started = natural.decision && natural.decision.started;
  check('a real simulation decision starts a ranked candidate', !!started);
  check('the explanation reports every candidate reason and score',
    natural.decision.candidates.length === 2 &&
    natural.decision.candidates.every(c => c.reason && Number.isFinite(c.score)) &&
    natural.decision.chosen === natural.decision.ranked[0]);
  check('stargazing outranks moderate social pressure and is attempted first',
    natural.decision.ranked[0] === 'stargaze.seek' ||
    natural.decision.refused.includes('stargaze.seek'));
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
    while (elapsed < 240 && !(decision && decision.ranked[0] === 'social.company')) {
      for (let i = 0; i < 2; i++) {
        for (const [key, value] of Object.entries({ hunger: .1, thirst: .1, energy: 1, social: .95, affection: 0 })) {
          g.glassSetNeed(i, key, value);
        }
      }
      g.sim(.25, 0);
      elapsed += .25;
      decision = g.activityDecision(uid);
    }
    return { elapsed, decision, state: g.glass().actors.find(a => a.uid === uid)?.state };
  })()`, 120000);
  report.socialWin = socialWin;
  check('strong social pressure outranks a disliked stargazing attempt',
    socialWin.decision.ranked[0] === 'social.company' && socialWin.decision.chosen === 'social.company');
  const disabled = await page.evaluate(`(() => {
    const g = window.__gummy, uid = window.__chooserUid;
    g.setBehaviorFeature('activityChooser', false);
    const cleared = g.activityDecision(uid);
    const features = g.behaviorConfig().features;
    g.sim(2, 0);
    return { cleared, features, after: g.activityDecision(uid) };
  })()`);
  report.disabled = disabled;
  check('disabling clears the explanation and stops new chooser work',
    disabled.cleared === null && disabled.features.activityChooser === false && disabled.after === null);
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
