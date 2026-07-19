import { flow, ask, choose, payStars, run } from "@tgxjs/core";

// Весь дев-facing код. Читается как предложение, которое понял бы продакт.
// Инфраструктурных строк — ноль: персистентность, валидация, испарение кнопок,
// pre_checkout, матчинг платежа и аналитика делает фреймворк.
const onboarding = flow("onboarding", {
  entry: "/start",
  steps: [
    ask("email", "На какой email оформляем?", { validate: "email" }),
    choose("plan", "Выбери план:", { trial: "Пробный", pro: "Pro — 500 ⭐" }),
    payStars("Pro доступ", 500, { when: (d) => d.plan === "pro" }),
  ],
  async done(ctx, d) {
    // d = { email, plan, _paid? } — только бизнес-данные
    await ctx.reply(d._paid ? "Ты в Pro 🎉" : "Пробный активирован 🎉");
  },
});

// storage — файловый путь: стейт переживает рестарт без Redis. Убей и подними
// бота посреди онбординга → юзер продолжит с того же шага. Это и есть весь тезис.
run({ token: process.env.BOT_TOKEN!, storage: process.env.REDIS_URL ?? ".tgx/state.json" }, [onboarding]);
