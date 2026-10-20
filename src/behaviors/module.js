// Behavior module contract.
//
// A module is plain data plus functions. It owns one or more `ai.state` values,
// contributes ordered opportunities to the wander pipeline and never keeps
// per-actor state at module scope. All mutable state belongs in `actor.ai`, so
// save/load, the parity harness and two-engine comparison keep working.

const REQUIRED_STATE = ['id', 'states', 'defaults'];

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function defineBehaviorModule(def) {
  if (!def || typeof def !== 'object') throw new Error('behavior module definition required');
  for (const key of REQUIRED_STATE) {
    if (!def[key]) throw new Error(`behavior module ${def.id || '(anonymous)'} needs ${key}`);
  }
  if (!Array.isArray(def.states) || def.states.length === 0 ||
      def.states.some(state => typeof state !== 'string' || !state)) {
    throw new Error(`behavior module ${def.id} states must be a non-empty list of strings`);
  }
  if (!isObject(def.defaults)) throw new Error(`behavior module ${def.id} defaults must be an object`);
  const opportunities = Array.isArray(def.opportunities) ? def.opportunities : [];
  for (const opportunity of opportunities) {
    if (!opportunity || typeof opportunity.id !== 'string' || !opportunity.id) {
      throw new Error(`behavior module ${def.id} opportunity needs an id`);
    }
    if (typeof opportunity.enter !== 'function') {
      throw new Error(`behavior opportunity ${opportunity.id} needs enter()`);
    }
    if (!Number.isFinite(opportunity.order)) {
      throw new Error(`behavior opportunity ${opportunity.id} needs a numeric order`);
    }
  }
  const states = Object.freeze(def.states.slice());
  const activeStates = Object.freeze(Array.isArray(def.activeStates) ? def.activeStates.slice() : []);
  const normalized = {
    ...def,
    states,
    activeStates,
    opportunities: Object.freeze(opportunities.map(opportunity => Object.freeze({ ...opportunity }))),
    defaults: Object.freeze({
      enabled: def.defaults.enabled !== false,
      params: Object.freeze({ ...(def.defaults.params || {}) }),
    }),
  };
  return Object.freeze(normalized);
}

// Modules are shared by every actor. This helper documents the rule and gives
// debug tooling one place to describe an owner.
export function moduleSummary(module) {
  if (!module) return null;
  return {
    id: module.id,
    label: module.label || module.id,
    states: module.states.slice(),
    activeStates: module.activeStates.slice(),
    opportunities: (module.opportunities || []).map(o => o.id),
  };
}
