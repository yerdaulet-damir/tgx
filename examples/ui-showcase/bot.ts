import { screen, run } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

// Витрина компонент-темплейтов tgx-kit/ui. Конфигуратор товара, собранный
// из готовых блоков: бейдж, kv, разделитель, прогресс-бар, звёзды — и клавиатуры:
// табы, степпер, сетка-рейтинг, подтверждение. Всё композиция, ноль ручной вёрстки.
const SIZES = [
  { label: "S", value: "S" },
  { label: "M", value: "M" },
  { label: "L", value: "L" },
];

interface S { size: string; qty: number; rating: number }

const cfg = screen<S>("cfg")
  .state({ size: "M", qty: 1, rating: 0 })
  .view((s) => ({
    text: [
      ui.badge("Конфигуратор товара", "new"),
      ui.rule(),
      ui.kv([
        ["Размер", s.size],
        ["Количество", `${s.qty} шт`],
        ["Оценка", ui.stars(s.rating)],
      ]),
      ui.rule(),
      `Заполнено: ${ui.bar(s.rating * 20)}`,
    ].join("\n"),
    buttons: [
      ...ui.tabs(SIZES, s.size, { do: "size" }), // ряд табов размеров
      ...ui.stepper(s.qty, { label: "шт", do: "qty" }), // ➖ N ➕
      ...ui.grid(
        [1, 2, 3, 4, 5].map((n) => ({ label: "⭐".repeat(n), value: String(n) })),
        { cols: 5, do: "rate" },
      ), // сетка-рейтинг
      ...ui.confirm({ yes: "🛒 Купить", no: "🗑 Сброс", do: "act" }),
    ],
  }))
  .action("size", (c, v) => { c.state.size = v!; })
  .action("qty", (c, v) => { c.state.qty = Math.max(1, c.state.qty + (v === "inc" ? 1 : -1)); })
  .action("rate", (c, v) => { c.state.rating = Number(v); })
  .action("act", (c, v) => {
    if (v === "yes") return c.say(`✅ Заказ: ${c.state.qty}× размер ${c.state.size}`);
    c.state.size = "M"; c.state.qty = 1; c.state.rating = 0; // сброс
  })
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/ui.json" }, [cfg]);
