/**
 * ربات جامع تلگرام — فاز ۱
 * همه قابلیت‌ها با Feature Flags
 */

import { tg, getFileFromMsg } from './utils/telegram.js';
import * as db from './db.js';
import * as menuFeat from './features/menu.js';
import * as forms from './features/forms.js';
import * as anonQA from './features/anonQA.js';
import * as aiChat from './features/aiChat.js';
import * as gate from './features/accessGate.js';
import * as attract from './features/attract.js';
import * as video from './features/videoLibrary.js';
import * as support from './features/support.js';
import * as pts from './features/points.js';
import * as poll from './features/poll.js';
import * as tags from './features/tags.js';
import * as scheduler from './features/scheduler.js';
import * as admin from './admin/panel.js';
import * as feat from './admin/features.js';
import * as videoAdm from './admin/videoAdmin.js';
import * as pollAdm from './admin/pollAdmin.js';
import * as schedAdm from './admin/schedulerAdmin.js';
import * as tagsAdm from './admin/tagsAdmin.js';

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
      try { const update = await request.json(); await handleUpdate(update, env); } catch(e) { console.error(e.message); }
      return new Response('OK');
    }
    return new Response('Bot is running!');
  },
  async scheduled(event, env) {
    const bot = tg(env.BOT_TOKEN);
    await scheduler.processScheduled(bot, env.DB);
  }
};

async function handleUpdate(update, env) {
  const bot = tg(env.BOT_TOKEN);
  const DB = env.DB;
  const superAdminId = parseInt(env.SUPER_ADMIN_ID || '0');

  if (update.chat_join_request) {
    if (await feat.isEnabled(DB, 'feature_join_request'))
      await attract.handleJoinRequest(update.chat_join_request, bot, DB);
    return;
  }

  if (update.message) {
    const t = update.message.chat.type;
    if (t === 'group' || t === 'supergroup') {
      if (await feat.isEnabled(DB, 'feature_attract'))
        await attract.handleGroupMessage(update.message, bot, DB);
      return;
    }
    await handleMessage(update.message, bot, DB, env, superAdminId);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query, bot, DB, env, superAdminId);
  }
}

async function handleMessage(msg, bot, DB, env, superAdminId) {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  await db.saveUser(DB, msg.from);

  const isAdm = await db.isAdmin(DB, userId) || userId === superAdminId;

  if (text.startsWith('/start')) {
    await handleStart(bot, DB, chatId, userId, text.split(' ')[1]||'', isAdm, env);
    return;
  }
  if (text === '/admin' && isAdm) { await admin.showHome(bot, chatId); return; }
  if (text === '/myid') { await bot.sendMessage(chatId, `🆔 <code>${userId}</code>`); return; }
  if (text === '/points' && await feat.isEnabled(DB, 'feature_points')) {
    await pts.showMyPoints(bot, DB, chatId, userId, env.BOT_USERNAME); return;
  }

  if (msg.reply_to_message && isAdm) {
    const rid = msg.reply_to_message.message_id;
    if (await feat.isEnabled(DB, 'feature_support') && await support.handleAdminReply(bot, DB, chatId, rid, text)) return;
    if (await feat.isEnabled(DB, 'feature_anon_qa') && await anonQA.handleAdminReply(bot, DB, chatId, rid, text)) return;
  }

  const session = await db.getSession(DB, userId);

  if (session?.type === 'ai_chat' && await feat.isEnabled(DB, 'feature_ai_chat')) {
    if (await aiChat.handleAIChatText(bot, DB, chatId, userId, text)) return;
  }
  if (session?.type === 'support' && await feat.isEnabled(DB, 'feature_support')) {
    if (await support.handleUserMessage(bot, DB, chatId, userId, text)) return;
  }
  if (await feat.isEnabled(DB, 'feature_forms') && await forms.handleFormInput(bot, DB, chatId, userId, text)) return;
  if (await feat.isEnabled(DB, 'feature_anon_qa') && await anonQA.handleAnonInput(bot, DB, chatId, userId, text)) return;

  if (isAdm) {
    if (await handleAdminSession(bot, DB, chatId, userId, msg, text, session, env)) return;
    if (await admin.handleBroadcastInput(bot, DB, chatId, text)) return;
  }
}

