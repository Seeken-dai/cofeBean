// 豆仓访问与转化统计模块（落地页 + Web App）
// 遵循隐私优先原则：不记录明文 IP，通过加盐哈希生成日粒度匿名 visitor_hash

export function parseUserAgent(uaString) {
  const ua = String(uaString || '');
  let os = 'Other';
  let deviceType = 'desktop';
  let browser = 'Other';

  // OS 判断
  if (/Android/i.test(ua)) {
    os = 'Android';
    deviceType = /Mobile/i.test(ua) ? 'mobile' : 'tablet';
  } else if (/iPhone|iPod/i.test(ua)) {
    os = 'iOS';
    deviceType = 'mobile';
  } else if (/iPad/i.test(ua)) {
    os = 'iOS';
    deviceType = 'tablet';
  } else if (/Windows NT/i.test(ua)) {
    os = 'Windows';
    deviceType = 'desktop';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = 'macOS';
    deviceType = 'desktop';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
    deviceType = 'desktop';
  }

  // 浏览器判断
  if (/MicroMessenger/i.test(ua)) {
    browser = 'WeChat';
  } else if (/Edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/Chrome|CriOS/i.test(ua)) {
    browser = 'Chrome';
  } else if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) {
    browser = 'Safari';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'Firefox';
  }

  return { os, deviceType, browser };
}

export function parseReferrerHost(referrer) {
  if (!referrer || typeof referrer !== 'string') return 'Direct';
  try {
    const url = new URL(referrer);
    const host = url.hostname.toLowerCase();
    if (!host || host === 'cofevault.top' || host === 'www.cofevault.top' || host === 'app.cofevault.top') return 'Direct';
    return host.replace(/^www\./, '');
  } catch {
    return 'Direct';
  }
}

