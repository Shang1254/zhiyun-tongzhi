/**
 * 知云同职 - SQLite 数据层
 * 设计原则：本地数据库，绝不上传任何敏感求职信息到外部服务。
 * 用户简历正文只保存在用户设备本地（前端加密存储），
 * 服务端 profiles 表仅保存用于岗位匹配的非敏感字段（求职方向/城市/学历）。
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

// 数据目录可被 ZY_DATA_DIR 覆盖：云上把 SQLite 放到持久卷，重启不丢岗位库与拼车信息
const DATA_DIR = config.dataDir;
for (const dir of [DATA_DIR, path.join(DATA_DIR, 'logs'), path.join(DATA_DIR, 'reports')]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'zhiyun.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  company TEXT DEFAULT '',
  city TEXT DEFAULT '',
  district TEXT DEFAULT '',
  category TEXT DEFAULT '',
  salary_min INTEGER DEFAULT 0,
  salary_max INTEGER DEFAULT 0,
  salary_type TEXT DEFAULT 'monthly',
  education TEXT DEFAULT '不限',
  experience TEXT DEFAULT '不限',
  description TEXT DEFAULT '',
  requirements TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'demo',
  posted_at TEXT DEFAULT '',
  apply_url TEXT DEFAULT '',
  risk_score INTEGER DEFAULT 0,
  risk_flags TEXT DEFAULT '[]',
  is_fake INTEGER DEFAULT 0,
  expired INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT 'default',
  items TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(date, device_id)
);

CREATE TABLE IF NOT EXISTS profiles (
  device_id TEXT PRIMARY KEY,
  direction TEXT DEFAULT '',
  city TEXT DEFAULT '',
  education TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS rides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,               -- 找车 | 带人
  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  ride_date TEXT NOT NULL,          -- YYYY-MM-DD
  ride_time TEXT DEFAULT '',
  seats INTEGER DEFAULT 1,
  contact_type TEXT DEFAULT '微信', -- 电话 | 微信
  contact TEXT NOT NULL,            -- 用户主动公开的联系方式
  note TEXT DEFAULT '',
  delete_token_hash TEXT NOT NULL,  -- sha256(删除令牌)，明文只在发布时返回一次
  status TEXT DEFAULT 'active',     -- active | hidden(举报下架)
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
`);

// 轻量迁移：老库补 province 列（省-市-区县三级结构化，2026-11）
function migrate() {
  const cols = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  if (!cols.includes('province')) {
    db.exec('ALTER TABLE jobs ADD COLUMN province TEXT DEFAULT \'\'');
    console.log('[db] jobs 表已迁移：新增 province 列');
  }
}
migrate();

const meta = {
  get(key) {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  set(key, value) {
    db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  },
};

module.exports = { db, meta };
