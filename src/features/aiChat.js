// ---------------------------------------------------------------------------
// چت با هوش مصنوعی: هر دکمه‌ای که نوعش "ai_chat" باشد، کاربر را وارد یک
// جلسه‌ی گفتگو می‌کند. تنظیمات کلی (آدرس API، کلید، مدل) یک‌بار در پنل
// ادمین مشخص می‌شود و همه‌ی دکمه‌های نوع هوش مصنوعی از همان استفاده می‌کنند؛
// هر دکمه می‌تواند یک دستورالعمل (system prompt) اختصاصی هم داشته باشد.
//
// از فرمت استاندارد OpenAI-compatible Chat Completions استفاده می‌شود، چون
// اکثر سرویس‌های هوش مصنوعی (OpenAI, OpenRouter, DeepSeek, Together و...)
// همین فرمت را پیاده‌سازی می‌کنند — یعنی با عوض کردن فقط آدرس/کلید/مدل در
// پنل ادمین، می‌شود سرویس را عوض کرد.
// ---------------------------------------------------------------------------

import { getNodes } from "../menuNodes.js";

export const DEFAULT_AI_PROMPT =
  "تو یک دستیار هوشمند آموزشی هستی که به دانش‌آموزان در حل سوالات درسی، رفع اشکال، و تحلیل تصاویر (مثل عکس سوال یا دفترچه) کمک می‌کنی. پاسخ‌ها را ساده، دقیق و به زبان فارسی بده.";

const HISTORY_LIMIT = 16;
const ENDING_KEYBOARD = { inline_keyboard: [[{ text: "🔙 پایان گفتگو", callback_data: "aichatend" }]] };

export async function startAIChat(tg, store, chatId, userId, node) {
  await store.setSession(userId, { type: "ai_chat", nodeId: node.id, parentId: node.parentId, history: [] });
  await tg.sendMessage(
    chatId,
    `🤖 <b>${node.title}</b>\n\nسوالت رو بپرس یا عکس (مثلاً عکس سوال یا دفترچه) بفرست. هروقت خواستی تموم کنی، دکمه‌ی زیر رو بزن.`,
    { reply_markup: ENDING_KEYBOARD }
  );
}

export async function endAIChat(store, userId) {
  const session = await store.getSession(userId);
  const parentId = session?.parentId || "root";
  await store.clearSession(userId);
  return parentId;
}

export async function handleAIChatText(tg, store, chatId, userId, text) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "ai_chat") return false;

  const config = await store.getShared("ai:config", null);
  if (!config || !config.apiKey) {
    await tg.sendMessage(chatId, "⚠️ هوش مصنوعی هنوز توسط ادمین تنظیم نشده است.", { reply_markup: ENDING_KEYBOARD });
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  const systemPrompt = node?.aiPrompt || DEFAULT_AI_PROMPT;

  await tg.sendMessage(chatId, "⏳ در حال فکر کردن...");

  const messages = [{ role: "system", content: systemPrompt }, ...session.history, { role: "user", content: text }];
  const result = await callAIProvider(config, messages);

  if (!result.ok) {
    await tg.sendMessage(chatId, `⚠️ خطا در ارتباط با هوش مصنوعی: ${result.error}`, { reply_markup: ENDING_KEYBOARD });
    return true;
  }

  session.history.push({ role: "user", content: text });
  session.history.push({ role: "assistant", content: result.reply });
  if (session.history.length > HISTORY_LIMIT) session.history = session.history.slice(-HISTORY_LIMIT);
  await store.setSession(userId, session);

  await tg.sendMessage(chatId, result.reply, { reply_markup: ENDING_KEYBOARD });
  return true;
}

export async function handleAIChatImage(tg, store, chatId, userId, msg) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "ai_chat") return false;
  if (!msg.photo || !msg.photo.length) return false;

  if (!tg.supportsFileUrl) {
    await tg.sendMessage(chatId, "⚠️ این پلتفرم فعلاً امکان تحلیل عکس را ندارد؛ لطفاً سوالت رو به‌صورت متن بفرست.", {
      reply_markup: ENDING_KEYBOARD,
    });
    return true;
  }

  const config = await store.getShared("ai:config", null);
  if (!config || !config.apiKey) {
    await tg.sendMessage(chatId, "⚠️ هوش مصنوعی هنوز توسط ادمین تنظیم نشده است.", { reply_markup: ENDING_KEYBOARD });
    return true;
  }

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const fileRes = await tg.call("getFile", { file_id: fileId });
  const filePath = fileRes?.result?.file_path;
  if (!filePath) {
    await tg.sendMessage(chatId, "⚠️ خطا در دریافت عکس.", { reply_markup: ENDING_KEYBOARD });
    return true;
  }
  const imageUrl = tg.getFileUrl(filePath);

  await tg.sendMessage(chatId, "⏳ در حال تحلیل عکس...");

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  const systemPrompt = node?.aiPrompt || DEFAULT_AI_PROMPT;
  const userText = msg.caption || "این عکس را تحلیل کن و کمکم کن.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...session.history,
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    },
  ];

  const result = await callAIProvider(config, messages);

  if (!result.ok) {
    await tg.sendMessage(chatId, `⚠️ خطا در ارتباط با هوش مصنوعی: ${result.error}`, { reply_markup: ENDING_KEYBOARD });
    return true;
  }

  session.history.push({ role: "user", content: `${userText} [+عکس ارسال شد]` });
  session.history.push({ role: "assistant", content: result.reply });
  if (session.history.length > HISTORY_LIMIT) session.history = session.history.slice(-HISTORY_LIMIT);
  await store.setSession(userId, session);

  await tg.sendMessage(chatId, result.reply, { reply_markup: ENDING_KEYBOARD });
  return true;
}

async function callAIProvider(config, messages) {
  try {
    const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({ model: config.model, messages, max_tokens: 1200 }),
    });
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return { ok: false, error: data?.error?.message || "پاسخی از سرویس دریافت نشد." };
    return { ok: true, reply };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
