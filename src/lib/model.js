import { validateAdventureState } from './stateValidation.js';

// All point changes happen here. The UI can render results without duplicating rules.
export const STORAGE_KEY = 'greenface-adventure-v1';
export const DEFAULT_SETTINGS = Object.freeze({
  childName: 'Superstar', greenPoints: 10, yellowPoints: 0, redPoints: -5,
  soundEnabled: true, goalRewardId: 'movie-night', parentPin: '', customRewards: [],
});

export const REWARDS = Object.freeze([
  { id: 'movie-night', name: 'Movie night', emoji: '🍿', cost: 40, description: 'You pick the movie. We bring the popcorn!', color: 'peach' },
  { id: 'choose-dinner', name: 'Dinner captain', emoji: '🍕', cost: 60, description: 'Choose what is on the menu tonight.', color: 'pink' },
  { id: 'ice-cream', name: 'Ice cream date', emoji: '🍦', cost: 30, description: 'A scoop of your favorite, together.', color: 'purple' },
  { id: 'extra-story', name: 'One more story', emoji: '📚', cost: 20, description: 'Snuggle up for an extra bedtime book.', color: 'blue' },
  { id: 'park-adventure', name: 'Park adventure', emoji: '🛝', cost: 80, description: 'A whole adventure at your favorite park.', color: 'green' },
  { id: 'mystery-surprise', name: 'Mystery surprise', emoji: '🎁', cost: 150, description: 'A little surprise, picked just for you.', color: 'yellow' },
]);

const place = (id, name, country, emoji, cost, lat, lon, region, fact) => ({
  id, name, country, emoji, cost, lat, lon, region, fact,
  x: ((lon + 180) / 360) * 100, y: ((90 - lat) / 180) * 100,
});

export const DESTINATIONS = Object.freeze([
  place('new-york', 'New York', 'United States', '🗽', 50, 40.71, -74.01, 'us', 'The Statue of Liberty wears a crown with seven spikes, one for each continent!'),
  place('orlando', 'Orlando', 'United States', '🏰', 80, 28.54, -81.38, 'us', 'Orlando is home to magical castles and lots of sunshine!'),
  place('grand-canyon', 'Grand Canyon', 'United States', '🏜️', 60, 36.11, -112.11, 'us', 'The Grand Canyon is so deep that you could stack about four tall skyscrapers inside it!'),
  place('san-francisco', 'San Francisco', 'United States', '🌉', 70, 37.77, -122.42, 'us', 'The Golden Gate Bridge is actually a special shade of orange!'),
  place('yellowstone', 'Yellowstone', 'United States', '🦬', 65, 44.6, -110.5, 'us', 'Yellowstone has hot springs that look like giant rainbow puddles!'),
  place('chicago', 'Chicago', 'United States', '🎡', 45, 41.88, -87.63, 'us', 'Chicago helped make the Ferris wheel famous at a huge fair in 1893!'),
  place('washington', 'Washington, D.C.', 'United States', '🏛️', 45, 38.91, -77.04, 'us', 'You can see giant dinosaur bones at the natural history museum!'),
  place('seattle', 'Seattle', 'United States', '🛸', 55, 47.61, -122.33, 'us', 'The Space Needle looks a little like a flying saucer on a tall stick!'),
  place('new-orleans', 'New Orleans', 'United States', '🎷', 50, 29.95, -90.07, 'us', 'New Orleans is famous for joyful music and colorful parades!'),
  place('denver', 'Denver', 'United States', '🏔️', 50, 39.74, -104.99, 'us', 'Denver sits a whole mile above the ocean, near the Rocky Mountains!'),
  place('paris', 'Paris', 'France', '🗼', 100, 48.86, 2.35, 'world', 'The Eiffel Tower sparkles with thousands of little lights at night!'),
  place('london', 'London', 'United Kingdom', '💂', 90, 51.51, -0.13, 'world', 'London has bright red buses with two floors!'),
  place('rome', 'Rome', 'Italy', '🏛️', 90, 41.9, 12.5, 'world', 'The Colosseum is a giant arena that was built almost 2,000 years ago!'),
  place('cairo', 'Cairo', 'Egypt', '🐪', 100, 30.04, 31.24, 'world', 'The pyramids near Cairo were built from millions of huge stone blocks!'),
  place('tokyo', 'Tokyo', 'Japan', '🌸', 120, 35.68, 139.69, 'world', 'In spring, cherry blossom trees turn parts of Tokyo pink!'),
  place('sydney', 'Sydney', 'Australia', '🐨', 130, -33.87, 151.21, 'world', 'The Sydney Opera House has a roof that looks like big white sails!'),
  place('rio', 'Rio de Janeiro', 'Brazil', '🦜', 110, -22.91, -43.17, 'world', 'Rio has a real rainforest right inside the city!'),
  place('cape-town', 'Cape Town', 'South Africa', '🐧', 120, -33.92, 18.42, 'world', 'You can find African penguins waddling on a beach near Cape Town!'),
  place('beijing', 'Beijing', 'China', '🐼', 110, 39.9, 116.41, 'world', 'Parts of the Great Wall wind over the hills near Beijing like a giant dragon!'),
  place('delhi', 'Delhi', 'India', '🐘', 100, 28.61, 77.21, 'world', 'Delhi is full of colorful markets, gardens, and amazing old buildings!'),
  place('reykjavik', 'Reykjavík', 'Iceland', '🌌', 100, 64.15, -21.94, 'world', 'Sometimes the night sky over Iceland glows with dancing northern lights!'),
  place('vancouver', 'Vancouver', 'Canada', '🍁', 75, 49.28, -123.12, 'world', 'In Vancouver, you can see mountains, forests, and the ocean all in one day!'),
]);

