// ─── Menu System ──────────────────────────────────────────────────────────────
import * as db from '../db.js';
import { sendFileByType } from '../utils/telegram.js';
import { startForm } from './forms.js';
import { startAnonQA } from './anonQA.js';
import { startAIChat } from './aiChat.js';

export function buildKeyboard(nodes, node, includeBack=true) {
  const cols = node.columns===1 ? 1 : 2;
  const rows = [];
  const children = (node.children||[])
    .map(id => nodes[id])
    .filter(n => n && n.enabled);

  for (let i=0; i<children.length; i+=cols) {
    const row = [makeBtn(children[i])];
    if (cols===2 && children[i+1]) row.push(makeBtn(children[i+1]));
    rows.push(row);
  }
  if (includeBack && node.parent_id) {
    rows.push([{text:'🔙 بازگشت', callback_data:`menu:${node.parent_id}`}]);
  }
  return {inline_keyboard: rows};
}

function makeBtn(node) {
  if (node.type==='link_url' && node.url) return {text:node.title, url:node.url};
  return {text:node.title, callback_data:`menu:${node.id}`};
}

export async function openNode(bot, DB, chatId, userId, nodeId) {
  const nodes = await db.getNodes(DB);
  const node = nodes[nodeId];
  if (!node) return;

  if (node.type==='submenu') {
    await bot.sendMessage(chatId, `<b>${node.title}</b>`, {reply_markup: buildKeyboard(nodes, node)});
    return;
  }

  if (node.type==='text') {
    await bot.sendMessage(chatId,
      `<b>${node.title}</b>\n\n${node.content||'⚠️ محتوا تنظیم نشده.'}`,
      {reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:`menu:${node.parent_id||'root'}`}]]}}
    );
    return;
  }

  if (node.type==='link_url') {
    await bot.sendMessage(chatId, `<b>${node.title}</b>`,
      {reply_markup:{inline_keyboard:[[{text:'🔗 باز کردن لینک',url:node.url}],[{text:'🔙 بازگشت',callback_data:`menu:${node.parent_id||'root'}`}]]}}
    );
    return;
  }

  if (node.type==='file') {
    if (!node.files || !node.files.length) {
      await bot.sendMessage(chatId, '⚠️ فایلی برای این بخش تنظیم نشده.');
      return;
    }
    await bot.sendMessage(chatId, `📎 <b>${node.title}</b>`);
    for (const f of node.files) {
      await sendFileByType(bot, chatId, f.file_type, f.file_id);
    }
    return;
  }

  if (node.type==='form') {
    await startForm(bot, DB, chatId, userId, node.form_key||node.id, node.parent_id||'root');
    return;
  }

  if (node.type==='anon_qa') {
    await startAnonQA(bot, DB, chatId, userId);
    return;
  }

  if (node.type==='ai_chat') {
    await startAIChat(bot, DB, chatId, userId, node);
    return;
  }
}

export async function sendMainMenu(bot, DB, chatId) {
  const nodes = await db.getNodes(DB);
  const root = nodes['root'];
  if (!root) {
    await bot.sendMessage(chatId, '⚠️ منو تنظیم نشده.');
    return;
  }
  await bot.sendMessage(chatId, `<b>${root.title}</b>`, {reply_markup: buildKeyboard(nodes, root, false)});
}
