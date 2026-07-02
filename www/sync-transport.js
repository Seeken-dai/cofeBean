(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanSyncTransport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_BASE_URL = 'https://cofebean-sync.nick-lim-a40.workers.dev';
  const TYPE_MAP = { beans: 'bean', drinkLogs: 'drinkLog', brewPlans: 'brewPlan' };
  const BUCKET_MAP = { bean: 'beans', drinkLog: 'drinkLogs', brewPlan: 'brewPlans' };
  const SYNC_KEYS = new Set(['id', 'revision', 'updatedAt', 'deletedAt', 'deviceId']);

  function cleanBaseUrl(url) { return String(url || DEFAULT_BASE_URL).replace(/\/+$/, ''); }
  function syncMeta(record) {
    return {
      id: record.id,
      revision: Math.max(1, Math.round(Number(record.revision) || 1)),
      updatedAt: record.updatedAt || new Date().toISOString(),
      deletedAt: record.deletedAt || null,
      deviceId: record.deviceId || ''
    };
  }
  function toEnvelope(type, record) {
    const payload = {};
    Object.keys(record || {}).forEach((key) => { if (!SYNC_KEYS.has(key)) payload[key] = record[key]; });
    return { type, ...syncMeta(record || {}), payload };
  }
  function normalizeByType(core, type, value) {
    if (type === 'bean') return core.normalizeBean(value, value.updatedAt);
    if (type === 'drinkLog') return core.normalizeDrinkLog(value, value.updatedAt);
    if (type === 'brewPlan') return core.normalizeBrewPlan(value, value.updatedAt);
    return value;
  }
  function fromEnvelope(core, envelope) {
    const value = { ...(envelope.payload || {}), id: envelope.id, revision: envelope.revision, updatedAt: envelope.updatedAt, deletedAt: envelope.deletedAt || null, deviceId: envelope.deviceId || '' };
    return normalizeByType(core, envelope.type, value);
  }
  async function readJson(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message = data && data.error ? data.error : `HTTP ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }
  function createHeaders(token, extra) {
    const headers = { ...(extra || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  function createAuthClient(options = {}) {
    const baseUrl = cleanBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch || fetch;
    async function post(path, body) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      return readJson(response);
    }
    return {
      register: (body) => post('/auth/register', body),
      login: (body) => post('/auth/login', body),
      recover: (body) => post('/auth/recover', body)
    };
  }
  function createHttpTransport(options = {}) {
    const core = options.core || (typeof window !== 'undefined' ? window.BeanCore : null);
    if (!core) throw new Error('缺少 BeanCore');
    const baseUrl = cleanBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch || fetch;
    const getToken = typeof options.getToken === 'function' ? options.getToken : () => options.token;

    async function request(path, init = {}) {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: createHeaders(getToken(), init.headers)
      });
      return readJson(response);
    }
    return {
      async hello() {
        return request('/sync/hello');
      },
      async pull(cursor) {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const data = await request(`/sync/pull${query}`);
        const out = { beans: [], drinkLogs: [], brewPlans: [], cursor: data.cursor || null, protocol: data.protocol };
        Object.keys(TYPE_MAP).forEach((bucket) => {
          out[bucket] = (data[bucket] || []).map((record) => fromEnvelope(core, record));
        });
        return out;
      },
      async push(records) {
        const body = {};
        Object.keys(TYPE_MAP).forEach((bucket) => {
          body[bucket] = (records && records[bucket] || []).map((record) => toEnvelope(TYPE_MAP[bucket], record));
        });
        return request('/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      }
    };
  }

  return { DEFAULT_BASE_URL, BUCKET_MAP, TYPE_MAP, toEnvelope, fromEnvelope, createAuthClient, createHttpTransport };
});
