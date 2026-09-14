import * as db from '../db.js';

export async function showHome(bot, chatId) {
  await bot.sendMessage(chatId, '👑 <b>پنل مدیریت</b>\n━━━━━━━━━━━━━━━━━━━━', {
    reply_markup: {inline_keyboard:[
      [{text:'🧩 منو', callback_data:'adm:menu_list:root'},{text:'📝 فرم‌ها', callback_data:'adm:forms'}],
      [{text:'🎥 ویدیو', callback_data:'adm:video'},{text:'📊 نظرسنجی', callback_data:'adm:polls'}],
      [{text:'🔒 گیت', callback_data:'adm:gate'},{text:'🤖 هوش مصنوعی', callback_data:'adm:ai'}],
      [{text:'🎯 جذب ممبر', callback_data:'adm:attract'},{text:'👋 خوش‌آمد', callback_data:'adm:welcome'}],
      [{text:'🏷 تگ‌ها', callback_data:'adm:tags'},{text:'📅 زمان‌بندی', callback_data:'adm:scheduler'}],
      [{text:'📢 همگانی', callback_data:'adm:broadcast'},{text:'📊 آمار', callback_data:'adm:stats'}],
      [{text:'⚙️ قابلیت‌ها', callback_data:'adm:features'},{text:'👑 ادمین‌ها', callback_data:'adm:admins'}],
    ]}
  });
}

export async function showStats(bot, DB, chatId) {
  const users = await db.getUserCount(DB);
  const adStats = await db.getAdStats(DB);
  await bot.sendMessage(chatId,
    `📊 <b>آمار ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n\n👥 کاربران: <b>${users}</b>\n📢 تبلیغ: <b>${adStats.adSent}</b>\n📅 امروز: <b>${adStats.adToday}</b>\n🔗 Join: <b>${adStats.joinApproved}</b>`,
    {reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'adm:home'}]]}}
  );
}

export async function showAdmins(bot, DB, chatId) {
  const admins = await db.getAllAdmins(DB);
  let text = '👑 <b>ادمین‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const a of admins) text += `\n${a.is_super?'⭐':'👤'} ${a.username?'@'+a.username:`<code>${a.user_id}</code>`}`;
  await bot.sendMessage(chatId, text, {reply_markup:{inline_keyboard:[
    [{text:'➕ اضافه', callback_data:'adm:admin_add'},{text:'🗑 حذف', callback_data:'adm:admin_del'}],
    [{text:'🔙 بازگشت', callback_data:'adm:home'}],
  ]}});
}

export async function startBroadcast(bot, DB, chatId) {
  const count = await db.getUserCount(DB);
  await db.setSession(DB, chatId, {type:'broadcast'});
  await bot.sendMessage(chatId,
    `📢 <b>ارسال همگانی</b>\n\n👥 ${count} کاربر\n\nمتن پیام را بنویسید:`,
    {reply_markup:{inline_keyboard:[[{text:'❌ انصراف',callback_data:'adm:home'}]]}}
  );
}

export async function handleBroadcastInput(bot, DB, chatId, text) {
  const s = await db.getSession(DB, chatId);
  if (!s || s.type !== 'broadcast') return false;
  await db.clearSession(DB, chatId);
  const ids = await db.getAllUserIds(DB);
  await bot.sendMessage(chatId, `⏳ ارسال به ${ids.length} کاربر...`);
  let sent=0, failed=0;
  for (const uid of ids) {
    try { await bot.sendMessage(uid, text); sent++; } catch { failed++; }
    await new Promise(r=>setTimeout(r,50));
  }
  await bot.sendMessage(chatId, `✅ تموم شد!\n📤 موفق: ${sent}\n❌ ناموفق: ${failed}`);
  return true;
}