async function handleStart(bot, DB, chatId, userId, param, isAdm, env) {
  if (param.startsWith('ref_') && await feat.isEnabled(DB, 'feature_referral')) {
    const refId = parseInt(param.replace('ref_',''));
    if (!isNaN(refId)) await pts.handleRefStart(bot, DB, chatId, userId, refId);
  }

  if (param.startsWith('join_') && await feat.isEnabled(DB, 'feature_join_request')) {
    const channelId = param.replace('join_','');
    const adMsg = await db.getSetting(DB, 'ad_message');
    if (adMsg) try { await bot.sendMessage(chatId, adMsg); } catch {}
    const pending = await db.getPendingJoin(DB, userId);
    if (pending) {
      await bot.approveChatJoinRequest(channelId, userId);
      await db.markJoinApproved(DB, userId, channelId);
      await bot.sendMessage(chatId, '✅ درخواست عضویت تأیید شد!');
    }
  }

  if (isAdm) { await admin.showHome(bot, chatId); return; }

  if (await feat.isEnabled(DB, 'feature_gate')) {
    const gr = await gate.checkGate(bot, DB, userId);
    if (!gr.passed) { await gate.showGateScreen(bot, DB, chatId, userId); return; }
  }

  if (await feat.isEnabled(DB, 'feature_welcome')) {
    const wm = await db.getSetting(DB, 'welcome_message');
    if (wm) try { await bot.sendMessage(chatId, wm); } catch {}
  }

  const adMsg = await db.getSetting(DB, 'ad_message');
  if (adMsg && !param.startsWith('join_')) try { await bot.sendMessage(chatId, adMsg); } catch {}

  await menuFeat.sendMainMenu(bot, DB, chatId);
}

