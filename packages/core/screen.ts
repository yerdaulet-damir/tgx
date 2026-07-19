// The unified engine. ONE render-owning lifecycle for every screen in the bot.
//
// A screen renders from its state and handles interactions that either mutate
// state or navigate. flow() (linear wizard) and card() (self-rendering panel)
// are both just special cases built on this — there is exactly one way to draw a
// screen, one callback convention, one place that evaporates stale keyboards, one
// persisted navigation stack. That single ownership is why menus, back-navigation,
// evaporation and restart-resume all fall out for free instead of being written
// per screen.
import {
  Bot,
  Context,
  InlineKeyboard,
  Keyboard,
  session,
  type StorageAdapter,
} from "grammy";
import { fileStorage } from "./storage.js";
import { validate, formatIssues } from "./validate.js";
import { runStream, type StreamChunk, type StreamOptions, type StreamResult } from "./stream.js";
import { graph } from "./graph.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------------------
// Public types — the dev-facing surface.
// ---------------------------------------------------------------------------

export interface View {
  text: string;
  buttons?: Btn[][]; // inline keyboard (in-message actions / navigation)
  menu?: string[][]; // reply keyboard labels → persistent bottom menu
  parseMode?: "HTML" | "MarkdownV2";
}

// A button is a declaration of intent; the engine resolves it to Telegram wire.
export type Btn =
  | { label: string; go: string; init?: unknown } // push a screen
  | { label: string; back: true } // pop a screen
  | { label: string; do: string; value?: string } // run a handler on this screen
  | { label: string; url: string } // plain link
  | { label: string; webapp: string }; // open a Telegram mini app

// Every Telegram media type normalized to one shape. `fileId` downloads/resends;
// `fileUniqueId` is the stable dedupe key. Missing mimes are synthesized.
export interface IncomingFile {
  kind: "photo" | "document" | "video" | "animation" | "audio" | "voice" | "video_note" | "sticker";
  fileId: string;
  fileUniqueId: string;
  mime?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  fileName?: string;
}

export interface InputMsg {
  text?: string;
  file?: IncomingFile; // normalized media, whatever type was sent
  photo?: string; // file_id shortcuts (back-compat)
  video?: string;
  document?: string;
  sizeBytes?: number;
}

// Collapse the 8 different media fields on a Message into one IncomingFile.
export function normalizeFile(m: Record<string, any>): IncomingFile | undefined {
  if (m.photo?.length) {
    const p = m.photo[m.photo.length - 1]; // largest
    return { kind: "photo", fileId: p.file_id, fileUniqueId: p.file_unique_id, mime: "image/jpeg", size: p.file_size, width: p.width, height: p.height };
  }
  const map: [string, IncomingFile["kind"], string?][] = [
    ["document", "document"], ["video", "video"], ["animation", "animation"],
    ["audio", "audio"], ["voice", "voice", "audio/ogg"], ["video_note", "video_note", "video/mp4"], ["sticker", "sticker"],
  ];
  for (const [field, kind, fallbackMime] of map) {
    const o = m[field];
    if (!o) continue;
    return {
      kind,
      fileId: o.file_id,
      fileUniqueId: o.file_unique_id,
      mime: o.mime_type ?? fallbackMime,
      size: o.file_size,
      width: o.width ?? o.length,
      height: o.height ?? o.length,
      duration: o.duration,
      fileName: o.file_name,
    };
  }
  return undefined;
}

