// The fluent builder — the canonical way to write a screen. Reads top-to-bottom
// like a script. Clean helpers (.pick/.toggle/.button) cover the 90%; but there is
// an escape hatch at EVERY level so customization is total and never worse than
// raw grammY:
//   .row(s => [...])   — emit any custom button row
//   .view(s => View)   — bypass auto-render entirely, return your own View
//   .on(key, handler)  — arbitrary logic; handler ctx exposes .tg (raw grammY)
// You never trade "clean" for "powerful" — you get both.
import {
  defineScreen,
  type ScreenReg,
  type ScreenDef,
  type ScreenCtx,
  type View,
  type Btn,
  type InputMsg,
  type IncomingFile,
  type Gate,
  type ControlMeta,
} from "./screen.js";

// Handler context = the engine's ScreenCtx plus a convenience `working()`.
export interface Ctx<S> extends ScreenCtx<S> {
  working(text?: string): Promise<void>; // show a transient "…" state, hide controls
}

type Ctl<S> =
  | { t: "pick"; key: string; values: string[]; label?: (v: string) => string }
  | { t: "toggle"; key: string; label: string }
  | { t: "button"; label: string; action: string; when?: (s: S) => boolean }
  | { t: "webapp"; label: string; url: string }
  | { t: "link"; label: string; url: string }
  | { t: "nav"; label: string; go: string }
  | { t: "custom"; row: (s: S) => Btn[] };

export class Builder<S extends Record<string, any>> {
  private _state: (init?: unknown) => S = () => ({}) as S;
  private _mode: "sticky" | "feed" = "sticky";
  private _text: (s: S) => string = () => "";
  private _ctls: Ctl<S>[] = [];
  private _actions: Record<string, (c: Ctx<S>, value?: string) => unknown> = {};
  private _prompt?: (c: Ctx<S>, text: string) => unknown;
  private _input?: (c: Ctx<S>, msg: InputMsg) => unknown;
  private _album?: (c: Ctx<S>, files: IncomingFile[]) => unknown;
  private _payment?: (c: Ctx<S>) => unknown;
  private _viewOverride?: (s: S) => View;
  private _gate?: Gate;
  private _entry?: string;
  private _onError?: (e: unknown) => string;
  constructor(private name: string) {}

  // Accepts a plain initial state, or a factory that receives the value passed to
  // go(name, init) / replace(name, init) — this is how data flows along an edge.
  state(init: S | ((init?: unknown) => S)): this {
    this._state = typeof init === "function" ? (init as (init?: unknown) => S) : () => structuredClone(init);
    return this;
  }
  mode(m: "sticky" | "feed"): this { this._mode = m; return this; }
  text(fn: (s: S) => string): this { this._text = fn; return this; }

  // single-select toggle row bound to state[key]
  pick(key: keyof S & string, values: string[], label?: (v: string) => string): this {
    this._ctls.push({ t: "pick", key, values, label });
    return this;
  }
  // boolean toggle bound to state[key]
  toggle(key: keyof S & string, label: string): this {
    this._ctls.push({ t: "toggle", key, label });
    return this;
  }
  // action button (optionally conditional), wired to .action(key)
  button(label: string, action: string, when?: (s: S) => boolean): this {
    this._ctls.push({ t: "button", label, action, when });
    return this;
  }
  webapp(label: string, url: string): this { this._ctls.push({ t: "webapp", label, url }); return this; }
  link(label: string, url: string): this { this._ctls.push({ t: "link", label, url }); return this; }
  nav(label: string, go: string): this { this._ctls.push({ t: "nav", label, go }); return this; }

  // escape hatch #1: emit any custom row of buttons from state
  row(fn: (s: S) => Btn[]): this { this._ctls.push({ t: "custom", row: fn }); return this; }
  // escape hatch #2: replace auto-render entirely
  view(fn: (s: S) => View): this { this._viewOverride = fn; return this; }

  action(key: string, handler: (c: Ctx<S>, value?: string) => unknown): this {
    this._actions[key] = handler;
    return this;
  }
  onPrompt(handler: (c: Ctx<S>, text: string) => unknown): this { this._prompt = handler; return this; }
  onInput(handler: (c: Ctx<S>, msg: InputMsg) => unknown): this { this._input = handler; return this; }
  onAlbum(handler: (c: Ctx<S>, files: IncomingFile[]) => unknown): this { this._album = handler; return this; }
  onPayment(handler: (c: Ctx<S>) => unknown): this { this._payment = handler; return this; }
  onError(fn: (e: unknown) => string): this { this._onError = fn; return this; }
  gate(gate: Gate): this { this._gate = gate; return this; }   // entry guard (e.g. requireChannel)
  entry(cmd: string): this { this._entry = cmd; return this; }

