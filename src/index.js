/**
 * ربات جامع تلگرام — Cloudflare Worker + D1
 * شامل: منوی داینامیک، فرم، هوش مصنوعی، سوال ناشناس، گیت دسترسی، جذب ممبر
 */

import { tg } from './utils/telegram.js';
import * as db from './db.js';
import * as menu from './features/menu.js';
import * as forms from './features/forms.js';
import * as anonQA from './features/anonQA.js';
import * as aiChat from './features/aiChat.js';
import * as gate from './features/accessGate.js';
import * as attract from './features/attract.js';
import * as admin from './admin/panel.js';

const SESSION = new Map();
function getSession(uid) { return SESSION.get(uid)||{}; }
function setSession(uid,d) { SESSION.set(uid,{...getSession(uid),...d}); }
function clearSession(uid) { SESSION.delete(uid); }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/setup') {
      const bot = tg(env.BOT_TOKEN);
      const webhookUrl = `${env.WORKER_URL}/webhook/${env.BOT_SECRET}`;
      const res = await bot.setWebhook(webhookUrl, env.BOT_SECRET);
      return new Response(JSON.stringify({webhookUrl, res}, null, 2), {headers:{'Content-Type':'application/json'}});
    }

    if (url.pathname === `/webhook/${env.BOT_SECRET}` && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch(e) { console.error(e); }
      return new Response('OK');
    }

    return new Response('🤖 Bot is running!');
  }
};

async function handleUpdate(update, env) {
  const bot = tg(env.BOT_TOKEN);
  const DB = env.DB;
  const superAdminId = parseInt(env.SUPER_ADMIN_ID||'0');

  // Join Request
  if (update.chat_join_request) {
    await attract.handleJoinRequest(update.chat_join_request, bot, DB);
    return;
  }

  // Group message
  if (update.message) {
    const chatType = update.message.chat.type;
    if (chatType==='group' || chatType==='supergroup') {
      await attract.handleGroupMessage(update.message, bot, DB);
      return;
    }
  }

  if (update.message) await handleMessage(update.message, bot, DB, env, superAdminId);
  else if (update.callback_query) await handleCallback(update.callback_query, bot, DB, env, superAdminId);
}

// ─── Message Handler ──────────────────────────────────────────────────────────