export interface ScreenCtx<S> {
  state: S; // mutate in place; persisted automatically
  from: { id: number };
  tg: Context; // escape hatch to raw grammY (invoices, media, anything)
  go(name: string, init?: unknown): void; // push
  back(): void; // pop
  replace(name: string, init?: unknown): void; // swap top
  reset(name: string, init?: unknown): void; // clear the stack and start fresh at `name` (e.g. "home")
  exit(): void; // pop to nothing (end a flow)
  render(): Promise<void>; // force a re-render now (e.g. show a "working…" state mid-handler)
  say(text: string): Promise<void>; // post a text message (feed-aware)
  // Stream an LLM (or any) token stream into a live-updating message. Throttled
  // to stay under Telegram's edit limits; shows a cursor + optional reasoning;
  // rolls past 4096 chars. Feed-aware. Returns the full text + reasoning.
  stream(source: AsyncIterable<StreamChunk>, opts?: StreamOptions): Promise<StreamResult>;
  image(url: string, caption?: string): Promise<void>; // post a photo (feed-aware)
  action(type: "typing" | "upload_photo" | "upload_document" | "upload_video" | "record_voice"): Promise<void>; // chat action
  download(fileId: string): Promise<string>; // getFile → downloadable URL
  call<T>(fn: () => Promise<T>): Promise<T>; // error boundary
  track(event: string): void;
}

export interface ScreenDef<S = any> {
  state?: (init?: unknown) => S;
  // "sticky" (default): one message, edited in place — good for pure config panels.
  // "feed": content (image/say) is posted below and the card re-posts at the bottom,
  // so controls always travel to the latest result. Good for generators / chat feeds.
  mode?: "sticky" | "feed";
  onEnter?: (ctx: ScreenCtx<S>) => void | Promise<void>; // fired when it becomes top
  view: (s: S) => View;
  on?: Record<string, (ctx: ScreenCtx<S>, value?: string) => void | Promise<void>>;
  onInput?: (ctx: ScreenCtx<S>, msg: InputMsg) => void | Promise<void>; // text/media
  onAlbum?: (ctx: ScreenCtx<S>, files: IncomingFile[]) => void | Promise<void>; // media group, buffered
  onPayment?: (ctx: ScreenCtx<S>) => void | Promise<void>; // successful_payment
  gate?: Gate; // entry guard (e.g. require a channel subscription)
  onError?: (e: unknown) => string;
}

// An entry guard. If check() is false the screen shows view() instead (with a
// "recheck" button); when it passes, the real screen renders.
export interface Gate {
  check(ctx: Ctx): Promise<boolean>;
  view(): View;
}

// The most-written-by-hand bot pattern: require the user to be subscribed to a
// channel. Handles the three states (member / not / call failed) with a policy.
// The bot must be an admin of the channel for getChatMember to work.
export function requireChannel(
  channel: string,
  opts: { onError?: "allow" | "deny"; text?: string; joinLabel?: string; checkLabel?: string } = {},
): Gate {
  const url = `https://t.me/${channel.replace(/^@/, "")}`;
  return {
    async check(ctx) {
      try {
        const m = await ctx.api.getChatMember(channel, ctx.from!.id);
        return ["member", "administrator", "creator"].includes(m.status);
      } catch {
        return opts.onError !== "deny"; // call failed → default allow (presumption of innocence)
      }
    },
    view: () => ({
      text: opts.text ?? `Please join ${channel} to continue.`,
      buttons: [
        [{ label: opts.joinLabel ?? "Join channel", url }],
        [{ label: opts.checkLabel ?? "I joined", do: "_recheck" }],
      ],
    }),
  };
}

// One declared control on a screen — enough to both validate references and
// draw the interface graph (label, kind, where it leads / what it does).
export type ControlMeta =
  | { kind: "nav"; label: string; to: string } // → another screen (an edge)
  | { kind: "button"; label: string; action: string; conditional?: boolean } // runs .action()
  | { kind: "pick"; key: string; values: string[] } // single-select
  | { kind: "toggle"; key: string; label: string } // boolean
  | { kind: "link"; label: string; url: string }
  | { kind: "webapp"; label: string; url: string }
  | { kind: "custom" }; // .row() escape hatch — contents unknown statically

