// 豆仓同步后端 Worker（阶段 4.3）。
// 方案 (a) 非严格 E2E：服务端可读，传输 HTTPS + 静态加密；密码只存哈希。
// 端点：/auth/register /auth/login /auth/recover /sync/hello /sync/pull /sync/push /images/:sha
// 合并采用 last-write-wins（updated_at → revision → device_id）+ 墓碑；与客户端 data-core 一致。

import {
  PULL_LIMIT,
  TYPE_BUCKET,
  collectIncoming,
  rowToEnvelope,
  recordKey,
  shouldAcceptRecord,
  assignServerSeq
} from './sync-logic.mjs';
import { collectGarbage, parsePayloadShas, purgeUserPrefix, sweepOrphanImages } from './image-gc.mjs';

const SYNC_PROTOCOL = 1;
const TYPES = ['bean', 'drinkLog', 'brewPlan'];
const ALLOWED_ORIGINS = ['https://app.cofevault.top', 'https://cofebean.pages.dev', 'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:4178', 'http://127.0.0.1:4178', 'http://localhost', 'https://localhost', 'capacitor://localhost'];
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// last_seen 只用于 90 天 TTL 滑动,按小时粒度刷新即可;避免每个同步请求都写一次 D1。
const LAST_SEEN_REFRESH_MS = 60 * 60 * 1000;
const AUTH_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 12;
// 注意:内存 Map 限流只在单个 isolate 内生效 —— isolate 随时回收、多 PoP 各自计数,
// 它只是「聊胜于无」的减速带。若要真正限流需落 D1 或 Durable Object,当前个人规模暂不做。
const authAttempts = new Map();

function isCorsAllowed(request) {
  const origin = request.headers.get('Origin');
  return !origin || ALLOWED_ORIGINS.includes(origin);
}
function corsHeaders(request) {
  const origin = request.headers.get('Origin');
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function json(data, status, request) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(request) } });
}
function bad(msg, status, request) { return json({ error: msg }, status || 400, request); }

// ---- 工具 ----
function bytesToHex(bytes) { return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) { const a = new Uint8Array(hex.length / 2); for (let i = 0; i < a.length; i += 1) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }
function randomHex(n) { return bytesToHex(crypto.getRandomValues(new Uint8Array(n))); }
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function pbkdf2(secret, saltHex, pepper) {
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey('raw', enc.encode(String(secret) + (pepper || '')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' }, material, 256);
  return bytesToHex(bits);
}
async function sha256Hex(buffer) { return bytesToHex(await crypto.subtle.digest('SHA-256', buffer)); }
async function sha256HexText(text) { return sha256Hex(new TextEncoder().encode(String(text))); }
function normEmail(email) { return String(email || '').trim().toLowerCase(); }
function clientIp(request) { return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'; }
function checkAuthRateLimit(request, key) {
  const now = Date.now();
  const id = `${clientIp(request)}:${key}`;
  const current = authAttempts.get(id);
  if (!current || current.resetAt <= now) {
    authAttempts.set(id, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return true;
  }
  current.count += 1;
  if (current.count > AUTH_MAX_ATTEMPTS) return false;
  return true;
}

// ---- 鉴权 ----
// 会话 token 客户端持有明文,D1 只存 sha256(token):库泄露时会话不可直接盗用。
// 历史明文会话在首次命中时就地升级为哈希行,用户无感、不强制重新登录。
async function currentUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const tokenHash = await sha256HexText(token);
  let row = await env.DB.prepare('SELECT user_id, created_at, last_seen FROM sessions WHERE token = ?').bind(tokenHash).first();
  if (!row) {
    row = await env.DB.prepare('SELECT user_id, created_at, last_seen FROM sessions WHERE token = ?').bind(token).first();
    if (!row) return null;
    await env.DB.prepare('UPDATE sessions SET token = ? WHERE token = ?').bind(tokenHash, token).run();
  }
  const lastSeen = Date.parse(row.last_seen || row.created_at) || 0;
  if (!lastSeen || Date.now() - lastSeen > SESSION_TTL_MS) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(tokenHash).run();
    return null;
  }
  if (Date.now() - lastSeen > LAST_SEEN_REFRESH_MS) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').bind(new Date().toISOString(), tokenHash).run();
  }
  return row.user_id;
}
async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, last_seen) VALUES (?,?,?,?)')
    .bind(await sha256HexText(token), userId, new Date().toISOString(), new Date().toISOString()).run();
  return token;
}

