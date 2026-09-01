// ─── Access Gate ──────────────────────────────────────────────────────────────
import * as db from '../db.js';

export async function checkGate(bot, DB, userId) {
  const channels = await db.getGateChannels(DB);
  if (!channels.length) return {passed:true};

  const missing = [];
  for (const ch of channels) {
    try {
      const res = await bot.getChatMember(ch.channel_id, userId);
      const status = res?.result?.status;
      if (!['member','administrator','creator'].includes(status)) {
        missing.push(ch);
      }
    } catch { missing.push(ch); }
  }
  return {passed: missing.length===0, missing};
}

export async function showGateScreen(bot, DB, chatId, userId) {
  const channels = await db.getGateChannels(DB);
  const missing = [];
  for (const ch of channels) {
    try {
      const res = await bot.getChatMember(ch.channel_id, userId);
      const status = res?.result?.status;
      if (!['member','administrator','creator'].includes(status)) missing.push(ch);
    } catch { missing.push(ch); }
  }

  if (!missing.length) return true;

  const rows = missing.map(ch => ([{
    text: `📢 ${ch.channel_title||ch.channel_id}`,
    url: ch.invite_link || `https://t.me/${ch.channel_id.replace('@','')}`
  }]));
  rows.push([{text:'✅ عضو شدم، بررسی کن', callback_data:'gate_check'}]);

  await bot.sendMessage(chatId,
    '⛔ برای استفاده از ربات ابتدا در کانال‌های زیر عضو شوید:',
    {reply_markup:{inline_keyboard:rows}}
  );
  return false;
}
