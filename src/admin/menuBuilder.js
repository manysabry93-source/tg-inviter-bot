// ---------------------------------------------------------------------------
// موتور ساخت منو از داخل پنل ادمین. ادمین می‌تواند در هر عمقی از منو،
// دکمه‌ی جدید بسازد و نوعش را انتخاب کند:
//   link_url        -> لینک که با کلیک مستقیم باز می‌شود
//   text            -> نمایش یک متن ثابت
//   form            -> فرم دلخواه با سوالات دلخواه ادمین
//   contact_request -> درخواست شماره تماس کاربر
//   submenu         -> باز کردن یک زیرمنوی جدید (قابل ساخت دکمه داخلش)
//   channel_content -> اتصال به یک کانال؛ محتوای هر دکمه با فوروارد ساخته می‌شود
//   file            -> یک یا چند فایل (عکس/ویدیو/سند) که مستقیم آپلود می‌شوند
//   anon_qa         -> سوال ناشناس
//
// ناوبری در پنل با namespace های جدا انجام می‌شود تا تداخل پیش نیاید:
//   adminlist:<id>  -> نمایش لیست زیر-دکمه‌های نود X
//   adminnode:<id>  -> نمایش صفحه‌ی ویرایش خود نود X
//   adminfilelist:<id> -> مدیریت فایل‌های یک دکمه‌ی نوع "file"
// ---------------------------------------------------------------------------

import { backButton } from "../keyboards.js";
import { extractFile, FILE_TYPE_LABELS, sendFileByType } from "../utils/media.js";
import {
  getNodes,
  setNodes,
  genId,
  addChildNode,
  removeFromParent,
  deleteNodeRecursive,
  ROOT_ID,
} from "../menuNodes.js";

const TYPE_LABELS = {
  submenu: "📂 زیرمنو",
  text: "📝 متن ساده",
  link_url: "🔗 لینک",
  form: "📋 فرم",
  contact_request: "📱 درخواست شماره",
  channel_content: "📡 اتصال به کانال",
  channel_item: "🎬 محتوای کانال",
  file: "📎 فایل (عکس/ویدیو/سند)",
  ai_chat: "🤖 هوش مصنوعی",
  anon_qa: "❓ سوال ناشناس",
  video_tree: "🎥 ویدیو آموزشی (اختصاصی)",
};

// ---------------- مرور لیست زیر-دکمه‌های یک نود ----------------

export async function showNodeList(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const rows = (node.children || []).map((cid) => {
    const c = nodes[cid];
    if (!c) return null;
    const label = `${c.enabled === false ? "🔕" : "✅"} ${c.title} (${TYPE_LABELS[c.type] || c.type})`;
    return [{ text: label, callback_data: `adminnode:${cid}` }];
  }).filter(Boolean);

  if (node.type === "channel_content") {
    rows.push([{ text: "➕ افزودن محتوا از کانال", callback_data: `adminaddchannelitem:${nodeId}` }]);
  } else {
    rows.push([{ text: "➕ افزودن دکمه جدید", callback_data: `adminnewbtn:${nodeId}` }]);
  }

  if (nodeId === ROOT_ID) {
    rows.push([{ text: "🔙 بازگشت به پنل ادمین", callback_data: "admin:home" }]);
  } else {
    rows.push([{ text: "🔙 بازگشت", callback_data: `adminnode:${nodeId}` }]);
  }

  await tg.sendMessage(chatId, `🧩 مدیریت دکمه‌های: <b>${node.title}</b>`, {
    reply_markup: { inline_keyboard: rows },
  });
}

// ---------------- صفحه‌ی ویرایش یک نود ----------------

