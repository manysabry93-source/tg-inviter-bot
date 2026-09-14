import * as db from '../db.js';
export async function startAnonQA(bot,DB,chatId,userId){
  await db.setSession(DB,userId,{type:'anon_qa'});
  await bot.sendMessage(chatId,'❓ سوال خود را بنویسید (ناشناس ارسال میشود):',{reply_markup:{inline_keyboard:[[{text:'❌ انصراف',callback_data:'menu:root'}]]}});
}
export async function handleAnonInput(bot,DB,chatId,userId,text){
  const s=await db.getSession(DB,userId);
  if(!s||s.type!=='anon_qa')return false;
  await db.clearSession(DB,userId);
  const admins=await db.getAllAdmins(DB);
  for(const a of admins){
    try{const sent=await bot.sendMessage(a.user_id,`❓ <b>سوال ناشناس</b>\n\n${text}\n\n<i>Reply کنید تا پاسخ دهید.</i>`);await db.saveAnonQuestion(DB,userId,sent.result?.message_id,text);}catch{}
  }
  await bot.sendMessage(chatId,'✅ سوال ارسال شد!',{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}});
  return true;
}
export async function handleAdminReply(bot,DB,chatId,replyToMsgId,text){
  const q=await db.getAnonQuestion(DB,replyToMsgId);
  if(!q)return false;
  try{await bot.sendMessage(q.user_id,`💬 <b>پاسخ به سوال شما:</b>\n\n${text}`);await bot.sendMessage(chatId,'✅ پاسخ ارسال شد.');}
  catch{await bot.sendMessage(chatId,'❌ ارسال ناموفق.');}
  return true;
}
