/**
 * Telegram Inviter Bot — Cloudflare Worker
 * نسخه کامل با Join Request + تبلیغ گروه + پنل ادمین
 */

import { tg, inlineKb, backBtn, mainMenuKb } from './telegram.js';
import * as db from './db.js';

const SESSION = new Map();
function getSession(userId) { return SESSION.get(userId) || {}; }
function setSession(userId, data) { SESSION.set(userId, { ...getSession(userId), ...data }); }
function clearSession(userId) { SESSION.delete(userId); }

// ─── Main Worker ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/setup') return handleSetup(request, env);
    if (url.pathname === `/webhook/${env.BOT_SECRET}`) {
      if (request.method !== 'POST') return new Response('OK');
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (e) { console.error('Error:', e); }
      return new Response('OK');
    }
    return new Response('Bot is running!');
  },
};

// ─── Setup ────────────────────────────────────────────────────────────────────

async function handleSetup(request, env) {
  const bot = tg(env.BOT_TOKEN);
  const webhookUrl = `${env.WORKER_URL}/webhook/${env.BOT_SECRET}`;
  const result = await bot.setWebhook(webhookUrl, env.BOT_SECRET);
  return new Response(JSON.stringify({ webhookUrl, result }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Update Router ────────────────────────────────────────────────────────────

async function handleUpdate(update, env) {
  const bot = tg(env.BOT_TOKEN);
  if (update.chat_join_request) {
    await handleJoinRequest(update.chat_join_request, bot, env);
  } else if (update.message) {
    const chatType = update.message.chat.type;
    if (chatType === 'group' || chatType === 'supergroup') {
      await handleGroupMessage(update.message, bot, env);
    } else {
      await handleMessage(update.message, bot, env);
    }
  } else if (update.callback_query) {
    await handleCallback(update.callback_query, bot, env);
  }
}

// ─── Join Request Handler ─────────────────────────────────────────────────────

async function handleJoinRequest(jr, bot, env) {
  const active = await db.getSetting(env.DB, 'join_request_active');
  if (active !== '1') {
    await bot.approveChatJoinRequest(jr.chat.id, jr.from.id);
    return;
  }
  const userId = jr.from.id;
  const channelId = String(jr.chat.id);
  const firstName = jr.from.first_name || 'کاربر';
  const targetBot = env.BOT_USERNAME;

  await db.logJoinRequest(env.DB, userId, jr.from.username, firstName, channelId);

  const joinMsg = await db.getSetting(env.DB, 'join_request_message');
  const msgText = joinMsg || 'برای عضویت در کانال ابتدا ربات ما را استارت کنید 👇';

  try {
    await bot.sendMessage(userId, `👋 ${firstName} عزیز!\n\n${msgText}`, {
      reply_markup: {
        inline_keyboard: [[
          { text: '🤖 استارت ربات', url: `https://t.me/${targetBot}?start=join_${channelId}` }
        ]]
      }
    });
  } catch {
    await bot.approveChatJoinRequest(jr.chat.id, userId);
  }
}

// ─── Group Message Handler ────────────────────────────────────────────────────

async function handleGroupMessage(msg, bot, env) {
  const adActive = await db.getSetting(env.DB, 'ad_listener_active');
  if (adActive !== '1') return;

  const user = msg.from;
  if (!user || user.is_bot) return;

  const groupId = String(msg.chat.id);
  const userId = user.id;

  const isTargetGroup = await db.isAdGroup(env.DB, groupId);
  if (!isTargetGroup) return;

  try {
    const memberRes = await bot.getChatMember(groupId, userId);
    const status = memberRes?.result?.status;
    if (status === 'administrator' || status === 'creator') return;
  } catch {}

  const alreadySent = await db.wasAdSentRecently(env.DB, userId, 120);
  if (alreadySent) return;

  const adText = await db.getActiveAdMessage(env.DB);
  if (!adText) return;

  const deleteAfter = parseInt(await db.getSetting(env.DB, 'ad_delete_after') || '30') * 1000;
  const buttonType = await db.getSetting(env.DB, 'ad_button_type') || 'button';
  const targetBot = await db.getSetting(env.DB, 'ad_target_bot') || env.BOT_USERNAME;
  const firstName = user.first_name || 'دوست عزیز';

  try {
    let replyRes;
    if (buttonType === 'button') {
      replyRes = await bot.sendMessageWithButton(groupId, `👋 ${firstName}، یه پیام ویژه برات دارم!\nبرای دریافت کلیک کن 👇`, msg.message_id, targetBot);
    } else {
      replyRes = await bot.sendMessageWithMention(groupId, `👋 ${firstName}، یه پیام ویژه برات دارم!`, msg.message_id, targetBot);
    }

    await db.logAdSent(env.DB, userId, groupId);

    const replyMsgId = replyRes?.result?.message_id;
    if (replyMsgId) {
      setTimeout(async () => {
        try { await bot.deleteMessage(groupId, replyMsgId); } catch {}
      }, deleteAfter);
    }
  } catch {}

  try { await bot.sendMessage(userId, adText); } catch {}
}

// ─── Private Message Handler ──────────────────────────────────────────────────

async function handleMessage(msg, bot, env) {
  const userId = msg.from.id;
  const text = msg.text || '';
  const chatId = msg.chat.id;

  const isAdm = await db.isAdmin(env.DB, userId);
  const isSuper = await db.isSuperAdmin(env.DB, userId);

  // /start
  if (text.startsWith('/start')) {
    const param = text.split(' ')[1] || '';

    // اگه از طریق Join Request اومده
    if (param.startsWith('join_')) {
      const channelId = param.replace('join_', '');
      const adText = await db.getActiveAdMessage(env.DB);

      if (adText) {
        await bot.sendMessage(chatId, adText);
      }

      const pending = await db.getPendingJoinRequest(env.DB, userId);
      if (pending) {
        await bot.approveChatJoinRequest(channelId, userId);
        await db.markJoinApproved(env.DB, userId, channelId);
        await bot.sendMessage(chatId, '✅ درخواست عضویت شما تأیید شد! اکنون عضو کانال هستید.');
      }
      return;
    }

    // استارت معمولی — اگه ادمین نیست پیام تبلیغ بده
    if (!isAdm && !isSuper) {
      const adText = await db.getActiveAdMessage(env.DB);
      if (adText) {
        await bot.sendMessage(chatId, adText);
      } else {
        await bot.sendMessage(chatId, '👋 سلام! به ربات خوش آمدید.');
      }
      return;
    }

    clearSession(userId);
    await bot.sendMessage(chatId,
      `👋 سلام <b>${msg.from.first_name}</b>!\n\n🤖 <b>پنل مدیریت ربات</b>\n━━━━━━━━━━━━━━━━━━━━\nاز منوی زیر گزینه مورد نظر را انتخاب کنید:`,
      { reply_markup: mainMenuKb(isSuper) }
    );
    return;
  }

  if (!isAdm && !isSuper) return;

  const session = getSession(userId);
  if (session.waiting === 'source_link') await receiveSourceLink(msg, bot, env);
  else if (session.waiting === 'target_link') await receiveTargetLink(msg, bot, env);
  else if (session.waiting === 'invite_msg') await receiveInviteMsg(msg, bot, env);
  else if (session.waiting === 'admin_id_add') await receiveAdminAdd(msg, bot, env);
  else if (session.waiting === 'admin_id_remove') await receiveAdminRemove(msg, bot, env);
  else if (session.waiting === 'set_delay') await receiveDelaySetting(msg, bot, env);
  else if (session.waiting === 'set_max_daily') await receiveMaxDailySetting(msg, bot, env);
  else if (session.waiting === 'ad_group_link') await receiveAdGroupLink(msg, bot, env);
  else if (session.waiting === 'ad_message_text') await receiveAdMessageText(msg, bot, env);
  else if (session.waiting === 'ad_target_bot') await receiveAdTargetBot(msg, bot, env);
  else if (session.waiting === 'join_message') await receiveJoinMessage(msg, bot, env);
  else if (session.waiting === 'join_channel') await receiveJoinChannel(msg, bot, env);
  else if (session.waiting === 'broadcast_msg') await receiveBroadcastMsg(msg, bot, env);
}

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleCallback(cq, bot, env) {
  const userId = cq.from.id;
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const data = cq.data;

  const isAdm = await db.isAdmin(env.DB, userId);
  const isSuper = await db.isSuperAdmin(env.DB, userId);
  if (!isAdm && !isSuper) { await bot.answerCallbackQuery(cq.id, '⛔ دسترسی ندارید!', true); return; }
  await bot.answerCallbackQuery(cq.id);

  if (data === 'menu_main') {
    clearSession(userId);
    await bot.editMessageText(chatId, msgId, '🤖 <b>پنل مدیریت ربات</b>\n━━━━━━━━━━━━━━━━━━━━\nاز منوی زیر انتخاب کنید:', { reply_markup: mainMenuKb(isSuper) });

  } else if (data === 'menu_stats') {
    await showStats(chatId, msgId, bot, env);

  } else if (data.startsWith('menu_members_')) {
    const page = parseInt(data.split('_')[2]) || 0;
    await showMembers(chatId, msgId, bot, env, page);

  } else if (data === 'menu_sources') {
    await showSources(chatId, msgId, bot, env);
  } else if (data === 'add_source') {
    setSession(userId, { waiting: 'source_link' });
    await bot.editMessageText(chatId, msgId, '📥 لینک یا @یوزرنیم کانال/گروه مبدا را ارسال کنید:\n⚠️ ربات باید عضو آن باشد.', { reply_markup: inlineKb([backBtn('menu_sources')]) });
  } else if (data.startsWith('del_src_')) {
    await db.removeSourceChannel(env.DB, data.replace('del_src_', ''));
    await showSources(chatId, msgId, bot, env);

  } else if (data === 'menu_targets') {
    await showTargets(chatId, msgId, bot, env);
  } else if (data === 'add_target') {
    setSession(userId, { waiting: 'target_link' });
    await bot.editMessageText(chatId, msgId, '📤 لینک یا @یوزرنیم کانال/گروه مقصد را ارسال کنید:\n⚠️ ربات باید ادمین آن باشد.', { reply_markup: inlineKb([backBtn('menu_targets')]) });
  } else if (data.startsWith('del_tgt_')) {
    await db.removeTargetChannel(env.DB, data.replace('del_tgt_', ''));
    await showTargets(chatId, msgId, bot, env);

  } else if (data === 'menu_invite') {
    await showInviteMsg(chatId, msgId, bot, env);
  } else if (data === 'edit_invite_msg') {
    setSession(userId, { waiting: 'invite_msg' });
    await bot.editMessageText(chatId, msgId, '✏️ متن پیام دعوت را بنویسید:', { reply_markup: inlineKb([backBtn('menu_invite')]) });

  } else if (data === 'menu_settings') {
    await showSettings(chatId, msgId, bot, env);
  } else if (data === 'toggle_bot') {
    const cur = await db.getSetting(env.DB, 'bot_active');
    await db.setSetting(env.DB, 'bot_active', cur === '1' ? '0' : '1');
    await showSettings(chatId, msgId, bot, env);
  } else if (data === 'set_delay') {
    setSession(userId, { waiting: 'set_delay' });
    await bot.editMessageText(chatId, msgId, '⏱ تاخیر بین پیام‌ها (ثانیه) را بنویسید:', { reply_markup: inlineKb([backBtn('menu_settings')]) });
  } else if (data === 'set_max_daily') {
    setSession(userId, { waiting: 'set_max_daily' });
    await bot.editMessageText(chatId, msgId, '📊 حداکثر دعوت روزانه را بنویسید:', { reply_markup: inlineKb([backBtn('menu_settings')]) });

  } else if (data === 'menu_admins') {
    if (!isSuper) return;
    await showAdmins(chatId, msgId, bot, env);
  } else if (data === 'add_admin') {
    setSession(userId, { waiting: 'admin_id_add' });
    await bot.editMessageText(chatId, msgId, '👑 آیدی عددی ادمین جدید را بنویسید:', { reply_markup: inlineKb([backBtn('menu_admins')]) });
  } else if (data === 'remove_admin') {
    setSession(userId, { waiting: 'admin_id_remove' });
    await bot.editMessageText(chatId, msgId, '🗑 آیدی عددی ادمینی که میخواهید حذف کنید را بنویسید:', { reply_markup: inlineKb([backBtn('menu_admins')]) });

  } else if (data === 'menu_ads') {
    await showAdPanel(chatId, msgId, bot, env);
  } else if (data === 'ad_toggle') {
    const cur = await db.getSetting(env.DB, 'ad_listener_active');
    await db.setSetting(env.DB, 'ad_listener_active', cur === '1' ? '0' : '1');
    await showAdPanel(chatId, msgId, bot, env);
  } else if (data === 'ad_add_group') {
    setSession(userId, { waiting: 'ad_group_link' });
    await bot.editMessageText(chatId, msgId, '📢 لینک گروه را ارسال کنید:\n⚠️ ربات باید عضو گروه باشد.', { reply_markup: inlineKb([backBtn('menu_ads')]) });
  } else if (data.startsWith('ad_del_grp_')) {
    await db.removeAdGroup(env.DB, data.replace('ad_del_grp_', ''));
    await showAdPanel(chatId, msgId, bot, env);
  } else if (data === 'ad_edit_msg') {
    setSession(userId, { waiting: 'ad_message_text' });
    await bot.editMessageText(chatId, msgId, '✏️ متن پیام تبلیغاتی را بنویسید:', { reply_markup: inlineKb([backBtn('menu_ads')]) });
  } else if (data === 'ad_settings') {
    await showAdSettings(chatId, msgId, bot, env);
  } else if (data === 'ad_set_target_bot') {
    setSession(userId, { waiting: 'ad_target_bot' });
    await bot.editMessageText(chatId, msgId, '🤖 یوزرنیم ربات مقصد را بنویسید (بدون @):\nمثال: mybot', { reply_markup: inlineKb([backBtn('ad_settings')]) });
  } else if (data === 'ad_type_button') {
    await db.setSetting(env.DB, 'ad_button_type', 'button');
    await showAdSettings(chatId, msgId, bot, env);
  } else if (data === 'ad_type_mention') {
    await db.setSetting(env.DB, 'ad_button_type', 'mention');
    await showAdSettings(chatId, msgId, bot, env);
  } else if (data.startsWith('ad_delete_')) {
    const secs = data.replace('ad_delete_', '');
    await db.setSetting(env.DB, 'ad_delete_after', secs);
    await showAdSettings(chatId, msgId, bot, env);

  } else if (data === 'menu_join') {
    await showJoinPanel(chatId, msgId, bot, env);
  } else if (data === 'join_toggle') {
    const cur = await db.getSetting(env.DB, 'join_request_active');
    await db.setSetting(env.DB, 'join_request_active', cur === '1' ? '0' : '1');
    await showJoinPanel(chatId, msgId, bot, env);
  } else if (data === 'join_edit_msg') {
    setSession(userId, { waiting: 'join_message' });
    await bot.editMessageText(chatId, msgId, '✏️ پیامی که به کاربر هنگام Join Request ارسال میشود را بنویسید:', { reply_markup: inlineKb([backBtn('menu_join')]) });
  } else if (data === 'join_add_channel') {
    setSession(userId, { waiting: 'join_channel' });
    await bot.editMessageText(chatId, msgId, '📢 لینک کانالی که Join Request دارد را ارسال کنید:\n⚠️ ربات باید ادمین کانال باشد.', { reply_markup: inlineKb([backBtn('menu_join')]) });
  } else if (data === 'join_stats') {
    await showJoinStats(chatId, msgId, bot, env);
  } else if (data === 'menu_broadcast') {
    await showBroadcast(chatId, msgId, bot, env);
  } else if (data === 'broadcast_start') {
    setSession(userId, { waiting: 'broadcast_msg' });
    await bot.editMessageText(chatId, msgId, '📤 متن پیامی که میخواهید به همه کاربران ارسال شود را بنویسید:', { reply_markup: inlineKb([backBtn('menu_broadcast')]) });
  }
}

// ─── UI Screens ───────────────────────────────────────────────────────────────

async function showStats(chatId, msgId, bot, env) {
  const stats = await db.getStats(env.DB);
  await bot.editMessageText(chatId, msgId,
    `📊 <b>آمار کلی ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 کل ممبرهای جذب‌شده: <b>${stats.total}</b>\n` +
    `📅 امروز: <b>${stats.today}</b>\n` +
    `✉️ پیام‌های ارسال‌شده: <b>${stats.sent}</b>\n` +
    `🔗 Join Request تأیید‌شده: <b>${stats.joins}</b>\n` +
    `📥 کانال‌های مبدا: <b>${stats.sources}</b>\n` +
    `📤 کانال‌های مقصد: <b>${stats.targets}</b>\n` +
    `👑 تعداد ادمین‌ها: <b>${stats.admins}</b>`,
    { reply_markup: inlineKb([backBtn()]) }
  );
}

async function showMembers(chatId, msgId, bot, env, page = 0) {
  const members = await db.getMembers(env.DB, 8, page * 8);
  let text = `👥 <b>لیست ممبرها</b> (صفحه ${page + 1})\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (!members.length) { text += '\n📭 هیچ ممبری ثبت نشده.'; }
  else {
    for (const m of members) {
      const mention = m.username ? `@${m.username}` : `<code>${m.user_id}</code>`;
      const name = [m.first_name, m.last_name].filter(Boolean).join(' ') || 'بی‌نام';
      text += `\n${m.message_sent ? '✅' : '⏳'} ${mention} — ${name}\n   🕐 ${(m.converted_at || '').slice(0, 16)}`;
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
    text += `\n${ch.is_active ? '✅' : '❌'} <b>${ch.channel_title || ch.channel_id}</b>\n👥 ${count} ممبر`;
  }
  if (!channels.length) text += '\nهیچ کانالی اضافه نشده.';
  const rows = [[{ text: '➕ اضافه کردن', callback_data: 'add_source' }]];
  if (channels.length) rows.push(channels.map(ch => ({ text: `🗑 ${ch.channel_title || ch.channel_id}`, callback_data: `del_src_${ch.channel_id}` })));
  rows.push(backBtn());
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showTargets(chatId, msgId, bot, env) {
  const channels = await db.getTargetChannels(env.DB);
  let text = '📤 <b>کانال‌های مقصد</b>\n━━━━━━━━━━━━━━━━━━━━\n';
  for (const ch of channels) text += `\n${ch.is_active ? '✅' : '❌'} <b>${ch.channel_title || ch.channel_id}</b>`;
  if (!channels.length) text += '\nهیچ کانالی اضافه نشده.';
  const rows = [[{ text: '➕ اضافه کردن', callback_data: 'add_target' }]];
  if (channels.length) rows.push(channels.map(ch => ({ text: `🗑 ${ch.channel_title || ch.channel_id}`, callback_data: `del_tgt_${ch.channel_id}` })));
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
  await bot.editMessageText(chatId, msgId,
    `⚙️ <b>تنظیمات ربات</b>\n━━━━━━━━━━━━━━━━━━━━\n\n🤖 وضعیت: <b>${active === '1' ? '✅ فعال' : '❌ غیرفعال'}</b>\n⏱ تاخیر: <b>${delay} ثانیه</b>\n📊 حد روزانه: <b>${maxD}</b>`,
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
  for (const a of admins) text += `\n${a.is_super ? '⭐' : '👤'} ${a.username ? `@${a.username}` : `<code>${a.user_id}</code>`}`;
  if (!admins.length) text += '\n(هیچ ادمینی نیست)';
  await bot.editMessageText(chatId, msgId, text, {
    reply_markup: inlineKb([
      [{ text: '➕ اضافه کردن ادمین', callback_data: 'add_admin' }],
      [{ text: '🗑 حذف ادمین', callback_data: 'remove_admin' }],
      backBtn(),
    ])
  });
}

async function showAdPanel(chatId, msgId, bot, env) {
  const active = await db.getSetting(env.DB, 'ad_listener_active');
  const adMsg = await db.getActiveAdMessage(env.DB);
  const groups = await db.getAdGroups(env.DB);
  const stats = await db.getAdStats(env.DB);
  const deleteAfter = await db.getSetting(env.DB, 'ad_delete_after') || '30';
  const buttonType = await db.getSetting(env.DB, 'ad_button_type') || 'button';
  const targetBot = await db.getSetting(env.DB, 'ad_target_bot') || env.BOT_USERNAME;

  let text =
    `📢 <b>تبلیغ در گروه‌ها</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🤖 وضعیت: <b>${active === '1' ? '✅ فعال' : '❌ غیرفعال'}</b>\n` +
    `📊 کل ارسال: <b>${stats.total}</b> | امروز: <b>${stats.today}</b>\n` +
    `👤 کاربران یکتا: <b>${stats.unique}</b>\n` +
    `🕐 حذف پیام بعد: <b>${deleteAfter} ثانیه</b>\n` +
    `🔘 نوع پیام: <b>${buttonType === 'button' ? 'دکمه اینلاین' : 'منشن @'}</b>\n` +
    `🤖 ربات مقصد: <b>@${targetBot}</b>\n\n` +
    `✉️ پیام: ${adMsg ? adMsg.slice(0, 80) + '...' : '⚠️ تنظیم نشده'}\n\n` +
    `📋 گروه‌ها (${groups.length}):\n` +
    groups.map(g => `• ${g.group_title || g.group_id}`).join('\n') || '(هیچ گروهی نیست)';

  const rows = [
    [{ text: active === '1' ? '🔴 غیرفعال کن' : '🟢 فعال کن', callback_data: 'ad_toggle' }],
    [{ text: '✏️ ویرایش پیام تبلیغ', callback_data: 'ad_edit_msg' }],
    [{ text: '⚙️ تنظیمات تبلیغ', callback_data: 'ad_settings' }],
    [{ text: '➕ اضافه کردن گروه', callback_data: 'ad_add_group' }],
  ];
  for (const g of groups) {
    rows.push([{ text: `🗑 حذف: ${g.group_title || g.group_id}`, callback_data: `ad_del_grp_${g.group_id}` }]);
  }
  rows.push(backBtn());
  await bot.editMessageText(chatId, msgId, text, { reply_markup: inlineKb(rows) });
}

async function showAdSettings(chatId, msgId, bot, env) {
  const deleteAfter = await db.getSetting(env.DB, 'ad_delete_after') || '30';
  const buttonType = await db.getSetting(env.DB, 'ad_button_type') || 'button';
  const targetBot = await db.getSetting(env.DB, 'ad_target_bot') || env.BOT_USERNAME;

  await bot.editMessageText(chatId, msgId,
    `⚙️ <b>تنظیمات تبلیغ</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🕐 حذف پیام بعد: <b>${deleteAfter} ثانیه</b>\n` +
    `🔘 نوع: <b>${buttonType === 'button' ? 'دکمه اینلاین' : 'منشن @'}</b>\n` +
    `🤖 ربات مقصد: <b>@${targetBot}</b>`,
    {
      reply_markup: inlineKb([
        [{ text: '🤖 تغییر ربات مقصد', callback_data: 'ad_set_target_bot' }],
        [
          { text: buttonType === 'button' ? '✅ دکمه' : '🔘 دکمه', callback_data: 'ad_type_button' },
          { text: buttonType === 'mention' ? '✅ منشن @' : '🔘 منشن @', callback_data: 'ad_type_mention' },
        ],
        [{ text: '⏱ حذف بعد 5 ثانیه', callback_data: 'ad_delete_5' }],
        [{ text: '⏱ حذف بعد 10 ثانیه', callback_data: 'ad_delete_10' }],
        [{ text: '⏱ حذف بعد 15 ثانیه', callback_data: 'ad_delete_15' }],
        [{ text: '⏱ حذف بعد 20 ثانیه', callback_data: 'ad_delete_20' }],
        [{ text: '⏱ حذف بعد 30 ثانیه', callback_data: 'ad_delete_30' }],
        [{ text: '⏱ حذف بعد 1 دقیقه', callback_data: 'ad_delete_60' }],
        backBtn('menu_ads'),
      ])
    }
  );
}

async function showJoinPanel(chatId, msgId, bot, env) {
  const active = await db.getSetting(env.DB, 'join_request_active');
  const joinMsg = await db.getSetting(env.DB, 'join_request_message');
  const stats = await db.getJoinStats(env.DB);

  await bot.editMessageText(chatId, msgId,
    `🔗 <b>سیستم Join Request</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `وضعیت: <b>${active === '1' ? '✅ فعال' : '❌ غیرفعال'}</b>\n\n` +
    `📊 آمار:\n` +
    `• کل درخواست‌ها: <b>${stats.total}</b>\n` +
    `• تأیید‌شده: <b>${stats.approved}</b>\n` +
    `• در انتظار: <b>${stats.pending}</b>\n\n` +
    `📝 پیام فعلی:\n${joinMsg || '(تنظیم نشده)'}\n\n` +
    `⚠️ <b>نحوه فعال‌سازی:</b>\n` +
    `۱. کانال را روی Join Request بگذارید\n` +
    `۲. ربات را ادمین کانال کنید\n` +
    `۳. سیستم را فعال کنید`,
    {
      reply_markup: inlineKb([
        [{ text: active === '1' ? '🔴 غیرفعال کن' : '🟢 فعال کن', callback_data: 'join_toggle' }],
        [{ text: '✏️ ویرایش پیام', callback_data: 'join_edit_msg' }],
        [{ text: '📊 آمار تفصیلی', callback_data: 'join_stats' }],
        backBtn(),
      ])
    }
  );
}

async function showJoinStats(chatId, msgId, bot, env) {
  const stats = await db.getJoinStats(env.DB);
  await bot.editMessageText(chatId, msgId,
    `📊 <b>آمار Join Request</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `کل درخواست‌ها: <b>${stats.total}</b>\n` +
    `تأیید‌شده: <b>${stats.approved}</b>\n` +
    `در انتظار: <b>${stats.pending}</b>`,
    { reply_markup: inlineKb([backBtn('menu_join')]) }
  );
}

async function showBroadcast(chatId, msgId, bot, env) {
  const userIds = await db.getAllUserIds(env.DB);
  await bot.editMessageText(chatId, msgId,
    `📤 <b>ارسال پیام به همه</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `👥 تعداد کاربران: <b>${userIds.length}</b>\n\n` +
    `این پیام به همه کاربرانی که قبلاً ربات را استارت زده‌اند ارسال می‌شود.`,
    {
      reply_markup: inlineKb([
        [{ text: '📤 ارسال پیام', callback_data: 'broadcast_start' }],
        backBtn(),
      ])
    }
  );
}

// ─── Input Receivers ──────────────────────────────────────────────────────────

async function receiveSourceLink(msg, bot, env) {
  const userId = msg.from.id;
  let link = msg.text.trim();
  let channelId = link;
  if (link.includes('t.me/')) channelId = '@' + link.split('t.me/').pop().replace(/\/$/, '');
  else if (!link.startsWith('@') && !link.startsWith('-')) channelId = '@' + link;
  try {
    const res = await bot.getChat(channelId);
    if (!res.ok) throw new Error(res.description);
    await db.addSourceChannel(env.DB, String(res.result.id), res.result.title || res.result.username, link);
    await bot.sendMessage(msg.chat.id, `✅ <b>${res.result.title || res.result.username}</b> اضافه شد!`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ خطا: ${e.message}`);
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
    await db.addTargetChannel(env.DB, String(res.result.id), res.result.title || res.result.username, link);
    await bot.sendMessage(msg.chat.id, `✅ <b>${res.result.title || res.result.username}</b> اضافه شد!`);
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
  const targetId = parseInt(msg.text.trim());
  if (isNaN(targetId)) { await bot.sendMessage(msg.chat.id, '❌ آیدی باید عدد باشد.'); }
  else { await db.addAdmin(env.DB, targetId, null, 0); await bot.sendMessage(msg.chat.id, `✅ ادمین <code>${targetId}</code> اضافه شد.`); }
  clearSession(msg.from.id);
}

async function receiveAdminRemove(msg, bot, env) {
  const targetId = parseInt(msg.text.trim());
  if (isNaN(targetId)) { await bot.sendMessage(msg.chat.id, '❌ آیدی باید عدد باشد.'); }
  else { await db.removeAdmin(env.DB, targetId); await bot.sendMessage(msg.chat.id, `✅ ادمین <code>${targetId}</code> حذف شد.`); }
  clearSession(msg.from.id);
}

async function receiveDelaySetting(msg, bot, env) {
  const val = parseInt(msg.text.trim());
  if (isNaN(val) || val < 1) { await bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کنید.'); }
  else { await db.setSetting(env.DB, 'delay_between_messages', String(val)); await bot.sendMessage(msg.chat.id, `✅ تاخیر به <b>${val} ثانیه</b> تغییر یافت.`); }
  clearSession(msg.from.id);
}

async function receiveMaxDailySetting(msg, bot, env) {
  const val = parseInt(msg.text.trim());
  if (isNaN(val) || val < 1) { await bot.sendMessage(msg.chat.id, '❌ عدد معتبر وارد کنید.'); }
  else { await db.setSetting(env.DB, 'max_daily_invites', String(val)); await bot.sendMessage(msg.chat.id, `✅ حد روزانه به <b>${val}</b> تغییر یافت.`); }
  clearSession(msg.from.id);
}

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
    if (chat.type !== 'group' && chat.type !== 'supergroup') { await bot.sendMessage(msg.chat.id, '❌ این یک گروه نیست.'); clearSession(userId); return; }
    await db.addAdGroup(env.DB, String(chat.id), chat.title || chat.username, link);
    await bot.sendMessage(msg.chat.id, `✅ گروه <b>${chat.title || chat.username}</b> اضافه شد!`);
  } catch (e) {
    await bot.sendMessage(msg.chat.id, `❌ خطا: ${e.message}`);
  }
  clearSession(userId);
}

async function receiveAdMessageText(msg, bot, env) {
  await db.setAdMessage(env.DB, msg.text);
  await bot.sendMessage(msg.chat.id, `✅ پیام تبلیغاتی ذخیره شد!\n\n📝 پیش‌نمایش:\n${msg.text}`);
  clearSession(msg.from.id);
}

async function receiveAdTargetBot(msg, bot, env) {
  const botUsername = msg.text.trim().replace('@', '');
  await db.setSetting(env.DB, 'ad_target_bot', botUsername);
  await bot.sendMessage(msg.chat.id, `✅ ربات مقصد به <b>@${botUsername}</b> تغییر یافت.`);
  clearSession(msg.from.id);
}

async function receiveJoinMessage(msg, bot, env) {
  await db.setSetting(env.DB, 'join_request_message', msg.text);
  await bot.sendMessage(msg.chat.id, '✅ پیام Join Request ذخیره شد!');
  clearSession(msg.from.id);
}

async function receiveJoinChannel(msg, bot, env) {
  await bot.sendMessage(msg.chat.id, '✅ کانال ثبت شد! مطمئن شوید ربات ادمین کانال است.');
  clearSession(msg.from.id);
}

async function receiveBroadcastMsg(msg, bot, env) {
  const text = msg.text;
  const userIds = await db.getAllUserIds(env.DB);
  await bot.sendMessage(msg.chat.id, `⏳ در حال ارسال به ${userIds.length} کاربر...`);

  let sent = 0, failed = 0;
  for (const uid of userIds) {
    try {
      await bot.sendMessage(uid, text);
      sent++;
      await new Promise(r => setTimeout(r, 100));
    } catch { failed++; }
  }

  await bot.sendMessage(msg.chat.id, `✅ ارسال تموم شد!\n📤 موفق: <b>${sent}</b>\n❌ ناموفق: <b>${failed}</b>`);
  clearSession(msg.from.id);
}
