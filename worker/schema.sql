-- 豆仓同步后端 D1 表结构（阶段 4）。
-- 应用：worker/ 目录下 `npx wrangler d1 execute cofebean-sync --remote --file=./schema.sql`
-- 所有语句幂等（IF NOT EXISTS），可重复执行。

-- 用户：邮箱唯一账号键；只存密码哈希 + salt，绝不存明文；recovery_hash 为一次性恢复码的哈希。
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT UNIQUE NOT NULL,
  pwd_hash TEXT NOT NULL,
  pwd_salt TEXT NOT NULL,
  recovery_hash TEXT,
  created_at TEXT NOT NULL
);

-- 会话：不透明随机 token，可撤销。
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 记录：每用户每类型每 id 一行；payload_json 为归一化后的实体；server_seq 供游标增量拉取。
CREATE TABLE IF NOT EXISTS records (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  device_id TEXT,
  payload_json TEXT NOT NULL,
  server_seq INTEGER NOT NULL,
  PRIMARY KEY (user_id, type, id)
);
-- 增量拉取：按 user_id + server_seq 顺序取 > cursor 的记录。
CREATE INDEX IF NOT EXISTS idx_records_pull ON records(user_id, server_seq);

-- 每用户单调递增序列，push 时给每条落库记录分配 server_seq（作为 pull 游标）。
CREATE TABLE IF NOT EXISTS user_seq (
  user_id TEXT PRIMARY KEY NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0
);

-- 图片引用：R2 key = sha256，内容寻址去重；ref_count 供延迟清理。
CREATE TABLE IF NOT EXISTS image_refs (
  user_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER,
  mime TEXT,
  ref_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, sha256)
);
