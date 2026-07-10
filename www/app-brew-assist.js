// app.js 拆分第三批:手冲冲煮辅助(圆环计时、分段推进、WakeLock)。
// 约定:计时器句柄与 WakeLock 是本模块私有状态;冲煮进行态仍存 state.brewAssist
// (关闭/恢复对话框等外部逻辑要读它)。依赖经 create(deps) 显式注入:
//   $ / $$ / state / els                         —— app.js 的选择器与共享状态
//   core                                          —— BeanCore(normalizeBrewPlan/prepareBrewAssistSteps/brewAssistStatus)
//   toast / setDialog                             —— app.js 工具
//   esc / formatWeight / durationText             —— AppFormat 纯函数
//   setDurationControl / syncRatioValue / syncDurationField —— 表单联动(回填用)
//   currentDrinkMethod / selectedDrinkPlan / drinkParamSnapshot / openPlanDetail —— 喝一杯/方案页入口与返回
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppBrewAssist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(deps) {
    const { $, $$, state, els, core, toast, setDialog, esc, formatWeight, durationText, setDurationControl, syncRatioValue, syncDurationField, currentDrinkMethod, selectedDrinkPlan, drinkParamSnapshot, openPlanDetail } = deps;
    ['$', '$$', 'state', 'els', 'core', 'toast', 'setDialog', 'esc', 'formatWeight', 'durationText'].forEach((key) => {
      if (!deps[key]) throw new Error(`AppBrewAssist.create 缺少依赖:${key}`);
    });

    let assistTimer = null;
    let wakeLock = null;

    function assistClock(seconds) {
      const safe = Math.max(0, Math.round(Number(seconds) || 0));
      return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
    }
    function assistElapsed() {
      const assist = state.brewAssist;
      if (!assist || assist.completed) return assist ? assist.completedElapsed : 0;
      return assist.elapsed + (assist.paused || !assist.startedAt ? 0 : (Date.now() - assist.startedAt) / 1000);
    }
    function assistTotalWater(plan) {
      const total = Number(plan.totalWater) || core.prepareBrewAssistSteps(plan.steps).reduce((sum, step) => sum + (Number(step.water) || 0), 0);
      return total ? formatWeight(total) : '未记录';
    }
    function stopAssistTimer() {
      if (assistTimer) cancelAnimationFrame(assistTimer);
      assistTimer = null;
    }
    function showAssistComplete(elapsed) {
      const assist = state.brewAssist;
      if (!assist) return;
      assist.completed = true;
      assist.completedElapsed = Math.max(0, elapsed || assistElapsed());
      stopAssistTimer();
      $('#brewAssistRunning').hidden = true;
      $('#brewAssistComplete').hidden = false;
      $('#brewAssistResultMeta').textContent = assist.source === 'drink' ? '可回填到「喝一杯」继续评价。' : '本次辅助不会生成饮用记录。';
      $('#brewAssistResultDuration').textContent = durationText(assist.completedElapsed, 'minute');
      $('#brewAssistResultWater').textContent = assistTotalWater(assist.plan);
      $('#brewAssistResultPlan').textContent = assist.plan.name || '未命名方案';
      $('#brewAssistResultSteps').textContent = `${assist.steps.length} 段`;
      $('#brewAssistPause').hidden = true;
      $('#brewAssistSkip').hidden = true;
      $('#brewAssistFinish').textContent = assist.source === 'drink' ? '回填并继续记录' : '完成';
      $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
    }
    // 圆环中心突出「本段注水量」；无水量时回退显示占位。
    function setAssistWater(step) {
      const hasWater = step && step.water;
      $('#brewAssistWater').textContent = hasWater ? formatWeight(step.water) : (step ? '—' : '准备器具');
      $('#brewAssistWaterCaption').textContent = hasWater ? '本段目标注水' : (step ? '本段未记录水量' : '确认粉量、水量和器具后开始');
    }
    function assistNextBrief(step) {
      return `${step.label} · ${durationText(step.duration, 'minute')}${step.water ? ` · ${formatWeight(step.water)}` : ''}`;
    }
    // 圆环下方常驻「下一段」预览，避免临近换段时还要去列表里翻找。
    function setAssistNext(step, overtime) {
      const label = $('#brewAssistNextLabel');
      const text = $('#brewAssistNextText');
      if (overtime) { label.textContent = '手动结束'; text.textContent = '已到方案时间，点「结束」记录实际用时'; return; }
      if (step) { label.textContent = '下一段'; text.textContent = assistNextBrief(step); }
      else { label.textContent = '最后一段'; text.textContent = '完成后点「结束」记录用时'; }
    }
    function renderAssist() {
      const assist = state.brewAssist;
      if (!assist) return;
      const ring = $('#brewAssistRing');
      ring.classList.remove('assist-ring--gap');
      ring.setAttribute('aria-label', assist.phase === 'ready' ? '开始冲煮辅助' : '进入下一段');
      $('#brewAssistMeta').textContent = [assist.beanName, assist.plan.name, '手冲'].filter(Boolean).join(' · ');
      if (assist.phase === 'ready') {
        const first = assist.steps[0];
        $('#brewAssistPhase').textContent = `准备就绪 · 共 ${assist.steps.length} 段`;
        setAssistWater(first);
        $('#brewAssistTime').textContent = assistClock(0);
        $('#brewAssistStageMeta').textContent = first ? `${first.time} · 点圆环开始` : `全程 ${durationText(assist.total, 'minute')}`;
        $('#brewAssistRing').style.setProperty('--assist-progress', '0deg');
        setAssistNext(assist.steps[1], false);
        renderAssistSteps(-1);
        $('#brewAssistPause').textContent = '开始';
        $('#brewAssistSkip').hidden = true;
        $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
        return;
      }
      if (assist.phase === 'countdown') {
        const left = Math.max(0, 3 - (Date.now() - assist.countdownStartedAt) / 1000);
        $('#brewAssistPhase').textContent = '准备开始';
        setAssistWater(assist.steps[0]);
        $('#brewAssistTime').textContent = `00:0${Math.ceil(left) || 0}`;
        $('#brewAssistStageMeta').textContent = '倒计时结束进入第一段';
        $('#brewAssistRing').style.setProperty('--assist-progress', `${Math.min(360, (3 - left) / 3 * 360)}deg`);
        setAssistNext(assist.steps[1], false);
        renderAssistSteps(-1);
        $('#brewAssistPause').hidden = true;
        $('#brewAssistSkip').hidden = true;
        if (left <= 0) {
          assist.phase = 'running';
          assist.startedAt = Date.now();
          assist.elapsed = 0;
          renderAssist();
        }
        return;
      }
      const elapsed = assistElapsed();
      const status = core.brewAssistStatus(assist.steps, elapsed);
      // 两段之间的等待间奏：主圆环从满到空「回退」倒计时，提示用户此刻处于等待、准备下一段。
      if (status.phase === 'gap') {
        const remaining = Math.max(0, status.gapEnd - elapsed);
        const span = Math.max(1, status.gapEnd - status.gapStart);
        ring.classList.add('assist-ring--gap');
        // 大数字与下方计时用同一个 ceil 值，避免 ceil 与 assistClock 内部 round 不一致导致两处差 1 秒。
        const gapShown = Math.ceil(remaining);
        $('#brewAssistPhase').textContent = '等待间奏 · 准备下一段';
        $('#brewAssistWater').textContent = String(gapShown);
        $('#brewAssistWaterCaption').textContent = '秒后进入下一段';
        $('#brewAssistTime').textContent = assistClock(gapShown);
        $('#brewAssistStageMeta').textContent = status.next ? `下一段：${status.next.label}` : '';
        $('#brewAssistRing').style.setProperty('--assist-progress', `${Math.max(0, Math.min(360, remaining / span * 360))}deg`);
        setAssistNext(status.next, false);
        if (renderAssistSteps(status.index + 1)) scrollAssistToStage(status.index + 1);
        $('#brewAssistPause').hidden = false;
        $('#brewAssistSkip').hidden = false;
        $('#brewAssistPause').textContent = assist.paused ? '继续' : '暂停';
        $('#brewAssistFinish').textContent = '结束';
        $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
        return;
      }
      const current = status.current;
      // 到达方案总时长后不再自动结束：继续为最后一段计时（超时），由用户手动点「结束」记录实际用时。
      const overtime = status.phase === 'done';
      const next = assist.steps[status.index + 1];
      const stageElapsed = Math.max(0, elapsed - current.start);
      $('#brewAssistPhase').textContent = overtime ? `最后一段 · ${current.label}` : `第 ${status.index + 1}/${assist.steps.length} 段 · ${current.label}`;
      setAssistWater(current);
      $('#brewAssistTime').textContent = assistClock(stageElapsed);
      $('#brewAssistStageMeta').textContent = overtime ? `已超出方案 ${durationText(Math.max(0, elapsed - assist.total), 'minute')}` : current.time;
      $('#brewAssistRing').style.setProperty('--assist-progress', `${overtime ? 360 : Math.min(360, stageElapsed / current.duration * 360)}deg`);
      setAssistNext(next, overtime);
      if (renderAssistSteps(status.index)) scrollAssistToStage(status.index);
      $('#brewAssistPause').hidden = false;
      $('#brewAssistSkip').hidden = !next;
      $('#brewAssistPause').textContent = assist.paused ? '继续' : '暂停';
      $('#brewAssistFinish').textContent = overtime ? '结束记录' : '结束';
      $('#brewAssistFinish').classList.toggle('assist-finish-emphasis', overtime);
    }
    function renderAssistSteps(activeIndex) {
      const assist = state.brewAssist;
      if (!assist || assist.renderedStepIndex === activeIndex) return false;
      assist.renderedStepIndex = activeIndex;
      $('#brewAssistSteps').innerHTML = assist.steps.map((step, index) => assistStepTemplate(step, index, activeIndex)).join('');
      return true;
    }
    function scrollAssistToStage(activeIndex) {
      if (activeIndex < 0) return;
      const scroll = $('#brewAssistScroll');
      const active = $('#brewAssistSteps').children[activeIndex];
      if (!scroll || !active) return;
      const target = scroll.scrollTop + (active.getBoundingClientRect().top - scroll.getBoundingClientRect().top) - (scroll.clientHeight - active.offsetHeight) / 2;
      scroll.scrollTop = Math.max(0, target);
    }
    function assistStepTemplate(step, index, activeIndex) {
      const cls = index < activeIndex ? ' done' : index === activeIndex ? ' active' : '';
      return `<article class="assist-step${cls}"><b>${index < activeIndex ? '✓' : index + 1}</b><div><span>${esc(step.label)}</span><small>${esc(step.time)}</small></div><em>${step.water ? esc(formatWeight(step.water)) : '未记录'}</em></article>`;
    }
    function startAssistTimer() {
      stopAssistTimer();
      // 用 rAF 逐帧驱动，圆环进度由墙钟计算，做到 60fps 顺滑（进度精度不依赖帧率）。
      const loop = () => { renderAssist(); if (assistTimer) assistTimer = requestAnimationFrame(loop); };
      assistTimer = requestAnimationFrame(loop);
    }
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator && navigator.wakeLock && !wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
      } catch (_) { wakeLock = null; }
    }
    async function releaseWakeLock() {
      try { if (wakeLock) await wakeLock.release(); } catch (_) {}
      wakeLock = null;
    }
    function openBrewAssist(source, plan, beanName) {
      const normalized = core.normalizeBrewPlan(plan);
      const steps = core.prepareBrewAssistSteps(normalized.steps);
      if (normalized.brewMethod !== '手冲') return toast('第一版冲煮辅助仅支持手冲');
      if (!steps.length) return toast('这个方案还没有可计时的分段步骤');
      state.brewAssist = { source, plan: normalized, beanName: beanName || '', steps, total: steps[steps.length - 1].end, phase: 'ready', countdownStartedAt: null, startedAt: null, elapsed: 0, paused: false, completed: false, completedElapsed: 0, renderedStepIndex: null };
      $('#brewAssistRunning').hidden = false;
      $('#brewAssistComplete').hidden = true;
      $('#brewAssistPause').hidden = false;
      $('#brewAssistSkip').hidden = true;
      $('#brewAssistPause').textContent = '开始';
      $('#brewAssistFinish').textContent = '退出';
      $('#brewAssistFinish').classList.remove('assist-finish-emphasis');
      if (source === 'drink') setDialog(els.drink, false);
      if (source === 'plan') setDialog(els.planDetail, false);
      renderAssist();
      startAssistTimer();
      setDialog(els.brewAssist, true);
      requestWakeLock();
    }
    function openDrinkBrewAssist() {
      if (currentDrinkMethod() !== '手冲') return toast('第一版冲煮辅助仅支持手冲');
      syncRatioValue('drink');
      $$('.duration-field', els.drinkForm).forEach(syncDurationField);
      const plan = selectedDrinkPlan();
      const snapshot = drinkParamSnapshot('手冲', plan);
      const bean = state.beans.find((item) => item.id === $('#drink-beanId').value);
      openBrewAssist('drink', snapshot, bean && bean.name);
    }
    function openPlanBrewAssist() {
      const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
      openBrewAssist('plan', plan, '');
    }
    function pauseBrewAssist() {
      const assist = state.brewAssist;
      if (!assist || assist.completed) return;
      if (assist.phase === 'ready') {
        assist.phase = 'countdown';
        assist.countdownStartedAt = Date.now();
        $('#brewAssistFinish').textContent = '结束';
        renderAssist();
        return;
      }
      if (assist.phase !== 'running') return;
      if (assist.paused) { assist.paused = false; assist.startedAt = Date.now(); }
      else { assist.elapsed = assistElapsed(); assist.paused = true; assist.startedAt = null; }
      renderAssist();
    }
    // 冲煮中点圆环 = 进入下一阶段（暂停改由底部按钮）；准备阶段点圆环仍是开始。
    function tapBrewAssistRing() {
      const assist = state.brewAssist;
      if (!assist || assist.completed) return;
      if (assist.phase === 'ready') return pauseBrewAssist();
      if (assist.phase !== 'running') return;
      skipBrewAssistStage();
    }
    function skipBrewAssistStage() {
      const assist = state.brewAssist;
      if (!assist || assist.completed || assist.phase !== 'running') return;
      const status = core.brewAssistStatus(assist.steps, assistElapsed());
      const next = assist.steps[status.index + 1];
      if (!next) return showAssistComplete(assistElapsed());
      assist.elapsed = next.start;
      assist.startedAt = assist.paused ? null : Date.now();
      renderAssist();
    }
    function finishBrewAssist() {
      const assist = state.brewAssist;
      if (!assist) return;
      if (assist.phase === 'ready') return cancelBrewAssist();
      if (!assist.completed) return showAssistComplete(assistElapsed());
      setDialog(els.brewAssist, false);
      stopAssistTimer();
      releaseWakeLock();
      if (assist.source === 'drink') {
        $('#drink-param-targetDuration').value = durationText(assist.completedElapsed, 'minute');
        const durationField = $('[data-duration-target="drink-param-targetDuration"]', els.drinkForm);
        if (durationField) setDurationControl(durationField, $('#drink-param-targetDuration').value);
        toast('已回填冲煮时长，可继续评价');
        setDialog(els.drink, true);
      } else {
        const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
        if (plan) openPlanDetail(plan);
      }
      state.brewAssist = null;
    }
    function cancelBrewAssist() {
      const assist = state.brewAssist;
      setDialog(els.brewAssist, false);
      stopAssistTimer();
      releaseWakeLock();
      if (assist && assist.source === 'drink') setDialog(els.drink, true);
      if (assist && assist.source === 'plan') {
        const plan = state.brewPlans.find((item) => item.id === state.viewingPlanId);
        if (plan) openPlanDetail(plan);
      }
      state.brewAssist = null;
    }

    // assistClock/assistElapsed 一并导出,供 Node 测试验证计时换算与暂停语义。
    return { openDrinkBrewAssist, openPlanBrewAssist, pauseBrewAssist, tapBrewAssistRing, skipBrewAssistStage, finishBrewAssist, cancelBrewAssist, requestWakeLock, assistClock, assistElapsed };
  }

  return { create };
});
