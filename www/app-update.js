// app.js 拆分第三批:关于页与版本更新检查(GitHub Releases)。
// 依赖经 create(deps) 显式注入:
//   $ / state / els            —— app.js 的选择器与共享状态(updateBusy/updateResult/appInfo)
//   core                        —— BeanCore(compareAppVersions/selectReleaseApkAsset)
//   capPlugin / setDialog / openExternalUrl / esc —— app.js 与 AppFormat 工具
// 网络端点与超时是模块内常量;fetch 由运行环境提供(Node 测试可注入 fetchFn 覆盖)。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AppUpdate = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RELEASES_URL = 'https://github.com/Seeken-dai/cofeBean/releases';
  const LATEST_RELEASE_API = 'https://api.github.com/repos/Seeken-dai/cofeBean/releases/latest';
  const UPDATE_TIMEOUT_MS = 15000;

  function create(deps) {
    const { $, state, els, core, capPlugin, setDialog, openExternalUrl, esc } = deps;
    ['$', 'state', 'els', 'core', 'capPlugin', 'setDialog', 'openExternalUrl', 'esc'].forEach((key) => {
      if (!deps[key]) throw new Error(`AppUpdate.create 缺少依赖:${key}`);
    });
    const fetchFn = deps.fetchFn || ((...args) => fetch(...args));

    function currentAppVersion() {
      if (state.appInfo && state.appInfo.version) return state.appInfo.version;
      const match = String($('#aboutVersion') && $('#aboutVersion').textContent || '').match(/版本\s+([^\s·]+)/);
      return match ? match[1] : '';
    }
    function formatDownloadSize(bytes) {
      const size = Number(bytes) || 0;
      if (!size) return '';
      if (size >= 1024 * 1024) return `约 ${Math.round(size / 1024 / 1024)} MB`;
      if (size >= 1024) return `约 ${Math.round(size / 1024)} KB`;
      return `${size} B`;
    }
    function releaseNotesHtml(text) {
      const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
      if (!lines.length) return '<p>这次发布没有填写更新说明，可打开发布页查看详情。</p>';
      return '<ul>' + lines.map((line) => `<li>${esc(line.replace(/^[-*]\s*/, '').replace(/^#+\s*/, ''))}</li>`).join('') + '</ul>';
    }
    function renderUpdatePanel() {
      const panel = $('#updateStatus');
      const check = $('#aboutCheckUpdate');
      const download = $('#aboutDownloadUpdate');
      if (!panel || !check || !download) return;
      check.disabled = state.updateBusy;
      check.textContent = state.updateBusy ? '检查中...' : '检查更新';
      download.hidden = true;
      panel.hidden = !state.updateBusy && !state.updateResult;
      if (state.updateBusy) {
        panel.dataset.state = 'loading';
        panel.innerHTML = '<b>正在检查更新</b><p>正在连接 GitHub Releases。</p>';
        return;
      }
      const result = state.updateResult;
      if (!result) return;
      panel.dataset.state = result.state || 'info';
      if (result.state === 'available') {
        const size = formatDownloadSize(result.asset && result.asset.size);
        panel.innerHTML = `<b>发现新版本 ${esc(result.version)}</b><div class="update-notes">${releaseNotesHtml(result.body)}</div>${size ? `<p>安装包大小：${esc(size)}</p>` : ''}`;
        download.hidden = !result.asset;
        download.textContent = '前往下载';
        return;
      }
      panel.innerHTML = `<b>${esc(result.title)}</b><p>${esc(result.message)}</p>`;
    }
    async function fetchLatestRelease() {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS) : null;
      try {
        const response = await fetchFn(LATEST_RELEASE_API, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: controller && controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    async function checkForUpdates() {
      if (state.updateBusy) return;
      state.updateBusy = true;
      state.updateResult = null;
      renderUpdatePanel();
      try {
        const release = await fetchLatestRelease();
        const remoteVersion = String(release && release.tag_name || '').trim();
        const localVersion = currentAppVersion();
        const compare = core.compareAppVersions(remoteVersion, localVersion);
        const releaseUrl = release && release.html_url || RELEASES_URL;
        if (compare == null) {
          state.updateResult = { state: 'error', title: '无法判断版本', message: '版本信息格式异常，可打开发布页手动查看最新版本。', releaseUrl };
        } else if (compare <= 0) {
          state.updateResult = { state: 'current', title: '当前已是最新版本', message: `本机版本 ${localVersion}，发布页最新版本 ${remoteVersion}。`, releaseUrl };
        } else {
          const asset = core.selectReleaseApkAsset(release && release.assets);
          state.updateResult = asset
            ? { state: 'available', version: remoteVersion, body: release && release.body, releaseUrl, asset }
            : { state: 'warning', title: `发现新版本 ${remoteVersion}`, message: '当前版本暂未提供可下载的 release APK，可打开发布页查看详情。', releaseUrl };
        }
      } catch (error) {
        console.error(error);
        state.updateResult = { state: 'error', title: '无法连接更新服务器', message: '请检查网络后重试，也可以直接打开发布页手动查看最新版本。', releaseUrl: RELEASES_URL };
      } finally {
        state.updateBusy = false;
        renderUpdatePanel();
      }
    }
    async function showAbout() {
      setDialog(els.about, true);
      const app = capPlugin('App');
      if (app && app.getInfo) {
        try {
          state.appInfo = await app.getInfo();
          $('#aboutVersion').textContent = `版本 ${state.appInfo.version} · 构建 ${state.appInfo.build}`;
        } catch (_) {}
      }
      renderUpdatePanel();
    }
    function openReleasePage() {
      const url = state.updateResult && state.updateResult.releaseUrl || RELEASES_URL;
      return openExternalUrl(url, '无法打开发布页');
    }
    function openUpdateDownload() {
      const asset = state.updateResult && state.updateResult.asset;
      return openExternalUrl(asset && asset.url || RELEASES_URL, '无法打开下载链接');
    }

    // formatDownloadSize/releaseNotesHtml/currentAppVersion 一并导出,供 Node 测试。
    return { showAbout, checkForUpdates, openReleasePage, openUpdateDownload, formatDownloadSize, releaseNotesHtml, currentAppVersion };
  }

  return { create };
});
