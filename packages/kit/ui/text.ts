// Text blocks — pure string builders for .text()/.view(). No CSS in Telegram, so
// "styling" is composition + unicode + emoji. Copy any of these into your project.

/** Progress bar: bar(60) → "▓▓▓▓▓▓░░░░ 60%" */
export const bar = (pct: number, width = 10): string => {
  const f = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "▓".repeat(f) + "░".repeat(width - f) + ` ${Math.round(pct)}%`;
};

/** Star rating: stars(3) → "★★★☆☆" */
export const stars = (n: number, max = 5): string => "★".repeat(n) + "☆".repeat(Math.max(0, max - n));

/** Horizontal rule */
export const rule = (n = 14): string => "─".repeat(n);

/** Key-value block: kv([["Price","50⭐"]]) → "Price: 50⭐" */
export const kv = (pairs: [string, string | number][]): string => pairs.map(([k, v]) => `${k}: ${v}`).join("\n");

/** Bulleted list */
export const bullets = (items: string[]): string => items.map((i) => `• ${i}`).join("\n");

const TONE = { ok: "🟢", warn: "🟡", err: "🔴", info: "🔵", new: "🆕" } as const;
/** Colored badge: badge("New","new") → "🆕 New" */
export const badge = (text: string, tone: keyof typeof TONE = "info"): string => `${TONE[tone]} ${text}`;

/** Breadcrumb trail: breadcrumb(["Home","Settings"]) → "Home › Settings" */
export const breadcrumb = (trail: string[]): string => trail.join(" › ");

/** Wizard progress: wizardProgress(2,4) → "Step 2/4  ▓▓▓▓▓░░░░░ 50%".
 *  Pass a label for other locales: wizardProgress(2, 4, "Étape"). */
export const wizardProgress = (step: number, total: number, label = "Step"): string =>
  `${label} ${step}/${total}  ${bar((step / total) * 100)}`;
