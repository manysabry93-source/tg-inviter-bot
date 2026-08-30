import { handleUpdate } from "./router.js";
import { TG } from "./utils/telegram.js";
import { Store } from "./storage/kv.js";
import { RubikaClient, normalizeRubikaUpdate, normalizeRubikaPollItem } from "./platforms/rubika.js";

// ---------------------------------------------------------------------------
// این Worker از سه پلتفرم پشتیبانی می‌کند. هر پلتفرم یک مسیر وبهوک و یک
// مسیر setup جدا دارد. داده‌های کاربران، سشن‌ها، و گیت دسترسی برای هر
// پلتفرم کاملاً مستقل نگه داشته می‌شود، ولی ساختار منو (دکمه‌ها/زیرمنوها/
// فرم‌ها) بین هر سه پلتفرم مشترک است (نگاه کنید به src/storage/kv.js و
// src/menuNodes.js) — یعنی تغییر ساختار دکمه از هر پلتفرمی، همه‌جا اعمال
// می‌شود. فقط محتوای ذاتاً مخصوص یک پلتفرم (فایل‌های آپلودی، کاربران مجاز،
// کانال متصل) در همان نود ولی به‌صورت جدا برای هر پلتفرم ذخیره می‌شود.
//
// تلگرام: /webhook          setup: /setup
// بله:    /webhook/bale     setup: /setup/bale
// روبیکا: /webhook/rubika   setup: /setup/rubika
// ---------------------------------------------------------------------------

function buildTelegramCtx(env, originUrl) {
  return {
    tg: new TG(env.BOT_TOKEN),
    store: new Store(env, "tg"),
    adminIds: (env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    videoChannel: env.VIDEO_CHANNEL,
    platform: "telegram",
    originUrl,
    env,
  };
}

function buildBaleCtx(env, originUrl) {
  return {
    tg: new TG(env.BALE_BOT_TOKEN, "https://tapi.bale.ai"),
    store: new Store(env, "bale"),
    adminIds: (env.BALE_ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    videoChannel: env.BALE_VIDEO_CHANNEL,
    platform: "bale",
    originUrl,
    env,
  };
}

function buildRubikaCtx(env, originUrl) {
  return {
    tg: new RubikaClient(env.RUBIKA_BOT_TOKEN),
    store: new Store(env, "rubika"),
    adminIds: (env.RUBIKA_ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),
    videoChannel: null,
    platform: "rubika",
    originUrl,
    env,
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---------------- راه‌اندازی وبهوک (فقط یک‌بار، با باز کردن در مرورگر) ----------------
    if (url.pathname === "/setup") {
      const pCtx = buildTelegramCtx(env, url.origin);
      const res = await pCtx.tg.call("setWebhook", {
        url: `${url.origin}/webhook`,
        allowed_updates: ["message", "callback_query", "chat_join_request"]
      });
      return jsonResponse(res);
    }
    if (url.pathname === "/setup/bale") {
      const pCtx = buildBaleCtx(env, url.origin);
      const res = await pCtx.tg.setWebhook(`${url.origin}/webhook/bale`);
      return jsonResponse(res);
    }
    if (url.pathname === "/setup/rubika") {
      const pCtx = buildRubikaCtx(env, url.origin);
      const res = await pCtx.tg.setWebhook(`${url.origin}/webhook/rubika`);
      return jsonResponse(res);
    }

    // ---------------- وبهوک‌های دریافت پیام ----------------
    if (url.pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, ctx, async (body) => {
        const pCtx = buildTelegramCtx(env, url.origin);
        return handleUpdate(body, pCtx);
      });
    }

    if (url.pathname === "/webhook/bale" && request.method === "POST") {
      return handleWebhook(request, ctx, async (body) => {
        const pCtx = buildBaleCtx(env, url.origin);
        return handleUpdate(body, pCtx);
      });
    }

    if (url.pathname === "/webhook/rubika" && request.method === "POST") {
      return handleWebhook(request, ctx, async (body) => {
        const normalized = normalizeRubikaUpdate(body);
        const pCtx = buildRubikaCtx(env, url.origin);
        return handleUpdate(normalized, pCtx);
      });
    }

    if (url.pathname === "/poll/rubika") {
      await pollRubika(env);
      return new Response("polled");
    }

    return new Response("Farahoosh Bot is running ✅ (telegram / bale / rubika)");
  },

  // ---------------------------------------------------------------------
  // چون وبهوک روبیکا پیام‌های معمولی (متن، شروع چت، عکس) را ارسال نمی‌کند
  // (فقط کلیک روی دکمه‌ی این‌لاین)، هر یک دقیقه با getUpdates چک می‌کنیم
  // که پیام جدیدی رسیده یا نه. این تنظیم در wrangler.toml (بخش [triggers])
  // فعال شده است.
  // ---------------------------------------------------------------------
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pollRubika(env));
  },
};

async function pollRubika(env) {
  if (!env.RUBIKA_BOT_TOKEN) return;

  const store = new Store(env, "rubika");
  const tg = new RubikaClient(env.RUBIKA_BOT_TOKEN);
  const adminIds = (env.RUBIKA_ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

  const lastOffset = await store.get("poll:offset", null);
  const res = await tg.getUpdates(lastOffset);

  if (!res.ok || !res.result?.updates) {
    if (!res.ok) console.error("Rubika poll error:", JSON.stringify(res));
    return;
  }

  for (const item of res.result.updates) {
    const normalized = normalizeRubikaPollItem(item);
    if (!normalized || (!normalized.message && !normalized.callback_query)) continue;

    const pCtx = {
      tg,
      store,
      adminIds,
      videoChannel: null,
      platform: "rubika",
      originUrl: "", // در polling نیازی به originUrl نیست (فقط برای callback پرداخت لازم می‌شود)
      env,
    };

    try {
      await handleUpdate(normalized, pCtx);
    } catch (err) {
      console.error("Rubika poll handleUpdate error:", err.message);
    }
  }

  if (res.result.next_offset_id) {
    await store.set("poll:offset", res.result.next_offset_id);
  }
}

async function handleWebhook(request, ctx, process) {
  try {
    const body = await request.json();
    // ctx.waitUntil تضمین می‌کند پردازش کامل شود حتی اگر پلتفرم زودتر
    // پاسخ Worker را ببندد
    ctx.waitUntil(process(body));
    return new Response("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("error", { status: 200 }); // 200 تا پلتفرم دوباره تلاش نکند
  }
}

function jsonResponse(data) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
