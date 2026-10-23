import test from 'node:test';
import assert from 'node:assert/strict';
import { createPanelView, escapeTarget } from '../src/panelcontroller.js';

class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }
  contains(name) { return this.values().has(name); }
  toggle(name, force) {
    const values = this.values();
    const on = force === undefined ? !values.has(name) : !!force;
    if (on) values.add(name); else values.delete(name);
    this.element.className = [...values].join(' ');
    return on;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.className = '';
    this.listeners = new Map();
    this.attributes = new Map();
    this.classList = new FakeClassList(this);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const list = this.listeners.get(type) || [];
    const index = list.indexOf(fn);
    if (index >= 0) list.splice(index, 1);
  }
  listenerCount(type) { return (this.listeners.get(type) || []).length; }
  dispatch(type, event = {}) { for (const fn of [...(this.listeners.get(type) || [])]) fn({ target: this, ...event }); }
}

function panels() {
  return {
    menu: new FakeElement('div'),
    pause: new FakeElement('div'),
    slots: new FakeElement('div'),
    help: new FakeElement('div'),
    settings: new FakeElement('div'),
    body: new FakeElement('body'),
  };
}

function assertOpen(element, open) {
  assert.equal(element.classList.contains('open'), open);
  assert.equal(element.getAttribute('aria-hidden'), String(!open));
}

test('escapeTarget keeps the current Escape priority', () => {
  assert.equal(escapeTarget({}), null);
  assert.equal(escapeTarget({ menu: true, paused: false, slots: false, help: false, settings: false }), null);
  assert.equal(escapeTarget({ slots: true, help: true, settings: true, paused: true }), 'slots');
  assert.equal(escapeTarget({ slots: false, help: true, settings: false, paused: true }), 'modal');
  assert.equal(escapeTarget({ slots: false, help: false, settings: true, paused: true }), 'modal');
  assert.equal(escapeTarget({ slots: false, help: false, settings: false, paused: true }), 'pause');
});

test('panel view renders classes, aria state and body flags', () => {
  const el = panels();
  const view = createPanelView({ documentRef: { body: el.body }, ...el });

  view.render({ menu: true, paused: false, slots: false, help: false, settings: false });
  assertOpen(el.menu, true);
  assertOpen(el.pause, false);
  assertOpen(el.slots, false);
  assertOpen(el.help, false);
  assertOpen(el.settings, false);
  assert.equal(el.body.classList.contains('menu-open'), true);
  assert.equal(el.body.classList.contains('modal-open'), false);

  view.render({ menu: false, paused: true, slots: true, help: false, settings: false });
  assertOpen(el.menu, false);
  assertOpen(el.pause, true);
  assertOpen(el.slots, true);
  assert.equal(el.body.classList.contains('menu-open'), true);
  assert.equal(el.body.classList.contains('modal-open'), false);

  view.render({ menu: false, paused: false, slots: false, help: true, settings: false });
  assertOpen(el.help, true);
  assert.equal(el.body.classList.contains('menu-open'), false);
  assert.equal(el.body.classList.contains('modal-open'), true);

  view.render({ menu: false, paused: false, slots: false, help: false, settings: true });
  assertOpen(el.help, false);
  assertOpen(el.settings, true);
  assert.equal(el.body.classList.contains('modal-open'), true);

  view.render({ menu: false, paused: false, slots: false, help: false, settings: false });
  assertOpen(el.settings, false);
  assert.equal(el.body.classList.contains('menu-open'), false);
  assert.equal(el.body.classList.contains('modal-open'), false);
});

test('panel view renders supplied state without enforcing help/settings exclusion itself', () => {
  const el = panels();
  const view = createPanelView({ documentRef: { body: el.body }, ...el });
  view.render({ menu: false, paused: false, slots: false, help: true, settings: true });
  assertOpen(el.help, true);
  assertOpen(el.settings, true);
  assert.equal(el.body.classList.contains('modal-open'), true);
  view.render({ menu: false, paused: false, slots: false, help: false, settings: false });
  assertOpen(el.help, false);
  assertOpen(el.settings, false);
});

test('backdrop listeners are attached once, report their panel and are removed on destroy', () => {
  const el = panels();
  const closed = [];
  const view = createPanelView({
    documentRef: { body: el.body },
    ...el,
    onBackdrop: kind => closed.push(kind),
  });

  assert.equal(el.help.listenerCount('pointerdown'), 1);
  assert.equal(el.settings.listenerCount('pointerdown'), 1);
  el.help.dispatch('pointerdown');
  assert.deepEqual(closed, ['help']);
  el.settings.dispatch('pointerdown');
  assert.deepEqual(closed, ['help', 'settings']);
  el.help.dispatch('pointerdown', { target: new FakeElement('div') });
  assert.deepEqual(closed, ['help', 'settings']);

  view.destroy();
  assert.equal(el.help.listenerCount('pointerdown'), 0);
  assert.equal(el.settings.listenerCount('pointerdown'), 0);
  el.help.dispatch('pointerdown');
  el.settings.dispatch('pointerdown');
  assert.deepEqual(closed, ['help', 'settings']);
});
