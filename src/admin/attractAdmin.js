// ---------------------------------------------------------------------------
// پنل ادمین جذب ممبر
// ---------------------------------------------------------------------------

import { backButton } from '../keyboards.js';

export async function showAttractHome(tg, store, chatId) {
  const adActive = await store.getShared('attract:ad_active', '0');
  const joinActive = await store.getShared('attract:join_active', '0');
  const adMsg = await store.getShared('attract:ad_message', null);
  const groups = await store.getShared('attract:groups', []);
  const targetBot = await store.getShared('attract:target_bot', '');
  const buttonType = await store.getShared('attract:button_type', 'button');
  const deleteAfter = await store.getShared('attract:delete_after', '30');

  const text =
    `🎯 <b>پنل جذب ممبر</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📢 تبلیغ در گروه: <b>${adActive === '1' ? '✅ فعال' : '❌ غیرفعال'}</b>\n` +
    `🔗 Join Request: <b>${joinActive === '1' ? '✅ فعال' : '❌ غیرفعال'}</b>\n` +
    `🤖 ربات مقصد: <b>${targetBot ? '@' + targetBot : '(تنظیم نشده)'}</b>\n` +
    `🔘 نوع پیام: <b>${buttonType === 'button' ? 'دکمه اینلاین' : 'منشن @'}</b>\n` +
    `🕐 حذف پیام بعد: <b>${deleteAfter} ثانیه</b>\n` +
    `📋 گروه‌ها: <b>${groups.length} گروه</b>\n\n` +
    `✉️ پیام تبلیغ:\n${adMsg ? adMsg.slice(0, 100) + (adMsg.length > 100 ? '...' : '') : '⚠️ تنظیم نشده'}`;

  await tg.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: adActive === '1' ? '🔴 غیرفعال کن تبلیغ' : '🟢 فعال کن تبلیغ', callback_data: 'attract:toggle_ad' },
        ],
        [
          { text: joinActive === '1' ? '🔴 غیرفعال Join' : '🟢 فعال Join', callback_data: 'attract:toggle_join' },
        ],
        [{ text: '✏️ ویرایش پیام تبلیغ', callback_data: 'attract:edit_msg' }],
        [{ text: '🤖 تغییر ربات مقصد', callback_data: 'attract:set_target_bot' }],
        [{ text: '⚙️ تنظیمات نمایش', callback_data: 'attract:display_settings' }],
        [{ text: '➕ اضافه کردن گروه', callback_data: 'attract:add_group' }],
        [{ text: '📋 لیست گروه‌ها', callback_data: 'attract:list_groups' }],
        [{ text: '📊 آمار جذب ممبر', callback_data: 'attract:stats' }],
        [{ text: '🔙 بازگشت', callback_data: 'admin:home' }],
      ]
    }
  });
}

