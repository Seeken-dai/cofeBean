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
    if (sql.startsWith('SELECT type, id, updated_at, revision, device_id, payload_json FROM records WHERE user_id = ? AND')) {
      const userId = v[0];
      const results = [];
      for (let i = 1; i < v.length; i += 2) {
        const row = this.db.records.get(keyOf(userId, v[i], v[i + 1]));
        if (row) results.push({ type: row.type, id: row.id, updated_at: row.updated_at, revision: row.revision, device_id: row.device_id, payload_json: row.payload_json });
      }
      return { results };
    }
    if (sql.startsWith('SELECT payload_json FROM records WHERE user_id = ? AND deleted_at IS NULL')) {
      const results = [...this.db.records.values()]
        .filter((row) => row.user_id === v[0] && !row.deleted_at)
        .map((row) => ({ payload_json: row.payload_json }));
      return { results };
    }
    if (sql.startsWith('SELECT sha256 FROM image_refs WHERE user_id = ? AND last_put > ?')) {
      const results = [...this.db.imageRefs.values()]
        .filter((row) => row.user_id === v[0] && row.last_put && row.last_put > v[1])
        .map((row) => ({ sha256: row.sha256 }));
      return { results };
    }
    if (sql.startsWith('SELECT id FROM users')) {
      return { results: [...this.db.users].map((id) => ({ id })) };
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
    if (sql.startsWith('UPDATE sessions SET token = ? WHERE token = ?')) {
      // 明文会话就地升级为哈希存储:换 key、保留行内容
      const row = this.db.sessions.get(v[1]);
      if (row) { this.db.sessions.delete(v[1]); this.db.sessions.set(v[0], row); }
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
      const [userId, sha256, bytes, mime, lastPut] = v;
      this.db.imageRefs.set(`${userId}/${sha256}`, { user_id: userId, sha256, bytes, mime, ref_count: 1, last_put: lastPut });
      return {};
    }
    if (sql.startsWith('DELETE FROM image_refs WHERE user_id = ? AND sha256 IN')) {
      for (const sha of v.slice(1)) this.db.imageRefs.delete(`${v[0]}/${sha}`);
      return {};
    }
    if (sql.startsWith('DELETE FROM image_refs WHERE user_id = ?')) {
      for (const [key, row] of this.db.imageRefs) if (row.user_id === v[0]) this.db.imageRefs.delete(key);
      return {};
    }
    if (sql.startsWith('DELETE FROM records WHERE user_id = ?')) {
      for (const [key, row] of this.db.records) if (row.user_id === v[0]) this.db.records.delete(key);
      return {};
    }
    if (sql.startsWith('DELETE FROM sessions WHERE user_id = ?')) {
      for (const [key, row] of this.db.sessions) if (row.user_id === v[0]) this.db.sessions.delete(key);
      return {};
    }
    if (sql.startsWith('DELETE FROM user_seq WHERE user_id = ?')) { this.db.userSeq.delete(v[0]); return {}; }
    if (sql.startsWith('DELETE FROM users WHERE id = ?')) { this.db.users.delete(v[0]); return {}; }
    throw new Error('Unexpected run SQL: ' + sql);
  }
}

function createEnv() {
  const db = {
    users: new Set(['user-1']),
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
    images,
    IMAGES: {
      head: async (key) => images.has(key) ? { key } : null,
      put: async (key, body, meta) => {
        imagePutCount += 1;
        images.set(key, { body, httpMetadata: meta && meta.httpMetadata });
      },
      get putCount() { return imagePutCount; },
      get: async (key) => images.get(key) || null,
      list: async ({ prefix, delimiter } = {}) => {
        const keys = [...images.keys()].filter((key) => !prefix || key.startsWith(prefix));
        if (delimiter === '/') {
          const prefixes = new Set(keys.map((key) => key.slice(0, key.indexOf('/') + 1)));
          return { objects: [], delimitedPrefixes: [...prefixes], truncated: false };
        }
        return { objects: keys.map((key) => ({ key })), truncated: false };
      },
      delete: async (keys) => { for (const key of [].concat(keys)) images.delete(key); }
    }
  };
}

// 直接往 R2 + image_refs 里塞一张已上传的图，绕开 PUT 以便控制 last_put。
function seedImage(env, userId, sha, lastPut) {
  env.images.set(`${userId}/${sha}`, { body: sha });
  env.DB.imageRefs.set(`${userId}/${sha}`, { user_id: userId, sha256: sha, bytes: 1, mime: 'image/webp', ref_count: 1, last_put: lastPut });
}
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const ANCIENT = '2020-01-01T00:00:00.000Z';

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

function pushRequest(records) {
  return new Request('https://sync.test/sync/push', authInit('POST', { cursor: 0, beans: [], drinkLogs: [], brewPlans: [], ...records }));
}

test('image gc: 记录被删后其图片从 R2 回收', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT);

  await worker.fetch(pushRequest({ beans: [{ id: 'b1', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_A } }] }), env);
  assert.equal(env.images.has(`user-1/${SHA_A}`), true, '记录存活时图片不应被动');

  await worker.fetch(pushRequest({ beans: [{ id: 'b1', revision: 2, updatedAt: iso(2), deviceId: 'A', deletedAt: iso(2), payload: {} }] }), env);

  assert.equal(env.images.has(`user-1/${SHA_A}`), false, '墓碑覆盖后图片应被回收');
  assert.equal(env.DB.imageRefs.has(`user-1/${SHA_A}`), false, 'image_refs 行应一并清掉');
});

