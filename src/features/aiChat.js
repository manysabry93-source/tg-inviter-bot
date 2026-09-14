import * as db from '../db.js';
export async function startAIChat(bot,DB,chatId,userId,node){
  const ai=await db.getAISettings(DB);
  if(!ai.apiKey||!ai.baseUrl){await bot.sendMessage(chatId,'هوش مصنوعی تنظیم نشده.');return;}
  await db.setSession(DB,userId,{type:'ai_chat',nodeId:node.id,parentId:node.parent_id||'root',history:[]});
  await bot.sendMessage(chatId,'🤖 <b>هوش مصنوعی</b>\n\nسلام! چطور کمک کنم؟',{reply_markup:{inline_keyboard:[[{text:'❌ پایان',callback_data:`ai_end:${node.parent_id||'root'}`}]]}});
}
export async function handleAIChatText(bot,DB,chatId,userId,text){
  const s=await db.getSession(DB,userId);
  if(!s||s.type!=='ai_chat')return false;
  const ai=await db.getAISettings(DB);
  if(!ai.apiKey)return false;
  await bot.call('sendChatAction',{chat_id:chatId,action:'typing'});
  s.history.push({role:'user',content:text});
  try{
    const res=await fetch(`${ai.baseUrl}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${ai.apiKey}`},body:JSON.stringify({model:ai.model||'gpt-3.5-turbo',messages:[{role:'system',content:ai.systemPrompt||'دستیار هوشمند فارسی‌زبان'},...s.history],max_tokens:1000})});
    const data=await res.json();
    const reply=data.choices?.[0]?.message?.content||'پاسخی دریافت نشد.';
    s.history.push({role:'assistant',content:reply});
    if(s.history.length>10)s.history=s.history.slice(-10);
    await db.setSession(DB,userId,s);
    await bot.sendMessage(chatId,reply,{reply_markup:{inline_keyboard:[[{text:'❌ پایان',callback_data:`ai_end:${s.parentId}`}]]}});
  }catch{await bot.sendMessage(chatId,'خطا در ارتباط با هوش مصنوعی.');}
  return true;
}
