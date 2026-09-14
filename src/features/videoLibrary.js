import * as db from '../db.js';
export async function showFields(bot,DB,chatId){
  const fields=await db.getVideoFields(DB);
  if(!fields.length){await bot.sendMessage(chatId,'محتوایی اضافه نشده.',{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'menu:root'}]]}});return;}
  const rows=fields.map(f=>[{text:`📚 ${f.title}`,callback_data:`video:field:${f.id}`}]);
  rows.push([{text:'🔙 بازگشت',callback_data:'menu:root'}]);
  await bot.sendMessage(chatId,'🎥 <b>کتابخانه ویدیو</b>\n\nرشته را انتخاب کنید:',{reply_markup:{inline_keyboard:rows}});
}
export async function showGrades(bot,DB,chatId,fieldId){
  const grades=await db.getVideoGrades(DB,fieldId);
  const field=await db.getVideoField(DB,fieldId);
  const rows=grades.map(g=>[{text:`📖 ${g.title}`,callback_data:`video:grade:${fieldId}:${g.id}`}]);
  rows.push([{text:'🔙 بازگشت',callback_data:'video:fields'}]);
  await bot.sendMessage(chatId,`📚 <b>${field?.title}</b>\n\nمقطع را انتخاب کنید:`,{reply_markup:{inline_keyboard:rows}});
}
export async function showLessons(bot,DB,chatId,fieldId,gradeId){
  const lessons=await db.getVideoLessons(DB,gradeId);
  const grade=await db.getVideoGrade(DB,gradeId);
  const rows=lessons.map(l=>[{text:`🎬 ${l.title}`,callback_data:`video:lesson:${fieldId}:${gradeId}:${l.id}`}]);
  rows.push([{text:'🔙 بازگشت',callback_data:`video:field:${fieldId}`}]);
  await bot.sendMessage(chatId,`📖 <b>${grade?.title}</b>\n\nدرس را انتخاب کنید:`,{reply_markup:{inline_keyboard:rows}});
}
export async function sendLesson(bot,DB,chatId,lessonId,videoChannel){
  const lesson=await db.getVideoLesson(DB,lessonId);
  if(!lesson||!lesson.message_id||!videoChannel){await bot.sendMessage(chatId,'ویدیو موجود نیست.');return;}
  await bot.sendMessage(chatId,`🎬 <b>${lesson.title}</b>`);
  try{await bot.copyMessage(chatId,`@${videoChannel}`,lesson.message_id);}
  catch{await bot.sendMessage(chatId,'خطا در ارسال ویدیو.');}
}
