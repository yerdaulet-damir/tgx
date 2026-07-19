import { screen, flow, ask, choose, run } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

// ВИТРИНА tgx — один бот, показывающий ВСЁ. Главное меню ведёт в демо;
// «Назад» возвращает домой. Навигация, feed-UX, весь UI-кит (включая календарь,
// селекторы, слайдер, карусель), обработка файлов и альбомов, оплата Stars,
// flow-визард, пагинация, аналитика (/stats). Всё на одном движке.

const back = (): { label: string; back: true }[] => [{ label: "⬅️ Назад", back: true }];
const MB = 1024 * 1024;
const now = new Date();

// ─────────────────────────── ГЛАВНОЕ МЕНЮ ───────────────────────────
const home = screen("home")
  .text(() => [ui.badge("tgx — витрина возможностей", "new"), ui.rule(), "Выбери демо:"].join("\n"))
  .nav("🎨 AI генерация (feed)", "ai")
  .nav("🧩 UI-компоненты", "uikit")
  .nav("🎛 Селекторы", "selectors")
  .nav("📅 Запись (календарь)", "booking")
  .nav("📎 Файлы и альбомы", "files")
  .nav("🎠 Карусель", "carousel")
  .nav("🛒 Магазин + Stars", "shop")
  .nav("📝 Визард (flow)", "wizard")
  .nav("📃 Пагинация", "list")
  .entry("/start");

