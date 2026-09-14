import * as db from '../db.js';
export async function showSchedulerAdmin(bot, DB, chatId) {
  const msgs = await db.getScheduledMessages(DB);
  const pending = msgs.filter(m=>!m.sent);
  const rows = [[{text:'➕ پیام جدید', callback_data:'sadm:create'}]];
  for (const m of pending) rows.push([{text:`📅 ${m.send_at} — ${m.text.slice(0,25)}`, callback_data:`sadm:detail:${m.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,`📅 <b>زمان‌بندی</b>\n${pending.length} در صف`,{reply_markup:{inline_keyboard:rows}});
}
