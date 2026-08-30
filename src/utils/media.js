// ---------------------------------------------------------------------------
// ابزارهای مشترک برای کار با فایل/رسانه در پیام‌های تلگرام. هم موتور ساخت
// دکمه، هم مدیریت محتوا، و هم Broadcast از همین دو تابع استفاده می‌کنند.
// ---------------------------------------------------------------------------

export function extractFile(msg) {
  if (msg.photo && msg.photo.length) {
    const largest = msg.photo[msg.photo.length - 1];
    return { type: "photo", fileId: largest.file_id };
  }
  if (msg.document) return { type: "document", fileId: msg.document.file_id };
  if (msg.video) return { type: "video", fileId: msg.video.file_id };
  if (msg.audio) return { type: "audio", fileId: msg.audio.file_id };
  if (msg.voice) return { type: "voice", fileId: msg.voice.file_id };
  if (msg.animation) return { type: "animation", fileId: msg.animation.file_id };
  return null;
}

const METHOD_MAP = {
  photo: "sendPhoto",
  document: "sendDocument",
  video: "sendVideo",
  audio: "sendAudio",
  voice: "sendVoice",
  animation: "sendAnimation",
};

const FIELD_MAP = {
  photo: "photo",
  document: "document",
  video: "video",
  audio: "audio",
  voice: "voice",
  animation: "animation",
};

export async function sendFileByType(tg, chatId, fileType, fileId, caption, replyMarkup) {
  const method = METHOD_MAP[fileType] || "sendDocument";
  const field = FIELD_MAP[fileType] || "document";
  const payload = { chat_id: chatId, [field]: fileId };
  if (caption) payload.caption = caption;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return tg.call(method, payload);
}

export const FILE_TYPE_LABELS = {
  photo: "📷 عکس",
  video: "🎬 ویدیو",
  document: "📄 سند",
  audio: "🎵 صدا",
  voice: "🎙 ویس",
  animation: "🎞 گیف",
};