export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const clone = value => JSON.parse(JSON.stringify(value));
const dateObject = date => new Date(`${date}T12:00:00`);
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateObject(value).getTime()) && localDate(dateObject(value)) === value;
const previousWeekday = value => {
  const date = dateObject(value);
  do date.setDate(date.getDate() - 1); while ([0, 6].includes(date.getDay()));
  return localDate(date);
};
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const getMultiplier = streak => streak >= 5 ? 3 : streak >= 3 ? 2 : 1;

function streakAt(behaviors, throughDate) {
  const list = behaviors.filter(item => item.date <= throughDate).sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let expected = list[0]?.date;
  for (const item of list) {
    if (item.color !== 'green' || item.date !== expected) break;
    streak++;
    expected = previousWeekday(item.date);
  }
  return streak;
}

export function getStreak(state, today = localDate()) {
  const latest = state.behaviors.filter(item => item.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest || latest.date < previousWeekday(today)) return 0;
  return streakAt(state.behaviors, today);
}

export function createInitialState({ demo = true } = {}) {
  const state = {
    version: 1, demo, stars: demo ? 120 : 0, settings: { ...DEFAULT_SETTINGS, customRewards: [] },
    behaviors: [], history: [], passport: [], redemptions: [], undo: null,
  };
  if (demo) {
    let date = previousWeekday(localDate());
    const dates = [];
    for (let i = 0; i < 3; i++) { dates.unshift(date); date = previousWeekday(date); }
    state.behaviors = dates.map((date, index) => ({ id: `demo-${date}`, date, color: 'green', note: 'A kind, helpful day!', points: index === 2 ? 20 : 10, multiplier: index === 2 ? 2 : 1, streak: index + 1 }));
    state.history = state.behaviors.map(item => ({ ...item, type: 'behavior', title: 'A green day!', createdAt: `${item.date}T15:00:00` })).reverse();
  }
  return state;
}

function snapshot(state) { const before = clone(state); before.undo = null; return before; }
function commit(state, before, action) {
  state.undo = before;
  state.history.unshift({ id: id(), createdAt: new Date().toISOString(), date: localDate(), ...action });
}

