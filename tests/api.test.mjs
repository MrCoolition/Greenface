import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, normalizeFamilyCode, hashPassword, verifyPassword, createSession, verifySession, validateOrigin, validateState, handleRequest, normalizeCloudRow } from '../server/handler.js';
import { createInitialState, addDestination, getDestinations, visitDestination, adjustPoints, setDestinationCost } from '../src/lib/model.js';
import { fetchCloudState, saveCloudState, CloudError } from '../src/lib/cloud.js';
import { GET as getStatus } from '../api/status.js';

const secret = 'a-secure-test-session-secret-at-least-32-characters';
const familyId = 'a031f0e7-3145-4124-b54a-923f842584ad';
const minimalState = () => ({ ...createInitialState({ demo: false }), stars: 25 });

test('configuration accepts the existing Neon env key and rejects missing signing secrets', () => {
  assert.equal(configuration({ neon_connect: 'postgresql://example', SESSION_SECRET: secret }).configured, true);
  assert.equal(configuration({ DATABASE_URL: 'postgresql://example' }).configured, false);
  assert.equal(configuration({ DATABASE_URL: 'https://not-postgres', SESSION_SECRET: secret }).configured, false);
});

test('family codes normalize and cannot inject delimiters or SQL', () => {
  assert.equal(normalizeFamilyCode(' green-team '), 'GREEN-TEAM');
  for (const value of ['abc', '', "abc';DROP TABLE", '<script>', null, 'a'.repeat(25)]) assert.throws(() => normalizeFamilyCode(value));
});

test('password hashing is salted and verifies only matching passwords', async () => {
  const a = await hashPassword('my parent passphrase');
  const b = await hashPassword('my parent passphrase');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('my parent passphrase', a), true);
  assert.equal(await verifyPassword('wrong password', a), false);
  assert.equal(await verifyPassword('anything', 'bad hash'), false);
});

test('signed sessions reject tampering, expiry, another secret, malformed payloads', () => {
  const time = Date.UTC(2026, 10, 12, 12);
  const token = createSession(familyId, secret, time);
  assert.equal(verifySession(token, secret, time).id, familyId);
  assert.equal(verifySession(token, secret, time + 8 * 60 * 60 * 1000), null);
  assert.equal(verifySession(token + 'x', secret, time), null);
  assert.equal(verifySession('x.' + token.split('.')[1], secret, time), null);
  assert.equal(verifySession(token, 'different-signing-secret-with-32-characters', time), null);
  assert.equal(verifySession(null, secret, time), null);
  assert.equal(verifySession('a'.repeat(2000), secret, time), null);
});

test('mutations reject cross-origin CSRF and require the app header for originless callers', () => {
  const req = headers => new Request('https://greenface.example/api/state', { method: 'PUT', headers });
  assert.doesNotThrow(() => validateOrigin(req({ Origin: 'https://greenface.example' })));
  assert.doesNotThrow(() => validateOrigin(req({ 'X-Greenface-Request': '1' })));
  assert.throws(() => validateOrigin(req({ Origin: 'https://attacker.example', 'X-Greenface-Request': '1' })));
  assert.throws(() => validateOrigin(req({ Origin: 'https://greenface.example', 'Sec-Fetch-Site': 'cross-site' })));
  assert.throws(() => validateOrigin(req({})));
});

