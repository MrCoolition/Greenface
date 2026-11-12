import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { validateAdventureState } from '../src/lib/stateValidation.js';
import * as adventureModel from '../src/lib/model.js';

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = 'greenface_session';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 1_500_000;
let schemaPromise;
let sqlPromise;

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

export function configuration(env = process.env) {
  const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || env.neon_connect || '';
  const secret = env.SESSION_SECRET || '';
  return { databaseUrl, secret, configured: /^postgres(?:ql)?:\/\//i.test(databaseUrl) && secret.length >= 32 };
}

export function normalizeFamilyCode(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'INVALID_CODE', 'Choose a family code with 4–24 letters, numbers, or dashes.');
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{3,23}$/.test(code)) throw new ApiError(400, 'INVALID_CODE', 'Choose a family code with 4–24 letters, numbers, or dashes.');
  return code;
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = await scrypt(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(encoded)) return false;
  const [salt, expected] = encoded.split(':');
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function createSession(familyId, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: familyId, exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 1024 || secret.length < 32) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const expected = createHmac('sha256', secret).update(parts[0]).digest();
  const actual = Buffer.from(parts[1], 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!/^[a-f0-9-]{36}$/i.test(payload.id) || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch { return null; }
}

export function validateOrigin(request) {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new ApiError(403, 'INVALID_ORIGIN', 'Open Greenface directly to make changes.');
  }
  // A custom header cannot be sent cross-origin without a successful CORS preflight.
  if (!origin && request.headers.get('x-greenface-request') !== '1') {
    throw new ApiError(403, 'INVALID_ORIGIN', 'Please use the Greenface app to make changes.');
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateState(state) {
  if (!validateAdventureState(state)) {
    throw new ApiError(400, 'INVALID_STATE', 'This adventure could not be saved. Refresh and try again.');
  }
  if (Buffer.byteLength(JSON.stringify(state), 'utf8') > MAX_BODY_BYTES - 5000) {
    throw new ApiError(413, 'TOO_LARGE', 'This adventure is too large to save. Export a backup and contact your grown-up.');
  }
  return state;
}

async function readBody(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'Send JSON to this endpoint.');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > MAX_BODY_BYTES) throw new ApiError(413, 'TOO_LARGE', 'This request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'INVALID_JSON', 'A JSON request body is required.');
  const chunks = [];
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'TOO_LARGE', 'This request is too large.'); }
    chunks.push(Buffer.from(value));
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!isObject(body)) throw new Error('object required');
    return body;
  } catch { throw new ApiError(400, 'INVALID_JSON', 'The request body must be a JSON object.'); }
}

async function database() {
  if (!sqlPromise) sqlPromise = import('@neondatabase/serverless').then(({ neon }) => neon(configuration().databaseUrl)).catch(error => { sqlPromise = null; throw error; });
  const sql = await sqlPromise;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS greenface_families (
        id UUID PRIMARY KEY,
        code VARCHAR(24) NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        state JSONB NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS greenface_auth_limits (
        key TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL DEFAULT 1,
        window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
    })().catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
  return sql;
}

async function rateLimit(sql, request, secret) {
  const ip = (request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const key = createHmac('sha256', secret).update(`account:${ip}`).digest('hex');
  const [row] = await sql`INSERT INTO greenface_auth_limits (key, attempts, window_start)
    VALUES (${key}, 1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN greenface_auth_limits.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE greenface_auth_limits.attempts + 1 END,
      window_start = CASE WHEN greenface_auth_limits.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE greenface_auth_limits.window_start END
    RETURNING attempts`;
  if (row.attempts > 15) throw new ApiError(429, 'RATE_LIMITED', 'Too many tries. Take a little break and try again in 15 minutes.');
}

function sessionFrom(request, secret) {
  const raw = (request.headers.get('cookie') || '').split(';').find(part => part.trim().startsWith(`${COOKIE_NAME}=`));
  const token = raw?.trim().slice(COOKIE_NAME.length + 1);
  const session = verifySession(token, secret);
  if (!session) throw new ApiError(401, 'SIGNED_OUT', 'Ask your grown-up to reconnect your family adventure.');
  return session;
}

function sessionCookie(request, token, maxAge = SESSION_SECONDS) {
  const secure = new URL(request.url).protocol === 'https:' || !!process.env.VERCEL;
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } });
}

function stateResponse(row) {
  if (!validateAdventureState(row.state) || !Number.isSafeInteger(row.revision) || row.revision < 0) {
    throw new ApiError(503, 'INVALID_CLOUD_STATE', 'Your saved cloud adventure needs attention. The copy on this device is safe.');
  }
  return { state: row.state, revision: row.revision, familyCode: row.code };
}

// Old releases included a sample balance and sample school faces. Normalize
// those records before returning any family data, and persist the correction
// using the same revision lease as ordinary saves. A concurrent edit wins.
export async function normalizeCloudRow(sql, originalRow, normalize = adventureModel.normalizeAdventureState) {
  let row = originalRow;
  for (let attempt = 0; attempt < 2; attempt++) {
    const normalized = normalize(row.state);
    if (!normalized.changed) return row;
    validateState(normalized.state);
    const [saved] = await sql`UPDATE greenface_families SET state = ${JSON.stringify(normalized.state)}::jsonb,
      revision = revision + 1, updated_at = NOW()
      WHERE id = ${row.id} AND revision = ${row.revision}
      RETURNING id, code, state, revision`;
    if (saved) return saved;
    const [latest] = await sql`SELECT id, code, state, revision FROM greenface_families WHERE id = ${row.id}`;
    if (!latest) throw new ApiError(401, 'SIGNED_OUT', 'This family adventure could not be found. Please sign in again.');
    row = latest;
  }
  // A final read may already have been normalized by the competing request.
  if (!normalize(row.state).changed) return row;
  throw new ApiError(409, 'CONFLICT', 'Another device updated this adventure. Reload cloud progress before saving again.');
}

