-- Core tables
CREATE TABLE IF NOT EXISTS admins (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  is_super INTEGER DEFAULT 0,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  last_seen TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Menu system
CREATE TABLE IF NOT EXISTS menu_nodes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'text',
  content TEXT,
  url TEXT,
  form_key TEXT,
  enabled INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  columns INTEGER DEFAULT 2,
  access_mode TEXT DEFAULT 'everyone',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS menu_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id TEXT,
  file_type TEXT,
  file_id TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_access_users (
  node_id TEXT,
  user_id INTEGER,
  PRIMARY KEY (node_id, user_id)
);

-- Forms
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  title TEXT,
  steps TEXT,
  notify_admin INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS form_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_id TEXT,
  user_id INTEGER,
  username TEXT,
  first_name TEXT,
  data TEXT,
  submitted_at TEXT DEFAULT (datetime('now'))
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY,
  data TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Anon QA
CREATE TABLE IF NOT EXISTS anon_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ref_message_id TEXT,
  question TEXT,
  asked_at TEXT DEFAULT (datetime('now'))
);

-- Access gate
CREATE TABLE IF NOT EXISTS gate_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT,
  channel_title TEXT,
  invite_link TEXT
);

-- Attract members
CREATE TABLE IF NOT EXISTS ad_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT UNIQUE,
  group_title TEXT,
  is_active INTEGER DEFAULT 1
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

-- AI Chat
CREATE TABLE IF NOT EXISTS ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Default settings
INSERT OR IGNORE INTO bot_settings (key, value) VALUES
  ('bot_active', '1'),
  ('ad_listener_active', '0'),
  ('ad_delete_after', '30'),
  ('ad_button_type', 'button'),
  ('ad_target_bot', ''),
  ('join_request_active', '0'),
  ('join_request_message', 'برای عضویت در کانال ابتدا ربات ما را استارت کنید 👇'),
  ('ad_message', ''),
  ('gate_require_phone', '0'),
  ('start_message', '👋 سلام! به ربات خوش آمدید.');

-- Default root menu node
INSERT OR IGNORE INTO menu_nodes (id, parent_id, title, type, enabled) VALUES
  ('root', NULL, '🏠 منوی اصلی', 'submenu', 1);

-- Default forms
INSERT OR IGNORE INTO forms (id, title, steps) VALUES
  ('consultation', 'درخواست مشاوره', '[{"key":"full_name","question":"نام و نام خانوادگی:"},{"key":"phone","question":"شماره تماس:"},{"key":"message","question":"توضیحات:"}]');
