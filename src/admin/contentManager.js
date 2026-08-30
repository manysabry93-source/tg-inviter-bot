// ---------------------------------------------------------------------------
// مدیریت محتوا: یک نمای کلی از تمام محتوای رسانه‌ای ثبت‌شده در این پلتفرم —
// فایل‌های روی دکمه‌ها، محتوای متصل به کانال‌ها، و ویدیوهای آموزشی قدیمی —
// تفکیک‌شده بر اساس نوع (عکس/ویدیو/سند/صدا/ویس/محتوای کانال)، با امکان
// پیش‌نمایش، حذف، و جایگزینی. چون فایل‌ها و کانال‌ها مخصوص هر پلتفرم هستند،
// این نما فقط محتوای همین پلتفرمی که از آن باز شده را نشان می‌دهد.
// ---------------------------------------------------------------------------

import { getNodes, setNodes, removeFromParent, deleteNodeRecursive } from "../menuNodes.js";
import { sendFileByType, extractFile } from "../utils/media.js";

const CATEGORY_LABELS = {
  photo: "📷 عکس‌ها",
  video: "🎬 ویدیوها",
  document: "📄 اسناد",
  audio: "🎵 صداها",
  voice: "🎙 ویس‌ها",
  animation: "🎞 گیف‌ها",
  channel: "📡 محتوای متصل به کانال",
};

async function collectMedia(store) {
  const nodes = await getNodes(store);
  const entries = [];

  for (const node of Object.values(nodes)) {
    if (node.type === "file") {
      const files = node.filesByPlatform?.[store.platform] || [];
      files.forEach((f, idx) => {
        entries.push({
          kind: "button_file",
          category: f.type,
          label: `📎 ${node.title} (#${idx + 1})`,
          nodeId: node.id,
          fileIndex: idx,
        });
      });
    }
    if (node.type === "channel_item") {
      const parent = nodes[node.parentId];
      const channelUsername = parent?.channelUsernameByPlatform?.[store.platform];
      if (!channelUsername || !node.messageIdByPlatform?.[store.platform]) continue;
      entries.push({
        kind: "channel_item",
        category: "channel",
        label: `📡 ${node.title} (@${channelUsername})`,
        nodeId: node.id,
      });
    }
  }

  const videoTree = await store.get("video:tree", { videos: {} });
  for (const field of Object.keys(videoTree.videos || {})) {
    for (const grade of Object.keys(videoTree.videos[field] || {})) {
      (videoTree.videos[field][grade] || []).forEach((lesson, idx) => {
        entries.push({
          kind: "legacy_video",
          category: "channel",
          label: `🎥 ${field} - ${grade} - ${lesson.title}`,
          field,
          grade,
          index: idx,
        });
      });
    }
  }

  return entries;
}

