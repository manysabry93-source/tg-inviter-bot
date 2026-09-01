export function tg(token) {
  const base = `https://api.telegram.org/bot${token}`;
  async function call(method, body={}) {
    const res = await fetch(`${base}/${method}`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    });
    return res.json();
  }
  return {
    call,
    sendMessage:(chat_id,text,extra={})=>call('sendMessage',{chat_id,text,parse_mode:'HTML',...extra}),
    editMessageText:(chat_id,message_id,text,extra={})=>call('editMessageText',{chat_id,message_id,text,parse_mode:'HTML',...extra}),
    deleteMessage:(chat_id,message_id)=>call('deleteMessage',{chat_id,message_id}),
    answerCallbackQuery:(id,text='',show_alert=false)=>call('answerCallbackQuery',{callback_query_id:id,text,show_alert}),
    getChat:(chat_id)=>call('getChat',{chat_id}),
    getChatMember:(chat_id,user_id)=>call('getChatMember',{chat_id,user_id}),
    exportChatInviteLink:(chat_id)=>call('exportChatInviteLink',{chat_id}),
    approveChatJoinRequest:(chat_id,user_id)=>call('approveChatJoinRequest',{chat_id,user_id}),
    copyMessage:(chat_id,from_chat_id,message_id)=>call('copyMessage',{chat_id,from_chat_id,message_id}),
    sendDocument:(chat_id,document,extra={})=>call('sendDocument',{chat_id,document,...extra}),
    sendPhoto:(chat_id,photo,extra={})=>call('sendPhoto',{chat_id,photo,...extra}),
    sendVideo:(chat_id,video,extra={})=>call('sendVideo',{chat_id,video,...extra}),
    sendAudio:(chat_id,audio,extra={})=>call('sendAudio',{chat_id,audio,...extra}),
    sendVoice:(chat_id,voice,extra={})=>call('sendVoice',{chat_id,voice,...extra}),
    setWebhook:(url,secret_token)=>call('setWebhook',{url,secret_token,allowed_updates:['message','callback_query','chat_join_request']}),
  };
}

export async function sendFileByType(bot, chatId, type, fileId) {
  if (type==='photo') return bot.sendPhoto(chatId, fileId);
  if (type==='video') return bot.sendVideo(chatId, fileId);
  if (type==='audio') return bot.sendAudio(chatId, fileId);
  if (type==='voice') return bot.sendVoice(chatId, fileId);
  return bot.sendDocument(chatId, fileId);
}

export function getFileFromMsg(msg) {
  if (msg.photo) return {type:'photo', fileId:msg.photo[msg.photo.length-1].file_id};
  if (msg.video) return {type:'video', fileId:msg.video.file_id};
  if (msg.audio) return {type:'audio', fileId:msg.audio.file_id};
  if (msg.voice) return {type:'voice', fileId:msg.voice.file_id};
  if (msg.document) return {type:'document', fileId:msg.document.file_id};
  return null;
}