test('state validation rejects corrupt balances, missing collections and excessive history', () => {
  assert.equal(validateState(minimalState()).stars, 25);
  for (const stars of [-1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => validateState({ ...minimalState(), stars }));
  assert.throws(() => validateState({ ...minimalState(), settings: {} }));
  assert.throws(() => validateState({ ...minimalState(), history: [null] }));
  assert.throws(() => validateState({ ...minimalState(), passport: Array.from({ length: 5001 }, () => ({})) }));
});

test('status needs no DB and unconfigured state never returns family data', async () => {
  const previous = { DATABASE_URL: process.env.DATABASE_URL, POSTGRES_URL: process.env.POSTGRES_URL, neon_connect: process.env.neon_connect, SESSION_SECRET: process.env.SESSION_SECRET };
  for (const key of Object.keys(previous)) delete process.env[key];
  try {
    const health = await handleRequest(new Request('https://greenface.example/api/status'));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).configured, false);
    const state = await handleRequest(new Request('https://greenface.example/api/state'));
    assert.equal(state.status, 503);
    assert.equal((await state.json()).code, 'NOT_CONFIGURED');
  } finally {
    for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('authenticated state endpoint rejects unsigned reads before accessing Postgres', async () => {
  const oldUrl = process.env.DATABASE_URL;
  const oldSecret = process.env.SESSION_SECRET;
  process.env.DATABASE_URL = 'postgresql://example';
  process.env.SESSION_SECRET = secret;
  try {
    const result = await handleRequest(new Request('https://greenface.example/api/state'));
    assert.equal(result.status, 401);
    assert.equal((await result.json()).code, 'SIGNED_OUT');
  } finally {
    oldUrl === undefined ? delete process.env.DATABASE_URL : process.env.DATABASE_URL = oldUrl;
    oldSecret === undefined ? delete process.env.SESSION_SECRET : process.env.SESSION_SECRET = oldSecret;
  }
});

test('production route wrapper exports the working Web Request handler', async () => {
  const result = await getStatus(new Request('https://greenface.example/api/status'));
  assert.equal(result.status, 200);
  assert.equal(typeof (await result.json()).configured, 'boolean');
  assert.equal(result.headers.get('cache-control'), 'no-store, max-age=0');
});

test('cloud client refuses malformed successful responses before they reach the UI', async () => {
  const originalFetch = globalThis.fetch;
  try {
    const broken = minimalState();
    broken.settings.customRewards = [null];
    globalThis.fetch = async () => Response.json({ state: broken, revision: 0, familyCode: 'HAPPY-FAMILY' });
    await assert.rejects(fetchCloudState(), error => error instanceof CloudError && error.code === 'INVALID_CLOUD_STATE');
    globalThis.fetch = async () => Response.json({ state: minimalState(), revision: '0', familyCode: 'HAPPY-FAMILY' });
    await assert.rejects(fetchCloudState(), error => error.code === 'INVALID_CLOUD_STATE');
  } finally { globalThis.fetch = originalFetch; }
});

test('cloud client preserves conflict classification and uses same-origin credentials', async () => {
  const originalFetch = globalThis.fetch;
  let options;
  try {
    globalThis.fetch = async (_url, value) => {
      options = value;
      return Response.json({ error: 'Another device updated this adventure.', code: 'CONFLICT' }, { status: 409 });
    };
    await assert.rejects(saveCloudState(minimalState(), 7), error => error.status === 409 && error.code === 'CONFLICT');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['X-Greenface-Request'], '1');
    assert.equal(options.headers['X-Greenface-Controls'], 'pin-per-action-v1');
    assert.equal(JSON.parse(options.body).revision, 7);
    assert.equal(JSON.parse(options.body).password, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('custom destinations survive the same JSON serialization used by Neon and the cloud client', async () => {
  const state = createInitialState({ demo: false });
  adjustPoints(state, { amount: 30, note: 'Parent-approved kindness bonus' });
  const added = addDestination(state, { name: 'Our favorite park', country: 'United States', emoji: '🌳', cost: 15, lat: 40.7, lon: -74, region: 'us', fact: 'Our family loves finding leaves here.' });
  assert.equal(added.ok, true);
  const destination = getDestinations(state).find(item => item.name === 'Our favorite park');
  assert.equal(visitDestination(state, destination.id).ok, true);
  assert.doesNotThrow(() => validateState(state));
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const saved = JSON.parse(options.body);
      return Response.json({ state: JSON.parse(JSON.stringify(saved.state)), revision: saved.revision + 1, familyCode: 'HAPPY-FAMILY' });
    };
    const restored = await saveCloudState(state, 4);
    assert.equal(restored.revision, 5);
    assert.equal(restored.state.settings.customDestinations[0].lat, 40.7);
    assert.equal(restored.state.passport[0].destinationId, destination.id);
    assert.equal(restored.state.stars, 15);
    const corrupt = JSON.parse(JSON.stringify(state));
    corrupt.settings.customDestinations[0].lat = 'north';
    assert.throws(() => validateState(corrupt));
    globalThis.fetch = async () => Response.json({ state: corrupt, revision: 5, familyCode: 'HAPPY-FAMILY' });
    await assert.rejects(fetchCloudState(), error => error.code === 'INVALID_CLOUD_STATE');
  } finally { globalThis.fetch = originalFetch; }
});

test('cloud migration persists the corrected state with a revision lease', async () => {
  const legacy = createInitialState({ demo: true });
  const corrected = createInitialState({ demo: false });
  const row = { id: familyId, code: 'HAPPY-FAMILY', revision: 3, state: legacy };
  let writes = 0;
  const sql = async (strings, ...values) => {
    assert.match(strings.join('?'), /UPDATE greenface_families/);
    assert.equal(values[1], familyId);
    assert.equal(values[2], 3);
    writes++;
    return [{ ...row, state: JSON.parse(values[0]), revision: 4 }];
  };
  const migrated = await normalizeCloudRow(sql, row, state => ({ state: state.demo ? corrected : state, changed: state.demo }));
  assert.equal(writes, 1);
  assert.equal(migrated.revision, 4);
  assert.equal(migrated.state.stars, 0);
  assert.equal(migrated.state.behaviors.length, 0);
  assert.equal(row.state.demo, true, 'the supplied row is not mutated before its CAS succeeds');
});

test('cloud migration respects another device winning the revision race', async () => {
  const row = { id: familyId, code: 'HAPPY-FAMILY', revision: 3, state: createInitialState({ demo: true }) };
  const corrected = createInitialState({ demo: false });
  adjustPoints(corrected, { amount: 17, note: 'Real kindness recorded on another device' });
  const latest = { ...row, revision: 4, state: corrected };
  let writes = 0;
  const sql = async strings => {
    if (strings.join('?').includes('UPDATE')) { writes++; return []; }
    return [latest];
  };
  const migrated = await normalizeCloudRow(sql, row, state => ({ state: state.demo ? createInitialState({ demo: false }) : state, changed: state.demo }));
  assert.equal(writes, 1);
  assert.equal(migrated.revision, 4);
  assert.equal(migrated.state.stars, 17, 'a competing genuine award is never replaced by an older correction');
});

test('real legacy cloud samples are removed while genuine awards and family destinations remain', async () => {
  const legacy = createInitialState({ demo: true });
  adjustPoints(legacy, { amount: 25, note: 'A real parent-approved kindness bonus' });
  const added = addDestination(legacy, { name: 'Family garden', country: 'United States', cost: 15, lat: 40.7, lon: -74, region: 'us', emoji: '🌷' });
  assert.equal(added.ok, true);
  visitDestination(legacy, added.destination.id);
  const row = { id: familyId, code: 'HAPPY-FAMILY', revision: 7, state: legacy };
  let writes = 0;
  const sql = async (strings, ...values) => {
    assert.match(strings.join('?'), /UPDATE greenface_families/);
    writes++;
    return [{ ...row, state: JSON.parse(values[0]), revision: 8 }];
  };
  const migrated = await normalizeCloudRow(sql, row);
  assert.equal(writes, 1);
  assert.equal(migrated.state.demo, false);
  assert.equal(migrated.state.stars, 10, 'only the genuine 25-star award less its 15-star visit remains');
  assert.equal(migrated.state.behaviors.length, 0);
  assert.equal(migrated.state.history.length, 2);
  assert.equal(migrated.state.history.some(item => item.id.startsWith('demo-')), false);
  assert.equal(migrated.state.undo, null, 'undo cannot restore the unearned sample grades');
  assert.equal(migrated.state.passport[0].destinationId, added.destination.id);
  assert.equal(migrated.state.settings.customDestinations[0].name, 'Family garden');
  const again = await normalizeCloudRow(sql, migrated);
  assert.equal(again.revision, 8);
  assert.equal(writes, 1, 'a second read does not repeat the correction or charge stars again');
});

test('Postgres JSONB key ordering does not cause repeated cloud migrations or revisions', async () => {
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, reorder(value[key])])) : value;
  const state = createInitialState({ demo: false });
  adjustPoints(state, { amount: 12, note: 'A real parent-approved award' });
  const row = { id: familyId, code: 'HAPPY-FAMILY', revision: 2, state: reorder(state) };
  const sql = async () => { assert.fail('a semantically unchanged JSONB state must never be written during a read'); };
  const result = await normalizeCloudRow(sql, row);
  assert.equal(result.revision, 2);
  assert.equal(result.state.stars, 12);
});

