-- ساختار پایگاه داده D1

CREATE TABLE IF NOT EXISTS admins (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  is_super INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT UNIQUE,
  channel_title TEXT,
  channel_link TEXT,
  is_active INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS target_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT UNIQUE,
  channel_title TEXT,
  channel_link TEXT,
  is_active INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS converted_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  source_channel_id TEXT,
  target_channel_id TEXT,
  message_sent INTEGER DEFAULT 0,
  converted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS invite_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_text TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT UNIQUE,
  group_title TEXT,
  group_link TEXT,
  is_active INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_text TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_sent_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  group_id TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS join_request_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  username TEXT,
  first_name TEXT,
  channel_id TEXT,
  approved INTEGER DEFAULT 0,
  requested_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ad_sent_user ON ad_sent_log(user_id);
CREATE INDEX IF NOT EXISTS idx_join_user ON join_request_log(user_id);

INSERT OR IGNORE INTO bot_settings (key, value) VALUES
  ('bot_active', '1'),
  ('delay_between_messages', '3'),
  ('max_daily_invites', '50'),
  ('ad_listener_active', '1'),
  ('ad_cooldown_hours', '120'),
  ('ad_delete_after', '30'),
  ('ad_button_type', 'button'),
  ('ad_target_bot', ''),
  ('join_request_active', '0'),
  ('join_request_message', 'برای عضویت در کانال ابتدا ربات ما را استارت کنید 👇');
