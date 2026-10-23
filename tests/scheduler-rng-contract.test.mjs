import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = readFileSync(fileURLToPath(new URL('../src/app.js', import.meta.url)), 'utf8');
const FIELD = readFileSync(fileURLToPath(new URL('../src/field.js', import.meta.url)), 'utf8');

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `${label}: ${startMarker} not found`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `${label}: ${endMarker} not found`);
  return source.slice(start, end);
}

function order(source, markers, label) {
  let last = -1;
  for (const marker of markers) {
    const at = source.indexOf(marker);
    assert.ok(at >= 0, `${label}: ${marker} not found`);
    assert.ok(at > last, `${label}: ${marker} is out of order`);
    last = at;
  }
}

test('animate preserves pause gates, frame work, field work and fixed physics order', () => {
  const animate = section(APP, 'function animate(now){', 'function simulateSeconds(', 'animate');
  order(animate, [
    'if (document.hidden) return;',
    'if (paused) return;',
    'frameTick(dt);',
    'if (isMeadow() && field){',
    'field.update(dt, bears);',
    'while (acc >= FIXED_DT && steps < MAX_STEPS){ physicsStep(FIXED_DT);',
  ], 'animate');

  const lastNowAt = animate.indexOf('lastNow = now;');
  const pausedAt = animate.indexOf('if (paused) return;');
  assert.ok(lastNowAt >= 0, 'animate: lastNow update not found');
  assert.ok(pausedAt >= 0, 'animate: paused return not found');
  assert.ok(
    lastNowAt < pausedAt,
    'animate: lastNow must update before the pause return so resume does not catch up',
  );
});

test('frameTick and stepMeadowAI preserve Bear before Glass and food before locomotion', () => {
  const frameTick = section(APP, 'function frameTick(dt){', '/* --------------------------- surface scheduling', 'frameTick');
  order(frameTick, ['stepMeadowAI(dt);', 'stepGummyBehavior(dt);', 'updatePossessionLocomotion(dt);'], 'frameTick');

  const meadow = section(APP, 'function stepMeadowAI(dt) {', 'function frameTick(dt){', 'stepMeadowAI');
  order(meadow, [
    'if (!isMeadow() || !field || frozen) return;',
    'if (field.food) field.food.update(dt);',
    'ai.update(dt);',
    'stepLife(dt);',
    'if (glassColony) glassColony.update(dt);',
    'updateAiLocomotion(dt);',
  ], 'stepMeadowAI');
});

test('field update advances the sky before the remaining field systems', () => {
  const fieldUpdate = section(FIELD, 'function update(dt, activeBears) {', '    if (activeBears) {', 'field.update');
  order(fieldUpdate, ['if (sky) sky.update(dt);', 'wind.update(dt);', 'horizon.update(dt, wind);'], 'field.update');
});

test('simulateSeconds skips host field work and advances frameTick on the fourth substep', () => {
  const sim = section(APP, 'function simulateSeconds(sec, rebuildEverySubsteps){', 'window.__gummy = {', 'simulateSeconds');
  assert.ok(!sim.includes('field.update('), 'simulateSeconds must not call field.update');
  assert.ok(!sim.includes('updateSurfaces('), 'simulateSeconds must not call updateSurfaces');
  assert.ok(!sim.includes('renderer.render('), 'simulateSeconds must not render');
  order(sim, [
    'physicsStep(FIXED_DT);',
    'if (s % 4 === 3) frameTick(FIXED_DT*4);',
  ], 'simulateSeconds');
});

test('the behavior host resolves the global RNG at call time', () => {
  const host = section(APP, 'behavior = createBehavior({', 'departures = createDepartureHook({', 'behavior host');
  assert.ok(
    host.includes('rng: () => Math.random(),'),
    'behavior host must keep the dynamic global-RNG callback',
  );
});
