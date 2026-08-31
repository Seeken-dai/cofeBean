-- 落地页与 Web 访问统计表
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  referrer TEXT,
  referrer_host TEXT,
  country TEXT,
  os TEXT,
  browser TEXT,
  device_type TEXT,
  visitor_hash TEXT NOT NULL,
  meta_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor ON analytics_events(visitor_hash, created_at);
