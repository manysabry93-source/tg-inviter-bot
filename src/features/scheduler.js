import * as db from '../db.js';
export async function processScheduled(bot,DB){
  const msgs=await db.getPendingScheduled(DB);
  for(const msg of msgs){
    let ids=[];
    if(msg.tag){const users=await db.getUsersByTag(DB,msg.tag);ids=users.map(u=>u.user_id);}
    else ids=await db.getAllUserIds(DB);
    for(const uid of ids){try{await bot.sendMessage(uid,msg.text);}catch{}await new Promise(r=>setTimeout(r,50));}
    await db.markScheduledSent(DB,msg.id);
  }
}
