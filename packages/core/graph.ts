// Interface graph — the whole bot, drawn.
//
// Because a tgx bot is declarative data, we can render the entire interface
// as a Mermaid flowchart WITHOUT running it live: every screen, every button,
// which button goes to which screen, what each control does, the entry commands,
// the menu, wizard steps and gates. You look at this while developing to see the
// bot the way a user moves through it — variant A vs B, message vs message.
//
// Mermaid renders in GitHub, VS Code and any browser, so this needs no deps.
//
// Two sources of truth, in order of richness:
//   1. Builder/flow screens record `meta` (semantic controls: pick values,
//      toggle labels, action names, wizard steps) — used directly.
//   2. Raw defineScreen screens have no meta, so we render their view() once with
//      initial state and read the concrete buttons back out.
// What still can't be drawn: navigation done imperatively inside an action
// handler (c.go("x")) rather than via a declared nav button — that lives in code
// we don't execute. Such screens simply show fewer edges; they're never wrong.
import type { ScreenReg, MenuButton, ControlMeta, ScreenDef, Btn } from "./screen.js";

const nodeId = (name: string) => "s_" + name.replace(/[^a-zA-Z0-9_]/g, "_");

// Mermaid label text: one entry per line via <br/>, with parser-breaking
// characters neutralized.
const esc = (s: string) =>
  s.replace(/"/g, "'").replace(/[[\]{}()|<>]/g, "").replace(/\n/g, " ").trim();

interface ScreenView {
  name: string;
  entry?: string;
  mode: "sticky" | "feed";
  controls: ControlMeta[];
  back: boolean;
  hasInput: boolean;
  hasAlbum: boolean;
  hasPayment: boolean;
  hasGate: boolean;
  flow?: { steps: { key: string; kind: string }[] };
}

// Recover controls from a concrete rendered keyboard (raw defineScreen path).
function controlsFromButtons(def: ScreenDef): { controls: ControlMeta[]; back: boolean } {
  const controls: ControlMeta[] = [];
  let back = false;
  let view: { buttons?: Btn[][] };
  try {
    view = def.view(def.state?.() ?? {});
  } catch {
    return { controls, back }; // view needs richer state than we can fake → skip, don't guess
  }
  for (const row of view.buttons ?? [])
    for (const b of row) {
      if ("go" in b) controls.push({ kind: "nav", label: b.label, to: b.go });
      else if ("back" in b) back = true;
      else if ("url" in b) controls.push({ kind: "link", label: b.label, url: b.url });
      else if ("webapp" in b) controls.push({ kind: "webapp", label: b.label, url: b.webapp });
      else if ("do" in b) controls.push({ kind: "button", label: b.label, action: b.do });
    }
  return { controls, back };
}

function describe(reg: ScreenReg): ScreenView {
  const def = reg.def;
  const m = reg.meta;
  const { controls, back } = m ? { controls: m.controls, back: false } : controlsFromButtons(def);
  return {
    name: reg.name,
    entry: reg.entry,
    mode: m?.mode ?? def.mode ?? "sticky",
    controls,
    back,
    hasInput: m?.hasInput ?? !!def.onInput,
    hasAlbum: m?.hasAlbum ?? !!def.onAlbum,
    hasPayment: m?.hasPayment ?? !!def.onPayment,
    hasGate: m?.hasGate ?? !!def.gate,
    flow: m?.flow,
  };
}

// Non-navigation controls become lines inside the node; nav becomes an edge.
function controlLine(c: ControlMeta): string | null {
  switch (c.kind) {
    case "nav": return null; // drawn as an edge
    case "button": return `▶️ ${esc(c.label)}${c.conditional ? " (if)" : ""} ⚡${esc(c.action)}`;
    case "pick": return `◉ ${esc(c.key)}: ${c.values.map(esc).join(" / ")}`;
    case "toggle": return `☑ ${esc(c.label)}`;
    case "link": return `🔗 ${esc(c.label)}`;
    case "webapp": return `📲 ${esc(c.label)}`;
    case "custom": return `⋯ dynamic row`;
  }
}

function nodeLabel(sv: ScreenView): string {
  const lines: string[] = [`🖥 ${esc(sv.name)}`];
  if (sv.entry) lines.push(`▶ ${esc(sv.entry)}`);
  if (sv.mode === "feed") lines.push("⌁ feed");
  if (sv.hasGate) lines.push("🔒 gated");
  if (sv.flow) lines.push("──────", ...sv.flow.steps.map((s, i) => `${i + 1}. ${esc(s.kind)} ${esc(s.key)}`));
  const ctlLines = sv.controls.map(controlLine).filter((l): l is string => !!l);
  if (sv.back) ctlLines.push("⬅️ back");
  if (ctlLines.length) lines.push("──────", ...ctlLines);
  if (sv.hasInput) lines.push("⌨️ accepts input");
  if (sv.hasAlbum) lines.push("🖼 accepts album");
  if (sv.hasPayment) lines.push("⭐ payment");
  return lines.join("<br/>");
}

export interface GraphOptions {
  menu?: MenuButton[][];
  format?: "mermaid" | "html";
  title?: string;
}

// Render the bot as a Mermaid flowchart string.
export function mermaid(regs: ScreenReg[], opts: { menu?: MenuButton[][] } = {}): string {
  const views = regs.map(describe);
  const known = new Set(regs.map((r) => r.name));
  const out: string[] = ["flowchart TD"];

  // The way in: a start node → each entry command's screen.
  const entries = views.filter((v) => v.entry);
  if (entries.length) {
    out.push(`  start(("▶")):::entry`);
    for (const v of entries) out.push(`  start -->|"${esc(v.entry!)}"| ${nodeId(v.name)}`);
  }

  // The persistent menu: one node → each target screen.
  if (opts.menu?.length) {
    out.push(`  menu[/"≡ menu"/]:::menu`);
    for (const row of opts.menu)
      for (const b of row) out.push(`  menu -->|"${esc(b.label)}"| ${nodeId(b.go)}`);
  }

  // A node per screen, with all its local controls in the label.
  for (const v of views) out.push(`  ${nodeId(v.name)}["${nodeLabel(v)}"]`);

  // Navigation edges from nav controls. Unknown targets get a visible stub (the
  // validator flags these too, but the graph should never hide a broken link).
  for (const v of views) {
    for (const c of v.controls) {
      if (c.kind !== "nav") continue;
      if (!known.has(c.to)) out.push(`  ${nodeId(c.to)}["❓ ${esc(c.to)}<br/>(missing)"]:::missing`);
      out.push(`  ${nodeId(v.name)} -->|"${esc(c.label)}"| ${nodeId(c.to)}`);
    }
  }

  out.push(
    "  classDef entry fill:#16a34a,color:#fff,stroke:#166534;",
    "  classDef menu fill:#7c3aed,color:#fff,stroke:#5b21b6;",
    "  classDef missing fill:#dc2626,color:#fff,stroke:#991b1b;",
  );
  return out.join("\n");
}

// Wrap the Mermaid in a self-contained HTML page (CDN-rendered) so `format:
// "html"` can be written to a file and opened in a browser — no toolchain.
function html(diagram: string, title = "tgx — bot graph"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;background:#0b0b0f;color:#e5e7eb;font-family:ui-sans-serif,system-ui}
h1{font:600 14px ui-monospace,monospace;padding:12px 16px;margin:0;color:#a1a1aa}
.mermaid{padding:16px}</style></head><body>
<h1>${title}</h1>
<pre class="mermaid">${diagram.replace(/</g, "&lt;")}</pre>
<script type="module">import m from"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";m.initialize({startOnLoad:true,theme:"dark"});</script>
</body></html>`;
}

// The public entry: return Mermaid (default) or a ready-to-open HTML page.
export function graph(regs: ScreenReg[], opts: GraphOptions = {}): string {
  const diagram = mermaid(regs, { menu: opts.menu });
  return opts.format === "html" ? html(diagram, opts.title) : diagram;
}