export function recordBehavior(state, { color, date = localDate(), note = '' } = {}) {
  if (!['green', 'yellow', 'red'].includes(color)) return { ok: false, message: 'Choose a green, yellow, or red face.' };
  if (!validDate(date) || date > localDate()) return { ok: false, message: 'Choose a real date that is today or earlier.' };
  if ([0, 6].includes(dateObject(date).getDay())) return { ok: false, message: 'School check-ins are for Monday through Friday. Use a bonus for weekend kindness!' };
  if (state.behaviors.some(item => item.date === date)) return { ok: false, message: 'That day already has a face. Undo the latest check-in to change it.' };
  const earlier = state.behaviors.filter(item => item.date < date);
  const last = earlier.sort((a, b) => b.date.localeCompare(a.date))[0];
  const streak = color === 'green' ? (last?.date === previousWeekday(date) ? streakAt(earlier, last.date) : 0) + 1 : 0;
  const multiplier = color === 'green' ? getMultiplier(streak) : 1;
  const requested = state.settings[`${color}Points`] * multiplier;
  if (requested > 0 && !Number.isSafeInteger(state.stars + requested)) return { ok: false, message: 'Your star jar is full. Spend some stars before adding more.' };
  const before = snapshot(state);
  const points = Math.max(-state.stars, requested) || 0;
  state.stars += points;
  const entry = { id: id(), date, color, note: String(note).trim().slice(0, 250), points, multiplier, streak };
  state.behaviors.push(entry);
  commit(state, before, { ...entry, type: 'behavior', title: color === 'green' ? 'A green day!' : color === 'yellow' ? 'Keep practicing!' : 'A fresh start tomorrow' });
  return { ok: true, points, multiplier, streak, message: color === 'green' ? `Amazing! You earned ${points} stars${multiplier > 1 ? ` with a ${multiplier}× green streak` : ''}!` : color === 'yellow' ? 'Every day is a chance to grow. Let’s try for green tomorrow!' : 'Everyone has tricky days. Tomorrow is a fresh start.' };
}

export function adjustPoints(state, { amount, note = '' } = {}) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value === 0 || Math.abs(value) > 10000) return { ok: false, message: 'Choose a whole number from 1 to 10,000 stars.' };
  if (!String(note).trim()) return { ok: false, message: 'Add a short reason for this star change.' };
  if (value > 0 && !Number.isSafeInteger(state.stars + value)) return { ok: false, message: 'Your star jar is full. Spend some stars before adding more.' };
  const before = snapshot(state);
  const points = Math.max(-state.stars, value) || 0;
  state.stars += points;
  commit(state, before, { type: 'adjustment', title: value > 0 ? 'A little extra kindness' : 'Practice makes progress', note: String(note).trim().slice(0, 250), points });
  return { ok: true, points, message: points >= 0 ? `${points} bonus stars. Great effort!` : `${Math.abs(points)} stars used. A fresh chance is always ahead.` };
}

export function redeemReward(state, rewardId) {
  const reward = [...REWARDS, ...(state.settings.customRewards || [])].find(item => item.id === rewardId);
  if (!reward) return { ok: false, message: 'That reward could not be found.' };
  if (state.stars < reward.cost) return { ok: false, message: `Just ${reward.cost - state.stars} more stars for ${reward.name.toLowerCase()}!` };
  const before = snapshot(state);
  state.stars -= reward.cost;
  state.redemptions.push({ id: id(), rewardId, date: localDate(), cost: reward.cost });
  commit(state, before, { type: 'reward', title: reward.name, rewardId, points: -reward.cost, emoji: reward.emoji });
  return { ok: true, points: -reward.cost, message: `${reward.emoji} You earned ${reward.name.toLowerCase()}! Plan it with your grown-up.` };
}

export function visitDestination(state, destinationId) {
  const destination = DESTINATIONS.find(item => item.id === destinationId);
  if (!destination) return { ok: false, message: 'That destination could not be found.' };
  if (state.passport.some(item => item.destinationId === destinationId)) return { ok: false, message: 'You already have this passport stamp. You can explore it again for free!' };
  if (state.stars < destination.cost) return { ok: false, message: `${destination.cost - state.stars} more stars and your adventure awaits!` };
  const before = snapshot(state);
  state.stars -= destination.cost;
  state.passport.push({ destinationId, date: localDate(), cost: destination.cost });
  commit(state, before, { type: 'destination', title: `Explored ${destination.name}`, destinationId, points: -destination.cost, emoji: destination.emoji });
  return { ok: true, points: -destination.cost, message: `${destination.emoji} Welcome to ${destination.name}! Your passport has a new stamp.` };
}

export function undoLastAction(state) {
  if (!state.undo) return { ok: false, message: 'There is no recent action to undo.' };
  const restored = clone(state.undo);
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, restored, { undo: null });
  return { ok: true, message: 'The last action has been undone.' };
}

