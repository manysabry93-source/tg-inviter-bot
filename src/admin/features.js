import * as db from '../db.js';
const FEATURES=[
  {key:'feature_video',label:'🎥 کتابخانه ویدیو'},
  {key:'feature_support',label:'💬 پشتیبانی زنده'},
  {key:'feature_points',label:'⭐ سیستم امتیاز'},
  {key:'feature_referral',label:'🔗 لینک دعوت'},
  {key:'feature_poll',label:'📊 نظرسنجی'},
  {key:'feature_scheduler',label:'📅 زمان‌بندی پیام'},
  {key:'feature_tags',label:'🏷 تگ کاربران'},
  {key:'feature_anon_qa',label:'❓ سوال ناشناس'},
  {key:'feature_ai_chat',label:'🤖 هوش مصنوعی'},
  {key:'feature_gate',label:'🔒 گیت دسترسی'},
  {key:'feature_attract',label:'📢 تبلیغ در گروه'},
  {key:'feature_join_request',label:'🔗 Join Request'},
  {key:'feature_forms',label:'📝 فرم‌ها'},
  {key:'feature_welcome',label:'👋 خوش‌آمدگویی'},
  {key:'feature_referral',label:'🎁 دعوت از دوستان'},
];
export async function isEnabled(DB,key){const v=await db.getSetting(DB,key);return v==='1';}
export async function showFeaturesPanel(bot,DB,chatId){
  const rows=[];
  for(const f of FEATURES){
    const v=await db.getSetting(DB,f.key);
    rows.push([{text:`${v==='1'?'✅':'❌'} ${f.label}`,callback_data:`feat:toggle:${f.key}`}]);
  }
  rows.push([{text:'🔙 بازگشت',callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,'⚙️ <b>مدیریت قابلیت‌ها</b>\n\nهر قابلیت را فعال/غیرفعال کنید:',{reply_markup:{inline_keyboard:rows}});
}
export async function toggleFeature(bot,DB,chatId,key){
  const cur=await db.getSetting(DB,key);
  const nv=cur==='1'?'0':'1';
  await db.setSetting(DB,key,nv);
  const f=FEATURES.find(f=>f.key===key);
  await bot.sendMessage(chatId,`${nv==='1'?'✅ فعال شد':'❌ غیرفعال شد'}: ${f?.label||key}`);
  await showFeaturesPanel(bot,DB,chatId);
}
export {FEATURES};
