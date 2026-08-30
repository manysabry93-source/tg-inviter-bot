// ---------------------------------------------------------------------------
// موتور درخت منو: هر دکمه (چه در ریشه، چه هر چقدر عمیق) یک "نود" است که در
// یک دیکشنری مسطح (id -> node) نگه داشته می‌شود. هر نود parentId خودش را
// دارد و اگر نوعش container باشد (submenu / channel_content) یک آرایه‌ی
// children از idهای زیرشاخه‌هایش دارد. این ساختار اجازه می‌دهد ادمین از
// داخل تلگرام هر عمقی از منو بسازد، ویرایش کند یا حذف کند.
//
// کنترل دسترسی هر دکمه (اختیاری):
//   node.access               -> "everyone" (پیش‌فرض) | "list" | "approval" (مشترک بین پلتفرم‌ها)
//   node.allowedUsersByPlatform  -> {platform: [آیدی‌های مجاز آن پلتفرم]}
//   node.approvalChatIdByPlatform -> {platform: آیدی چت مقصد تایید در آن پلتفرم}
//   node.approvalForm         -> {title, steps:[{key,question}]} (مشترک بین پلتفرم‌ها)
//
// محتوای مخصوص هر پلتفرم (چون file_id/کانال هر پلتفرم فقط برای همان پلتفرم
// معنی دارد)، هرچند خودِ نود مشترک است:
//   node.filesByPlatform            -> {platform: [{type, fileId}, ...]}
//   node.channelUsernameByPlatform  -> {platform: "یوزرنیم کانال"}  (روی channel_content)
//   node.messageIdByPlatform        -> {platform: messageId}       (روی channel_item)
// ---------------------------------------------------------------------------

export const ROOT_ID = "root";

export function genId() {
  return "n" + Math.random().toString(36).slice(2, 9);
}

export async function getNodes(store) {
  return store.getShared("menu:nodes", null);
}

export async function setNodes(store, nodes) {
  await store.setShared("menu:nodes", nodes);
}

// تبدیل ساختار قدیمی (آرایه‌ی تخت items زیر root) به مدل جدید نودها.
// هم برای نصب‌های تازه استفاده می‌شود (از DEFAULT_MENU) و هم برای مهاجرت
// خودکار داده‌ی واقعی که ادمین قبلاً در پنل قدیمی تنظیم کرده بود.
export function buildNodesFromLegacyTree(tree) {
  const nodes = {};
  nodes[ROOT_ID] = {
    id: ROOT_ID,
    parentId: null,
    title: tree.title,
    type: "submenu",
    enabled: true,
    children: tree.items.map((i) => i.id),
  };

  for (const item of tree.items) {
    const base = {
      id: item.id,
      parentId: ROOT_ID,
      title: item.title,
      enabled: item.enabled !== false,
    };

    if (item.type === "form") {
      base.type = "form";
      base.formKey = item.formKey;
    } else if (item.type === "video_tree") {
      base.type = "video_tree";
    } else if (item.type === "anon_qa") {
      base.type = "anon_qa";
    } else {
      const content = (item.content || "").trim();
      if (/^https?:\/\//i.test(content)) {
        base.type = "link_url";
        base.url = content;
      } else {
        base.type = "text";
        base.content = content;
      }
    }

    nodes[item.id] = base;
  }

  return nodes;
}

export function addChildNode(nodes, parentId, node) {
  nodes[node.id] = node;
  if (!nodes[parentId].children) nodes[parentId].children = [];
  nodes[parentId].children.push(node.id);
}

export function removeFromParent(nodes, id) {
  const node = nodes[id];
  if (!node || node.parentId == null) return;
  const parent = nodes[node.parentId];
  if (parent && parent.children) {
    parent.children = parent.children.filter((c) => c !== id);
  }
}

export function deleteNodeRecursive(nodes, id) {
  const node = nodes[id];
  if (!node) return;
  if (node.children) {
    for (const childId of [...node.children]) deleteNodeRecursive(nodes, childId);
  }
  delete nodes[id];
}