// What a screen statically declares, recorded at build time so the boot-time
// validator can check references AND the graph generator can draw the interface
// without executing view() over live state.
export interface ScreenMeta {
  navTargets: string[]; // screen names this screen navigates to (.nav / go buttons)
  buttonActions: string[]; // action names buttons reference (need a .action() handler)
  dynamic: boolean; // uses .row()/.view() → buttons not statically analyzable
  controls: ControlMeta[]; // every declared control, in order (for the graph)
  mode: "sticky" | "feed";
  hasInput: boolean; // accepts text/files (onPrompt/onInput)
  hasAlbum: boolean;
  hasPayment: boolean;
  hasGate: boolean;
  flow?: { steps: { key: string; kind: string }[] }; // set for flow() wizards
}

export interface ScreenReg {
  name: string;
  entry?: string; // e.g. "/start" — registers a command that opens this screen
  def: ScreenDef;
  meta?: ScreenMeta; // present for builder/flow screens; absent for raw defineScreen
}

// Low-level object form. The fluent builder (screen()) compiles down to this;
// use it directly only for advanced cases the builder doesn't cover.
export function defineScreen<S>(
  name: string,
  def: ScreenDef<S>,
  opts: { entry?: string; meta?: ScreenMeta } = {},
): ScreenReg {
  return { name, entry: opts.entry, def: def as ScreenDef, meta: opts.meta };
}

// ---------------------------------------------------------------------------
// Runtime internals.
// ---------------------------------------------------------------------------

interface Frame {
  name: string;
  state: any;
  msg?: { chatId: number; messageId: number }; // last message this frame drew
}
export interface NavSession {
  stack: Frame[];
  menuShown?: boolean; // persistent reply menu sent once
}

// A persistent bottom-menu button: tapping jumps to a screen (resets the stack).
export interface MenuButton {
  label: string;
  go: string;
}
export type Ctx = Context & { session: NavSession };

// Neutral English defaults. Override per-screen with .onError(), or globally by
// wrapping. The engine bakes in no locale.
const DEFAULT_ERROR = (e: unknown): string => {
  const status = (e as { status?: number })?.status;
  if (status && status >= 400 && status < 500)
    return (e as { message?: string }).message ?? "That didn't work — check your input.";
  return "Something went wrong. Please try again later.";
};

// One callback convention for the whole framework: t:<screen>:<action>:<value>.
// Namespaced by screen so a stale button from another screen is inert, not misrouted.
const encode = (screen: string, action: string, value = ""): string =>
  `t:${screen}:${action}:${value}`.slice(0, 64); // Telegram hard limit
const isNav = (data?: string): data is string => !!data?.startsWith("t:");
const decode = (data: string) => {
  const [, name, action, ...rest] = data.split(":");
  return { name, action, value: rest.join(":") };
};

function inlineKeyboard(rows: Btn[][], screen: string): InlineKeyboard {
  const k = new InlineKeyboard();
  for (const row of rows) {
    for (const b of row) {
      if ("url" in b) k.url(b.label, b.url);
      else if ("webapp" in b) k.webApp(b.label, b.webapp);
      else if ("back" in b) k.text(b.label, encode(screen, "_back"));
      else if ("go" in b) k.text(b.label, encode(screen, "_go", b.go));
      else k.text(b.label, encode(screen, b.do, b.value ?? ""));
    }
    k.row();
  }
  return k;
}

function replyKeyboard(rows: string[][]): Keyboard {
  const k = new Keyboard();
  for (const row of rows) {
    for (const label of row) k.text(label);
    k.row();
  }
  return k.resized().persistent();
}

const top = (ctx: Ctx): Frame | undefined => ctx.session.stack.at(-1);

// ---------------------------------------------------------------------------
// The engine.
// ---------------------------------------------------------------------------

