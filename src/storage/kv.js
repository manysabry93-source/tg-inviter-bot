// ---------------------------------------------------------------------------
// لایه‌ی ذخیره‌سازی: تمام داده‌های ربات (دکمه‌ها، لینک‌ها، ویدیوها، کاربران،
// سشن‌ها، سوالات ناشناس) از همینجا خوانده و نوشته می‌شود.
// هیچ بخش دیگری از کد مستقیماً به env.BOT_DB دسترسی ندارد.
//
// هر پلتفرم (تلگرام/بله/روبیکا) یک نمونه‌ی جدا از Store با یک prefix متفاوت
// می‌سازد تا داده‌های کاربران/منو/تنظیمات هر پلتفرم کاملاً از بقیه جدا بماند
// (چون آیدی کاربر، فایل‌ها و کانال‌های هر پلتفرم مستقل از بقیه هستند).
// ---------------------------------------------------------------------------

export class Store {
  constructor(env, platform = "tg") {
    this.db = env.BOT_DB;
    this.platform = platform;
    this.prefix = `${platform}:`;
  }

  async get(key, fallback = null) {
    const raw = await this.db.get(this.prefix + key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async set(key, value) {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    await this.db.put(this.prefix + key, raw);
  }

  async delete(key) {
    await this.db.delete(this.prefix + key);
  }

  async list(prefix) {
    const { keys } = await this.db.list({ prefix: this.prefix + prefix });
    return keys.map((k) => k.name.slice(this.prefix.length));
  }

  // ---------------- داده‌ی مشترک بین همه‌ی پلتفرم‌ها ----------------
  // برای چیزهایی مثل ساختار منو که باید در تلگرام/بله/روبیکا یکسان باشد؛
  // این متدها prefix پلتفرم را نادیده می‌گیرند و همیشه یک فضای ثابت
  // ("shared:") را می‌خوانند/می‌نویسند، مهم نیست کدام Store صدایش بزند.
  async getShared(key, fallback = null) {
    const raw = await this.db.get(`shared:${key}`);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  async setShared(key, value) {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    await this.db.put(`shared:${key}`, raw);
  }

  // ---------------- کاربران ----------------
  async saveUser(user) {
    const key = `user:${user.id}`;
    const existing = await this.get(key, {});
    await this.set(key, {
      ...existing,
      id: user.id,
      first_name: user.first_name,
      username: user.username || null,
      last_seen: Date.now(),
    });
  }

  async allUserIds() {
    const keys = await this.list("user:");
    return keys.map((k) => k.replace("user:", ""));
  }

  // ---------------- سشن (state چندمرحله‌ای) ----------------
  async getSession(userId) {
    return this.get(`session:${userId}`, null);
  }

  async setSession(userId, session) {
    await this.set(`session:${userId}`, session);
  }

  async clearSession(userId) {
    await this.delete(`session:${userId}`);
  }

  // ---------------- ساختار منو (قابل ویرایش توسط ادمین) ----------------
  async getMenuTree() {
    return this.get("menu:tree", null);
  }

  async setMenuTree(tree) {
    await this.set("menu:tree", tree);
  }

  // ---------------- نگاشت سوال ناشناس -> کاربر اصلی ----------------
  async mapAnonQuestion(refId, userId) {
    await this.set(`anon:${refId}`, { userId, ts: Date.now() });
  }

  async getAnonQuestion(refId) {
    return this.get(`anon:${refId}`, null);
  }
}
