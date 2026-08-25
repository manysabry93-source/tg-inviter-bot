/**
 * 🤖 Telegram Inviter Bot — Cloudflare Worker
 * ربات دعوت‌گر تلگرام روی Cloudflare Workers + D1
 */

import { tg, inlineKb, backBtn, mainMenuKb } from './telegram.js';
import * as db from './db.js';

// ─── State management (در KV ذخیره می‌شه) ─────────────────────────────────────
// چون Workers stateless هستن، وضعیت مکالمه رو در حافظه session ذخیره می‌کنیم
const SESSION = new Map();

function getSession(userId) {
  return SESSION.get(userId) || {};
}
function setSession(userId, data) {
  SESSION.set(userId, { ...getSession(userId), ...data });
}
function clearSession(userId) {
  SESSION.delete(userId);
}

// ─── Main Worker Handler ───────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // تنظیم Webhook (فقط یه بار)
    if (url.pathname === '/setup') {
      return handleSetup(request, env);
    }

    // Webhook از تلگرام
    if (url.pathname === `/webhook/${env.BOT_SECRET}`) {
      if (request.method !== 'POST') return new Response('OK');
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (e) {
        console.error('Update error:', e);
      }
      return new Response('OK');
    }

    return new Response('🤖 Bot is running!');
  },
};

// ─── Setup Webhook ─────────────────────────────────────────────────────────────