export async function showNodeDetail(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const rows = [];

  if (node.type === "submenu" || node.type === "channel_content") {
    rows.push([{ text: "📂 مدیریت زیر دکمه‌ها", callback_data: `adminlist:${nodeId}` }]);
    rows.push([
      {
        text: `🔢 چیدمان فعلی: ${node.columns === 1 ? "تک ستونی" : "دو ستونی"} (تغییر بده)`,
        callback_data: `admineditnode:columns:${nodeId}`,
      },
    ]);
  }

  rows.push([{ text: "✏️ تغییر عنوان", callback_data: `admineditnode:title:${nodeId}` }]);

  if (["text", "link_url", "channel_content", "ai_chat"].includes(node.type)) {
    rows.push([{ text: "🔧 تغییر محتوا", callback_data: `admineditnode:content:${nodeId}` }]);
  }

  if (node.type === "file") {
    rows.push([{ text: "📂 مدیریت فایل‌ها", callback_data: `adminfilelist:${nodeId}` }]);
  }

  if (nodeId !== ROOT_ID) {
    rows.push([{ text: "🔐 کنترل دسترسی", callback_data: `accessmenu:${nodeId}` }]);
    rows.push([
      {
        text: node.enabled === false ? "✅ فعال کردن" : "🔕 غیرفعال کردن",
        callback_data: `admineditnode:toggle:${nodeId}`,
      },
    ]);
    rows.push([{ text: "🗑 حذف این دکمه", callback_data: `admindelnode:${nodeId}` }]);
  }

  rows.push([
    {
      text: "🔙 بازگشت",
      callback_data: node.parentId ? `adminlist:${node.parentId}` : "admin:buttons",
    },
  ]);

  await tg.sendMessage(
    chatId,
    `در حال ویرایش: <b>${node.title}</b>\nنوع: ${TYPE_LABELS[node.type] || node.type}`,
    { reply_markup: { inline_keyboard: rows } }
  );
}

export async function toggleNode(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;
  node.enabled = node.enabled === false ? true : false;
  await setNodes(store, nodes);
  await showNodeDetail(tg, store, chatId, nodeId);
}

export async function toggleColumns(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;
  node.columns = node.columns === 1 ? 2 : 1;
  await setNodes(store, nodes);
  await showNodeDetail(tg, store, chatId, nodeId);
}

export async function cancelEdit(tg, store, chatId, nodeId) {
  await store.clearSession(chatId);
  await showNodeDetail(tg, store, chatId, nodeId);
}

// ---------------- حذف نود (با تایید) ----------------

export async function confirmDelete(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;
  await tg.sendMessage(chatId, `⚠️ آیا مطمئنی می‌خوای «${node.title}» (و همه‌ی زیرمجموعه‌هاش) حذف بشه؟`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ بله، حذف کن", callback_data: `admindelconfirm:${nodeId}` }],
        [{ text: "❌ انصراف", callback_data: `adminnode:${nodeId}` }],
      ],
    },
  });
}

export async function performDelete(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;
  const parentId = node.parentId;
  removeFromParent(nodes, nodeId);
  deleteNodeRecursive(nodes, nodeId);
  await setNodes(store, nodes);
  await tg.sendMessage(chatId, "✅ حذف شد.");
  await showNodeList(tg, store, chatId, parentId);
}

// ---------------- ویرایش عنوان/محتوای نود موجود ----------------

export async function requestNewTitle(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_edit_node", field: "title", nodeId });
  await tg.sendMessage(chatId, "عنوان جدید این دکمه را بفرستید:", {
    reply_markup: backButton(`adminnode:${nodeId}`),
  });
}

export async function requestNewContent(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  await store.setSession(chatId, { type: "admin_edit_node", field: "content", nodeId });
  const prompts = {
    text: "متنی که با کلیک این دکمه نمایش داده شود را بفرستید:",
    link_url: "لینک جدید را بفرستید (باید با http یا https شروع شود):",
    channel_content: "نام کاربری کانال جدید را بدون @ بفرستید:",
    ai_chat: "دستورالعمل (system prompt) جدید دستیار هوشمند را بفرستید، یا برای بازگشت به حالت پیش‌فرض بنویسید: /reset",
  };
  await tg.sendMessage(chatId, prompts[node.type] || "مقدار جدید را بفرستید:", {
    reply_markup: backButton(`adminnode:${nodeId}`),
  });
}

