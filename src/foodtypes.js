// Pure food definitions. Placed source IDs and mutable ripeness stay in food.js.
// New types can reuse an existing visual/interaction without changing AI lists.
const registry = new Map();

export function registerFoodType(def) {
  if (!def || typeof def.id !== 'string' || !def.id) throw new Error('food type id required');
  if (registry.has(def.id)) throw new Error(`food type already registered: ${def.id}`);
  if (typeof def.label !== 'string' || !def.label) throw new Error('food label required');
  if (!(Number.isFinite(def.satiation) && def.satiation > 0)) throw new Error('invalid food satiation');
  if (!(Number.isFinite(def.respawnMin) && def.respawnMin > 0 &&
        Number.isFinite(def.respawnMax) && def.respawnMax >= def.respawnMin)) {
    throw new Error('invalid food respawn range');
  }
  if (typeof def.safe !== 'boolean') throw new Error('food safety required');
  const type = Object.freeze({ ...def });
  registry.set(type.id, type);
  return type;
}

export function getFoodType(id) { return registry.get(id) || null; }
export function listFoodTypes() { return [...registry.values()]; }
export function isSafeFood(source) { return !!getFoodType(source?.kind)?.safe; }

registerFoodType({ id: 'flower', label: 'jelly flower', safe: true,
  satiation: .20, respawnMin: 25, respawnMax: 45, visual: 'flower', interaction: 'eat' });
registerFoodType({ id: 'fruit', label: 'jelly fruit', safe: true,
  satiation: .35, respawnMin: 45, respawnMax: 90, visual: 'fruit', interaction: 'eat' });
registerFoodType({ id: 'hive', label: 'beehive', safe: false,
  satiation: .55, respawnMin: 90, respawnMax: 150, visual: 'hive', interaction: 'raidHive' });
