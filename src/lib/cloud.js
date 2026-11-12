import { validateAdventureState } from './stateValidation.js';

export class CloudError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'CloudError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Greenface-Request': '1', ...options.headers },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new CloudError('Cloud saving is taking a little break. Your local adventure is safe.', 0, 'NETWORK_ERROR');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new CloudError(data?.error || 'Cloud saving is unavailable. Your local adventure is safe.', response.status, data?.code || 'CLOUD_UNAVAILABLE');
  if (['account', 'state'].includes(path) && (!validateAdventureState(data.state) || !Number.isSafeInteger(data.revision) || data.revision < 0 || typeof data.familyCode !== 'string')) {
    throw new CloudError('This cloud adventure could not be safely loaded. The copy on this device is safe.', 502, 'INVALID_CLOUD_STATE');
  }
  return data;
}

export async function apiStatus() {
  try { return await request('status'); }
  catch { return { configured: false, provider: 'neon' }; }
}

export function signIn({ familyCode, password, create = false, state } = {}) {
  return request('account', { method: 'POST', body: JSON.stringify({ mode: create ? 'create' : 'login', familyCode, password, ...(create && state ? { state } : {}) }) });
}

export function fetchCloudState() { return request('state'); }

export function saveCloudState(state, revision) {
  return request('state', { method: 'PUT', body: JSON.stringify({ state, revision }) });
}

export function signOut() { return request('logout', { method: 'POST', body: '{}' }); }
