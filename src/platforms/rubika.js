// ---------------------------------------------------------------------------
// آداپتور روبیکا. برخلاف بله که تقریباً کپی API تلگرام است، API روبیکا
// ساختار کاملاً متفاوتی دارد (آیدی‌ها GUID هستند، کیبورد این‌لاین با
// aux_data.button_id کار می‌کند، و آپدیت‌ها از دو مسیر جدا می‌رسند).
// این فایل یک لایه‌ی سازگاری می‌سازد تا بقیه‌ی کد (که با شکل Telegram
// نوشته شده) بدون تغییر با روبیکا هم کار کند.
//
// ⚠️ توجه مهم: بخش‌هایی از شکل دقیق پیام‌های ورودی روبیکا (برای عکس/ویدیو/
// سند/مخاطب) بر اساس مستندات عمومی و نمونه‌های موجود حدس زده شده و ممکن
// است با تست واقعی نیاز به اصلاح جزئی داشته باشد. بعد از گرفتن توکن واقعی
// از BotFather روبیکا، یک پیام تستی بفرستید و اگر رفتار غیرمنتظره دیدید،
// خروجی console.log(JSON.stringify(body)) را (از Cloudflare Logs) بررسی
// و ساختار normalizeRubikaUpdate را با آن تطبیق دهید.
// ---------------------------------------------------------------------------

const RUBIKA_BASE = "https://botapi.rubika.ir/v3";

const MEDIA_METHODS = ["sendPhoto", "sendVideo", "sendDocument", "sendAudio", "sendVoice", "sendAnimation"];
const MEDIA_FIELDS = ["photo", "video", "document", "audio", "voice", "animation"];

export class RubikaClient {
  constructor(token) {
    this.token = token;
    this.base = `${RUBIKA_BASE}/${token}`;
    // روبیکا متد چک عضویت کانال ندارد؛ گیت دسترسی این پرچم را می‌بیند و
    // بخش «عضویت اجباری در کانال» را برای این پلتفرم غیرفعال می‌کند (فقط
    // الزام شماره تماس، که وابسته به این API نیست، همچنان کار می‌کند).
    this.supportsChatMemberCheck = false;
    this.supportsFileUrl = false;
    this.supportsContactButton = false;
  }

