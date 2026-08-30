import { buildChildrenKeyboard, backButton } from "./keyboards.js";
import { Store } from "./storage/kv.js";
import { DEFAULT_MENU, DEFAULT_FORMS, DEFAULT_VIDEO_TREE } from "./menuSeed.js";
import { getNodes, setNodes, buildNodesFromLegacyTree, ROOT_ID } from "./menuNodes.js";
import { sendFileByType } from "./utils/media.js";
import { startForm, handleFormInput } from "./features/formEngine.js";
import * as Video from "./features/videoLibrary.js";
import * as AnonQA from "./features/anonymousQA.js";
import * as Contact from "./features/contactRequest.js";
import * as Admin from "./admin/panel.js";
import * as VideoAdmin from "./admin/videoAdmin.js";
import * as MenuBuilder from "./admin/menuBuilder.js";
import * as ContentManager from "./admin/contentManager.js";
import * as AccessGate from "./features/accessGate.js";
import * as GateAdmin from "./admin/gateAdmin.js";
import * as AccessControl from "./features/accessControl.js";
import * as AIChat from "./features/aiChat.js";
import * as AIAdmin from "./admin/aiAdmin.js";
import * as AttractAdmin from "./admin/attractAdmin.js";
import { handleJoinRequest, handleGroupMessage } from "./features/memberAttract.js";

// ---------------------------------------------------------------------------
// این فایل مشترک بین همه‌ی پلتفرم‌هاست (تلگرام/بله/روبیکا). هر پلتفرم قبل
// از فراخوانی handleUpdate یک ctx می‌سازد که شامل کلاینت ارتباطی (tg)،
// Store مخصوص همان پلتفرم، لیست آیدی ادمین‌ها، و نام پلتفرم است. منطق
// داخل این فایل با هر ctx یکسان کار می‌کند چون tg در همه‌ی پلتفرم‌ها همان
// متدهای sendMessage/call/... را دارد (نگاه کنید به src/platforms/).
//
// ctx = { tg, store, adminIds, videoChannel, platform, originUrl }
// platform یکی از "telegram" | "bale" | "rubika" است. قابلیت‌هایی که به
// فوروارد از کانال نیاز دارند (ویدیوی اختصاصی، اتصال به کانال) فقط روی
// تلگرام و بله فعال‌اند چون این دو copyMessage/forwardMessage دارند.
// ---------------------------------------------------------------------------

const CHANNEL_FORWARD_CAPABLE = ["telegram", "bale"];

export async function handleUpdate(update, ctx) {
  const { tg, store, adminIds } = ctx;

  await ensureSeeded(store, ctx.env);

  // Join Request
  if (update.chat_join_request) {
    await handleJoinRequest(update.chat_join_request, tg, store);
    return;
  }

  const msg = update.message;
  const cq = update.callback_query;
  const userId = msg?.from?.id || cq?.from?.id;
  const chatId = msg?.chat?.id || cq?.message?.chat?.id;

  if (msg) await store.saveUser(msg.from);

  // اجازه‌ی دیدن آیدی همیشه آزاد است، حتی قبل از عبور از گیت
  if (msg?.text === "/myid") {
    await tg.sendMessage(chatId, `🆔 آیدی عددی شما: <code>${userId}</code>`);
    return;
  }

  if (userId && !Admin.isAdmin(userId, adminIds)) {
    if (cq && cq.data === "gatecheck") {
      await tg.answerCallbackQuery(cq.id);
      await AccessGate.acknowledgeChannels(store, userId);
      const recheck = await AccessGate.checkGate(tg, store, userId, true);
      if (recheck.passed) {
        await sendStartMenu(tg, store, chatId, userId, false);
      } else {
        await AccessGate.showGateScreen(tg, store, chatId, userId, recheck, ctx.platform);
      }
      return;
    }

    const gateResult = await AccessGate.checkGate(tg, store, userId);
    if (!gateResult.passed) {
      if (msg?.contact && (await AccessGate.handleGateContact(tg, store, chatId, userId, msg, adminIds))) {
        const recheck = await AccessGate.checkGate(tg, store, userId, true);
        if (recheck.passed) {
          await sendStartMenu(tg, store, chatId, userId, false);
        } else {
          await AccessGate.showGateScreen(tg, store, chatId, userId, recheck, ctx.platform);
        }
        return;
      }
      if (msg?.text && (await AccessGate.handleGatePhoneText(tg, store, chatId, userId, msg.text, adminIds))) {
        const recheck = await AccessGate.checkGate(tg, store, userId, true);
        if (recheck.passed) {
          await sendStartMenu(tg, store, chatId, userId, false);
        } else {
          await AccessGate.showGateScreen(tg, store, chatId, userId, recheck, ctx.platform);
        }
        return;
      }
      if (cq) await tg.answerCallbackQuery(cq.id);
      await AccessGate.showGateScreen(tg, store, chatId, userId, gateResult, ctx.platform);
      return;
    }
  }

  if (update.message) {
    const chatType = update.message?.chat?.type;
    if (chatType === 'group' || chatType === 'supergroup') {
      await handleGroupMessage(update.message, tg, store);
    }
    await handleMessage(ctx, update.message);
  } else if (update.callback_query) {
    await handleCallback(ctx, update.callback_query);
  }
}