export async function showDisplaySettings(tg, store, chatId) {
  const buttonType = await store.getShared('attract:button_type', 'button');
  const deleteAfter = await store.getShared('attract:delete_after', '30');

  await tg.sendMessage(chatId,
    `⚙️ <b>تنظیمات نمایش پیام</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `🔘 نوع فعلی: <b>${buttonType === 'button' ? 'دکمه اینلاین' : 'منشن @'}</b>\n` +
    `🕐 حذف بعد: <b>${deleteAfter} ثانیه</b>`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: buttonType === 'button' ? '✅ دکمه اینلاین' : '🔘 دکمه اینلاین', callback_data: 'attract:type_button' },
            { text: buttonType === 'mention' ? '✅ منشن @' : '🔘 منشن @', callback_data: 'attract:type_mention' },
          ],
          [{ text: '⏱ حذف بعد 5 ثانیه', callback_data: 'attract:del_5' }],
          [{ text: '⏱ حذف بعد 10 ثانیه', callback_data: 'attract:del_10' }],
          [{ text: '⏱ حذف بعد 15 ثانیه', callback_data: 'attract:del_15' }],
          [{ text: '⏱ حذف بعد 20 ثانیه', callback_data: 'attract:del_20' }],
          [{ text: '⏱ حذف بعد 30 ثانیه', callback_data: 'attract:del_30' }],
          [{ text: '⏱ حذف بعد 1 دقیقه', callback_data: 'attract:del_60' }],
          [{ text: '🔙 بازگشت', callback_data: 'attract:home' }],
        ]
      }
    }
  );
}

export async function showGroupList(tg, store, chatId) {
  const groups = await store.getShared('attract:groups', []);

  if (!groups.length) {
    await tg.sendMessage(chatId, '📋 هیچ گروهی اضافه نشده.', {
      reply_markup: backButton('attract:home')
    });
    return;
  }

  const rows = groups.map((g, i) => [
    { text: `🗑 ${g.title || g.id}`, callback_data: `attract:del_group_${i}` }
  ]);
  rows.push([{ text: '🔙 بازگشت', callback_data: 'attract:home' }]);

  await tg.sendMessage(chatId,
    `📋 <b>گروه‌های ثبت‌شده (${groups.length})</b>\n` +
    groups.map(g => `• ${g.title || g.id}`).join('\n'),
    { reply_markup: { inline_keyboard: rows } }
  );
}

export async function showStats(tg, store, chatId) {
  const adKeys = await store.list('ad_sent:');
  const joinKeys = await store.list('join:');

  await tg.sendMessage(chatId,
    `📊 <b>آمار جذب ممبر</b>\n━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📢 کل تبلیغ ارسال‌شده: <b>${adKeys.length}</b>\n` +
    `🔗 Join Request تأیید‌شده: <b>${joinKeys.length}</b>`,
    { reply_markup: backButton('attract:home') }
  );
}

// ─── Session Handlers ─────────────────────────────────────────────────────────

export async function startEditMsg(tg, store, chatId) {
  await store.setSession(chatId, { type: 'attract_edit_msg' });
  await tg.sendMessage(chatId,
    '✏️ متن پیام تبلیغاتی را بنویسید:\n\n(این پیام در گروه ریپلای میشه و همچنین برای کاربرانی که ربات را استارت زدن مستقیم ارسال میشه)',
    { reply_markup: backButton('attract:home') }
  );
}

export async function handleEditMsg(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== 'attract_edit_msg') return false;
  await store.setShared('attract:ad_message', text);
  await store.clearSession(chatId);
  await tg.sendMessage(chatId, '✅ پیام تبلیغاتی ذخیره شد!');
  await showAttractHome(tg, store, chatId);
  return true;
}

export async function startSetTargetBot(tg, store, chatId) {
  await store.setSession(chatId, { type: 'attract_set_target_bot' });
  await tg.sendMessage(chatId,
    '🤖 یوزرنیم ربات مقصد را بنویسید (بدون @):\nمثال: mybot',
    { reply_markup: backButton('attract:home') }
  );
}

export async function handleSetTargetBot(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== 'attract_set_target_bot') return false;
  const botUsername = text.trim().replace('@', '');
  await store.setShared('attract:target_bot', botUsername);
  await store.clearSession(chatId);
  await tg.sendMessage(chatId, `✅ ربات مقصد به @${botUsername} تغییر یافت.`);
  await showAttractHome(tg, store, chatId);
  return true;
}

export async function startAddGroup(tg, store, chatId) {
  await store.setSession(chatId, { type: 'attract_add_group' });
  await tg.sendMessage(chatId,
    '➕ لینک یا @یوزرنیم گروه را ارسال کنید:\nمثال: https://t.me/mygroup\n\n⚠️ ربات باید عضو گروه باشد.',
    { reply_markup: backButton('attract:home') }
  );
}

export async function handleAddGroup(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== 'attract_add_group') return false;

  let groupId = text.trim();
  if (groupId.includes('t.me/')) groupId = '@' + groupId.split('t.me/').pop().replace(/\/$/, '');
  else if (!groupId.startsWith('@') && !groupId.startsWith('-')) groupId = '@' + groupId;

  try {
    const res = await tg.call('getChat', { chat_id: groupId });
    if (!res.ok) throw new Error(res.description);
    const chat = res.result;
    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      await tg.sendMessage(chatId, '❌ این یک گروه نیست.');
      await store.clearSession(chatId);
      return true;
    }
    const groups = await store.getShared('attract:groups', []);
    if (!groups.find(g => g.id === String(chat.id))) {
      groups.push({ id: String(chat.id), title: chat.title || chat.username });
      await store.setShared('attract:groups', groups);
    }
    await store.clearSession(chatId);
    await tg.sendMessage(chatId, `✅ گروه <b>${chat.title || chat.username}</b> اضافه شد!`);
    await showAttractHome(tg, store, chatId);
  } catch (e) {
    await tg.sendMessage(chatId, `❌ خطا: ${e.message}`);
    await store.clearSession(chatId);
  }
  return true;
}