  private autoView(s: S): View {
    if (s.__working) return { text: String(s.__working) }; // transient: no controls
    const label = (c: Extract<Ctl<S>, { t: "pick" }>, v: string) => (c.label ? c.label(v) : v);
    const buttons: Btn[][] = [];
    for (const c of this._ctls) {
      if (c.t === "pick")
        buttons.push(
          c.values.map((v) => ({ label: s[c.key] === v ? `✅ ${label(c, v)}` : label(c, v), do: "_pick", value: `${c.key}:${v}` })),
        );
      else if (c.t === "toggle")
        buttons.push([{ label: s[c.key] ? `✅ ${c.label}` : `☐ ${c.label}`, do: "_toggle", value: c.key }]);
      else if (c.t === "button") {
        if (!c.when || c.when(s)) buttons.push([{ label: c.label, do: c.action }]);
      } else if (c.t === "webapp") buttons.push([{ label: c.label, webapp: c.url }]);
      else if (c.t === "link") buttons.push([{ label: c.label, url: c.url }]);
      else if (c.t === "nav") buttons.push([{ label: c.label, go: c.go }]);
      else if (c.t === "custom") {
        const r = c.row(s);
        if (r.length) buttons.push(r);
      }
    }
    return { text: this._text(s), buttons: buttons.filter((r) => r.length) };
  }

  build(): ScreenReg {
    const enrich = (c: ScreenCtx<S>): Ctx<S> =>
      Object.assign(Object.create(Object.getPrototypeOf(c)), c, {
        working: async (text?: string) => {
          (c.state as Record<string, unknown>).__working = text ?? "Working…";
          await c.render();
        },
      });

    const def: ScreenDef<S> = {
      state: (init) => this._state(init),
      mode: this._mode,
      view: (s) => (this._viewOverride ? this._viewOverride(s) : this.autoView(s)),
      on: {
        _pick: (c, value) => {
          const i = value!.indexOf(":");
          (c.state as Record<string, unknown>)[value!.slice(0, i)] = value!.slice(i + 1);
        },
        _toggle: (c, value) => {
          const st = c.state as Record<string, unknown>;
          st[value!] = !st[value!];
        },
        ...Object.fromEntries(
          Object.entries(this._actions).map(([k, h]) => [k, (c: ScreenCtx<S>, v?: string) => h(enrich(c), v)]),
        ),
      },
      onInput:
        this._prompt || this._input
          ? async (c, msg: InputMsg) => {
              const bc = enrich(c);
              if (this._input) await this._input(bc, msg);
              if (this._prompt && msg.text) await this._prompt(bc, msg.text);
              (c.state as Record<string, unknown>).__working = undefined; // settle → full card back
            }
          : undefined,
      onAlbum: this._album ? async (c, files: IncomingFile[]) => { await this._album!(enrich(c), files); } : undefined,
      onPayment: this._payment ? async (c) => { await this._payment!(enrich(c)); } : undefined,
      gate: this._gate,
      onError: this._onError,
    };

    // Record what this screen statically declares so the boot-time validator can
    // check references and the graph generator can draw the interface. Escape
    // hatches (.row/.view) produce buttons from live state we can't inspect here
    // → mark dynamic so the validator skips them rather than pass them falsely.
    const navTargets: string[] = [];
    const buttonActions: string[] = [];
    const controls: ControlMeta[] = [];
    let dynamic = !!this._viewOverride;
    for (const c of this._ctls) {
      if (c.t === "nav") {
        navTargets.push(c.go);
        controls.push({ kind: "nav", label: c.label, to: c.go });
      } else if (c.t === "button") {
        buttonActions.push(c.action);
        controls.push({ kind: "button", label: c.label, action: c.action, conditional: !!c.when });
      } else if (c.t === "pick") controls.push({ kind: "pick", key: c.key, values: c.values });
      else if (c.t === "toggle") controls.push({ kind: "toggle", key: c.key, label: c.label });
      else if (c.t === "link") controls.push({ kind: "link", label: c.label, url: c.url });
      else if (c.t === "webapp") controls.push({ kind: "webapp", label: c.label, url: c.url });
      else if (c.t === "custom") { dynamic = true; controls.push({ kind: "custom" }); }
    }

    return defineScreen(this.name, def, {
      entry: this._entry,
      meta: {
        navTargets,
        buttonActions,
        dynamic,
        controls,
        mode: this._mode,
        hasInput: !!(this._prompt || this._input),
        hasAlbum: !!this._album,
        hasPayment: !!this._payment,
        hasGate: !!this._gate,
      },
    });
  }
}

// Fluent entry point. `const s = screen<MyState>("name").state(...)...`
export function screen<S extends Record<string, any> = Record<string, any>>(name: string): Builder<S> {
  return new Builder<S>(name);
}
