import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, recordBehavior, adjustPoints, redeemReward, visitDestination, undoLastAction, updateSettings, resetAdventure, getStreak, getMultiplier, saveState, loadState, localDate, STORAGE_KEY, exportState, importState, validateState, DESTINATIONS, addDestination, getDestinations, normalizeAdventureState, updateBehavior, removeBehavior, resetFaces } from '../src/lib/model.js';

function recentSchoolDates(count) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const dates = [];
  while (dates.length < count) {
    date.setDate(date.getDate() - 1);
    if (![0, 6].includes(date.getDay())) dates.unshift(localDate(date));
  }
  return dates;
}

function fixtureState() {
  const state = createInitialState({ demo: false });
  for (const date of recentSchoolDates(3)) recordBehavior(state, { color: 'green', date, note: 'Parent-entered test grade' });
  adjustPoints(state, { amount: 80, note: 'Parent-entered test bonus' });
  state.undo = null;
  return state;
}

test('green school streak awards 2× on day 3 and 3× on day 5, including weekends', () => {
  const state = createInitialState({ demo: false });
  const dates = recentSchoolDates(6);
  assert.deepEqual(dates.map(date => recordBehavior(state, { color: 'green', date }).points), [10, 10, 20, 20, 30, 30]);
  assert.equal(state.stars, 120);
  assert.equal(getStreak(state, dates.at(-1)), 6);
  assert.equal(getMultiplier(999), 3);
});

test('missing weekday and non-green day break a streak', () => {
  const state = createInitialState({ demo: false });
  const dates = recentSchoolDates(6);
  recordBehavior(state, { color: 'green', date: dates[0] });
  assert.equal(recordBehavior(state, { color: 'green', date: dates[2] }).streak, 1);
  recordBehavior(state, { color: 'yellow', date: dates[3] });
  assert.equal(recordBehavior(state, { color: 'green', date: dates[4] }).streak, 1);
  assert.equal(getStreak(state, dates[5]), 1);
});

