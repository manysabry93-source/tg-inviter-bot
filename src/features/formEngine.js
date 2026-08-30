// ---------------------------------------------------------------------------
// موتور عمومی فرم‌های چندمرحله‌ای. تعریف فرم (formDef = {title, steps})
// همراه با خود سشن ذخیره می‌شود، پس هم فرم‌های قدیمی (مشاوره/رضایت‌نامه)
// و هم هر فرم دلخواهی که ادمین از پنل بسازد یکسان کار می‌کنند.
// ---------------------------------------------------------------------------

import { backButton } from "../keyboards.js";

export async function startForm(tg, store, chatId, userId, formDef, backTarget) {
  if (!formDef || !formDef.steps || !formDef.steps.length) {
    await tg.sendMessage(chatId, "⚠️ این فرم در حال حاضر در دسترس نیست.");
    return;
  }
  await store.setSession(userId, { type: "form", form: formDef, stepIndex: 0, answers: {} });
  await tg.sendMessage(chatId, `<b>${formDef.title}</b>\n\n${formDef.steps[0].question}`, {
    reply_markup: backButton(backTarget),
  });
}

export async function handleFormInput(tg, store, chatId, userId, text, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "form") return false;

  const form = session.form;
  const currentStep = form.steps[session.stepIndex];
  session.answers[currentStep.key] = text;
  const nextIndex = session.stepIndex + 1;

  if (nextIndex < form.steps.length) {
    session.stepIndex = nextIndex;
    await store.setSession(userId, session);
    await tg.sendMessage(chatId, form.steps[nextIndex].question, { reply_markup: backButton() });
    return true;
  }

  await store.clearSession(userId);
  const user = await store.get(`user:${userId}`, {});
  const summaryLines = form.steps.map(
    (s) => `▫️ <b>${s.question.replace(/[:؟]$/, "")}:</b> ${session.answers[s.key]}`
  );

  const adminText =
    `📥 <b>${form.title} - جدید</b>\n\n` +
    summaryLines.join("\n") +
    `\n\n👤 کاربر: ${user.first_name || ""} ${user.username ? "(@" + user.username + ")" : ""}\n` +
    `🆔 آیدی عددی: <code>${userId}</code>`;

  for (const adminId of adminIds) {
    await tg.sendMessage(adminId, adminText);
  }

  await tg.sendMessage(chatId, "✅ اطلاعات شما با موفقیت برای مشاورین ارسال شد. به‌زودی با شما تماس گرفته می‌شود.");
  return true;
}
