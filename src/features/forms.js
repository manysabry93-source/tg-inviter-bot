import * as db from '../db.js';
export async function startForm(bot,DB,chatId,userId,formId,backNodeId='root'){
  const form=await db.getForm(DB,formId);
  if(!form||!form.steps.length){await bot.sendMessage(chatId,'فرم تنظیم نشده.');return;}
  await db.setSession(DB,userId,{type:'form',formId,backNodeId,step:0,answers:{}});
  await bot.sendMessage(chatId,`📝 <b>${form.title}</b>\n\n${form.steps[0].question}`,{reply_markup:{inline_keyboard:[[{text:'❌ انصراف',callback_data:`menu:${backNodeId}`}]]}});
}
export async function handleFormInput(bot,DB,chatId,userId,text){
  const session=await db.getSession(DB,userId);
  if(!session||session.type!=='form')return false;
  const form=await db.getForm(DB,session.formId);
  if(!form){await db.clearSession(DB,userId);return false;}
  const step=form.steps[session.step];
  session.answers[step.key]=text;
  session.step++;
  if(session.step<form.steps.length){
    await db.setSession(DB,userId,session);
    await bot.sendMessage(chatId,form.steps[session.step].question,{reply_markup:{inline_keyboard:[[{text:'❌ انصراف',callback_data:`menu:${session.backNodeId}`}]]}});
    return true;
  }
  await db.clearSession(DB,userId);
  await db.saveFormResponse(DB,session.formId,userId,null,null,session.answers);
  const admins=await db.getAllAdmins(DB);
  let summary=`📝 <b>پاسخ فرم: ${form.title}</b>\n👤 <code>${userId}</code>\n━━━━━━━━━━\n`;
  for(const[k,v]of Object.entries(session.answers)){const s=form.steps.find(s=>s.key===k);summary+=`\n<b>${s?.question||k}:</b>\n${v}`;}
  for(const a of admins){try{await bot.sendMessage(a.user_id,summary);}catch{}}
  await bot.sendMessage(chatId,'✅ فرم ارسال شد!',{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}});
  return true;
}
