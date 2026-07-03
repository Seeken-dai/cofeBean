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
  function bytesToHex(bytes) { return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  async function toArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (value && value.buffer instanceof ArrayBuffer) return value.buffer.slice(value.byteOffset || 0, (value.byteOffset || 0) + value.byteLength);
    if (value && typeof value.arrayBuffer === 'function') return value.arrayBuffer();
    throw new Error('图片数据不可读');
  }
  async function sha256Hex(value) {
    const cryptoApi = typeof crypto !== 'undefined' ? crypto : null;
    if (!cryptoApi || !cryptoApi.subtle) throw new Error('当前环境不支持 SHA-256');
    return bytesToHex(await cryptoApi.subtle.digest('SHA-256', await toArrayBuffer(value)));
  }
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
  async function fetchWithTimeout(fetchImpl, url, init, timeoutMs) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      return await fetchImpl(url, controller ? { ...init, signal: controller.signal } : init);
    } catch (error) {
      if (controller && controller.signal.aborted) throw new Error('连接同步服务器超时，请检查网络后重试');
      if (error instanceof TypeError) throw new Error('无法连接同步服务器，请检查网络');
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function createAuthClient(options = {}) {
    const baseUrl = cleanBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch || fetch;
    async function post(path, body) {
      const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      }, 15000);
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
      const response = await fetchWithTimeout(fetchImpl, `${baseUrl}${path}`, {
        ...init,
        headers: createHeaders(getToken(), init.headers)
      }, 45000);
      return readJson(response);
    }
    return {
      async hello() {
        return request('/sync/hello');
      },
      async pull(cursor) {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const data = await request(`/sync/pull${query}`);
        const out = { beans: [], drinkLogs: [], brewPlans: [], cursor: data.cursor || null, hasMore: Boolean(data.hasMore), protocol: data.protocol };
        Object.keys(TYPE_MAP).forEach((bucket) => {
          out[bucket] = (data[bucket] || []).map((record) => fromEnvelope(core, record));
        });
        return out;
      },
      async push(records, cursor) {
        const body = { cursor: cursor || null };
        Object.keys(TYPE_MAP).forEach((bucket) => {
          body[bucket] = (records && records[bucket] || []).map((record) => toEnvelope(TYPE_MAP[bucket], record));
        });
        return request('/sync/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      },
      async uploadImage(blob) {
        const buffer = await toArrayBuffer(blob);
        const sha = await sha256Hex(buffer);
        const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/images/${sha}`, {
          method: 'PUT',
          headers: createHeaders(getToken(), { 'Content-Type': blob && blob.type || 'image/webp' }),
          body: buffer
        }, 120000);
        return readJson(response);
      },
      async downloadImage(ref) {
        const sha = String(ref || '').replace(/^r2:/, '');
        if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('图片引用无效');
        const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/images/${sha}`, {
          method: 'GET',
          headers: createHeaders(getToken())
        }, 120000);
        if (!response.ok) await readJson(response);
        if (typeof response.blob === 'function') return response.blob();
        const buffer = await response.arrayBuffer();
        return new Blob([buffer], { type: response.headers && response.headers.get ? response.headers.get('Content-Type') || 'image/webp' : 'image/webp' });
      },
      async deleteAccount() {
        return request('/auth/delete', { method: 'POST' });
      }
    };
  }

  return { DEFAULT_BASE_URL, BUCKET_MAP, TYPE_MAP, sha256Hex, toEnvelope, fromEnvelope, createAuthClient, createHttpTransport };
});
