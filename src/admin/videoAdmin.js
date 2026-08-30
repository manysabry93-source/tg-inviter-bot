// ---------------------------------------------------------------------------
// مدیریت ویدیوها از پنل ادمین. به‌جای این‌که ادمین مجبور باشه شماره‌ی پیام
// (messageId) رو دستی پیدا کنه، فقط کافیه ویدیوی مربوطه رو از کانال
// @fara_video به این چت فوروارد کند — ربات خودش شماره‌ی پیام اصلی داخل
// کانال را از فوروارد استخراج می‌کند.
// ---------------------------------------------------------------------------

import { backButton } from "../keyboards.js";

export async function showVideoFieldsAdmin(tg, store, chatId) {
  const tree = await store.get("video:tree");
  const rows = tree.fields.map((f) => [{ text: f, callback_data: `adminvfield:${f}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "admin:home" }]);
  await tg.sendMessage(chatId, "🎥 <b>مدیریت ویدیوها</b>\n\nرشته را انتخاب کنید:", {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showVideoGradesAdmin(tg, store, chatId, field) {
  const tree = await store.get("video:tree");
  const rows = tree.grades.map((g) => [{ text: g, callback_data: `adminvgrade:${field}:${g}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "admin:videos" }]);
  await tg.sendMessage(chatId, `📗 رشته: <b>${field}</b>\n\nمقطع را انتخاب کنید:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showLessonsAdmin(tg, store, chatId, field, grade) {
  const tree = await store.get("video:tree");
  const lessons = tree.videos?.[field]?.[grade] || [];

  const rows = lessons.map((lesson, idx) => [
    { text: `🗑 ${lesson.title}`, callback_data: `adminvdel:${field}:${grade}:${idx}` },
  ]);
  rows.push([{ text: "➕ افزودن درس جدید", callback_data: `adminvadd:${field}:${grade}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: `adminvfield:${field}` }]);

  const listText = lessons.length
    ? lessons.map((l, i) => `${i + 1}. ${l.title}`).join("\n")
    : "هنوز درسی ثبت نشده.";

  await tg.sendMessage(
    chatId,
    `📘 ${field} - ${grade}\n\n<b>دروس فعلی:</b>\n${listText}\n\nبرای حذف یک درس روی آن بزنید:`,
    { reply_markup: { inline_keyboard: rows } }
  );
}

export async function deleteLesson(tg, store, chatId, field, grade, idx) {
  const tree = await store.get("video:tree");
  const lessons = tree.videos?.[field]?.[grade] || [];
  if (lessons[idx]) {
    lessons.splice(idx, 1);
    await store.set("video:tree", tree);
  }
  await showLessonsAdmin(tg, store, chatId, field, grade);
}

export async function startAddLesson(tg, store, chatId, field, grade) {
  await store.setSession(chatId, {
    type: "admin_video_add",
    step: "title",
    field,
    grade,
  });
  await tg.sendMessage(chatId, "✏️ عنوان این درس را بنویسید (مثلاً «زیست‌شناسی - فصل ۱»):", {
    reply_markup: backButton(`adminvgrade:${field}:${grade}`),
  });
}

export async function handleVideoAdminTextInput(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_video_add" || session.step !== "title") return false;

  session.step = "awaiting_forward";
  session.title = text;
  await store.setSession(chatId, session);

  await tg.sendMessage(
    chatId,
    `حالا ویدیوی «<b>${text}</b>» را از کانال @fara_video به همین چت <b>فوروارد</b> کنید.\n\n` +
      "⚠️ توجه: باید پیام را از داخل خود کانال Forward کنید، نه ارسال دوباره یا آپلود مجدد.",
    { reply_markup: backButton(`adminvgrade:${session.field}:${session.grade}`) }
  );
  return true;
}

export async function handleVideoAdminForward(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_video_add" || session.step !== "awaiting_forward") {
    return false;
  }

  // پشتیبانی از هر دو فرمت API تلگرام (قدیمی و جدید Bot API 7+)
  const forwardedMessageId =
    msg.forward_from_message_id ||
    msg.forward_origin?.message_id ||
    (msg.forward_origin?.type === "channel" ? msg.forward_origin.message_id : null);

  const forwardedChat =
    msg.forward_from_chat?.username ||
    msg.forward_origin?.chat?.username ||
    null;

  if (!forwardedMessageId) {
    await tg.sendMessage(
      chatId,
      "⚠️ این پیام به‌عنوان فوروارد شناسایی نشد. لطفاً حتماً پیام را مستقیماً از کانال @fara_video فوروارد کنید (نه کپی یا ارسال مجدد)."
    );
    return true;
  }

  const tree = await store.get("video:tree");
  if (!tree.videos[session.field]) tree.videos[session.field] = {};
  if (!tree.videos[session.field][session.grade]) tree.videos[session.field][session.grade] = [];

  tree.videos[session.field][session.grade].push({
    title: session.title,
    messageId: forwardedMessageId,
  });

  await store.set("video:tree", tree);
  await store.clearSession(chatId);

  await tg.sendMessage(
    chatId,
    `✅ درس «${session.title}» با موفقیت اضافه شد.` +
      (forwardedChat && forwardedChat !== "fara_video"
        ? `\n\n⚠️ توجه: این پیام از کانال @${forwardedChat} فوروارد شده، نه @fara_video. اگر اشتباه بوده، این درس را حذف و دوباره تلاش کنید.`
        : "")
  );
  await showLessonsAdmin(tg, store, chatId, session.field, session.grade);
  return true;
}
