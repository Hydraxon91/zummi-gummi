import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRosterRows, rosterSignature } from '../src/rosterview.js';

function actor(uid, extra = {}) {
  return {
    uid,
    name: `actor-${uid}`,
    species: 'bear',
    sex: 'F',
    stage: 'adult',
    home: 'Bramble',
    health: 78,
    scale: 1.25,
    flavor: 2,
    parentUids: [1, 2],
    ...extra,
  };
}

function options(extra = {}) {
  return {
    isRosterActor: () => true,
    selectedUid: null,
    statusFor: () => 'resting',
    familyFor: () => 'Gen 2',
    colorFor: () => '#d51f3c',
    ...extra,
  };
}

test('buildRosterRows filters through the injected roster predicate in input order', () => {
  const first = actor(11);
  const second = actor(22);
  const third = actor(33);
  const asked = [];
  const rows = buildRosterRows([first, second, third], options({
    isRosterActor: value => {
      asked.push(value);
      return value.uid !== 22;
    },
  }));
  assert.deepEqual(asked, [first, second, third]);
  assert.deepEqual(rows.map(row => row.uid), [11, 33]);
  assert.deepEqual(rows.map(row => row.key), ['11', '33']);
});

test('display callbacks receive the original actors and copied rows retain no live references', () => {
  const source = actor(7, { name: 'Pip', parentUids: [4, 5] });
  const seen = [];
  const rows = buildRosterRows([source], options({
    statusFor: value => { seen.push(['status', value]); return 'counting stars'; },
    familyFor: value => { seen.push(['family', value]); return 'Gen 3'; },
    colorFor: value => { seen.push(['color', value]); return '#abcdef'; },
  }));

  assert.deepEqual(seen, [
    ['status', source],
    ['family', source],
    ['color', source],
  ]);
  assert.equal(rows[0].name, 'Pip');
  assert.equal(rows[0].sex, 'F');
  assert.equal(rows[0].stage, 'adult');
  assert.equal(rows[0].home, 'Bramble');
  assert.equal(rows[0].health, 78);
  assert.equal(rows[0].status, 'counting stars');
  assert.equal(rows[0].family, 'Gen 3');
  assert.equal(rows[0].color, '#abcdef');
  assert.equal(rows[0].selected, false);
  assert.deepEqual(rows[0].parentUids, [4, 5]);

  assert.notEqual(rows[0], source);
  assert.equal(Object.values(rows[0]).includes(source), false);
  assert.notEqual(rows[0].parentUids, source.parentUids);
  assert.deepEqual(source, actor(7, { name: 'Pip', parentUids: [4, 5] }));
});

test('selected state follows the selected UID, including numeric/string identity', () => {
  const rows = buildRosterRows([actor(7), actor(8)], options({ selectedUid: '7' }));
  assert.deepEqual(rows.map(row => row.selected), [true, false]);
  const none = buildRosterRows([actor(7)], options({ selectedUid: null }));
  assert.equal(none[0].selected, false);
});

test('duplicate and missing UIDs keep current caller behavior without dedupe or invention', () => {
  const duplicateA = actor(5, { name: 'First' });
  const duplicateB = actor(5, { name: 'Second' });
  const missing = actor(undefined, { name: 'Nameless' });
  const rows = buildRosterRows([duplicateA, duplicateB, missing], options());
  assert.deepEqual(rows.map(row => row.key), ['5', '5', 'undefined']);
  assert.deepEqual(rows.map(row => row.name), ['First', 'Second', 'Nameless']);
  assert.equal(rows[2].uid, undefined);
  assert.equal(new Set(rows.map(row => row.key)).size, 2);
});

test('rosterSignature preserves the exact protected fields and separators', () => {
  const rows = buildRosterRows([actor(9, {
    kind: 'softbody', species: 'bear', name: 'Mochi', sex: 'M', stage: 'baby',
    scale: 0.75, home: 'Clover', flavor: 4, parentUids: [3, 8],
  })], options());
  assert.equal(rosterSignature(rows), 'softbody:Mochi:M:baby:0.75:Clover:4:3,8');
});

test('each protected field changes the signature', () => {
  const base = buildRosterRows([actor(1)], options());
  const baseline = rosterSignature(base);
  const changes = [
    { kind: 'glass' },
    { species: 'glass' },
    { name: 'Different' },
    { sex: 'M' },
    { stage: 'baby' },
    { scale: 2 },
    { home: 'Elsewhere' },
    { flavor: 5 },
    { parentUids: [1, 2, 3] },
  ];
  for (const change of changes) {
    const rows = buildRosterRows([actor(1, change)], options());
    assert.notEqual(rosterSignature(rows), baseline, JSON.stringify(change));
  }
});

test('kind falls back to species and missing parent UIDs join as empty', () => {
  const speciesRows = buildRosterRows([
    actor(1, { kind: undefined, species: 'bear' }),
    actor(2, { kind: '', species: 'glass' }),
  ], options());
  assert.equal(rosterSignature(speciesRows).split('|')[0], 'bear:actor-1:F:adult:1.25:Bramble:2:1,2');
  assert.equal(rosterSignature(speciesRows).split('|')[1], 'glass:actor-2:F:adult:1.25:Bramble:2:1,2');

  const noParents = buildRosterRows([actor(1, { parentUids: undefined })], options());
  assert.match(rosterSignature(noParents), /:2:$/);
});

test('health, status, selected, family and color do not change the signature', () => {
  const plain = buildRosterRows([actor(1)], options());
  const changed = buildRosterRows([actor(1, { health: 4 })], options({
    selectedUid: 1,
    statusFor: () => 'woozy',
    familyFor: () => 'Gen 9 · 4 children',
    colorFor: () => '#000000',
  }));
  assert.equal(changed[0].health, 4);
  assert.equal(changed[0].status, 'woozy');
  assert.equal(changed[0].selected, true);
  assert.equal(changed[0].family, 'Gen 9 · 4 children');
  assert.equal(changed[0].color, '#000000');
  assert.equal(rosterSignature(changed), rosterSignature(plain));

  changed[0].health = 99;
  changed[0].status = 'different';
  changed[0].selected = false;
  changed[0].family = 'different';
  assert.equal(rosterSignature(changed), rosterSignature(plain));
});

test('module source has no DOM, storage, RNG or three.js dependency', () => {
  const source = readFileSync(new URL('../src/rosterview.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(document|window|localStorage|sessionStorage|performance)\b/);
  assert.doesNotMatch(source, /from\s+['"]three['"]/);
  assert.doesNotMatch(source, /Math\.random/);
});
