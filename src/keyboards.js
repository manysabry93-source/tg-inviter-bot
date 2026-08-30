// ---------------------------------------------------------------------------
// ساخت کیبوردهای inline بر اساس درخت نودهای منو (src/menuNodes.js).
// چیدمان ۲ ستونی مطابق طرح اصلی حفظ شده است. دکمه‌های نوع "link_url" با
// فیلد url رندر می‌شوند تا با یک کلیک مستقیم لینک باز شود (بدون این‌که
// ربات پیامی با متن لینک نمایش دهد).
// ---------------------------------------------------------------------------

import { hasAccess } from "./features/accessControl.js";

function childButton(node) {
  if (node.type === "link_url" && node.url) {
    return { text: node.title, url: node.url };
  }
  return { text: node.title, callback_data: `open:${node.id}` };
}

export function buildChildrenKeyboard(nodes, node, includeBack = true, userId = null, isAdminUser = false, platform = null) {
  const columns = node.columns === 1 ? 1 : 2;
  const rows = [];
  const children = (node.children || [])
    .map((id) => nodes[id])
    .filter((n) => n && n.enabled !== false)
    .filter((n) => isAdminUser || n.access !== "list" || hasAccess(n, userId, platform));

  for (let i = 0; i < children.length; i += columns) {
    const row = [childButton(children[i])];
    if (columns === 2 && children[i + 1]) row.push(childButton(children[i + 1]));
    rows.push(row);
  }

  if (includeBack && node.parentId) {
    rows.push([{ text: "🔙 بازگشت", callback_data: `open:${node.parentId}` }]);
  }

  return { inline_keyboard: rows };
}

export function buildSimpleList(list, prefix, extraRow = []) {
  const rows = list.map((label, idx) => [
    { text: label, callback_data: `${prefix}:${idx}` },
  ]);
  if (extraRow.length) rows.push(extraRow);
  return { inline_keyboard: rows };
}

export function backButton(target = "open:root") {
  return { inline_keyboard: [[{ text: "🔙 بازگشت", callback_data: target }]] };
}

export function adminMainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🧩 مدیریت دکمه‌ها", callback_data: "admin:buttons" }],
      [{ text: "🔒 دسترسی اجباری (کانال/شماره)", callback_data: "admin:gate" }],
      [{ text: "🤖 تنظیمات هوش مصنوعی", callback_data: "admin:ai" }],
      [{ text: "📁 مدیریت محتوا", callback_data: "admin:content" }],
      [{ text: "🎥 افزودن ویدیوی آموزشی جدید", callback_data: "admin:videos" }],
      [{ text: "📢 ارسال اطلاعیه (Broadcast)", callback_data: "admin:broadcast" }],
      [{ text: "📊 آمار ربات", callback_data: "admin:stats" }],
      [{ text: "🎯 جذب ممبر", callback_data: "admin:attract" }],
    ],
  };
}
