import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, normalizeFamilyCode, hashPassword, verifyPassword, createSession, verifySession, validateOrigin, validateState, handleRequest } from '../server/handler.js';
import { createInitialState } from '../src/lib/model.js';
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
    assert.equal(JSON.parse(options.body).revision, 7);
    assert.equal(JSON.parse(options.body).password, undefined);
  } finally { globalThis.fetch = originalFetch; }
});
