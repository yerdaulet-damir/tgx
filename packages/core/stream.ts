// Streaming LLM output into a Telegram message — the single most hand-rolled
// (and most often broken) piece of every AI bot.
//
// The hard parts, all handled here so a bot never re-implements them:
//   • Rate limits — editMessageText throttles hard; naive per-token edits get 429.
//     We coalesce tokens and edit at most once per `throttle` ms.
//   • First paint is immediate — the user sees text the instant it starts.
//   • A live cursor (▌) while streaming, removed on the final flush.
//   • Reasoning vs answer — reasoning models emit a separate "thinking" stream;
//     it renders above the answer with its own header.
//   • The 4096-char ceiling — long answers roll into additional messages at a
//     word/line boundary instead of being truncated.
//
// Provider-agnostic by design: it consumes an AsyncIterable of chunks, which is
// exactly what every SDK exposes (OpenAI stream, Anthropic messages.stream,
// Vercel AI SDK textStream, Gemini). tgx bundles no model SDK.

// A chunk is either a plain text delta (the common case) or a tagged delta so
// reasoning tokens can be separated from answer tokens.
export type StreamChunk = string | { type?: "text" | "reasoning"; delta: string };

export interface StreamOptions {
  throttle?: number; // min ms between edits while streaming (default 800)
  cursor?: string; // glyph shown at the tail while streaming (default "▌")
  reasoningPrefix?: string; // header for the reasoning block (default "💭 ")
  parseMode?: "HTML" | "MarkdownV2";
  now?: () => number; // injectable clock (tests); defaults to Date.now
}

export interface StreamResult {
  text: string; // the full answer
  reasoning: string; // the full reasoning trace (empty if none)
}

export interface StreamRef {
  chatId: number;
  messageId: number;
}

// The IO the engine wires in. Kept abstract so this file is unit-testable with
// fakes and so feed-mode card handling stays in the engine, not here.
export interface StreamIO {
  detach(): Promise<void>; // called once before the first message (feed mode clears the card)
  send(text: string, parseMode?: string): Promise<StreamRef>;
  edit(ref: StreamRef, text: string, parseMode?: string): Promise<void>;
}

const LIMIT = 4096; // Telegram per-message character ceiling
const RESERVE = 2; // room for the trailing " ▌" while streaming

// Choose a split point near `max` that falls on a line/word boundary when there
// is a reasonable one, otherwise a hard cut.
function splitAt(s: string, max: number): number {
  if (s.length <= max) return s.length;
  const slice = s.slice(0, max);
  const nl = slice.lastIndexOf("\n");
  if (nl > max * 0.6) return nl;
  const sp = slice.lastIndexOf(" ");
  if (sp > max * 0.6) return sp;
  return max;
}

// Drive a chunk stream into one (or more) Telegram messages. Returns the full
// text + reasoning once the source is exhausted.
export async function runStream(
  source: AsyncIterable<StreamChunk>,
  io: StreamIO,
  opts: StreamOptions = {},
): Promise<StreamResult> {
  const throttle = opts.throttle ?? 800;
  const cursor = opts.cursor ?? "▌";
  const rprefix = opts.reasoningPrefix ?? "💭 ";
  const now = opts.now ?? Date.now;
  const pm = opts.parseMode;

  let text = "";
  let reasoning = "";
  let ref: StreamRef | undefined;
  let detached = false;
  let committed = 0; // chars of the composed doc already sealed into earlier messages
  let last = 0; // timestamp of the last paint
  let rendered = ""; // last body written to the current message (dedupe edits)

  const compose = () => (reasoning ? rprefix + reasoning + "\n\n" : "") + text;

  const write = async (body: string) => {
    if (!ref) {
      if (!detached) { await io.detach(); detached = true; }
      ref = await io.send(body || cursor, pm);
      rendered = body;
      return;
    }
    if (body === rendered) return; // nothing changed → skip the edit (avoids 429 + "not modified")
    rendered = body;
    await io.edit(ref, body || cursor, pm);
  };

  const paint = async (final: boolean) => {
    const full = compose();
    // Roll into a fresh message whenever the current page overflows the ceiling.
    while (full.length - committed > LIMIT - (final ? 0 : RESERVE)) {
      const start = committed;
      const cut = start + splitAt(full.slice(start), LIMIT - RESERVE);
      await write(full.slice(start, cut)); // seal this page (no cursor)
      committed = cut;
      ref = undefined; // next write opens a new message
      rendered = "";
    }
    const page = full.slice(committed);
    await write(page + (final ? "" : (page ? " " : "") + cursor));
  };

  for await (const chunk of source) {
    const type = typeof chunk === "string" ? "text" : chunk.type ?? "text";
    const delta = typeof chunk === "string" ? chunk : chunk.delta;
    if (!delta) continue;
    if (type === "reasoning") reasoning += delta;
    else text += delta;

    const t = now();
    if (!ref || t - last >= throttle) {
      last = t;
      await paint(false); // first paint is immediate; later ones are throttled
    }
  }
  await paint(true); // final flush: remove the cursor, commit the full text
  return { text, reasoning };
}
