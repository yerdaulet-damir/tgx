// Calendar & time picker — drill-down date selection built from an inline grid.
// Pure functions: pass year/month from your state; wire one action that routes
// "prev"/"next"/"YYYY-MM-DD" via calStep(). No Date dependency inside — you own the clock.
import type { Btn } from "@tgxjs/core";

const NOOP = "_noop";
// Neutral English defaults; override via opts.months / opts.weekdays for any locale.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/** Month calendar grid with ◀ header ▶ nav. Action → .action(do)(c, value),
 *  value is "prev" | "next" | "YYYY-MM-DD". Feed it through calStep(). */
export function calendar(
  year: number,
  month: number,
  opts: { do?: string; selected?: string; today?: string; months?: string[]; weekdays?: string[] } = {},
): Btn[][] {
  const act = opts.do ?? "cal";
  const months = opts.months ?? MONTHS;
  const weekdays = opts.weekdays ?? WEEKDAYS;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon = 0

  const rows: Btn[][] = [
    [
      { label: "◀️", do: act, value: "prev" },
      { label: `${months[month]} ${year}`, do: NOOP },
      { label: "▶️", do: act, value: "next" },
    ],
    weekdays.map((d) => ({ label: d, do: NOOP })),
  ];

  let week: Btn[] = Array.from({ length: startDow }, () => ({ label: " ", do: NOOP }));
  for (let d = 1; d <= daysInMonth; d++) {
    const date = iso(year, month, d);
    const label = date === opts.selected ? `·${d}·` : date === opts.today ? `[${d}]` : String(d);
    week.push({ label, do: act, value: date });
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }
  if (week.length) {
    while (week.length < 7) week.push({ label: " ", do: NOOP });
    rows.push(week);
  }
  return rows;
}

/** Advance calendar state from a calendar() callback value. */
export function calStep(
  year: number,
  month: number,
  value: string,
): { year: number; month: number; picked?: string } {
  if (value === "prev") return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  if (value === "next") return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  return { year, month, picked: value }; // "YYYY-MM-DD"
}

/** Time picker: two cyclic steppers (HH / MM) + confirm. Actions →
 *  .action(hDo)(c,"inc"|"dec"), .action(mDo)(c,"inc"|"dec"), .action(okDo). */
export function timePicker(
  h: number,
  m: number,
  opts: { hDo?: string; mDo?: string; okDo?: string; okLabel?: string; minuteStep?: number } = {},
): Btn[][] {
  return [
    [
      { label: "➖", do: opts.hDo ?? "hour", value: "dec" },
      { label: `🕐 ${pad(h)}h`, do: NOOP },
      { label: "➕", do: opts.hDo ?? "hour", value: "inc" },
    ],
    [
      { label: "➖", do: opts.mDo ?? "min", value: "dec" },
      { label: `${pad(m)}m`, do: NOOP },
      { label: "➕", do: opts.mDo ?? "min", value: "inc" },
    ],
    [{ label: `${opts.okLabel ?? "Select"} ${pad(h)}:${pad(m)}`, do: opts.okDo ?? "time_ok" }],
  ];
}
