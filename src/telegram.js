// ─── Telegram Bot API Wrapper ─────────────────────────────────────────────────

export function tg(token) {
  const base = `https://api.telegram.org/bot${token}`;

  async function call(method, body = {}) {
    const res = await fetch(`${base}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return {
    sendMessage: (chat_id, text, extra = {}) =>
      call('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra }),

    editMessageText: (chat_id, message_id, text, extra = {}) =>
      call('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra }),

    answerCallbackQuery: (callback_query_id, text = '', show_alert = false) =>
      call('answerCallbackQuery', { callback_query_id, text, show_alert }),

    getChat: (chat_id) => call('getChat', { chat_id }),

    getChatMember: (chat_id, user_id) => call('getChatMember', { chat_id, user_id }),

    getChatAdministrators: (chat_id) => call('getChatAdministrators', { chat_id }),

    exportChatInviteLink: (chat_id) => call('exportChatInviteLink', { chat_id }),

    approveChatJoinRequest: (chat_id, user_id) =>
      call('approveChatJoinRequest', { chat_id, user_id }),

    declineChatJoinRequest: (chat_id, user_id) =>
      call('declineChatJoinRequest', { chat_id, user_id }),

    deleteMessage: (chat_id, message_id) =>
      call('deleteMessage', { chat_id, message_id }),

    setWebhook: (url, secret_token) =>
      call('setWebhook', { url, secret_token, allowed_updates: ['message', 'callback_query', 'chat_join_request'] }),

    sendMessageWithButton: (chat_id, text, reply_to_message_id, targetBot) =>
      call('sendMessage', {
        chat_id, text,
        reply_to_message_id,
        reply_markup: {
          inline_keyboard: [[
            { text: '📩 دریافت پیام ویژه', url: `https://t.me/${targetBot}?start=hi` }
          ]]
        }
      }),

    sendMessageWithMention: (chat_id, text, reply_to_message_id, targetBot) =>
      call('sendMessage', {
        chat_id,
        text: `${text}\n\n👉 @${targetBot}`,
        reply_to_message_id,
      }),
  };
}

// ─── Keyboard Builders ────────────────────────────────────────────────────────

export function inlineKb(rows) {
  return { inline_keyboard: rows };
}

export function backBtn(cb = 'menu_main') {
  return [{ text: '🔙 بازگشت', callback_data: cb }];
}

export function mainMenuKb(isSuper = false) {
  const rows = [
    [
      { text: '📊 آمار کلی', callback_data: 'menu_stats' },
      { text: '👥 لیست ممبرها', callback_data: 'menu_members_0' },
    ],
    [
      { text: '📥 کانال‌های مبدا', callback_data: 'menu_sources' },
      { text: '📤 کانال‌های مقصد', callback_data: 'menu_targets' },
    ],
    [
      { text: '✉️ پیام دعوت', callback_data: 'menu_invite' },
      { text: '⚙️ تنظیمات', callback_data: 'menu_settings' },
    ],
    [{ text: '📢 تبلیغ در گروه‌ها', callback_data: 'menu_ads' }],
    [{ text: '🔗 سیستم Join Request', callback_data: 'menu_join' }],
  ];
  if (isSuper) rows.push([{ text: '👑 مدیریت ادمین‌ها', callback_data: 'menu_admins' }]);
  return inlineKb(rows);
}
