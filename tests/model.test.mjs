import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, recordBehavior, adjustPoints, redeemReward, visitDestination, undoLastAction, updateSettings, resetAdventure, getStreak, getMultiplier, saveState, loadState, localDate, STORAGE_KEY, exportState, importState, validateState } from '../src/lib/model.js';

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
  const state = createInitialState();
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
  const state = createInitialState();
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
  const state = createInitialState();
  assert.equal(saveState(state, storage).ok, true);
  assert.deepEqual(loadState(storage), state);
  map.set(STORAGE_KEY, '{broken');
  assert.equal(loadState(storage).stars, 120);
  assert.equal(saveState(state, { setItem() { throw Error('quota'); } }).ok, false);
});

test('custom rewards can be created and redeemed, while invalid rewards are rejected', () => {
  const state = createInitialState();
  assert.equal(updateSettings(state, { customRewards: [{ id: 'custom-1', name: 'Board game', cost: 25, emoji: '🎲' }] }).ok, true);
  assert.equal(redeemReward(state, 'custom-1').ok, true);
  assert.equal(state.stars, 95);
  assert.equal(updateSettings(state, { customRewards: [{ id: 'movie-night', name: 'Duplicate', cost: 1 }] }).ok, false);
  assert.equal(state.settings.customRewards[0].name, 'Board game');
});

test('backups round-trip without undo state and reject malformed records', () => {
  const state = createInitialState();
  redeemReward(state, 'ice-cream');
  const result = importState(exportState(state));
  assert.equal(result.ok, true);
  assert.equal(result.state.stars, 90);
  assert.equal(result.state.undo, null);
  assert.equal(importState('{bad').ok, false);
  const invalid = createInitialState();
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
    state => { state.undo = createInitialState(); state.undo.undo = createInitialState(); },
    state => { state.settings.childName = ''; },
    state => { state.settings.greenPoints = -1; },
    state => { state.settings.redPoints = 1; },
  ];
  for (const corrupt of corruptions) {
    const state = createInitialState();
    corrupt(state);
    assert.equal(validateState(state), false, corrupt.toString());
    assert.equal(importState(JSON.stringify(state)).ok, false, corrupt.toString());
  }
});

test('backup files omit PINs and session credentials and importing clears legacy PIN', () => {
  const state = createInitialState();
  state.settings.parentPin = '1234';
  state.sessionToken = 'must-not-leak';
  state.settings.password = 'must-not-leak';
  const backup = JSON.parse(exportState(state));
  assert.equal('sessionToken' in backup, false);
  assert.equal('password' in backup.settings, false);
  assert.equal('parentPin' in backup.settings, false);
  assert.equal(importState(backup).ok, true);
  const legacy = createInitialState();
  legacy.settings.parentPin = '1234';
  assert.equal(importState(legacy).state.settings.parentPin, '');
});

test('invalid custom reward patches never throw or partially alter settings', () => {
  const state = createInitialState();
  const before = JSON.stringify(state.settings);
  assert.equal(updateSettings(state, { childName: 'Oops', customRewards: {}, goalRewardId: 'movie-night' }).ok, false);
  assert.equal(JSON.stringify(state.settings), before);
});

test('backdated check-ins do not retroactively change previously awarded stars', () => {
  const state = createInitialState({ demo: false });
  const dates = recentSchoolDates(4);
  recordBehavior(state, { color: 'green', date: dates[0] });
  recordBehavior(state, { color: 'green', date: dates[2] });
  assert.equal(state.stars, 20);
  recordBehavior(state, { color: 'green', date: dates[1] });
  assert.equal(state.stars, 30);
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