export async function handleEditNodeText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_edit_node") return false;

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  if (!node) return false;

  if (session.field === "title") {
    node.title = text;
  } else if (session.field === "content") {
    if (node.type === "link_url") {
      if (!/^https?:\/\//i.test(text.trim())) {
        await tg.sendMessage(chatId, "⚠️ لینک باید با http یا https شروع شود. دوباره بفرستید:");
        return true;
      }
      node.url = text.trim();
    } else if (node.type === "channel_content") {
      node.channelUsernameByPlatform = node.channelUsernameByPlatform || {};
      node.channelUsernameByPlatform[store.platform] = text.trim().replace(/^@/, "");
    } else if (node.type === "ai_chat") {
      if (text.trim() === "/reset") {
        delete node.aiPrompt;
      } else {
        node.aiPrompt = text;
      }
    } else {
      node.content = text;
    }
  }

  await setNodes(store, nodes);
  await store.clearSession(chatId);
  await tg.sendMessage(chatId, "✅ تغییرات ذخیره شد.");
  await showNodeDetail(tg, store, chatId, node.id);
  return true;
}

// ---------------- ساخت دکمه‌ی جدید (ویزارد چندمرحله‌ای) ----------------

export async function startNewButton(tg, store, chatId, parentId) {
  await store.setSession(chatId, { type: "admin_new_button", step: "title", parentId });
  await tg.sendMessage(chatId, "✏️ عنوان دکمه‌ی جدید را بنویسید:", {
    reply_markup: backButton(`adminlist:${parentId}`),
  });
}

function typeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔗 لینک (باز شدن مستقیم)", callback_data: "adminnewtype:link_url" }],
      [{ text: "📝 متن ساده", callback_data: "adminnewtype:text" }],
      [{ text: "📋 فرم (سوال دلخواه از کاربر)", callback_data: "adminnewtype:form" }],
      [{ text: "📎 فایل (یک یا چند عکس/ویدیو/سند)", callback_data: "adminnewtype:file" }],
      [{ text: "🤖 هوش مصنوعی (چت با AI)", callback_data: "adminnewtype:ai_chat" }],
      [{ text: "📱 درخواست شماره تماس", callback_data: "adminnewtype:contact_request" }],
      [{ text: "📂 زیرمنو (دکمه‌های داخلش)", callback_data: "adminnewtype:submenu" }],
      [{ text: "📡 اتصال به کانال", callback_data: "adminnewtype:channel_content" }],
      [{ text: "❓ سوال ناشناس", callback_data: "adminnewtype:anon_qa" }],
    ],
  };
}

