import { screen, run } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

// Запись на приём: календарь → выбор времени → подтверждение. Три шага в одном
// морфящемся экране, вся дата/время-логика — из ui-кита (calendar, calStep,
// timePicker). Персистентно: закрыл на выборе времени — вернёшься туда же.
interface S {
  step: "date" | "time" | "done";
  year: number;
  month: number;
  date?: string;
  hour: number;
  min: number;
}

const now = new Date();

const booking = screen<S>("booking")
  .state({ step: "date", year: now.getFullYear(), month: now.getMonth(), hour: 12, min: 0 })
  .view((s) => {
    if (s.step === "date")
      return {
        text: [ui.badge("Запись на приём", "info"), ui.breadcrumb(["Дата", "Время", "Готово"]), "Выбери день:"].join("\n"),
        buttons: [...ui.calendar(s.year, s.month, { do: "cal", selected: s.date }), ui.backRow()[0]],
      };
    if (s.step === "time")
      return {
        text: [ui.badge("Запись на приём", "info"), ui.breadcrumb([s.date!, "Время", "Готово"]), "Выбери время:"].join("\n"),
        buttons: [
          ...ui.timePicker(s.hour, s.min, { hDo: "hour", mDo: "min", okDo: "confirm", minuteStep: 15 }),
          [{ label: "⬅️ К дате", do: "toDate" }],
        ],
      };
    return {
      text: `✅ Записано!\n${ui.kv([["Дата", s.date!], ["Время", `${String(s.hour).padStart(2, "0")}:${String(s.min).padStart(2, "0")}`]])}`,
      buttons: [[{ label: "🔁 Заново", do: "restart" }]],
    };
  })
  // календарь: один обработчик через calStep — навигация по месяцам + выбор дня
  .action("cal", (c, v) => {
    const r = ui.calStep(c.state.year, c.state.month, v!);
    c.state.year = r.year;
    c.state.month = r.month;
    if (r.picked) { c.state.date = r.picked; c.state.step = "time"; }
  })
  .action("hour", (c, v) => { c.state.hour = (c.state.hour + (v === "inc" ? 1 : 23)) % 24; })
  .action("min", (c, v) => { c.state.min = (c.state.min + (v === "inc" ? 15 : 45)) % 60; })
  .action("confirm", (c) => { c.state.step = "done"; c.track("booking.confirmed"); })
  .action("toDate", (c) => { c.state.step = "date"; })
  .action("restart", (c) => { c.state.step = "date"; c.state.date = undefined; })
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/booking.json", analytics: ".tgx/booking-stats.json" }, [booking]);
