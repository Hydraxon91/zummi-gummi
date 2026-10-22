import test from 'node:test';
import assert from 'node:assert/strict';
import { defineBehaviorModule } from '../src/behaviors/module.js';
import { BEHAVIOR_CONTRACTS, checkBehaviorContracts } from '../src/behaviors/contracts.js';
import { currentBehaviorInventory } from '../scripts/check-behavior-contracts.mjs';
import { assertModuleConfigScopes, createPairFixture } from './helpers/behavior-conformance.mjs';

const module = (id, state = id, opportunity = `${id}.seek`) => defineBehaviorModule({
  id, states: [state], defaults: { enabled: true, params: {} },
  opportunities: [{ id: opportunity, order: 1, enter: () => true }],
});
const entry = id => ({ id, configuration: 'layered', disable: 'finish-current', registration: 'engine' });

test('live engine/config inventory matches explicit support declarations', () => {
  const result = checkBehaviorContracts(currentBehaviorInventory());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.modules, 17);
  assert.equal(BEHAVIOR_CONTRACTS.find(c => c.id === 'water').disable, 'unsupported');
  assert.equal(BEHAVIOR_CONTRACTS.find(c => c.id === 'directives').registration, 'capability');
});

test('checker accepts a valid fixture and detects deliberately broken inventories', () => {
  const base = { engineModules: [module('example')], configuredIds: ['example'], contracts: [entry('example')] };
  assert.equal(checkBehaviorContracts(base).ok, true);
  for (const change of [
    { configuredIds: [] }, { engineModules: [] }, { contracts: [] },
    { configuredIds: ['example', 'unknown'] },
    { contracts: [entry('example'), entry('example')] },
    { engineModules: [module('example'), module('example')] },
    { engineModules: [module('example'), module('second', 'example')] },
    { engineModules: [module('example'), module('second', 'other', 'example.seek')] },
    { contracts: [{ ...entry('example'), disable: 'invented' }] },
    { contracts: [{ ...entry('example'), registration: 'capability' }] },
  ]) assert.equal(checkBehaviorContracts({ ...base, ...change }).ok, false, JSON.stringify(change));
});

test('module authoring validation rejects malformed and duplicate definitions', () => {
  const base = { id: 'example', states: ['idle'], defaults: { enabled: true, params: {} } };
  assert.doesNotThrow(() => defineBehaviorModule(base));
  for (const patch of [
    { id: 7 }, { states: ['idle', 'idle'] }, { defaults: { enabled: 'yes' } },
    { defaults: { params: [] } }, { activeStates: ['unknown'] }, { activeStates: 'idle' },
    { opportunities: {} },
    { opportunities: [1, 2].map(() => ({ id: 'same', order: 1, enter: () => true })) },
  ]) assert.throws(() => defineBehaviorModule({ ...base, ...patch }));
});

for (const entry of BEHAVIOR_CONTRACTS.filter(c => c.configuration === 'layered')) {
  test(`${entry.id}: real config global/species/actor scope, re-enable and reset`, () => {
    assertModuleConfigScopes(entry.id);
  });
}

test('mate conformance: species-disabled actors refuse selection; active-pair removal cleans both sides', () => {
  const { engine, actors } = createPairFixture();
  engine.setModuleEnabled('mate', false, { species: 'bear' });
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek'), null);
  engine.setModuleEnabled('mate', true, { species: 'bear' });
  assert.equal(engine.api.runOpportunity(actors[0], 'mate.seek').id, 'mate.seek');
  assert.equal(actors[1].ai.partner, actors[0]);
  engine.detach(actors[0]);
  assert.equal(actors[0].ai, null);
  assert.equal(actors[1].ai.partner, null);
  assert.equal(actors[1].ai.state, 'wander');
});
