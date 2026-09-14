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
CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY,
  data TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);
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
CREATE TABLE IF NOT EXISTS anon_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ref_message_id TEXT,
  question TEXT,
  asked_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS gate_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT,
  channel_title TEXT,
  invite_link TEXT
);
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
CREATE TABLE IF NOT EXISTS ai_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS video_fields (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS video_grades (
  id TEXT PRIMARY KEY,
  field_id TEXT,
  title TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS video_lessons (
  id TEXT PRIMARY KEY,
  grade_id TEXT,
  title TEXT NOT NULL,
  message_id INTEGER,
  sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  admin_id INTEGER,
  admin_msg_id TEXT,
  text TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount INTEGER DEFAULT 0,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  ref_user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS user_tags (
  user_id INTEGER,
  tag TEXT,
  PRIMARY KEY (user_id, tag)
);
CREATE TABLE IF NOT EXISTS polls (
  id TEXT PRIMARY KEY,
  question TEXT NOT NULL,
  options TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS poll_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  poll_id TEXT,
  option_index INTEGER,
  UNIQUE(user_id, poll_id)
);
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT,
  send_at TEXT,
  tag TEXT,
  sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO bot_settings (key, value) VALUES
  ('bot_active','1'),('ad_listener_active','0'),('ad_delete_after','30'),
  ('ad_button_type','button'),('ad_target_bot',''),('join_request_active','0'),
  ('join_request_message','برای عضویت ربات را استارت کنید'),
  ('ad_message',''),('gate_require_phone','0'),
  ('start_message','سلام! خوش آمدید.'),
  ('welcome_message',''),('points_per_ref','10'),('video_channel',''),
  ('feature_video','1'),('feature_support','1'),('feature_points','1'),
  ('feature_poll','1'),('feature_scheduler','1'),('feature_tags','1'),
  ('feature_anon_qa','1'),('feature_ai_chat','1'),('feature_gate','0'),
  ('feature_attract','1'),('feature_join_request','0'),('feature_forms','1'),
  ('feature_welcome','1'),('feature_referral','1');

INSERT OR IGNORE INTO menu_nodes (id,parent_id,title,type,enabled)
  VALUES ('root',NULL,'منوی اصلی','submenu',1);

INSERT OR IGNORE INTO forms (id,title,steps) VALUES
  ('consultation','درخواست مشاوره','[{"key":"full_name","question":"نام:"},{"key":"phone","question":"شماره تماس:"},{"key":"message","question":"توضیحات:"}]');
