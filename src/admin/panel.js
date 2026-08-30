// ---------------------------------------------------------------------------
// پنل ادمین اصلی: نقطه‌ی ورود (/admin)، ارسال اطلاعیه (متن/عکس/ویدیو/سند +
// دکمه‌ی لینک اختیاری)، و آمار (تعداد و آیدی کاربران). مدیریت خودِ درخت
// دکمه‌ها در menuBuilder.js و مدیریت محتوا در contentManager.js است.
// ---------------------------------------------------------------------------

import { adminMainKeyboard, backButton } from "../keyboards.js";
import { extractFile, sendFileByType } from "../utils/media.js";

export function isAdmin(userId, adminIds) {
  return adminIds.includes(String(userId));
}

export async function showAdminHome(tg, chatId) {
  await tg.sendMessage(chatId, "🛠 <b>پنل مدیریت ربات</b>\n\nیکی از گزینه‌ها را انتخاب کنید:", {
    reply_markup: adminMainKeyboard(),
  });
}

// ---------------- ارسال اطلاعیه (Broadcast) ----------------

export async function startBroadcast(tg, store, chatId) {
  await store.setSession(chatId, { type: "admin_broadcast", step: "content" });
  await tg.sendMessage(
    chatId,
    "📢 متن پیام، یا یک عکس/ویدیو/سند (با کپشن دلخواه) که می‌خواهید برای همه‌ی کاربران ارسال شود را بفرستید:",
    { reply_markup: backButton("admin:home") }
  );
}

export async function handleBroadcastInput(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_broadcast") return false;

  if (session.step === "content") {
    session.contentType = "text";
    session.text = text;
    session.step = "awaiting_link";
    await store.setSession(chatId, session);
    await tg.sendMessage(
      chatId,
      "اگر می‌خواهید یک دکمه‌ی لینک زیر پیام اضافه شود، آدرس آن را بفرستید (باید با http یا https شروع شود)؛ در غیر این صورت بنویسید: /skip"
    );
    return true;
  }

  if (session.step === "awaiting_link") {
    if (text.trim() === "/skip") {
      session.linkUrl = null;
      await performBroadcast(tg, store, chatId, session);
      return true;
    }
    if (!/^https?:\/\//i.test(text.trim())) {
      await tg.sendMessage(chatId, "⚠️ لینک باید با http یا https شروع شود، یا بنویسید /skip");
      return true;
    }
    session.linkUrl = text.trim();
    session.step = "awaiting_link_label";
    await store.setSession(chatId, session);
    await tg.sendMessage(chatId, "متن دکمه‌ی لینک را بفرستید (مثلاً: مشاهده سایت):");
    return true;
  }

  if (session.step === "awaiting_link_label") {
    session.linkLabel = text;
    await performBroadcast(tg, store, chatId, session);
    return true;
  }

  return false;
}

export async function handleBroadcastFile(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_broadcast" || session.step !== "content") return false;

  const file = extractFile(msg);
  if (!file) return false;

  session.contentType = file.type;
  session.fileId = file.fileId;
  session.caption = msg.caption || "";
  session.step = "awaiting_link";
  await store.setSession(chatId, session);

  await tg.sendMessage(
    chatId,
    "اگر می‌خواهید یک دکمه‌ی لینک زیر پیام اضافه شود، آدرس آن را بفرستید (باید با http یا https شروع شود)؛ در غیر این صورت بنویسید: /skip"
  );
  return true;
}

async function performBroadcast(tg, store, chatId, session) {
  await store.clearSession(chatId);
  const userIds = await store.allUserIds();

  await tg.sendMessage(chatId, `⏳ در حال ارسال به ${userIds.length} کاربر...`);

  const replyMarkup = session.linkUrl
    ? { inline_keyboard: [[{ text: session.linkLabel || "🔗 لینک", url: session.linkUrl }]] }
    : undefined;

  let sent = 0;
  for (const uid of userIds) {
    let res;
    if (session.contentType === "text") {
      res = await tg.sendMessage(uid, session.text, replyMarkup ? { reply_markup: replyMarkup } : {});
    } else {
      res = await sendFileByType(tg, uid, session.contentType, session.fileId, session.caption, replyMarkup);
    }
    if (res.ok) sent++;
  }

  await tg.sendMessage(chatId, `✅ اطلاعیه برای ${sent} از ${userIds.length} کاربر ارسال شد.`);
}

// ---------------- آمار ----------------

export async function showStats(tg, store, chatId) {
  const userIds = await store.allUserIds();
  await tg.sendMessage(
    chatId,
    `📊 <b>آمار ربات</b>\n\n👥 تعداد کاربران: ${userIds.length}`,
    { reply_markup: backButton("admin:home") }
  );

  if (userIds.length === 0) return;

  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize).map((id) => `<code>${id}</code>`).join(", ");
    await tg.sendMessage(chatId, `🆔 آیدی‌های کاربران (${i + 1}-${Math.min(i + chunkSize, userIds.length)}):\n${chunk}`);
  }
}