export async function showMenuList(bot, DB, chatId, parentId='root') {
  const nodes = await db.getNodes(DB);
  const parent = nodes[parentId];
  if (!parent) return;
  const children = (parent.children||[]).map(id=>nodes[id]).filter(Boolean);
  const rows = children.map(n=>[{text:`${n.enabled?'✅':'❌'} ${n.title} [${n.type}]`, callback_data:`adm:node:${n.id}`}]);
  rows.push([{text:'➕ اضافه', callback_data:`adm:node_add:${parentId}`}]);
  if (parentId!=='root') rows.push([{text:'🔙 بازگشت', callback_data:`adm:menu_list:${parent.parent_id||'root'}`}]);
  else rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId, `🧩 <b>${parent.title}</b>\n${children.length} دکمه`, {reply_markup:{inline_keyboard:rows}});
}

export async function showNodeDetail(bot, DB, chatId, nodeId) {
  const nodes = await db.getNodes(DB);
  const node = nodes[nodeId];
  if (!node) return;
  const rows = [
    [{text:'✏️ عنوان', callback_data:`adm:node_edit_title:${nodeId}`},{text:'📝 محتوا', callback_data:`adm:node_edit_content:${nodeId}`}],
    [{text:'🔗 لینک', callback_data:`adm:node_edit_url:${nodeId}`},{text:node.enabled?'🔴 غیرفعال':'🟢 فعال', callback_data:`adm:node_toggle:${nodeId}`}],
    [{text:'🗑 حذف', callback_data:`adm:node_del_confirm:${nodeId}`}],
  ];
  if (node.type==='submenu') rows.push([{text:'📂 زیردکمه‌ها', callback_data:`adm:menu_list:${nodeId}`}]);
  if (node.type==='file') rows.push([{text:'📎 فایل‌ها', callback_data:`adm:node_files:${nodeId}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:`adm:menu_list:${node.parent_id||'root'}`}]);
  await bot.sendMessage(chatId,
    `🔧 <b>${node.title}</b>\nنوع: ${node.type}\n${node.enabled?'✅ فعال':'❌ غیرفعال'}`,
    {reply_markup:{inline_keyboard:rows}}
  );
}

export async function showGate(bot, DB, chatId) {
  const channels = await db.getGateChannels(DB);
  let text = '🔒 <b>گیت دسترسی</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  text += channels.length ? channels.map(c=>`\n• ${c.channel_title||c.channel_id}`).join('') : '\nهیچ کانالی تنظیم نشده.';
  const rows = [[{text:'➕ اضافه کانال', callback_data:'adm:gate_add'}]];
  for (const c of channels) rows.push([{text:`🗑 ${c.channel_title||c.channel_id}`, callback_data:`adm:gate_del:${c.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId, text, {reply_markup:{inline_keyboard:rows}});
}

export async function showAISettings(bot, DB, chatId) {
  const ai = await db.getAISettings(DB);
  await bot.sendMessage(chatId,
    `🤖 <b>هوش مصنوعی</b>\n━━━━━━━━━━━━━━━━━━━━\n\n🔗 URL: <code>${ai.baseUrl||'تنظیم نشده'}</code>\n🔑 Key: ${ai.apiKey?'✅':'❌'}\n🤖 Model: <code>${ai.model||'gpt-3.5-turbo'}</code>`,
    {reply_markup:{inline_keyboard:[
      [{text:'🔗 Base URL', callback_data:'adm:ai_url'},{text:'🔑 API Key', callback_data:'adm:ai_key'}],
      [{text:'🤖 Model', callback_data:'adm:ai_model'},{text:'📝 System Prompt', callback_data:'adm:ai_prompt'}],
      [{text:'🔙 بازگشت', callback_data:'adm:home'}],
    ]}}
  );
}

export async function showAttract(bot, DB, chatId) {
  const adActive = await db.getSetting(DB, 'ad_listener_active');
  const joinActive = await db.getSetting(DB, 'join_request_active');
  const adMsg = await db.getSetting(DB, 'ad_message');
  const groups = await db.getAdGroups(DB);
  const targetBot = await db.getSetting(DB, 'ad_target_bot')||'';
  const btnType = await db.getSetting(DB, 'ad_button_type')||'button';
  const delAfter = await db.getSetting(DB, 'ad_delete_after')||'30';
  const stats = await db.getAdStats(DB);
  await bot.sendMessage(chatId,
    `🎯 <b>جذب ممبر</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📢 تبلیغ: <b>${adActive==='1'?'✅':'❌'}</b> | 🔗 Join: <b>${joinActive==='1'?'✅':'❌'}</b>\n🤖 ربات: <b>${targetBot?'@'+targetBot:'(تنظیم نشده)'}</b>\n🔘 نوع: <b>${btnType==='button'?'دکمه':'منشن'}</b> | 🕐 حذف: <b>${delAfter}s</b>\n📋 گروه‌ها: <b>${groups.length}</b>\n📊 ارسال: <b>${stats.adSent}</b> | Join: <b>${stats.joinApproved}</b>\n\n✉️ ${adMsg?adMsg.slice(0,60)+'...':'⚠️ تنظیم نشده'}`,
    {reply_markup:{inline_keyboard:[
      [{text:adActive==='1'?'🔴 غیرفعال تبلیغ':'🟢 فعال تبلیغ', callback_data:'adm:attract_toggle_ad'}],
      [{text:joinActive==='1'?'🔴 غیرفعال Join':'🟢 فعال Join', callback_data:'adm:attract_toggle_join'}],
      [{text:'✏️ پیام تبلیغ', callback_data:'adm:attract_edit_msg'},{text:'🤖 ربات مقصد', callback_data:'adm:attract_target_bot'}],
      [{text:'⚙️ تنظیمات نمایش', callback_data:'adm:attract_display'}],
      [{text:'➕ اضافه گروه', callback_data:'adm:attract_add_group'},{text:'📋 لیست گروه‌ها', callback_data:'adm:attract_groups'}],
      [{text:'🔙 بازگشت', callback_data:'adm:home'}],
    ]}}
  );
}

export async function showAttractDisplay(bot, DB, chatId) {
  const btnType = await db.getSetting(DB, 'ad_button_type')||'button';
  const delAfter = await db.getSetting(DB, 'ad_delete_after')||'30';
  await bot.sendMessage(chatId,
    `⚙️ <b>تنظیمات نمایش</b>\n\n🔘 نوع: <b>${btnType==='button'?'دکمه':'منشن @'}</b>\n🕐 حذف بعد: <b>${delAfter} ثانیه</b>`,
    {reply_markup:{inline_keyboard:[
      [{text:btnType==='button'?'✅ دکمه':'🔘 دکمه', callback_data:'adm:attract_type_btn'},
       {text:btnType==='mention'?'✅ منشن':'🔘 منشن', callback_data:'adm:attract_type_mention'}],
      [{text:'5s', callback_data:'adm:attract_del:5'},{text:'10s', callback_data:'adm:attract_del:10'},{text:'15s', callback_data:'adm:attract_del:15'}],
      [{text:'20s', callback_data:'adm:attract_del:20'},{text:'30s', callback_data:'adm:attract_del:30'},{text:'60s', callback_data:'adm:attract_del:60'}],
      [{text:'🔙 بازگشت', callback_data:'adm:attract'}],
    ]}}
  );
}

export async function showAttractGroups(bot, DB, chatId) {
  const groups = await db.getAdGroups(DB);
  if (!groups.length) { await bot.sendMessage(chatId,'هیچ گروهی اضافه نشده.',{reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'adm:attract'}]]}}); return; }
  const rows = groups.map(g=>[{text:`🗑 ${g.group_title||g.group_id}`, callback_data:`adm:attract_del_group:${g.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:attract'}]);
  await bot.sendMessage(chatId,`📋 <b>گروه‌ها (${groups.length})</b>`,{reply_markup:{inline_keyboard:rows}});
}
