// 豆仓客户端同步引擎骨架（阶段 4.2）。
// 纯逻辑、依赖注入：不直接耦合仓储/网络，便于本地测试与两端复用。
// 合并复用 BeanCore.mergeSyncRecords（LWW + 墓碑）；预置方案不进同步集。
// 真实云端 transport 在阶段 4.3/4.4 接入；此处只定义 pull→合并→applyLocal→push 的流程。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BeanSync = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // deps:
  //   core       —— BeanCore（含 mergeSyncRecords / syncablePlans）
  //   transport  —— { pull(cursor) -> {beans,drinkLogs,brewPlans,cursor}, push(records,cursor) -> {cursor} }
  //   getLocal   —— () -> {beans,drinkLogs,brewPlans}（全量，含墓碑）
  //   applyLocal —— (merged) -> void|Promise（把合并结果写回本地）
  //   cursor     —— 起始游标（可选）
  function createEngine(deps) {
    const core = deps.core || (typeof window !== 'undefined' ? window.BeanCore : null);
    if (!core || typeof core.mergeSyncRecords !== 'function') throw new Error('缺少 BeanCore.mergeSyncRecords');
    const transport = deps.transport;
    const getLocal = deps.getLocal;
    const applyLocal = deps.applyLocal;
    let cursor = deps.cursor || null;

    function mergeAll(local, remote) {
      return {
        beans: core.mergeSyncRecords(local.beans || [], remote.beans || []),
        drinkLogs: core.mergeSyncRecords(local.drinkLogs || [], remote.drinkLogs || []),
        // 预置方案不进同步集：本地与远端都先剔除 source==='preset'
        brewPlans: core.mergeSyncRecords(core.syncablePlans(local.brewPlans || []), core.syncablePlans(remote.brewPlans || []))
      };
    }

    async function sync() {
      const local = (await getLocal()) || {};
      const remote = (await transport.pull(cursor)) || {};
      const merged = mergeAll(local, remote);
      await applyLocal(merged);
      const pushed = (await transport.push(merged, cursor)) || {};
      cursor = pushed.cursor || remote.cursor || cursor;
      return { cursor, merged };
    }

    return {
      sync,
      mergeAll,
      getCursor: () => cursor,
      setCursor: (value) => { cursor = value || null; }
    };
  }

  return { createEngine };
});