async function handleSetup(request, env) {
  const bot = tg(env.BOT_TOKEN);
  const workerUrl = env.WORKER_URL;
  const webhookUrl = `${workerUrl}/webhook/${env.BOT_SECRET}`;

  const debugInfo = {
    workerUrl: workerUrl || 'NOT SET',
    botSecret: env.BOT_SECRET ? env.BOT_SECRET.substring(0, 4) + '...' : 'NOT SET',
    botToken: env.BOT_TOKEN ? env.BOT_TOKEN.substring(0, 10) + '...' : 'NOT SET',
    webhookUrl: webhookUrl,
  };

  let result;
  try {
    result = await bot.setWebhook(webhookUrl, env.BOT_SECRET);
  } catch(e) {
    result = { error: e.message };
  }

  return new Response(JSON.stringify({ debug: debugInfo, result }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Update Router ─────────────────────────────────────────────────────────────

async function handleUpdate(update, env) {
  const bot = tg(env.BOT_TOKEN);

  console.log('UPDATE:', JSON.stringify(update));
  if (update.message) {
    const chatType = update.message.chat.type;
    // پیام از گروه/سوپرگروه → بررسی تبلیغ
    if (chatType === 'group' || chatType === 'supergroup') {
      await handleGroupMessage(update.message, bot, env);
    } else {
      // پیام خصوصی → پنل ادمین
      await handleMessage(update.message, bot, env);
    }
  } else if (update.callback_query) {
    await handleCallback(update.callback_query, bot, env);
  }
}

// ─── Group Message Ad Listener ─────────────────────────────────────────────────

async function handleGroupMessage(msg, bot, env) {
  // 1. بررسی فعال بودن قابلیت تبلیغ
  const adActive = await db.getSetting(env.DB, 'ad_listener_active');
  if (adActive !== '1') return;

   const groupId = String(msg.chat.id);
  console.log('groupId:', groupId);
  const isTargetGroup = await db.isAdGroup(env.DB, groupId);
  console.log('groupId:', groupId, 'isTarget:', isTargetGroup);  console.log('isTargetGroup:', isTargetGroup, 'for groupId:', groupId);
  const user = msg.from;

  // 2. بات‌ها رو رد کن
  if (!user || user.is_bot) return;

  // 3. فقط گروه‌هایی که ادمین اضافه کرده

  const userId = user.id;

  // 4. اگه ادمین یا مدیر گروه هست پیام نده
  try {
    const memberRes = await bot.getChatMember(groupId, userId);
    const status = memberRes?.result?.status;
    if (status === 'administrator' || status === 'creator') return;
  } catch {
    // اگه چک نشد ادامه بده
  }

  // 5. کولداون 5 روزه (120 ساعت) — اگه قبلاً پیام گرفته، رد کن
  const alreadySent = await db.wasAdSentRecently(env.DB, userId, 120);
  if (alreadySent) return;

  // 6. گرفتن متن تبلیغ
  const adText = await db.getActiveAdMessage(env.DB);
  if (!adText) return;

  // 7. اول تو گروه ریپلای بفرست با دکمه استارت
  try {
    const firstName = user.first_name || 'دوست عزیز';
    const replyRes = await bot.sendMessageWithButton(
      groupId,
      `👋 ${firstName}، یه پیام ویژه برات دارم!
برای دریافت کلیک کن 👇`,
      msg.message_id,
      env.BOT_USERNAME
    );
    await db.logAdSent(env.DB, userId, groupId);

    // بعد از 30 ثانیه پیام ریپلای رو حذف کن
    const replyMsgId = replyRes?.result?.message_id;
    if (replyMsgId) {
      setTimeout(async () => {
        try { await bot.deleteMessage(groupId, replyMsgId); } catch {}
      }, 30000);
    }
  } catch {
    // نادیده بگیر
  }

  // 8. اگه قبلاً استارت زده، پیام خصوصی بفرست
  try {
    await bot.sendMessage(userId, adText);
  } catch {
    // استارت نزده — همون ریپلای کافیه
  }
}

// ─── Message Handler ───────────────────────────────────────────────────────────

async function handleMessage(msg, bot, env) {
  const userId = msg.from.id;
  const text = msg.text || '';
  const chatId = msg.chat.id;

  const isAdm = await db.isAdmin(env.DB, userId);
  const isSuper = await db.isSuperAdmin(env.DB, userId);

  // /start
  if (text === '/start') {
    if (!isAdm && !isSuper) {
      await bot.sendMessage(chatId, '⛔ شما دسترسی ادمین ندارید.');
      return;
    }
    clearSession(userId);
    await bot.sendMessage(
      chatId,
      `👋 سلام <b>${msg.from.first_name}</b>!\n\n🤖 <b>پنل مدیریت ربات دعوت‌گر</b>\n━━━━━━━━━━━━━━━━━━━━\nاز منوی زیر گزینه مورد نظر را انتخاب کنید:`,
      { reply_markup: mainMenuKb(isSuper) }
    );
    return;
  }

  if (!isAdm && !isSuper) return;

  // بررسی session برای دریافت ورودی
  const session = getSession(userId);

  if (session.waiting === 'source_link') {
    await receiveSourceLink(msg, bot, env, session);
  } else if (session.waiting === 'target_link') {
    await receiveTargetLink(msg, bot, env, session);
  } else if (session.waiting === 'invite_msg') {
    await receiveInviteMsg(msg, bot, env);
  } else if (session.waiting === 'admin_id_add') {
    await receiveAdminAdd(msg, bot, env);
  } else if (session.waiting === 'admin_id_remove') {
    await receiveAdminRemove(msg, bot, env);
  } else if (session.waiting === 'set_delay') {
    await receiveDelaySetting(msg, bot, env);
  } else if (session.waiting === 'set_max_daily') {
    await receiveMaxDailySetting(msg, bot, env);
  } else if (session.waiting === 'ad_group_link') {
    await receiveAdGroupLink(msg, bot, env);
  } else if (session.waiting === 'ad_message_text') {
    await receiveAdMessageText(msg, bot, env);
  }
}

// ─── Callback Handler ──────────────────────────────────────────────────────────

async function handleCallback(cq, bot, env) {
  const userId = cq.from.id;
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const data = cq.data;

  const isAdm = await db.isAdmin(env.DB, userId);
  const isSuper = await db.isSuperAdmin(env.DB, userId);

  if (!isAdm && !isSuper) {
    await bot.answerCallbackQuery(cq.id, '⛔ دسترسی ندارید!', true);
    return;
  }

  await bot.answerCallbackQuery(cq.id);

  // ─── Router ───────────────────────────────────────────────────────────────
  if (data === 'menu_main') {
    clearSession(userId);
    await bot.editMessageText(
      chatId, msgId,
      '🤖 <b>پنل مدیریت ربات دعوت‌گر</b>\n━━━━━━━━━━━━━━━━━━━━\nاز منوی زیر گزینه مورد نظر را انتخاب کنید:',
      { reply_markup: mainMenuKb(isSuper) }
    );

  } else if (data === 'menu_stats') {
    await showStats(chatId, msgId, bot, env);

  } else if (data.startsWith('menu_members_')) {
    const page = parseInt(data.split('_')[2]) || 0;
    await showMembers(chatId, msgId, bot, env, page);

  } else if (data === 'menu_sources') {
    await showSources(chatId, msgId, bot, env);

  } else if (data === 'add_source') {
    setSession(userId, { waiting: 'source_link' });
    await bot.editMessageText(
      chatId, msgId,
      '📥 <b>اضافه کردن کانال/گروه مبدا</b>\n\nلینک یا @یوزرنیم کانال را ارسال کنید:\nمثال: <code>https://t.me/channel</code> یا <code>@channel</code>\n\n⚠️ ربات باید قبلاً عضو اون کانال باشه.',
      { reply_markup: inlineKb([backBtn('menu_sources')]) }
    );

  } else if (data.startsWith('del_src_')) {
    const chId = data.replace('del_src_', '');
    await db.removeSourceChannel(env.DB, chId);
    await bot.answerCallbackQuery(cq.id, '✅ کانال حذف شد!', true);
    await showSources(chatId, msgId, bot, env);

  } else if (data === 'menu_targets') {
    await showTargets(chatId, msgId, bot, env);

  } else if (data === 'add_target') {
    setSession(userId, { waiting: 'target_link' });
    await bot.editMessageText(
      chatId, msgId,
      '📤 <b>اضافه کردن کانال/گروه مقصد</b>\n\nلینک یا @یوزرنیم کانال را ارسال کنید:\nمثال: <code>https://t.me/my_channel</code>\n\n⚠️ ربات باید ادمین اون کانال باشه.',
      { reply_markup: inlineKb([backBtn('menu_targets')]) }
    );

  } else if (data.startsWith('del_tgt_')) {
    const chId = data.replace('del_tgt_', '');
    await db.removeTargetChannel(env.DB, chId);
    await bot.answerCallbackQuery(cq.id, '✅ کانال حذف شد!', true);
    await showTargets(chatId, msgId, bot, env);

  } else if (data === 'menu_invite') {
    await showInviteMsg(chatId, msgId, bot, env);

  } else if (data === 'edit_invite_msg') {
    setSession(userId, { waiting: 'invite_msg' });
    const targets = await db.getTargetChannels(env.DB);
    const tgtLinks = targets.map(t => `• ${t.channel_link}`).join('\n') || '(هنوز کانال مقصدی اضافه نشده)';
    await bot.editMessageText(
      chatId, msgId,
      `✏️ <b>متن پیام دعوت را بنویسید:</b>\n\nاز <code>{link}</code> برای درج لینک دعوت استفاده کنید.\n\n<b>کانال‌های مقصد:</b>\n${tgtLinks}\n\nمثال:\n<code>سلام! به کانال ما بپیوندید 👇\n{link}</code>`,
      { reply_markup: inlineKb([backBtn('menu_invite')]) }
    );

  } else if (data === 'menu_settings') {
    await showSettings(chatId, msgId, bot, env);

  } else if (data === 'toggle_bot') {
    const cur = await db.getSetting(env.DB, 'bot_active');
    await db.setSetting(env.DB, 'bot_active', cur === '1' ? '0' : '1');
    await showSettings(chatId, msgId, bot, env);

  } else if (data === 'set_delay') {
    setSession(userId, { waiting: 'set_delay' });
    await bot.editMessageText(chatId, msgId,
      '⏱ <b>تاخیر بین پیام‌ها</b>\n\nعدد تاخیر (ثانیه) را بنویسید:\nمثال: <code>5</code>',
      { reply_markup: inlineKb([backBtn('menu_settings')]) }
    );

  } else if (data === 'set_max_daily') {
    setSession(userId, { waiting: 'set_max_daily' });
    await bot.editMessageText(chatId, msgId,
      '📊 <b>حداکثر دعوت روزانه</b>\n\nعدد را بنویسید:\nمثال: <code>100</code>',
      { reply_markup: inlineKb([backBtn('menu_settings')]) }
    );

  } else if (data === 'menu_admins') {
    if (!isSuper) { await bot.answerCallbackQuery(cq.id, '⛔ فقط سوپر ادمین!', true); return; }
    await showAdmins(chatId, msgId, bot, env);

  } else if (data === 'add_admin') {
    if (!isSuper) return;
    setSession(userId, { waiting: 'admin_id_add' });
    await bot.editMessageText(chatId, msgId,
      '👑 آیدی عددی کاربر جدید را ارسال کنید:',
      { reply_markup: inlineKb([backBtn('menu_admins')]) }
    );

  } else if (data === 'remove_admin') {
    if (!isSuper) return;
    setSession(userId, { waiting: 'admin_id_remove' });
    await bot.editMessageText(chatId, msgId,
      '🗑 آیدی عددی ادمینی که می‌خواهید حذف کنید را بنویسید:',
      { reply_markup: inlineKb([backBtn('menu_admins')]) }
    );

  } else if (data === 'menu_start_invite') {
    await showStartInvite(chatId, msgId, bot, env);

  } else if (data === 'confirm_invite') {
    await bot.editMessageText(chatId, msgId,
      '⏳ <b>در حال شروع ارسال دعوت‌نامه...</b>\n\nگزارش نهایی به شما ارسال می‌شود.',
      { reply_markup: inlineKb([]) }
    );
    await runInviteProcess(chatId, bot, env);

  // ─── Ad Group Panel ──────────────────────────────────────────────────────
  } else if (data === 'menu_ads') {
    await showAdPanel(chatId, msgId, bot, env);

  } else if (data === 'ad_toggle') {
    const cur = await db.getSetting(env.DB, 'ad_listener_active');
    await db.setSetting(env.DB, 'ad_listener_active', cur === '1' ? '0' : '1');
    await showAdPanel(chatId, msgId, bot, env);

  } else if (data === 'ad_add_group') {
    setSession(userId, { waiting: 'ad_group_link' });
    await bot.editMessageText(chatId, msgId,
      '📢 <b>اضافه کردن گروه تبلیغاتی</b>\n\nلینک یا @یوزرنیم گروه را ارسال کنید:\nمثال: <code>https://t.me/mygroup</code>\n\n⚠️ ربات باید عضو اون گروه باشه.',
      { reply_markup: inlineKb([backBtn('menu_ads')]) }
    );

  } else if (data.startsWith('ad_del_grp_')) {
    const gId = data.replace('ad_del_grp_', '');
    await db.removeAdGroup(env.DB, gId);
    await bot.answerCallbackQuery(cq.id, '✅ گروه حذف شد!', true);
    await showAdPanel(chatId, msgId, bot, env);

  } else if (data === 'ad_edit_msg') {
    setSession(userId, { waiting: 'ad_message_text' });
    await bot.editMessageText(chatId, msgId,
      '✏️ <b>متن پیام تبلیغاتی را بنویسید:</b>\n\nاین پیام به صورت <b>خصوصی</b> برای کاربران فعال در گروه ارسال می‌شود.\n\nمی‌توانید از HTML استفاده کنید:\n<code>&lt;b&gt;بولد&lt;/b&gt;</code> | <code>&lt;a href=\"لینک\"&gt;متن&lt;/a&gt;</code>',
      { reply_markup: inlineKb([backBtn('menu_ads')]) }
    );

  } else if (data === 'ad_stats') {
    await showAdStats(chatId, msgId, bot, env);
  }
}

// ─── UI Screens ────────────────────────────────────────────────────────────────

async function showStats(chatId, msgId, bot, env) {
  const stats = await db.getStats(env.DB);
  await bot.editMessageText(chatId, msgId,
    `📊 <b>آمار کلی ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 کل ممبرهای جذب‌شده: <b>${stats.total}</b>\n` +
    `📅 امروز: <b>${stats.today}</b>\n` +
    `✉️ پیام‌های ارسال‌شده: <b>${stats.sent}</b>\n` +
    `📥 کانال‌های مبدا: <b>${stats.sources}</b>\n` +
    `📤 کانال‌های مقصد: <b>${stats.targets}</b>\n` +
    `👑 تعداد ادمین‌ها: <b>${stats.admins}</b>`,
    { reply_markup: inlineKb([backBtn()]) }
  );
}

async function showMembers(chatId, msgId, bot, env, page = 0) {
  const members = await db.getMembers(env.DB, 8, page * 8);
  let text = `👥 <b>لیست ممبرهای جذب‌شده</b> (صفحه ${page + 1})\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (!members.length) {
    text += '\n📭 هنوز هیچ ممبری جذب نشده.';
  } else {
    for (const m of members) {
      const mention = m.username ? `@${m.username}` : `<code>${m.user_id}</code>`;
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'بی‌نام';
      const icon = m.message_sent ? '✅' : '⏳';
      text += `\n${icon} ${mention} — ${name}\n   📥 ${m.source_channel_id} → 📤 ${m.target_channel_id}\n   🕐 ${(m.converted_at || '').slice(0, 16)}`;
    }
  }
  const nav = [];
  if (page > 0) nav.push({ text: '◀️ قبلی', callback_data: `menu_members_${page - 1}` });
  if (members.length === 8) nav.push({ text: '▶️ بعدی', callback_data: `menu_members_${page + 1}` });
  const rows = nav.length ? [nav, backBtn()] : [backBtn()];
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showSources(chatId, msgId, bot, env) {
  const channels = await db.getSourceChannels(env.DB);
  let text = '📥 <b>کانال‌های مبدا</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const ch of channels) {
    const count = await db.getMembersCountBySource(env.DB, ch.channel_id);
    text += `\n${ch.is_active ? '✅' : '❌'} <b>${ch.channel_title || ch.channel_id}</b>\n🔗 ${ch.channel_link}\n👥 ${count} ممبر جذب‌شده`;
  }
  if (!channels.length) text += '\nهیچ کانالی اضافه نشده.';
  const rows = [
    [{ text: '➕ اضافه کردن', callback_data: 'add_source' }],
  ];
  if (channels.length) {
    const delBtns = channels.map(ch => ({ text: `🗑 ${ch.channel_title || ch.channel_id}`, callback_data: `del_src_${ch.channel_id}` }));
    rows.push(delBtns);
  }
  rows.push(backBtn());
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showTargets(chatId, msgId, bot, env) {
  const channels = await db.getTargetChannels(env.DB);
  let text = '📤 <b>کانال‌های مقصد</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const ch of channels) {
    text += `\n${ch.is_active ? '✅' : '❌'} <b>${ch.channel_title || ch.channel_id}</b>\n🔗 ${ch.channel_link}`;
  }
  if (!channels.length) text += '\nهیچ کانالی اضافه نشده.';
  const rows = [
    [{ text: '➕ اضافه کردن', callback_data: 'add_target' }],
  ];
  if (channels.length) {
    const delBtns = channels.map(ch => ({ text: `🗑 ${ch.channel_title || ch.channel_id}`, callback_data: `del_tgt_${ch.channel_id}` }));
    rows.push(delBtns);
  }
  rows.push(backBtn());
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showInviteMsg(chatId, msgId, bot, env) {
  const msg = await db.getActiveInviteMessage(env.DB);
  await bot.editMessageText(chatId, msgId,
    `✉️ <b>پیام دعوت</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📝 <b>پیام فعلی:</b>\n${msg || '(تنظیم نشده)'}`,
    { reply_markup: inlineKb([[{ text: '✏️ ویرایش پیام', callback_data: 'edit_invite_msg' }], backBtn()]) }
  );
}

async function showSettings(chatId, msgId, bot, env) {
  const active = await db.getSetting(env.DB, 'bot_active');
  const delay = await db.getSetting(env.DB, 'delay_between_messages');
  const maxD = await db.getSetting(env.DB, 'max_daily_invites');
  const status = active === '1' ? '✅ فعال' : '❌ غیرفعال';
  await bot.editMessageText(chatId, msgId,
    `⚙️ <b>تنظیمات ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n\n🤖 وضعیت: <b>${status}</b>\n⏱ تاخیر: <b>${delay} ثانیه</b>\n📊 حد روزانه: <b>${maxD}</b>`,
    {
      reply_markup: inlineKb([
        [{ text: active === '1' ? '🔴 غیرفعال کن' : '🟢 فعال کن', callback_data: 'toggle_bot' }],
        [{ text: '⏱ تغییر تاخیر', callback_data: 'set_delay' }, { text: '📊 حد روزانه', callback_data: 'set_max_daily' }],
        backBtn(),
      ])
    }
  );
}

async function showAdmins(chatId, msgId, bot, env) {
  const admins = await db.getAllAdmins(env.DB);
  let text = '👑 <b>مدیریت ادمین‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const a of admins) {
    const mention = a.username ? `@${a.username}` : `<code>${a.user_id}</code>`;
    text += `\n${a.is_super ? '⭐' : '👤'} ${mention}`;
  }
  if (!admins.length) text += '\n(هیچ ادمینی نیست)';
  await bot.editMessageText(chatId, msgId, text, {
    reply_markup: inlineKb([
      [{ text: '➕ اضافه کردن ادمین', callback_data: 'add_admin' }],
      [{ text: '🗑 حذف ادمین', callback_data: 'remove_admin' }],
      backBtn(),
    ])
  });
}

async function showStartInvite(chatId, msgId, bot, env) {
  const active = await db.getSetting(env.DB, 'bot_active');
  const sources = await db.getSourceChannels(env.DB);
  const targets = await db.getTargetChannels(env.DB);
  const invMsg = await db.getActiveInviteMessage(env.DB);

  if (active !== '1') {
    await bot.editMessageText(chatId, msgId, '❌ ربات غیرفعال است. از تنظیمات فعال کنید.', { reply_markup: inlineKb([backBtn()]) });
    return;
  }
  if (!sources.length) {
    await bot.editMessageText(chatId, msgId, '❌ هیچ کانال مبدایی اضافه نشده.', { reply_markup: inlineKb([backBtn()]) });
    return;
  }
  if (!targets.length) {
    await bot.editMessageText(chatId, msgId, '❌ هیچ کانال مقصدی اضافه نشده.', { reply_markup: inlineKb([backBtn()]) });
    return;
  }
  if (!invMsg) {
    await bot.editMessageText(chatId, msgId, '❌ پیام دعوت تنظیم نشده.', { reply_markup: inlineKb([backBtn()]) });
    return;
  }

  const srcList = sources.map(s => `• ${s.channel_title || s.channel_id}`).join('\n');
  const tgtList = targets.map(t => `• ${t.channel_title || t.channel_id}`).join('\n');

  await bot.editMessageText(chatId, msgId,
    `🚀 <b>شروع ارسال دعوت‌نامه</b>\n━━━━━━━━━━━━━━━━━━━━\n\n📥 <b>مبداها:</b>\n${srcList}\n\n📤 <b>مقصدها:</b>\n${tgtList}\n\n✉️ <b>پیام:</b>\n${invMsg.slice(0, 100)}${invMsg.length > 100 ? '...' : ''}\n\nآیا مطمئن هستید؟`,
    {
      reply_markup: inlineKb([
        [{ text: '✅ بله، شروع کن!', callback_data: 'confirm_invite' }],
        [{ text: '❌ انصراف', callback_data: 'menu_main' }],
      ])
    }
  );
}

// ─── Invite Process ────────────────────────────────────────────────────────────

async function runInviteProcess(adminChatId, bot, env) {
  const sources = await db.getSourceChannels(env.DB);
  const targets = await db.getTargetChannels(env.DB);
  const invMsgTemplate = await db.getActiveInviteMessage(env.DB);
  const delay = parseInt(await db.getSetting(env.DB, 'delay_between_messages') || '3') * 1000;
  const maxDaily = parseInt(await db.getSetting(env.DB, 'max_daily_invites') || '50');
  const admins = await db.getAllAdmins(env.DB);
  const adminIds = admins.map(a => a.user_id);

  let totalSent = 0, totalSkipped = 0;
  const report = ['📊 <b>گزارش ارسال دعوت‌نامه</b>\n━━━━━━━━━━━━━━━━━━━━'];

  for (const target of targets) {
    let inviteLink;
    try {
      const res = await bot.exportChatInviteLink(target.channel_id);
      inviteLink = res.result;
    } catch {
      report.push(`❌ خطا در گرفتن لینک ${target.channel_title}`);
      continue;
    }

    const invMsg = invMsgTemplate.replace(/\{link\}/g, inviteLink);

    for (const source of sources) {
      report.push(`\n📥 <b>${source.channel_title}</b> → 📤 <b>${target.channel_title}</b>`);
      let srcSent = 0, srcSkipped = 0;

      try {
        // دریافت ادمین‌های کانال مبدا (برای اسکیپ کردن)
        const adminsRes = await bot.getChatAdministrators(source.channel_id);
        const chAdminIds = adminsRes.result ? adminsRes.result.map(a => a.user.id) : [];

        // ⚠️ Bot API نمی‌تونه لیست کامل ممبرها رو بده (فقط برای supergroups)
        // این قسمت به userbot/telethon نیاز داره
        // اما ربات می‌تونه از طریق forward یا new member events کار کنه
        report.push('   ℹ️ برای دریافت لیست ممبرها از طریق رویدادهای ورود ثبت می‌شن');

      } catch (e) {
        report.push(`   ❌ خطا: ${e.message}`);
        srcSkipped++;
      }

      report.push(`   ✉️ ارسال: <b>${srcSent}</b> | رد: <b>${srcSkipped}</b>`);
      totalSent += srcSent;
      totalSkipped += srcSkipped;
    }
  }

  report.push(`\n━━━━━━━━━━━━━━━━━━━━`);
  report.push(`✅ کل ارسال‌شده: <b>${totalSent}</b>`);
  report.push(`⏭ رد/بلاک: <b>${totalSkipped}</b>`);

  // ارسال گزارش به همه ادمین‌ها
  for (const aid of [...new Set([adminChatId, ...adminIds])]) {
    try {
      await bot.sendMessage(aid, report.join('\n'));
    } catch {}
  }
}

// ─── Input Receivers ───────────────────────────────────────────────────────────

async function receiveSourceLink(msg, bot, env) {
  const userId = msg.from.id;
  let link = msg.text.trim();
  let channelId = link;
  if (link.includes('t.me/')) channelId = '@' + link.split('t.me/').pop().replace(/\/$/, '');
  else if (!link.startsWith('@') && !link.startsWith('-')) channelId = '@' + link;

  try {
    const res = await bot.getChat(channelId);
    if (!res.ok) throw new Error(res.description);
    const chat = res.result;
    const memRes = await bot.getChatMember(chat.id, (await bot.getChat('me'))?.result?.id || 0);
    await db.addSourceChannel(env.DB, String(chat.id), chat.title || chat.username, link);
    await bot.sendMessage(msg.chat.id, `✅ کانال <b>${chat.title || chat.username}</b> به عنوان مبدا اضافه شد!\n🆔 <code>${chat.id}</code>`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ خطا: ${e.message}\n\nمطمئن شوید ربات در کانال عضو است.`);
  }
  clearSession(userId);
}

async function receiveTargetLink(msg, bot, env) {
  const userId = msg.from.id;
  let link = msg.text.trim();
  let channelId = link;
  if (link.includes('t.me/')) channelId = '@' + link.split('t.me/').pop().replace(/\/$/, '');
  else if (!link.startsWith('@') && !link.startsWith('-')) channelId = '@' + link;

  try {
    const res = await bot.getChat(channelId);
    if (!res.ok) throw new Error(res.description);
    const chat = res.result;
    await db.addTargetChannel(env.DB, String(chat.id), chat.title || chat.username, link);
    await bot.sendMessage(msg.chat.id, `✅ کانال <b>${chat.title || chat.username}</b> به عنوان مقصد اضافه شد!\n🆔 <code>${chat.id}</code>`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ خطا: ${e.message}`);
  }
  clearSession(userId);
}

async function receiveInviteMsg(msg, bot, env) {
  await db.setInviteMessage(env.DB, msg.text);
  await bot.sendMessage(msg.chat.id, '✅ پیام دعوت ذخیره شد!');
  clearSession(msg.from.id);
}

async function receiveAdminAdd(msg, bot, env) {
  const userId = msg.from.id;
  const targetId = parseInt(msg.text.trim());
  if (isNaN(targetId)) {
    await bot.sendMessage(msg.chat.id, '❌ آیدی باید عدد باشد.');
  } else {
    await db.addAdmin(env.DB, targetId, null, 0);
    await bot.sendMessage(msg.chat.id, `✅ کاربر <code>${targetId}</code> به عنوان ادمین اضافه شد.`);
  }
  clearSession(userId);
}

async function receiveAdminRemove(msg, bot, env) {
  const userId = msg.from.id;
  const targetId = parseInt(msg.text.trim());
  if (isNaN(targetId)) {
    await bot.sendMessage(msg.chat.id, '❌ آیدی باید عدد باشد.');
  } else {
    await db.removeAdmin(env.DB, targetId);
    await bot.sendMessage(msg.chat.id, `✅ ادمین <code>${targetId}</code> حذف شد.`);
  }
  clearSession(userId);
}

async function receiveDelaySetting(msg, bot, env) {
  const val = parseInt(msg.text.trim());
  if (isNaN(val) || val < 1) {
    await bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کنید (حداقل ۱).');
  } else {
    await db.setSetting(env.DB, 'delay_between_messages', String(val));
    await bot.sendMessage(msg.chat.id, `✅ تاخیر به <b>${val} ثانیه</b> تغییر یافت.`);
  }
  clearSession(msg.from.id);
}

async function receiveMaxDailySetting(msg, bot, env) {
  const val = parseInt(msg.text.trim());
  if (isNaN(val) || val < 1) {
    await bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کنید.');
  } else {
    await db.setSetting(env.DB, 'max_daily_invites', String(val));
    await bot.sendMessage(msg.chat.id, `✅ حد روزانه به <b>${val}</b> تغییر یافت.`);
  }
  clearSession(msg.from.id);
}

// ─── Ad Panel UI ──────────────────────────────────────────────────────────────

async function showAdPanel(chatId, msgId, bot, env) {
  const active = await db.getSetting(env.DB, 'ad_listener_active');
  const adMsg = await db.getActiveAdMessage(env.DB);
  const groups = await db.getAdGroups(env.DB);
  const stats = await db.getAdStats(env.DB);
  const status = active === '1' ? '✅ فعال' : '❌ غیرفعال';

  let text =
    `📢 <b>مدیریت تبلیغ گروه‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 وضعیت: <b>${status}</b>\n` +
    `📊 کل ارسال‌شده: <b>${stats.total}</b> | امروز: <b>${stats.today}</b>\n` +
    `👤 کاربران یکتا: <b>${stats.unique}</b>\n` +
    `🕐 کولداون: <b>5 روز</b> (هر کاربر)\n` +
    `🚫 ادمین‌های گروه: خودکار رد می‌شوند\n\n`;

  if (adMsg) {
    text += `✉️ <b>پیام تبلیغ:</b>\n${adMsg.slice(0, 120)}${adMsg.length > 120 ? '...' : ''}\n\n`;
  } else {
    text += `⚠️ پیام تبلیغ تنظیم نشده!\n\n`;
  }

  text += `📋 <b>گروه‌های فعال (${groups.length}):</b>\n`;
  for (const g of groups) {
    text += `• ${g.group_title || g.group_id}\n`;
  }
  if (!groups.length) text += '(هیچ گروهی اضافه نشده)\n';

  const rows = [
    [{ text: active === '1' ? '🔴 غیرفعال کن' : '🟢 فعال کن', callback_data: 'ad_toggle' }],
    [{ text: '✏️ ویرایش پیام تبلیغ', callback_data: 'ad_edit_msg' }],
    [{ text: '➕ اضافه کردن گروه', callback_data: 'ad_add_group' },
     { text: '📊 آمار تفصیلی', callback_data: 'ad_stats' }],
  ];
  if (groups.length) {
    for (const g of groups) {
      rows.push([{ text: `🗑 حذف: ${g.group_title || g.group_id}`, callback_data: `ad_del_grp_${g.group_id}` }]);
    }
  }
  rows.push(backBtn());
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showAdStats(chatId, msgId, bot, env) {
  const stats = await db.getAdStats(env.DB);
  const text =
    `📊 <b>آمار تبلیغات گروه‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📨 کل پیام‌های ارسال‌شده: <b>${stats.total}</b>\n` +
    `📅 امروز: <b>${stats.today}</b>\n` +
    `👤 کاربران یکتا هدف‌گرفته‌شده: <b>${stats.unique}</b>\n` +
    `📋 گروه‌های فعال: <b>${stats.groups}</b>\n\n` +
    `⏱ <b>قانون کولداون:</b>\n` +
    `هر کاربر پس از دریافت تبلیغ، تا <b>5 روز</b> پیام جدید دریافت نمی‌کند.\n\n` +
    `🚫 <b>ادمین‌ها و مدیران گروه</b> از لیست خودکار حذف می‌شوند.`;
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb([backBtn('menu_ads')]) });
}

// ─── Ad Input Receivers ───────────────────────────────────────────────────────

async function receiveAdGroupLink(msg, bot, env) {
  const userId = msg.from.id;
  let link = msg.text.trim();
  let groupId = link;
  if (link.includes('t.me/')) groupId = '@' + link.split('t.me/').pop().replace(/\/$/, '');
  else if (!link.startsWith('@') && !link.startsWith('-')) groupId = '@' + link;

  try {
    const res = await bot.getChat(groupId);
    if (!res.ok) throw new Error(res.description);
    const chat = res.result;
    const type = chat.type;
    if (type !== 'group' && type !== 'supergroup') {
      await bot.sendMessage(msg.chat.id, '❌ این یک گروه نیست. لطفاً لینک گروه را ارسال کنید.');
      clearSession(userId);
      return;
    }
    await db.addAdGroup(env.DB, String(chat.id), chat.title || chat.username, link);
    await bot.sendMessage(msg.chat.id,
      `✅ گروه <b>${chat.title || chat.username}</b> اضافه شد!\n` +
      `🆔 <code>${chat.id}</code>\n\n` +
      `از این پس هر کاربر عادی که در این گروه پیام بدهد، تبلیغ شما را دریافت می‌کند.\n` +
      `(ادمین‌ها و مدیران گروه پیام دریافت نمی‌کنند)`
    );
  } catch (e) {
    await bot.sendMessage(msg.chat.id,
      `❌ خطا: ${e.message}\n\nمطمئن شوید:\n• ربات عضو گروه است\n• لینک گروه درست است`
    );
  }
  clearSession(userId);
}

async function receiveAdMessageText(msg, bot, env) {
  const text = msg.text;
  await db.setAdMessage(env.DB, text);
  await bot.sendMessage(msg.chat.id,
    `✅ پیام تبلیغاتی ذخیره شد!\n\n` +
    `📝 <b>پیش‌نمایش:</b>\n${text}\n\n` +
    `این پیام به کاربران فعال در گروه‌های ثبت‌شده ارسال می‌شود.`
  );
  clearSession(msg.from.id);
}
