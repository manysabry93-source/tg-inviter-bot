// ─── Admin Panel ──────────────────────────────────────────────────────────────
import * as db from '../db.js';
import { genNodeId } from '../db.js';
import { getFileFromMsg } from '../utils/telegram.js';

export function isAdmin(userId, DB) { return db.isAdmin(DB, userId); }

// ─── Main Menu ────────────────────────────────────────────────────────────────
export async function showHome(bot, chatId) {
  await bot.sendMessage(chatId, '👑 <b>پنل مدیریت</b>', {
    reply_markup: {inline_keyboard:[
      [{text:'🧩 مدیریت منو', callback_data:'adm:menu_list:root'}],
      [{text:'📝 مدیریت فرم‌ها', callback_data:'adm:forms'}],
      [{text:'🔒 گیت دسترسی', callback_data:'adm:gate'}],
      [{text:'🤖 تنظیمات AI', callback_data:'adm:ai'}],
      [{text:'🎯 جذب ممبر', callback_data:'adm:attract'}],
      [{text:'📢 ارسال همگانی', callback_data:'adm:broadcast'}],
      [{text:'📊 آمار', callback_data:'adm:stats'}],
      [{text:'👑 مدیریت ادمین‌ها', callback_data:'adm:admins'}],
    ]}
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function showStats(bot, DB, chatId) {
  const users = await db.getUserCount(DB);
  const adStats = await db.getAdStats(DB);
  await bot.sendMessage(chatId,
    `📊 <b>آمار ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 کل کاربران: <b>${users}</b>\n` +
    `📢 تبلیغ ارسالی: <b>${adStats.adSent}</b>\n` +
    `📅 امروز: <b>${adStats.adToday}</b>\n` +
    `🔗 Join تأیید‌شده: <b>${adStats.joinApproved}</b>`,
    {reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'adm:home'}]]}}
  );
}

// ─── Admins ───────────────────────────────────────────────────────────────────
export async function showAdmins(bot, DB, chatId) {
  const admins = await db.getAllAdmins(DB);
  let text = '👑 <b>ادمین‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const a of admins) text += `\n${a.is_super?'⭐':'👤'} ${a.username?'@'+a.username:`<code>${a.user_id}</code>`}`;
  await bot.sendMessage(chatId, text, {
    reply_markup:{inline_keyboard:[
      [{text:'➕ اضافه کردن ادمین', callback_data:'adm:admin_add'}],
      [{text:'🗑 حذف ادمین', callback_data:'adm:admin_del'}],
      [{text:'🔙 بازگشت', callback_data:'adm:home'}],
    ]}
  });
}

// ─── Broadcast ────────────────────────────────────────────────────────────────
export async function startBroadcast(bot, DB, chatId) {
  const count = await db.getUserCount(DB);
  await db.setSession(DB, chatId, {type:'broadcast'});
  await bot.sendMessage(chatId,
    `📢 <b>ارسال همگانی</b>\n\n👥 تعداد کاربران: <b>${count}</b>\n\nمتن پیام را بنویسید:`,
    {reply_markup:{inline_keyboard:[[{text:'❌ انصراف',callback_data:'adm:home'}]]}}
  );
}

export async function handleBroadcastInput(bot, DB, chatId, text) {
  const session = await db.getSession(DB, chatId);
  if (!session || session.type !== 'broadcast') return false;
  await db.clearSession(DB, chatId);

  const userIds = await db.getAllUserIds(DB);
  await bot.sendMessage(chatId, `⏳ در حال ارسال به ${userIds.length} کاربر...`);

  let sent=0, failed=0;
  for (const uid of userIds) {
    try { await bot.sendMessage(uid, text); sent++; } catch { failed++; }
    await new Promise(r=>setTimeout(r,50));
  }

  await bot.sendMessage(chatId, `✅ ارسال تموم شد!\n📤 موفق: <b>${sent}</b>\n❌ ناموفق: <b>${failed}</b>`);
  return true;
}

