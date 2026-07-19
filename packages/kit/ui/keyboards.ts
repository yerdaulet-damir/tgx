// Keyboard composers — pure Btn[][] builders for .view()/.row(). Every component
// is the same illusion: the label encodes visual state, the callback carries only
// identity+action. Tap → handler recomputes state → engine re-renders in place.
//
// Convention: each composer takes `opts.do` = the action name you wire with
// .action(do). Display-only cells use the built-in inert "_noop" action.
import type { Btn } from "@tgxjs/core";

export interface Item {
  label: string;
  value: string;
}

const NOOP = "_noop";
const chunk = <T>(a: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

// ── Selection ──────────────────────────────────────────────────────────────

/** Grid of buttons. Action → .action(do)(c, value). */
export const grid = (items: Item[], opts: { cols?: number; do?: string } = {}): Btn[][] =>
  chunk(items.map((it) => ({ label: it.label, do: opts.do ?? "select", value: it.value })), opts.cols ?? 2);

/** Single-select radio: active gets ◉, rest ◯. Action → .action(do)(c, value). */
export const radio = (items: Item[], active: string, opts: { cols?: number; do?: string } = {}): Btn[][] =>
  chunk(
    items.map((it) => ({ label: `${it.value === active ? "◉" : "◯"} ${it.label}`, do: opts.do ?? "pick", value: it.value })),
    opts.cols ?? 1,
  );

/** Multi-select checklist: selected get ✅. Toggling flips the whole label.
 *  Action → .action(do)(c, value) should flip membership in a Set/array. */
export const checklist = (items: Item[], selected: readonly string[], opts: { cols?: number; do?: string } = {}): Btn[][] => {
  const set = new Set(selected);
  return chunk(
    items.map((it) => ({ label: `${set.has(it.value) ? "✅" : "☐"} ${it.label}`, do: opts.do ?? "toggle", value: it.value })),
    opts.cols ?? 1,
  );
};

/** Tabs: active marked «• X •». Action → .action(do)(c, value). */
export const tabs = (items: Item[], active: string, opts: { do?: string } = {}): Btn[][] => [
  items.map((it) => ({ label: it.value === active ? `• ${it.label} •` : it.label, do: opts.do ?? "tab", value: it.value })),
];

/** Language switcher: flag radio, 2-per-row. Action → .action(do)(c, code). */
export const langSwitcher = (
  langs: { code: string; label: string; flag: string }[],
  active: string,
  opts: { do?: string } = {},
): Btn[][] =>
  chunk(
    langs.map((l) => ({ label: `${l.flag} ${l.label}${l.code === active ? " ✅" : ""}`, do: opts.do ?? "lang", value: l.code })),
    2,
  );

// ── Numeric ──────────────────────────────────────────────────────────────

/** Stepper: "➖ N ➕". Action → .action(do)(c, "inc"|"dec"). */
export const stepper = (value: number | string, opts: { do?: string; label?: string } = {}): Btn[][] => {
  const act = opts.do ?? "step";
  return [[
    { label: "➖", do: act, value: "dec" },
    { label: `${opts.label ? opts.label + " " : ""}${value}`, do: NOOP },
    { label: "➕", do: act, value: "inc" },
  ]];
};

/** Slider: "◀️ ◉◯◯◯◯ ▶️" bounded track. Action → .action(do)(c, "left"|"right"). */
export const slider = (pos: number, max: number, opts: { do?: string } = {}): Btn[][] => {
  const act = opts.do ?? "slide";
  const track = "◉".repeat(pos + 1) + "◯".repeat(Math.max(0, max - pos - 1));
  return [[
    { label: "◀️", do: act, value: "left" },
    { label: track, do: NOOP },
    { label: "▶️", do: act, value: "right" },
  ]];
};

// ── Navigation & feedback ──────────────────────────────────────────────────

/** Pagination: "◀️ 3/10 ▶️". Action → .action(do)(c, "prev"|"next"). */
export const paginate = (page: number, pages: number, opts: { do?: string } = {}): Btn[][] => {
  const act = opts.do ?? "page";
  const row: Btn[] = [];
  if (page > 0) row.push({ label: "◀️", do: act, value: "prev" });
  row.push({ label: `${page + 1}/${pages}`, do: NOOP });
  if (page < pages - 1) row.push({ label: "▶️", do: act, value: "next" });
  return [row];
};

/** Carousel arrows: "◀️ 2/5 ▶️" for a swipeable deck. Action → .action(do)(c, "prev"|"next"). */
export const carousel = (index: number, count: number, opts: { do?: string } = {}): Btn[][] =>
  paginate(index, count, { do: opts.do ?? "swipe" });

/** Confirm row: "✅ Yes | ❌ No" (labels overridable). Action → .action(do)(c, "yes"|"no"). */
export const confirm = (opts: { yes?: string; no?: string; do?: string } = {}): Btn[][] => {
  const act = opts.do ?? "confirm";
  return [[
    { label: opts.yes ?? "✅ Yes", do: act, value: "yes" },
    { label: opts.no ?? "❌ No", do: act, value: "no" },
  ]];
};

/** Back row (built-in navigation pop). */
export const backRow = (label = "⬅️ Back"): Btn[][] => [[{ label, back: true }]];
