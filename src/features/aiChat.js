// ─── AI Chat ──────────────────────────────────────────────────────────────────
import * as db from '../db.js';

export async function startAIChat(bot, DB, chatId, userId, node) {
  const aiSettings = await db.getAISettings(DB);
  if (!aiSettings.apiKey || !aiSettings.baseUrl) {
    await bot.sendMessage(chatId, '⚠️ هوش مصنوعی تنظیم نشده. لطفاً با ادمین تماس بگیرید.');
    return;
  }
  await db.setSession(DB, userId, {
    type: 'ai_chat',
    nodeId: node.id,
    parentId: node.parent_id||'root',
    history: []
  });
  await bot.sendMessage(chatId,
    `🤖 <b>هوش مصنوعی</b>\n\nسلام! چطور می‌تونم کمکتون کنم؟\n\nبرای پایان دادن به گفتگو از دکمه زیر استفاده کنید.`,
    {reply_markup:{inline_keyboard:[[{text:'❌ پایان گفتگو',callback_data:`ai_end:${node.parent_id||'root'}`}]]}}
  );
}

export async function handleAIChatText(bot, DB, chatId, userId, text) {
  const session = await db.getSession(DB, userId);
  if (!session || session.type !== 'ai_chat') return false;

  const aiSettings = await db.getAISettings(DB);
  if (!aiSettings.apiKey || !aiSettings.baseUrl) return false;

  // Typing indicator
  await bot.call('sendChatAction', {chat_id: chatId, action: 'typing'});

  session.history.push({role:'user', content:text});

  try {
    const res = await fetch(`${aiSettings.baseUrl}/chat/completions`, {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: aiSettings.model || 'gpt-3.5-turbo',
        messages: [
          {role:'system', content: aiSettings.systemPrompt || 'شما یک دستیار هوشمند فارسی زبان هستید.'},
          ...session.history
        ],
        max_tokens: 1000,
      })
    });

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || '❌ پاسخی دریافت نشد.';
    session.history.push({role:'assistant', content:reply});

    // Keep last 10 messages
    if (session.history.length > 10) session.history = session.history.slice(-10);
    await db.setSession(DB, userId, session);

    await bot.sendMessage(chatId, reply,
      {reply_markup:{inline_keyboard:[[{text:'❌ پایان گفتگو',callback_data:`ai_end:${session.parentId}`}]]}}
    );
  } catch {
    await bot.sendMessage(chatId, '❌ خطا در ارتباط با هوش مصنوعی.');
  }
  return true;
}