async function handleAdminSession(bot, DB, chatId, userId, msg, text, session, env) {
  if (!session) return false;

  const handlers = {
    'admin_edit_title': async () => {
      const nodes = await db.getNodes(DB); const n = nodes[session.nodeId];
      if (n) { n.title = text; await db.saveNode(DB, n); }
      await db.clearSession(DB, userId); await bot.sendMessage(chatId,'✅ ذخیره شد.');
      await admin.showNodeDetail(bot, DB, chatId, session.nodeId); return true;
    },
    'admin_edit_content': async () => {
      const nodes = await db.getNodes(DB); const n = nodes[session.nodeId];
      if (n) { n.content = text; await db.saveNode(DB, n); }
      await db.clearSession(DB, userId); await bot.sendMessage(chatId,'✅ ذخیره شد.');
      await admin.showNodeDetail(bot, DB, chatId, session.nodeId); return true;
    },
    'admin_edit_url': async () => {
      const nodes = await db.getNodes(DB); const n = nodes[session.nodeId];
      if (n) { n.url = text; n.type = 'link_url'; await db.saveNode(DB, n); }
      await db.clearSession(DB, userId); await bot.sendMessage(chatId,'✅ ذخیره شد.');
      await admin.showNodeDetail(bot, DB, chatId, session.nodeId); return true;
    },
    'admin_add_node': async () => {
      const id = await db.genNodeId();
      await db.saveNode(DB, {id, parent_id:session.parentId, title:text, type:session.nodeType, enabled:true});
      await db.clearSession(DB, userId); await bot.sendMessage(chatId,'✅ دکمه اضافه شد.');
      await admin.showMenuList(bot, DB, chatId, session.parentId); return true;
    },
    'admin_add_file': async () => {
      const file = getFileFromMsg(msg);
      if (file) {
        await DB.prepare('INSERT INTO menu_files(node_id,file_type,file_id)VALUES(?,?,?)').bind(session.nodeId,file.type,file.fileId).run();
        await db.clearSession(DB, userId); await bot.sendMessage(chatId,'✅ فایل اضافه شد.');
        await admin.showNodeDetail(bot, DB, chatId, session.nodeId);
      } else { await bot.sendMessage(chatId,'❌ فایل ارسال کنید.'); }
      return true;
    },
    'admin_gate_add': async () => {
      let cid = text.trim();
      if (cid.includes('t.me/')) cid='@'+cid.split('t.me/').pop().replace(/\/$/,'');
      else if (!cid.startsWith('@')&&!cid.startsWith('-')) cid='@'+cid;
      try {
        const r = await bot.getChat(cid); if(!r.ok) throw new Error(r.description);
        let link=''; try{const lr=await bot.exportChatInviteLink(r.result.id);link=lr.result||'';}catch{}
        await db.addGateChannel(DB, String(r.result.id), r.result.title||r.result.username, link);
        await db.clearSession(DB,userId); await bot.sendMessage(chatId,`✅ کانال اضافه شد.`);
        await admin.showGate(bot,DB,chatId);
      } catch(e) { await bot.sendMessage(chatId,`❌ ${e.message}`); await db.clearSession(DB,userId); }
      return true;
    },
    'admin_ai_field': async () => {
      await db.setAISetting(DB,session.field,text.trim()); await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,'✅ ذخیره شد.'); await admin.showAISettings(bot,DB,chatId); return true;
    },
    'admin_attract_msg': async () => {
      await db.setSetting(DB,'ad_message',text); await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,'✅ ذخیره شد.'); await admin.showAttract(bot,DB,chatId); return true;
    },
    'admin_attract_target_bot': async () => {
      await db.setSetting(DB,'ad_target_bot',text.trim().replace('@','')); await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,'✅ ذخیره شد.'); await admin.showAttract(bot,DB,chatId); return true;
    },
    'admin_attract_add_group': async () => {
      let gid = text.trim();
      if (gid.includes('t.me/')) gid='@'+gid.split('t.me/').pop().replace(/\/$/,'');
      else if (!gid.startsWith('@')&&!gid.startsWith('-')) gid='@'+gid;
      try {
        const r=await bot.getChat(gid); if(!r.ok) throw new Error(r.description);
        const c=r.result;
        if(c.type!=='group'&&c.type!=='supergroup'){await bot.sendMessage(chatId,'❌ این گروه نیست.');}
        else{await db.addAdGroup(DB,String(c.id),c.title||c.username);await bot.sendMessage(chatId,`✅ گروه اضافه شد.`);}
      }catch(e){await bot.sendMessage(chatId,`❌ ${e.message}`);}
      await db.clearSession(DB,userId); await admin.showAttract(bot,DB,chatId); return true;
    },
    'admin_welcome_msg': async () => {
      await db.setSetting(DB,'welcome_message',text); await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,'✅ ذخیره شد.'); await showWelcomeAdmin(bot,DB,chatId); return true;
    },
    'admin_add_admin': async () => {
      const tid=parseInt(text.trim());
      if(isNaN(tid)){await bot.sendMessage(chatId,'❌ عدد وارد کنید.');}
      else{await db.addAdmin(DB,tid,null,0);await bot.sendMessage(chatId,`✅ ادمین <code>${tid}</code> اضافه شد.`);}
      await db.clearSession(DB,userId); await admin.showAdmins(bot,DB,chatId); return true;
    },
    'admin_del_admin': async () => {
      const tid=parseInt(text.trim());
      if(!isNaN(tid)){await db.removeAdmin(DB,tid);await bot.sendMessage(chatId,'✅ حذف شد.');}
      await db.clearSession(DB,userId); await admin.showAdmins(bot,DB,chatId); return true;
    },
    'vadm_set_channel': async () => {
      await db.setSetting(DB,'video_channel',text.trim().replace('@','')); await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,'✅ ذخیره شد.'); await videoAdm.showVideoAdmin(bot,DB,chatId); return true;
    },
    'vadm_add_field': async () => {
      const id=await db.genNodeId(); await db.saveVideoField(DB,id,text);
      await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ رشته اضافه شد.');
      await videoAdm.showVideoAdmin(bot,DB,chatId); return true;
    },
    'vadm_add_grade': async () => {
      const id=await db.genNodeId(); await db.saveVideoGrade(DB,id,session.fieldId,text);
      await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ مقطع اضافه شد.');
      await videoAdm.showFieldAdmin(bot,DB,chatId,session.fieldId); return true;
    },
    'vadm_add_lesson': async () => {
      const id=await db.genNodeId(); await db.saveVideoLesson(DB,id,session.gradeId,text,null);
      await db.setSession(DB,userId,{type:'vadm_set_video',lessonId:id,fieldId:session.fieldId,gradeId:session.gradeId});
      await bot.sendMessage(chatId,'✅ درس اضافه شد. حالا ویدیو را از کانال forward کنید:'); return true;
    },
    'vadm_set_video': async () => {
      if(msg.forward_from_chat||msg.forward_origin){
        const mid=msg.forward_from_message_id||msg.forward_origin?.message_id;
        if(mid){const l=await db.getVideoLesson(DB,session.lessonId);await db.saveVideoLesson(DB,session.lessonId,session.gradeId,l.title,mid);
        await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ ویدیو تنظیم شد!');
        await videoAdm.showGradeAdmin(bot,DB,chatId,session.fieldId,session.gradeId);}
      } else { await bot.sendMessage(chatId,'⚠️ از کانال forward کنید.'); }
      return true;
    },
    'vadm_edit_title': async () => {
      const l=await db.getVideoLesson(DB,session.lessonId); await db.saveVideoLesson(DB,session.lessonId,l.grade_id,text,l.message_id);
      await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ ذخیره شد.');
      await videoAdm.showLessonAdmin(bot,DB,chatId,session.fieldId,session.gradeId,session.lessonId); return true;
    },
    'padm_create_question': async () => {
      await db.setSession(DB,userId,{type:'padm_create_options',question:text,options:[]});
      await bot.sendMessage(chatId,'✅ سوال ذخیره شد.\n\nگزینه‌ها را یکی یکی بنویسید.\nبعد از اتمام /done بزنید:'); return true;
    },
    'padm_create_options': async () => {
      if(text==='/done'){
        if(session.options.length<2){await bot.sendMessage(chatId,'❌ حداقل ۲ گزینه.');return true;}
        const id=await db.genNodeId(); await db.savePoll(DB,id,session.question,session.options);
        await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ نظرسنجی ساخته شد!');
        await pollAdm.showPollAdmin(bot,DB,chatId);
      } else {
        session.options.push(text); await db.setSession(DB,userId,session);
        await bot.sendMessage(chatId,`✅ گزینه ${session.options.length} اضافه شد. بعدی یا /done:`);
      }
      return true;
    },
    'sadm_create_text': async () => {
      await db.setSession(DB,userId,{type:'sadm_create_time',text,tag:session.tag||null});
      await bot.sendMessage(chatId,'⏰ زمان ارسال (YYYY-MM-DD HH:MM):'); return true;
    },
    'sadm_create_time': async () => {
      await db.saveScheduledMessage(DB,session.text,text,session.tag||null);
      await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ زمان‌بندی شد!');
      await schedAdm.showSchedulerAdmin(bot,DB,chatId); return true;
    },
    'tadm_send_tag': async () => {
      const result = await tags.broadcastToTag(bot,DB,session.tag,text);
      await db.clearSession(DB,userId);
      await bot.sendMessage(chatId,`✅ تموم شد!\n📤 ${result.sent}\n❌ ${result.failed}`); return true;
    },
  };

  if (handlers[session.type]) return await handlers[session.type]();
  return false;
}

