// ---------------------------------------------------------------------------
// بخش ویدیو آموزشی: کاربر رشته -> مقطع -> درس را انتخاب می‌کند و ربات
// ویدیوی مربوطه را مستقیماً از کانال @fara_video برای او فوروارد می‌کند.
// ادمین از پنل، برای هر (رشته، مقطع) لیست دروس و آیدی پیام هر ویدیو در
// کانال را تعریف می‌کند.
// ---------------------------------------------------------------------------

import { buildSimpleList, backButton } from "../keyboards.js";

export async function showFields(tg, store, chatId) {
  const tree = await store.get("video:tree");
  const rows = tree.fields.map((f) => [{ text: f, callback_data: `vfield:${f}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "open:root" }]);
  await tg.sendMessage(chatId, "🎥 <b>ویدیو آموزشی</b>\n\nرشته‌ی خود را انتخاب کنید:", {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showGrades(tg, store, chatId, field) {
  const tree = await store.get("video:tree");
  const rows = tree.grades.map((g) => [{ text: g, callback_data: `vgrade:${field}:${g}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "video:root" }]);
  await tg.sendMessage(chatId, `📗 رشته: <b>${field}</b>\n\nمقطع تحصیلی را انتخاب کنید:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showLessons(tg, store, chatId, field, grade) {
  const tree = await store.get("video:tree");
  const lessons = tree.videos?.[field]?.[grade] || [];

  if (!lessons.length) {
    await tg.sendMessage(
      chatId,
      "⚠️ فعلاً ویدیویی برای این بخش ثبت نشده. به‌زودی اضافه می‌شود.",
      { reply_markup: backButton(`vfield:${field}`) }
    );
    return;
  }

  const rows = lessons.map((lesson, idx) => [
    { text: lesson.title, callback_data: `vlesson:${field}:${grade}:${idx}` },
  ]);
  rows.push([{ text: "🔙 بازگشت", callback_data: `vfield:${field}` }]);

  await tg.sendMessage(chatId, `📘 ${field} - ${grade}\n\nدرس مورد نظر را انتخاب کنید:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function sendLesson(tg, store, chatId, field, grade, idx, videoChannel) {
  const tree = await store.get("video:tree");
  const lesson = tree.videos?.[field]?.[grade]?.[idx];

  if (!lesson) {
    await tg.sendMessage(chatId, "⚠️ این ویدیو یافت نشد.");
    return;
  }

  await tg.sendMessage(chatId, `🎬 در حال ارسال: <b>${lesson.title}</b>`);
  await tg.copyMessage(chatId, `@${videoChannel}`, lesson.messageId);
}
