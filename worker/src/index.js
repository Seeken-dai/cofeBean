// 豆仓同步后端 Worker（阶段 4.3）。
// 方案 (a) 非严格 E2E：服务端可读，传输 HTTPS + 静态加密；密码只存哈希。
// 端点：/auth/register /auth/login /auth/recover /sync/hello /sync/pull /sync/push /images/:sha
// 合并采用 last-write-wins（updated_at → revision → device_id）+ 墓碑；与客户端 data-core 一致。

const SYNC_PROTOCOL = 1;
const TYPES = ['bean', 'drinkLog', 'brewPlan'];
const ALLOWED_ORIGINS = ['https://cofebean.pages.dev', 'http://localhost:4178', 'http://127.0.0.1:4178'];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
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
function normEmail(email) { return String(email || '').trim().toLowerCase(); }

// LWW：a 是否比 b 新（与客户端 compareSyncRecords 一致）
function isNewer(a, b) {
  const ta = Date.parse(a.updated_at) || 0; const tb = Date.parse(b.updated_at) || 0;
  if (ta !== tb) return ta > tb;
  const ra = Number(a.revision) || 0; const rb = Number(b.revision) || 0;
  if (ra !== rb) return ra > rb;
  return String(a.device_id || '') > String(b.device_id || '');
}

// ---- 鉴权 ----
async function currentUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const row = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!row) return null;
  return row.user_id;
}
async function createSession(env, userId) {
  const token = randomHex(32);
  await env.DB.prepare('INSERT INTO sessions (token, user_id, created_at, last_seen) VALUES (?,?,?,?)')
    .bind(token, userId, new Date().toISOString(), new Date().toISOString()).run();
  return token;
}

async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || '');
  const recoveryCode = String(body.recoveryCode || '');
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
function rowToEnvelope(row) {
  return { type: row.type, id: row.id, revision: row.revision, updatedAt: row.updated_at, deletedAt: row.deleted_at || null, deviceId: row.device_id || '', payload: JSON.parse(row.payload_json || '{}') };
}
async function handlePull(request, env, userId) {
  const cursor = Number(new URL(request.url).searchParams.get('cursor')) || 0;
  const result = await env.DB.prepare('SELECT * FROM records WHERE user_id = ? AND server_seq > ? ORDER BY server_seq ASC LIMIT 1000')
    .bind(userId, cursor).all();
  const rows = result.results || [];
  const out = { beans: [], drinkLogs: [], brewPlans: [] };
  let nextCursor = cursor;
  const bucket = { bean: 'beans', drinkLog: 'drinkLogs', brewPlan: 'brewPlans' };
  rows.forEach((row) => { out[bucket[row.type]].push(rowToEnvelope(row)); if (row.server_seq > nextCursor) nextCursor = row.server_seq; });
  return json({ ...out, cursor: nextCursor, protocol: SYNC_PROTOCOL }, 200, request);
}
async function handlePush(request, env, userId) {
  const body = await request.json().catch(() => ({}));
  const incoming = [];
  const bucket = { beans: 'bean', drinkLogs: 'drinkLog', brewPlans: 'brewPlan' };
  Object.keys(bucket).forEach((key) => (body[key] || []).forEach((rec) => { if (rec && rec.id) incoming.push({ type: bucket[key], rec }); }));

  const seqRow = await env.DB.prepare('SELECT seq FROM user_seq WHERE user_id = ?').bind(userId).first();
  let seq = seqRow ? Number(seqRow.seq) : 0;
  const stmts = [];
  let accepted = 0;
  for (const { type, rec } of incoming) {
    const stored = await env.DB.prepare('SELECT updated_at, revision, device_id FROM records WHERE user_id = ? AND type = ? AND id = ?').bind(userId, type, rec.id).first();
    const candidate = { updated_at: rec.updatedAt, revision: rec.revision, device_id: rec.deviceId };
    if (stored && !isNewer(candidate, stored)) continue; // 服务端已有更新或同等版本，忽略
    seq += 1; accepted += 1;
    stmts.push(env.DB.prepare(
      'INSERT INTO records (user_id, type, id, revision, updated_at, deleted_at, device_id, payload_json, server_seq) VALUES (?,?,?,?,?,?,?,?,?) ' +
      'ON CONFLICT(user_id, type, id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, device_id=excluded.device_id, payload_json=excluded.payload_json, server_seq=excluded.server_seq'
    ).bind(userId, type, rec.id, rec.revision || 1, rec.updatedAt, rec.deletedAt || null, rec.deviceId || '', JSON.stringify(rec.payload || {}), seq));
  }
  stmts.push(env.DB.prepare('INSERT INTO user_seq (user_id, seq) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET seq = excluded.seq').bind(userId, seq));
  if (stmts.length) await env.DB.batch(stmts);
  return json({ accepted, cursor: seq, protocol: SYNC_PROTOCOL }, 200, request);
}

// ---- 图片（R2，用户作用域 key = userId/sha256）----
async function handleImagePut(request, env, userId, sha) {
  const key = `${userId}/${sha}`;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > 5 * 1024 * 1024) return bad('图片过大', 413, request);
  const actual = await sha256Hex(buf);
  if (sha && sha !== actual) return bad('sha256 不匹配', 400, request);
  const existing = await env.IMAGES.head(key);
  if (!existing) {
    const mime = request.headers.get('Content-Type') || 'image/webp';
    await env.IMAGES.put(key, buf, { httpMetadata: { contentType: mime } });
    await env.DB.prepare('INSERT INTO image_refs (user_id, sha256, bytes, mime, ref_count) VALUES (?,?,?,?,1) ON CONFLICT(user_id, sha256) DO UPDATE SET ref_count = ref_count + 1')
      .bind(userId, actual, buf.byteLength, mime).run();
  }
  return json({ key: `r2:${actual}`, sha256: actual, deduped: Boolean(existing) }, 200, request);
}
async function handleImageGet(request, env, userId, sha) {
  const object = await env.IMAGES.get(`${userId}/${sha}`);
  if (!object) return bad('图片不存在', 404, request);
  return new Response(object.body, { status: 200, headers: { 'Content-Type': object.httpMetadata?.contentType || 'image/webp', 'Cache-Control': 'private, max-age=31536000', ...corsHeaders(request) } });
}

export default {
  async fetch(request, env) {
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
      if (request.method === 'POST' && path === '/sync/push') return await handlePush(request, env, userId);

      const imageMatch = path.match(/^\/images\/([a-f0-9]{64})$/);
      if (imageMatch) {
        if (request.method === 'PUT') return await handleImagePut(request, env, userId, imageMatch[1]);
        if (request.method === 'GET') return await handleImageGet(request, env, userId, imageMatch[1]);
      }
      return bad('未找到', 404, request);
    } catch (error) {
      return bad('服务器错误：' + (error && error.message || error), 500, request);
    }
  }
};