async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || '');
  const recoveryCode = String(body.recoveryCode || '');
  if (!checkAuthRateLimit(request, `register:${email || 'blank'}`)) return bad('尝试次数过多，请稍后再试', 429, request);
  if (!email || !email.includes('@')) return bad('邮箱格式不正确', 400, request);
  if (password.length < 8) return bad('密码至少 8 位', 400, request);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return bad('该邮箱已注册', 409, request);
  const salt = randomHex(16);
  const pwdHash = await pbkdf2(password, salt, env.PWD_PEPPER);
  let recoveryHash = null;
  if (recoveryCode) { const rSalt = randomHex(16); recoveryHash = rSalt + ':' + await pbkdf2(recoveryCode, rSalt, env.PWD_PEPPER); }
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, pwd_hash, pwd_salt, recovery_hash, created_at) VALUES (?,?,?,?,?,?)')
    .bind(id, email, pwdHash, salt, recoveryHash, new Date().toISOString()).run();
  const token = await createSession(env, id);
  return json({ token }, 200, request);
}

async function handleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || '');
  if (!checkAuthRateLimit(request, `login:${email || 'blank'}`)) return bad('尝试次数过多，请稍后再试', 429, request);
  const user = await env.DB.prepare('SELECT id, pwd_hash, pwd_salt FROM users WHERE email = ?').bind(email).first();
  if (!user) return bad('邮箱或密码错误', 401, request);
  const hash = await pbkdf2(password, user.pwd_salt, env.PWD_PEPPER);
  if (!timingSafeEqual(hash, user.pwd_hash)) return bad('邮箱或密码错误', 401, request);
  const token = await createSession(env, user.id);
  return json({ token }, 200, request);
}

