import * as db from '../db.js';
export async function showPoll(bot,DB,chatId,userId,pollId){
  const p=await db.getPoll(DB,pollId);
  if(!p)return;
  if(await db.hasVoted(DB,userId,pollId)){await showResults(bot,DB,chatId,pollId);return;}
  const opts=JSON.parse(p.options||'[]');
  const rows=opts.map((o,i)=>[{text:o,callback_data:`poll_vote:${pollId}:${i}`}]);
  rows.push([{text:'🔙 بازگشت',callback_data:'menu:root'}]);
  await bot.sendMessage(chatId,`📊 <b>نظرسنجی</b>\n\n${p.question}`,{reply_markup:{inline_keyboard:rows}});
}
export async function handleVote(bot,DB,chatId,userId,pollId,optIdx){
  if(await db.hasVoted(DB,userId,pollId)){await bot.sendMessage(chatId,'شما قبلاً رأی داده‌اید.');return;}
  await db.saveVote(DB,userId,pollId,optIdx);
  await bot.sendMessage(chatId,'✅ رأی ثبت شد!');
  await showResults(bot,DB,chatId,pollId);
}
export async function showResults(bot,DB,chatId,pollId){
  const p=await db.getPoll(DB,pollId);
  if(!p)return;
  const opts=JSON.parse(p.options||'[]');
  const results=await db.getPollResults(DB,pollId);
  const total=results.reduce((s,r)=>s+r.count,0);
  let text=`📊 <b>${p.question}</b>\n\n`;
  opts.forEach((o,i)=>{const r=results.find(r=>r.option_index===i);const c=r?r.count:0;const pct=total?Math.round(c/total*100):0;const bar='█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));text+=`${o}\n${bar} ${pct}% (${c})\n\n`;});
  text+=`👥 کل: ${total}`;
  await bot.sendMessage(chatId,text,{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}});
}
