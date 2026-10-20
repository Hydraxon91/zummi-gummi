import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BEAR_PROFILE, GUMMY_PROFILE, GLASS_PROFILE } from '../src/behaviorprofiles.js';

const SRC = fileURLToPath(new URL('../src/behaviors/', import.meta.url));

// Every canonical profile leaf has one owner. `meta` is identity only, and
// `reserved` / `unused` are explicit no-behavior lists. The rules are disjoint;
// a new field with no rule (or two matching rules) fails the test.
const RULES = [
  [/^id$|^species$|^kind$/, 'meta'],
  [/^states$|^locomotion$/, 'unused'],
  [/^think\.min$|^think\.max$/, 'engine'],
  [/^think\.stuckTime$/, 'unused'],
  [/^wander\./, 'wander'],
  [/^needs\./, 'engine'],
  [/^thresholds\.criticalHunger$|^thresholds\.criticalThirst$/, 'engine'],
  [/^thresholds\.stopHunger$/, 'forage'],
  [/^thresholds\.stopThirst$|^thresholds\.seekThirst$/, 'water'],
  [/^thresholds\.seekHunger$/, 'conflict'],
  [/^thresholds\.seekSocial$|^thresholds\.seekAffection$|^thresholds\.stopSocial$/, 'social'],
  [/^thresholds\.energyTired$|^thresholds\.healthHurt$|^thresholds\.healthWoozy$/, 'rest'],
  [/^thresholds\.energyRested$|^thresholds\.healthRecovered$|^thresholds\.woozySpeed$/, 'unused'],
  [/^food\.eatTime$|^food\.eatDist$|^food\.searchRadius$/, 'forage'],
  [/^food\.drinkTime$|^food\.drinkDist$/, 'water'],
  [/^rest\.nightStart$|^rest\.nightEnd$/, 'engine'],
  [/^rest\.insideSeconds$/, 'unused'],
  [/^rest\.(?!nightStart$|nightEnd$|insideSeconds$)/, 'rest'],
  [/^social\./, 'social'],
  [/^mate\.followDist$/, 'follow'],
  [/^mate\.(?!followDist$)/, 'mate'],
  [/^modules\.hive\.enabled$/, 'config'],
  [/^modules\.hive\.params\./, 'hive'],
  [/^modules\.conflict\.enabled$/, 'config'],
  [/^modules\.conflict\.params\.(damage|healthFloor|shove)$/, 'reserved'],
  [/^modules\.conflict\.params\.(?!damage$|healthFloor$|shove$)/, 'conflict'],
  [/^modules\.directives\.enabled$/, 'config'],
  [/^modules\.directives\.params\./, 'directives'],
  [/^modules\.stargaze\.enabled$/, 'config'],
  [/^modules\.stargaze\.params\./, 'stargaze'],
];

const RESERVED = new Set([
  'modules.conflict.params.damage',
  'modules.conflict.params.healthFloor',
  'modules.conflict.params.shove',
]);

const UNUSED = new Set([
  'states',
  'locomotion',
  'think.stuckTime',
  'rest.insideSeconds',
  'thresholds.energyRested',
  'thresholds.healthRecovered',
  'thresholds.woozySpeed',
]);

const SOURCE = {
  engine: 'engine.js', config: 'config.js', wander: 'wander.js', forage: 'forage.js',
  water: 'water.js', rest: 'rest.js', social: 'social.js', family: 'family.js',
  mate: 'mate.js', follow: 'follow.js', hive: 'hive.js', conflict: 'conflict.js',
  directives: 'directives.js', stargaze: 'stargaze.js',
};

const legacyViewKeys = new Set(['hive', 'conflict', 'directives', 'stargaze']);

function canonical(profile) {
  const copy = { ...profile };
  for (const key of legacyViewKeys) delete copy[key];
  return copy;
}

function leaves(value, prefix = '') {
  const out = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) out.push(...leaves(child, path));
    else out.push(path);
  }
  return out;
}

function owners(path) {
  return RULES.filter(([pattern]) => pattern.test(path)).map(([, owner]) => owner);
}

test('every profile field has exactly one owner, reserved or unused entry', () => {
  const sourceCache = new Map();
  const profiles = { bear: BEAR_PROFILE, gummy: GUMMY_PROFILE, glass: GLASS_PROFILE };
  for (const [name, profile] of Object.entries(profiles)) {
    for (const path of leaves(canonical(profile))) {
      const found = owners(path);
      assert.equal(found.length, 1, `${name}: ${path} matched ${found.length} owners (${found.join(', ')})`);
      const owner = found[0];
      if (owner === 'reserved') assert.ok(RESERVED.has(path), `${name}: ${path} missing from RESERVED`);
      if (owner === 'unused') assert.ok(UNUSED.has(path), `${name}: ${path} missing from UNUSED`);
      if (owner === 'meta' || owner === 'reserved' || owner === 'unused') continue;
      const file = SOURCE[owner];
      assert.ok(file, `${name}: ${path} owner ${owner} has no source file`);
      let text = sourceCache.get(file);
      if (!text) {
        text = readFileSync(`${SRC}${file}`, 'utf8');
        sourceCache.set(file, text);
      }
      const key = path.slice(path.lastIndexOf('.') + 1);
      assert.ok(text.includes(key), `${name}: ${path} owner ${owner} does not reference "${key}"`);
    }
  }
});

test('reserved and unused lists contain only real profile leaves', () => {
  const paths = new Set([
    ...leaves(canonical(BEAR_PROFILE)),
    ...leaves(canonical(GUMMY_PROFILE)),
    ...leaves(canonical(GLASS_PROFILE)),
  ]);
  for (const path of [...RESERVED, ...UNUSED]) {
    assert.ok(paths.has(path), `${path} is not a profile leaf`);
  }
});