async function handleRecover(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const recoveryCode = String(body.recoveryCode || '');
  const newPassword = String(body.newPassword || '');
  if (!checkAuthRateLimit(request, `recover:${email || 'blank'}`)) return bad('尝试次数过多，请稍后再试', 429, request);
  if (newPassword.length < 8) return bad('新密码至少 8 位', 400, request);
  const user = await env.DB.prepare('SELECT id, recovery_hash FROM users WHERE email = ?').bind(email).first();
  if (!user || !user.recovery_hash) return bad('无法找回', 401, request);
  const [rSalt, rHash] = String(user.recovery_hash).split(':');
  const check = await pbkdf2(recoveryCode, rSalt || '', env.PWD_PEPPER);
  if (!timingSafeEqual(check, rHash || '')) return bad('恢复码不正确', 401, request);
  const salt = randomHex(16);
  const pwdHash = await pbkdf2(newPassword, salt, env.PWD_PEPPER);
  await env.DB.prepare('UPDATE users SET pwd_hash = ?, pwd_salt = ? WHERE id = ?').bind(pwdHash, salt, user.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run(); // 重置密码后撤销旧会话
  const token = await createSession(env, user.id);
  return json({ token }, 200, request);
}

// ---- 同步 ----
async function handlePull(request, env, userId) {
  const cursor = Number(new URL(request.url).searchParams.get('cursor')) || 0;
  const result = await env.DB.prepare('SELECT * FROM records WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC LIMIT ?')
    .bind(userId, cursor, PULL_LIMIT).all();
  const rows = result.results || [];
  const out = { beans: [], drinkLogs: [], brewPlans: [] };
  let nextCursor = cursor;
  rows.forEach((row) => { out[TYPE_BUCKET[row.type]].push(rowToEnvelope(row)); if (row.server_seq > nextCursor) nextCursor = row.server_seq; });
  return json({ ...out, cursor: nextCursor, hasMore: rows.length === PULL_LIMIT, protocol: SYNC_PROTOCOL }, 200, request);
}

async function loadStoredRecords(env, userId, incoming) {
  const stored = new Map();
  for (let offset = 0; offset < incoming.length; offset += 100) {
    const chunk = incoming.slice(offset, offset + 100);
    if (!chunk.length) continue;
    const clauses = chunk.map(() => '(type = ? AND id = ?)').join(' OR ');
    const params = [userId];
    chunk.forEach(({ type, rec }) => { params.push(type, rec.id); });
    const result = await env.DB.prepare(`SELECT type, id, updated_at, revision, device_id, payload_json FROM records WHERE user_id = ? AND (${clauses})`).bind(...params).all();
    (result.results || []).forEach((row) => stored.set(recordKey(row.type, row.id), row));
  }
  return stored;
}

async function reserveServerSeq(env, userId, count) {
  if (!count) return null;
  await env.DB.prepare('INSERT INTO user_seq (user_id, seq) VALUES (?,0) ON CONFLICT(user_id) DO NOTHING').bind(userId).run();
  const row = await env.DB.prepare('UPDATE user_seq SET seq = seq + ? WHERE user_id = ? RETURNING seq').bind(count, userId).first();
  const endSeq = Number(row && row.seq) || count;
  return { startSeq: endSeq - count + 1, endSeq };
}

async function handlePush(request, env, userId, ctx) {
  const body = await request.json().catch(() => ({}));
  const clientCursor = Number(body.cursor) || 0;
  const incoming = collectIncoming(body);
  const stored = await loadStoredRecords(env, userId, incoming);
  const acceptedRecords = incoming.filter(({ type, rec }) => shouldAcceptRecord(rec, stored.get(recordKey(type, rec.id))));
  const reserved = await reserveServerSeq(env, userId, acceptedRecords.length);
  const acceptedWithSeq = reserved ? assignServerSeq(acceptedRecords, reserved.startSeq) : [];
  const stmts = [];
  for (const { type, rec, serverSeq } of acceptedWithSeq) {
    stmts.push(env.DB.prepare(
      'INSERT INTO records (user_id, type, id, revision, updated_at, deleted_at, device_id, payload_json, server_seq) VALUES (?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(user_id, type, id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, device_id=excluded.device_id, payload_json=excluded.payload_json, server_seq=excluded.server_seq'
    ).bind(userId, type, rec.id, rec.revision || 1, rec.updatedAt, rec.deletedAt || null, rec.deviceId || '', JSON.stringify(rec.payload || {}), serverSeq));
  }
  if (stmts.length) await env.DB.batch(stmts);

  // 被覆盖记录的旧 payload 里引用过的图 —— 换图、删图、以及墓碑覆盖都落在这里。
  // 只是「候选」：同一张图可能仍被别的记录引用，由 collectGarbage 查存活集裁定。
  const candidates = new Set();
  for (const { type, rec } of acceptedWithSeq) {
    const previous = stored.get(recordKey(type, rec.id));
    if (previous) parsePayloadShas(previous.payload_json, candidates);
  }
  if (candidates.size) {
    // 回收不该拖慢 push；失败也不该让已落库的 push 报错 —— cron 全量兜底会再捡一次。
    const gc = collectGarbage(env, userId, candidates).catch((error) => console.error('image gc', error));
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(gc); else await gc;
  }

  return json({
    accepted: acceptedWithSeq.length,
    cursor: clientCursor || null,
    serverSeqStart: reserved ? reserved.startSeq : null,
    serverSeqEnd: reserved ? reserved.endSeq : null,
    protocol: SYNC_PROTOCOL
  }, 200, request);
}

// ---- 图片（R2，用户作用域 key = userId/sha256）----
async function handleImagePut(request, env, userId, sha) {
  const key = `${userId}/${sha}`;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 5 * 1024 * 1024) return bad('图片过大', 413, request);
  const actual = await sha256Hex(buf);
  if (sha && sha !== actual) return bad('sha256 不匹配', 400, request);
  const existing = await env.IMAGES.head(key);
  const mime = request.headers.get('Content-Type') || 'image/webp';
  if (!existing) {
    await env.IMAGES.put(key, buf, { httpMetadata: { contentType: mime } });
  }
  // last_put 是 GC 的宽限期依据：图先传、记录后 push,这段窗口内不能回收。
  // ref_count 是历史遗留列（回收已改为标记-清除,见 image-gc.mjs），不再维护。
  await env.DB.prepare('INSERT INTO image_refs (user_id, sha256, bytes, mime, last_put) VALUES (?,?,?,?,?) ON CONFLICT(user_id, sha256) DO UPDATE SET bytes = excluded.bytes, mime = excluded.mime, last_put = excluded.last_put')
    .bind(userId, actual, buf.byteLength, mime, new Date().toISOString()).run();
  return json({ key: `r2:${actual}`, sha256: actual, deduped: Boolean(existing) }, 200, request);
}
async function handleImageGet(request, env, userId, sha) {
  const object = await env.IMAGES.get(`${userId}/${sha}`);
  if (!object) return bad('图片不存在', 404, request);
  return new Response(object.body, { status: 200, headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/webp', 'Cache-Control': 'private, max-age=31536000', ...corsHeaders(request) } });
}

// 删号：清空该用户的 R2 图片 + D1 所有数据（记录/会话/序列/图片引用/用户）。不可撤销。
// R2 先删、D1 后删:反过来的话中途失败就丢了 userId,再也找不到那批对象。
// 即便这里删到一半失败,users 行仍在 → 下次重试可继续;若 users 行已没了,
// cron 全量兜底会把这个无主前缀整个清掉。
async function handleDeleteAccount(request, env, userId) {
  await purgeUserPrefix(env, userId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM records WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM user_seq WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM image_refs WHERE user_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId)
  ]);
  return json({ deleted: true }, 200, request);
}