test('old unlocked tabs cannot save cloud progress until refreshed to current parent controls', async () => {
  const oldUrl = process.env.DATABASE_URL;
  const oldSecret = process.env.SESSION_SECRET;
  process.env.DATABASE_URL = 'postgresql://example';
  process.env.SESSION_SECRET = secret;
  try {
    const makeRequest = version => new Request('https://greenface.example/api/state', {
      method: 'PUT',
      headers: {
        Origin: 'https://greenface.example',
        'Content-Type': 'application/json',
        Cookie: `greenface_session=${createSession(familyId, secret)}`,
        ...(version ? { 'X-Greenface-Controls': version } : {}),
      },
      body: JSON.stringify({ state: minimalState(), revision: 0 }),
    });
    for (const version of [undefined, 'old-unlocked-controls']) {
      const response = await handleRequest(makeRequest(version));
      assert.equal(response.status, 426);
      const data = await response.json();
      assert.equal(data.code, 'UPDATE_REQUIRED');
      assert.equal(data.error, 'Refresh Greenface to use the new parent controls. Nothing was changed.');
    }
  } finally {
    oldUrl === undefined ? delete process.env.DATABASE_URL : process.env.DATABASE_URL = oldUrl;
    oldSecret === undefined ? delete process.env.SESSION_SECRET : process.env.SESSION_SECRET = oldSecret;
  }
});