async function sendStartMenu(tg, store, chatId, userId = null, isAdminUser = false) {
  const nodes = await getNodes(store);
  const root = nodes[ROOT_ID];
  await tg.sendMessage(chatId, `<b>${root.title}</b>`, {
    reply_markup: buildChildrenKeyboard(nodes, root, false, userId, isAdminUser, store.platform),
  });
}

async function ensureSeeded(store, env) {
  let nodes = await getNodes(store);
  if (!nodes) {
    // مهاجرت یک‌باره به ساختار مشترک: چون تلگرام معمولاً کامل‌ترین منو را
    // تا این لحظه دارد، اولویت با داده‌ی قدیمی (قبل از اشتراک‌گذاری) خودِ
    // تلگرام است؛ در نبود آن از داده‌ی قدیمی همین پلتفرم، وگرنه از صفر.
    const telegramStore = new Store(env, "tg");
    let sourceNodes = await telegramStore.get("menu:nodes", null);
    let sourcePlatform = "tg";
    if (!sourceNodes) {
      sourceNodes = await store.get("menu:nodes", null);
      sourcePlatform = store.platform;
    }
    if (!sourceNodes) {
      const legacyTree = await store.getMenuTree();
      const sourceTree = legacyTree || DEFAULT_MENU;
      sourceNodes = buildNodesFromLegacyTree(sourceTree);
      sourcePlatform = store.platform;
    }
    nodes = sourceNodes;

    // فیلدهایی که ذاتاً مخصوص یک پلتفرم هستند (فایل، دسترسی، کانال) را از
    // حالت قدیمی (مستقیم روی نود) به فضای مخصوص همان پلتفرم منتقل می‌کند
    for (const node of Object.values(nodes)) {
      if (Array.isArray(node.files)) {
        node.filesByPlatform = { [sourcePlatform]: node.files };
        delete node.files;
      }
      if (node.allowedUsers) {
        node.allowedUsersByPlatform = { [sourcePlatform]: node.allowedUsers };
        delete node.allowedUsers;
      }
      if (node.approvalChatId) {
        node.approvalChatIdByPlatform = { [sourcePlatform]: node.approvalChatId };
        delete node.approvalChatId;
      }
      if (node.type === "channel_content" && node.channelUsername) {
        node.channelUsernameByPlatform = { [sourcePlatform]: node.channelUsername };
        delete node.channelUsername;
      }
      if (node.type === "channel_item" && node.messageId) {
        node.messageIdByPlatform = { [sourcePlatform]: node.messageId };
        delete node.messageId;
      }
    }

    await setNodes(store, nodes);
  }

  // مهاجرت خودکار نودهای «فایل» خیلی قدیمی (تک‌فایلی، قبل از آرایه‌ای شدن)
  let changed = false;
  for (const node of Object.values(nodes)) {
    if (node.type === "file" && !node.filesByPlatform && !Array.isArray(node.files) && node.fileId) {
      node.filesByPlatform = { [store.platform]: [{ type: node.fileType, fileId: node.fileId }] };
      delete node.fileType;
      delete node.fileId;
      changed = true;
    }
  }
  if (changed) await setNodes(store, nodes);

  const forms = await store.getShared("forms:all", null);
  if (!forms) {
    const telegramStore = new Store(env, "tg");
    const tgForms = await telegramStore.get("forms:all", null);
    await store.setShared("forms:all", tgForms || DEFAULT_FORMS);
  }

  const customForms = await store.getShared("forms:custom", null);
  if (!customForms) {
    const telegramStore = new Store(env, "tg");
    const tgCustomForms = await telegramStore.get("forms:custom", null);
    await store.setShared("forms:custom", tgCustomForms || {});
  }

  const videoTree = await store.get("video:tree");
  if (!videoTree) await store.set("video:tree", DEFAULT_VIDEO_TREE);
}

