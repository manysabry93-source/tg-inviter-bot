export function tg(token){
  const base=`https://api.telegram.org/bot${token}`;
  async function call(method,body={}){const res=await fetch(`${base}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return res.json();}
  return{call,
    sendMessage:(c,t,e={})=>call('sendMessage',{chat_id:c,text:t,parse_mode:'HTML',...e}),
    editMessageText:(c,m,t,e={})=>call('editMessageText',{chat_id:c,message_id:m,text:t,parse_mode:'HTML',...e}),
    deleteMessage:(c,m)=>call('deleteMessage',{chat_id:c,message_id:m}),
    answerCallbackQuery:(id,t='',a=false)=>call('answerCallbackQuery',{callback_query_id:id,text:t,show_alert:a}),
    getChat:(c)=>call('getChat',{chat_id:c}),
    getChatMember:(c,u)=>call('getChatMember',{chat_id:c,user_id:u}),
    exportChatInviteLink:(c)=>call('exportChatInviteLink',{chat_id:c}),
    approveChatJoinRequest:(c,u)=>call('approveChatJoinRequest',{chat_id:c,user_id:u}),
    copyMessage:(c,f,m)=>call('copyMessage',{chat_id:c,from_chat_id:f,message_id:m}),
    sendDocument:(c,d,e={})=>call('sendDocument',{chat_id:c,document:d,...e}),
    sendPhoto:(c,p,e={})=>call('sendPhoto',{chat_id:c,photo:p,...e}),
    sendVideo:(c,v,e={})=>call('sendVideo',{chat_id:c,video:v,...e}),
    sendAudio:(c,a,e={})=>call('sendAudio',{chat_id:c,audio:a,...e}),
    sendVoice:(c,v,e={})=>call('sendVoice',{chat_id:c,voice:v,...e}),
    setWebhook:(url,s)=>call('setWebhook',{url,secret_token:s,allowed_updates:['message','callback_query','chat_join_request']}),
  };
}
export async function sendFileByType(bot,chatId,type,fileId){
  if(type==='photo')return bot.sendPhoto(chatId,fileId);
  if(type==='video')return bot.sendVideo(chatId,fileId);
  if(type==='audio')return bot.sendAudio(chatId,fileId);
  if(type==='voice')return bot.sendVoice(chatId,fileId);
  return bot.sendDocument(chatId,fileId);
}
export function getFileFromMsg(msg){
  if(msg.photo)return{type:'photo',fileId:msg.photo[msg.photo.length-1].file_id};
  if(msg.video)return{type:'video',fileId:msg.video.file_id};
  if(msg.audio)return{type:'audio',fileId:msg.audio.file_id};
  if(msg.voice)return{type:'voice',fileId:msg.voice.file_id};
  if(msg.document)return{type:'document',fileId:msg.document.file_id};
  return null;
}
