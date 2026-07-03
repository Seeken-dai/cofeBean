export const PULL_LIMIT = 1000;
export const TYPE_BUCKET = { bean: 'beans', drinkLog: 'drinkLogs', brewPlan: 'brewPlans' };
export const REQUEST_BUCKET = { beans: 'bean', drinkLogs: 'drinkLog', brewPlans: 'brewPlan' };

export function isNewer(a, b) {
  const ta = Date.parse(a.updated_at) || 0;
  const tb = Date.parse(b.updated_at) || 0;
  if (ta !== tb) return ta > tb;
  const ra = Number(a.revision) || 0;
  const rb = Number(b.revision) || 0;
  if (ra !== rb) return ra > rb;
  return String(a.device_id || '') > String(b.device_id || '');
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