async function handleCallback(cq, bot, DB, env, superAdminId) {
  const userId = cq.from.id;
  const chatId = cq.message.chat.id;
  const data = cq.data;
  await bot.answerCallbackQuery(cq.id);

  const isAdm = await db.isAdmin(DB, userId) || userId === superAdminId;

  // User callbacks
  if (data.startsWith('menu:')) { await menuFeat.openNode(bot,DB,chatId,userId,data.replace('menu:','')); return; }
  if (data === 'gate_check') {
    const gr = await gate.checkGate(bot,DB,userId);
    if(gr.passed){await bot.sendMessage(chatId,'✅ تأیید شد!');await menuFeat.sendMainMenu(bot,DB,chatId);}
    else await gate.showGateScreen(bot,DB,chatId,userId);
    return;
  }
  if (data.startsWith('ai_end:')) {
    await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ پایان یافت.');
    await menuFeat.openNode(bot,DB,chatId,userId,data.replace('ai_end:','')); return;
  }
  if (data === 'support_end') {
    await db.clearSession(DB,userId); await bot.sendMessage(chatId,'✅ پایان یافت.');
    await menuFeat.sendMainMenu(bot,DB,chatId); return;
  }
  if (data === 'leaderboard') { await pts.showLeaderboard(bot,DB,chatId); return; }
  if (data.startsWith('poll_vote:')) {
    const [,pid,oi] = data.split(':');
    await poll.handleVote(bot,DB,chatId,userId,pid,parseInt(oi)); return;
  }
  if (data.startsWith('video:')) {
    const [,action,...rest] = data.split(':');
    if(action==='fields') await video.showFields(bot,DB,chatId);
    else if(action==='field') await video.showGrades(bot,DB,chatId,rest[0]);
    else if(action==='grade') await video.showLessons(bot,DB,chatId,rest[0],rest[1]);
    else if(action==='lesson'){const ch=await db.getSetting(DB,'video_channel');await video.sendLesson(bot,DB,chatId,rest[2],ch);}
    return;
  }

  if (!isAdm) return;

  // Admin callbacks
  const [ns, ...rest] = data.split(':');

  if (ns === 'adm') { await handleAdmCB(bot,DB,chatId,userId,rest,env); return; }
  if (ns === 'feat') { if(rest[0]==='toggle') await feat.toggleFeature(bot,DB,chatId,rest[1]); return; }
  if (ns === 'vadm') { await handleVAdmCB(bot,DB,chatId,userId,rest); return; }
  if (ns === 'padm') { await handlePAdmCB(bot,DB,chatId,userId,rest); return; }
  if (ns === 'sadm') { await handleSAdmCB(bot,DB,chatId,userId,rest); return; }
  if (ns === 'tadm') { await handleTAdmCB(bot,DB,chatId,userId,rest); return; }
}

