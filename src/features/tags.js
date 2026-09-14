import * as db from '../db.js';
export async function broadcastToTag(bot,DB,tag,text){
  const users=await db.getUsersByTag(DB,tag);
  let sent=0,failed=0;
  for(const u of users){try{await bot.sendMessage(u.user_id,text);sent++;}catch{failed++;}await new Promise(r=>setTimeout(r,50));}
  return{sent,failed};
}
