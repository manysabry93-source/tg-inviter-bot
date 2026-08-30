// ---------------------------------------------------------------------------
// کنترل دسترسی به هر دکمه (به‌صورت جداگانه):
//   everyone -> بدون محدودیت (پیش‌فرض)
//   list     -> فقط کاربرانی که ادمین آیدی‌شان را در لیست اضافه کرده
//   approval -> هر کسی می‌تواند درخواست بدهد؛ باید فرم را پر کند، درخواست
//               برای یک چت مشخص (پیش‌فرض: ادمین‌ها) می‌رود، با تایید ادمین
//               آن کاربر برای همیشه به لیست مجاز آن دکمه اضافه می‌شود.
//
// چون دکمه (node) بین پلتفرم‌ها مشترک است ولی آیدی کاربر و چت مقصد در هر
// پلتفرم چیز کاملاً متفاوتی است، لیست کاربران مجاز و چت مقصد تایید داخل
// node اما به‌صورت جدا برای هر پلتفرم نگه داشته می‌شوند
// (allowedUsersByPlatform / approvalChatIdByPlatform). فرم درخواست
// (approvalForm) و خودِ حالت (access) بین پلتفرم‌ها مشترک است.
// ---------------------------------------------------------------------------

import { getNodes, setNodes } from "../menuNodes.js";

export const DEFAULT_APPROVAL_FORM = {
  title: "🔐 درخواست دسترسی",
  steps: [
    { key: "full_name", question: "نام و نام خانوادگی خود را وارد کنید:" },
    { key: "field", question: "رشته‌ی تحصیلی شما چیست؟" },
    { key: "grade", question: "مقطع تحصیلی خود را وارد کنید:" },
    { key: "phone", question: "شماره تماس خود را وارد کنید:" },
  ],
};

export function hasAccess(node, userId, platform) {
  if (!node.access || node.access === "everyone") return true;
  const allowedUsers = node.allowedUsersByPlatform?.[platform] || [];
  return allowedUsers.map(String).includes(String(userId));
}

export async function startAccessRequest(tg, store, chatId, userId, node) {
  const pending = await store.get(`pendingaccess:${node.id}:${userId}`, null);
  if (pending) {
    await tg.sendMessage(chatId, "⏳ درخواست شما قبلاً ارسال شده و در انتظار تایید ادمین است.");
    return;
  }

  const form = node.approvalForm || DEFAULT_APPROVAL_FORM;
  await store.setSession(userId, {
    type: "access_request_form",
    nodeId: node.id,
    form,
    stepIndex: 0,
    answers: {},
  });

  await tg.sendMessage(
    chatId,
    `🔐 برای دسترسی به «<b>${node.title}</b>» لطفاً فرم زیر را تکمیل و ارسال کنید تا برای شما فعال گردد.\n\n${form.steps[0].question}`
  );
}

export async function handleAccessRequestInput(tg, store, chatId, userId, text, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "access_request_form") return false;

  const form = session.form;
  const currentStep = form.steps[session.stepIndex];
  session.answers[currentStep.key] = text;
  const nextIndex = session.stepIndex + 1;

  if (nextIndex < form.steps.length) {
    session.stepIndex = nextIndex;
    await store.setSession(userId, session);
    await tg.sendMessage(chatId, form.steps[nextIndex].question);
    return true;
  }

  await store.clearSession(userId);

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  if (!node) return true;

  await store.set(`pendingaccess:${node.id}:${userId}`, { answers: session.answers, ts: Date.now() });

  const user = await store.get(`user:${userId}`, {});
  const summaryLines = form.steps.map(
    (s) => `▫️ <b>${s.question.replace(/[:؟]$/, "")}:</b> ${session.answers[s.key]}`
  );

  const requestText =
    `🔐 <b>درخواست دسترسی به: ${node.title}</b>\n\n` +
    summaryLines.join("\n") +
    `\n\n👤 کاربر: ${user.first_name || ""} ${user.username ? "(@" + user.username + ")" : ""}\n` +
    `🆔 آیدی عددی: <code>${userId}</code>`;

  const targetChat = node.approvalChatIdByPlatform?.[store.platform] || adminIds[0];
  await tg.sendMessage(targetChat, requestText, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ تایید", callback_data: `accapprove:${node.id}:${userId}` },
          { text: "❌ رد", callback_data: `accreject:${node.id}:${userId}` },
        ],
      ],
    },
  });

  await tg.sendMessage(chatId, "✅ درخواست شما ارسال شد. پس از تایید ادمین، دسترسی برایتان فعال می‌شود.");
  return true;
}

export async function approveAccess(tg, store, chatId, nodeId, userId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  node.allowedUsersByPlatform = node.allowedUsersByPlatform || {};
  node.allowedUsersByPlatform[store.platform] = node.allowedUsersByPlatform[store.platform] || [];
  if (!node.allowedUsersByPlatform[store.platform].map(String).includes(String(userId))) {
    node.allowedUsersByPlatform[store.platform].push(String(userId));
  }
  await setNodes(store, nodes);
  await store.delete(`pendingaccess:${nodeId}:${userId}`);

  await tg.sendMessage(chatId, `✅ کاربر تایید شد و دسترسی «${node.title}» برایش فعال گردید.`);
  await tg.sendMessage(userId, `✅ درخواست شما برای «${node.title}» تایید شد. حالا می‌توانید از آن استفاده کنید.`);
}

export async function rejectAccess(tg, store, chatId, nodeId, userId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];

  await store.delete(`pendingaccess:${nodeId}:${userId}`);
  await tg.sendMessage(chatId, `❌ درخواست کاربر رد شد.`);
  await tg.sendMessage(userId, `❌ متاسفانه درخواست شما برای «${node?.title || "این بخش"}» تایید نشد.`);
}