// ─── Menu Builder ─────────────────────────────────────────────────────────────
export async function showMenuList(bot, DB, chatId, parentId='root') {
  const nodes = await db.getNodes(DB);
  const parent = nodes[parentId];
  if (!parent) return;

  const children = (parent.children||[]).map(id=>nodes[id]).filter(Boolean);
  const rows = children.map(n=>[
    {text:`${n.enabled?'✅':'❌'} ${n.title} [${n.type}]`, callback_data:`adm:node:${n.id}`}
  ]);
  rows.push([{text:'➕ اضافه کردن دکمه', callback_data:`adm:node_add:${parentId}`}]);
  if (parentId !== 'root') rows.push([{text:'🔙 بازگشت', callback_data:`adm:menu_list:${parent.parent_id||'root'}`}]);
  else rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);

  await bot.sendMessage(chatId,
    `🧩 <b>مدیریت منو</b>\n📁 ${parent.title}\n\n${children.length} دکمه`,
    {reply_markup:{inline_keyboard:rows}}
  );
}

export async function showNodeDetail(bot, DB, chatId, nodeId) {
  const nodes = await db.getNodes(DB);
  const node = nodes[nodeId];
  if (!node) return;

  const rows = [
    [{text:'✏️ ویرایش عنوان', callback_data:`adm:node_edit_title:${nodeId}`}],
    [{text:'📝 ویرایش محتوا', callback_data:`adm:node_edit_content:${nodeId}`}],
    [{text:node.enabled?'🔴 غیرفعال کن':'🟢 فعال کن', callback_data:`adm:node_toggle:${nodeId}`}],
    [{text:'🗑 حذف دکمه', callback_data:`adm:node_del_confirm:${nodeId}`}],
  ];
  if (node.type==='submenu') rows.push([{text:'📂 مدیریت زیردکمه‌ها', callback_data:`adm:menu_list:${nodeId}`}]);
  if (node.type==='file') rows.push([{text:'📎 مدیریت فایل‌ها', callback_data:`adm:node_files:${nodeId}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:`adm:menu_list:${node.parent_id||'root'}`}]);

  await bot.sendMessage(chatId,
    `🔧 <b>${node.title}</b>\nنوع: ${node.type}\nوضعیت: ${node.enabled?'✅ فعال':'❌ غیرفعال'}`,
    {reply_markup:{inline_keyboard:rows}}
  );
}

// ─── Gate Admin ───────────────────────────────────────────────────────────────
export async function showGate(bot, DB, chatId) {
  const channels = await db.getGateChannels(DB);
  let text = '🔒 <b>گیت دسترسی</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  text += channels.length ? channels.map(c=>`\n• ${c.channel_title||c.channel_id}`).join('') : '\nهیچ کانالی تنظیم نشده.';
  const rows = [
    [{text:'➕ اضافه کردن کانال', callback_data:'adm:gate_add'}],
    ...channels.map(c=>[{text:`🗑 ${c.channel_title||c.channel_id}`, callback_data:`adm:gate_del:${c.id}`}]),
    [{text:'🔙 بازگشت', callback_data:'adm:home'}],
  ];
  await bot.sendMessage(chatId, text, {reply_markup:{inline_keyboard:rows}});
}

// ─── AI Admin ─────────────────────────────────────────────────────────────────
export async function showAISettings(bot, DB, chatId) {
  const ai = await db.getAISettings(DB);
  await bot.sendMessage(chatId,
    `🤖 <b>تنظیمات هوش مصنوعی</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 Base URL: <code>${ai.baseUrl||'تنظیم نشده'}</code>\n` +
    `🔑 API Key: ${ai.apiKey?'✅ تنظیم شده':'❌ تنظیم نشده'}\n` +
    `🤖 Model: <code>${ai.model||'gpt-3.5-turbo'}</code>`,
    {reply_markup:{inline_keyboard:[
      [{text:'🔗 تنظیم Base URL', callback_data:'adm:ai_url'}],
      [{text:'🔑 تنظیم API Key', callback_data:'adm:ai_key'}],
      [{text:'🤖 تنظیم Model', callback_data:'adm:ai_model'}],
      [{text:'🔙 بازگشت', callback_data:'adm:home'}],
    ]}}
  );
}

// ─── Attract Admin ────────────────────────────────────────────────────────────
export async function showAttract(bot, DB, chatId) {
  const adActive = await db.getSetting(DB, 'ad_listener_active');
  const joinActive = await db.getSetting(DB, 'join_request_active');
  const adMsg = await db.getSetting(DB, 'ad_message');
  const groups = await db.getAdGroups(DB);
  const targetBot = await db.getSetting(DB, 'ad_target_bot')||'';
  const buttonType = await db.getSetting(DB, 'ad_button_type')||'button';
  const deleteAfter = await db.getSetting(DB, 'ad_delete_after')||'30';
  const stats = await db.getAdStats(DB);

  await bot.sendMessage(chatId,
    `🎯 <b>جذب ممبر</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `📢 تبلیغ گروه: <b>${adActive==='1'?'✅ فعال':'❌ غیرفعال'}</b>\n` +
    `🔗 Join Request: <b>${joinActive==='1'?'✅ فعال':'❌ غیرفعال'}</b>\n` +
    `🤖 ربات مقصد: <b>${targetBot?'@'+targetBot:'(تنظیم نشده)'}</b>\n` +
    `🔘 نوع: <b>${buttonType==='button'?'دکمه':'منشن @'}</b>\n` +
    `🕐 حذف بعد: <b>${deleteAfter} ثانیه</b>\n` +
    `📋 گروه‌ها: <b>${groups.length}</b>\n` +
    `📊 تبلیغ: <b>${stats.adSent}</b> | Join: <b>${stats.joinApproved}</b>\n\n` +
    `✉️ پیام:\n${adMsg?adMsg.slice(0,80)+'...':'⚠️ تنظیم نشده'}`,
    {reply_markup:{inline_keyboard:[
      [{text:adActive==='1'?'🔴 غیرفعال تبلیغ':'🟢 فعال تبلیغ', callback_data:'adm:attract_toggle_ad'}],
      [{text:joinActive==='1'?'🔴 غیرفعال Join':'🟢 فعال Join', callback_data:'adm:attract_toggle_join'}],
      [{text:'✏️ ویرایش پیام تبلیغ', callback_data:'adm:attract_edit_msg'}],
      [{text:'🤖 ربات مقصد', callback_data:'adm:attract_target_bot'}],
      [{text:'⚙️ تنظیمات نمایش', callback_data:'adm:attract_display'}],
      [{text:'➕ اضافه گروه', callback_data:'adm:attract_add_group'}],
      [{text:'📋 لیست گروه‌ها', callback_data:'adm:attract_groups'}],
      [{text:'🔙 بازگشت', callback_data:'adm:home'}],
    ]}}
  );
}

export async function showAttractDisplay(bot, DB, chatId) {
  const buttonType = await db.getSetting(DB, 'ad_button_type')||'button';
  const deleteAfter = await db.getSetting(DB, 'ad_delete_after')||'30';
  await bot.sendMessage(chatId,
    `⚙️ <b>تنظیمات نمایش</b>\n\n🔘 نوع: <b>${buttonType==='button'?'دکمه اینلاین':'منشن @'}</b>\n🕐 حذف بعد: <b>${deleteAfter} ثانیه</b>`,
    {reply_markup:{inline_keyboard:[
      [{text:buttonType==='button'?'✅ دکمه':'🔘 دکمه', callback_data:'adm:attract_type_btn'},
       {text:buttonType==='mention'?'✅ منشن @':'🔘 منشن @', callback_data:'adm:attract_type_mention'}],
      [{text:'⏱ 5 ثانیه', callback_data:'adm:attract_del:5'},{text:'⏱ 10 ثانیه', callback_data:'adm:attract_del:10'}],
      [{text:'⏱ 15 ثانیه', callback_data:'adm:attract_del:15'},{text:'⏱ 20 ثانیه', callback_data:'adm:attract_del:20'}],
      [{text:'⏱ 30 ثانیه', callback_data:'adm:attract_del:30'},{text:'⏱ 1 دقیقه', callback_data:'adm:attract_del:60'}],
      [{text:'🔙 بازگشت', callback_data:'adm:attract'}],
    ]}}
  );
}

export async function showAttractGroups(bot, DB, chatId) {
  const groups = await db.getAdGroups(DB);
  if (!groups.length) {
    await bot.sendMessage(chatId, '📋 هیچ گروهی اضافه نشده.',
      {reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:'adm:attract'}]]}}
    );
    return;
  }
  const rows = groups.map(g=>[{text:`🗑 ${g.group_title||g.group_id}`, callback_data:`adm:attract_del_group:${g.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:attract'}]);
  await bot.sendMessage(chatId, `📋 <b>گروه‌ها (${groups.length})</b>`,
    {reply_markup:{inline_keyboard:rows}}
  );
}
