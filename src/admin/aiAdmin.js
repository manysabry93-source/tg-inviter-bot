// ---------------------------------------------------------------------------
// تنظیمات کلی هوش مصنوعی: آدرس API، کلید، و نام مدل. یک‌بار تنظیم می‌شود و
// همه‌ی دکمه‌های نوع «هوش مصنوعی» در سراسر ربات از همین استفاده می‌کنند.
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = { baseUrl: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o-mini" };

export async function showAIAdmin(tg, store, chatId) {
  const config = await store.getShared("ai:config", DEFAULT_CONFIG);
  const status = config.apiKey ? "✅ تنظیم شده" : "❌ تنظیم نشده (دکمه‌های هوش مصنوعی کار نمی‌کنند)";

  await tg.sendMessage(
    chatId,
    "🤖 <b>تنظیمات هوش مصنوعی</b>\n\n" +
      `وضعیت کلید: ${status}\n` +
      `آدرس فعلی: <code>${config.baseUrl}</code>\n` +
      `مدل فعلی: <code>${config.model}</code>\n\n` +
      "از یک سرویس سازگار با فرمت OpenAI استفاده کنید (مثل خود OpenAI، OpenRouter، DeepSeek و...). ⚠️ کلید API در دیتابیس ربات ذخیره می‌شود.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 تنظیم آدرس API (Base URL)", callback_data: "aisetbaseurl" }],
          [{ text: "🔑 تنظیم کلید API", callback_data: "aisetkey" }],
          [{ text: "🧠 تنظیم نام مدل", callback_data: "aisetmodel" }],
          [{ text: "🔙 بازگشت", callback_data: "admin:home" }],
        ],
      },
    }
  );
}

export async function startSetField(tg, store, chatId, field) {
  await store.setSession(chatId, { type: "admin_ai_field", field });
  const prompts = {
    baseUrl: "آدرس Base URL سرویس هوش مصنوعی را بفرستید (مثلاً https://api.openai.com/v1):",
    apiKey: "کلید API را بفرستید:",
    model: "نام مدل را بفرستید (مثلاً gpt-4o-mini):",
  };
  await tg.sendMessage(chatId, prompts[field]);
}

export async function handleFieldText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_ai_field") return false;

  const config = await store.getShared("ai:config", DEFAULT_CONFIG);
  config[session.field] = session.field === "baseUrl" ? text.trim().replace(/\/$/, "") : text.trim();
  await store.setShared("ai:config", config);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, "✅ ذخیره شد.");
  await showAIAdmin(tg, store, chatId);
  return true;
}
