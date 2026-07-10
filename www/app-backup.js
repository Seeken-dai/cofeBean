// app.js 拆分第三批:备份导出/导入与旧版数据迁移。
// 数据安全敏感区:导入失败必须由 repository.importData 保证回滚,本模块只负责
// 采集/恢复图片、组装备份 JSON 与用户交互。依赖经 create(deps) 显式注入:
//   $ / state / els               —— app.js 的选择器与共享状态
//   core / repository             —— BeanCore / BeanRepository
//   capPlugin / toast / setDialog / reload —— app.js 工具
//   confirmFn                     —— window.confirm(注入以便 Node 测试替换)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(deps) {
    const { $, state, els, core, repository, capPlugin, toast, setDialog, reload, confirmFn } = deps;
    ['$', 'state', 'els', 'core', 'repository', 'capPlugin', 'toast', 'setDialog', 'reload', 'confirmFn'].forEach((key) => {
      if (!deps[key]) throw new Error(`AppBackup.create 缺少依赖:${key}`);
    });

    const backupScopes = { all: { title: '完整备份', file: '全部备份' }, library: { title: '豆仓与饮用记录', file: '豆仓记录备份' }, brewPlans: { title: '冲煮方案', file: '冲煮方案备份' } };
    function backupScope(scope) { return backupScopes[scope] ? scope : 'all'; }
    function userPlanCount(plans) { return (plans || []).filter((plan) => plan.source !== 'preset').length; }
    function backupSummary(scope, data) {
      if (scope === 'library') return `${data.beans.length} 款豆子，${data.drinkLogs.length} 杯记录`;
      if (scope === 'brewPlans') return `${data.brewPlans.length} 个方案`;
      return `${data.beans.length} 款豆子，${data.drinkLogs.length} 杯记录，${data.brewPlans.length} 个方案`;
    }
    function hasCurrentImportTarget(scope) {
      if (scope === 'library') return state.beans.length > 0 || state.drinkLogs.length > 0;
      if (scope === 'brewPlans') return userPlanCount(state.brewPlans) > 0;
      return state.beans.length > 0 || state.drinkLogs.length > 0 || userPlanCount(state.brewPlans) > 0;
    }
    function chooseImportMode(scope, summary) {
      const label = backupScopes[scope].title;
      if (!hasCurrentImportTarget(scope)) return confirmFn(`备份包含 ${summary}。导入「${label}」吗？`) ? 'replace' : null;
      if (confirmFn(`本机已有「${label}」数据。\n备份包含 ${summary}。\n\n点击“确定”合并数据；点击“取消”后可选择覆盖。`)) return 'merge';
      return confirmFn(`覆盖本机「${label}」数据？此操作只覆盖本次备份包含的范围。`) ? 'replace' : null;
    }
    function backupIncludesLibrary(scope) { return scope === 'all' || scope === 'library'; }
    function blobToBase64(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
    function base64ToBlob(data, mime) {
      const bytes = atob(data); const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
      return new Blob([arr], { type: mime || 'image/webp' });
    }
    // Web 备份图片：与安卓同一 base64 格式（data/extension/mimeType），因此备份可在两端互相迁移图片。
    async function collectWebBackupImages() {
      const images = {};
      for (const bean of state.beans) {
        const entry = {};
        for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
          const ref = bean[key];
          if (!ref || String(ref).indexOf('idb:') !== 0) continue;
          try { const blob = await repository.getWebImage(ref); if (blob) entry[role] = { data: await blobToBase64(blob), extension: '.webp', mimeType: blob.type || 'image/webp' }; } catch (_) {}
        }
        if (entry.bag || entry.label) images[bean.id] = entry;
      }
      return Object.keys(images).length ? images : null;
    }
    async function collectWebDrinkBackupImages() {
      const images = {};
      for (const log of state.drinkLogs) {
        const entry = [];
        for (const ref of log.photos || []) {
          if (!ref || String(ref).indexOf('idb:') !== 0) continue;
          try { const blob = await repository.getWebImage(ref); if (blob) entry.push({ data: await blobToBase64(blob), extension: '.webp', mimeType: blob.type || 'image/webp' }); } catch (_) {}
        }
        if (entry.length) images[log.id] = entry.slice(0, 3);
      }
      return Object.keys(images).length ? images : null;
    }
    async function restoreWebBackupImages(imported) {
      const beans = imported.beans.map((bean) => ({ ...bean }));
      const drinkLogs = imported.drinkLogs.map((log) => ({ ...log, photos: (log.photos || []).slice() }));
      for (const bean of beans) {
        const entry = imported.beanImages && imported.beanImages[bean.id];
        if (!entry) continue;
        for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
          if (!entry[role] || !entry[role].data) continue;
          try { const blob = base64ToBlob(entry[role].data, entry[role].mimeType); bean[key] = await repository.saveWebImage(blob); } catch (_) {}
        }
      }
      for (const log of drinkLogs) {
        const entry = imported.drinkImages && imported.drinkImages[log.id];
        if (!Array.isArray(entry)) continue;
        const photos = [];
        for (const image of entry.slice(0, 3)) {
          if (!image || !image.data) continue;
          try { photos.push(await repository.saveWebImage(base64ToBlob(image.data, image.mimeType))); } catch (_) {}
        }
        if (photos.length) log.photos = photos;
      }
      return { ...imported, beans, drinkLogs };
    }
    async function collectBackupImages(scope) {
      if (!backupIncludesLibrary(scope) || !$('#exportBeanImages').checked) return null;
      if (!repository.isNative()) return collectWebBackupImages();
      const scanner = capPlugin('CoffeeLabelScanner');
      if (!scanner || !scanner.readArchivedImage) { toast('当前环境无法导出图片，仅导出数据'); return null; }
      const images = {};
      for (const bean of state.beans) {
        const entry = {};
        for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
          if (!bean[key]) continue;
          try { entry[role] = await scanner.readArchivedImage({ path: bean[key] }); } catch (_) {}
        }
        if (entry.bag || entry.label) images[bean.id] = entry;
      }
      return Object.keys(images).length ? images : null;
    }
    async function collectDrinkBackupImages(scope) {
      if (!backupIncludesLibrary(scope) || !$('#exportBeanImages').checked) return null;
      if (!repository.isNative()) return collectWebDrinkBackupImages();
      const scanner = capPlugin('CoffeeLabelScanner');
      if (!scanner || !scanner.readArchivedImage) return null;
      const images = {};
      for (const log of state.drinkLogs) {
        const entry = [];
        for (const ref of log.photos || []) {
          try { entry.push(await scanner.readArchivedImage({ path: ref })); } catch (_) {}
        }
        if (entry.length) images[log.id] = entry.slice(0, 3);
      }
      return Object.keys(images).length ? images : null;
    }
    async function restoreBackupImages(imported) {
      const hasBeanImages = imported.beanImages && Object.keys(imported.beanImages).length;
      const hasDrinkImages = imported.drinkImages && Object.keys(imported.drinkImages).length;
      if (!hasBeanImages && !hasDrinkImages) return imported;
      if (!repository.isNative()) return restoreWebBackupImages(imported);
      const scanner = capPlugin('CoffeeLabelScanner');
      if (!scanner || !scanner.restoreArchivedImage) { toast('备份含图片，当前环境仅恢复数据'); return imported; }
      const beans = imported.beans.map((bean) => ({ ...bean }));
      const drinkLogs = imported.drinkLogs.map((log) => ({ ...log, photos: (log.photos || []).slice() }));
      for (const bean of beans) {
        const entry = imported.beanImages && imported.beanImages[bean.id];
        if (!entry) continue;
        for (const [role, key] of [['bag', 'bagImagePath'], ['label', 'labelImagePath']]) {
          if (!entry[role]) continue;
          try {
            const restored = await scanner.restoreArchivedImage({ role, data: entry[role].data, extension: entry[role].extension });
            bean[key] = restored.path || restored.uri || bean[key];
          } catch (_) {}
        }
      }
      for (const log of drinkLogs) {
        const entry = imported.drinkImages && imported.drinkImages[log.id];
        if (!Array.isArray(entry)) continue;
        const photos = [];
        for (const image of entry.slice(0, 3)) {
          if (!image || !image.data) continue;
          try {
            const restored = await scanner.restoreArchivedImage({ role: 'drink', data: image.data, extension: image.extension });
            if (restored.path || restored.uri) photos.push(restored.path || restored.uri);
          } catch (_) {}
        }
        if (photos.length) log.photos = photos;
      }
      return { ...imported, beans, drinkLogs };
    }
    async function exportBackup(scope) { try { const exportScope = backupScope(scope); const beanImages = await collectBackupImages(exportScope); const drinkImages = await collectDrinkBackupImages(exportScope); const backup = core.createBackup(state.beans, state.drinkLogs, state.settings, null, state.brewPlans, { scope: exportScope, beanImages, drinkImages }); const json = JSON.stringify(backup, null, 2); const filename = `豆仓${backupScopes[exportScope].file}-${new Date().toISOString().slice(0, 10)}.json`; const filesystem = capPlugin('Filesystem'); const share = capPlugin('Share'); const hasImages = Boolean(beanImages || drinkImages); if (repository.isNative() && filesystem && share) { const result = await filesystem.writeFile({ path: filename, data: json, directory: 'CACHE', encoding: 'utf8', recursive: true }); await share.share({ title: `豆仓${backupScopes[exportScope].title}`, text: `${backupSummary(exportScope, backup)}${hasImages ? '，含图片' : ''}`, files: [result.uri], dialogTitle: '保存或分享豆仓备份' }); } else { const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } toast('备份已生成'); } catch (error) { console.error(error); toast('导出失败'); } }
    function decodeBase64(data) { return new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0))); }
    async function pickNativeBackup() { const picker = capPlugin('FilePicker'); const filesystem = capPlugin('Filesystem'); if (!picker) throw new Error('文件选择器没有加载'); const result = await picker.pickFiles({ types: ['application/json'], limit: 1, readData: true }); const file = result.files && result.files[0]; if (!file) return null; if (file.data) return decodeBase64(file.data); if (file.path && filesystem) { const content = await filesystem.readFile({ path: file.path }); return content.data.includes('{') ? content.data : decodeBase64(content.data); } throw new Error('无法读取所选文件'); }
    async function importText(text) { const imported = core.validateImport(JSON.parse(text)); const scope = backupScope(imported.exportScope); const summary = backupSummary(scope, imported); const mode = chooseImportMode(scope, summary); if (!mode) return; const restored = await restoreBackupImages(imported); await repository.importData(restored, mode); await reload(); setDialog(els.backup, false); setDialog(els.settings, false); setDialog(els.personal, false); toast(`${mode === 'merge' ? '已合并' : '已导入'}${backupScopes[scope].title}`); }
    async function startImport(scope) { try { state.importScope = backupScope(scope); if (repository.isNative()) { const text = await pickNativeBackup(); if (text) await importText(text); } else $('#webImportInput').click(); } catch (error) { console.error(error); toast(error.message || '导入失败，文件格式不正确'); } }
    async function webImport(event) { const file = event.target.files[0]; event.target.value = ''; if (!file) return; try { await importText(await file.text()); } catch (error) { toast(error.message || '导入失败，文件格式不正确'); } }
    async function offerMigration() { if (state.beans.length) return; const legacy = repository.legacyData(); if (!legacy) return; $('#migrationMessage').textContent = `发现 ${legacy.beans.length} 条旧版浏览器记录。是否迁移到 SQLite？原数据不会被删除。`; setDialog(els.migration, true); }
    async function migrateLegacy() { const legacy = repository.legacyData(); if (!legacy) return setDialog(els.migration, false); try { await repository.replaceAll(legacy.beans); await reload(); setDialog(els.migration, false); toast(`已迁移 ${legacy.beans.length} 条记录`); } catch (_) { toast('迁移失败，旧数据仍保持不变'); } }

    // backupScope/backupSummary/chooseImportMode/base64ToBlob 一并导出,供 Node 测试。
    return { exportBackup, startImport, webImport, importText, offerMigration, migrateLegacy, backupScope, backupSummary, chooseImportMode, hasCurrentImportTarget, base64ToBlob, decodeBase64 };
  }

  return { create };
});
