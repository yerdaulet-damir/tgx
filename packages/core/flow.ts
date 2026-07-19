// flow() — a linear wizard, expressed as ONE screen on the unified engine.
// The wizard's state is { step index, collected data }; its view renders the
// current step; input/callback/payment advance the index. All rendering,
// evaporation, callback routing, persistence and analytics come from the engine —
// this file adds only the step semantics, no infrastructure.
import type { Context } from "grammy";
import { defineScreen, type ScreenDef, type ScreenCtx, type View, type InputMsg, type ScreenReg } from "./screen.js";

type Data = Record<string, unknown>;
interface WizardState {
  i: number;
  data: Data;
}

const validators: Record<string, (s: string) => boolean> = {
  email: (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s),
};

export interface Step {
  key: string;
  kind: "ask" | "choose" | "pay";
  when?: (d: Data) => boolean;
  render(d: Data): View;
  validate?: (s: string) => boolean; // ask
  retry?: string; // ask: custom re-prompt on invalid input
  enter?(ctx: ScreenCtx<WizardState>): Promise<void>; // pay: send invoice
}

// Ask for text; validate and re-prompt automatically until it passes.
export function ask(
  key: string,
  prompt: string,
  opts: { validate?: keyof typeof validators; retry?: string } = {},
): Step {
  return {
    key,
    kind: "ask",
    validate: opts.validate ? validators[opts.validate] : undefined,
    retry: opts.retry, // overridable re-prompt text
    render: () => ({ text: prompt }),
  };
}

// Inline choices; the engine auto-answers the callback and evaporates the keyboard.
export function choose(key: string, prompt: string, options: Record<string, string>): Step {
  return {
    key,
    kind: "choose",
    render: () => ({
      text: prompt,
      buttons: Object.entries(options).map(([value, label]) => [{ label, do: "pick", value }]),
    }),
  };
}

// Telegram Stars invoice. pre_checkout is auto-answered globally; successful_payment
// is routed back to THIS user's wizard by the engine — no manual session matching.
export function payStars(
  label: string,
  amount: number,
  opts: { when?: (d: Data) => boolean; text?: string } = {},
): Step {
  return {
    key: "_paid",
    kind: "pay",
    when: opts.when,
    render: () => ({ text: opts.text ?? `Invoice for ${amount} ⭐ sent — pay it above.` }),
    enter: async (ctx) => {
      await ctx.tg.replyWithInvoice(label, label, `ts:pay:${amount}`, "XTR", [{ label, amount }]);
    },
  };
}

export interface FlowConfig {
  entry: string;
  steps: Step[];
  done(ctx: Context, data: Data): Promise<void>;
}

export function flow(name: string, cfg: FlowConfig): ScreenReg {
  const steps = cfg.steps;

  const nextApplicable = (data: Data, from: number): number => {
    let i = from;
    while (i < steps.length && steps[i].when && !steps[i].when!(data)) i++;
    return i;
  };

  const advance = async (ctx: ScreenCtx<WizardState>, from: number) => {
    const i = nextApplicable(ctx.state.data, from);
    ctx.state.i = i;
    if (i >= steps.length) {
      ctx.track(`${name}.done`);
      await cfg.done(ctx.tg, ctx.state.data);
      ctx.exit();
      return;
    }
    ctx.track(`${name}.${steps[i].key}.entered`);
    if (steps[i].enter) await steps[i].enter!(ctx);
  };

  const def: ScreenDef<WizardState> = {
    state: () => ({ i: -1, data: {} }),
    onEnter: async (ctx) => {
      ctx.track(`${name}.started`);
      await advance(ctx, 0);
    },
    view: (s) =>
      s.i >= 0 && s.i < steps.length ? steps[s.i].render(s.data) : { text: "…" },
    on: {
      pick: async (ctx, value) => {
        const step = steps[ctx.state.i];
        if (step?.kind !== "choose") return;
        ctx.state.data[step.key] = value;
        ctx.track(`${name}.${step.key}.done`);
        await advance(ctx, ctx.state.i + 1);
      },
    },
    onInput: async (ctx, msg: InputMsg) => {
      const step = steps[ctx.state.i];
      if (step?.kind !== "ask" || !msg.text) return;
      if (step.validate && !step.validate(msg.text)) {
        await ctx.say(step.retry ?? "That doesn't look right, try again:");
        return;
      }
      ctx.state.data[step.key] = msg.text;
      ctx.track(`${name}.${step.key}.done`);
      await advance(ctx, ctx.state.i + 1);
    },
    onPayment: async (ctx) => {
      const step = steps[ctx.state.i];
      if (step?.kind !== "pay") return;
      ctx.state.data[step.key] = true;
      ctx.track(`${name}.${step.key}.done`);
      await advance(ctx, ctx.state.i + 1);
    },
  };

  // A flow is self-contained: its buttons ("pick") are handled internally and it
  // never navigates to other screens, so it declares no external references. Its
  // steps are recorded so the graph can draw the wizard sequence.
  return defineScreen(name, def, {
    entry: cfg.entry,
    meta: {
      navTargets: [],
      buttonActions: [],
      dynamic: false,
      controls: [],
      mode: "sticky",
      hasInput: steps.some((s) => s.kind === "ask"),
      hasAlbum: false,
      hasPayment: steps.some((s) => s.kind === "pay"),
      hasGate: false,
      flow: { steps: steps.map((s) => ({ key: s.key, kind: s.kind })) },
    },
  });
}