test('the current controls header does not bypass family session authentication', async () => {
  const oldUrl = process.env.DATABASE_URL;
  const oldSecret = process.env.SESSION_SECRET;
  process.env.DATABASE_URL = 'postgresql://example';
  process.env.SESSION_SECRET = secret;
  try {
    const response = await handleRequest(new Request('https://greenface.example/api/state', {
      method: 'PUT',
      headers: { Origin: 'https://greenface.example', 'Content-Type': 'application/json', 'X-Greenface-Controls': 'pin-per-action-v1' },
      body: JSON.stringify({ state: minimalState(), revision: 0 }),
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'SIGNED_OUT');
  } finally {
    oldUrl === undefined ? delete process.env.DATABASE_URL : process.env.DATABASE_URL = oldUrl;
    oldSecret === undefined ? delete process.env.SESSION_SECRET : process.env.SESSION_SECRET = oldSecret;
  }
});

test('100,000-star travel overrides and custom visit receipts survive Neon JSONB and cloud responses', async () => {
  const state = createInitialState({ demo: false });
  for (let i = 0; i < 10; i++) adjustPoints(state, { amount: 10_000, note: `Parent-approved long-term travel award ${i + 1}` });
  const added = addDestination(state, { name: 'Our big family adventure', country: 'United States', emoji: '🚂', cost: 1500, lat: 40.7, lon: -74, region: 'us' });
  assert.equal(added.ok, true);
  assert.equal(setDestinationCost(state, 'yellowstone', 100_000).ok, true);
  assert.equal(setDestinationCost(state, added.destination.id, 100_000).ok, true);
  assert.equal(visitDestination(state, added.destination.id).ok, true);
  assert.equal(state.stars, 0);
  assert.equal(state.passport[0].cost, 100_000);
  assert.doesNotThrow(() => validateState(state));

  const originalFetch = globalThis.fetch;
  try {
    const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, reorder(value[key])])) : value;
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(options.headers['X-Greenface-Controls'], 'pin-per-action-v1');
      return Response.json({ state: reorder(body.state), revision: body.revision + 1, familyCode: 'HAPPY-FAMILY' });
    };
    const restored = await saveCloudState(state, 8);
    assert.equal(restored.revision, 9);
    assert.equal(restored.state.settings.destinationCosts.yellowstone, 100_000);
    assert.equal(restored.state.settings.destinationCosts[added.destination.id], 100_000);
    assert.equal(restored.state.passport[0].cost, 100_000);
    assert.equal(getDestinations(restored.state).find(item => item.id === 'yellowstone').cost, 100_000);
    assert.equal(getDestinations(restored.state).find(item => item.id === added.destination.id).cost, 100_000);

    const invalid = JSON.parse(JSON.stringify(restored.state));
    invalid.settings.destinationCosts.yellowstone = 100_001;
    assert.throws(() => validateState(invalid));
    globalThis.fetch = async () => Response.json({ state: invalid, revision: 9, familyCode: 'HAPPY-FAMILY' });
    await assert.rejects(fetchCloudState(), error => error.code === 'INVALID_CLOUD_STATE');
  } finally { globalThis.fetch = originalFetch; }
});