export async function handleRequest(request) {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const method = request.method;
    const config = configuration();
    if (path === '/api/status' && method === 'GET') return json({ configured: config.configured, provider: 'neon' });
    if (!['/api/account', '/api/state', '/api/logout'].includes(path)) throw new ApiError(404, 'NOT_FOUND', 'This Greenface route does not exist.');
    if (!config.configured) throw new ApiError(503, 'NOT_CONFIGURED', 'Cloud saving needs a Neon connection and a session secret. Your local adventure is safe.');
    if (method !== 'GET') validateOrigin(request);
    // Compatibility gate: tabs running the former ten-minute unlock UI must
    // refresh before saving. Family-session authentication still runs below;
    // this public version header is not cryptographic PIN verification.
    if (path === '/api/state' && method === 'PUT' && request.headers.get('x-greenface-controls') !== 'pin-per-action-v1') {
      throw new ApiError(426, 'UPDATE_REQUIRED', 'Refresh Greenface to use the new parent controls. Nothing was changed.');
    }

    if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', 0) });

    if (path === '/api/account' && method === 'POST') {
      const body = await readBody(request);
      const familyCode = normalizeFamilyCode(body.familyCode);
      const password = body.password;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
        throw new ApiError(400, 'INVALID_PASSWORD', 'Use a grown-up passphrase with 8–128 characters.');
      }
      if (!['create', 'login'].includes(body.mode)) throw new ApiError(400, 'INVALID_MODE', 'Choose create or login.');
      if (body.mode === 'create' && body.state !== undefined) validateState(body.state);
      const sql = await database();
      await rateLimit(sql, request, config.secret);
      let row;
      if (body.mode === 'create') {
        const initialState = adventureModel.normalizeAdventureState(body.state ?? adventureModel.createInitialState({ demo: false })).state;
        const passwordHash = await hashPassword(password);
        [row] = await sql`INSERT INTO greenface_families (id, code, password_hash, state)
          VALUES (${randomUUID()}, ${familyCode}, ${passwordHash}, ${JSON.stringify(initialState)}::jsonb)
          ON CONFLICT (code) DO NOTHING RETURNING id, code, state, revision`;
        if (!row) throw new ApiError(409, 'CODE_TAKEN', 'That family code is already in use. Choose another or sign in.');
      } else {
        [row] = await sql`SELECT id, code, password_hash, state, revision FROM greenface_families WHERE code = ${familyCode}`;
        // Do a real password derivation for missing accounts too, reducing account timing leakage.
        const encoded = row?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
        const matches = await verifyPassword(password, encoded);
        if (!row || !matches) throw new ApiError(401, 'INVALID_CREDENTIALS', 'That family code and passphrase do not match.');
      }
      row = await normalizeCloudRow(sql, row);
      const token = createSession(row.id, config.secret);
      return json(stateResponse(row), body.mode === 'create' ? 201 : 200, { 'Set-Cookie': sessionCookie(request, token) });
    }

    if (path === '/api/state' && (method === 'GET' || method === 'PUT')) {
      const session = sessionFrom(request, config.secret);
      let body;
      if (method === 'PUT') {
        body = await readBody(request);
        validateState(body.state);
        body.state = adventureModel.normalizeAdventureState(body.state).state;
        if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw new ApiError(400, 'INVALID_REVISION', 'Refresh your adventure before saving again.');
      }
      const sql = await database();
      let row;
      if (method === 'GET') {
        [row] = await sql`SELECT id, code, state, revision FROM greenface_families WHERE id = ${session.id}`;
      } else {
        [row] = await sql`UPDATE greenface_families SET state = ${JSON.stringify(body.state)}::jsonb,
          revision = revision + 1, updated_at = NOW()
          WHERE id = ${session.id} AND revision = ${body.revision}
          RETURNING id, code, state, revision`;
        if (!row) throw new ApiError(409, 'CONFLICT', 'Another device updated this adventure. Reload cloud progress before saving again.');
      }
      if (!row) throw new ApiError(401, 'SIGNED_OUT', 'This family adventure could not be found. Please sign in again.');
      if (method === 'GET') row = await normalizeCloudRow(sql, row);
      return json(stateResponse(row));
    }
    return json({ error: 'This method is not supported.', code: 'METHOD_NOT_ALLOWED' }, 405, { Allow: path === '/api/state' ? 'GET, PUT' : 'POST' });
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message, code: error.code }, error.status);
    // Log only classification; database errors can contain query values or credentials.
    console.error('Greenface API request failed', { name: error?.name, code: error?.code });
    return json({ error: 'Cloud saving is taking a little break. Your local adventure is safe; try again soon.', code: 'CLOUD_UNAVAILABLE' }, 503);
  }
}

