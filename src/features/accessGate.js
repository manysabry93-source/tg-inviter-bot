// ---------------------------------------------------------------------------
// گیت دسترسی: قبل از استفاده از ربات، کاربر باید در کانال‌های مشخص‌شده عضو
// باشد و (در صورت فعال بودن) شماره تماسش را ارسال کرده باشد. نتیجه‌ی موفق
// در KV کش می‌شود تا هر بار نیاز به تماس مجدد با API نباشد.
//
// توجه: «لایک» یا «ری‌اکشن روی پست» عمداً پیاده‌سازی نشده، چون هیچ پلتفرمی
// راهی در اختیار ربات‌ها نمی‌گذارد که این کارها را واقعاً تایید کند.
//
// برخی پلتفرم‌ها (روبیکا) راهی برای بررسی خودکار عضویت کانال ندارند
// (tg.supportsChatMemberCheck === false)؛ در این حالت کانال‌ها به‌عنوان
// پیشنهاد نمایش داده می‌شوند (نه اجبار قابل‌تایید) و فقط با یک تاییدِ دستی
// کاربر («بررسی مجدد») رد می‌شوند. همچنین برخی پلتفرم‌ها دکمه‌ی بومی
// اشتراک‌گذاری شماره ندارند (tg.supportsContactButton === false)؛ در این
// حالت از کاربر خواسته می‌شود شماره را مستقیم تایپ کند.
// ---------------------------------------------------------------------------

export const DEFAULT_PHONE_MESSAGE =
  "📞 شماره تماس و اطلاعات شما صرفاً برای رتبه‌برتر یا مشاور مختص رشته‌ی خودتان جهت مشاوره‌ی رایگان ارسال می‌گردد.";

const CHANNEL_DOMAINS = {
  telegram: "https://t.me/",
  bale: "https://ble.ir/",
  rubika: "https://rubika.ir/",
};

export function channelJoinUrl(platform, username) {
  const domain = CHANNEL_DOMAINS[platform] || "https://t.me/";
  return domain + username.replace(/^@/, "");
}

export async function getGateConfig(store) {
  return store.get("gate:config", { channels: [], requirePhone: false, phoneMessage: DEFAULT_PHONE_MESSAGE });
}

export async function setGateConfig(store, config) {
  await store.set("gate:config", config);
}

export async function checkGate(tg, store, userId, force = false) {
  const config = await getGateConfig(store);
  const hasChannels = (config.channels || []).length > 0;
  const canVerifyChannels = tg.supportsChatMemberCheck !== false;

  if (!hasChannels && !config.requirePhone) {
    return { passed: true };
  }

  if (!force) {
    const cached = await store.get(`gatepass:${userId}`, false);
    if (cached) return { passed: true };
  }

  const missingChannels = [];
  if (hasChannels && canVerifyChannels) {
    for (const ch of config.channels) {
      try {
        const res = await tg.call("getChatMember", { chat_id: ch.username, user_id: userId });
        const status = res?.result?.status;
        if (!res.ok || !["member", "administrator", "creator"].includes(status)) {
          missingChannels.push(ch);
        }
      } catch {
        missingChannels.push(ch);
      }
    }
  }

  // پلتفرمی که نمی‌تواند عضویت را بررسی کند: کانال‌ها را فقط پیشنهاد می‌دهیم
  let unverifiedChannels = [];
  let needsChannelAck = false;
  if (hasChannels && !canVerifyChannels) {
    unverifiedChannels = config.channels;
    const acked = await store.get(`gateackchannels:${userId}`, false);
    needsChannelAck = !acked;
  }

  const phoneSet = !!(await store.get(`gatephone:${userId}`, null));
  const needPhone = config.requirePhone && !phoneSet;

  if (missingChannels.length === 0 && !needPhone && !needsChannelAck) {
    await store.set(`gatepass:${userId}`, true);
    return { passed: true };
  }

  return { passed: false, missingChannels, unverifiedChannels, needPhone, needsChannelAck, config };
}

export async function acknowledgeChannels(store, userId) {
  await store.set(`gateackchannels:${userId}`, true);
}