export async function handleNewButtonText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_new_button") return false;

  if (session.step === "title") {
    session.title = text;
    session.step = "type";
    await store.setSession(chatId, session);
    await tg.sendMessage(chatId, "نوع این دکمه چیه؟", { reply_markup: typeKeyboard() });
    return true;
  }

  if (session.step === "awaiting_url") {
    if (!/^https?:\/\//i.test(text.trim())) {
      await tg.sendMessage(chatId, "⚠️ لینک باید با http یا https شروع شود. دوباره بفرستید:");
      return true;
    }
    await finalizeNewButton(tg, store, chatId, session, { url: text.trim() });
    return true;
  }

  if (session.step === "awaiting_text") {
    await finalizeNewButton(tg, store, chatId, session, { content: text });
    return true;
  }

  if (session.step === "awaiting_channel") {
    await finalizeNewButton(tg, store, chatId, session, {
      channelUsernameByPlatform: { [store.platform]: text.trim().replace(/^@/, "") },
      children: [],
    });
    return true;
  }

  if (session.step === "awaiting_ai_prompt") {
    if (text.trim() === "/skip") {
      await finalizeNewButton(tg, store, chatId, session, {});
      return true;
    }
    await finalizeNewButton(tg, store, chatId, session, { aiPrompt: text });
    return true;
  }

  if (session.step === "awaiting_files") {
    if (text.trim() === "/done") {
      if (!session.collectedFiles || session.collectedFiles.length === 0) {
        await tg.sendMessage(chatId, "⚠️ حداقل یک فایل لازم است. یک فایل بفرستید:");
        return true;
      }
      await finalizeNewButton(tg, store, chatId, session, {
        filesByPlatform: { [store.platform]: session.collectedFiles },
      });
      return true;
    }
    await tg.sendMessage(chatId, "لطفاً یک فایل (عکس/ویدیو/سند) بفرستید، یا برای پایان بنویسید: /done");
    return true;
  }

  if (session.step === "awaiting_form_questions") {
    if (text.trim() === "/done") {
      if (!session.formQuestions || session.formQuestions.length === 0) {
        await tg.sendMessage(chatId, "⚠️ حداقل یک سوال لازم است. سوال اول را بفرستید:");
        return true;
      }
      await finalizeNewButton(tg, store, chatId, session, {});
      return true;
    }
    if (!session.formQuestions) session.formQuestions = [];
    session.formQuestions.push(text);
    await store.setSession(chatId, session);
    await tg.sendMessage(
      chatId,
      `✅ سوال ${session.formQuestions.length} ثبت شد.\nسوال بعدی را بفرستید، یا برای پایان بنویسید: /done`
    );
    return true;
  }

  return false;
}

export async function handleNewButtonFile(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_new_button" || session.step !== "awaiting_files") return false;

  const file = extractFile(msg);
  if (!file) {
    await tg.sendMessage(chatId, "⚠️ نوع این فایل شناسایی نشد. لطفاً عکس، ویدیو، صدا یا سند بفرستید.");
    return true;
  }

  if (!session.collectedFiles) session.collectedFiles = [];
  session.collectedFiles.push({ type: file.type, fileId: file.fileId });
  await store.setSession(chatId, session);
  await tg.sendMessage(
    chatId,
    `✅ فایل ${session.collectedFiles.length} اضافه شد.\nفایل بعدی را بفرستید، یا برای پایان بنویسید: /done`
  );
  return true;
}

export async function chooseNewButtonType(tg, store, chatId, btnType) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_new_button" || session.step !== "type") return;

  session.btnType = btnType;

  if (btnType === "link_url") {
    session.step = "awaiting_url";
    await store.setSession(chatId, session);
    await tg.sendMessage(chatId, "🔗 لینک را بفرستید (باید با http یا https شروع شود):");
    return;
  }
  if (btnType === "text") {
    session.step = "awaiting_text";
    await store.setSession(chatId, session);
    await tg.sendMessage(chatId, "📝 متنی که با کلیک این دکمه نمایش داده شود را بفرستید:");
    return;
  }
  if (btnType === "file") {
    session.step = "awaiting_files";
    session.collectedFiles = [];
    await store.setSession(chatId, session);
    await tg.sendMessage(
      chatId,
      "📎 عکس، ویدیو یا سندی که می‌خواهید با این دکمه ارسال شود را بفرستید.\nمی‌توانید چند فایل پشت سر هم بفرستید؛ وقتی تمام شد بنویسید: /done"
    );
    return;
  }
  if (btnType === "ai_chat") {
    session.step = "awaiting_ai_prompt";
    await store.setSession(chatId, session);
    await tg.sendMessage(
      chatId,
      "🤖 اگه می‌خوای این دستیار دستورالعمل خاصی داشته باشه (مثلاً «فقط به سوالات ریاضی جواب بده») بفرست، یا برای استفاده از حالت پیش‌فرض (دستیار آموزشی عمومی) بنویس: /skip"
    );
    return;
  }
  if (btnType === "channel_content") {
    session.step = "awaiting_channel";
    await store.setSession(chatId, session);
    await tg.sendMessage(chatId, "📡 نام کاربری کانال را بدون @ بفرستید (مثلاً: fara_video):");
    return;
  }
  if (btnType === "form") {
    session.step = "awaiting_form_questions";
    session.formQuestions = [];
    await store.setSession(chatId, session);
    await tg.sendMessage(
      chatId,
      "📋 سوالات فرم را یکی‌یکی بفرستید (هر پیام یعنی یک سوال).\nوقتی تمام شد بنویسید: /done"
    );
    return;
  }

  // انواعی که مرحله‌ی اضافه لازم ندارند: contact_request, submenu, anon_qa
  await finalizeNewButton(tg, store, chatId, session, btnType === "submenu" ? { children: [] } : {});
}