export async function generateVisitorHash(ip, ua, dateStr, salt) {
  const text = `${ip || '127.0.0.1'}|${ua || ''}|${dateStr}|${salt || 'cofevault-anon'}`;
  const buffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hex = [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

export async function recordAnalyticsHit(request, env) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    try {
      body = JSON.parse(await request.text());
    } catch {
      body = {};
    }
  }

  const origin = request.headers.get('Origin') || '';
  const site = body.site || (origin.includes('app.cofevault.top') ? 'webapp' : 'landing');
  const eventType = String(body.event || 'pageview').slice(0, 50);
  const path = String(body.path || (site === 'webapp' ? '/app' : '/')).slice(0, 200);
  const referrer = body.referrer ? String(body.referrer).slice(0, 500) : null;
  const referrerHost = parseReferrerHost(referrer);
  const ua = request.headers.get('User-Agent') || '';
  const { os, deviceType, browser } = parseUserAgent(ua);
  const country = request.headers.get('CF-IPCountry') || 'Unknown';
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '127.0.0.1';

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const visitorHash = await generateVisitorHash(ip, ua, dateStr, env.ANALYTICS_SALT);

  const metaObj = Object.assign({ site }, body.meta || {});
  const metaJson = JSON.stringify(metaObj).slice(0, 1000);
  const createdAt = now.toISOString();

  await env.DB.prepare(
    'INSERT INTO analytics_events (created_at, event_type, path, referrer, referrer_host, country, os, browser, device_type, visitor_hash, meta_json) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(createdAt, eventType, path, referrer, referrerHost, country, os, browser, deviceType, visitorHash, metaJson).run();

  return { ok: true };
}

export async function getAnalyticsStats(request, env) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') || '7d';
  const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace(/^Bearer /, '');

  if (env.ANALYTICS_SECRET && token !== env.ANALYTICS_SECRET) {
    return { error: '未授权', status: 401 };
  }

  let days = 7;
  if (range === '30d') days = 30;
  if (range === '24h') days = 1;
  if (range === 'all') days = 365;

  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const todayStr = new Date().toISOString().slice(0, 10);
  const yesterdayStr = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // 1. 总体概况（区分 Landing 与 WebApp）
  const totalStats = await env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS uv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path = '/' OR meta_json LIKE '%"site":"landing"%') THEN 1 END) AS landing_pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' AND (path = '/' OR meta_json LIKE '%"site":"landing"%') THEN visitor_hash END) AS landing_uv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path LIKE '/app%' OR meta_json LIKE '%"site":"webapp"%') THEN 1 END) AS webapp_pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' AND (path LIKE '/app%' OR meta_json LIKE '%"site":"webapp"%') THEN visitor_hash END) AS webapp_uv,
       COUNT(CASE WHEN event_type = 'click_download' THEN 1 END) AS downloads,
       COUNT(CASE WHEN event_type = 'click_webapp' THEN 1 END) AS webapp_clicks,
       COUNT(DISTINCT CASE WHEN meta_json LIKE '%"pwa":true%' THEN visitor_hash END) AS pwa_uv
     FROM analytics_events WHERE created_at >= ?`
  ).bind(startDate).first();

  // 今日统计
  const todayStats = await env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS uv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path = '/' OR meta_json LIKE '%"site":"landing"%') THEN 1 END) AS landing_pv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path LIKE '/app%' OR meta_json LIKE '%"site":"webapp"%') THEN 1 END) AS webapp_pv,
       COUNT(CASE WHEN event_type = 'click_download' THEN 1 END) AS downloads,
       COUNT(CASE WHEN event_type = 'click_webapp' THEN 1 END) AS webapp_clicks
     FROM analytics_events WHERE substr(created_at, 1, 10) = ?`
  ).bind(todayStr).first();

  // 昨日统计
  const yesterdayStats = await env.DB.prepare(
    `SELECT 
       COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS uv
     FROM analytics_events WHERE substr(created_at, 1, 10) = ?`
  ).bind(yesterdayStr).first();

  // 2. 每日趋势
  const dailyRows = await env.DB.prepare(
    `SELECT 
       substr(created_at, 1, 10) AS date,
       COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) AS pv,
       COUNT(DISTINCT CASE WHEN event_type = 'pageview' THEN visitor_hash END) AS uv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path = '/' OR meta_json LIKE '%"site":"landing"%') THEN 1 END) AS landing_pv,
       COUNT(CASE WHEN event_type = 'pageview' AND (path LIKE '/app%' OR meta_json LIKE '%"site":"webapp"%') THEN 1 END) AS webapp_pv,
       COUNT(CASE WHEN event_type = 'click_download' THEN 1 END) AS downloads,
       COUNT(CASE WHEN event_type = 'click_webapp' THEN 1 END) AS webapp_clicks
     FROM analytics_events 
     WHERE created_at >= ? 
     GROUP BY substr(created_at, 1, 10) 
     ORDER BY date ASC`
  ).bind(startDate).all();

  // 3. 来源 TOP 8
  const referrerRows = await env.DB.prepare(
    `SELECT referrer_host, COUNT(*) AS count 
     FROM analytics_events 
     WHERE created_at >= ? AND event_type = 'pageview' 
     GROUP BY referrer_host 
     ORDER BY count DESC 
     LIMIT 8`
  ).bind(startDate).all();

  // 4. 国家 TOP 8
  const countryRows = await env.DB.prepare(
    `SELECT country, COUNT(*) AS count 
     FROM analytics_events 
     WHERE created_at >= ? AND event_type = 'pageview' 
     GROUP BY country 
     ORDER BY count DESC 
     LIMIT 8`
  ).bind(startDate).all();

  // 5. 操作系统 TOP 6
  const osRows = await env.DB.prepare(
    `SELECT os, COUNT(*) AS count 
     FROM analytics_events 
     WHERE created_at >= ? AND event_type = 'pageview' 
     GROUP BY os 
     ORDER BY count DESC 
     LIMIT 6`
  ).bind(startDate).all();

  // 6. 设备类型
  const deviceRows = await env.DB.prepare(
    `SELECT device_type, COUNT(*) AS count 
     FROM analytics_events 
     WHERE created_at >= ? AND event_type = 'pageview' 
     GROUP BY device_type 
     ORDER BY count DESC`
  ).bind(startDate).all();

  // 7. 最近 20 条事件记录
  const recentEvents = await env.DB.prepare(
    `SELECT created_at, event_type, path, referrer_host, country, os, browser, device_type, meta_json 
     FROM analytics_events 
     ORDER BY id DESC 
     LIMIT 20`
  ).all();

  return {
    summary: {
      range,
      totalPv: Number(totalStats?.pv) || 0,
      totalUv: Number(totalStats?.uv) || 0,
      landingPv: Number(totalStats?.landing_pv) || 0,
      landingUv: Number(totalStats?.landing_uv) || 0,
      webappPv: Number(totalStats?.webapp_pv) || 0,
      webappUv: Number(totalStats?.webapp_uv) || 0,
      totalDownloads: Number(totalStats?.downloads) || 0,
      totalWebappClicks: Number(totalStats?.webapp_clicks) || 0,
      pwaUv: Number(totalStats?.pwa_uv) || 0,
      todayPv: Number(todayStats?.pv) || 0,
      todayUv: Number(todayStats?.uv) || 0,
      todayLandingPv: Number(todayStats?.landing_pv) || 0,
      todayWebappPv: Number(todayStats?.webapp_pv) || 0,
      todayDownloads: Number(todayStats?.downloads) || 0,
      yesterdayPv: Number(yesterdayStats?.pv) || 0,
      yesterdayUv: Number(yesterdayStats?.uv) || 0
    },
    daily: dailyRows.results || [],
    referrers: referrerRows.results || [],
    countries: countryRows.results || [],
    os: osRows.results || [],
    devices: deviceRows.results || [],
    recent: (recentEvents.results || []).map((row) => {
      let meta = {};
      try { meta = JSON.parse(row.meta_json || '{}'); } catch {}
      return Object.assign({}, row, { site: meta.site || (row.path === '/' ? 'landing' : 'webapp') });
    })
  };
}