async function handleMessage(msg, bot, DB, env, superAdminId) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text||'';

  await db.saveUser(DB, msg.from);

  const isAdm = await db.isAdmin(DB, userId) || userId===superAdminId;
  const isSuper = await db.isSuperAdmin(DB, userId) || userId===superAdminId;

  // /start
  if (text.startsWith('/start')) {
    const param = text.split(' ')[1]||'';

    if (param.startsWith('join_')) {
      const channelId = param.replace('join_','');
      const adMsg = await db.getSetting(DB, 'ad_message');
      if (adMsg) try { await bot.sendMessage(chatId, adMsg); } catch {}
      const pending = await db.getPendingJoin(DB, userId);
      if (pending) {
        await bot.approveChatJoinRequest(channelId, userId);
        await db.markJoinApproved(DB, userId, channelId);
        await bot.sendMessage(chatId, '✅ درخواست عضویت شما تأیید شد!');
      }
      await showStartScreen(bot, DB, chatId, userId, isAdm);
      return;
    }

    if (!isAdm) {
      // Check gate
      const gateResult = await gate.checkGate(bot, DB, userId);
      if (!gateResult.passed) {
        await gate.showGateScreen(bot, DB, chatId, userId);
        return;
      }
      // Send ad message first
      const adMsg = await db.getSetting(DB, 'ad_message');
      if (adMsg) try { await bot.sendMessage(chatId, adMsg); } catch {}
    }

    await showStartScreen(bot, DB, chatId, userId, isAdm);
    return;
  }

  // /admin
  if (text==='/admin' && isAdm) {
    await admin.showHome(bot, chatId);
    return;
  }

  // /myid
  if (text==='/myid') {
    await bot.sendMessage(chatId, `🆔 آیدی شما: <code>${userId}</code>`);
    return;
  }

  // Admin reply to anon question
  if (msg.reply_to_message && isAdm) {
    if (await anonQA.handleAdminReply(bot, DB, chatId, msg.reply_to_message.message_id, text)) return;
  }

  // Session-based inputs
  const session = await db.getSession(DB, userId);

  if (session?.type === 'ai_chat') {
    if (await aiChat.handleAIChatText(bot, DB, chatId, userId, text)) return;
  }
  if (await forms.handleFormInput(bot, DB, chatId, userId, text, [])) return;
  if (await anonQA.handleAnonInput(bot, DB, chatId, userId, text, [])) return;

  if (isAdm) {
    // Admin session handlers
    if (session?.type==='admin_edit_title') {
      const nodeId = session.nodeId;
      const nodes = await db.getNodes(DB);
      const node = nodes[nodeId];
      if (node) { node.title=text; await db.saveNode(DB, node); }
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ عنوان ذخیره شد.');
      await admin.showNodeDetail(bot, DB, chatId, nodeId);
      return;
    }
    if (session?.type==='admin_edit_content') {
      const nodeId = session.nodeId;
      const nodes = await db.getNodes(DB);
      const node = nodes[nodeId];
      if (node) { node.content=text; await db.saveNode(DB, node); }
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ محتوا ذخیره شد.');
      await admin.showNodeDetail(bot, DB, chatId, nodeId);
      return;
    }
    if (session?.type==='admin_add_node') {
      const {parentId, nodeType} = session;
      const id = await db.genNodeId();
      let newNode = {id, parent_id:parentId, title:text, type:nodeType, enabled:true};
      if (nodeType==='link_url') { newNode.url=text.startsWith('http')?text:''; newNode.title='لینک جدید'; }
      await db.saveNode(DB, newNode);
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ دکمه اضافه شد.');
      await admin.showMenuList(bot, DB, chatId, parentId);
      return;
    }
    if (session?.type==='admin_gate_add') {
      let channelId = text.trim();
      if (channelId.includes('t.me/')) channelId='@'+channelId.split('t.me/').pop().replace(/\/$/,'');
      else if (!channelId.startsWith('@') && !channelId.startsWith('-')) channelId='@'+channelId;
      try {
        const res = await bot.getChat(channelId);
        if (!res.ok) throw new Error(res.description);
        let link = '';
        try { const lRes=await bot.exportChatInviteLink(res.result.id); link=lRes.result||''; } catch {}
        await db.addGateChannel(DB, String(res.result.id), res.result.title||res.result.username, link);
        await db.clearSession(DB, userId);
        await bot.sendMessage(chatId, `✅ کانال <b>${res.result.title}</b> اضافه شد.`);
        await admin.showGate(bot, DB, chatId);
      } catch(e) {
        await bot.sendMessage(chatId, `❌ خطا: ${e.message}`);
        await db.clearSession(DB, userId);
      }
      return;
    }
    if (session?.type==='admin_ai_field') {
      await db.setAISetting(DB, session.field, text.trim());
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ ذخیره شد.');
      await admin.showAISettings(bot, DB, chatId);
      return;
    }
    if (session?.type==='admin_attract_msg') {
      await db.setSetting(DB, 'ad_message', text);
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ پیام تبلیغاتی ذخیره شد.');
      await admin.showAttract(bot, DB, chatId);
      return;
    }
    if (session?.type==='admin_attract_target_bot') {
      await db.setSetting(DB, 'ad_target_bot', text.trim().replace('@',''));
      await db.clearSession(DB, userId);
      await bot.sendMessage(chatId, '✅ ربات مقصد ذخیره شد.');
      await admin.showAttract(bot, DB, chatId);
      return;
    }
    if (session?.type==='admin_attract_add_group') {
      let groupId = text.trim();
      if (groupId.includes('t.me/')) groupId='@'+groupId.split('t.me/').pop().replace(/\/$/,'');
      else if (!groupId.startsWith('@') && !groupId.startsWith('-')) groupId='@'+groupId;
      try {
        const res = await bot.getChat(groupId);
        if (!res.ok) throw new Error(res.description);
        const chat = res.result;
        if (chat.type!=='group' && chat.type!=='supergroup') {
          await bot.sendMessage(chatId, '❌ این یک گروه نیست.');
        } else {
          await db.addAdGroup(DB, String(chat.id), chat.title||chat.username);
          await bot.sendMessage(chatId, `✅ گروه <b>${chat.title}</b> اضافه شد.`);
        }
        await db.clearSession(DB, userId);
        await admin.showAttract(bot, DB, chatId);
      } catch(e) {
        await bot.sendMessage(chatId, `❌ خطا: ${e.message}`);
        await db.clearSession(DB, userId);
      }
      return;
    }
    if (session?.type==='admin_add_admin') {
      const targetId = parseInt(text.trim());
      if (isNaN(targetId)) { await bot.sendMessage(chatId,'❌ آیدی باید عدد باشد.'); }
      else { await db.addAdmin(DB, targetId, null, 0); await bot.sendMessage(chatId,`✅ ادمین <code>${targetId}</code> اضافه شد.`); }
      await db.clearSession(DB, userId);
      await admin.showAdmins(bot, DB, chatId);
      return;
    }
    if (session?.type==='admin_del_admin') {
      const targetId = parseInt(text.trim());
      if (!isNaN(targetId)) { await db.removeAdmin(DB, targetId); await bot.sendMessage(chatId,`✅ ادمین حذف شد.`); }
      await db.clearSession(DB, userId);
      await admin.showAdmins(bot, DB, chatId);
      return;
    }
    if (await admin.handleBroadcastInput(bot, DB, chatId, text)) return;
  }
}

