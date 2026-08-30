// ---------------------------------------------------------------------------
// سیستم جذب ممبر: Join Request + تبلیغ در گروه
// ---------------------------------------------------------------------------

// ─── Join Request ─────────────────────────────────────────────────────────────

export async function handleJoinRequest(jr, tg, store) {
  const active = await store.getShared('attract:join_active', '0');
  const userId = jr.from.id;
  const channelId = String(jr.chat.id);
  const firstName = jr.from.first_name || 'کاربر';

  // فوری تأیید کن
  await tg.call('approveChatJoinRequest', { chat_id: jr.chat.id, user_id: userId });

  // لاگ کن
  await store.set(`join:${userId}:${channelId}`, { userId, channelId, firstName, ts: Date.now() });

  // اگه سیستم فعاله پیام تبلیغ بفرست
  if (active === '1') {
    const adText = await store.getShared('attract:ad_message', null);
    if (adText) {
      try {
        await tg.sendMessage(userId, adText);
      } catch {
        // کاربر ربات رو استارت نزده
      }
    }
  }
}

// ─── Group Ad ─────────────────────────────────────────────────────────────────

export async function handleGroupMessage(msg, tg, store) {
  const active = await store.getShared('attract:ad_active', '0');
  if (active !== '1') return;

  const user = msg.from;
  if (!user || user.is_bot) return;

  const groupId = String(msg.chat.id);
  const userId = user.id;

  // چک گروه‌های ثبت‌شده
  const groups = await store.getShared('attract:groups', []);
  if (!groups.find(g => g.id === groupId)) return;

  // چک ادمین گروه
  try {
    const res = await tg.call('getChatMember', { chat_id: groupId, user_id: userId });
    const status = res?.result?.status;
    if (status === 'administrator' || status === 'creator') return;
  } catch {}

  // چک cooldown 5 روزه
  const lastSent = await store.get(`ad_sent:${userId}:${groupId}`, null);
  if (lastSent) {
    const diff = Date.now() - lastSent;
    if (diff < 5 * 24 * 60 * 60 * 1000) return;
  }

  // گرفتن تنظیمات
  const adText = await store.getShared('attract:ad_message', null);
  if (!adText) return;

  const buttonType = await store.getShared('attract:button_type', 'button');
  const targetBot = await store.getShared('attract:target_bot', '');
  const deleteAfter = parseInt(await store.getShared('attract:delete_after', '30')) * 1000;
  const firstName = user.first_name || 'دوست عزیز';
  const botUsername = targetBot || '';

  try {
    let replyRes;
    if (buttonType === 'button' && botUsername) {
      replyRes = await tg.call('sendMessage', {
        chat_id: groupId,
        text: `👋 ${firstName}، یه پیام ویژه برات دارم!\nبرای دریافت کلیک کن 👇`,
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '📩 دریافت پیام ویژه', url: `https://t.me/${botUsername}?start=hi` }
          ]]
        }
      });
    } else if (botUsername) {
      replyRes = await tg.call('sendMessage', {
        chat_id: groupId,
        text: `👋 ${firstName}، یه پیام ویژه برات دارم!\n\n👉 @${botUsername}`,
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML',
      });
    }

    // ثبت ارسال
    await store.set(`ad_sent:${userId}:${groupId}`, Date.now());
    await store.saveUser(user);

    // حذف پیام بعد از زمان مشخص
    const replyMsgId = replyRes?.result?.message_id;
    if (replyMsgId) {
      setTimeout(async () => {
        try { await tg.deleteMessage(groupId, replyMsgId); } catch {}
      }, deleteAfter);
    }
  } catch {}

  // ارسال پیام خصوصی اگه استارت زده
  try { await tg.sendMessage(userId, adText); } catch {}
}

// ─── آمار ─────────────────────────────────────────────────────────────────────

export async function getAttractStats(store) {
  const adKeys = await store.list('ad_sent:');
  const joinKeys = await store.list('join:');
  return {
    adSent: adKeys.length,
    joinApproved: joinKeys.length,
  };
}