  async call(method, payload) {
    // فراخوانی‌های ارسال رسانه که در بقیه‌ی کد به سبک تلگرام نوشته شده‌اند
    // (sendPhoto/sendVideo/...) را به sendFile روبیکا ترجمه می‌کنیم.
    if (MEDIA_METHODS.includes(method)) {
      const idx = MEDIA_METHODS.indexOf(method);
      const field = MEDIA_FIELDS[idx];
      const rubikaPayload = { chat_id: payload.chat_id, file_id: payload[field] };
      if (payload.caption) rubikaPayload.text = payload.caption;
      return this.call("sendFile", rubikaPayload);
    }

    try {
      const res = await fetch(`${this.base}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.status !== "OK" && data?.status !== "ok") {
        console.error(`Rubika error [${method}]:`, JSON.stringify(data));
      }
      return normalizeRubikaResult(data);
    } catch (err) {
      console.error(`Rubika network error [${method}]:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  sendMessage(chatId, text, extra = {}) {
    const payload = { chat_id: chatId, text };
    applyKeyboards(payload, extra);
    return this.call("sendMessage", payload);
  }

  editMessageText(chatId, messageId, text, extra = {}) {
    const payload = { chat_id: chatId, message_id: messageId, text };
    applyKeyboards(payload, extra);
    return this.call("editMessageText", payload);
  }

  // روبیکا مفهوم «پاسخ به callback» جدا ندارد؛ کلیک روی دکمه‌ی این‌لاین
  // خودش یک پیام مستقل است، پس این متد فقط برای سازگاری با بقیه‌ی کد نگه
  // داشته شده و کاری انجام نمی‌دهد.
  async answerCallbackQuery() {
    return { ok: true };
  }

  // روبیکا برای بات‌ها معادل مستقیم forward/copy از یک کانال ندارد؛ این
  // قابلیت‌ها در router.js برای پلتفرم‌های غیر از تلگرام/بله غیرفعال شده‌اند.
  async forwardMessage() {
    return { ok: false, error: "not supported on Rubika" };
  }

  async copyMessage() {
    return { ok: false, error: "not supported on Rubika" };
  }

  async deleteMessage(chatId, messageId) {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  // ثبت وبهوک روبیکا (فقط برای رویدادهای خاص مثل کلیک دکمه کار می‌کند؛
  // برای پیام‌های معمولی از polling با getUpdates استفاده می‌شود - پایین‌تر)
  async setWebhook(url) {
    const r1 = await this.call("updateBotEndpoints", { url, type: "ReceiveInlineMessage" });
    return { ok: r1.ok, receiveInlineMessage: r1 };
  }

  // چون وبهوک روبیکا پیام‌های معمولی (متن/عکس/شروع چت) را ارسال نمی‌کند،
  // این پیام‌ها را با فراخوانی دوره‌ای getUpdates دریافت می‌کنیم.
  async getUpdates(offsetId) {
    const payload = { limit: 50 };
    if (offsetId) payload.offset_id = offsetId;
    return this.call("getUpdates", payload);
  }
}

function normalizeRubikaResult(data) {
  const ok = data?.status === "OK" || data?.status === "ok";
  return { ok, result: data?.data, raw: data };
}

// تبدیل reply_markup به شکلی که روبیکا می‌فهمد (inline_keypad یا chat_keypad)
function applyKeyboards(payload, extra) {
  const markup = extra.reply_markup;
  if (!markup) return;

  if (markup.inline_keyboard) {
    payload.inline_keypad = {
      rows: markup.inline_keyboard.map((row) => ({
        buttons: row.map((btn) => {
          if (btn.url) {
            return { id: `url:${btn.text}`, type: "Link", button_text: btn.text, button_link: { type: "url", link_url: btn.url } };
          }
          return { id: btn.callback_data, type: "Simple", button_text: btn.text };
        }),
      })),
    };
    return;
  }

  if (markup.keyboard) {
    payload.chat_keypad_type = "New";
    payload.chat_keypad = {
      rows: markup.keyboard.map((row) => ({
        buttons: row.map((btn) => {
          if (btn.request_contact) {
            return { id: "share_phone", type: "MyPhoneNumber", button_text: btn.text };
          }
          return { id: btn.text, type: "Simple", button_text: btn.text };
        }),
      })),
    };
    return;
  }

  if (markup.remove_keyboard) {
    payload.chat_keypad_type = "Removed";
  }
}

// ---------------------------------------------------------------------------
// نرمال‌سازی آپدیت ورودی روبیکا به همان شکلی که router.js از تلگرام انتظار
// دارد: { message: {...} } یا { callback_query: {...} }
//
// روبیکا دو نوع بدنه‌ی متفاوت می‌فرستد:
//  - پیام معمولی / دکمه‌ی چت‌کیپد: { update: { type, chat_id, new_message: {...} } }
//  - کلیک روی دکمه‌ی این‌لاین: { inline_message: { chat_id, sender_id, text, aux_data:{button_id} } }
// ---------------------------------------------------------------------------
export function normalizeRubikaUpdate(body) {
  if (body?.inline_message) {
    const im = body.inline_message;
    return {
      callback_query: {
        id: im.message_id || String(Date.now()),
        data: im.aux_data?.button_id || "",
        from: { id: im.chat_id, first_name: "" },
        message: { chat: { id: im.chat_id }, message_id: im.message_id },
      },
    };
  }

  if (body?.update) {
    const u = body.update;
    const nm = u.new_message || {};
    const chatId = u.chat_id;

    const message = {
      message_id: nm.message_id,
      chat: { id: chatId },
      from: { id: chatId, first_name: nm.sender?.first_name || "" },
      text: nm.text || "",
    };

    // ⚠️ نگاشت فایل/مخاطب زیر بر اساس ساختار رایج این نوع APIها حدس زده
    // شده — بعد از تست واقعی احتمالاً نیاز به اصلاح دارد.
    if (nm.file) {
      const typeMap = { Image: "photo", Video: "video", Gif: "animation", Voice: "voice", Music: "audio", File: "document" };
      const kind = typeMap[nm.file.type] || "document";
      if (kind === "photo") message.photo = [{ file_id: nm.file.file_id }];
      else message[kind] = { file_id: nm.file.file_id };
    }
    if (nm.contact_message) {
      message.contact = {
        phone_number: nm.contact_message.phone_number,
        first_name: nm.contact_message.first_name || "",
      };
    }

    return { message };
  }

  return {};
}

// آیتم‌های آرایه‌ی updates که از getUpdates برمی‌گردند همان شکل Update
// هستند که در بدنه‌ی وبهوک هم دیده‌ایم، فقط بدون بسته‌بندی اضافه.
export function normalizeRubikaPollItem(item) {
  if (item?.new_message || item?.chat_id) {
    return normalizeRubikaUpdate({ update: item });
  }
  if (item?.inline_message) {
    return normalizeRubikaUpdate({ inline_message: item.inline_message });
  }
  return null;
}