async function showStartScreen(bot, DB, chatId, userId, isAdm) {
  if (isAdm) {
    await admin.showHome(bot, chatId);
    return;
  }
  await menu.sendMainMenu(bot, DB, chatId);
}

// ─── Callback Handler ─────────────────────────────────────────────────────────

async function handleCallback(cq, bot, DB, env, superAdminId) {
  const userId = cq.from.id;
  const chatId = cq.message.chat.id;
  const msgId = cq.message.message_id;
  const data = cq.data;

  await bot.answerCallbackQuery(cq.id);

  const isAdm = await db.isAdmin(DB, userId) || userId===superAdminId;
  const isSuper = await db.isSuperAdmin(DB, userId) || userId===superAdminId;

  // ─── Menu ───────────────────────────────────────────────────────────────────
  if (data.startsWith('menu:')) {
    const nodeId = data.replace('menu:','');
    await menu.openNode(bot, DB, chatId, userId, nodeId);
    return;
  }

  // ─── Gate Check ─────────────────────────────────────────────────────────────
  if (data==='gate_check') {
    const gateResult = await gate.checkGate(bot, DB, userId);
    if (gateResult.passed) {
      await bot.sendMessage(chatId, '✅ عضویت تأیید شد!');
      await menu.sendMainMenu(bot, DB, chatId);
    } else {
      await gate.showGateScreen(bot, DB, chatId, userId);
    }
    return;
  }

  // ─── AI End ─────────────────────────────────────────────────────────────────
  if (data.startsWith('ai_end:')) {
    await db.clearSession(DB, userId);
    await bot.sendMessage(chatId, '✅ گفتگو پایان یافت.');
    const parentId = data.replace('ai_end:','');
    await menu.openNode(bot, DB, chatId, userId, parentId);
    return;
  }

  // ─── Admin Panel ─────────────────────────────────────────────────────────────
  if (!isAdm) return;

  const [ns, ...rest] = data.split(':');

  if (ns==='adm') {
    const action = rest[0];

    if (action==='home') { await admin.showHome(bot, chatId); return; }
    if (action==='stats') { await admin.showStats(bot, DB, chatId); return; }
    if (action==='admins') { await admin.showAdmins(bot, DB, chatId); return; }
    if (action==='broadcast') { await admin.startBroadcast(bot, DB, chatId); return; }
    if (action==='gate') { await admin.showGate(bot, DB, chatId); return; }
    if (action==='ai') { await admin.showAISettings(bot, DB, chatId); return; }
    if (action==='attract') { await admin.showAttract(bot, DB, chatId); return; }
    if (action==='forms') { await showFormsPanel(bot, DB, chatId); return; }

    // Menu management
    if (action==='menu_list') { await admin.showMenuList(bot, DB, chatId, rest[1]||'root'); return; }
    if (action==='node') { await admin.showNodeDetail(bot, DB, chatId, rest.slice(1).join(':')); return; }
    if (action==='node_toggle') {
      const nodeId = rest.slice(1).join(':');
      const nodes = await db.getNodes(DB);
      const node = nodes[nodeId];
      if (node) { node.enabled = !node.enabled; await db.saveNode(DB, node); }
      await admin.showNodeDetail(bot, DB, chatId, nodeId);
      return;
    }
    if (action==='node_edit_title') {
      const nodeId = rest.slice(1).join(':');
      await db.setSession(DB, userId, {type:'admin_edit_title', nodeId});
      await bot.sendMessage(chatId, '✏️ عنوان جدید را بنویسید:');
      return;
    }
    if (action==='node_edit_content') {
      const nodeId = rest.slice(1).join(':');
      await db.setSession(DB, userId, {type:'admin_edit_content', nodeId});
      await bot.sendMessage(chatId, '📝 محتوای جدید را بنویسید:');
      return;
    }
    if (action==='node_del_confirm') {
      const nodeId = rest.slice(1).join(':');
      await bot.sendMessage(chatId, '⚠️ آیا مطمئنید؟',
        {reply_markup:{inline_keyboard:[
          [{text:'✅ بله، حذف کن', callback_data:`adm:node_del:${nodeId}`}],
          [{text:'❌ انصراف', callback_data:`adm:node:${nodeId}`}],
        ]}}
      );
      return;
    }
    if (action==='node_del') {
      const nodeId = rest.slice(1).join(':');
      const nodes = await db.getNodes(DB);
      const parentId = nodes[nodeId]?.parent_id||'root';
      await db.deleteNode(DB, nodeId);
      await bot.sendMessage(chatId, '✅ دکمه حذف شد.');
      await admin.showMenuList(bot, DB, chatId, parentId);
      return;
    }
    if (action==='node_add') {
      const parentId = rest.slice(1).join(':');
      await bot.sendMessage(chatId, '➕ نوع دکمه را انتخاب کنید:',
        {reply_markup:{inline_keyboard:[
          [{text:'📂 زیرمنو', callback_data:`adm:node_type:${parentId}:submenu`}],
          [{text:'📝 متن', callback_data:`adm:node_type:${parentId}:text`}],
          [{text:'🔗 لینک', callback_data:`adm:node_type:${parentId}:link_url`}],
          [{text:'📁 فایل', callback_data:`adm:node_type:${parentId}:file`}],
          [{text:'📋 فرم', callback_data:`adm:node_type:${parentId}:form`}],
          [{text:'❓ سوال ناشناس', callback_data:`adm:node_type:${parentId}:anon_qa`}],
          [{text:'🤖 هوش مصنوعی', callback_data:`adm:node_type:${parentId}:ai_chat`}],
          [{text:'🔙 بازگشت', callback_data:`adm:menu_list:${parentId}`}],
        ]}}
      );
      return;
    }
    if (action==='node_type') {
      const parentId = rest[1];
      const nodeType = rest[2];
      await db.setSession(DB, userId, {type:'admin_add_node', parentId, nodeType});
      await bot.sendMessage(chatId, `✏️ عنوان دکمه را بنویسید:`);
      return;
    }
    if (action==='node_files') {
      const nodeId = rest.slice(1).join(':');
      await bot.sendMessage(chatId, '📎 فایل جدید را ارسال کنید (عکس، ویدیو، سند):',
        {reply_markup:{inline_keyboard:[[{text:'🔙 بازگشت',callback_data:`adm:node:${nodeId}`}]]}}
      );
      await db.setSession(DB, userId, {type:'admin_add_file', nodeId});
      return;
    }

    // Gate
    if (action==='gate_add') {
      await db.setSession(DB, userId, {type:'admin_gate_add'});
      await bot.sendMessage(chatId, '📢 لینک یا @یوزرنیم کانال را ارسال کنید:');
      return;
    }
    if (action==='gate_del') {
      await db.removeGateChannel(DB, parseInt(rest[1]));
      await admin.showGate(bot, DB, chatId);
      return;
    }

    // AI
    if (action==='ai_url') { await db.setSession(DB, userId, {type:'admin_ai_field', field:'baseUrl'}); await bot.sendMessage(chatId,'🔗 Base URL را وارد کنید:'); return; }
    if (action==='ai_key') { await db.setSession(DB, userId, {type:'admin_ai_field', field:'apiKey'}); await bot.sendMessage(chatId,'🔑 API Key را وارد کنید:'); return; }
    if (action==='ai_model') { await db.setSession(DB, userId, {type:'admin_ai_field', field:'model'}); await bot.sendMessage(chatId,'🤖 نام مدل را وارد کنید (مثل gpt-4):'); return; }

    // Attract
    if (action==='attract_toggle_ad') {
      const cur = await db.getSetting(DB, 'ad_listener_active');
      await db.setSetting(DB, 'ad_listener_active', cur==='1'?'0':'1');
      await admin.showAttract(bot, DB, chatId);
      return;
    }
    if (action==='attract_toggle_join') {
      const cur = await db.getSetting(DB, 'join_request_active');
      await db.setSetting(DB, 'join_request_active', cur==='1'?'0':'1');
      await admin.showAttract(bot, DB, chatId);
      return;
    }
    if (action==='attract_edit_msg') {
      await db.setSession(DB, userId, {type:'admin_attract_msg'});
      await bot.sendMessage(chatId,'✏️ متن پیام تبلیغاتی را بنویسید:');
      return;
    }
    if (action==='attract_target_bot') {
      await db.setSession(DB, userId, {type:'admin_attract_target_bot'});
      await bot.sendMessage(chatId,'🤖 یوزرنیم ربات مقصد را بنویسید (بدون @):');
      return;
    }
    if (action==='attract_display') { await admin.showAttractDisplay(bot, DB, chatId); return; }
    if (action==='attract_type_btn') { await db.setSetting(DB,'ad_button_type','button'); await admin.showAttractDisplay(bot,DB,chatId); return; }
    if (action==='attract_type_mention') { await db.setSetting(DB,'ad_button_type','mention'); await admin.showAttractDisplay(bot,DB,chatId); return; }
    if (action==='attract_del') { await db.setSetting(DB,'ad_delete_after',rest[1]); await admin.showAttractDisplay(bot,DB,chatId); return; }
    if (action==='attract_add_group') {
      await db.setSession(DB, userId, {type:'admin_attract_add_group'});
      await bot.sendMessage(chatId,'➕ لینک یا @یوزرنیم گروه را ارسال کنید:');
      return;
    }
    if (action==='attract_groups') { await admin.showAttractGroups(bot,DB,chatId); return; }
    if (action==='attract_del_group') { await db.removeAdGroup(DB,parseInt(rest[1])); await admin.showAttractGroups(bot,DB,chatId); return; }

    // Admins
    if (action==='admin_add') { await db.setSession(DB,userId,{type:'admin_add_admin'}); await bot.sendMessage(chatId,'👑 آیدی عددی ادمین جدید را وارد کنید:'); return; }
    if (action==='admin_del') { await db.setSession(DB,userId,{type:'admin_del_admin'}); await bot.sendMessage(chatId,'🗑 آیدی عددی ادمین را وارد کنید:'); return; }
  }
}

async function showFormsPanel(bot, DB, chatId) {
  const forms = await db.getForms(DB);
  const rows = Object.values(forms).map(f=>[{text:`📝 ${f.title}`, callback_data:`adm:form_detail:${f.id}`}]);
  rows.push([{text:'🔙 بازگشت', callback_data:'adm:home'}]);
  await bot.sendMessage(chatId, '📝 <b>فرم‌ها</b>', {reply_markup:{inline_keyboard:rows}});
}
