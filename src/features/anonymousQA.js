// ---------------------------------------------------------------------------
// سوال ناشناس: پیام کاربر با یک شناسه‌ی یکتا (نه هویت واقعی) برای ادمین
// فرستاده می‌شود. وقتی ادمین روی همان پیام Reply می‌زند، جواب با همان
// شناسه به کاربر اصلی برمی‌گردد. هویت کاربر برای ادمین قابل مشاهده نیست.
// ---------------------------------------------------------------------------

import { backButton } from "../keyboards.js";

export async function startAnonQuestion(tg, store, chatId, userId) {
  await store.setSession(userId, { type: "anon_qa" });
  await tg.sendMessage(
    chatId,
    "❓ <b>سوال ناشناس</b>\n\nسوال خود را بنویسید. هویت شما برای مشاور نمایش داده نمی‌شود.",
    { reply_markup: backButton() }
  );
}

export async function handleAnonInput(tg, store, chatId, userId, text, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "anon_qa") return false;

  await store.clearSession(userId);

  const refId = Math.random().toString(36).slice(2, 8).toUpperCase();
  await store.mapAnonQuestion(refId, userId);

  const adminText =
    `❓ <b>سوال ناشناس جدید</b> (کد: <code>${refId}</code>)\n\n${text}\n\n` +
    `↩️ برای پاسخ، روی همین پیام Reply بزنید.`;

  for (const adminId of adminIds) {
    await tg.sendMessage(adminId, adminText);
  }

  await tg.sendMessage(chatId, "✅ سوال شما برای مشاورین ارسال شد. پاسخ به‌زودی همینجا برای شما ارسال می‌شود.");
  return true;
}

// وقتی ادمین روی پیام سوال Reply می‌زند این تابع فراخوانی می‌شود
export async function handleAdminReply(tg, store, adminChatId, repliedText, replyText) {
  const match = repliedText.match(/کد:\s*([A-Z0-9]{6})/);
  if (!match) return false;

  const refId = match[1];
  const mapping = await store.getAnonQuestion(refId);
  if (!mapping) {
    await tg.sendMessage(adminChatId, "⚠️ این سوال دیگر معتبر نیست یا قبلاً پاسخ داده شده.");
    return true;
  }

  await tg.sendMessage(mapping.userId, `💬 <b>پاسخ به سوال ناشناس شما:</b>\n\n${replyText}`);
  await tg.sendMessage(adminChatId, "✅ پاسخ برای کاربر ارسال شد.");
  return true;
}