async function handleAdmCB(bot,DB,chatId,userId,rest,env) {
  const a = rest[0];
  const cbs = {
    'home': ()=>admin.showHome(bot,chatId),
    'stats': ()=>admin.showStats(bot,DB,chatId),
    'admins': ()=>admin.showAdmins(bot,DB,chatId),
    'broadcast': ()=>admin.startBroadcast(bot,DB,chatId),
    'gate': ()=>admin.showGate(bot,DB,chatId),
    'ai': ()=>admin.showAISettings(bot,DB,chatId),
    'attract': ()=>admin.showAttract(bot,DB,chatId),
    'forms': ()=>showFormsAdmin(bot,DB,chatId),
    'features': ()=>feat.showFeaturesPanel(bot,DB,chatId),
    'video': ()=>videoAdm.showVideoAdmin(bot,DB,chatId),
    'polls': ()=>pollAdm.showPollAdmin(bot,DB,chatId),
    'scheduler': ()=>schedAdm.showSchedulerAdmin(bot,DB,chatId),
    'tags': ()=>tagsAdm.showTagsAdmin(bot,DB,chatId),
    'welcome': ()=>showWelcomeAdmin(bot,DB,chatId),
  };
  if (cbs[a]) { await cbs[a](); return; }

  if (a==='menu_list') { await admin.showMenuList(bot,DB,chatId,rest[1]||'root'); return; }
  if (a==='node') { await admin.showNodeDetail(bot,DB,chatId,rest.slice(1).join(':')); return; }
  if (a==='node_toggle') {
    const nid=rest.slice(1).join(':'); const nodes=await db.getNodes(DB); const n=nodes[nid];
    if(n){n.enabled=!n.enabled;await db.saveNode(DB,n);}
    await admin.showNodeDetail(bot,DB,chatId,nid); return;
  }
  const editSessions = {
    'node_edit_title':'admin_edit_title','node_edit_content':'admin_edit_content','node_edit_url':'admin_edit_url',
  };
  if (editSessions[a]) {
    await db.setSession(DB,userId,{type:editSessions[a],nodeId:rest.slice(1).join(':')});
    const prompts = {'admin_edit_title':'✏️ عنوان جدید:','admin_edit_content':'📝 محتوا:','admin_edit_url':'🔗 لینک:'};
    await bot.sendMessage(chatId,prompts[editSessions[a]]); return;
  }
  if (a==='node_del_confirm') {
    const nid=rest.slice(1).join(':');
    await bot.sendMessage(chatId,'⚠️ مطمئنید؟',{reply_markup:{inline_keyboard:[
      [{text:'✅ حذف',callback_data:`adm:node_del:${nid}`},{text:'❌ انصراف',callback_data:`adm:node:${nid}`}]
    ]}}); return;
  }
  if (a==='node_del') {
    const nid=rest.slice(1).join(':'); const nodes=await db.getNodes(DB); const pid=nodes[nid]?.parent_id||'root';
    await db.deleteNode(DB,nid); await bot.sendMessage(chatId,'✅ حذف شد.');
    await admin.showMenuList(bot,DB,chatId,pid); return;
  }
  if (a==='node_add') {
    const pid=rest.slice(1).join(':');
    await bot.sendMessage(chatId,'نوع دکمه:',{reply_markup:{inline_keyboard:[
      [{text:'📂 زیرمنو',callback_data:`adm:node_type:${pid}:submenu`},{text:'📝 متن',callback_data:`adm:node_type:${pid}:text`}],
      [{text:'🔗 لینک',callback_data:`adm:node_type:${pid}:link_url`},{text:'📁 فایل',callback_data:`adm:node_type:${pid}:file`}],
      [{text:'📋 فرم',callback_data:`adm:node_type:${pid}:form`},{text:'❓ سوال ناشناس',callback_data:`adm:node_type:${pid}:anon_qa`}],
      [{text:'🤖 هوش مصنوعی',callback_data:`adm:node_type:${pid}:ai_chat`},{text:'💬 پشتیبانی',callback_data:`adm:node_type:${pid}:support`}],
      [{text:'🎥 ویدیو',callback_data:`adm:node_type:${pid}:video_tree`},{text:'📊 نظرسنجی',callback_data:`adm:node_type:${pid}:poll`}],
      [{text:'🔙 بازگشت',callback_data:`adm:menu_list:${pid}`}],
    ]}}); return;
  }
  if (a==='node_type') { await db.setSession(DB,userId,{type:'admin_add_node',parentId:rest[1],nodeType:rest[2]}); await bot.sendMessage(chatId,'✏️ عنوان دکمه:'); return; }
  if (a==='node_files') { await db.setSession(DB,userId,{type:'admin_add_file',nodeId:rest.slice(1).join(':')}); await bot.sendMessage(chatId,'📎 فایل ارسال کنید:'); return; }
  if (a==='gate_add') { await db.setSession(DB,userId,{type:'admin_gate_add'}); await bot.sendMessage(chatId,'📢 لینک کانال:'); return; }
  if (a==='gate_del') { await db.removeGateChannel(DB,parseInt(rest[1])); await admin.showGate(bot,DB,chatId); return; }
  if (a==='ai_url') { await db.setSession(DB,userId,{type:'admin_ai_field',field:'baseUrl'}); await bot.sendMessage(chatId,'🔗 Base URL:'); return; }
  if (a==='ai_key') { await db.setSession(DB,userId,{type:'admin_ai_field',field:'apiKey'}); await bot.sendMessage(chatId,'🔑 API Key:'); return; }
  if (a==='ai_model') { await db.setSession(DB,userId,{type:'admin_ai_field',field:'model'}); await bot.sendMessage(chatId,'🤖 Model:'); return; }
  if (a==='ai_prompt') { await db.setSession(DB,userId,{type:'admin_ai_field',field:'systemPrompt'}); await bot.sendMessage(chatId,'📝 System Prompt:'); return; }
  if (a==='attract_toggle_ad') { const c=await db.getSetting(DB,'ad_listener_active'); await db.setSetting(DB,'ad_listener_active',c==='1'?'0':'1'); await admin.showAttract(bot,DB,chatId); return; }
  if (a==='attract_toggle_join') { const c=await db.getSetting(DB,'join_request_active'); await db.setSetting(DB,'join_request_active',c==='1'?'0':'1'); await admin.showAttract(bot,DB,chatId); return; }
  if (a==='attract_edit_msg') { await db.setSession(DB,userId,{type:'admin_attract_msg'}); await bot.sendMessage(chatId,'✏️ متن پیام:'); return; }
  if (a==='attract_target_bot') { await db.setSession(DB,userId,{type:'admin_attract_target_bot'}); await bot.sendMessage(chatId,'🤖 یوزرنیم ربات (بدون @):'); return; }
  if (a==='attract_display') { await admin.showAttractDisplay(bot,DB,chatId); return; }
  if (a==='attract_type_btn') { await db.setSetting(DB,'ad_button_type','button'); await admin.showAttractDisplay(bot,DB,chatId); return; }
  if (a==='attract_type_mention') { await db.setSetting(DB,'ad_button_type','mention'); await admin.showAttractDisplay(bot,DB,chatId); return; }
  if (a==='attract_del') { await db.setSetting(DB,'ad_delete_after',rest[1]); await admin.showAttractDisplay(bot,DB,chatId); return; }
  if (a==='attract_add_group') { await db.setSession(DB,userId,{type:'admin_attract_add_group'}); await bot.sendMessage(chatId,'➕ لینک گروه:'); return; }
  if (a==='attract_groups') { await admin.showAttractGroups(bot,DB,chatId); return; }
  if (a==='attract_del_group') { await db.removeAdGroup(DB,parseInt(rest[1])); await admin.showAttractGroups(bot,DB,chatId); return; }
  if (a==='admin_add') { await db.setSession(DB,userId,{type:'admin_add_admin'}); await bot.sendMessage(chatId,'👑 آیدی ادمین جدید:'); return; }
  if (a==='admin_del') { await db.setSession(DB,userId,{type:'admin_del_admin'}); await bot.sendMessage(chatId,'🗑 آیدی ادمین:'); return; }
  if (a==='welcome_edit') { await db.setSession(DB,userId,{type:'admin_welcome_msg'}); await bot.sendMessage(chatId,'👋 متن خوش‌آمدگویی:'); return; }
  if (a==='welcome_toggle') { const c=await db.getSetting(DB,'feature_welcome'); await db.setSetting(DB,'feature_welcome',c==='1'?'0':'1'); await showWelcomeAdmin(bot,DB,chatId); return; }
}