test('image gc: 换图时旧图回收，仍被其它记录引用的图保留', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT);
  seedImage(env, 'user-1', SHA_B, ANCIENT);

  // b1 用 A，b2 也用 A；b1 换成 B 后 A 仍被 b2 引用，不能删。
  await worker.fetch(pushRequest({ beans: [
    { id: 'b1', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_A } },
    { id: 'b2', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_A } }
  ] }), env);
  await worker.fetch(pushRequest({ beans: [
    { id: 'b1', revision: 2, updatedAt: iso(3), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_B } }
  ] }), env);
  assert.equal(env.images.has(`user-1/${SHA_A}`), true, 'A 仍被 b2 引用，不得回收');

  // b2 也换掉 A 之后，A 才失去最后一个引用。
  await worker.fetch(pushRequest({ beans: [
    { id: 'b2', revision: 2, updatedAt: iso(4), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_B } }
  ] }), env);
  assert.equal(env.images.has(`user-1/${SHA_A}`), false, '最后一个引用消失后回收 A');
  assert.equal(env.images.has(`user-1/${SHA_B}`), true, 'B 在用，不得回收');
});

test('image gc: drinkLog.photos 的引用同样参与存活判定', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT);

  await worker.fetch(pushRequest({ drinkLogs: [{ id: 'l1', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { photos: ['r2:' + SHA_A] } }] }), env);
  await worker.fetch(pushRequest({ drinkLogs: [{ id: 'l1', revision: 2, updatedAt: iso(2), deviceId: 'A', payload: { photos: [] } }] }), env);

  assert.equal(env.images.has(`user-1/${SHA_A}`), false);
});

test('image gc: 宽限期内刚上传的图不回收（记录可能还在路上）', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT);
  seedImage(env, 'user-1', SHA_B, new Date().toISOString()); // 刚传上来

  // b1 从引用 A+B 变成谁都不引用；B 因宽限期豁免。
  await worker.fetch(pushRequest({ beans: [{ id: 'b1', revision: 1, updatedAt: iso(1), deviceId: 'A', payload: { bagImagePath: 'r2:' + SHA_A, labelImagePath: 'r2:' + SHA_B } }] }), env);
  await worker.fetch(pushRequest({ beans: [{ id: 'b1', revision: 2, updatedAt: iso(2), deviceId: 'A', payload: {} }] }), env);

  assert.equal(env.images.has(`user-1/${SHA_A}`), false, '陈旧的解引用图应回收');
  assert.equal(env.images.has(`user-1/${SHA_B}`), true, '宽限期内的图应豁免');
});

test('image gc: cron 全量扫描清掉存量孤儿图与无主前缀', async () => {
  const { sweepOrphanImages } = await import('../worker/src/image-gc.mjs');
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT); // 被记录引用
  seedImage(env, 'user-1', SHA_B, ANCIENT); // 无人引用的存量孤儿
  seedImage(env, 'ghost-user', SHA_A, ANCIENT); // 已注销用户遗留的整个前缀
  env.DB.records.set(keyOf('user-1', 'bean', 'b1'), {
    user_id: 'user-1', type: 'bean', id: 'b1', revision: 1, updated_at: iso(1),
    deleted_at: null, device_id: 'A', payload_json: JSON.stringify({ bagImagePath: 'r2:' + SHA_A }), server_seq: 1
  });

  const deleted = await sweepOrphanImages(env);

  assert.equal(deleted, 2);
  assert.equal(env.images.has(`user-1/${SHA_A}`), true, '在用的图不动');
  assert.equal(env.images.has(`user-1/${SHA_B}`), false, '存量孤儿被清');
  assert.equal(env.images.has(`ghost-user/${SHA_A}`), false, '无主前缀被整体清空');
});

test('image gc: 注销账号清空该用户前缀', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  seedImage(env, 'user-1', SHA_A, ANCIENT);
  seedImage(env, 'user-1', SHA_B, new Date().toISOString());

  const response = await worker.fetch(new Request('https://sync.test/auth/delete', authInit('POST')), env);

  assert.equal(response.status, 200);
  assert.equal(env.images.size, 0, '宽限期不适用于注销：整个前缀都要清掉');
  assert.equal(env.DB.imageRefs.size, 0);
  assert.equal(env.DB.users.has('user-1'), false);
});

test('worker integration: duplicate image upload dedupes R2 object and refreshes last_put', async () => {
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
  assert.ok(ref.last_put, '每次上传都要刷新 last_put，GC 靠它划宽限期');
  assert.equal(env.IMAGES.putCount, 1, '内容相同则不重写 R2 对象');
});

test('worker integration: 明文历史会话首次命中即升级为哈希存储且仍可鉴权', async () => {
  const worker = await loadWorker();
  const env = createEnv();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('token-1'));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  // 第一次请求走明文兜底路径并就地升级
  const first = await worker.fetch(new Request('https://sync.test/sync/pull?cursor=0', { headers: { Authorization: 'Bearer token-1' } }), env);
  assert.equal(first.status, 200);
  assert.equal(env.DB.sessions.has('token-1'), false, '明文行应已被升级删除');
  assert.equal(env.DB.sessions.has(hash), true, '应改为按 sha256(token) 存储');

  // 第二次请求直接命中哈希行
  const second = await worker.fetch(new Request('https://sync.test/sync/pull?cursor=0', { headers: { Authorization: 'Bearer token-1' } }), env);
  assert.equal(second.status, 200);

  // 错误 token 仍拒绝
  const denied = await worker.fetch(new Request('https://sync.test/sync/pull?cursor=0', { headers: { Authorization: 'Bearer wrong' } }), env);
  assert.equal(denied.status, 401);
});
