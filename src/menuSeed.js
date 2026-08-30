// ---------------------------------------------------------------------------
// ساختار پیش‌فرض منو. این فقط "بذر" اولیه است — بعد از اولین اجرا در KV
// ذخیره می‌شود و از آن به بعد ادمین از داخل تلگرام هر بخشش را ویرایش می‌کند
// (متن دکمه، لینک، ترتیب، فعال/غیرفعال) بدون نیاز به تغییر کد یا ری‌دیپلوی.
// ---------------------------------------------------------------------------

// type های ممکن هر آیتم منو:
//   "form"        -> فرم چندمرحله‌ای (مثل مشاوره رایگان)
//   "video_tree"  -> مسیر رشته/مقطع/درس -> ویدیو از کانال
//   "anon_qa"     -> سوال ناشناس
//   "link"        -> فقط نمایش یک لینک/متن ثابت که ادمین وارد کرده
//   "submenu"     -> باز کردن یک زیرمنو دیگر

export const DEFAULT_MENU = {
  id: "root",
  title: "🎁 یک هفته مشاوره برنامه‌ریزی رایگان",
  banner: true,
  items: [
    { id: "consult_request", title: "📝 درخواست مشاوره", type: "form", formKey: "consultation", enabled: true },
    { id: "ai_help", title: "🤖 هوش مصنوعی", type: "link", enabled: true },
    { id: "video_edu", title: "🎥 ویدیو آموزشی", type: "video_tree", enabled: true },
    { id: "notes", title: "📚 جزوات درسی", type: "link", enabled: true },
    { id: "sample_questions", title: "📄 نمونه سوالات", type: "link", enabled: true },
    { id: "personality_test", title: "🧠 تست شخصیت", type: "link", enabled: true },
    { id: "aptitude_test", title: "🎯 تست استعداد", type: "link", enabled: true },
    { id: "app_download", title: "📱 دانلود اپلیکیشن", type: "link", enabled: true },
    { id: "rank_estimate", title: "🧮 تخمین رتبه", type: "link", enabled: true },
    { id: "major_estimate", title: "🎓 تخمین رشته", type: "link", enabled: true },
    { id: "consult_package", title: "📦 پکیج مشاوره", type: "link", enabled: true },
    { id: "major_selection", title: "🎯 انتخاب رشته", type: "link", enabled: true },
    { id: "edu_package", title: "📘 پکیج آموزشی", type: "link", enabled: true },
    { id: "exam_system", title: "📝 سامانه آزمون", type: "link", enabled: true },
    { id: "student_panel", title: "👨‍🎓 پنل دانش‌آموز", type: "link", enabled: true },
    { id: "advisor_panel", title: "👨‍🏫 پنل مشاورین", type: "link", enabled: true },
    { id: "saturday_discount", title: "🎉 شنبه‌های تخفیف", type: "link", enabled: true },
    { id: "wednesday_deal", title: "🔥 چهارشنبه شگفت‌انگیز", type: "link", enabled: true },
    { id: "special_discount", title: "💎 تخفیف ویژه", type: "link", enabled: true },
    { id: "anon_question", title: "❓ سوال ناشناس", type: "anon_qa", enabled: true },
    { id: "study_tips", title: "📖 نکات مطالعه", type: "link", enabled: true },
    { id: "test_tips", title: "✅ نکات تست‌زنی", type: "link", enabled: true },
    { id: "send_testimonial", title: "❤️ ارسال رضایت‌نامه", type: "form", formKey: "testimonial", enabled: true },
    { id: "testimonials", title: "⭐ رضایت دانش‌آموزان", type: "link", enabled: true },
    { id: "study_timer", title: "⏱ ثبت تایم مطالعه", type: "link", enabled: true },
    { id: "weekly_report", title: "📊 گزارش کار هفتگی", type: "link", enabled: true },
    { id: "website", title: "🌐 سایت فراهوش", type: "link", enabled: true },
    { id: "announcements", title: "📢 اطلاعیه‌ها", type: "link", enabled: true },
  ],
};

// فرم‌های چندمرحله‌ای پیش‌فرض
export const DEFAULT_FORMS = {
  consultation: {
    title: "📝 درخواست مشاوره رایگان",
    steps: [
      { key: "full_name", question: "لطفاً نام و نام خانوادگی خود را وارد کنید:" },
      { key: "field", question: "رشته‌ی تحصیلی شما چیست؟ (تجربی / ریاضی / انسانی)" },
      { key: "grade", question: "مقطع تحصیلی خود را وارد کنید: (دهم/یازدهم/دوازدهم/متوسطه اول)" },
      { key: "phone", question: "شماره تماس خود را وارد کنید:" },
      { key: "goal", question: "هدف و توضیحات خود را بنویسید:" },
    ],
  },
  testimonial: {
    title: "❤️ ارسال رضایت‌نامه",
    steps: [
      { key: "full_name", question: "نام و نام خانوادگی:" },
      { key: "message", question: "متن رضایت‌نامه‌ی خود را بنویسید:" },
    ],
  },
};

// ساختار رشته/مقطع/درس برای بخش ویدیو آموزشی
// linkedMessageId = آیدی پیام داخل کانال @fara_video که باید فوروارد شود
export const DEFAULT_VIDEO_TREE = {
  fields: ["تجربی", "ریاضی", "انسانی", "متوسطه اول"],
  grades: ["دهم", "یازدهم", "دوازدهم"],
  // نمونه‌ی ساختار داده - ادمین از پنل این‌ها را کامل/ویرایش می‌کند
  // videos["تجربی"]["دهم"] = [ { title: "زیست - فصل ۱", messageId: 123 }, ... ]
  videos: {},
};

// متن پیش‌فرض توضیحی که هنگام درخواست شماره تماس (چه در دکمه‌ی اختصاصی، چه
// در شرط ورود) به کاربر نمایش داده می‌شود. ادمین می‌تواند این متن را عوض یا
// کاملاً حذف کند.
export const DEFAULT_PHONE_DISCLAIMER =
  "📞 شماره تماس و اطلاعات شما صرفاً برای رتبه‌ی برتر یا مشاور مختص رشته‌ی خودتان جهت مشاوره‌ی رایگان ارسال می‌گردد.";