export async function showCategories(tg, store, chatId) {
  const entries = await collectMedia(store);
  const counts = {};
  for (const e of entries) counts[e.category] = (counts[e.category] || 0) + 1;

  const rows = Object.keys(CATEGORY_LABELS)
    .filter((cat) => counts[cat] > 0)
    .map((cat) => [{ text: `${CATEGORY_LABELS[cat]} (${counts[cat]})`, callback_data: `contentcat:${cat}` }]);

  if (rows.length === 0) {
    await tg.sendMessage(chatId, "📁 هنوز هیچ محتوایی (فایل/ویدیو) روی این پلتفرم ثبت نشده است.", {
      reply_markup: { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: "admin:home" }]] },
    });
    return;
  }

  rows.push([{ text: "🔙 بازگشت", callback_data: "admin:home" }]);
  await tg.sendMessage(chatId, "📁 <b>مدیریت محتوا</b>\n\nمحتوای این پلتفرم، دسته‌بندی‌شده:", {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showCategoryItems(tg, store, chatId, category) {
  const entries = (await collectMedia(store)).filter((e) => e.category === category);
  const rows = entries.map((e, i) => [{ text: e.label, callback_data: `contentitem:${category}:${i}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: "admin:content" }]);

  await tg.sendMessage(chatId, `${CATEGORY_LABELS[category]} — ${entries.length} مورد:`, {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function showItemDetail(tg, store, chatId, category, index, env) {
  const entries = (await collectMedia(store)).filter((e) => e.category === category);
  const entry = entries[index];
  if (!entry) return;

  await sendPreview(tg, store, chatId, entry, env);

  const rows = [];
  if (entry.kind === "button_file") {
    rows.push([{ text: "🔁 جایگزینی این فایل", callback_data: `contentreplace:${category}:${index}` }]);
  }
  rows.push([{ text: "🗑 حذف", callback_data: `contentdel:${category}:${index}` }]);
  rows.push([{ text: "🔙 بازگشت", callback_data: `contentcat:${category}` }]);

  await tg.sendMessage(chatId, `مدیریت: <b>${entry.label}</b>`, {
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendPreview(tg, store, chatId, entry, env) {
  if (entry.kind === "button_file") {
    const nodes = await getNodes(store);
    const file = nodes[entry.nodeId]?.filesByPlatform?.[store.platform]?.[entry.fileIndex];
    if (file) await sendFileByType(tg, chatId, file.type, file.fileId);
  } else if (entry.kind === "channel_item") {
    const nodes = await getNodes(store);
    const node = nodes[entry.nodeId];
    const parent = nodes[node.parentId];
    const channelUsername = parent.channelUsernameByPlatform?.[store.platform];
    const messageId = node.messageIdByPlatform?.[store.platform];
    if (channelUsername && messageId) await tg.copyMessage(chatId, `@${channelUsername}`, messageId);
  } else if (entry.kind === "legacy_video") {
    const videoTree = await store.get("video:tree");
    const lesson = videoTree.videos[entry.field][entry.grade][entry.index];
    await tg.copyMessage(chatId, `@${env.VIDEO_CHANNEL}`, lesson.messageId);
  }
}

export async function deleteItem(tg, store, chatId, category, index) {
  const entries = (await collectMedia(store)).filter((e) => e.category === category);
  const entry = entries[index];
  if (!entry) return;

  if (entry.kind === "button_file") {
    const nodes = await getNodes(store);
    const node = nodes[entry.nodeId];
    node.filesByPlatform[store.platform].splice(entry.fileIndex, 1);
    await setNodes(store, nodes);
  } else if (entry.kind === "channel_item") {
    const nodes = await getNodes(store);
    removeFromParent(nodes, entry.nodeId);
    deleteNodeRecursive(nodes, entry.nodeId);
    await setNodes(store, nodes);
  } else if (entry.kind === "legacy_video") {
    const videoTree = await store.get("video:tree");
    videoTree.videos[entry.field][entry.grade].splice(entry.index, 1);
    await store.set("video:tree", videoTree);
  }

  await tg.sendMessage(chatId, "✅ حذف شد.");
  await showCategoryItems(tg, store, chatId, category);
}

export async function startReplace(tg, store, chatId, category, index) {
  const entries = (await collectMedia(store)).filter((e) => e.category === category);
  const entry = entries[index];
  if (!entry || entry.kind !== "button_file") return;

  await store.setSession(chatId, {
    type: "admin_content_replace",
    nodeId: entry.nodeId,
    fileIndex: entry.fileIndex,
    category,
  });
  await tg.sendMessage(chatId, "فایل جدید را بفرستید تا جایگزین فایل قبلی شود:");
}

export async function handleReplaceFile(tg, store, chatId, msg) {
  const session = await store.getSession(chatId);
  if (!session || session.type !== "admin_content_replace") return false;

  const file = extractFile(msg);
  if (!file) {
    await tg.sendMessage(chatId, "⚠️ نوع این فایل شناسایی نشد.");
    return true;
  }

  const nodes = await getNodes(store);
  const node = nodes[session.nodeId];
  node.filesByPlatform[store.platform][session.fileIndex] = { type: file.type, fileId: file.fileId };
  await setNodes(store, nodes);
  await store.clearSession(chatId);

  await tg.sendMessage(chatId, "✅ جایگزین شد.");
  await showCategoryItems(tg, store, chatId, session.category);
  return true;
}