// ─────────────────────────── 1. AI ГЕНЕРАЦИЯ (feed) ───────────────────────────
const RATIOS: Record<string, [number, number]> = { "1:1": [1024, 1024], "16:9": [1280, 720], "9:16": [720, 1280] };
const ai = screen<{ model: string; ratio: string }>("ai")
  .state({ model: "flux", ratio: "1:1" })
  .mode("feed")
  .text((s) => [ui.badge("AI генерация", "info"), ui.kv([["Модель", s.model], ["Формат", s.ratio]]), "Пришли промпт."].join("\n"))
  .pick("model", ["flux", "turbo"])
  .pick("ratio", Object.keys(RATIOS))
  .row(() => back())
  .onPrompt(async (c, text) => {
    await c.working("⏳ Рисую… 10–20 сек");
    const [w, h] = RATIOS[c.state.ratio];
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(text)}?width=${w}&height=${h}&model=${c.state.model}&nologo=true`;
    await c.call(() => c.image(url, `«${text}» · ${c.state.model} · ${c.state.ratio}`));
  })
  .entry("/ai");

// ─────────────────────────── 2. UI-КОМПОНЕНТЫ ───────────────────────────
const SIZES = [{ label: "S", value: "S" }, { label: "M", value: "M" }, { label: "L", value: "L" }];
const uikit = screen<{ size: string; qty: number; rating: number }>("uikit")
  .state({ size: "M", qty: 1, rating: 0 })
  .view((s) => ({
    text: [ui.badge("UI-кит", "new"), ui.rule(),
      ui.kv([["Размер", s.size], ["Кол-во", `${s.qty} шт`], ["Оценка", ui.stars(s.rating)]]),
      ui.rule(), `Заполнено: ${ui.bar(s.rating * 20)}`].join("\n"),
    buttons: [
      ...ui.tabs(SIZES, s.size, { do: "size" }),
      ...ui.stepper(s.qty, { label: "шт", do: "qty" }),
      ...ui.grid([1, 2, 3, 4, 5].map((n) => ({ label: "⭐".repeat(n), value: String(n) })), { cols: 5, do: "rate" }),
      back(),
    ],
  }))
  .action("size", (c, v) => { c.state.size = v!; })
  .action("qty", (c, v) => { c.state.qty = Math.max(1, c.state.qty + (v === "inc" ? 1 : -1)); })
  .action("rate", (c, v) => { c.state.rating = Number(v); })
  .entry("/uikit");

// ─────────────────────────── 3. СЕЛЕКТОРЫ (radio / checklist / slider / lang) ───────────────────────────
const PLANS = [{ label: "Free", value: "free" }, { label: "Pro", value: "pro" }, { label: "Team", value: "team" }];
const TOPPINGS = [{ label: "Сыр", value: "cheese" }, { label: "Грибы", value: "mush" }, { label: "Бекон", value: "bacon" }];
const LANGS = [{ code: "ru", label: "Рус", flag: "🇷🇺" }, { code: "en", label: "Eng", flag: "🇬🇧" }, { code: "es", label: "Esp", flag: "🇪🇸" }];
const selectors = screen<{ plan: string; toppings: string[]; volume: number; lang: string }>("selectors")
  .state({ plan: "free", toppings: [], volume: 2, lang: "ru" })
  .view((s) => ({
    text: [ui.badge("Селекторы", "info"), ui.rule(),
      ui.kv([["План", s.plan], ["Добавки", s.toppings.join(", ") || "—"], ["Громкость", `${s.volume + 1}/5`], ["Язык", s.lang]])].join("\n"),
    buttons: [
      ...ui.radio(PLANS, s.plan, { do: "plan", cols: 3 }),
      ...ui.checklist(TOPPINGS, s.toppings, { do: "top", cols: 3 }),
      ...ui.slider(s.volume, 5, { do: "vol" }),
      ...ui.langSwitcher(LANGS, s.lang, { do: "lang" }),
      back(),
    ],
  }))
  .action("plan", (c, v) => { c.state.plan = v!; })
  .action("top", (c, v) => {
    const set = new Set(c.state.toppings);
    set.has(v!) ? set.delete(v!) : set.add(v!);
    c.state.toppings = [...set];
  })
  .action("vol", (c, v) => { c.state.volume = Math.max(0, Math.min(4, c.state.volume + (v === "right" ? 1 : -1))); })
  .action("lang", (c, v) => { c.state.lang = v!; })
  .entry("/selectors");

// ─────────────────────────── 4. ЗАПИСЬ (календарь + тайм-пикер) ───────────────────────────
const booking = screen<{ step: "date" | "time" | "done"; year: number; month: number; date?: string; hour: number; min: number }>("booking")
  .state({ step: "date", year: now.getFullYear(), month: now.getMonth(), hour: 12, min: 0 })
  .view((s) => {
    if (s.step === "date")
      return { text: [ui.badge("Запись", "info"), ui.breadcrumb(["Дата", "Время", "Готово"]), "Выбери день:"].join("\n"),
        buttons: [...ui.calendar(s.year, s.month, { do: "cal", selected: s.date }), back()] };
    if (s.step === "time")
      return { text: [ui.badge("Запись", "info"), ui.breadcrumb([s.date!, "Время", "Готово"]), "Выбери время:"].join("\n"),
        buttons: [...ui.timePicker(s.hour, s.min, { hDo: "hour", mDo: "min", okDo: "ok" }), [{ label: "⬅️ К дате", do: "toDate" }]] };
    return { text: `✅ Записано!\n${ui.kv([["Дата", s.date!], ["Время", `${String(s.hour).padStart(2, "0")}:${String(s.min).padStart(2, "0")}`]])}`,
      buttons: [[{ label: "🔁 Заново", do: "restart" }], back()] };
  })
  .action("cal", (c, v) => {
    const r = ui.calStep(c.state.year, c.state.month, v!);
    c.state.year = r.year; c.state.month = r.month;
    if (r.picked) { c.state.date = r.picked; c.state.step = "time"; }
  })
  .action("hour", (c, v) => { c.state.hour = (c.state.hour + (v === "inc" ? 1 : 23)) % 24; })
  .action("min", (c, v) => { c.state.min = (c.state.min + (v === "inc" ? 15 : 45)) % 60; })
  .action("ok", (c) => { c.state.step = "done"; c.track("booking.confirmed"); })
  .action("toDate", (c) => { c.state.step = "date"; })
  .action("restart", (c) => { c.state.step = "date"; c.state.date = undefined; })
  .entry("/booking");

// ─────────────────────────── 5. ФАЙЛЫ И АЛЬБОМЫ ───────────────────────────
const files = screen<{ n: number }>("files")
  .state({ n: 0 })
  .text((s) => [ui.badge("Файл-бот", "info"), ui.rule(),
    "Пришли фото/документ/видео — распознаю тип и размер.", "Пришли альбом — соберу в пакет.",
    s.n ? `\nОбработано: ${s.n}` : ""].filter(Boolean).join("\n"))
  .row(() => back())
  .onInput(async (c, msg) => {
    const f = msg.file;
    if (!f) return;
    if (f.size && f.size > 20 * MB) { await c.say(`⚠️ ${Math.round(f.size / MB)} МБ > лимит 20 МБ.`); return; }
    await c.action("typing");
    c.state.n++;
    await c.say(`✅ ${f.kind}\n${ui.kv([["Тип", f.mime ?? "—"], ["Размер", f.size ? `${(f.size / MB).toFixed(2)} МБ` : "—"], ["Имя", f.fileName ?? "—"]])}`);
  })
  .onAlbum(async (c, list) => {
    c.state.n += list.length;
    await c.say(`📦 Альбом: ${list.length} шт (${list.map((f) => f.kind).join(", ")})`);
  })
  .entry("/files");

// ─────────────────────────── 6. КАРУСЕЛЬ ───────────────────────────
const CARDS = [
  "🧩 Один движок — экран как чистая функция state → вид.",
  "💾 Персистентность и позиция в навигации из коробки.",
  "✨ Испарение кнопок и авто-answer без единой строки.",
  "💳 Оплата Stars с авто-матчингом к юзеру.",
  "📊 Аналитика воронки командой /stats.",
];
const carousel = screen<{ i: number }>("carousel")
  .state({ i: 0 })
  .view((s) => ({
    text: [ui.badge(`Карусель ${s.i + 1}/${CARDS.length}`, "new"), ui.rule(), CARDS[s.i]].join("\n"),
    buttons: [...ui.carousel(s.i, CARDS.length, { do: "swipe" }), back()],
  }))
  .action("swipe", (c, v) => { c.state.i = (c.state.i + (v === "next" ? 1 : CARDS.length - 1)) % CARDS.length; })
  .entry("/carousel");

// ─────────────────────────── 7. МАГАЗИН + STARS ───────────────────────────
const CATALOG = [
  { id: "p1", title: "☕️ Кофе", price: 50 }, { id: "p2", title: "🍪 Печенье", price: 30 },
  { id: "p3", title: "🍫 Шоколад", price: 40 }, { id: "p4", title: "🧃 Сок", price: 25 },
];
const total = (c: Record<string, number>) => Object.entries(c).reduce((s, [id, q]) => s + CATALOG.find((p) => p.id === id)!.price * q, 0);
const shop = screen<{ cart: Record<string, number> }>("shop")
  .state({ cart: {} })
  .view((s) => {
    const count = Object.values(s.cart).reduce((a, b) => a + b, 0);
    return { text: [ui.badge("Магазин", "info"), ui.rule(), count ? `В корзине: ${count} · ${total(s.cart)}⭐` : "Корзина пуста"].join("\n"),
      buttons: [
        ...ui.grid(CATALOG.map((p) => ({ label: `${p.title} ${p.price}⭐`, value: p.id })), { cols: 2, do: "add" }),
        ...(count ? [[{ label: `💳 Оплатить ${total(s.cart)}⭐`, do: "pay" }]] : []),
        back(),
      ] };
  })
  .action("add", (c, id) => { c.state.cart[id!] = (c.state.cart[id!] ?? 0) + 1; })
  .action("pay", async (c) => c.tg.replyWithInvoice("Заказ", "Заказ из витрины", "order", "XTR", [{ label: "Итого", amount: total(c.state.cart) }]))
  .onPayment((c) => { c.state.cart = {}; return c.say("✅ Оплачено! Спасибо 📦"); })
  .entry("/shop");

// ─────────────────────────── 8. ВИЗАРД (flow) ───────────────────────────
const wizard = flow("wizard", {
  entry: "/wizard",
  steps: [ask("name", "Как тебя зовут?"), choose("plan", "Выбери план:", { free: "Бесплатный", pro: "Pro" })],
  async done(ctx, d) { await ctx.reply(`Готово, ${d.name}! План: ${d.plan}. /start — в меню.`); },
});

// ─────────────────────────── 9. ПАГИНАЦИЯ ───────────────────────────
const ITEMS = Array.from({ length: 23 }, (_, i) => `Элемент №${i + 1}`);
const PER = 5;
const list = screen<{ page: number }>("list")
  .state({ page: 0 })
  .view((s) => {
    const pages = Math.ceil(ITEMS.length / PER);
    return { text: [ui.badge("Пагинация", "new"), ui.rule(), ui.bullets(ITEMS.slice(s.page * PER, s.page * PER + PER))].join("\n"),
      buttons: [...ui.paginate(s.page, pages, { do: "page" }), back()] };
  })
  .action("page", (c, v) => { c.state.page += v === "next" ? 1 : -1; })
  .entry("/list");

run(
  {
    token: process.env.BOT_TOKEN!,
    storage: ".tgx/showcase.json",
    analytics: ".tgx/showcase-stats.json",
    // Постоянное меню снизу (заменяет буквы) — тап прыгает на экран.
    menu: [
      [{ label: "🏠 Меню", go: "home" }, { label: "🎨 AI", go: "ai" }],
      [{ label: "🛒 Магазин", go: "shop" }, { label: "📅 Запись", go: "booking" }],
    ],
    // Кнопка ≡ «Меню» сбоку от ввода — список команд.
    commands: [
      { command: "start", description: "Главное меню" },
      { command: "ai", description: "AI генерация" },
      { command: "shop", description: "Магазин" },
      { command: "booking", description: "Запись" },
      { command: "stats", description: "Аналитика воронки" },
    ],
  },
  [home, ai, uikit, selectors, booking, files, carousel, shop, wizard, list],
);
