'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function iso(minute) { return `2026-07-03T10:${String(minute).padStart(2, '0')}:00.000Z`; }
function keyOf(userId, type, id) { return `${userId}\u0000${type}\u0000${id}`; }

class Statement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }
  bind(...values) {
    const next = new Statement(this.db, this.sql);
    next.values = values;
    return next;
  }
  async first() {
    const sql = this.sql;
    const v = this.values;
    if (sql.startsWith('SELECT user_id, created_at, last_seen FROM sessions WHERE token = ?')) {
      return this.db.sessions.get(v[0]) || null;
    }
    if (sql.startsWith('UPDATE user_seq SET seq = seq + ? WHERE user_id = ? RETURNING seq')) {
      const count = Number(v[0]) || 0;
      const userId = v[1];
      const seq = (this.db.userSeq.get(userId) || 0) + count;
      this.db.userSeq.set(userId, seq);
      return { seq };
    }
    throw new Error('Unexpected first SQL: ' + sql);
  }
  async all() {
    const sql = this.sql;
    const v = this.values;
    if (sql.startsWith('SELECT * FROM records WHERE user_id = ? AND server_seq > ?')) {
      const [userId, cursor, limit] = v;
      const results = [...this.db.records.values()]
        .filter((row) => row.user_id === userId && row.server_seq > cursor)
        .sort((a, b) => a.server_seq - b.server_seq)
        .slice(0, limit);
      return { results };
    }
    if (sql.startsWith('SELECT type, id, updated_at, revision, device_id FROM records WHERE user_id = ? AND')) {
      const userId = v[0];
      const results = [];
      for (let i = 1; i < v.length; i += 2) {
        const row = this.db.records.get(keyOf(userId, v[i], v[i + 1]));
        if (row) results.push({ type: row.type, id: row.id, updated_at: row.updated_at, revision: row.revision, device_id: row.device_id });
      }
      return { results };
    }
    throw new Error('Unexpected all SQL: ' + sql);
  }
  async run() {
    const sql = this.sql;
    const v = this.values;
    if (sql.startsWith('UPDATE sessions SET last_seen = ? WHERE token = ?')) {
      const row = this.db.sessions.get(v[1]);
      if (row) row.last_seen = v[0];
      return {};
    }
    if (sql.startsWith('INSERT INTO user_seq (user_id, seq) VALUES (?,0) ON CONFLICT')) {
      if (!this.db.userSeq.has(v[0])) this.db.userSeq.set(v[0], 0);
      return {};
    }
    if (sql.startsWith('INSERT INTO records')) {
      const [user_id, type, id, revision, updated_at, deleted_at, device_id, payload_json, server_seq] = v;
      this.db.records.set(keyOf(user_id, type, id), { user_id, type, id, revision, updated_at, deleted_at, device_id, payload_json, server_seq });
      return {};
    }
    if (sql.startsWith('INSERT INTO image_refs')) {
      const [userId, sha256, bytes, mime] = v;
      const key = `${userId}/${sha256}`;
      const current = this.db.imageRefs.get(key);
      this.db.imageRefs.set(key, { user_id: userId, sha256, bytes, mime, ref_count: current ? current.ref_count + 1 : 1 });
      return {};
    }
    throw new Error('Unexpected run SQL: ' + sql);
  }
}

function createEnv() {
  const db = {
    sessions: new Map([['token-1', { user_id: 'user-1', created_at: iso(0), last_seen: iso(0) }]]),
    records: new Map(),
    userSeq: new Map([['user-1', 10]]),
    imageRefs: new Map(),
    prepare(sql) { return new Statement(this, sql); },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return [];
    }
  };
  let imagePutCount = 0;
  const images = new Map();
  return {
    DB: db,
    IMAGES: {
      head: async (key) => images.has(key) ? { key } : null,
      put: async (key, body, meta) => {
        imagePutCount += 1;
        images.set(key, { body, httpMetadata: meta && meta.httpMetadata });
      },
      get putCount() { return imagePutCount; },
      get: async (key) => images.get(key) || null,
      list: async () => ({ objects: [], truncated: false }),
      delete: async () => {}
    }
  };
}

async function loadWorker() {
  return (await import('../worker/src/index.js')).default;
}

function authInit(method, body) {
  return {
    method,
    headers: { Authorization: 'Bearer token-1', 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body)
  };
}

test('worker integration: push reserves seq range and pull returns accepted records after client cursor', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const pushResponse = await worker.fetch(new Request('https://sync.test/sync/push', authInit('POST', {
    cursor: 10,
    beans: [
      { id: 'b1', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { name: '豆1' } },
      { id: 'b2', revision: 1, updatedAt: iso(2), deviceId: 'A', payload: { name: '豆2' } }
    ],
    drinkLogs: [],
    brewPlans: []
  })), env);
  const pushed = await pushResponse.json();
  assert.equal(pushed.accepted, 2);
  assert.equal(pushed.cursor, 10);
  assert.equal(pushed.serverSeqStart, 11);
  assert.equal(pushed.serverSeqEnd, 12);

  const pullResponse = await worker.fetch(new Request('https://sync.test/sync/pull?cursor=10', { headers: { Authorization: 'Bearer token-1' } }), env);
  const pulled = await pullResponse.json();
  assert.equal(pulled.cursor, 12);
  assert.equal(pulled.hasMore, false);
  assert.deepEqual(pulled.beans.map((bean) => bean.id), ['b1', 'b2']);
});

test('worker integration: duplicate image upload increments image ref without rewriting R2 object', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const bytes = new TextEncoder().encode('image-bytes');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const url = `https://sync.test/images/${sha}`;
  const init = { method: 'PUT', headers: { Authorization: 'Bearer token-1', 'Content-Type': 'image/webp' }, body: bytes };

  assert.equal((await worker.fetch(new Request(url, init), env)).status, 200);
  assert.equal((await worker.fetch(new Request(url, init), env)).status, 200);

  const ref = env.DB.imageRefs.get(`user-1/${sha}`);
  assert.equal(ref.ref_count, 2);
  assert.equal(env.IMAGES.putCount, 1);
});