async function finalizeNewButton(tg, store, chatId, session, extra) {
  const nodes = await getNodes(store);
  const id = genId();

  const node = {
    id,
    parentId: session.parentId,
    title: session.title,
    type: session.btnType,
    enabled: true,
    ...extra,
  };

  addChildNode(nodes, session.parentId, node);
  await setNodes(store, nodes);

  if (session.btnType === "form") {
    const customForms = await store.getShared("forms:custom", {});
    customForms[id] = {
      title: session.title,
      steps: session.formQuestions.map((q, i) => ({ key: `q${i}`, question: q })),
    };
    await store.setShared("forms:custom", customForms);
  }

  await store.clearSession(chatId);
  await tg.sendMessage(chatId, `✅ دکمه‌ی «${session.title}» ساخته شد.`);
  await showNodeList(tg, store, chatId, session.parentId);
}

// ---------------- مدیریت فایل‌های یک دکمه‌ی نوع "file" (افزودن/حذف/جایگزینی) ----------------
// فایل‌ها مخصوص همان پلتفرمی هستند که آپلود شده‌اند (چون file_id هر پلتفرم
// فقط برای همان پلتفرم معنی دارد)، پس داخل filesByPlatform[پلتفرم] نگه
// داشته می‌شوند، هرچند خودِ دکمه (node) بین همه‌ی پلتفرم‌ها مشترک است.

function getPlatformFiles(node, store) {
  return (node.filesByPlatform && node.filesByPlatform[store.platform]) || [];
}

export async function showFileList(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const files = getPlatformFiles(node, store);
  const rows = files.map((f, i) => [
    { text: `${FILE_TYPE_LABELS[f.type] || f.type} #${i + 1}`, callback_data: `adminfileitem:${nodeId}:${i}` },
  ]);
  rows.push([{ text: "➕ افزودن فایل جدید", callback_data: `adminfileadd:${nodeId}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: `adminnode:${nodeId}` }]);

  await tg.sendMessage(
    chatId,
    `📂 فایل‌های دکمه‌ی «${node.title}» روی این پلتفرم (${files.length} فایل):`,
    { reply_markup: { inline_keyboard: rows } }
  );
}

export async function showFileItemDetail(tg, store, chatId, nodeId, idx) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;
  const file = getPlatformFiles(node, store)[idx];
  if (!file) return;

  await sendFileByType(tg, chatId, file.type, file.fileId);

  await tg.sendMessage(chatId, `مدیریت فایل #${idx + 1} از «${node.title}»:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔁 جایگزینی این فایل", callback_data: `adminfilereplace:${nodeId}:${idx}` }],
        [{ text: "🗑 حذف این فایل", callback_data: `adminfiledel:${nodeId}:${idx}` }],
        [{ text: "🔙 بازگشت", callback_data: `adminfilelist:${nodeId}` }],
      ],
    },
  });
}

export async function deleteFile(tg, store, chatId, nodeId, idx) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node || !node.filesByPlatform?.[store.platform]) return;
  node.filesByPlatform[store.platform].splice(idx, 1);
  await setNodes(store, nodes);
  await tg.sendMessage(chatId, "✅ فایل حذف شد.");
  await showFileList(tg, store, chatId, nodeId);
}