export default {
  // 每天一次全量兜底回收：捡增量回收漏掉的孤儿图（上传成功但记录从未 push）、
  // 本次改动之前就已泄漏的存量图,以及注销中途失败留下的无主前缀。
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweepOrphanImages(env).then(
      (deleted) => console.log(`image sweep: deleted ${deleted} objects`),
      (error) => console.error('image sweep', error)
    ));
  },

  async fetch(request, env, ctx) {
    if (!isCorsAllowed(request)) return new Response(null, { status: request.method === 'OPTIONS' ? 403 : 403, headers: { 'Vary': 'Origin' } });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (request.method === 'POST' && path === '/auth/register') return await handleRegister(request, env);
      if (request.method === 'POST' && path === '/auth/login') return await handleLogin(request, env);
      if (request.method === 'POST' && path === '/auth/recover') return await handleRecover(request, env);

      if (path === '/sync/hello') return json({ protocol: SYNC_PROTOCOL, minWritableProtocol: 1, minReadableProtocol: 1, types: TYPES }, 200, request);

      // 以下需要登录
      const userId = await currentUser(request, env);
      if (!userId) return bad('未登录', 401, request);

      if (request.method === 'GET' && path === '/sync/pull') return await handlePull(request, env, userId);
      if (request.method === 'POST' && path === '/sync/push') return await handlePush(request, env, userId, ctx);
      if (request.method === 'POST' && path === '/auth/delete') return await handleDeleteAccount(request, env, userId);

      const imageMatch = path.match(/^\/images\/([a-f0-9]{64})$/);
      if (imageMatch) {
        if (request.method === 'PUT') return await handleImagePut(request, env, userId, imageMatch[1]);
        if (request.method === 'GET') return await handleImageGet(request, env, userId, imageMatch[1]);
      }
      return bad('未找到', 404, request);
    } catch (error) {
      console.error(error);
      return bad('服务器暂时不可用', 500, request);
    }
  }
};