export class Engine {
  private registry = new Map<string, ScreenDef>();
  private albums = new Map<string, { files: IncomingFile[]; timer: ReturnType<typeof setTimeout> }>();
  private menuMap = new Map<string, string>(); // menu label → screen name
  constructor(
    regs: ScreenReg[],
    private track: (event: string, ctx: Ctx) => void,
    private token = "",
    private menu?: MenuButton[][], // persistent bottom menu
    private menuText = "Menu", // greeting sent with the persistent menu (overridable)
  ) {
    for (const r of regs) this.registry.set(r.name, r.def);
    for (const row of menu ?? []) for (const b of row) this.menuMap.set(b.label, b.go);
  }

  private def(name: string): ScreenDef {
    const d = this.registry.get(name);
    if (!d) throw new Error(`Unknown screen: ${name}`);
    return d;
  }

  // Draw a frame: inline screens edit their own message (free evaporation of the
  // previous keyboard); menu screens send a fresh message with a reply keyboard.
  private async render(ctx: Ctx, frame: Frame, fresh: boolean, override?: View) {
    const def = this.def(frame.name);
    const view = override ?? def.view(frame.state);

    if (view.menu) {
      const m = await ctx.reply(view.text, {
        reply_markup: replyKeyboard(view.menu),
        parse_mode: view.parseMode,
      });
      frame.msg = { chatId: m.chat.id, messageId: m.message_id };
      return;
    }

    const markup = inlineKeyboard(view.buttons ?? [], frame.name);
    if (frame.msg && !fresh) {
      await ctx.api
        .editMessageText(frame.msg.chatId, frame.msg.messageId, view.text, {
          reply_markup: markup,
          parse_mode: view.parseMode,
        })
        .catch(() => {}); // swallow "message is not modified"
    } else {
      const m = await ctx.reply(view.text, { reply_markup: markup, parse_mode: view.parseMode });
      frame.msg = { chatId: m.chat.id, messageId: m.message_id };
    }
  }

  private ctxFor(ctx: Ctx, frame: Frame): ScreenCtx<any> {
    const def = this.def(frame.name);
    // In feed mode, posting content first removes the current card, then settle()
    // re-posts a fresh card at the bottom — so controls follow the latest result.
    const post = async (send: () => Promise<unknown>) => {
      if (def.mode === "feed" && frame.msg) {
        await ctx.api.deleteMessage(frame.msg.chatId, frame.msg.messageId).catch(() => {});
        frame.msg = undefined;
      }
      await send();
    };
    return {
      state: frame.state,
      from: { id: ctx.from!.id },
      tg: ctx,
      go: (name, init) => {
        this.track(`${name}.open`, ctx);
        ctx.session.stack.push({ name, state: this.def(name).state?.(init) ?? {} });
      },
      back: () => {
        if (ctx.session.stack.length > 1) ctx.session.stack.pop();
      },
      replace: (name, init) => {
        ctx.session.stack.pop();
        this.track(`${name}.open`, ctx);
        ctx.session.stack.push({ name, state: this.def(name).state?.(init) ?? {} });
      },
      reset: (name, init) => {
        this.track(`${name}.open`, ctx);
        ctx.session.stack = [{ name, state: this.def(name).state?.(init) ?? {} }];
      },
      exit: () => {
        ctx.session.stack.pop();
      },
      render: async () => {
        const f = top(ctx);
        if (f) await this.render(ctx, f, false); // edit current message to reflect latest state
      },
      say: (t) => post(() => ctx.reply(t)).then(() => undefined),
      stream: (source, opts) =>
        runStream(source, {
          // In feed mode, clear the card first so the streamed answer lands in-feed;
          // the engine re-posts a fresh card below once the handler settles.
          detach: async () => {
            if (def.mode === "feed" && frame.msg) {
              await ctx.api.deleteMessage(frame.msg.chatId, frame.msg.messageId).catch(() => {});
              frame.msg = undefined;
            }
          },
          send: async (text, pm) => {
            const m = await ctx.reply(text, { parse_mode: pm as View["parseMode"] });
            return { chatId: m.chat.id, messageId: m.message_id };
          },
          edit: async (r, text, pm) => {
            try {
              await ctx.api.editMessageText(r.chatId, r.messageId, text, { parse_mode: pm as View["parseMode"] });
            } catch (e) {
              // Respect a 429 once; swallow "message is not modified" and the rest.
              const err = e as { error_code?: number; parameters?: { retry_after?: number } };
              if (err.error_code === 429) {
                await sleep((err.parameters?.retry_after ?? 1) * 1000);
                await ctx.api.editMessageText(r.chatId, r.messageId, text, { parse_mode: pm as View["parseMode"] }).catch(() => {});
              }
            }
          },
        }, opts),
      image: (url, caption) =>
        post(() => ctx.replyWithPhoto(url, caption ? { caption } : {})).then(() => undefined),
      action: (type) => ctx.replyWithChatAction(type).then(() => undefined),
      download: async (fileId) => {
        const f = await ctx.api.getFile(fileId);
        return `https://api.telegram.org/file/bot${this.token}/${f.file_path}`;
      },
      call: async <T>(fn: () => Promise<T>): Promise<T> => {
        try {
          return await fn();
        } catch (e) {
          await ctx.reply((def.onError ?? DEFAULT_ERROR)(e));
          throw e;
        }
      },
      track: (event) => this.track(event, ctx),
    };
  }

