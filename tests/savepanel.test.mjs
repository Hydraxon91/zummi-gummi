import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaveSlotRows,
  buildMenuSaveRows,
  createSaveSlotsPanel,
  createMenuSaveList,
} from '../src/savepanel.js';

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
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.focused = false;
    this._text = '';
    this.classList = new FakeClassList(this);
  }
  get textContent() { return this._text; }
  set textContent(value) {
    this._text = String(value);
    for (const child of this.children) child.parentNode = null;
    this.children = [];
  }
  append(...nodes) {
    for (const node of nodes) {
      if (!node) continue;
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  removeChild(node) {
    const index = this.children.indexOf(node);
    if (index >= 0) this.children.splice(index, 1);
    if (node.parentNode === this) node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
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
  dispatch(type, event = {}) {
    const detail = { target: this, ...event };
    for (const fn of [...(this.listeners.get(type) || [])]) fn(detail);
    return detail;
  }
  focus() { this.focused = true; }
}

const fakeDocument = {
  createElement(tagName) { return new FakeElement(tagName); },
};

function createButtonFactory() {
  const created = [];
  const makeButton = (label, action, primary = false) => {
    const button = new FakeElement('button');
    button.textContent = label;
    button.className = 'saveBtn' + (primary ? ' primary' : '');
    button.addEventListener('click', action);
    created.push(button);
    return button;
  };
  makeButton.created = created;
  return makeButton;
}

function buttonsIn(element) {
  const found = [];
  for (const child of element.children) {
    if (child.tagName === 'button') found.push(child);
    found.push(...buttonsIn(child));
  }
  return found;
}

function visibleButtonLabels(element) {
  return buttonsIn(element).filter(button => !button.hidden).map(button => button.textContent);
}

const LABELS = { slot1: 'Slot 1', slot2: 'Slot 2', slot3: 'Slot 3', slot4: 'Slot 4', slot5: 'Slot 5', autosave: 'Autosave' };
const metaText = rec => `${rec.name} · ${rec.bears} bears`;

test('save slot descriptors keep fixed order and current fallbacks', () => {
  const records = [
    { id: 'slot3', name: 'Third', bears: 4 },
    { id: 'autosave', name: 'Auto', bears: 9 },
    { id: 'slot1', name: 'First', bears: 2 },
  ];
  const rows = buildSaveSlotRows(records, { labels: LABELS, autosaveId: 'autosave', metaText });
  assert.deepEqual(rows.map(row => row.id), ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'autosave']);
  assert.deepEqual(rows.map(row => row.key), ['slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'autosave']);
  assert.equal(rows[0].name, 'First');
  assert.equal(rows[0].detail, 'First · 2 bears');
  assert.equal(rows[1].name, 'Slot 2');
  assert.equal(rows[1].detail, 'Empty');
  assert.equal(rows[5].name, 'Auto');
  assert.equal(rows[5].detail, 'Auto · 9 bears');
  assert.deepEqual(rows[0], {
    id: 'slot1',
    key: 'slot1',
    name: 'First',
    detail: 'First · 2 bears',
    empty: false,
    canSave: true,
    canLoad: true,
    canDelete: true,
    canRename: true,
  });
  assert.deepEqual(rows[1], {
    id: 'slot2',
    key: 'slot2',
    name: 'Slot 2',
    detail: 'Empty',
    empty: true,
    canSave: true,
    canLoad: false,
    canDelete: false,
    canRename: false,
  });
  assert.equal(rows[5].canSave, false);
  assert.equal(rows[5].canLoad, true);
  assert.equal(rows[5].canDelete, true);
  assert.equal(rows[5].canRename, false);
});

test('save slot descriptors tolerate missing records and labels', () => {
  const rows = buildSaveSlotRows(null, { labels: { slot1: 'One' }, autosaveId: 'auto', metaText: () => 'never' });
  assert.equal(rows.length, 6);
  assert.equal(rows[0].name, 'One');
  assert.equal(rows[1].name, undefined);
  assert.equal(rows[1].detail, 'Empty');
  assert.equal(rows[5].id, 'auto');
});

test('menu descriptors preserve record order and formatting', () => {
  const records = [
    { id: 'b', name: 'Bee', bears: 7 },
    { id: 'a', name: 'Ay', bears: 1 },
  ];
  const rows = buildMenuSaveRows(records, { metaText });
  assert.deepEqual(rows, [
    { id: 'b', key: 'b', name: 'Bee', detail: 'Bee · 7 bears' },
    { id: 'a', key: 'a', name: 'Ay', detail: 'Ay · 1 bears' },
  ]);
  assert.deepEqual(buildMenuSaveRows(null), []);
});

test('save slots panel creates keyed rows and reuses rows/buttons across renders', () => {
  const list = new FakeElement('div');
  const makeButton = createButtonFactory();
  const panel = createSaveSlotsPanel({
    list,
    labels: LABELS,
    autosaveId: 'autosave',
    metaText,
    actions: {},
    makeButton,
    confirm: () => true,
    documentRef: fakeDocument,
  });

  panel.render([]);
  assert.equal(list.children.length, 6);
  const firstRow = list.children[0];
  const firstSave = buttonsIn(firstRow)[0];
  assert.deepEqual(visibleButtonLabels(firstRow), ['Save']);
  assert.deepEqual(visibleButtonLabels(list.children[5]), []);
  assert.equal(makeButton.created.length, 5);
  assert.equal(list.listenerCount('click'), 0);

  panel.render([]);
  assert.equal(list.children.length, 6);
  assert.equal(list.children[0], firstRow);
  assert.equal(buttonsIn(firstRow)[0], firstSave);
  assert.equal(makeButton.created.length, 5);
  assert.equal(firstSave.listenerCount('click'), 1);

  firstSave.focus();
  panel.render([{ id: 'slot1', name: 'Fresh', bears: 5 }]);
  assert.equal(list.children[0], firstRow);
  assert.equal(buttonsIn(firstRow)[0], firstSave);
  assert.equal(firstSave.focused, true);
  assert.deepEqual(visibleButtonLabels(firstRow), ['Save', 'Load', 'Delete', 'Rename']);
  assert.equal(firstRow.children[0].children[0].textContent, 'Fresh');
  panel.destroy();
});

test('save slot actions keep current record association and confirm gating', async () => {
  const list = new FakeElement('div');
  const makeButton = createButtonFactory();
  const calls = [];
  const confirmations = [];
  let allow = false;
  const actions = {
    save: (id, rec) => calls.push(['save', id, rec && rec.name]),
    load: (id, rec) => calls.push(['load', id, rec && rec.name]),
    delete: (id, rec) => calls.push(['delete', id, rec && rec.name]),
    rename: (id, rec) => calls.push(['rename', id, rec && rec.name]),
  };
  const panel = createSaveSlotsPanel({
    list,
    labels: LABELS,
    autosaveId: 'autosave',
    metaText,
    actions,
    makeButton,
    confirm: message => { confirmations.push(message); return allow; },
    documentRef: fakeDocument,
  });

  panel.render([{ id: 'slot1', name: 'Old', bears: 1 }]);
  const row = list.children[0];
  const [save, load, del, rename] = buttonsIn(row);
  assert.deepEqual(visibleButtonLabels(row), ['Save', 'Load', 'Delete', 'Rename']);
  assert.equal(load.textContent, 'Load');
  assert.equal(del.textContent, 'Delete');

  load.dispatch('click');
  del.dispatch('click');
  assert.equal(calls.length, 0);
  assert.deepEqual(confirmations, [
    'Load this save? Current progress will be replaced.',
    'Delete this save?',
  ]);
  assert.equal(confirmations.length, 2);

  // Stable closures read the current record after a refresh.
  panel.render([{ id: 'slot1', name: 'New', bears: 2 }]);
  save.dispatch('click');
  assert.deepEqual(calls[0], ['save', 'slot1', 'New']);

  panel.confirm = undefined;
  const confirmationsBefore = confirmations.length;
  allow = true;
  load.dispatch('click');
  assert.equal(confirmations.length, confirmationsBefore + 1);
  assert.deepEqual(calls[1], ['load', 'slot1', 'New']);
  rename.dispatch('click');
  assert.deepEqual(calls[2], ['rename', 'slot1', 'New']);

  // An empty slot only exposes Save; the autosave row has no Save/Rename.
  panel.render([]);
  assert.deepEqual(visibleButtonLabels(row), ['Save']);
  save.dispatch('click');
  assert.deepEqual(calls[3], ['save', 'slot1', null]);
  const autoRow = list.children[5];
  assert.deepEqual(visibleButtonLabels(autoRow), []);
  assert.equal(buttonsIn(autoRow).some(button => button.textContent === 'Save'), false);
  assert.equal(buttonsIn(autoRow).some(button => button.textContent === 'Rename'), false);

  panel.render([{ id: 'autosave', name: 'Auto', bears: 3 }]);
  assert.deepEqual(visibleButtonLabels(autoRow), ['Load', 'Delete']);
  assert.equal(buttonsIn(autoRow).some(button => button.textContent === 'Save'), false);
  assert.equal(buttonsIn(autoRow).some(button => button.textContent === 'Rename'), false);
});

test('save slots destroy removes its rows and makes later renders inert', () => {
  const list = new FakeElement('div');
  const makeButton = createButtonFactory();
  const calls = [];
  const panel = createSaveSlotsPanel({
    list,
    labels: LABELS,
    autosaveId: 'autosave',
    metaText,
    actions: { save: id => calls.push(id) },
    makeButton,
    confirm: () => true,
    documentRef: fakeDocument,
  });
  panel.render([{ id: 'slot1', name: 'One', bears: 1 }]);
  const save = buttonsIn(list.children[0])[0];
  panel.destroy();
  assert.equal(list.children.length, 0);
  save.dispatch('click');
  assert.equal(calls.length, 0);
  panel.render([{ id: 'slot2', name: 'Two', bears: 2 }]);
  assert.equal(list.children.length, 0);
  panel.destroy();
});

test('menu save list preserves order, reuses rows, updates records and removes absent rows', () => {
  const list = new FakeElement('div');
  const makeButton = createButtonFactory();
  const loads = [];
  const panel = createMenuSaveList({
    list,
    actions: { load: (id, rec) => loads.push([id, rec && rec.name]) },
    makeButton,
    metaText,
    documentRef: fakeDocument,
  });

  panel.render([]);
  assert.equal(list.children.length, 1);
  const empty = list.children[0];
  assert.equal(empty.className, 'menuEmpty');
  assert.match(empty.textContent, /No saves yet/);
  panel.render([]);
  assert.equal(list.children.length, 1);
  assert.equal(list.children[0], empty);

  panel.render([
    { id: 'b', name: 'Bee', bears: 7 },
    { id: 'a', name: 'Ay', bears: 1 },
  ]);
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].children[0].children[0].textContent, 'Bee');
  assert.equal(list.children[1].children[0].children[0].textContent, 'Ay');
  const rowB = list.children[0];
  const loadB = buttonsIn(rowB)[0];
  assert.equal(loadB.textContent, 'Load');
  assert.equal(loadB.className, 'saveBtn primary');
  assert.equal(makeButton.created.length, 2);

  panel.render([
    { id: 'a', name: 'Ay 2', bears: 2 },
    { id: 'b', name: 'Bee 2', bears: 8 },
  ]);
  assert.equal(list.children.length, 2);
  assert.equal(list.children[1], rowB);
  assert.equal(makeButton.created.length, 2);
  assert.deepEqual(list.children.map(row => row.children[0].children[0].textContent), ['Ay 2', 'Bee 2']);
  loadB.dispatch('click');
  assert.deepEqual(loads[0], ['b', 'Bee 2']);

  panel.render([{ id: 'a', name: 'Ay 3', bears: 3 }]);
  assert.equal(list.children.length, 1);
  assert.equal(buttonsIn(list.children[0])[0].textContent, 'Load');
  assert.equal(makeButton.created.length, 2);

  panel.destroy();
  assert.equal(list.children.length, 0);
  loadB.dispatch('click');
  assert.equal(loads.length, 1);
  panel.render([{ id: 'z', name: 'Zed', bears: 1 }]);
  assert.equal(list.children.length, 0);
});
