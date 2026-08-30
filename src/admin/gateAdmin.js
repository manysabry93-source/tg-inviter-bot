// ---------------------------------------------------------------------------
// مدیریت گیت دسترسی از پنل ادمین: افزودن/حذف کانال‌های اجباری (با یوزرنیم یا
// لینک کامل)، فعال/غیرفعال کردن الزام شماره تماس، ویرایش متن درخواست شماره،
// و مشاهده‌ی لیست کاربرانی که شماره‌شان را ثبت کرده‌اند.
// ---------------------------------------------------------------------------

import { getGateConfig, setGateConfig, DEFAULT_PHONE_MESSAGE, listSubmittedPhones } from "../features/accessGate.js";

export async function showGateAdmin(tg, store, chatId) {
  const config = await getGateConfig(store);

  const rows = (config.channels || []).map((ch, i) => [
    { text: `🗑 ${ch.title || ch.username}`, callback_data: `gatedelchannel:${i}` },
  ]);
  rows.push([{ text: "➕ افزودن کانال جدید", callback_data: "gataddchannel" }]);
  rows.push([
    {
      text: `📱 الزام ارسال شماره تماس: ${config.requirePhone ? "✅ فعال" : "❌ غیرفعال"}`,
      callback_data: "gatetogglephone",
    },
  ]);
  if (config.requirePhone) {
    rows.push([{ text: "✏️ ویرایش متن درخواست شماره", callback_data: "gateeditphonemsg" }]);
    rows.push([{ text: "📋 لیست شماره‌های ثبت‌شده", callback_data: "gatephonelist" }]);
  }
  rows.push([{ text: "🔙 بازگشت", callback_data: "admin:home" }]);

  const channelNote =
    tg.supportsChatMemberCheck === false
      ? "\n\n⚠️ توجه: این پلتفرم راهی برای بررسی خودکار عضویت کانال در اختیار ربات‌ها نمی‌گذارد؛ کانال‌ها به کاربر به‌عنوان پیشنهاد نمایش داده می‌شوند و با یک تایید دستی («بررسی مجدد») رد می‌شوند، نه با بررسی واقعی عضویت."
      : "";

  await tg.sendMessage(
    chatId,
    "🔒 <b>دسترسی اجباری به ربات</b>\n\n" +
      "کاربر تا وقتی این شرط‌ها را کامل نکند، نمی‌تواند از ربات استفاده کند.\n\n" +
      "❕ توجه: «لایک» یا «ری‌اکشن روی پست» توسط این پلتفرم‌ها برای ربات‌ها قابل تایید نیست، به همین دلیل فقط عضویت در کانال و شماره تماس پیاده‌سازی شده‌اند." +
      channelNote +
      "\n\nکانال‌های اجباری فعلی:",
    { reply_markup: { inline_keyboard: rows } }
  );
}

export async function startAddChannel(tg, store, chatId) {
  await store.setSession(chatId, { type: "admin_gate_add_channel" });
  await tg.sendMessage(
    chatId,
    "📡 نام کاربری کانال یا لینک کامل آن را بفرستید (مثلاً fara_video یا https://t.me/fara_video).\n⚠️ حتماً ربات باید عضو یا ادمین آن کانال باشد تا بتواند عضویت کاربران را بررسی کند (این فقط روی تلگرام/بله ممکن است)."
  );
}

// یوزرنیم را چه با @ بدهند، چه به‌صورت لینک کامل (t.me/ble.ir/rubika.ir/telegram.me)، استخراج می‌کند
function parseChannelInput(text) {
  let v = text.trim();
  v = v.replace(/^https?:\/\/(t\.me|telegram\.me|ble\.ir|rubika\.ir)\//i, "");
  v = v.replace(/^@/, "");
  v = v.split(/[/?#]/)[0];
  return v;
}

export async function handleAddChannelText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_gate_add_channel") return false;

  const parsed = parseChannelInput(text);
  if (!parsed) {
    await tg.sendMessage(chatId, "⚠️ نام کاربری یا لینک معتبر شناسایی نشد. دوباره بفرستید:");
    return true;
  }

  const username = "@" + parsed;
  const config = await getGateConfig(store);
  config.channels = config.channels || [];
  config.channels.push({ username, title: username });
  await setGateConfig(store, config);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, `✅ کانال ${username} اضافه شد.`);
  await showGateAdmin(tg, store, chatId);
  return true;
}

export async function deleteChannel(tg, store, chatId, idx) {
  const config = await getGateConfig(store);
  if (config.channels?.[idx]) {
    config.channels.splice(idx, 1);
    await setGateConfig(store, config);
  }
  await showGateAdmin(tg, store, chatId);
}

export async function toggleRequirePhone(tg, store, chatId) {
  const config = await getGateConfig(store);
  config.requirePhone = !config.requirePhone;
  if (config.requirePhone && !config.phoneMessage) config.phoneMessage = DEFAULT_PHONE_MESSAGE;
  await setGateConfig(store, config);
  await showGateAdmin(tg, store, chatId);
}

export async function startEditPhoneMessage(tg, store, chatId) {
  await store.setSession(chatId, { type: "admin_gate_phone_msg" });
  await tg.sendMessage(chatId, "متن جدیدی که هنگام درخواست شماره تماس نمایش داده شود را بفرستید:");
}

export async function handleEditPhoneMessageText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_gate_phone_msg") return false;

  const config = await getGateConfig(store);
  config.phoneMessage = text;
  await setGateConfig(store, config);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, "✅ متن ذخیره شد.");
  await showGateAdmin(tg, store, chatId);
  return true;
}

export async function showPhoneList(tg, store, chatId) {
  const entries = await listSubmittedPhones(store);

  if (!entries.length) {
    await tg.sendMessage(chatId, "📋 هنوز هیچ‌کس شماره‌اش را ثبت نکرده است.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin:gate" }]] },
    });
    return;
  }

  await tg.sendMessage(chatId, `📋 <b>لیست شماره‌های ثبت‌شده</b> (${entries.length} نفر):`);

  const chunkSize = 30;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries
      .slice(i, i + chunkSize)
      .map((e) => `${e.label} — <code>${e.phone}</code> — 🆔 <code>${e.userId}</code>`)
      .join("\n");
    await tg.sendMessage(chatId, chunk);
  }

  await tg.sendMessage(chatId, "پایان لیست.", {
    reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin:gate" }]] },
  });
}
