import * as db from '../db.js';
export async function showTagsAdmin(bot, DB, chatId) {
  const tags = await db.getAllTags(DB);
  const rows = tags.map(t=>[{text:`🏷 ${t}`, callback_data:`tadm:tag:${t}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,`🏷 <b>تگ‌ها</b>\n${tags.length} تگ`,{reply_markup:{inline_keyboard:rows}});
}
export async function showTagDetail(bot, DB, chatId, tag) {
  const users = await db.getUsersByTag(DB, tag);
  await bot.sendMessage(chatId,`🏷 <b>${tag}</b>\n👥 ${users.length} کاربر`,{reply_markup:{inline_keyboard:[
    [{text:'📢 ارسال به این تگ', callback_data:`tadm:send:${tag}`}],
    [{text:'🔙 بازگشت', callback_data:'tadm:home'}],
  ]}});
}
