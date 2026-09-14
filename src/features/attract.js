import * as db from '../db.js';
export async function handleJoinRequest(jr,bot,DB){
  const userId=jr.from.id;
  const channelId=String(jr.chat.id);
  await bot.approveChatJoinRequest(jr.chat.id,userId);
  await db.logJoinRequest(DB,userId,jr.from.username,jr.from.first_name,channelId);
  await db.markJoinApproved(DB,userId,channelId);
  const active=await db.getSetting(DB,'join_request_active');
  if(active==='1'){const msg=await db.getSetting(DB,'ad_message');if(msg)try{await bot.sendMessage(userId,msg);}catch{}}
}
export async function handleGroupMessage(msg,bot,DB){
  const active=await db.getSetting(DB,'ad_listener_active');
  if(active!=='1')return;
  const user=msg.from;
  if(!user||user.is_bot)return;
  const groupId=String(msg.chat.id);
  const userId=user.id;
  if(!await db.isAdGroup(DB,groupId))return;
  try{const r=await bot.getChatMember(groupId,userId);const s=r?.result?.status;if(s==='administrator'||s==='creator')return;}catch{}
  if(await db.wasAdSentRecently(DB,userId,120))return;
  const adText=await db.getSetting(DB,'ad_message');
  if(!adText)return;
  const delAfter=parseInt(await db.getSetting(DB,'ad_delete_after')||'30')*1000;
  const btnType=await db.getSetting(DB,'ad_button_type')||'button';
  const targetBot=await db.getSetting(DB,'ad_target_bot')||'';
  const firstName=user.first_name||'دوست عزیز';
  try{
    let rr;
    if(btnType==='button'&&targetBot){rr=await bot.call('sendMessage',{chat_id:groupId,text:`👋 ${firstName}، یه پیام ویژه برات دارم!\nکلیک کن 👇`,reply_to_message_id:msg.message_id,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'📩 دریافت',url:`https://t.me/${targetBot}?start=hi`}]]}});}
    else if(targetBot){rr=await bot.call('sendMessage',{chat_id:groupId,text:`👋 ${firstName}، پیام ویژه برات دارم!\n\n👉 @${targetBot}`,reply_to_message_id:msg.message_id,parse_mode:'HTML'});}
    await db.logAdSent(DB,userId,groupId);
    const rid=rr?.result?.message_id;
    if(rid)setTimeout(async()=>{try{await bot.deleteMessage(groupId,rid);}catch{}},delAfter);
  }catch{}
  try{await bot.sendMessage(userId,adText);}catch{}
}
