import { screen, run } from "@tgxjs/core";

// Трекер привычек со стриками. Динамический список, ежедневные отметки, серии —
// всё в персистентном состоянии. Отметил сегодня → стрик растёт; пропустил день →
// сбрасывается. Плюс /stats из коробки.
interface Habit { name: string; streak: number; lastDay?: string }
interface S { habits: Habit[]; adding: boolean }

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);

const tracker = screen<S>("tracker")
  .state({ habits: [], adding: false })
  .text((s) => {
    if (s.adding) return "✍️ Как называется привычка? Пришли текст.";
    if (!s.habits.length) return "🎯 Привычек пока нет. Добавь первую!";
    const lines = s.habits.map((h) => {
      const done = h.lastDay === today();
      return `${done ? "✅" : "⚪️"} ${h.name} — 🔥 ${h.streak}${done ? " (сегодня)" : ""}`;
    });
    return `🎯 Твои привычки:\n\n${lines.join("\n")}`;
  })
  // по кнопке на каждую привычку — отметить за сегодня
  .row((s) =>
    s.adding ? [] : s.habits.map((h, i) => ({ label: `Отметить: ${h.name}`, do: "mark", value: String(i) })),
  )
  .button("➕ Добавить привычку", "add", (s) => !s.adding)
  .button("⬅️ Отмена", "cancel", (s) => s.adding)
  .action("add", (c) => { c.state.adding = true; })
  .action("cancel", (c) => { c.state.adding = false; })
  .action("mark", (c, i) => {
    const h = c.state.habits[Number(i)];
    if (h.lastDay === today()) return; // уже отмечено сегодня
    h.streak = h.lastDay === yesterday() ? h.streak + 1 : 1; // продолжить или начать серию
    h.lastDay = today();
    c.track(`habit.marked`);
  })
  .onPrompt((c, text) => {
    if (!c.state.adding) return;
    c.state.habits.push({ name: text, streak: 0 });
    c.state.adding = false;
    c.track(`habit.created`);
  })
  .entry("/start");

run(
  { token: process.env.BOT_TOKEN!, storage: ".tgx/habits.json", analytics: ".tgx/habit-stats.json" },
  [tracker],
);