  // Enter a frame (run onEnter side effects), then draw it fresh.
  private async enterAndRender(ctx: Ctx, frame: Frame) {
    const def = this.def(frame.name);
    if (def.gate && !(await def.gate.check(ctx))) {
      await this.render(ctx, frame, true, def.gate.view()); // blocked → show the gate
      return;
    }
    if (def.onEnter) await def.onEnter(this.ctxFor(ctx, frame));
    const now = top(ctx);
    if (now) await this.render(ctx, now, true); // onEnter may have navigated
  }

  // Open a screen as a fresh root (used by entry commands & menu taps).
  async open(ctx: Ctx, name: string) {
    // Send the persistent bottom menu once — it replaces the letter keyboard and
    // stays under every later inline card.
    if (this.menu && !ctx.session.menuShown) {
      await ctx.reply(this.menuText, { reply_markup: replyKeyboard(this.menu.map((row) => row.map((b) => b.label))) });
      ctx.session.menuShown = true;
    }
    this.track(`${name}.open`, ctx);
    ctx.session.stack = [{ name, state: this.def(name).state?.() ?? {} }];
    await this.enterAndRender(ctx, ctx.session.stack[0]);
  }

  // After a handler runs, decide what to draw: same frame → edit in place;
  // navigation happened → evaporate the old keyboard and draw the new top fresh.
  private async settle(ctx: Ctx, before: Frame | undefined) {
    const after = top(ctx);
    if (after === before) {
      if (after) await this.render(ctx, after, false);
      return;
    }
    if (before?.msg) {
      await ctx.api.editMessageReplyMarkup(before.msg.chatId, before.msg.messageId).catch(() => {});
    }
    if (after) await this.enterAndRender(ctx, after);
  }

