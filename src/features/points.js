import * as db from '../db.js';
export async function showMyPoints(bot,DB,chatId,userId,botUsername){
  const pts=await db.getUserPoints(DB,userId);
  const rank=await db.getUserRank(DB,userId);
  const refCount=await db.getRefCount(DB,userId);
  const refCode=`ref_${userId}`;
  await bot.sendMessage(chatId,
    `⭐ <b>امتیازات شما</b>\n━━━━━━━━━━━━━━━━━━━━\n\n⭐ امتیاز: <b>${pts}</b>\n🏆 رتبه: <b>${rank}</b>\n👥 دعوت‌شده‌ها: <b>${refCount}</b>\n\n🔗 لینک دعوت:\n<code>https://t.me/${botUsername||'bot'}?start=${refCode}</code>`,
    {reply_markup:{inline_keyboard:[[{text:'🏆 جدول رتبه‌بندی',callback_data:'leaderboard'}],[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}}
  );
}
export async function showLeaderboard(bot,DB,chatId){
  const top=await db.getTopUsers(DB,10);
  const medals=['🥇','🥈','🥉'];
  let text='🏆 <b>برترین‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n\n';
  top.forEach((u,i)=>{text+=`${medals[i]||`${i+1}.`} ${u.first_name||'کاربر'} — <b>${u.points}</b>\n`;});
  await bot.sendMessage(chatId,text,{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}});
}
export async function handleRefStart(bot,DB,chatId,userId,refUserId){
  if(userId===refUserId)return;
  if(await db.getRef(DB,userId))return;
  await db.saveRef(DB,userId,refUserId);
  const pts=parseInt(await db.getSetting(DB,'points_per_ref')||'10');
  await db.addUserPoints(DB,refUserId,pts,'دعوت دوست');
  try{await bot.sendMessage(refUserId,`🎉 یک دوست از لینک شما وارد شد!\n⭐ <b>${pts}</b> امتیاز اضافه شد.`);}catch{}
}
