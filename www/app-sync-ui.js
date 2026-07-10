// app.js 拆分第二批:云同步账号 UI(登录/注册/恢复/开关/立即同步/删号)。
// 约定:本文件只操作同步相关的对话框与状态位,不直接碰仓储;
// 跨闭包依赖全部通过 create(deps) 显式注入,便于 Node 测试用假实现替换:
//   $ / state / els            —— app.js 的选择器、状态对象、对话框引用(引用共享,状态位就地读写)
//   cloudSync                  —— BeanCloudSync 服务实例(可为 null:Web 未配置时)
//   toast / setDialog / askConfirm / reload / copyText / formatDateTime —— app.js 工具
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppSyncUi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(deps) {
    const { $, state, els, cloudSync, toast, setDialog, askConfirm, reload, copyText, formatDateTime } = deps;
    ['$', 'state', 'els', 'toast', 'setDialog', 'askConfirm', 'reload', 'copyText', 'formatDateTime'].forEach((key) => {
      if (!deps[key]) throw new Error(`AppSyncUi.create 缺少依赖:${key}`);
    });

    function generateRecoveryCode() {
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const bytes = new Uint8Array(20);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes); else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
      return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('').replace(/(.{4})/g, '$1-').replace(/-$/, '');
    }
    function readSyncCredentials() {
      const email = $('#syncAuthEmail').value.trim();
      const password = $('#syncAuthPassword').value;
      if (!email || !email.includes('@')) throw new Error('请填写邮箱');
      if (!password || password.length < 8) throw new Error('密码至少 8 位');
      return { email, password };
    }
    function setSyncBusy(busy) {
      state.syncBusy = Boolean(busy);
      ['syncAuthSubmit', 'syncAuthModeLogin', 'syncAuthModeRegister', 'syncAuthForgot', 'syncLoginOpen', 'syncLogout', 'syncCopyRecovery'].forEach((id) => { const el = $(`#${id}`); if (el) el.disabled = state.syncBusy; });
      renderSyncAuth();
      renderSyncSettings();
    }
    function renderSyncSettings() {
      if (!cloudSync) return;
      const config = cloudSync.getConfig();
      const loggedIn = Boolean(config.token);
      const errorAt = config.lastSyncErrorAt ? formatDateTime(config.lastSyncErrorAt) : '';
      const errorText = config.lastSyncError ? `最近失败${errorAt ? ' ' + errorAt : ''}：${config.lastSyncError}` : '';
      const lastText = config.lastSyncAt ? `上次同步 ${formatDateTime(config.lastSyncAt)}` : (loggedIn ? '点击后同步这台设备的数据' : '登录后可同步这台设备的数据');
      $('#syncStateText').textContent = state.syncBusy ? '正在同步' : (loggedIn ? (config.enabled ? '同步已开启' : '同步已暂停') : '未登录');
      $('#syncAccountText').textContent = loggedIn ? (config.email || '同步账号') : '本机离线使用中';
      $('#syncAccountHint').textContent = loggedIn ? (errorText || (config.lastSyncAt ? `上次同步 ${formatDateTime(config.lastSyncAt)}` : '还没有完成过同步')) : '登录后可在 Android 与 Web 间同步豆子、饮用记录、方案和图片。';
      $('#syncStatusBadge').textContent = loggedIn ? (config.enabled ? '在线' : '暂停') : '离线';
      $('#syncStatusBadge').dataset.state = loggedIn ? (config.enabled ? 'enabled' : 'paused') : 'offline';
      $('#syncEnabled').checked = Boolean(config.enabled && loggedIn);
      $('#syncEnabled').disabled = !loggedIn || state.syncBusy;
      $('#syncNow').disabled = !loggedIn || state.syncBusy;
      $('#syncNow').classList.toggle('is-syncing', state.syncBusy);
      $('#syncLoginOpen').hidden = loggedIn;
      $('#syncLogout').hidden = !loggedIn;
      $('#syncDeleteAccount').disabled = !loggedIn || state.syncBusy;
      $('#syncLastText').textContent = errorText || lastText;
    }
    function renderSyncAuth() {
      const mode = state.syncAuthMode;
      const copy = {
        login: ['登录同步账号', '登录后再决定是否开启同步。', '密码', '至少 8 位', '登录'],
        register: ['创建同步账号', '注册后会生成一次性恢复码，请先保存。', '设置密码', '至少 8 位', '创建账号'],
        recover: ['恢复同步账号', '用注册时保存的恢复码重设密码。', '新密码', '至少 8 位', '重设并登录']
      }[mode];
      $('#syncAuthTitle').textContent = copy[0];
      $('#syncAuthSubtitle').textContent = copy[1];
      $('#syncAuthPassword').previousElementSibling.textContent = copy[2];
      $('#syncAuthPassword').placeholder = copy[3];
      $('#syncAuthSubmit').textContent = state.syncBusy ? '请稍候…' : copy[4];
      $('#syncRecoveryField').hidden = mode !== 'recover';
      $('#syncAuthSwitch').hidden = mode !== 'login';
      $('#syncAuthModeLogin').hidden = mode === 'login';
      $('#syncAuthForgot').hidden = mode === 'recover';
    }
    function setSyncAuthMode(mode) {
      state.syncAuthMode = ['login', 'register', 'recover'].includes(mode) ? mode : 'login';
      $('#syncRecoveryBox').hidden = true;
      renderSyncAuth();
    }
    function openSyncAuth(mode) {
      const config = cloudSync ? cloudSync.getConfig() : {};
      setSyncAuthMode(mode || 'login');
      $('#syncAuthEmail').value = config.email || $('#syncAuthEmail').value || '';
      $('#syncAuthPassword').value = '';
      $('#syncAuthRecovery').value = '';
      setDialog(els.syncAuth, true);
      setTimeout(() => $('#syncAuthEmail').focus(), 80);
    }
    function syncAuthBack() { if (state.syncAuthMode !== 'login') return setSyncAuthMode('login'); setDialog(els.syncAuth, false); }
    async function syncAuthSubmit() {
      if (state.syncAuthMode === 'login') return syncLogin();
      if (state.syncAuthMode === 'register') return syncRegister();
      return syncRecover();
    }
    async function syncLogin() {
      if (!cloudSync) return toast('同步模块未加载');
      let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
      setSyncBusy(true); toast('正在登录…');
      try { await cloudSync.login(body); $('#syncRecoveryBox').hidden = true; setDialog(els.syncAuth, false); renderSyncSettings(); toast('已登录同步账号'); }
      catch (error) { console.error(error); toast(error.message || '登录失败'); }
      finally { setSyncBusy(false); }
    }
    async function syncRegister() {
      if (!cloudSync) return toast('同步模块未加载');
      let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
      setSyncBusy(true); toast('正在注册…');
      try {
        const recoveryCode = generateRecoveryCode();
        await cloudSync.register({ ...body, recoveryCode });
        $('#syncRecoveryCode').textContent = recoveryCode;
        $('#syncRecoveryBox').hidden = false;
        renderSyncSettings();
        toast('注册成功，请先保存恢复码');
      } catch (error) { console.error(error); toast(error.message || '注册失败'); }
      finally { setSyncBusy(false); }
    }
    async function syncRecover() {
      if (!cloudSync) return toast('同步模块未加载');
      let body; try { body = readSyncCredentials(); } catch (error) { return toast(error.message); }
      const recoveryCode = $('#syncAuthRecovery').value.trim();
      if (!recoveryCode) return toast('请填写恢复码');
      setSyncBusy(true); toast('正在恢复账号…');
      try { await cloudSync.recover({ ...body, recoveryCode }); $('#syncRecoveryBox').hidden = true; setDialog(els.syncAuth, false); renderSyncSettings(); toast('已恢复并登录'); }
      catch (error) { console.error(error); toast(error.message || '恢复失败'); }
      finally { setSyncBusy(false); }
    }
    function syncLogout() { if (!cloudSync) return; cloudSync.logout(); $('#syncRecoveryBox').hidden = true; renderSyncSettings(); toast('已退出同步账号'); }
    async function syncDeleteAccount() {
      if (!cloudSync) return toast('同步模块未加载');
      if (!cloudSync.getConfig().token) return toast('未登录');
      if (!await askConfirm({ eyebrow: 'CLOUD DELETE', title: '删除云端账号？', message: '服务器上的账号与所有云端数据会被永久删除，且不可恢复；本机数据不受影响。', confirmText: '删除云端账号' })) return;
      setSyncBusy(true);
      try { await cloudSync.deleteAccount(); $('#syncRecoveryBox').hidden = true; renderSyncSettings(); toast('云端账号已删除'); }
      catch (error) { console.error(error); toast(error.message || '删除失败'); }
      finally { setSyncBusy(false); }
    }
    function syncToggle() {
      if (!cloudSync) return;
      const config = cloudSync.getConfig();
      if (!config.token) { $('#syncEnabled').checked = false; return toast('请先登录同步账号'); }
      cloudSync.setEnabled($('#syncEnabled').checked);
      renderSyncSettings();
      toast($('#syncEnabled').checked ? '同步已开启' : '同步已关闭');
    }
    async function syncNow() {
      if (!cloudSync) return toast('同步模块未加载');
      setSyncBusy(true);
      try {
        toast('正在同步…');
        const result = await cloudSync.sync({ force: true });
        if (result.skipped) return toast(result.reason === 'not-authenticated' ? '请先登录同步账号' : '同步暂不可用');
        await reload();
        renderSyncSettings();
        toast('同步完成');
      } catch (error) { console.error(error); toast(error.message || '同步失败'); }
      finally { setSyncBusy(false); renderSyncSettings(); }
    }
    async function copyRecoveryCode() { try { await copyText($('#syncRecoveryCode').textContent); toast('恢复码已复制'); } catch (_) { toast('复制失败，请手动保存'); } }

    return { renderSyncSettings, setSyncBusy, setSyncAuthMode, openSyncAuth, syncAuthBack, syncAuthSubmit, syncLogout, syncDeleteAccount, syncToggle, syncNow, copyRecoveryCode, generateRecoveryCode };
  }

  return { create };
});
