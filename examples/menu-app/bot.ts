import { run, defineScreen } from "@tgxjs/core";

// Modern-UX навигация, которую старый линейный движок не умел: экраны, вложенность,
// «назад», меню. Каждый экран — чистая функция state → вид. Переходы (go/back)
// живут в персистентном стеке, так что позиция в навигации переживает рестарт.

const home = defineScreen(
  "home",
  {
    view: () => ({
      text: "🏠 Главное меню",
      buttons: [
        [{ label: "👤 Профиль", go: "profile" }],
        [{ label: "⚙️ Настройки", go: "settings" }],
      ],
    }),
  },
  { entry: "/start" },
);

const profile = defineScreen<{ name: string }>("profile", {
  state: () => ({ name: "Гость" }),
  view: (s) => ({
    text: `👤 Профиль\nИмя: ${s.name}`,
    buttons: [
      [{ label: "✏️ Переименовать", do: "rename" }],
      [{ label: "⬅️ Назад", back: true }],
    ],
  }),
  on: {
    // Открываем под-экран ввода — стек углубляется, «назад» вернёт сюда.
    rename: (ctx) => ctx.go("rename"),
  },
});

const rename = defineScreen<{ parentName: string }>("rename", {
  view: () => ({
    text: "Введи новое имя сообщением:",
    buttons: [[{ label: "⬅️ Отмена", back: true }]],
  }),
  onInput: (ctx, msg) => {
    if (!msg.text) return;
    ctx.say(`Готово, теперь ты ${msg.text}`);
    ctx.back(); // вернуться в профиль
  },
});

const settings = defineScreen<{ notify: boolean }>("settings", {
  state: () => ({ notify: true }),
  view: (s) => ({
    text: "⚙️ Настройки",
    buttons: [
      [{ label: s.notify ? "🔔 Уведомления: вкл" : "🔕 Уведомления: выкл", do: "toggle" }],
      [{ label: "⬅️ Назад", back: true }],
    ],
  }),
  on: {
    // Мутируем состояние — движок сам перерисует ЭТОТ экран (edit того же сообщения).
    toggle: (ctx) => {
      ctx.state.notify = !ctx.state.notify;
    },
  },
});

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/menu.json" }, [
  home,
  profile,
  rename,
  settings,
]);
