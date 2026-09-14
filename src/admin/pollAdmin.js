import * as db from '../db.js';
export async function showPollAdmin(bot, DB, chatId) {
  const polls = await db.getActivePolls(DB);
  const rows = [[{text:'➕ نظرسنجی جدید', callback_data:'padm:create'}]];
  for (const p of polls) rows.push([{text:`📊 ${p.question.slice(0,30)}`, callback_data:`padm:detail:${p.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,`📊 <b>نظرسنجی</b>\n${polls.length} فعال`,{reply_markup:{inline_keyboard:rows}});
}
export async function showPollDetail(bot, DB, chatId, pollId) {
  const p = await db.getPoll(DB, pollId);
  if (!p) return;
  const results = await db.getPollResults(DB, pollId);
  const total = results.reduce((s,r)=>s+r.count,0);
  const opts = JSON.parse(p.options||'[]');
  let text = `📊 <b>${p.question}</b>\n\n👥 کل: ${total}\n\n`;
  opts.forEach((o,i)=>{const r=results.find(r=>r.option_index===i);text+=`${i+1}. ${o}: ${r?.count||0}\n`;});
  await bot.sendMessage(chatId,text,{reply_markup:{inline_keyboard:[
    [{text:'🔴 غیرفعال', callback_data:`padm:deactivate:${pollId}`}],
    [{text:'🔙 بازگشت', callback_data:'padm:home'}],
  ]}});
}
