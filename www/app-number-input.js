// 移动端数字输入增强：高频字段使用共享滚轮面板，低频字段使用紧凑步进器。
// 纯数值函数可在 Node 中直接测试；DOM 控制器通过 enhance(root, profiles) 按需初始化。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppNumberInput = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROW_HEIGHT = 48;
  const WINDOW_RADIUS = 50;
  let controller = null;

  function decimals(value) {
    const text = String(value == null ? '' : value);
    if (/e-/i.test(text)) return Number(text.split(/e-/i)[1]) || 0;
    return (text.split('.')[1] || '').length;
  }

  function round(value, precision) {
    const scale = 10 ** Math.min(8, Math.max(0, precision || 0));
    return Math.round((Number(value) + Number.EPSILON) * scale) / scale;
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function resolveBound(value, fallback) {
    const next = typeof value === 'function' ? value() : value;
    return finite(next, fallback);
  }

  function stepValue(value, direction, options) {
    const config = options || {};
    const step = Math.abs(finite(config.step, 1)) || 1;
    const min = finite(config.min, -Infinity);
    const max = finite(config.max, Infinity);
    const base = finite(value, finite(config.defaultValue, Number.isFinite(min) ? min : 0));
    const precision = Math.max(decimals(step), decimals(base), decimals(min), decimals(max));
    return round(Math.min(max, Math.max(min, base + finite(direction, 0) * step)), precision);
  }

  function buildWheelWindow(current, options) {
    const config = options || {};
    const step = Math.abs(finite(config.step, 1)) || 1;
    const min = finite(config.min, -Infinity);
    const max = finite(config.max, Infinity);
    const radius = Math.max(2, Math.round(finite(config.radius, WINDOW_RADIUS)));
    const raw = finite(current, finite(config.defaultValue, Number.isFinite(min) ? min : 0));
    const center = round(Math.min(max, Math.max(min, raw)), Math.max(decimals(step), decimals(raw), decimals(min)));
    const precision = Math.max(decimals(step), decimals(center), decimals(min), decimals(max));
    const values = [];
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = round(center + offset * step, precision);
      if (value >= min && value <= max) values.push(value);
    }
    let index = values.findIndex((value) => value === center);
    if (index < 0) {
      values.push(center);
      values.sort((a, b) => a - b);
      index = values.indexOf(center);
    }
    return { values, index, value: center };
  }

  function rankSuggestions(candidates, options) {
    const config = options || {};
    const min = finite(config.min, -Infinity);
    const max = finite(config.max, Infinity);
    const limit = Math.max(1, Math.round(finite(config.limit, 4)));
    const rows = [];
    const append = (entry, fallbackPriority, index) => {
      const item = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : { value: entry };
      const value = Number(item.value);
      if (!Number.isFinite(value) || value < min || value > max) return;
      rows.push({
        value,
        label: item.label,
        priority: finite(item.priority, fallbackPriority),
        timestamp: Number(new Date(item.timestamp || 0)) || 0,
        index
      });
    };
    if (config.current !== '' && config.current != null) append({ value: config.current, priority: 100 }, 100, -2);
    if (config.last !== '' && config.last != null) append({ value: config.last, priority: 90 }, 90, -1);
    (candidates || []).forEach((entry, index) => append(entry, 20, index));
    (config.defaults || []).forEach((entry, index) => append(entry, 0, 10000 + index));
    const grouped = new Map();
    rows.forEach((row) => {
      const key = String(round(row.value, 6));
      const existing = grouped.get(key);
      if (!existing) grouped.set(key, { ...row, count: 1 });
      else {
        existing.count += 1;
        existing.priority = Math.max(existing.priority, row.priority);
        existing.timestamp = Math.max(existing.timestamp, row.timestamp);
        existing.index = Math.min(existing.index, row.index);
        if (!existing.label && row.label) existing.label = row.label;
      }
    });
    return [...grouped.values()]
      .sort((a, b) => b.priority - a.priority || b.count - a.count || b.timestamp - a.timestamp || a.index - b.index)
      .slice(0, limit)
      .map(({ value, label }) => ({ value, label }));
  }

  function formatNumber(value, step) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const precision = Math.min(3, Math.max(decimals(step), Number.isInteger(number) ? 0 : decimals(number)));
    return number.toFixed(precision).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
  }

  function valueOf(input, config) {
    const placeholder = input && input.getAttribute && input.getAttribute('placeholder');
    if (!input || input.value === '') return finite(config.defaultValue, finite(placeholder, finite(config.min, 0)));
    return finite(input.value, finite(config.defaultValue, finite(placeholder, finite(config.min, 0))));
  }

  function createController() {
    if (typeof document === 'undefined') throw new Error('AppNumberInput.enhance 仅可在浏览器中使用');
    const profileByInput = new WeakMap();
    const profileByGroup = new WeakMap();
    const roots = new Set();
    let profiles = [];
    let active = null;
    let observer = null;
    let scrollTimer = null;
    let holdDelay = null;
    let holdInterval = null;
    let heldButton = null;
    let suppressClickButton = null;
    const dialog = document.querySelector('#numberPickerDialog');
    if (!dialog) throw new Error('缺少 #numberPickerDialog');
    const title = dialog.querySelector('#numberPickerTitle');
    const subtitle = dialog.querySelector('#numberPickerSubtitle');
    const suggestions = dialog.querySelector('#numberPickerSuggestions');
    const columnsHost = dialog.querySelector('#numberWheelColumns');
    const manualRow = dialog.querySelector('#numberManualRow');
    const manualInput = dialog.querySelector('#numberManualInput');
    const manualUnit = dialog.querySelector('#numberManualUnit');

    function resolve(value, input, fallback) {
      const next = typeof value === 'function' ? value(input) : value;
      return next == null ? fallback : next;
    }

    function bounds(input, config) {
      return {
        min: resolveBound(resolve(config.min, input, input.min), -Infinity),
        max: resolveBound(resolve(config.max, input, input.max), Infinity),
        step: Math.abs(finite(resolve(config.step, input, input.step), 1)) || 1,
        defaultValue: resolve(config.defaultValue, input, input.placeholder)
      };
    }

    function fieldLabel(node, fallback) {
      const field = node.closest('.field, .settings-number, label');
      const label = field && field.querySelector('.field-heading label, :scope > span, :scope > span > b');
      return resolve(fallback, node, label ? label.textContent.trim() : '调整数值');
    }

    function findNodes(root, selector) {
      const nodes = [];
      if (root.matches && root.matches(selector)) nodes.push(root);
      if (root.querySelectorAll) nodes.push(...root.querySelectorAll(selector));
      return nodes;
    }

    function updateStepper(input, config) {
      const host = input.closest('.number-stepper');
      if (!host) return;
      const range = bounds(input, config);
      const value = valueOf(input, range);
      const minus = host.querySelector('[data-number-step="-1"]');
      const plus = host.querySelector('[data-number-step="1"]');
      // 到达边界只标记 is-limit,不设 button.disabled:在手指仍按住时把按钮禁用会让浏览器
      // 中断该按钮的指针交互(pointercancel),:active 可能卡住不释放,等按钮重新可用时
      // 那个残留的高亮会渲染出来,看起来像「点 + 把 − 也点亮了」。
      setLimit(minus, value <= range.min);
      setLimit(plus, value >= range.max);
    }

    function setLimit(button, limited) {
      button.classList.toggle('is-limit', limited);
      button.setAttribute('aria-disabled', String(limited));
    }

    function atLimit(button) { return button.classList.contains('is-limit'); }

    function markStepper(input, config) {
      if (!input || input.closest('.number-stepper')) return updateStepper(input, config);
      const host = document.createElement('div');
      host.className = 'number-stepper';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.dataset.numberStep = '-1'; minus.setAttribute('aria-label', `减少${fieldLabel(input, config.label)}`); minus.textContent = '−';
      const plus = document.createElement('button');
      plus.type = 'button'; plus.dataset.numberStep = '1'; plus.setAttribute('aria-label', `增加${fieldLabel(input, config.label)}`); plus.textContent = '+';
      input.parentNode.insertBefore(host, input);
      host.append(minus, input, plus);
      host.parentElement.classList.add('has-number-stepper');
      input.classList.add('number-stepper-input');
      profileByInput.set(input, config);
      updateStepper(input, config);
    }

    function markWheel(input, config) {
      if (!input) return;
      input.readOnly = true;
      input.classList.add('number-picker-source');
      input.setAttribute('aria-haspopup', 'dialog');
      input.setAttribute('autocomplete', 'off');
      profileByInput.set(input, config);
    }

    function markGroup(group, config) {
      if (!group) return;
      group.classList.add('number-picker-group');
      group.setAttribute('role', 'button');
      group.setAttribute('tabindex', '0');
      group.setAttribute('aria-haspopup', 'dialog');
      group.setAttribute('aria-label', fieldLabel(group, config.label));
      group.querySelectorAll('input').forEach((input) => { input.readOnly = true; input.setAttribute('tabindex', '-1'); });
      profileByGroup.set(group, config);
    }

    function scan(root) {
      profiles.forEach((config) => {
        findNodes(root, config.selector).forEach((node) => {
          if (config.mode === 'stepper') markStepper(node, config);
          else if (config.mode === 'group') markGroup(node, config);
          else markWheel(node, config);
        });
      });
    }

    function columnConfig(input, base, index) {
      const custom = typeof base.column === 'function' ? base.column(input, index) : {};
      const config = { ...base, ...custom };
      const range = bounds(input, config);
      const rawValue = valueOf(input, range);
      const value = round(Math.min(range.max, Math.max(range.min, rawValue)), Math.max(decimals(range.step), decimals(rawValue)));
      return {
        input, config, ...range, value,
        unit: resolve(config.unit, input, ''),
        label: resolve(config.columnLabel, input, resolve(config.label, input, '数值')),
        window: null
      };
    }

    function normalizeSuggestion(entry, columnCount) {
      if (entry && typeof entry === 'object' && Array.isArray(entry.values)) return entry;
      const value = entry && typeof entry === 'object' ? entry.value : entry;
      return { values: columnCount === 1 ? [value] : [], label: entry && entry.label };
    }

    function activeSuggestions(config, columns) {
      const raw = resolve(config.suggestions, columns[0].input, []) || [];
      if (columns.length > 1) return raw.map((entry) => normalizeSuggestion(entry, columns.length)).filter((entry) => entry.values.length === columns.length).slice(0, 4);
      return rankSuggestions(raw, {
        current: columns[0].input.value === '' ? null : columns[0].value,
        defaults: resolve(config.defaults, columns[0].input, []),
        min: columns[0].min,
        max: columns[0].max,
        limit: 4
      }).map((entry) => ({ values: [entry.value], label: entry.label }));
    }

    function itemLabel(column, value) {
      return `${formatNumber(value, column.step)}${column.unit || ''}`;
    }

    function renderColumn(column, index) {
      column.window = buildWheelWindow(column.value, column);
      column.value = column.window.value;
      const items = column.window.values.map((value, itemIndex) => `<div class="number-wheel-item${itemIndex === column.window.index ? ' selected' : ''}" role="option" aria-selected="${itemIndex === column.window.index}" data-wheel-item="${itemIndex}">${formatNumber(value, column.step)}</div>`).join('');
      return `<section class="number-wheel-column"><span>${column.label}</span><div class="number-wheel" data-wheel-column="${index}" role="listbox" tabindex="0" aria-label="${column.label}"><div class="number-wheel-spacer"></div>${items}<div class="number-wheel-spacer"></div></div><b>${column.unit}</b></section>`;
    }

    function scrollToSelected(index, behavior) {
      const column = active.columns[index];
      const wheel = columnsHost.querySelector(`[data-wheel-column="${index}"]`);
      if (!wheel || !column.window) return;
      wheel.scrollTo({ top: column.window.index * ROW_HEIGHT, behavior: behavior || 'auto' });
    }

    function renderColumns() {
      columnsHost.style.setProperty('--wheel-columns', active.columns.length);
      columnsHost.innerHTML = active.columns.map(renderColumn).join('');
      requestAnimationFrame(() => active.columns.forEach((_, index) => scrollToSelected(index)));
    }

    function renderSuggestions() {
      suggestions.innerHTML = active.suggestions.map((entry, index) => {
        const label = entry.label || entry.values.map((value, valueIndex) => itemLabel(active.columns[valueIndex], value)).join(' · ');
        return `<button type="button" data-number-suggestion="${index}">${label}</button>`;
      }).join('');
      suggestions.hidden = !active.suggestions.length;
    }

    function openColumns(source, config, inputs) {
      const columns = inputs.map((input, index) => columnConfig(input, config, index));
      active = { source, config, columns, focusTarget: document.activeElement };
      active.suggestions = activeSuggestions(config, columns);
      title.textContent = fieldLabel(source, config.label);
      subtitle.textContent = columns.length > 1 ? '上下滑动各列调整，点中央数字可精确输入' : '上下滑动调整，点中央数字可精确输入';
      manualRow.hidden = true;
      renderSuggestions();
      renderColumns();
      document.documentElement.classList.add('number-picker-open');
      if (!dialog.open) dialog.showModal();
      requestAnimationFrame(() => columnsHost.querySelector('.number-wheel')?.focus({ preventScroll: true }));
    }

    function openInput(input, config) { openColumns(input, config, [input]); }
    function openGroup(group, config) { openColumns(group, config, [...group.querySelectorAll('input')]); }

    function close(commit) {
      if (!active) return;
      const focusTarget = active.focusTarget;
      if (commit) {
        active.columns.forEach((column) => {
          column.input.value = formatNumber(column.value, column.step);
          column.input.dispatchEvent(new Event('input', { bubbles: true }));
          column.input.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      active = null;
      clearTimeout(scrollTimer);
      manualRow.hidden = true;
      document.documentElement.classList.remove('number-picker-open');
      if (dialog.open) dialog.close();
      setTimeout(() => { if (focusTarget && focusTarget.focus) focusTarget.focus({ preventScroll: true }); }, 0);
    }

    function updateSelected(wheel, column, index) {
      const safeIndex = Math.max(0, Math.min(column.window.values.length - 1, index));
      column.value = column.window.values[safeIndex];
      const previous = wheel.querySelector('.number-wheel-item.selected');
      const next = wheel.querySelector(`[data-wheel-item="${safeIndex}"]`);
      if (previous && previous !== next) { previous.classList.remove('selected'); previous.setAttribute('aria-selected', 'false'); }
      if (next) { next.classList.add('selected'); next.setAttribute('aria-selected', 'true'); }
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        if (!active) return;
        const values = column.window.values;
        // 只有窗口在该侧还能继续延伸时才补窗。范围本身就短的列(分钟 0-999 停在 2、秒 0-59 步长 5)
        // 索引永远落在 8 格边界内,不加这个判断会每次滚动停下都重建一次同样的列表并重新 scrollTo,
        // 表现为滚轮莫名闪一下。
        const canGrowUp = safeIndex < 8 && values[0] > column.min;
        const canGrowDown = safeIndex > values.length - 9 && values[values.length - 1] < column.max;
        if (!canGrowUp && !canGrowDown) return;
        column.value = values[safeIndex];
        const columnIndex = active.columns.indexOf(column);
        const next = buildWheelWindow(column.value, column);
        // 兜底：算出来的窗口和当前窗口完全一致时也不重建 DOM。
        if (next.values.length === values.length && next.values[0] === values[0]) { column.window = next; return; }
        column.window = next;
        const replacement = document.createElement('div');
        replacement.innerHTML = renderColumn(column, columnIndex);
        wheel.closest('.number-wheel-column').replaceWith(replacement.firstElementChild);
        requestAnimationFrame(() => scrollToSelected(columnIndex));
      }, 130);
    }

    function selectValue(columnIndex, value) {
      const column = active.columns[columnIndex];
      const raw = finite(value, column.value);
      column.value = round(Math.min(column.max, Math.max(column.min, raw)), Math.max(decimals(column.step), decimals(raw)));
      column.window = buildWheelWindow(column.value, column);
      const wheel = columnsHost.querySelector(`[data-wheel-column="${columnIndex}"]`);
      const replacement = document.createElement('div');
      replacement.innerHTML = renderColumn(column, columnIndex);
      wheel.closest('.number-wheel-column').replaceWith(replacement.firstElementChild);
      requestAnimationFrame(() => scrollToSelected(columnIndex, 'smooth'));
    }

    function openManual(columnIndex) {
      const column = active.columns[columnIndex];
      manualRow.dataset.column = String(columnIndex);
      manualInput.value = formatNumber(column.value, column.step);
      manualInput.min = Number.isFinite(column.min) ? String(column.min) : '';
      manualInput.max = Number.isFinite(column.max) ? String(column.max) : '';
      manualInput.step = 'any';
      manualUnit.textContent = column.unit;
      manualRow.hidden = false;
      setTimeout(() => { manualInput.focus(); manualInput.select(); }, 40);
    }

    function applyManual() {
      if (!active) return;
      const index = Number(manualRow.dataset.column) || 0;
      const column = active.columns[index];
      const value = finite(manualInput.value, column.value);
      column.value = Math.min(column.max, Math.max(column.min, value));
      manualRow.hidden = true;
      column.window = buildWheelWindow(column.value, column);
      const wheel = columnsHost.querySelector(`[data-wheel-column="${index}"]`);
      const replacement = document.createElement('div');
      replacement.innerHTML = renderColumn(column, index);
      wheel.closest('.number-wheel-column').replaceWith(replacement.firstElementChild);
      requestAnimationFrame(() => scrollToSelected(index, 'smooth'));
    }

    function applyStepButton(stepButton) {
      // 边界按钮不再是 button.disabled,点击事件照常派发,这里显式忽略,避免空派发 input/change。
      if (atLimit(stepButton)) return;
      const host = stepButton.closest('.number-stepper');
      const input = host.querySelector('input');
      const config = profileByInput.get(input);
      const range = bounds(input, config);
      input.value = formatNumber(stepValue(input.value, Number(stepButton.dataset.numberStep), range), range.step);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      updateStepper(input, config);
    }

    function stopHold() {
      clearTimeout(holdDelay); clearInterval(holdInterval);
      holdDelay = null; holdInterval = null; heldButton = null;
      document.querySelectorAll('.number-stepper button.is-pressed').forEach((button) => button.classList.remove('is-pressed'));
    }

    function onPointerDown(event) {
      const button = event.target.closest('[data-number-step]');
      if (!button || atLimit(button)) return;
      stopHold(); heldButton = button;
      // 按下高亮不能用 :active——步进器嵌在 <label class="field"> 里,label 的激活态会传播,
      // 导致 .number-stepper button:active 同时命中 − 和 +,看起来像「点 + 把 − 也点亮了」。
      button.classList.add('is-pressed');
      holdDelay = setTimeout(() => {
        if (!heldButton) return;
        suppressClickButton = heldButton; applyStepButton(heldButton);
        holdInterval = setInterval(() => { if (heldButton && !atLimit(heldButton)) applyStepButton(heldButton); }, 110);
      }, 420);
    }

    function onPointerEnd() { stopHold(); }

    function onClick(event) {
      const stepButton = event.target.closest('[data-number-step]');
      if (stepButton) {
        if (suppressClickButton === stepButton) { suppressClickButton = null; return; }
        applyStepButton(stepButton);
        return;
      }
      const suggestion = event.target.closest('[data-number-suggestion]');
      if (suggestion && active) {
        const entry = active.suggestions[Number(suggestion.dataset.numberSuggestion)];
        entry.values.forEach((value, index) => selectValue(index, value));
        return;
      }
      if (event.target.closest('#numberPickerCancel, #numberPickerClose')) return close(false);
      if (event.target.closest('#numberPickerDone')) return close(true);
      if (event.target.closest('#numberManualApply')) return applyManual();
      const item = event.target.closest('[data-wheel-item]');
      if (item && active) {
        const wheel = item.closest('[data-wheel-column]');
        const columnIndex = Number(wheel.dataset.wheelColumn);
        const itemIndex = Number(item.dataset.wheelItem);
        const column = active.columns[columnIndex];
        if (column.window.values[itemIndex] === column.value) openManual(columnIndex);
        else { wheel.scrollTo({ top: itemIndex * ROW_HEIGHT, behavior: 'smooth' }); updateSelected(wheel, column, itemIndex); }
        return;
      }
      const wheelInput = event.target.closest('.number-picker-source');
      if (wheelInput) {
        event.preventDefault();
        const config = profileByInput.get(wheelInput);
        if (config) openInput(wheelInput, config);
        return;
      }
      const group = event.target.closest('.number-picker-group');
      if (group) {
        const config = profileByGroup.get(group);
        if (config) openGroup(group, config);
      }
    }

    function onInput(event) {
      const input = event.target.closest && event.target.closest('.number-stepper-input');
      if (input) updateStepper(input, profileByInput.get(input));
    }

    function onScroll(event) {
      const wheel = event.target.closest && event.target.closest('[data-wheel-column]');
      if (!wheel || !active) return;
      const column = active.columns[Number(wheel.dataset.wheelColumn)];
      if (!column) return;
      updateSelected(wheel, column, Math.round(wheel.scrollTop / ROW_HEIGHT));
    }

    function onKeydown(event) {
      if (event.target === manualInput && event.key === 'Enter') { event.preventDefault(); applyManual(); return; }
      const wheel = event.target.closest && event.target.closest('[data-wheel-column]');
      if (wheel && active && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Enter'].includes(event.key)) {
        event.preventDefault();
        const columnIndex = Number(wheel.dataset.wheelColumn);
        const column = active.columns[columnIndex];
        if (event.key === 'Enter') return openManual(columnIndex);
        const direction = event.key === 'ArrowUp' || event.key === 'PageUp' ? -1 : 1;
        const multiplier = event.key.startsWith('Page') ? 5 : 1;
        selectValue(columnIndex, stepValue(column.value, direction * multiplier, column));
        return;
      }
      const group = event.target.closest && event.target.closest('.number-picker-group');
      if (group && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openGroup(group, profileByGroup.get(group)); }
    }

    document.addEventListener('click', onClick);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointerup', onPointerEnd);
    document.addEventListener('pointercancel', onPointerEnd);
    document.addEventListener('input', onInput);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('keydown', onKeydown);
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(false); });

    function enhance(root, nextProfiles) {
      profiles = Array.isArray(nextProfiles) ? nextProfiles : Object.entries(nextProfiles || {}).map(([selector, config]) => ({ selector, ...config }));
      roots.add(root);
      scan(root);
      if (!observer && typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver((records) => records.forEach((record) => {
          if (record.type === 'attributes') scan(record.target);
          else record.addedNodes.forEach((node) => { if (node.nodeType === 1) scan(node); });
        }));
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'max'] });
      }
      return api;
    }

    function refresh(target) {
      if (!target) roots.forEach(scan);
      else if (profileByInput.has(target)) {
        const config = profileByInput.get(target);
        if (config.mode === 'stepper') updateStepper(target, config);
      } else scan(target);
    }

    function isOpen() { return Boolean(active && dialog.open); }
    const api = { enhance, refresh, close, isOpen };
    return api;
  }

  function instance() { if (!controller) controller = createController(); return controller; }
  function enhance(root, profiles) { return instance().enhance(root, profiles); }
  function refresh(input, context) { return instance().refresh(input, context); }
  function close(commit) { if (controller) controller.close(Boolean(commit)); }
  function isOpen() { return Boolean(controller && controller.isOpen()); }

  return { stepValue, buildWheelWindow, rankSuggestions, enhance, refresh, close, isOpen };
});
