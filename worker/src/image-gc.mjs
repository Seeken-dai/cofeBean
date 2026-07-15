// R2 图片回收（标记-清除）。
//
// 为什么不是引用计数：上传（PUT /images/:sha）与记录落库（POST /sync/push）是两个独立请求，
// push 会因网络重试而重放，同一张图又可能被多条记录同时引用。任何一次「减一」丢失或重放，
// 计数就会漂移 —— 漂移的结果要么是永久泄漏对象，要么是删掉仍在使用的图。
// 改为从 records 表推导存活集合后，GC 变成幂等操作：重复执行无副作用，计数漂移不可能发生。
//
// 存活定义：该用户任一 deleted_at IS NULL 的记录，其 payload 中引用了该 sha。
// 宽限期：image_refs.last_put 在 GRACE_MS 内的 sha 一律跳过 —— 覆盖「已上传、尚未 push」
// 以及「另一台设备刚上传、push 还在路上」这两段窗口，否则会删掉马上就要被引用的对象。

const R2_PREFIX = 'r2:';
const SHA_RE = /^[a-f0-9]{64}$/;

// bean 的原图、手账抠图、标签图片字段 + drinkLog.photos[]；brewPlan 不带图片。
const IMAGE_FIELDS = ['bagImagePath', 'bagCutoutImagePath', 'labelImagePath'];

// 新上传的图在这段时间内不回收，等它对应的记录 push 上来。
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
// R2 单次 delete 接受最多 1000 个 key；D1 单条 IN 语句的绑定参数也需要收敛。
const R2_DELETE_CHUNK = 1000;
const D1_BIND_CHUNK = 100;

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function shaFromRef(value) {
  if (typeof value !== 'string' || !value.startsWith(R2_PREFIX)) return null;
  const sha = value.slice(R2_PREFIX.length);
  return SHA_RE.test(sha) ? sha : null;
}

export function collectPayloadShas(payload, out) {
  const shas = out || new Set();
  if (!payload || typeof payload !== 'object') return shas;
  for (const field of IMAGE_FIELDS) {
    const sha = shaFromRef(payload[field]);
    if (sha) shas.add(sha);
  }
  if (Array.isArray(payload.photos)) {
    for (const photo of payload.photos) {
      const sha = shaFromRef(photo);
      if (sha) shas.add(sha);
    }
  }
  return shas;
}

export function parsePayloadShas(payloadJson, out) {
  const shas = out || new Set();
  try {
    return collectPayloadShas(JSON.parse(payloadJson || '{}'), shas);
  } catch {
    return shas; // 坏 JSON 宁可当作「引用了未知内容」→ 不贡献存活集，但也不阻塞 GC
  }
}

// 该用户所有未删除记录引用到的 sha —— GC 的「标记」阶段。
export async function collectLiveShas(env, userId) {
  const result = await env.DB.prepare('SELECT payload_json FROM records WHERE user_id = ? AND deleted_at IS NULL')
    .bind(userId).all();
  const live = new Set();
  (result.results || []).forEach((row) => parsePayloadShas(row.payload_json, live));
  return live;
}

// 宽限期内刚上传过的 sha：记录可能还在路上，不能删。
async function collectRecentShas(env, userId, now) {
  const cutoff = new Date(now - GRACE_MS).toISOString();
  const result = await env.DB.prepare('SELECT sha256 FROM image_refs WHERE user_id = ? AND last_put > ?')
    .bind(userId, cutoff).all();
  return new Set((result.results || []).map((row) => row.sha256));
}

async function deleteImageObjects(env, userId, shas) {
  if (!shas.length) return 0;
  for (const group of chunk(shas.map((sha) => `${userId}/${sha}`), R2_DELETE_CHUNK)) {
    await env.IMAGES.delete(group);
  }
  const stmts = chunk(shas, D1_BIND_CHUNK).map((group) => env.DB
    .prepare(`DELETE FROM image_refs WHERE user_id = ? AND sha256 IN (${group.map(() => '?').join(',')})`)
    .bind(userId, ...group));
  if (stmts.length) await env.DB.batch(stmts);
  return shas.length;
}

// push 后的增量回收：只考察本次被解引用的候选 sha，不做全量 list。
export async function collectGarbage(env, userId, candidateShas, now) {
  const candidates = [...candidateShas];
  if (!candidates.length) return 0;
  const [live, recent] = await Promise.all([
    collectLiveShas(env, userId),
    collectRecentShas(env, userId, now || Date.now())
  ]);
  return deleteImageObjects(env, userId, candidates.filter((sha) => !live.has(sha) && !recent.has(sha)));
}

async function listPrefix(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const listed = await env.IMAGES.list({ prefix, cursor });
    for (const obj of (listed.objects || [])) keys.push(obj.key);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return keys;
}

// 整个前缀清空：用户已不存在（注销成功，或注销中途失败留下的半截数据）。
export async function purgeUserPrefix(env, userId) {
  const keys = await listPrefix(env, `${userId}/`);
  for (const group of chunk(keys, R2_DELETE_CHUNK)) await env.IMAGES.delete(group);
  await env.DB.prepare('DELETE FROM image_refs WHERE user_id = ?').bind(userId).run();
  return keys.length;
}

async function sweepUser(env, userId, now) {
  const [live, recent] = await Promise.all([collectLiveShas(env, userId), collectRecentShas(env, userId, now)]);
  const orphans = (await listPrefix(env, `${userId}/`))
    .map((key) => key.slice(userId.length + 1))
    .filter((sha) => SHA_RE.test(sha) && !live.has(sha) && !recent.has(sha));
  return deleteImageObjects(env, userId, orphans);
}

// cron 全量兜底：捡起增量回收漏掉的孤儿 —— 上传成功但 push 永远没来的图、
// 早于本次改动就已泄漏的存量图、以及注销中途失败留下的整个前缀。
export async function sweepOrphanImages(env, now) {
  const at = now || Date.now();
  const users = await env.DB.prepare('SELECT id FROM users').all();
  const known = new Set((users.results || []).map((row) => row.id));

  let deleted = 0;
  let cursor;
  do {
    const listed = await env.IMAGES.list({ delimiter: '/', cursor });
    for (const prefix of (listed.delimitedPrefixes || [])) {
      const userId = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      deleted += known.has(userId)
        ? await sweepUser(env, userId, at)
        : await purgeUserPrefix(env, userId);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}