async function handleVAdmCB(bot,DB,chatId,userId,rest) {
  const a=rest[0];
  if(a==='home') { await videoAdm.showVideoAdmin(bot,DB,chatId); return; }
  if(a==='set_channel') { await db.setSession(DB,userId,{type:'vadm_set_channel'}); await bot.sendMessage(chatId,'📡 یوزرنیم کانال (بدون @):'); return; }
  if(a==='add_field') { await db.setSession(DB,userId,{type:'vadm_add_field'}); await bot.sendMessage(chatId,'📚 نام رشته:'); return; }
  if(a==='field') { await videoAdm.showFieldAdmin(bot,DB,chatId,rest[1]); return; }
  if(a==='del_field') { await db.deleteVideoField(DB,rest[1]); await videoAdm.showVideoAdmin(bot,DB,chatId); return; }
  if(a==='add_grade') { await db.setSession(DB,userId,{type:'vadm_add_grade',fieldId:rest[1]}); await bot.sendMessage(chatId,'📖 نام مقطع:'); return; }
  if(a==='grade') { await videoAdm.showGradeAdmin(bot,DB,chatId,rest[1],rest[2]); return; }
  if(a==='del_grade') { await db.deleteVideoGrade(DB,rest[2]); await videoAdm.showFieldAdmin(bot,DB,chatId,rest[1]); return; }
  if(a==='add_lesson') { await db.setSession(DB,userId,{type:'vadm_add_lesson',fieldId:rest[1],gradeId:rest[2]}); await bot.sendMessage(chatId,'🎬 نام درس:'); return; }
  if(a==='lesson') { await videoAdm.showLessonAdmin(bot,DB,chatId,rest[1],rest[2],rest[3]); return; }
  if(a==='del_lesson') { await db.deleteVideoLesson(DB,rest[3]); await videoAdm.showGradeAdmin(bot,DB,chatId,rest[1],rest[2]); return; }
  if(a==='edit_title') { await db.setSession(DB,userId,{type:'vadm_edit_title',fieldId:rest[1],gradeId:rest[2],lessonId:rest[3]}); await bot.sendMessage(chatId,'✏️ عنوان جدید:'); return; }
  if(a==='set_video') { await db.setSession(DB,userId,{type:'vadm_set_video',fieldId:rest[1],gradeId:rest[2],lessonId:rest[3]}); await bot.sendMessage(chatId,'🎬 پیام را از کانال forward کنید:'); return; }
}

