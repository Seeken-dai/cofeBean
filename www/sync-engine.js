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
  //   transport  —— { pull(cursor) -> {beans,drinkLogs,brewPlans,cursor,hasMore}, push(records,cursor) -> {cursor} }
  //   getLocal   —— () -> {beans,drinkLogs,brewPlans}（全量，含墓碑）
  //   applyLocal —— (merged) -> void|Promise（把合并结果写回本地）
  //   cursor     —— 起始游标（可选）
  //   pushState  —— 上次成功 push 后的记录签名（可选）
  function createEngine(deps) {
    const core = deps.core || (typeof window !== 'undefined' ? window.BeanCore : null);
    if (!core || typeof core.mergeSyncRecords !== 'function') throw new Error('缺少 BeanCore.mergeSyncRecords');
    const transport = deps.transport;
    const getLocal = deps.getLocal;
    const applyLocal = deps.applyLocal;
    let cursor = deps.cursor || null;
    let pushState = normalizePushState(deps.pushState);

    function mergeAll(local, remote) {
      return {
        beans: core.mergeSyncRecords(local.beans || [], remote.beans || []),
        drinkLogs: core.mergeSyncRecords(local.drinkLogs || [], remote.drinkLogs || []),
        // 预置方案不进同步集：本地与远端都先剔除 source==='preset'
        brewPlans: core.mergeSyncRecords(core.syncablePlans(local.brewPlans || []), core.syncablePlans(remote.brewPlans || []))
      };
    }

    function stableValue(value) {
      if (Array.isArray(value)) return value.map(stableValue);
      if (value && typeof value === 'object') {
        return Object.keys(value).sort().reduce((out, key) => {
          out[key] = stableValue(value[key]);
          return out;
        }, {});
      }
      return value;
    }

    function signature(record) { return JSON.stringify(stableValue(record || {})); }
    function normalizePushState(source) {
      const value = source && typeof source === 'object' ? source : {};
      return {
        beans: value.beans && typeof value.beans === 'object' ? { ...value.beans } : {},
        drinkLogs: value.drinkLogs && typeof value.drinkLogs === 'object' ? { ...value.drinkLogs } : {},
        brewPlans: value.brewPlans && typeof value.brewPlans === 'object' ? { ...value.brewPlans } : {}
      };
    }
    function buildPushState(records) {
      const next = { beans: {}, drinkLogs: {}, brewPlans: {} };
      ['beans', 'drinkLogs', 'brewPlans'].forEach((bucket) => {
        (records[bucket] || []).forEach((record) => {
          if (record && record.id) next[bucket][record.id] = signature(record);
        });
      });
      return next;
    }
    function changedRecords(records) {
      const nextState = buildPushState(records);
      const out = { beans: [], drinkLogs: [], brewPlans: [] };
      ['beans', 'drinkLogs', 'brewPlans'].forEach((bucket) => {
        (records[bucket] || []).forEach((record) => {
          if (record && record.id && pushState[bucket][record.id] !== nextState[bucket][record.id]) out[bucket].push(record);
        });
      });
      return { records: out, state: nextState };
    }

    async function pullAll(startCursor) {
      let pullCursor = startCursor || null;
      let pulled = { beans: [], drinkLogs: [], brewPlans: [] };
      for (let i = 0; i < 100; i += 1) {
        const page = (await transport.pull(pullCursor)) || {};
        pulled = mergeAll(pulled, page);
        const nextCursor = page.cursor || pullCursor;
        if (!page.hasMore || nextCursor === pullCursor) return { records: pulled, cursor: nextCursor };
        pullCursor = nextCursor;
      }
      throw new Error('同步拉取页数过多，请稍后重试');
    }

    async function sync() {
      const local = (await getLocal()) || {};
      const initialPull = await pullAll(cursor);
      let merged = mergeAll(local, initialPull.records);
      await applyLocal(merged);
      const pushBaseCursor = initialPull.cursor || cursor;
      const delta = changedRecords(merged);
      await transport.push(delta.records, pushBaseCursor);
      const finalPull = await pullAll(pushBaseCursor);
      if ((finalPull.records.beans || []).length || (finalPull.records.drinkLogs || []).length || (finalPull.records.brewPlans || []).length) {
        merged = mergeAll(merged, finalPull.records);
        await applyLocal(merged);
      }
      cursor = finalPull.cursor || pushBaseCursor || cursor;
      pushState = buildPushState(merged);
      return { cursor, merged, pushState };
    }

    return {
      sync,
      mergeAll,
      getCursor: () => cursor,
      setCursor: (value) => { cursor = value || null; },
      getPushState: () => normalizePushState(pushState),
      setPushState: (value) => { pushState = normalizePushState(value); }
    };
  }

  return { createEngine };
});
