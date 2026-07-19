import { screen, run } from "@tgxjs/core";

// Магазин с оплатой Telegram Stars. Один морфящийся экран: каталог (пагинация) →
// товар → корзина → оплата. Корзина живёт в состоянии экрана и персистентна.
// Оплата: invoice в XTR, pre_checkout авто-отвечается движком, а successful_payment
// движок сам маршрутизирует в onPayment ЭТОГО юзера — матчинг бесплатный.
interface Product { id: string; title: string; price: number; desc: string }
const CATALOG: Product[] = [
  { id: "p1", title: "☕️ Кофе", price: 50, desc: "Свежемолотый, 250г" },
  { id: "p2", title: "🍪 Печенье", price: 30, desc: "Овсяное, 12 шт" },
  { id: "p3", title: "🍫 Шоколад", price: 40, desc: "Тёмный 70%" },
  { id: "p4", title: "🧃 Сок", price: 25, desc: "Яблочный, 1л" },
  { id: "p5", title: "🥐 Круассан", price: 35, desc: "С маслом" },
];
const PER = 3;

interface S { view: "catalog" | "item"; page: number; sel?: string; cart: Record<string, number> }
const cartCount = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0);
const cartTotal = (c: Record<string, number>) =>
  Object.entries(c).reduce((sum, [id, q]) => sum + (CATALOG.find((p) => p.id === id)!.price * q), 0);

const shop = screen<S>("shop")
  .state({ view: "catalog", page: 0, cart: {} })
  .view((s) => {
    // экран товара
    if (s.view === "item") {
      const p = CATALOG.find((x) => x.id === s.sel)!;
      return {
        text: `${p.title}\n${p.desc}\n\nЦена: ${p.price} ⭐`,
        buttons: [
          [{ label: "➕ В корзину", do: "add", value: p.id }],
          [{ label: "⬅️ К каталогу", do: "catalog" }],
        ],
      };
    }
    // каталог с пагинацией
    const start = s.page * PER;
    const rows = CATALOG.slice(start, start + PER).map((p) => [
      { label: `${p.title} · ${p.price}⭐`, do: "open", value: p.id },
    ]);
    const nav: { label: string; do: string }[] = [];
    if (s.page > 0) nav.push({ label: "◀️", do: "prev" });
    if (start + PER < CATALOG.length) nav.push({ label: "▶️", do: "next" });
    const count = cartCount(s.cart);
    return {
      text: `🛒 Магазин · стр. ${s.page + 1}`,
      buttons: [
        ...rows,
        ...(nav.length ? [nav] : []),
        count ? [{ label: `🧺 Корзина (${count}) · ${cartTotal(s.cart)}⭐ — оплатить`, do: "checkout" }] : [],
      ],
    };
  })
  .action("open", (c, id) => { c.state.sel = id; c.state.view = "item"; })
  .action("catalog", (c) => { c.state.view = "catalog"; })
  .action("next", (c) => { c.state.page++; })
  .action("prev", (c) => { c.state.page--; })
  .action("add", (c, id) => { c.state.cart[id!] = (c.state.cart[id!] ?? 0) + 1; c.state.view = "catalog"; })
  .action("checkout", async (c) => {
    const total = cartTotal(c.state.cart);
    const items = Object.entries(c.state.cart)
      .map(([id, q]) => `${CATALOG.find((p) => p.id === id)!.title} ×${q}`)
      .join(", ");
    await c.tg.replyWithInvoice("Заказ", items || "Заказ", "shop-order", "XTR", [{ label: "Итого", amount: total }]);
  })
  .onPayment((c) => {
    c.state.cart = {}; // очистить корзину после успешной оплаты
    return c.say("✅ Оплачено! Спасибо за заказ. Собираем 📦");
  })
  .entry("/start");

run(
  { token: process.env.BOT_TOKEN!, storage: ".tgx/shop.json", analytics: ".tgx/shop-stats.json" },
  [shop],
);
