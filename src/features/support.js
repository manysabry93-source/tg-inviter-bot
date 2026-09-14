import * as db from '../db.js';
export async function startSupport(bot,DB,chatId,userId){
  await db.setSession(DB,userId,{type:'support'});
  await bot.sendMessage(chatId,'💬 <b>پشتیبانی زنده</b>\n\nپیام خود را بنویسید:',{reply_markup:{inline_keyboard:[[{text:'❌ پایان',callback_data:'support_end'}]]}});
}
export async function handleUserMessage(bot,DB,chatId,userId,text){
  const s=await db.getSession(DB,userId);
  if(!s||s.type!=='support')return false;
  const admins=await db.getAllAdmins(DB);
  for(const a of admins){
    try{const sent=await bot.sendMessage(a.user_id,`💬 <b>پشتیبانی</b>\n👤 <code>${userId}</code>\n\n${text}\n\n<i>Reply کنید برای پاسخ.</i>`);await db.saveSupportMsg(DB,userId,a.user_id,sent.result?.message_id,text);}catch{}
  }
  await bot.sendMessage(chatId,'✅ پیام ارسال شد.');
  return true;
}
export async function handleAdminReply(bot,DB,chatId,replyToMsgId,text){
  const msg=await db.getSupportMsg(DB,replyToMsgId);
  if(!msg)return false;
  try{await bot.sendMessage(msg.user_id,`💬 <b>پاسخ پشتیبانی:</b>\n\n${text}`);await bot.sendMessage(chatId,'✅ پاسخ ارسال شد.');}
  catch{await bot.sendMessage(chatId,'❌ ارسال ناموفق.');}
  return true;
}