  // The dispatcher: every update, routed to the top screen of THIS user's stack.
  install(bot: Bot<Ctx>, regs: ScreenReg[]) {
    // Resilience by default: a failure in one update must never take down the bot.
    bot.catch((err) => {
      console.error(`[tgx] update ${err.ctx.update.update_id} failed:`, err.error);
    });

    bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

    for (const r of regs) {
      if (r.entry) bot.command(r.entry.replace(/^\//, ""), (ctx) => this.open(ctx, r.name));
    }

    bot.use(async (ctx, next) => {
      if (!ctx.session.stack) ctx.session.stack = [];
      const frame = top(ctx);
      if (!frame) return next();
      const def = this.def(frame.name);
      const sctx = this.ctxFor(ctx, frame);

      const cbData = ctx.callbackQuery?.data;
      if (isNav(cbData)) {
        const { name, action, value } = decode(cbData);
        await ctx.answerCallbackQuery(); // no eternal spinner
        if (name !== frame.name) return; // stale button from another screen → inert
        if (action === "_recheck") {
          // Re-run the gate in place: still blocked → keep the gate; passed → reveal.
          const g = def.gate;
          if (g && !(await g.check(ctx))) return this.render(ctx, frame, false, g.view());
          if (def.onEnter) await def.onEnter(sctx);
          return this.render(ctx, frame, false);
        }
        if (action === "_go") sctx.go(value);
        else if (action === "_back") sctx.back();
        else await def.on?.[action]?.(sctx, value || undefined);
        return this.settle(ctx, frame);
      }

      if (ctx.message?.successful_payment) {
        await def.onPayment?.(sctx);
        return this.settle(ctx, frame);
      }

      // Persistent-menu tap arrives as a text message equal to the button label →
      // jump to that screen (reset), before it can be mistaken for input.
      if (ctx.message?.text && this.menuMap.has(ctx.message.text)) {
        return this.open(ctx, this.menuMap.get(ctx.message.text)!);
      }

      // Media groups arrive as N separate updates sharing media_group_id, with no
      // count and caption only on the first. Buffer with a debounce, flush once.
      const groupId = (ctx.message as { media_group_id?: string } | undefined)?.media_group_id;
      if (ctx.message && def.onAlbum && groupId) {
        const file = normalizeFile(ctx.message);
        const entry = this.albums.get(groupId) ?? { files: [], timer: undefined as never };
        if (file) entry.files.push(file);
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => {
          this.albums.delete(groupId);
          Promise.resolve(def.onAlbum!(sctx, entry.files))
            .then(() => this.settle(ctx, frame))
            .catch((e) => console.error("[tgx] album flush failed:", e));
        }, 1000);
        this.albums.set(groupId, entry);
        return;
      }

      if (ctx.message && def.onInput) {
        const m = ctx.message;
        const media = m.photo?.at(-1);
        const input: InputMsg = {
          text: m.text,
          file: normalizeFile(m),
          photo: media?.file_id,
          video: m.video?.file_id,
          document: m.document?.file_id,
          sizeBytes: media?.file_size ?? m.video?.file_size ?? m.document?.file_size,
        };
        await def.onInput(sctx, input);
        return this.settle(ctx, frame);
      }

      return next();
    });
  }
}

// ---------------------------------------------------------------------------
// run() — wire storage, session, engine.
// ---------------------------------------------------------------------------

export interface RunOptions {
  token: string;
  storage?: string | StorageAdapter<NavSession>;
  track?: (event: string, ctx: Ctx) => void;
  // Visible analytics out of the box: pass a file path → every flow transition is
  // counted and a /stats command reports the funnel. No trackEvent() calls needed.
  analytics?: string;
  // Persistent bottom menu (replaces the letter keyboard). Tapping jumps to a screen.
  menu?: MenuButton[][];
  menuText?: string; // greeting shown with the persistent menu (default "Menu")
  // The ≡ side "Menu" button: the command list shown next to the input.
  commands?: { command: string; description: string }[];
}

// Anything the builder or defineScreen produces.
type Buildable = ScreenReg | { build(): ScreenReg };
const toReg = (r: Buildable): ScreenReg => ("build" in r ? r.build() : r);

// Zero-dep funnel analytics: counts events into a JSON file, reports on demand.
export function fileAnalytics(path: string) {
  const load = (): Record<string, number> => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, number>;
    } catch {
      return {};
    }
  };
  return {
    track: (event: string) => {
      const d = load();
      d[event] = (d[event] ?? 0) + 1;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(d));
    },
    report: (): string => {
      const d = load();
      const keys = Object.keys(d).sort();
      return keys.length ? "📊 Funnel:\n" + keys.map((k) => `${k}: ${d[k]}`).join("\n") : "No events yet.";
    },
  };
}

