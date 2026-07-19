import { screen, run } from "@tgxjs/core";

// Большой бот КАК блок-схема. Каждый экран — блок, .nav()/c.go()/back — стрелки,
// условный c.go() внутри хендлера — ромб-ветвление. Стек хранит путь юзера по
// схеме и переживает рестарт. Схема этого бота:
//
//   root ─┬─▶ billing ─▶ refund(ввод №заказа) ─◇─ valid? ─▶ refund_ok
//         │                                      └─ invalid ─▶ (переспрос)
//         ├─▶ tech ─◇─ тип? ─┬─▶ tech_bug
//         │                  └─▶ tech_how
//         └─▶ account ─▶ (назад)

const root = screen("root")
  .text(() => "🛟 Поддержка. Выбери раздел:")
  .nav("💳 Оплата", "billing")
  .nav("🛠 Техпроблема", "tech")
  .nav("👤 Аккаунт", "account")
  .entry("/start");

const billing = screen("billing")
  .text(() => "💳 Оплата. Что случилось?")
  .nav("💸 Вернуть деньги", "refund")
  .button("⬅️ Назад", "_back") // _back — встроенное действие
  .action("_back", (c) => c.back());

const refund = screen<{ error?: boolean }>("refund")
  .state({})
  .text((s) => (s.error ? "❌ Формат №заказа: ORD-1234. Попробуй ещё:" : "Пришли номер заказа (ORD-XXXX):"))
  .button("⬅️ Отмена", "cancel")
  .action("cancel", (c) => c.back())
  // ромб-ветвление: валидный номер → следующий блок, иначе — переспрос (тот же блок)
  .onPrompt((c, text) => {
    if (/^ORD-\d{4}$/.test(text)) c.go("refund_ok", text);
    else c.state.error = true;
  });

const refund_ok = screen<{ order: string }>("refund_ok")
  .state((order) => ({ order: order as string }))
  .text((s) => `✅ Возврат по заказу ${s.order} оформлен. Деньги придут за 3 дня.`)
  .nav("🏠 В меню", "root");

const tech = screen("tech")
  .text(() => "🛠 Техпроблема. Какого типа?")
  .button("🐞 Что-то сломалось", "bug")
  .button("❓ Как сделать X", "how")
  .action("bug", (c) => c.go("tech_bug")) // ветка 1
  .action("how", (c) => c.go("tech_how")) // ветка 2
  .button("⬅️ Назад", "cancel")
  .action("cancel", (c) => c.back());

const tech_bug = screen("tech_bug")
  .text(() => "🐞 Опиши, что сломалось — передам инженерам.")
  .onPrompt((c, text) => c.say(`Принял: «${text}». Тикет создан.`))
  .nav("🏠 В меню", "root");

const tech_how = screen("tech_how")
  .text(() => "❓ База знаний: docs.example.com/how")
  .nav("🏠 В меню", "root");

const account = screen("account")
  .text(() => "👤 Аккаунт: всё в порядке.")
  .button("⬅️ Назад", "cancel")
  .action("cancel", (c) => c.back());

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/support.json", analytics: ".tgx/support-stats.json" }, [
  root, billing, refund, refund_ok, tech, tech_bug, tech_how, account,
]);