async function resolveFormDef(store, node) {
  if (node.formKey) {
    const legacyForms = await store.getShared("forms:all");
    return legacyForms?.[node.formKey] || null;
  }
  const customForms = await store.getShared("forms:custom", {});
  return customForms[node.id] || null;
}

async function handleMessage(ctx, msg) {
  const { tg, store, adminIds } = ctx;
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text || "";

  await store.saveUser(msg.from);

  // --- پاسخ ادمین به سوال ناشناس (با Reply روی پیام سوال) ---
  if (msg.reply_to_message && Admin.isAdmin(userId, adminIds)) {
    if (await AnonQA.handleAdminReply(tg, store, chatId, msg.reply_to_message.text || "", text)) return;
  }

  // --- دریافت شماره تماس ---
  if (msg.contact) {
    if (await Contact.handleContactMessage(tg, store, chatId, userId, msg, adminIds)) return;
  }
  if (await Contact.handleContactText(tg, store, chatId, userId, text, adminIds)) return;
  if (text === "🔙 انصراف") {
    if (await Contact.handleCancelContact(tg, store, chatId, userId, text)) return;
  }

  if (text === "/start") {
    await sendStartMenu(tg, store, chatId, userId, Admin.isAdmin(userId, adminIds));
    return;
  }

  if (text === "/admin" && Admin.isAdmin(userId, adminIds)) {
    await Admin.showAdminHome(tg, chatId);
    return;
  }

  // --- اگر کاربر وسط یک گفتگوی هوش مصنوعی است، پیام را مستقیم به همان‌جا بده ---
  const activeSession = await store.getSession(userId);
  if (activeSession?.type === "ai_chat") {
    if (msg.photo) {
      if (await AIChat.handleAIChatImage(tg, store, chatId, userId, msg)) return;
    }
    if (await AIChat.handleAIChatText(tg, store, chatId, userId, text)) return;
  }

  if (Admin.isAdmin(userId, adminIds)) {
    // پیام فوروارد شده (برای ویدیوی اختصاصی یا محتوای کانال دلخواه - فقط تلگرام/بله)
    if (CHANNEL_FORWARD_CAPABLE.includes(ctx.platform) && (msg.forward_from_chat || msg.forward_origin)) {
      if (await VideoAdmin.handleVideoAdminForward(tg, store, chatId, msg)) return;
      if (await MenuBuilder.handleChannelItemForward(tg, store, chatId, msg)) return;
    }
    // پیام حاوی فایل مستقیم (عکس/ویدیو/سند/صدا)
    if (msg.photo || msg.document || msg.video || msg.audio || msg.voice || msg.animation) {
      if (await MenuBuilder.handleNewButtonFile(tg, store, chatId, msg)) return;
      if (await MenuBuilder.handleAddFileFile(tg, store, chatId, msg)) return;
      if (await MenuBuilder.handleReplaceFileFile(tg, store, chatId, msg)) return;
      if (await ContentManager.handleReplaceFile(tg, store, chatId, msg)) return;
      if (await Admin.handleBroadcastFile(tg, store, chatId, msg)) return;
    }
    if (await AttractAdmin.handleEditMsg(tg, store, chatId, text)) return;
    if (await AttractAdmin.handleSetTargetBot(tg, store, chatId, text)) return;
    if (await AttractAdmin.handleAddGroup(tg, store, chatId, text)) return;
    if (await VideoAdmin.handleVideoAdminTextInput(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleNewButtonText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleEditNodeText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleChannelItemText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleAddFileText(tg, store, chatId, text)) return;
    if (await GateAdmin.handleAddChannelText(tg, store, chatId, text)) return;
    if (await GateAdmin.handleEditPhoneMessageText(tg, store, chatId, text)) return;
    if (await AIAdmin.handleFieldText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleAddAccessUserText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleSetApprovalChatText(tg, store, chatId, text)) return;
    if (await MenuBuilder.handleEditApprovalFormText(tg, store, chatId, text)) return;
    if (await Admin.handleBroadcastInput(tg, store, chatId, text)) return;
  }

  if (await AccessControl.handleAccessRequestInput(tg, store, chatId, userId, text, adminIds)) return;
  if (await handleFormInput(tg, store, chatId, userId, text, adminIds)) return;
  if (await AnonQA.handleAnonInput(tg, store, chatId, userId, text, adminIds)) return;

  await tg.sendMessage(chatId, "برای شروع /start را بزنید.");
}

async function handleCallback(ctx, cq) {
  const { tg, store, adminIds } = ctx;
  const chatId = cq.message.chat.id;
  const userId = cq.from.id;
  const data = cq.data;

  await tg.answerCallbackQuery(cq.id);

  const [ns, ...rest] = data.split(":");

  // ---------------- ناوبری کاربر عادی در منو ----------------
  if (ns === "open") {
    await openNode(ctx, chatId, userId, rest.join(":"));
    return;
  }

  // ---------------- بخش ویدیوی اختصاصی (فقط تلگرام/بله) ----------------
  if (CHANNEL_FORWARD_CAPABLE.includes(ctx.platform)) {
    if (ns === "video" && rest[0] === "root") return Video.showFields(tg, store, chatId);
    if (ns === "vfield") return Video.showGrades(tg, store, chatId, rest[0]);
    if (ns === "vgrade") return Video.showLessons(tg, store, chatId, rest[0], rest[1]);
    if (ns === "vlesson")
      return Video.sendLesson(tg, store, chatId, rest[0], rest[1], Number(rest[2]), ctx.videoChannel);
  }

  // ---------------- پایان گفتگوی هوش مصنوعی (کاربر عادی) ----------------
  if (ns === "aichatend") {
    const parentId = await AIChat.endAIChat(store, userId);
    await tg.sendMessage(chatId, "✅ گفتگو با هوش مصنوعی پایان یافت.");
    await openNode(ctx, chatId, userId, parentId);
    return;
  }

  // ---------------- تایید/رد درخواست دسترسی (ممکن است چت مقصد ادمین نباشد) ----------------
  if (ns === "accapprove") return AccessControl.approveAccess(tg, store, chatId, rest[0], rest[1]);
  if (ns === "accreject") return AccessControl.rejectAccess(tg, store, chatId, rest[0], rest[1]);

  // ---------------- از این به بعد فقط ادمین ----------------
  if (!Admin.isAdmin(userId, adminIds)) return;

  if (ns === "admin") {
    if (rest[0] === "home") return Admin.showAdminHome(tg, chatId);
    if (rest[0] === "buttons") return MenuBuilder.showNodeList(tg, store, chatId, ROOT_ID);
    if (rest[0] === "gate") return GateAdmin.showGateAdmin(tg, store, chatId);
    if (rest[0] === "ai") return AIAdmin.showAIAdmin(tg, store, chatId);
    if (rest[0] === "content") return ContentManager.showCategories(tg, store, chatId);
    if (rest[0] === "videos" && CHANNEL_FORWARD_CAPABLE.includes(ctx.platform))
      return VideoAdmin.showVideoFieldsAdmin(tg, store, chatId);
    if (rest[0] === "broadcast") return Admin.startBroadcast(tg, store, chatId);
    if (rest[0] === "stats") return Admin.showStats(tg, store, chatId);
    if (rest[0] === "attract") return AttractAdmin.showAttractHome(tg, store, chatId);
    return;
  }

  // ─── Attract Admin Callbacks ───────────────────────────────────────────────
  if (ns === "attract") {
    const action = rest[0];
    if (action === "home") return AttractAdmin.showAttractHome(tg, store, chatId);
    if (action === "toggle_ad") {
      const cur = await store.getShared("attract:ad_active", "0");
      await store.setShared("attract:ad_active", cur === "1" ? "0" : "1");
      return AttractAdmin.showAttractHome(tg, store, chatId);
    }
    if (action === "toggle_join") {
      const cur = await store.getShared("attract:join_active", "0");
      await store.setShared("attract:join_active", cur === "1" ? "0" : "1");
      return AttractAdmin.showAttractHome(tg, store, chatId);
    }
    if (action === "edit_msg") return AttractAdmin.startEditMsg(tg, store, chatId);
    if (action === "set_target_bot") return AttractAdmin.startSetTargetBot(tg, store, chatId);
    if (action === "display_settings") return AttractAdmin.showDisplaySettings(tg, store, chatId);
    if (action === "add_group") return AttractAdmin.startAddGroup(tg, store, chatId);
    if (action === "list_groups") return AttractAdmin.showGroupList(tg, store, chatId);
    if (action === "stats") return AttractAdmin.showStats(tg, store, chatId);
    if (action === "type_button") {
      await store.setShared("attract:button_type", "button");
      return AttractAdmin.showDisplaySettings(tg, store, chatId);
    }
    if (action === "type_mention") {
      await store.setShared("attract:button_type", "mention");
      return AttractAdmin.showDisplaySettings(tg, store, chatId);
    }
    if (action && action.startsWith("del_") && !action.startsWith("del_group_")) {
      const secs = action.replace("del_", "");
      await store.setShared("attract:delete_after", secs);
      return AttractAdmin.showDisplaySettings(tg, store, chatId);
    }
    if (action && action.startsWith("del_group_")) {
      const idx = parseInt(action.replace("del_group_", ""));
      const groups = await store.getShared("attract:groups", []);
      groups.splice(idx, 1);
      await store.setShared("attract:groups", groups);
      return AttractAdmin.showGroupList(tg, store, chatId);
    }
    return;
  }

  if (ns === "gataddchannel") return GateAdmin.startAddChannel(tg, store, chatId);
  if (ns === "gatedelchannel") return GateAdmin.deleteChannel(tg, store, chatId, Number(rest[0]));
  if (ns === "gatetogglephone") return GateAdmin.toggleRequirePhone(tg, store, chatId);
  if (ns === "gateeditphonemsg") return GateAdmin.startEditPhoneMessage(tg, store, chatId);
  if (ns === "gatephonelist") return GateAdmin.showPhoneList(tg, store, chatId);

  if (ns === "aisetbaseurl") return AIAdmin.startSetField(tg, store, chatId, "baseUrl");
  if (ns === "aisetkey") return AIAdmin.startSetField(tg, store, chatId, "apiKey");
  if (ns === "aisetmodel") return AIAdmin.startSetField(tg, store, chatId, "model");

  if (ns === "accessmenu") return MenuBuilder.showAccessMenu(tg, store, chatId, rest.join(":"));
  if (ns === "accesscycle") return MenuBuilder.cycleAccessMode(tg, store, chatId, rest.join(":"));
  if (ns === "accessusers") return MenuBuilder.showAccessUsers(tg, store, chatId, rest.join(":"));
  if (ns === "accessuseradd") return MenuBuilder.startAddAccessUser(tg, store, chatId, rest.join(":"));
  if (ns === "accessuserdel") return MenuBuilder.deleteAccessUser(tg, store, chatId, rest[0], Number(rest[1]));
  if (ns === "accesschat") return MenuBuilder.startSetApprovalChat(tg, store, chatId, rest.join(":"));
  if (ns === "accessform") return MenuBuilder.startEditApprovalForm(tg, store, chatId, rest.join(":"));

  if (ns === "adminlist") return MenuBuilder.showNodeList(tg, store, chatId, rest.join(":"));
  if (ns === "adminnode") return MenuBuilder.showNodeDetail(tg, store, chatId, rest.join(":"));

  if (ns === "admineditnode") {
    const action = rest[0];
    const nodeId = rest.slice(1).join(":");
    if (action === "title") return MenuBuilder.requestNewTitle(tg, store, chatId, nodeId);
    if (action === "content") return MenuBuilder.requestNewContent(tg, store, chatId, nodeId);
    if (action === "toggle") return MenuBuilder.toggleNode(tg, store, chatId, nodeId);
    if (action === "columns") return MenuBuilder.toggleColumns(tg, store, chatId, nodeId);
    return;
  }

  if (ns === "admindelnode") return MenuBuilder.confirmDelete(tg, store, chatId, rest.join(":"));
  if (ns === "admindelconfirm") return MenuBuilder.performDelete(tg, store, chatId, rest.join(":"));

  if (ns === "adminnewbtn") return MenuBuilder.startNewButton(tg, store, chatId, rest.join(":"));
  if (ns === "adminnewtype") return MenuBuilder.chooseNewButtonType(tg, store, chatId, rest.join(":"));

  if (ns === "adminaddchannelitem") return MenuBuilder.startAddChannelItem(tg, store, chatId, rest.join(":"));

  // ---------------- مدیریت فایل‌های یک دکمه‌ی نوع "file" ----------------
  if (ns === "adminfilelist") return MenuBuilder.showFileList(tg, store, chatId, rest.join(":"));
  if (ns === "adminfileitem") return MenuBuilder.showFileItemDetail(tg, store, chatId, rest[0], Number(rest[1]));
  if (ns === "adminfileadd") return MenuBuilder.startAddFile(tg, store, chatId, rest.join(":"));
  if (ns === "adminfiledel") return MenuBuilder.deleteFile(tg, store, chatId, rest[0], Number(rest[1]));
  if (ns === "adminfilereplace") return MenuBuilder.startReplaceFile(tg, store, chatId, rest[0], Number(rest[1]));

  // ---------------- مدیریت محتوای کل ربات ----------------
  if (ns === "contentcat") return ContentManager.showCategoryItems(tg, store, chatId, rest.join(":"));
  if (ns === "contentitem")
    return ContentManager.showItemDetail(tg, store, chatId, rest[0], Number(rest[1]), { VIDEO_CHANNEL: ctx.videoChannel });
  if (ns === "contentdel") return ContentManager.deleteItem(tg, store, chatId, rest[0], Number(rest[1]));
  if (ns === "contentreplace") return ContentManager.startReplace(tg, store, chatId, rest[0], Number(rest[1]));

  // ---------------- مدیریت ویدیوی اختصاصی (ادمین، فقط تلگرام/بله) ----------------
  if (CHANNEL_FORWARD_CAPABLE.includes(ctx.platform)) {
    if (ns === "adminvfield") return VideoAdmin.showVideoGradesAdmin(tg, store, chatId, rest[0]);
    if (ns === "adminvgrade") return VideoAdmin.showLessonsAdmin(tg, store, chatId, rest[0], rest[1]);
    if (ns === "adminvadd") return VideoAdmin.startAddLesson(tg, store, chatId, rest[0], rest[1]);
    if (ns === "adminvdel") return VideoAdmin.deleteLesson(tg, store, chatId, rest[0], rest[1], Number(rest[2]));
  }
}

async function openNode(ctx, chatId, userId, id) {
  const { tg, store, adminIds } = ctx;
  const nodes = await getNodes(store);
  const node = nodes[id];
  if (!node) return;

  const isAdminUser = Admin.isAdmin(userId, adminIds);

  if (!isAdminUser && node.access && node.access !== "everyone" && !AccessControl.hasAccess(node, userId, store.platform)) {
    if (node.access === "approval") {
      await AccessControl.startAccessRequest(tg, store, chatId, userId, node);
    } else {
      await tg.sendMessage(chatId, "⛔️ شما به این بخش دسترسی ندارید.");
    }
    return;
  }

  if (node.type === "submenu" || node.type === "channel_content") {
    await tg.sendMessage(chatId, `<b>${node.title}</b>`, {
      reply_markup: buildChildrenKeyboard(nodes, node, true, userId, isAdminUser, store.platform),
    });
    return;
  }

  if (node.type === "text") {
    await tg.sendMessage(
      chatId,
      `<b>${node.title}</b>\n\n${node.content || "⚠️ این بخش هنوز توسط ادمین تنظیم نشده است."}`,
      { reply_markup: backButton(`open:${node.parentId}`) }
    );
    return;
  }

  if (node.type === "form") {
    const formDef = await resolveFormDef(store, node);
    await startForm(tg, store, chatId, userId, formDef, `open:${node.parentId}`);
    return;
  }

  if (node.type === "anon_qa") {
    await AnonQA.startAnonQuestion(tg, store, chatId, userId);
    return;
  }

  if (node.type === "video_tree") {
    if (!CHANNEL_FORWARD_CAPABLE.includes(ctx.platform)) {
      await tg.sendMessage(chatId, "⚠️ این بخش فعلاً روی این پلتفرم پشتیبانی نمی‌شود.");
      return;
    }
    await Video.showFields(tg, store, chatId);
    return;
  }

  if (node.type === "contact_request") {
    await Contact.requestContact(tg, store, chatId, userId, node.id);
    return;
  }

  if (node.type === "ai_chat") {
    await AIChat.startAIChat(tg, store, chatId, userId, node);
    return;
  }

  if (node.type === "channel_item") {
    if (!CHANNEL_FORWARD_CAPABLE.includes(ctx.platform)) {
      await tg.sendMessage(chatId, "⚠️ این بخش فعلاً روی این پلتفرم پشتیبانی نمی‌شود.");
      return;
    }
    const parent = nodes[node.parentId];
    const channelUsername = parent?.channelUsernameByPlatform?.[store.platform];
    const messageId = node.messageIdByPlatform?.[store.platform];
    if (!channelUsername || !messageId) {
      await tg.sendMessage(chatId, "⚠️ این محتوا هنوز برای این پلتفرم تنظیم نشده است.");
      return;
    }
    await tg.sendMessage(chatId, `🎬 در حال ارسال: <b>${node.title}</b>`);
    await tg.copyMessage(chatId, `@${channelUsername}`, messageId);
    return;
  }

  if (node.type === "file") {
    const files = node.filesByPlatform?.[store.platform] || [];
    if (!files.length) {
      await tg.sendMessage(chatId, "⚠️ فایلی برای این دکمه روی این پلتفرم تنظیم نشده است.");
      return;
    }
    await tg.sendMessage(chatId, `📎 <b>${node.title}</b>`);
    for (const f of files) {
      await sendFileByType(tg, chatId, f.type, f.fileId);
    }
    return;
  }
}
