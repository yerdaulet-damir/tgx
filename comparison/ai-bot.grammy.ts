// The SAME bot as examples/ai-image-bot/bot.ts, but on raw grammY.
// It honestly replicates all of the same behavior: state persistence, a config
// card with toggles (editing the same message), a model-picker sub-screen,
// button evaporation during generation and their return afterwards, callback
// auto-answer, swallowing "message is not modified", error handling (otherwise
// the bot crashes), and web_app + url buttons.
//
// Everything that is a default in tgx is written by hand here.
import { Bot, Context, InlineKeyboard, session, type SessionFlavor, type StorageAdapter } from "grammy";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

// --- 1. Persistence: a hand-rolled storage adapter (built into tgx) ---
function fileStorage<T>(path: string): StorageAdapter<T> {
  const load = (): Record<string, T> => {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, T>;
    } catch {
      return {};
    }
  };
  const save = (d: Record<string, T>) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(d));
  };
  return {
    read: (k) => load()[k],
    write: (k, v) => { const d = load(); d[k] = v; save(d); },
    delete: (k) => { const d = load(); delete d[k]; save(d); },
  };
}

// --- 2. State shape — by hand, plus tracking the card message id for edits ---
interface SessionData {
  model: string;
  ratio: string;
  enhance: boolean;
  status: "idle" | "working";
  mode: "config" | "model";
  lastPrompt?: string;
  cardChatId?: number;   // we track which message to edit ourselves
  cardMsgId?: number;
}
type Ctx = Context & SessionFlavor<SessionData>;

const MODELS: Record<string, string> = { flux: "Flux", turbo: "Turbo" };
const RATIOS: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "16:9": [1280, 720], "9:16": [720, 1280],
};

function buildUrl(prompt: string, s: SessionData): string {
  const [w, h] = RATIOS[s.ratio];
  const q = new URLSearchParams({
    width: String(w), height: String(h), model: s.model, nologo: "true",
    ...(s.enhance ? { enhance: "true" } : {}),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
}

// --- 3. Render: build the keyboard, decide reply-or-edit, swallow "not modified" ---
function renderView(s: SessionData): { text: string; kb: InlineKeyboard } {
  if (s.mode === "model") {
    const kb = new InlineKeyboard();
    for (const [v, l] of Object.entries(MODELS))
      kb.text(s.model === v ? `✅ ${l}` : l, `pickmodel:${v}`).row();
    return { text: "Pick a model:", kb };
  }
  if (s.status === "working")
    return { text: `⏳ Generating "${s.lastPrompt}"…\nButtons return when it's ready.`, kb: new InlineKeyboard() };

  const kb = new InlineKeyboard()
    .text(`Model: ${MODELS[s.model]} ✏️`, "tomodel").row();
  for (const r of Object.keys(RATIOS)) kb.text(s.ratio === r ? `✅ ${r}` : r, `ratio:${r}`);
  kb.row();
  kb.text(s.enhance ? "✅ Enhance prompt" : "☐ Enhance prompt", "enhance").row();
  kb.webApp("🖼 Gallery (mini app)", "https://pollinations.ai").url("📣 Channel", "https://t.me/telegram").row();
  if (s.lastPrompt) kb.text("🔁 Repeat last", "again");
  const text =
    `🎨 AI generation\nModel: ${MODELS[s.model]}\nRatio: ${s.ratio}\n` +
    `Prompt enhancement: ${s.enhance ? "on" : "off"}\n\nSend a text prompt as a message — I'll draw it.`;
  return { text, kb };
}

async function draw(ctx: Ctx) {
  const { text, kb } = renderView(ctx.session);
  if (ctx.session.cardChatId && ctx.session.cardMsgId) {
    // edit the same message — and swallow "message is not modified" ourselves
    await ctx.api
      .editMessageText(ctx.session.cardChatId, ctx.session.cardMsgId, text, { reply_markup: kb })
      .catch(() => {});
  } else {
    const m = await ctx.reply(text, { reply_markup: kb });
    ctx.session.cardChatId = m.chat.id;
    ctx.session.cardMsgId = m.message_id;
  }
}

const bot = new Bot<Ctx>(process.env.BOT_TOKEN!);

// --- 4. Resilience: without this a single failure takes down the whole process ---
bot.catch((err) => console.error("update failed:", err.error));

bot.use(session({
  initial: (): SessionData => ({ model: "flux", ratio: "1:1", enhance: true, status: "idle", mode: "config" }),
  storage: fileStorage(".tgx/ai-grammy.json"),
}));

bot.command("start", async (ctx) => {
  ctx.session.cardChatId = undefined; // fresh root render
  ctx.session.cardMsgId = undefined;
  await draw(ctx);
});

// --- 5. Every callback — answer it ourselves (else an eternal spinner), route by data ---
bot.on("callback_query:data", async (ctx) => {
  await ctx.answerCallbackQuery();
  const [action, value] = ctx.callbackQuery.data.split(":");
  const s = ctx.session;
  switch (action) {
    case "tomodel": s.mode = "model"; break;
    case "pickmodel": s.model = value; s.mode = "config"; break;
    case "ratio": s.ratio = value; break;
    case "enhance": s.enhance = !s.enhance; break;
    case "again": if (s.lastPrompt) { await generate(ctx, s.lastPrompt); return; } break;
  }
  await draw(ctx);
});

// --- 6. Text = prompt → generation ---
bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return;
  await generate(ctx, ctx.message.text);
});

// --- 7. Generation: set working, re-render, catch errors, restore — all by hand ---
async function generate(ctx: Ctx, prompt: string) {
  ctx.session.status = "working";
  ctx.session.lastPrompt = prompt;
  await draw(ctx); // collapse the card
  const url = buildUrl(prompt, ctx.session);
  try {
    await ctx.replyWithPhoto(url, { caption: `"${prompt}" · ${MODELS[ctx.session.model]} · ${ctx.session.ratio}` });
  } catch {
    await ctx.reply("Service unavailable, try again later.");
  }
  ctx.session.status = "idle";
  await draw(ctx); // bring the card with buttons back
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
bot.start();
