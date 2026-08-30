// ---------------------------------------------------------------------------
// درخواست شماره تماس (دکمه‌ی مستقل «📱 درخواست شماره تماس»، جدا از گیت
// دسترسی). روی پلتفرم‌هایی که دکمه‌ی بومی اشتراک‌گذاری مخاطب ندارند
// (tg.supportsContactButton === false)، از کاربر خواسته می‌شود شماره را
// مستقیم تایپ کند.
// ---------------------------------------------------------------------------

export async function requestContact(tg, store, chatId, userId, nodeId) {
  if (tg.supportsContactButton === false) {
    await store.setSession(userId, { type: "awaiting_contact_text", nodeId });
    await tg.sendMessage(chatId, "📱 لطفاً شماره تماس خود را همینجا تایپ و ارسال کنید:");
    return;
  }

  await store.setSession(userId, { type: "awaiting_contact", nodeId });
  await tg.sendMessage(chatId, "📱 برای ارسال شماره تماس خود، دکمه‌ی زیر را بزنید:", {
    reply_markup: {
      keyboard: [
        [{ text: "📱 ارسال شماره تماس", request_contact: true }],
        [{ text: "🔙 انصراف" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
}

export async function handleContactMessage(tg, store, chatId, userId, msg, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "awaiting_contact" || !msg.contact) return false;

  await store.clearSession(userId);
  const user = await store.get(`user:${userId}`, {});

  const adminText =
    `📞 <b>شماره تماس جدید</b>\n\n` +
    `👤 ${user.first_name || ""} ${user.username ? "(@" + user.username + ")" : ""}\n` +
    `📱 ${msg.contact.phone_number}\n` +
    `🆔 آیدی عددی: <code>${userId}</code>`;

  for (const adminId of adminIds) {
    await tg.sendMessage(adminId, adminText);
  }

  await tg.sendMessage(chatId, "✅ شماره تماس شما ارسال شد.", {
    reply_markup: { remove_keyboard: true },
  });
  return true;
}

export async function handleContactText(tg, store, chatId, userId, text, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "awaiting_contact_text") return false;

  const cleaned = text.trim();
  if (!/^[+0-9][0-9\s-]{6,}$/.test(cleaned)) {
    await tg.sendMessage(chatId, "⚠️ لطفاً فقط شماره تماس (به‌صورت عدد) را بفرستید:");
    return true;
  }

  await store.clearSession(userId);
  const user = await store.get(`user:${userId}`, {});

  const adminText =
    `📞 <b>شماره تماس جدید</b>\n\n` +
    `👤 ${user.first_name || ""} ${user.username ? "(@" + user.username + ")" : ""}\n` +
    `📱 ${cleaned}\n` +
    `🆔 آیدی عددی: <code>${userId}</code>`;

  for (const adminId of adminIds) {
    await tg.sendMessage(adminId, adminText);
  }

  await tg.sendMessage(chatId, "✅ شماره تماس شما ارسال شد.");
  return true;
}

export async function handleCancelContact(tg, store, chatId, userId, text) {
  if (text !== "🔙 انصراف") return false;
  const session = await store.getSession(userId);
  if (!session || session.type !== "awaiting_contact") return false;

  await store.clearSession(userId);
  await tg.sendMessage(chatId, "باشه، لغو شد.", { reply_markup: { remove_keyboard: true } });
  return true;
}
