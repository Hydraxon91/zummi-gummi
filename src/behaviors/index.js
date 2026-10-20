// Behavior engine facade.
//
// The legacy engine in src/behavior.js stays untouched and remains the default
// until the parity harness is green. `?behaviors=modules` (or an explicit
// `engine: 'modules'` option) selects the modular engine under ./engine.js.

import { createBehavior as createLegacyBehavior } from '../behavior.js';
import { createBehaviorModules } from './engine.js';
import { createBehaviorConfig, FEATURE_DEFAULTS } from './config.js';

export const BEHAVIOR_ENGINES = Object.freeze(['legacy', 'modules']);

export function behaviorEngineFromSearch(search = '') {
  const params = new URLSearchParams(search);
  const value = params.get('behaviors');
  return value === 'modules' ? 'modules' : 'legacy';
}

export function createBehavior(options = {}) {
  const engine = options.engine === 'modules' ? 'modules' : 'legacy';
  if (engine === 'modules') return createBehaviorModules(options);
  return createLegacyBehavior(options);
}

export { createBehaviorModules, createBehaviorConfig, FEATURE_DEFAULTS };
