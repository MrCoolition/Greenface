// Shared by local restore, cloud responses, and the API. Keep this module
// dependency-free so malformed saved data is rejected before rendering it.
const COLORS = new Set(['green', 'yellow', 'red']);
const HISTORY_TYPES = new Set(['behavior', 'adjustment', 'reward', 'destination']);
const DEFAULT_REWARD_IDS = new Set(['movie-night', 'choose-dinner', 'ice-cream', 'extra-story', 'park-adventure', 'mystery-surprise']);
const DESTINATION_IDS = new Set(['new-york', 'orlando', 'grand-canyon', 'san-francisco', 'yellowstone', 'chicago', 'washington', 'seattle', 'new-orleans', 'denver', 'paris', 'london', 'rome', 'cairo', 'tokyo', 'sydney', 'rio', 'cape-town', 'beijing', 'delhi', 'reykjavik', 'vancouver']);
const STATE_KEYS = new Set(['version', 'demo', 'stars', 'settings', 'behaviors', 'history', 'passport', 'redemptions', 'undo']);
const SETTINGS_KEYS = new Set(['childName', 'greenPoints', 'yellowPoints', 'redPoints', 'soundEnabled', 'goalRewardId', 'parentPin', 'customRewards']);
const BEHAVIOR_KEYS = new Set(['id', 'date', 'color', 'note', 'points', 'multiplier', 'streak']);
const HISTORY_KEYS = new Set([...BEHAVIOR_KEYS, 'type', 'title', 'createdAt', 'emoji', 'rewardId', 'destinationId']);
const REWARD_KEYS = new Set(['id', 'name', 'cost', 'emoji', 'description', 'color']);
const PASSPORT_KEYS = new Set(['destinationId', 'date', 'cost']);
const REDEMPTION_KEYS = new Set(['id', 'rewardId', 'date', 'cost']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max, min = 0) => typeof value === 'string' && value.length >= min && value.length <= max;
const integer = (value, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const keys = (value, allowed) => object(value) && Object.keys(value).every(key => allowed.has(key));
const optionalText = (value, key, max) => value[key] === undefined || text(value[key], max);
const list = value => Array.isArray(value) && value.length <= 5000;

function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || typeof value !== 'string') return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function schoolDate(value) {
  return date(value) && ![0, 6].includes(new Date(`${value}T12:00:00Z`).getUTCDay());
}

function settings(value) {
  if (!keys(value, SETTINGS_KEYS) || !text(value.childName, 30, 1) || !value.childName.trim()) return false;
  if (!integer(value.greenPoints, 1, 1000) || !integer(value.yellowPoints, -1000, 1000) || !integer(value.redPoints, -1000, 0)) return false;
  if (value.soundEnabled !== undefined && typeof value.soundEnabled !== 'boolean') return false;
  if (!optionalText(value, 'goalRewardId', 100) || (value.parentPin !== undefined && (typeof value.parentPin !== 'string' || (value.parentPin !== '' && !/^\d{4}$/.test(value.parentPin))))) return false;
  if (value.customRewards === undefined) return true;
  if (!Array.isArray(value.customRewards) || value.customRewards.length > 50) return false;
  const ids = new Set(DEFAULT_REWARD_IDS);
  for (const reward of value.customRewards) {
    if (!keys(reward, REWARD_KEYS) || !text(reward.id, 100, 1) || ids.has(reward.id) || !text(reward.name, 60, 1) || !reward.name.trim() || !integer(reward.cost, 1, 10000)) return false;
    if (!optionalText(reward, 'emoji', 16) || !optionalText(reward, 'description', 250) || !optionalText(reward, 'color', 20)) return false;
    ids.add(reward.id);
  }
  return true;
}

function behavior(value) {
  return keys(value, BEHAVIOR_KEYS) && text(value.id, 100, 1) && schoolDate(value.date) && COLORS.has(value.color) && integer(value.points)
    && optionalText(value, 'note', 250) && (value.multiplier === undefined || integer(value.multiplier, 1, 3))
    && (value.streak === undefined || integer(value.streak, 0));
}

function history(value) {
  if (!keys(value, HISTORY_KEYS) || !text(value.id, 100, 1) || !HISTORY_TYPES.has(value.type) || !text(value.title, 120, 1) || !integer(value.points) || !date(value.date)) return false;
  if (!optionalText(value, 'note', 250) || !optionalText(value, 'emoji', 16) || !optionalText(value, 'rewardId', 100) || !optionalText(value, 'destinationId', 100)) return false;
  if (value.createdAt !== undefined && (!text(value.createdAt, 40, 1) || Number.isNaN(new Date(value.createdAt).getTime()))) return false;
  if (value.type === 'behavior' && !COLORS.has(value.color)) return false;
  if (value.color !== undefined && !COLORS.has(value.color)) return false;
  if (value.multiplier !== undefined && !integer(value.multiplier, 1, 3)) return false;
  if (value.streak !== undefined && !integer(value.streak, 0)) return false;
  return true;
}

function snapshot(state, depth) {
  if (!keys(state, STATE_KEYS) || state.version !== 1 || typeof state.demo !== 'boolean' || !integer(state.stars, 0) || !settings(state.settings)) return false;
  for (const key of ['behaviors', 'history', 'passport', 'redemptions']) if (!list(state[key])) return false;
  const dates = new Set();
  for (const entry of state.behaviors) {
    if (!behavior(entry) || dates.has(entry.date)) return false;
    dates.add(entry.date);
  }
  if (!state.history.every(history)) return false;
  const destinations = new Set();
  for (const entry of state.passport) {
    if (!keys(entry, PASSPORT_KEYS) || !DESTINATION_IDS.has(entry.destinationId) || destinations.has(entry.destinationId) || !date(entry.date) || !integer(entry.cost, 0, 10000)) return false;
    destinations.add(entry.destinationId);
  }
  for (const entry of state.redemptions) {
    if (!keys(entry, REDEMPTION_KEYS) || !text(entry.id, 100, 1) || !text(entry.rewardId, 100, 1) || !date(entry.date) || !integer(entry.cost, 1, 10000)) return false;
  }
  if (state.undo !== null && state.undo !== undefined && (depth >= 1 || !snapshot(state.undo, depth + 1))) return false;
  return true;
}

export function validateAdventureState(state) {
  try { return snapshot(state, 0); }
  catch { return false; }
}
