-- 图片回收（标记-清除）所需的补列。只对本次改动之前就已存在的库执行一次。
-- 新建库直接跑 schema.sql 即可，不需要这个文件。
--
-- 应用：worker/ 目录下
--   npx wrangler d1 execute cofebean-sync --remote --file=./migrations/001-image-gc.sql
--
-- 重复执行会在 ADD COLUMN 处报 "duplicate column name: last_put"，属预期，可忽略。
ALTER TABLE image_refs ADD COLUMN last_put TEXT;

-- 存量行没有 last_put：视作「很久以前上传」，让 cron 首次全量扫描就能判定它们是否孤儿。
-- 仍被记录引用的图不会被删（存活集来自 records），所以这里留 NULL 是安全的。

CREATE INDEX IF NOT EXISTS idx_image_refs_last_put ON image_refs(user_id, last_put);