function resolveStorage(s: RunOptions["storage"]): StorageAdapter<NavSession> | undefined {
  if (!s) return undefined; // memory — dev only
  if (typeof s !== "string") return s;
  if (/^rediss?:\/\//.test(s)) {
    throw new Error(
      "Redis URL passed as a string. Install @grammyjs/storage-redis and pass its adapter instance as `storage`.",
    );
  }
  return fileStorage<NavSession>(s);
}

// ---------------------------------------------------------------------------
// broadcast — the mass-send everyone writes by hand and gets wrong.
// ---------------------------------------------------------------------------

export interface BroadcastResult {
  sent: number;
  blocked: number; // user blocked the bot (403) — you should mark them inactive
  failed: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Send a message to many users safely: throttle to stay under Telegram's ~30/s
// limit, treat 403 as "user blocked the bot" (never fatal), and respect 429
// retry_after instead of hammering. Never throws — returns a tally.
export async function broadcast(
  api: { sendMessage(chatId: number, text: string, other?: unknown): Promise<unknown> },
  userIds: number[],
  text: string,
  opts: { rate?: number; onBlocked?: (userId: number) => void } = {},
): Promise<BroadcastResult> {
  const gap = 1000 / (opts.rate ?? 25);
  const res: BroadcastResult = { sent: 0, blocked: 0, failed: 0 };
  for (const id of userIds) {
    try {
      await api.sendMessage(id, text);
      res.sent++;
    } catch (e) {
      const err = e as { error_code?: number; parameters?: { retry_after?: number } };
      if (err.error_code === 403) {
        res.blocked++;
        opts.onBlocked?.(id); // mark inactive; do not stop the broadcast
      } else if (err.error_code === 429) {
        await sleep((err.parameters?.retry_after ?? 1) * 1000);
        try {
          await api.sendMessage(id, text);
          res.sent++;
        } catch {
          res.failed++;
        }
      } else {
        res.failed++;
      }
    }
    await sleep(gap);
  }
  return res;
}

export function run(opts: RunOptions, screens: Buildable[]) {
  const regs = screens.map(toReg);

  // Durability gate: refuse to start a structurally-broken bot. A dangling nav
  // target or an unwired button becomes a clear boot error, not a runtime crash
  // three taps in — this is what lets an agent edit one screen without silently
  // breaking another.
  const issues = validate(regs, { menu: opts.menu });
  if (issues.length) throw new Error(formatIssues(issues));

  // See the whole interface as a graph instead of starting the bot:
  //   TGX_GRAPH=1     node bot.ts > bot.mmd    (Mermaid)
  //   TGX_GRAPH=html  node bot.ts > bot.html   (open in a browser)
  // Works on any bot with zero code changes.
  const g = process.env.TGX_GRAPH;
  if (g) {
    process.stdout.write(graph(regs, { menu: opts.menu, format: g === "html" ? "html" : "mermaid" }) + "\n");
    return undefined as unknown as Bot<Ctx>;
  }

  const bot = new Bot<Ctx>(opts.token);
  const storage = resolveStorage(opts.storage);
  bot.use(session({ initial: (): NavSession => ({ stack: [] }), storage }));

  // Analytics on by default when a path is given: count every event + expose /stats.
  const analytics = opts.analytics ? fileAnalytics(opts.analytics) : null;
  const track = opts.track ?? (analytics ? (e: string) => analytics.track(e) : (e: string) => console.log("[track]", e));
  if (analytics) bot.command("stats", (ctx) => ctx.reply(analytics.report()));

  if (opts.commands) bot.api.setMyCommands(opts.commands).catch(() => {}); // ≡ side menu

  const engine = new Engine(regs, track, opts.token, opts.menu, opts.menuText);
  engine.install(bot, regs);
  bot.start();
  return bot;
}