export function updateSettings(state, patch = {}) {
  const settings = { ...state.settings };
  if ('childName' in patch) {
    const name = String(patch.childName).trim();
    if (!name || name.length > 30) return { ok: false, message: 'Choose a name between 1 and 30 characters.' };
    settings.childName = name;
  }
  for (const key of ['greenPoints', 'yellowPoints', 'redPoints']) {
    if (!(key in patch)) continue;
    const value = Number(patch[key]);
    if (!Number.isSafeInteger(value) || Math.abs(value) > 1000) return { ok: false, message: 'Face values must be whole numbers from −1,000 to 1,000.' };
    if (key === 'greenPoints' && value < 1) return { ok: false, message: 'A green day should earn at least one star.' };
    if (key === 'redPoints' && value > 0) return { ok: false, message: 'Use zero or a negative number for red days.' };
    settings[key] = value;
  }
  if ('soundEnabled' in patch) settings.soundEnabled = Boolean(patch.soundEnabled);
  if ('parentPin' in patch) {
    if (typeof patch.parentPin !== 'string' || (patch.parentPin !== '' && !/^\d{4}$/.test(patch.parentPin))) return { ok: false, message: 'Use four digits for your grown-up PIN.' };
    settings.parentPin = patch.parentPin;
  }
  if ('customRewards' in patch) {
    if (!Array.isArray(patch.customRewards) || patch.customRewards.length > 50) return { ok: false, message: 'You can add up to 50 custom rewards.' };
    const rewards = patch.customRewards;
    const ids = new Set(REWARDS.map(item => item.id));
    for (const reward of rewards) {
      if (!reward || typeof reward.id !== 'string' || !reward.id || reward.id.length > 100 || ids.has(reward.id) || typeof reward.name !== 'string' || !reward.name.trim() || reward.name.length > 60 || !Number.isSafeInteger(Number(reward.cost)) || Number(reward.cost) < 1 || Number(reward.cost) > 10000) return { ok: false, message: 'Each reward needs a unique ID, a name, and a whole-number cost from 1 to 10,000.' };
      ids.add(reward.id);
    }
    settings.customRewards = rewards.map(reward => ({ id: reward.id.slice(0, 100), name: reward.name.trim(), cost: Number(reward.cost), emoji: String(reward.emoji || '🎁').slice(0, 16), description: String(reward.description || 'A special treat from your grown-up.').slice(0, 250), color: String(reward.color || 'yellow').slice(0, 20) }));
  }
  if ('goalRewardId' in patch) {
    if (![...REWARDS, ...(settings.customRewards || [])].some(item => item.id === patch.goalRewardId)) return { ok: false, message: 'Choose an available reward as your goal.' };
    settings.goalRewardId = patch.goalRewardId;
  }
  state.settings = settings;
  return { ok: true, message: 'Your adventure settings are saved.' };
}

export function resetAdventure(state) {
  const settings = { ...state.settings };
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, createInitialState({ demo: false }), { settings });
  return { ok: true, message: 'A brand-new adventure starts now!' };
}

export function saveState(state, storage = globalThis.localStorage) {
  try {
    if (!storage) return { ok: false, message: 'Storage is unavailable. This adventure will last while this page stays open.' };
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true, message: 'Adventure saved on this device.' };
  } catch {
    return { ok: false, message: 'This browser could not save your adventure. Keep this page open to continue.' };
  }
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const state = JSON.parse(raw);
    if (!validateState(state)) return createInitialState();
    state.settings = { ...DEFAULT_SETTINGS, ...state.settings };
    return state;
  } catch { return createInitialState(); }
}

// Suitable for JSONB storage and downloadable backups; no browser-specific objects.
export function validateState(state) {
  return validateAdventureState(state);
}

export function exportState(state) {
  // Parent locks and cloud credentials belong to the device/session, never a backup.
  const { version, demo, stars, behaviors, history, passport, redemptions } = state;
  const { childName, greenPoints, yellowPoints, redPoints, soundEnabled, goalRewardId, customRewards = [] } = state.settings;
  return JSON.stringify({ version, demo, stars, settings: { childName, greenPoints, yellowPoints, redPoints, soundEnabled, goalRewardId, customRewards }, behaviors, history, passport, redemptions, undo: null }, null, 2);
}
export function importState(json) {
  try {
    const state = typeof json === 'string' ? JSON.parse(json) : clone(json);
    if (!validateState(state)) return { ok: false, message: 'That backup does not contain a valid Greenface adventure.' };
    state.settings = { ...DEFAULT_SETTINGS, ...state.settings, parentPin: '' };
    state.undo = null;
    return { ok: true, state, message: 'Your adventure is ready to restore.' };
  } catch { return { ok: false, message: 'That backup could not be read.' }; }
}
