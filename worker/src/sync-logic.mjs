// LWW 裁决与客户端共用同一份实现(www/sync-compare.js),wrangler 打包时会一并内联。
// 禁止在这里另写一份比较逻辑:两端分歧会导致设备间数据永不收敛。
import syncCompare from '../../www/sync-compare.js';

export const PULL_LIMIT = 1000;
export const TYPE_BUCKET = { bean: 'beans', drinkLog: 'drinkLogs', brewPlan: 'brewPlans' };
export const REQUEST_BUCKET = { beans: 'bean', drinkLogs: 'drinkLog', brewPlans: 'brewPlan' };

// D1 行是 snake_case,先映射到信封字段再裁决。
export function isNewer(a, b) {
  return syncCompare.compareSyncRecords(
    { updatedAt: a.updated_at, revision: a.revision, deviceId: a.device_id },
    { updatedAt: b.updated_at, revision: b.revision, deviceId: b.device_id }
  ) > 0;
}

export function rowToEnvelope(row) {
  return {
    type: row.type,
    id: row.id,
    revision: row.revision,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || null,
    deviceId: row.device_id || '',
    payload: JSON.parse(row.payload_json || '{}')
  };
}

export function collectIncoming(body) {
  const incoming = [];
  Object.keys(REQUEST_BUCKET).forEach((key) => {
    (body[key] || []).forEach((rec) => {
      if (rec && rec.id) incoming.push({ type: REQUEST_BUCKET[key], rec });
    });
  });
  return incoming;
}

export function recordKey(type, id) {
  return `${type}\u0000${id}`;
}

export function shouldAcceptRecord(rec, stored) {
  if (!stored) return true;
  return isNewer({ updated_at: rec.updatedAt, revision: rec.revision, device_id: rec.deviceId }, stored);
}

export function assignServerSeq(records, startSeq) {
  return records.map((item, index) => ({ ...item, serverSeq: startSeq + index }));
}