export async function showGateScreen(tg, store, chatId, userId, gateResult, platform) {
  const { missingChannels = [], unverifiedChannels = [], needPhone, config } = gateResult;
  let text = "🔒 <b>برای استفاده از ربات، ابتدا این مراحل را کامل کنید:</b>\n";
  const rows = [];

  const allChannels = [...missingChannels, ...unverifiedChannels];
  if (allChannels.length) {
    text += "\n📢 عضویت در کانال(های) زیر لازم است:";
    for (const ch of allChannels) {
      rows.push([{ text: `عضویت در ${ch.title || ch.username}`, url: channelJoinUrl(platform, ch.username) }]);
    }
  }

  if (needPhone) {
    text += "\n📱 ارسال شماره تماس الزامی است.";
  }

  rows.push([{ text: "✅ بررسی مجدد", callback_data: "gatecheck" }]);
  await tg.sendMessage(chatId, text, { reply_markup: { inline_keyboard: rows } });

  if (needPhone) {
    if (tg.supportsContactButton === false) {
      await store.setSession(userId, { type: "awaiting_gate_phone_text" });
      await tg.sendMessage(chatId, `${config.phoneMessage || DEFAULT_PHONE_MESSAGE}\n\nلطفاً شماره تماس خود را همینجا تایپ و ارسال کنید:`);
    } else {
      await tg.sendMessage(chatId, config.phoneMessage || DEFAULT_PHONE_MESSAGE, {
        reply_markup: {
          keyboard: [[{ text: "📱 ارسال شماره تماس", request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
    }
  }
}

async function recordGatePhone(tg, store, userId, phone, adminIds) {
  const user = await store.get(`user:${userId}`, {});
  await store.set(`gatephone:${userId}`, {
    phone,
    username: user.username || null,
    first_name: user.first_name || "",
    ts: Date.now(),
  });

  const label = user.username ? `@${user.username}` : user.first_name || "کاربر";
  const notifyText =
    `📞 <b>شماره تماس جدید (دسترسی اجباری)</b>\n\n` + `👤 ${label}\n📱 ${phone}\n🆔 آیدی عددی: <code>${userId}</code>`;

  for (const adminId of adminIds || []) {
    await tg.sendMessage(adminId, notifyText);
  }
}

export async function handleGateContact(tg, store, chatId, userId, msg, adminIds) {
  const config = await getGateConfig(store);
  if (!config.requirePhone) return false;
  if (!msg.contact) return false;

  await recordGatePhone(tg, store, userId, msg.contact.phone_number, adminIds);
  await tg.sendMessage(chatId, "✅ شماره تماس شما ثبت شد.", { reply_markup: { remove_keyboard: true } });
  return true;
}

export async function handleGatePhoneText(tg, store, chatId, userId, text, adminIds) {
  const session = await store.getSession(userId);
  if (!session || session.type !== "awaiting_gate_phone_text") return false;

  const cleaned = text.trim();
  if (!/^[+0-9][0-9\s-]{6,}$/.test(cleaned)) {
    await tg.sendMessage(chatId, "⚠️ لطفاً فقط شماره تماس (به‌صورت عدد) را بفرستید:");
    return true;
  }

  await store.clearSession(userId);
  await recordGatePhone(tg, store, userId, cleaned, adminIds);
  await tg.sendMessage(chatId, "✅ شماره تماس شما ثبت شد.");
  return true;
}

// ---------------- لیست کاربرانی که شماره‌شان را ثبت کرده‌اند (برای پنل ادمین) ----------------

export async function listSubmittedPhones(store) {
  const keys = await store.list("gatephone:");
  const entries = [];

  for (const key of keys) {
    const userId = key.replace("gatephone:", "");
    const raw = await store.get(key);
    if (!raw) continue;

    // نسخه‌ی قدیمی فقط رشته‌ی شماره را ذخیره می‌کرد، بدون یوزرنیم/نام
    let phone;
    let username;
    let firstName;
    if (typeof raw === "string") {
      phone = raw;
    } else {
      phone = raw.phone;
      username = raw.username;
      firstName = raw.first_name;
    }

    if (!username && !firstName) {
      const userRecord = await store.get(`user:${userId}`, {});
      username = username || userRecord.username;
      firstName = firstName || userRecord.first_name;
    }

    const label = username ? `@${username}` : firstName || "کاربر";
    entries.push({ userId, phone: phone || "—", label });
  }

  return entries;
}