export async function startAddFile(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_add_file", nodeId });
  await tg.sendMessage(
    chatId,
    "📎 فایل جدید را بفرستید. می‌توانید چند فایل پشت‌سرهم بفرستید؛ در پایان بنویسید: /done"
  );
}

export async function handleAddFileText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_add_file") return false;
  if (text.trim() !== "/done") {
    await tg.sendMessage(chatId, "لطفاً یک فایل بفرستید یا برای پایان بنویسید: /done");
    return true;
  }
  await store.clearSession(chatId);
  await showFileList(tg, store, chatId, session.nodeId);
  return true;
}

export async function handleAddFileFile(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_add_file") return false;

  const file = extractFile(msg);
  if (!file) {
    await tg.sendMessage(chatId, "⚠️ نوع این فایل شناسایی نشد.");
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  node.filesByPlatform = node.filesByPlatform || {};
  node.filesByPlatform[store.platform] = node.filesByPlatform[store.platform] || [];
  node.filesByPlatform[store.platform].push({ type: file.type, fileId: file.fileId });
  await setNodes(store, nodes);

  await tg.sendMessage(
    chatId,
    `✅ اضافه شد (تعداد فعلی: ${node.filesByPlatform[store.platform].length}). فایل بعدی را بفرستید یا بنویسید: /done`
  );
  return true;
}

export async function startReplaceFile(tg, store, chatId, nodeId, idx) {
  await store.setSession(chatId, { type: "admin_replace_file", nodeId, idx });
  await tg.sendMessage(chatId, "فایل جدید را بفرستید تا جایگزین فایل قبلی شود:");
}

export async function handleReplaceFileFile(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_replace_file") return false;

  const file = extractFile(msg);
  if (!file) {
    await tg.sendMessage(chatId, "⚠️ نوع این فایل شناسایی نشد.");
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  node.filesByPlatform[store.platform][session.idx] = { type: file.type, fileId: file.fileId };
  await setNodes(store, nodes);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, "✅ جایگزین شد.");
  await showFileList(tg, store, chatId, session.nodeId);
  return true;
}

// ---------------- افزودن محتوا به دکمه‌ی متصل به کانال (با فوروارد) ----------------

export async function startAddChannelItem(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_channel_item", step: "title", nodeId });
  await tg.sendMessage(chatId, "✏️ عنوان این محتوا را بنویسید:", {
    reply_markup: backButton(`adminlist:${nodeId}`),
  });
}

export async function handleChannelItemText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_channel_item" || session.step !== "title") return false;

  session.step = "awaiting_forward";
  session.title = text;
  await store.setSession(chatId, session);

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  const channelUsername = node.channelUsernameByPlatform?.[store.platform];

  if (!channelUsername) {
    await tg.sendMessage(
      chatId,
      "⚠️ هنوز برای این پلتفرم نام کانالی تنظیم نشده. اول از «🔧 تغییر محتوا» نام کانال مخصوص این پلتفرم را تنظیم کنید."
    );
    await store.clearSession(chatId);
    return true;
  }

  await tg.sendMessage(
    chatId,
    `حالا محتوای «<b>${text}</b>» را از کانال @${channelUsername} به همین چت <b>فوروارد</b> کنید.`
  );
  return true;
}

export async function handleChannelItemForward(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_channel_item" || session.step !== "awaiting_forward") {
    return false;
  }

  const forwardedMessageId =
    msg.forward_from_message_id ||
    msg.forward_origin?.message_id ||
    (msg.forward_origin?.type === "channel" ? msg.forward_origin.message_id : null);

  if (!forwardedMessageId) {
    await tg.sendMessage(chatId, "⚠️ این پیام به‌عنوان فوروارد شناسایی نشد. لطفاً مستقیماً از کانال فوروارد کنید.");
    return true;
  }

  const nodes = await getNodes(store);
  const id = genId();
  const itemNode = {
    id,
    parentId: session.nodeId,
    title: session.title,
    type: "channel_item",
    enabled: true,
    messageIdByPlatform: { [store.platform]: forwardedMessageId },
  };
  addChildNode(nodes, session.nodeId, itemNode);
  await setNodes(store, nodes);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, `✅ «${session.title}» اضافه شد.`);
  await showNodeList(tg, store, chatId, session.nodeId);
  return true;
}

