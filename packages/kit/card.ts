// card — a self-rendering panel with file-collecting slots. It is a thin builder
// over the core screen engine: render-from-state, evaporation, auto-answer and
// persistence all come from the engine, so a card is just a screen whose state
// carries an "open slot" and whose input handler collects uploads.
import { defineScreen, type ScreenReg, type ScreenCtx, type Btn } from "@tgxjs/core";

// Card buttons are declared in a compact form and mapped to engine buttons.
type CardBtn =
  | { label: string; action: string; value?: string } // run an action
  | { label: string; slot: string } // open a slot to collect a file
  | { label: string; url: string }; // link

interface Slot {
  kind: "photo" | "video";
  min: number;
  max: number;
  maxMb: number;
}

interface CardCtx<S> {
  state: S;
  call<T>(fn: () => Promise<T>): Promise<T>; // error boundary
  image(url: string): Promise<void>;
  say(text: string): Promise<void>;
}

interface CardDef<S> {
  initial: () => S;
  slots?: Record<string, Slot>;
  render: (s: S) => { text: string; buttons: CardBtn[][] };
  actions: Record<string, (s: S, ctx: CardCtx<S>, value?: string) => S | Promise<S | void> | void>;
  onError?: (e: unknown) => string;
}

interface CardState<S> {
  s: S;
  openSlot?: string;
}

const mapButtons = (rows: CardBtn[][]): Btn[][] =>
  rows.map((row) =>
    row.map((b): Btn => {
      if ("url" in b) return { label: b.label, url: b.url };
      if ("slot" in b) return { label: b.label, do: "_slot", value: b.slot };
      return { label: b.label, do: b.action, value: b.value };
    }),
  );

export function card<S>(name: string, def: CardDef<S>, opts: { entry?: string } = {}): ScreenReg {
  const cardCtx = (ctx: ScreenCtx<CardState<S>>): CardCtx<S> => ({
    state: ctx.state.s,
    call: ctx.call,
    image: (url) => ctx.tg.replyWithPhoto(url).then(() => undefined),
    say: ctx.say,
  });

  return defineScreen<CardState<S>>(
    name,
    {
      state: () => ({ s: def.initial() }),
      view: (st) => {
        const { text, buttons } = def.render(st.s);
        return { text, buttons: mapButtons(buttons) };
      },
      on: {
        _slot: (ctx, value) => {
          ctx.state.openSlot = value; // now waiting for an upload
        },
        ...Object.fromEntries(
          Object.keys(def.actions).map((key) => [
            key,
            async (ctx: ScreenCtx<CardState<S>>, value?: string) => {
              const next = await def.actions[key](ctx.state.s, cardCtx(ctx), value);
              if (next !== undefined) ctx.state.s = next as S;
            },
          ]),
        ),
      },
      onInput: async (ctx, msg) => {
        const open = ctx.state.openSlot;
        if (!open) return;
        const slot = def.slots?.[open];
        if (!slot) return;

        const file = slot.kind === "photo" ? msg.photo : msg.video;
        if (!file) {
          await ctx.say(slot.kind === "photo" ? "Please send a photo." : "Please send a video.");
          return;
        }
        if (msg.sizeBytes && msg.sizeBytes > slot.maxMb * 1024 * 1024) {
          await ctx.say(`File too large, max ${slot.maxMb} MB.`);
          return;
        }
        const arr = ((ctx.state.s as Record<string, unknown>)[open] ??= []) as string[];
        arr.push(file);
        if (arr.length >= slot.max) ctx.state.openSlot = undefined; // slot full
      },
      onError: def.onError,
    },
    opts,
  );
}
