// 同步 LWW 裁决 —— 客户端(data-core)与云端 Worker(sync-logic)共用的唯一实现。
// 详见 plan/SYNC_PROTOCOL_DESIGN.md §5:按 (updatedAt, revision, deviceId) 三级裁决。
// deviceId 平局位必须用码元比较(> / <),禁止 localeCompare:后者随运行环境的
// locale/ICU 数据变化,两端可能裁出不同胜者,导致设备间数据永不收敛。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanSyncCompare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 记录信封形状:{ updatedAt, revision, deviceId }。返回 <0 / 0 / >0(a 旧 / 平 / a 新)。
  function compareSyncRecords(a, b) {
    const ta = Date.parse(a && a.updatedAt) || 0;
    const tb = Date.parse(b && b.updatedAt) || 0;
    if (ta !== tb) return ta - tb;
    const ra = Number(a && a.revision) || 0;
    const rb = Number(b && b.revision) || 0;
    if (ra !== rb) return ra - rb;
    const da = String((a && a.deviceId) || '');
    const db = String((b && b.deviceId) || '');
    if (da === db) return 0;
    return da > db ? 1 : -1;
  }

  return { compareSyncRecords };
});