test('duplicate, invalid, future, and weekend check-ins do not mutate state', () => {
  const state = createInitialState({ demo: false });
  recordBehavior(state, { color: 'green', date: recentSchoolDates(1)[0] });
  const before = JSON.stringify(state);
  for (const date of [recentSchoolDates(1)[0], '2026-02-30', '2099-01-01', '2026-11-08']) assert.equal(recordBehavior(state, { color: 'green', date }).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('red and manual losses floor at zero and green recovers normally', () => {
  const state = createInitialState({ demo: false });
  const dates = recentSchoolDates(2);
  assert.equal(recordBehavior(state, { color: 'red', date: dates[0] }).points, 0);
  assert.equal(state.stars, 0);
  recordBehavior(state, { color: 'green', date: dates[1] });
  assert.equal(adjustPoints(state, { amount: -100, note: 'Consequence' }).points, -10);
  assert.equal(state.stars, 0);
  assert.equal(adjustPoints(state, { amount: 10, note: '' }).ok, false);
});

test('rewards and destinations deduct once and undo atomically restores purchase', () => {
  const state = fixtureState();
  const before = state.stars;
  assert.equal(redeemReward(state, 'ice-cream').ok, true);
  assert.equal(state.stars, before - 30);
  assert.equal(undoLastAction(state).ok, true);
  assert.equal(state.stars, before);
  assert.equal(state.redemptions.length, 0);
  assert.equal(undoLastAction(state).ok, false);
  assert.equal(visitDestination(state, 'new-york').ok, true);
  const starsAfter = state.stars;
  assert.equal(visitDestination(state, 'new-york').ok, false);
  assert.equal(state.stars, starsAfter);
  assert.equal(state.passport.length, 1);
  assert.equal(visitDestination(state, 'sydney').ok, false);
});

test('settings validate before mutation and fresh start clears demo records', () => {
  const state = fixtureState();
  assert.equal(updateSettings(state, { childName: 'Alex', greenPoints: 12, parentPin: '1234' }).ok, true);
  assert.equal(updateSettings(state, { childName: 'Oops', greenPoints: -10 }).ok, false);
  assert.equal(state.settings.childName, 'Alex');
  resetAdventure(state);
  assert.equal(state.demo, false);
  assert.equal(state.stars, 0);
  assert.equal(state.behaviors.length, 0);
  assert.equal(state.settings.childName, 'Alex');
});

test('storage round-trips, rejects corrupt state, and handles storage failures', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const state = fixtureState();
  assert.equal(saveState(state, storage).ok, true);
  assert.deepEqual(loadState(storage), state);
  map.set(STORAGE_KEY, '{broken');
  assert.equal(loadState(storage).stars, 0);
  assert.equal(saveState(state, { setItem() { throw Error('quota'); } }).ok, false);
});

test('custom rewards can be created and redeemed, while invalid rewards are rejected', () => {
  const state = fixtureState();
  assert.equal(updateSettings(state, { customRewards: [{ id: 'custom-1', name: 'Board game', cost: 25, emoji: '🎲' }] }).ok, true);
  assert.equal(redeemReward(state, 'custom-1').ok, true);
  assert.equal(state.stars, 95);
  assert.equal(updateSettings(state, { customRewards: [{ id: 'movie-night', name: 'Duplicate', cost: 1 }] }).ok, false);
  assert.equal(state.settings.customRewards[0].name, 'Board game');
});

test('backups round-trip without undo state and reject malformed records', () => {
  const state = fixtureState();
  redeemReward(state, 'ice-cream');
  const result = importState(exportState(state));
  assert.equal(result.ok, true);
  assert.equal(result.state.stars, 90);
  assert.equal(result.state.undo, null);
  assert.equal(importState('{bad').ok, false);
  const invalid = fixtureState();
  invalid.behaviors[0].color = 'blue';
  assert.equal(importState(invalid).ok, false);
});

test('malformed imported nested records cannot reach the UI or purchases', () => {
  const corruptions = [
    state => { state.passport = [null]; },
    state => { state.passport = [{ destinationId: 'not-a-place', date: localDate(), cost: 1 }]; },
    state => { state.history = [null]; },
    state => { state.history[0].color = 'purple'; },
    state => { state.history[0].title = { malicious: true }; },
    state => { state.history[0].points = 'ten'; },
    state => { state.redemptions = [null]; },
    state => { state.settings.customRewards = [null]; },
    state => { state.settings.customRewards = [{ id: 'bad', name: 'Bad reward', cost: -5, emoji: '🎁' }]; },
    state => { state.settings.customRewards = { id: 'not-an-array' }; },
    state => { state.behaviors.push({ ...state.behaviors[0] }); },
    state => { state.undo = { arbitrary: 'not an adventure' }; },
    state => { state.undo = fixtureState(); state.undo.undo = fixtureState(); },
    state => { state.settings.childName = ''; },
    state => { state.settings.greenPoints = -1; },
    state => { state.settings.redPoints = 1; },
  ];
  for (const corrupt of corruptions) {
    const state = fixtureState();
    corrupt(state);
    assert.equal(validateState(state), false, corrupt.toString());
    assert.equal(importState(JSON.stringify(state)).ok, false, corrupt.toString());
  }
});

test('backup files omit PINs and session credentials and importing clears legacy PIN', () => {
  const state = fixtureState();
  state.settings.parentPin = '1234';
  state.sessionToken = 'must-not-leak';
  state.settings.password = 'must-not-leak';
  const backup = JSON.parse(exportState(state));
  assert.equal('sessionToken' in backup, false);
  assert.equal('password' in backup.settings, false);
  assert.equal('parentPin' in backup.settings, false);
  assert.equal(importState(backup).ok, true);
  const legacy = fixtureState();
  legacy.settings.parentPin = '1234';
  assert.equal(importState(legacy).state.settings.parentPin, '');
});

test('invalid custom reward patches never throw or partially alter settings', () => {
  const state = fixtureState();
  const before = JSON.stringify(state.settings);
  assert.equal(updateSettings(state, { childName: 'Oops', customRewards: {}, goalRewardId: 'movie-night' }).ok, false);
  assert.equal(JSON.stringify(state.settings), before);
});

test('backdated check-ins recalculate bonuses from actual school grades', () => {
  const state = createInitialState({ demo: false });
  const dates = recentSchoolDates(4);
  recordBehavior(state, { color: 'green', date: dates[0] });
  recordBehavior(state, { color: 'green', date: dates[2] });
  assert.equal(state.stars, 20);
  recordBehavior(state, { color: 'green', date: dates[1] });
  assert.equal(state.stars, 40);
  assert.equal(recordBehavior(state, { color: 'green', date: dates[3] }).points, 20);
});

test('a valid imported balance near the integer limit cannot overflow on an award', () => {
  const state = createInitialState({ demo: false });
  state.stars = Number.MAX_SAFE_INTEGER;
  const before = JSON.stringify(state);
  assert.equal(adjustPoints(state, { amount: 1, note: 'Bonus' }).ok, false);
  assert.equal(recordBehavior(state, { color: 'green', date: recentSchoolDates(1)[0] }).ok, false);
  assert.equal(JSON.stringify(state), before);
});

const familyDestination = overrides => ({ name: 'Our favorite beach', country: 'United States', emoji: '🐚', cost: 35, lat: 27.51, lon: -82.72, region: 'us', fact: 'A place for collecting little memories together!', ...overrides });

test('requested beach destinations are available in the default catalog', () => {
  const state = fixtureState();
  const holmes = getDestinations(state).find(item => item.id === 'holmes-beach');
  const turks = getDestinations(state).find(item => item.id === 'turks-caicos');
  assert.equal(holmes.region, 'us');
  assert.equal(holmes.cost, 100);
  assert.equal(holmes.lat, 27.5108621);
  assert.equal(turks.country, 'Turks and Caicos Islands');
  assert.equal(turks.region, 'world');
  assert.equal(turks.lon, -72.1825);
  assert.equal(getDestinations(state).length, DESTINATIONS.length);
});

test('a family destination can be created, visited once, and undone atomically', () => {
  const state = fixtureState();
  const originalStars = state.stars;
  const originalHistory = JSON.stringify(state.history);
  const result = addDestination(state, familyDestination({ name: '  Our little beach  ', cost: '35', lat: '27.51', lon: '-82.72' }));
  assert.equal(result.ok, true);
  assert.match(result.destination.id, /^custom-/);
  assert.equal(result.destination.name, 'Our little beach');
  assert.equal(state.stars, originalStars);
  assert.equal(JSON.stringify(state.history), originalHistory);
  assert.equal(state.undo, null);
  assert.equal(getDestinations(state).length, DESTINATIONS.length + 1);
  assert.equal(validateState(state), true);
  assert.equal(visitDestination(state, result.destination.id).ok, true);
  assert.equal(state.stars, originalStars - 35);
  assert.equal(state.passport[0].destinationId, result.destination.id);
  assert.equal(validateState(state), true);
  assert.equal(visitDestination(state, result.destination.id).ok, false);
  assert.equal(state.stars, originalStars - 35);
  assert.equal(undoLastAction(state).ok, true);
  assert.equal(state.stars, originalStars);
  assert.equal(state.passport.length, 0);
  assert.equal(getDestinations(state).at(-1).id, result.destination.id);
});

test('custom places survive backup, local persistence, JSON serialization, and a fresh adventure', () => {
  const state = fixtureState();
  const result = addDestination(state, familyDestination({ country: 'Canada', region: 'world', lat: 49, lon: -123 }));
  visitDestination(state, result.destination.id);
  const restored = importState(exportState(state));
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.state.settings.customDestinations, state.settings.customDestinations);
  assert.deepEqual(restored.state.passport, state.passport);
  assert.equal(validateState(JSON.parse(JSON.stringify(state))), true);
  let stored;
  const storage = { getItem: () => stored, setItem: (key, value) => { stored = value; } };
  saveState(state, storage);
  assert.deepEqual(loadState(storage), state);
  resetAdventure(state);
  assert.equal(state.stars, 0);
  assert.equal(state.passport.length, 0);
  assert.equal(getDestinations(state).at(-1).id, result.destination.id);
});

test('legacy states and their undo snapshots load with an empty custom destination catalog', () => {
  const legacy = fixtureState();
  adjustPoints(legacy, { amount: 10, note: 'A little kindness' });
  delete legacy.settings.customDestinations;
  delete legacy.undo.settings.customDestinations;
  assert.equal(validateState(legacy), true);
  const loaded = loadState({ getItem: () => JSON.stringify(legacy) });
  assert.deepEqual(loaded.settings.customDestinations, []);
  assert.deepEqual(loaded.undo.settings.customDestinations, []);
  assert.equal(importState(legacy).ok, true);
  assert.deepEqual(importState(legacy).state.settings.customDestinations, []);
});

test('invalid destination details cannot alter stars, settings, or the pending undo', () => {
  const state = fixtureState();
  adjustPoints(state, { amount: 10, note: 'Helping out' });
  const before = JSON.stringify(state);
  const invalid = [
    null, {}, { name: '' }, { country: '' }, { name: 'n'.repeat(61) }, { country: 'c'.repeat(81) },
    { emoji: {} }, { emoji: 'x'.repeat(17) }, { fact: 'f'.repeat(251) },
    { lat: NaN }, { lon: Infinity }, { lat: 91 }, { lon: -181 }, { lat: '' }, { cost: '' },
    { cost: 0 }, { cost: -1 }, { cost: 1.5 }, { cost: 10001 }, { region: 'mars' },
    { lat: 64, lon: -149, region: 'us' }, { lat: 21, lon: -157, region: 'us' },
  ];
  for (const patch of invalid) {
    const details = patch === null ? null : patch === invalid[1] ? {} : familyDestination(patch);
    assert.equal(addDestination(state, details).ok, false, JSON.stringify(patch));
    assert.equal(JSON.stringify(state), before);
  }
  assert.equal(addDestination(state, familyDestination({ lat: 64, lon: -149, region: 'world' })).ok, true);
});

test('destination IDs are unique and passport and history references must exist in each snapshot', () => {
  const state = fixtureState();
  const { destination } = addDestination(state, familyDestination());
  const clone = () => JSON.parse(JSON.stringify(state));
  const duplicate = clone();
  duplicate.settings.customDestinations.push({ ...destination });
  assert.equal(validateState(duplicate), false);
  const collision = clone();
  collision.settings.customDestinations[0].id = 'holmes-beach';
  assert.equal(validateState(collision), false);
  const malformed = clone();
  malformed.settings.customDestinations[0].id = '<script>';
  assert.equal(importState(malformed).ok, false);
  const unknownStamp = clone();
  unknownStamp.passport = [{ destinationId: 'not-registered', date: localDate(), cost: 1 }];
  assert.equal(validateState(unknownStamp), false);
  visitDestination(state, destination.id);
  const unknownHistory = clone();
  unknownHistory.history[0].destinationId = 'not-registered';
  assert.equal(validateState(unknownHistory), false);
  const unknownUndo = clone();
  unknownUndo.undo.passport = [{ destinationId: 'not-registered', date: localDate(), cost: 1 }];
  assert.equal(validateState(unknownUndo), false);
  const before = JSON.stringify(state);
  assert.equal(updateSettings(state, { customDestinations: [] }).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('adding a place preserves an existing star undo and keeps the addition after undo', () => {
  const state = fixtureState();
  adjustPoints(state, { amount: 10, note: 'Kind hands' });
  const undoStars = state.undo.stars;
  const undoHistory = JSON.stringify(state.undo.history);
  const { destination } = addDestination(state, familyDestination());
  assert.equal(state.undo.stars, undoStars);
  assert.equal(JSON.stringify(state.undo.history), undoHistory);
  assert.equal(state.undo.settings.customDestinations[0].id, destination.id);
  assert.equal(undoLastAction(state).ok, true);
  assert.equal(state.stars, 120);
  assert.equal(state.settings.customDestinations[0].id, destination.id);
  assert.equal(validateState(state), true);
});

test('the family catalog limit rejects a further destination without changes', () => {
  const state = fixtureState();
  const destinations = Array.from({ length: 100 }, (_, index) => ({ ...familyDestination(), id: `custom-${index}` }));
  assert.equal(updateSettings(state, { customDestinations: destinations }).ok, true);
  assert.equal(state.settings.customDestinations.length, 100);
  const before = JSON.stringify(state);
  assert.equal(addDestination(state, familyDestination()).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('a new adventure always starts with no grades, stars, history, or streak', () => {
  const state = createInitialState();
  assert.equal(state.demo, false);
  assert.equal(state.stars, 0);
  assert.deepEqual(state.behaviors, []);
  assert.deepEqual(state.history, []);
  assert.equal(getStreak(state), 0);
  assert.equal(loadState({ getItem: () => null }).stars, 0);
});

test('legacy sample grades and all 120 sample stars are removed and persisted once', () => {
  let stored = JSON.stringify(createInitialState({ demo: true }));
  let writes = 0;
  const storage = { getItem: () => stored, setItem: (key, value) => { stored = value; writes++; } };
  const state = loadState(storage);
  assert.equal(state.demo, false);
  assert.equal(state.stars, 0);
  assert.deepEqual(state.behaviors, []);
  assert.deepEqual(state.history, []);
  assert.equal(state.undo, null);
  assert.equal(writes, 1);
  assert.deepEqual(loadState(storage), state);
  assert.equal(writes, 1);
  assert.equal(importState(JSON.stringify(createInitialState({ demo: true }))).state.stars, 0);
});

test('migration preserves genuine actions and family places after sample-funded spending', () => {
  const legacy = createInitialState({ demo: true });
  const { destination } = addDestination(legacy, familyDestination());
  visitDestination(legacy, destination.id);
  const realDate = recentSchoolDates(4)[0];
  recordBehavior(legacy, { color: 'green', date: realDate, note: 'Teacher really gave this green' });
  adjustPoints(legacy, { amount: 15, note: 'Parent really awarded these stars' });
  const { state, changed } = normalizeAdventureState(legacy);
  assert.equal(changed, true);
  assert.equal(state.stars, 25);
  assert.equal(state.behaviors.length, 1);
  assert.equal(state.behaviors[0].date, realDate);
  assert.equal(state.behaviors[0].points, 10);
  assert.equal(state.history.some(item => item.id.startsWith('demo-')), false);
  assert.equal(state.history.some(item => item.note === 'Parent really awarded these stars'), true);
  assert.equal(state.settings.customDestinations[0].id, destination.id);
  assert.equal(state.passport[0].destinationId, destination.id);
  assert.equal(state.undo, null);
  assert.equal(validateState(state), true);
  assert.equal(normalizeAdventureState(state).changed, false);
});

test('a genuine green following fabricated demo greens loses only the fake streak bonus', () => {
  const legacy = createInitialState({ demo: true });
  const dates = recentSchoolDates(5);
  legacy.behaviors.forEach((entry, index) => { entry.date = dates[index]; entry.id = `demo-${entry.date}`; });
  legacy.history = legacy.behaviors.map(entry => ({ ...entry, type: 'behavior', title: 'A green day!', createdAt: `${entry.date}T15:00:00` })).reverse();
  recordBehavior(legacy, { color: 'green', date: dates[3], note: 'Actual teacher grade' });
  assert.equal(legacy.behaviors.find(item => item.date === dates[3]).points, 20);
  const { state } = normalizeAdventureState(legacy);
  assert.equal(state.stars, 10);
  assert.equal(state.behaviors.length, 1);
  assert.equal(state.behaviors[0].multiplier, 1);
  assert.equal(state.behaviors[0].streak, 1);
  assert.equal(state.behaviors[0].points, 10);
});

test('a real non-demo adventure is preserved even when an ID resembles a sample ID', () => {
  const state = fixtureState();
  state.behaviors[0].id = 'demo-parent-entered';
  const corresponding = state.history.find(item => item.type === 'behavior' && item.date === state.behaviors[0].date);
  corresponding.id = 'demo-parent-entered';
  const normalized = normalizeAdventureState(state);
  assert.equal(normalized.changed, false);
  assert.deepEqual(normalized.state, state);
});

test('any older school grade can be corrected and undo restores grades, points, and streaks', () => {
  const state = createInitialState();
  const dates = recentSchoolDates(5);
  for (const date of dates) recordBehavior(state, { color: 'green', date });
  assert.equal(state.stars, 90);
  const before = JSON.stringify({ ...state, undo: null });
  const result = updateBehavior(state, { date: dates[0], color: 'yellow', note: 'Corrected from the teacher’s sheet' });
  assert.equal(result.ok, true);
  assert.equal(result.points, -30);
  assert.equal(state.stars, 60);
  assert.equal(state.behaviors.find(item => item.date === dates[0]).color, 'yellow');
  assert.equal(state.behaviors.find(item => item.date === dates[4]).multiplier, 2);
  assert.equal(state.history[0].title, 'Corrected a school grade');
  assert.equal(state.history[0].points, 0);
  assert.equal(state.history.find(item => item.type === 'behavior' && item.date === dates[0]).color, 'yellow');
  assert.equal(validateState(state), true);
  assert.equal(undoLastAction(state).ok, true);
  assert.equal(JSON.stringify(state), before);
});

test('removing an older grade leaves an empty day and recalculates bonuses without refunding purchases', () => {
  const state = createInitialState();
  const dates = recentSchoolDates(5);
  for (const date of dates) recordBehavior(state, { color: 'green', date });
  redeemReward(state, 'park-adventure');
  assert.equal(state.stars, 10);
  const result = removeBehavior(state, dates[1]);
  assert.equal(result.ok, true);
  assert.equal(state.stars, 0);
  assert.equal(state.behaviors.some(item => item.date === dates[1]), false);
  assert.equal(state.history.some(item => item.type === 'behavior' && item.date === dates[1]), false);
  assert.equal(state.redemptions.length, 1);
  assert.equal(state.redemptions[0].cost, 80);
  const purchase = state.history.find(item => item.type === 'reward');
  assert.equal(purchase.requestedPoints, -80);
  assert.equal(purchase.points, -50);
  assert.equal(state.history[0].points, 0);
  assert.equal(validateState(state), true);
  undoLastAction(state);
  assert.equal(state.stars, 10);
  assert.equal(state.behaviors.length, 5);
  assert.equal(state.redemptions.length, 1);
});

test('corrections retain historical face values and repeated saves never add stars twice', () => {
  const state = createInitialState();
  const dates = recentSchoolDates(3);
  recordBehavior(state, { color: 'green', date: dates[0] });
  updateSettings(state, { greenPoints: 20 });
  recordBehavior(state, { color: 'green', date: dates[1] });
  recordBehavior(state, { color: 'green', date: dates[2] });
  assert.equal(state.stars, 70);
  updateBehavior(state, { date: dates[0], color: 'yellow' });
  assert.equal(state.stars, 40);
  assert.equal(state.behaviors[1].basePoints, 20);
  assert.equal(state.behaviors[2].basePoints, 20);
  updateBehavior(state, { date: dates[0], color: 'green' });
  assert.equal(state.stars, 80);
  updateBehavior(state, { date: dates[0], color: 'green', note: 'Only the note changed' });
  assert.equal(state.stars, 80);
  assert.equal(state.behaviors.length, 3);
  assert.equal(state.history.filter(item => item.type === 'behavior').length, 3);
});

test('invalid correction/removal requests leave the entire adventure unchanged', () => {
  const state = fixtureState();
  const before = JSON.stringify(state);
  assert.equal(updateBehavior(state, { date: state.behaviors[0].date, color: '' }).ok, false);
  assert.equal(updateBehavior(state, { date: '2000-01-03', color: 'green' }).ok, false);
  assert.equal(removeBehavior(state, '2000-01-03').ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('resetting all faces preserves genuine bonuses, trips, rewards and settings and is undoable', () => {
  const state = createInitialState();
  updateSettings(state, { childName: 'Explorer' });
  const { destination } = addDestination(state, familyDestination());
  adjustPoints(state, { amount: 200, note: 'Parent-approved bonus' });
  for (const date of recentSchoolDates(5)) recordBehavior(state, { color: 'green', date });
  visitDestination(state, destination.id);
  redeemReward(state, 'movie-night');
  assert.equal(state.stars, 215);
  const before = JSON.stringify({ ...state, undo: null });
  const result = resetFaces(state);
  assert.equal(result.ok, true);
  assert.equal(result.points, -90);
  assert.equal(state.stars, 125);
  assert.deepEqual(state.behaviors, []);
  assert.equal(state.history.some(item => item.type === 'behavior'), false);
  assert.equal(getStreak(state), 0);
  assert.equal(state.history[0].title, 'Reset all school grades');
  assert.equal(state.history[0].points, 0);
  assert.equal(state.history.find(item => item.note === 'Parent-approved bonus').points, 200);
  assert.equal(state.passport[0].destinationId, destination.id);
  assert.equal(state.redemptions[0].rewardId, 'movie-night');
  assert.equal(state.settings.childName, 'Explorer');
  assert.equal(state.settings.customDestinations[0].id, destination.id);
  assert.equal(validateState(state), true);
  assert.equal(undoLastAction(state).ok, true);
  assert.equal(JSON.stringify(state), before);
});

test('clearing red faces never refunds stars, including after later check-ins replay the ledger', () => {
  const state = createInitialState();
  const dates = recentSchoolDates(2);
  adjustPoints(state, { amount: 20, note: 'Earned family bonus' });
  recordBehavior(state, { color: 'red', date: dates[0] });
  assert.equal(state.stars, 15);
  assert.equal(resetFaces(state).ok, true);
  assert.equal(state.stars, 15);
  assert.equal(state.history.find(item => item.title === 'Preserved star jar after grade reset').points, -5);
  recordBehavior(state, { color: 'green', date: dates[1] });
  assert.equal(state.stars, 25);
  assert.equal(state.behaviors.length, 1);
  assert.equal(state.behaviors[0].streak, 1);
  assert.equal(validateState(state), true);
});

test('full adventure reset clears faces, stars, receipts and stamps while keeping family settings and places', () => {
  const state = fixtureState();
  updateSettings(state, { childName: 'Our explorer', greenPoints: 15 });
  const { destination } = addDestination(state, familyDestination());
  visitDestination(state, destination.id);
  redeemReward(state, 'movie-night');
  assert.equal(resetAdventure(state).ok, true);
  assert.equal(state.stars, 0);
  assert.deepEqual(state.behaviors, []);
  assert.deepEqual(state.history, []);
  assert.deepEqual(state.passport, []);
  assert.deepEqual(state.redemptions, []);
  assert.equal(state.undo, null);
  assert.equal(state.settings.childName, 'Our explorer');
  assert.equal(state.settings.greenPoints, 15);
  assert.equal(state.settings.customDestinations[0].id, destination.id);
});
