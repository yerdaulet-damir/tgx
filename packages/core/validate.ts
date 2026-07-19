// Boot-time spec validation — the safety net that makes an AI-edited bot durable.
//
// The promise of tgx is "an agent can edit any screen without breaking a
// different one." That only holds if a broken *reference* — a nav to a screen
// that doesn't exist, a button wired to an action with no handler, two screens
// with the same name — is caught the moment the bot boots, with a precise,
// agent-readable message. Otherwise a typo like go("profil") silently compiles
// and crashes three taps later. This turns that runtime landmine into a clear
// failure before start().
//
// What we CAN check statically: everything declared through the builder (.nav /
// .button) and the persistent menu. What we CANNOT: buttons emitted from the
// escape hatches (.row / .view), because those are computed from live state — we
// mark those screens `dynamic` and skip them rather than pretend to have checked.
import type { ScreenReg, MenuButton } from "./screen.js";

// Actions handled by the engine itself — a button may reference these without a
// user-defined .action() handler.
const BUILTIN_ACTIONS = new Set(["_go", "_back", "_recheck", "_noop", "_slot", "_pick", "_toggle"]);

export interface ValidationIssue {
  screen: string;
  kind: "unknown-nav" | "unknown-action" | "duplicate-name" | "duplicate-entry" | "no-entry";
  message: string;
}

// Levenshtein, small and dependency-free — used to say "did you mean …?".
function closest(target: string, candidates: string[]): string | undefined {
  const dist = (a: string, b: string): number => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const dd = dist(target, c);
    if (dd < bestD) { bestD = dd; best = c; }
  }
  // Only suggest when it's a plausible typo, not an unrelated name.
  return best !== undefined && bestD <= Math.max(2, Math.floor(target.length / 3)) ? best : undefined;
}

const suggest = (t: string, all: string[]): string => {
  const c = closest(t, all.filter((n) => n !== t));
  return c ? ` — did you mean "${c}"?` : "";
};

// Check the whole bot spec for internal consistency. Returns every problem found
// (not just the first) so an agent can fix them all in one pass.
export function validate(regs: ScreenReg[], opts: { menu?: MenuButton[][] } = {}): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = regs.map((r) => r.name);
  const nameSet = new Set(names);

  // Duplicate screen names — the registry would silently keep only the last one.
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(n))
      issues.push({ screen: n, kind: "duplicate-name", message: `Duplicate screen name "${n}" — names must be unique.` });
    seen.add(n);
  }

  // Duplicate entry commands — two /start handlers, last wins silently.
  const entries = new Map<string, string>();
  for (const r of regs) {
    if (!r.entry) continue;
    const prev = entries.get(r.entry);
    if (prev)
      issues.push({
        screen: r.name,
        kind: "duplicate-entry",
        message: `Entry command "${r.entry}" is claimed by both "${prev}" and "${r.name}".`,
      });
    else entries.set(r.entry, r.name);
  }

  // The bot must be reachable: at least one entry command or one menu button.
  if (entries.size === 0 && !(opts.menu && opts.menu.length))
    issues.push({
      screen: "(bot)",
      kind: "no-entry",
      message: `No entry command (.entry("/start")) and no menu — the bot has no way in.`,
    });

  // Per-screen reference checks, from what the builder recorded.
  for (const r of regs) {
    const meta = r.meta;
    if (!meta) continue; // raw defineScreen with no meta → nothing declared to check
    const handlers = new Set([...Object.keys(r.def.on ?? {}), ...BUILTIN_ACTIONS]);

    for (const target of meta.navTargets)
      if (!nameSet.has(target))
        issues.push({
          screen: r.name,
          kind: "unknown-nav",
          message: `Screen "${r.name}" navigates to "${target}"${suggest(target, names)} — no such screen.`,
        });

    for (const action of meta.buttonActions)
      if (!handlers.has(action))
        issues.push({
          screen: r.name,
          kind: "unknown-action",
          message: `Screen "${r.name}" has a button wired to action "${action}"${suggest(
            action,
            Object.keys(r.def.on ?? {}),
          )} — add .action("${action}", …).`,
        });
  }

  // Menu buttons must point at real screens.
  for (const row of opts.menu ?? [])
    for (const b of row)
      if (!nameSet.has(b.go))
        issues.push({
          screen: "(menu)",
          kind: "unknown-nav",
          message: `Menu button "${b.label}" jumps to "${b.go}"${suggest(b.go, names)} — no such screen.`,
        });

  return issues;
}

// Format issues as a single throwable message. Kept separate so tooling (e.g. a
// future `tgx check`) can render them however it likes.
export function formatIssues(issues: ValidationIssue[]): string {
  const lines = issues.map((i) => `  ✗ ${i.message}`).join("\n");
  return `[tgx] bot spec has ${issues.length} problem(s):\n${lines}\n\nFix these before start().`;
}
