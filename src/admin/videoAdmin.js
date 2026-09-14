import * as db from '../db.js';
export async function showVideoAdmin(bot, DB, chatId) {
  const fields = await db.getVideoFields(DB);
  const ch = await db.getSetting(DB, 'video_channel');
  const rows = [[{text:'📡 تنظیم کانال', callback_data:'vadm:set_channel'},{text:'➕ رشته جدید', callback_data:'vadm:add_field'}]];
  for (const f of fields) rows.push([{text:`📚 ${f.title}`, callback_data:`vadm:field:${f.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,`🎥 <b>کتابخانه ویدیو</b>\n📡 کانال: <b>${ch||'تنظیم نشده'}</b>\n${fields.length} رشته`,{reply_markup:{inline_keyboard:rows}});
}
export async function showFieldAdmin(bot, DB, chatId, fieldId) {
  const field = await db.getVideoField(DB, fieldId);
  const grades = await db.getVideoGrades(DB, fieldId);
  const rows = [[{text:'➕ مقطع جدید', callback_data:`vadm:add_grade:${fieldId}`},{text:'🗑 حذف رشته', callback_data:`vadm:del_field:${fieldId}`}]];
  for (const g of grades) rows.push([{text:`📖 ${g.title}`, callback_data:`vadm:grade:${fieldId}:${g.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'vadm:home'}]);
  await bot.sendMessage(chatId,`📚 <b>${field?.title}</b>\n${grades.length} مقطع`,{reply_markup:{inline_keyboard:rows}});
}
export async function showGradeAdmin(bot, DB, chatId, fieldId, gradeId) {
  const grade = await db.getVideoGrade(DB, gradeId);
  const lessons = await db.getVideoLessons(DB, gradeId);
  const rows = [[{text:'➕ درس جدید', callback_data:`vadm:add_lesson:${fieldId}:${gradeId}`},{text:'🗑 حذف مقطع', callback_data:`vadm:del_grade:${fieldId}:${gradeId}`}]];
  for (const l of lessons) rows.push([{text:`🎬 ${l.title}`, callback_data:`vadm:lesson:${fieldId}:${gradeId}:${l.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:`vadm:field:${fieldId}`}]);
  await bot.sendMessage(chatId,`📖 <b>${grade?.title}</b>\n${lessons.length} درس`,{reply_markup:{inline_keyboard:rows}});
}
export async function showLessonAdmin(bot, DB, chatId, fieldId, gradeId, lessonId) {
  const lesson = await db.getVideoLesson(DB, lessonId);
  await bot.sendMessage(chatId,
    `🎬 <b>${lesson?.title}</b>\nMessage ID: ${lesson?.message_id||'تنظیم نشده'}`,
    {reply_markup:{inline_keyboard:[
      [{text:'✏️ عنوان', callback_data:`vadm:edit_title:${fieldId}:${gradeId}:${lessonId}`}],
      [{text:'🎬 تنظیم ویدیو', callback_data:`vadm:set_video:${fieldId}:${gradeId}:${lessonId}`}],
      [{text:'🗑 حذف درس', callback_data:`vadm:del_lesson:${fieldId}:${gradeId}:${lessonId}`}],
      [{text:'🔙 بازگشت', callback_data:`vadm:grade:${fieldId}:${gradeId}`}],
    ]}}
  );
}