// ---------------------------------------------------------------------------
// کنترل دسترسی هر دکمه: همه / لیست خاص / با تایید ادمین
// ---------------------------------------------------------------------------

const ACCESS_LABELS = {
  everyone: "🌍 همه",
  list: "👥 لیست خاص",
  approval: "✅ با تایید ادمین",
};
const ACCESS_ORDER = ["everyone", "list", "approval"];

export async function showAccessMenu(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const mode = node.access || "everyone";
  const allowedUsers = node.allowedUsersByPlatform?.[store.platform] || [];
  const rows = [[{ text: `حالت فعلی: ${ACCESS_LABELS[mode]} (تغییر بده)`, callback_data: `accesscycle:${nodeId}` }]];

  if (mode === "list" || mode === "approval") {
    rows.push([
      {
        text: `👥 مدیریت کاربران مجاز این پلتفرم (${allowedUsers.length})`,
        callback_data: `accessusers:${nodeId}`,
      },
    ]);
  }
  if (mode === "approval") {
    rows.push([{ text: "📩 تنظیم چت مقصد درخواست‌ها (این پلتفرم)", callback_data: `accesschat:${nodeId}` }]);
    rows.push([{ text: "📋 ویرایش فرم درخواست دسترسی", callback_data: `accessform:${nodeId}` }]);
  }
  rows.push([{ text: "🔙 بازگشت", callback_data: `adminnode:${nodeId}` }]);

  const explain = {
    everyone: "همه‌ی کاربران بدون محدودیت می‌توانند از این دکمه استفاده کنند.",
    list: "فقط کاربرانی که آیدی عددی‌شان را زیر اضافه کنید می‌توانند از این دکمه استفاده کنند (لیست مخصوص همین پلتفرم است؛ چون آیدی هر پلتفرم جداست، باید برای هر پلتفرم جدا اضافه کنید).",
    approval:
      "هر کاربری می‌تواند درخواست بدهد؛ باید فرمی را پر کند، درخواستش برای تایید ارسال می‌شود، و با تایید شما در همین پلتفرم به‌طور دائم دسترسی پیدا می‌کند.",
  };

  await tg.sendMessage(chatId, `🔐 <b>کنترل دسترسی: ${node.title}</b>\n\n${explain[mode]}`, {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function cycleAccessMode(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const current = ACCESS_ORDER.indexOf(node.access || "everyone");
  node.access = ACCESS_ORDER[(current + 1) % ACCESS_ORDER.length];
  if (node.access === "list" || node.access === "approval") {
    node.allowedUsersByPlatform = node.allowedUsersByPlatform || {};
    node.allowedUsersByPlatform[store.platform] = node.allowedUsersByPlatform[store.platform] || [];
  }
  await setNodes(store, nodes);
  await showAccessMenu(tg, store, chatId, nodeId);
}

export async function showAccessUsers(tg, store, chatId, nodeId) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (!node) return;

  const allowedUsers = node.allowedUsersByPlatform?.[store.platform] || [];
  const rows = allowedUsers.map((uid, i) => [
    { text: `🗑 ${uid}`, callback_data: `accessuserdel:${nodeId}:${i}` },
  ]);
  rows.push([{ text: "➕ افزودن کاربر (با آیدی عددی)", callback_data: `accessuseradd:${nodeId}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: `accessmenu:${nodeId}` }]);

  await tg.sendMessage(chatId, `👥 کاربران مجاز «${node.title}» (این پلتفرم):`, { reply_markup: { inline_keyboard: rows } });
}

export async function startAddAccessUser(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_access_user_add", nodeId });
  await tg.sendMessage(chatId, "🆔 آیدی عددی کاربری که می‌خواهید اضافه کنید را بفرستید (کاربر می‌تواند با /myid آن را پیدا کند):");
}

export async function handleAddAccessUserText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_access_user_add") return false;

  const uid = text.trim().replace(/[^0-9]/g, "");
  if (!uid) {
    await tg.sendMessage(chatId, "⚠️ لطفاً فقط آیدی عددی بفرستید.");
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  node.allowedUsersByPlatform = node.allowedUsersByPlatform || {};
  node.allowedUsersByPlatform[store.platform] = node.allowedUsersByPlatform[store.platform] || [];
  if (!node.allowedUsersByPlatform[store.platform].includes(uid)) {
    node.allowedUsersByPlatform[store.platform].push(uid);
  }
  await setNodes(store, nodes);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, `✅ کاربر ${uid} اضافه شد.`);
  await showAccessUsers(tg, store, chatId, session.nodeId);
  return true;
}

export async function deleteAccessUser(tg, store, chatId, nodeId, idx) {
  const nodes = await getNodes(store);
  const node = nodes[nodeId];
  if (node?.allowedUsersByPlatform?.[store.platform]) {
    node.allowedUsersByPlatform[store.platform].splice(idx, 1);
    await setNodes(store, nodes);
  }
  await showAccessUsers(tg, store, chatId, nodeId);
}

export async function startSetApprovalChat(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_access_chat", nodeId });
  await tg.sendMessage(
    chatId,
    "🆔 آیدی عددی چتی که باید درخواست‌های تایید این دکمه (روی این پلتفرم) برایش ارسال شود را بفرستید (می‌توانید آیدی خودتان را با /myid بگیرید):"
  );
}

export async function handleSetApprovalChatText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_access_chat") return false;

  const chatIdValue = text.trim().replace(/[^0-9-]/g, "");
  if (!chatIdValue) {
    await tg.sendMessage(chatId, "⚠️ لطفاً فقط آیدی عددی بفرستید.");
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  node.approvalChatIdByPlatform = node.approvalChatIdByPlatform || {};
  node.approvalChatIdByPlatform[store.platform] = chatIdValue;
  await setNodes(store, nodes);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, "✅ ذخیره شد.");
  await showAccessMenu(tg, store, chatId, session.nodeId);
  return true;
}

export async function startEditApprovalForm(tg, store, chatId, nodeId) {
  await store.setSession(chatId, { type: "admin_access_form", nodeId, questions: [] });
  await tg.sendMessage(
    chatId,
    "📋 سوالات فرمی که کاربر قبل از ارسال درخواست باید پر کند را یکی‌یکی بفرستید.\nوقتی تمام شد بنویسید: /done"
  );
}

export async function handleEditApprovalFormText(tg, store, chatId, text) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_access_form") return false;

  if (text.trim() === "/done") {
    if (!session.questions.length) {
      await tg.sendMessage(chatId, "⚠️ حداقل یک سوال لازم است. سوال اول را بفرستید:");
      return true;
    }
    const nodes = await getNodes(store);
    const node = nodes[session.nodeId];
    node.approvalForm = {
      title: node.approvalForm?.title || "🔐 درخواست دسترسی",
      steps: session.questions.map((q, i) => ({ key: `q${i}`, question: q })),
    };
    await setNodes(store, nodes);
    await store.clearSession(chatId);

    await tg.sendMessage(chatId, "✅ فرم ذخیره شد.");
    await showAccessMenu(tg, store, chatId, session.nodeId);
    return true;
  }

  session.questions.push(text);
  await store.setSession(chatId, session);
  await tg.sendMessage(chatId, `✅ سوال ${session.questions.length} ثبت شد.\nسوال بعدی، یا برای پایان: /done`);
  return true;
}
