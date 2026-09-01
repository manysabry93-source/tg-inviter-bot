// ─── Member Attract ───────────────────────────────────────────────────────────
import * as db from '../db.js';

export async function handleJoinRequest(jr, bot, DB) {
  const userId = jr.from.id;
  const channelId = String(jr.chat.id);
  const firstName = jr.from.first_name || 'کاربر';

  await bot.approveChatJoinRequest(jr.chat.id, userId);
  await db.logJoinRequest(DB, userId, jr.from.username, firstName, channelId);
  await db.markJoinApproved(DB, userId, channelId);

  const active = await db.getSetting(DB, 'join_request_active');
  if (active === '1') {
    const adText = await db.getSetting(DB, 'ad_message');
    if (adText) {
      try { await bot.sendMessage(userId, adText); } catch {}
    }
  }
}

export async function handleGroupMessage(msg, bot, DB) {
  const active = await db.getSetting(DB, 'ad_listener_active');
  if (active !== '1') return;

  const user = msg.from;
  if (!user || user.is_bot) return;

  const groupId = String(msg.chat.id);
  const userId = user.id;

  const isTarget = await db.isAdGroup(DB, groupId);
  if (!isTarget) return;

  try {
    const res = await bot.getChatMember(groupId, userId);
    const status = res?.result?.status;
    if (status === 'administrator' || status === 'creator') return;
  } catch {}

  const sent = await db.wasAdSentRecently(DB, userId, 120);
  if (sent) return;

  const adText = await db.getSetting(DB, 'ad_message');
  if (!adText) return;

  const deleteAfter = parseInt(await db.getSetting(DB, 'ad_delete_after')||'30') * 1000;
  const buttonType = await db.getSetting(DB, 'ad_button_type') || 'button';
  const targetBot = await db.getSetting(DB, 'ad_target_bot') || '';
  const firstName = user.first_name || 'دوست عزیز';

  try {
    let replyRes;
    if (buttonType === 'button' && targetBot) {
      replyRes = await bot.call('sendMessage', {
        chat_id: groupId,
        text: `👋 ${firstName}، یه پیام ویژه برات دارم!\nبرای دریافت کلیک کن 👇`,
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML',
        reply_markup: {inline_keyboard:[[{text:'📩 دریافت پیام ویژه', url:`https://t.me/${targetBot}?start=hi`}]]}
      });
    } else if (targetBot) {
      replyRes = await bot.call('sendMessage', {
        chat_id: groupId,
        text: `👋 ${firstName}، یه پیام ویژه برات دارم!\n\n👉 @${targetBot}`,
        reply_to_message_id: msg.message_id,
        parse_mode: 'HTML',
      });
    }

    await db.logAdSent(DB, userId, groupId);

    const replyMsgId = replyRes?.result?.message_id;
    if (replyMsgId) {
      setTimeout(async()=>{
        try { await bot.deleteMessage(groupId, replyMsgId); } catch {}
      }, deleteAfter);
    }
  } catch {}

  try { await bot.sendMessage(userId, adText); } catch {}
}