async function handlePAdmCB(bot,DB,chatId,userId,rest) {
  const a=rest[0];
  if(a==='home') { await pollAdm.showPollAdmin(bot,DB,chatId); return; }
  if(a==='create') { await db.setSession(DB,userId,{type:'padm_create_question'}); await bot.sendMessage(chatId,'📊 سوال نظرسنجی:'); return; }
  if(a==='detail') { await pollAdm.showPollDetail(bot,DB,chatId,rest[1]); return; }
  if(a==='deactivate') { await DB.prepare('UPDATE polls SET is_active=0 WHERE id=?').bind(rest[1]).run(); await pollAdm.showPollAdmin(bot,DB,chatId); return; }
}

async function handleSAdmCB(bot,DB,chatId,userId,rest) {
  const a=rest[0];
  if(a==='home') { await schedAdm.showSchedulerAdmin(bot,DB,chatId); return; }
  if(a==='create') { await db.setSession(DB,userId,{type:'sadm_create_text'}); await bot.sendMessage(chatId,'📝 متن پیام:'); return; }
  if(a==='create_tag') { await db.setSession(DB,userId,{type:'sadm_create_text',tag:rest[1]}); await bot.sendMessage(chatId,'📝 متن پیام:'); return; }
}

async function handleTAdmCB(bot,DB,chatId,userId,rest) {
  const a=rest[0];
  if(a==='home') { await tagsAdm.showTagsAdmin(bot,DB,chatId); return; }
  if(a==='tag') { await tagsAdm.showTagDetail(bot,DB,chatId,rest[1]); return; }
  if(a==='send') { await db.setSession(DB,userId,{type:'tadm_send_tag',tag:rest[1]}); await bot.sendMessage(chatId,`📢 متن برای تگ "${rest[1]}":`); return; }
}

async function showFormsAdmin(bot,DB,chatId) {
  const fs = await db.getForms(DB);
  const rows = Object.values(fs).map(f=>[{text:`📝 ${f.title}`,callback_data:`adm:form_detail:${f.id}`}]);
  rows.push([{text:'🔙 بازگشت',callback_data:'adm:home'}]);
  await bot.sendMessage(chatId,'📝 <b>فرم‌ها</b>',{reply_markup:{inline_keyboard:rows}});
}

async function showWelcomeAdmin(bot,DB,chatId) {
  const wm = await db.getSetting(DB,'welcome_message');
  const en = await db.getSetting(DB,'feature_welcome');
  await bot.sendMessage(chatId,
    `👋 <b>خوش‌آمدگویی</b>\n\nوضعیت: <b>${en==='1'?'✅':'❌'}</b>\n\nپیام:\n${wm||'(تنظیم نشده)'}`,
    {reply_markup:{inline_keyboard:[
      [{text:en==='1'?'🔴 غیرفعال':'🟢 فعال',callback_data:'adm:welcome_toggle'}],
      [{text:'✏️ ویرایش',callback_data:'adm:welcome_edit'}],
      [{text:'🔙 بازگشت',callback_data:'adm:home'}],
    ]}}
  );
}
