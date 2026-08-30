// ---------------------------------------------------------------------------
// یک wrapper ساده روی Telegram Bot API. هر متد یک تابع async است که خودش
// خطاها را لاگ می‌کند تا کل ربات با یک خطای شبکه‌ای کرش نکند.
//
// بله (Bale) عملاً یک کپی سازگار از Telegram Bot API است (همان متدها، همان
// ساختار JSON)، پس همین کلاس با فقط عوض کردن baseUrl برای بله هم کار می‌کند.
// ---------------------------------------------------------------------------

export class TG {
  constructor(token, baseUrl = "https://api.telegram.org") {
    this.baseUrl = baseUrl;
    this.token = token;
    this.base = `${baseUrl}/bot${token}`;
    this.supportsChatMemberCheck = true;
    this.supportsFileUrl = true;
    this.supportsContactButton = true;
  }

  // برای فرستادن عکس به یک API خارجی (مثل هوش مصنوعی) به یک URL قابل دانلود
  // نیاز داریم؛ این تابع مسیر فایلی که از getFile گرفته‌ایم را به URL کامل تبدیل می‌کند.
  getFileUrl(filePath) {
    return `${this.baseUrl}/file/bot${this.token}/${filePath}`;
  }

  async call(method, payload) {
    try {
      const res = await fetch(`${this.base}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        console.error(`TG error [${method}]:`, data.description);
      }
      return data;
    } catch (err) {
      console.error(`TG network error [${method}]:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  sendMessage(chatId, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra,
    });
  }

  editMessageText(chatId, messageId, text, extra = {}) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: "HTML",
      ...extra,
    });
  }

  answerCallbackQuery(callbackQueryId, text = "", showAlert = false) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert,
    });
  }

  forwardMessage(chatId, fromChatId, messageId) {
    return this.call("forwardMessage", {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
  }

  copyMessage(chatId, fromChatId, messageId) {
    return this.call("copyMessage", {
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId,
    });
  }

  deleteMessage(chatId, messageId) {
    return this.call("deleteMessage", { chat_id: chatId, message_id: messageId });
  }

  setWebhook(url) {
    return this.callGet("setWebhook", { url });
  }

  // برخی پلتفرم‌ها (مثل بله) برای setWebhook با POST+JSON مشکل دارند ولی با
  // GET و query string درست جواب می‌دهند؛ این متد همان روش را پیاده می‌کند.
  async callGet(method, params) {
    try {
      const qs = new URLSearchParams(params).toString();
      const res = await fetch(`${this.base}/${method}?${qs}`, { method: "GET" });
      const data = await res.json();
      if (!data.ok) {
        console.error(`TG error [${method}]:`, data.description);
      }
      return data;
    } catch (err) {
      console.error(`TG network error [${method}]:`, err.message);
      return { ok: false, error: err.message };
    }
  }
}
