# tgx

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](https://www.typescriptlang.org/)
[![Built on grammY](https://img.shields.io/badge/built%20on-grammY-009688.svg)](https://grammy.dev)
[![Tests](https://img.shields.io/badge/tests-19%20passing-brightgreen.svg)](./test)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

**tgx is the fast way to build Telegram bots — less code, and you control every
screen.** An open-source TypeScript framework on [grammY](https://grammy.dev):
state, buttons, menus, Telegram Stars payments and file handling just work, so you
write your bot, not the boilerplate. Perfect for shipping a bot with an AI agent
(Claude Code, Cursor) or by hand. _(Under the hood: every screen is a pure function
of state — which is why buttons never go stale and state survives restarts.)_

The same AI image bot is **52 lines with tgx vs 152 lines on raw grammY**
([see the side-by-side](./comparison/ai-bot.grammy.ts)) — identical behavior,
including the persistence, stale-button cleanup and error handling that raw grammY
makes you write by hand.

> Next.js stands on React. Supabase stands on Postgres. tgx stands on
> [grammY](https://grammy.dev) — one opinion about the request lifecycle, and
> everything else follows.

## Demo

A full working AI image bot — persistent, with a control panel that follows the
latest result, and a funnel you can query with `/stats`:

```ts
import { screen, run } from "@tgxjs/core";

const ai = screen("ai")
  .state({ model: "flux", ratio: "1:1" })
  .mode("feed")                                 // panel travels down to the newest image
  .text((s) => `${s.model} · ${s.ratio}\nSend a prompt.`)
  .pick("model", ["flux", "turbo"])             // single-select toggle row
  .pick("ratio", ["1:1", "16:9", "9:16"])
  .onPrompt(async (c, prompt) => {
    await c.working("Generating…");             // card collapses, buttons hide
    await c.image(generate(prompt, c.state));   // image posts; full card returns below it
  })
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: "state.json", analytics: "stats.json" }, [ai]);
```

That is the whole bot. Persistence, stale-button cleanup, callback auto-answer,
funnel analytics and crash resilience are already on.

## Quick Start

1. Install and build:

   ```bash
   npm install
   npm run build
   ```

2. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.

3. Put the token in an env file next to any example:

   ```bash
   echo "BOT_TOKEN=123456:your-token" > examples/showcase/.env
   ```

4. Run it:

   ```bash
   node --env-file=examples/showcase/.env --experimental-strip-types examples/showcase/bot.ts
   ```

5. Open your bot in Telegram and send `/start`.

## Out of the Box

Every capability below is a default — zero lines of setup in your bot code.

| Feature | What you get |
|---|---|
| Persistence | State and navigation position survive restarts |
| Keyboard cleanup | Old buttons evaporate on transition; stale ones are inert |
| Feed mode | The control panel travels down to the latest result |
| Auto-answer | No spinner on taps; "message is not modified" is swallowed |
| Stars payments | `successful_payment` is matched back to the right user's screen |
| Analytics | Every transition is counted; funnel via a `/stats` command |
| Menus | Persistent bottom menu (replaces the letter keyboard) + the side command menu |
| Files | 8 media types normalized to one `IncomingFile`; albums buffered into `onAlbum` |
| Resilience | A failure in one update never takes down the bot |
| Navigation | Persistent `go / back / replace / reset` screen stack |

## tgx vs grammY, Telegraf, aiogram

grammY, Telegraf and aiogram are Telegram bot **clients** — they give you the raw
API and low-level plugins you compose yourself. tgx is a **layer on top** of
grammY that makes the stateful-app patterns defaults. Honest comparison:

| | tgx | grammY | Telegraf | aiogram |
|---|---|---|---|---|
| Language | TypeScript | TypeScript | JavaScript / TS | Python |
| State model | Screen = f(state), persistent by default | sessions + conversations + menu plugins, composed by you | scenes / wizard, composed by you | FSM + scenes / aiogram-dialog |
| Stale-button cleanup | Automatic | Manual | Manual | Manual |
| Stars payment ↔ session | Automatic | Manual | Manual | Manual |
| Analytics funnel | Built-in (`/stats`) | — | — | — |
| Layer | Sits on grammY | is the client | is the client | is the client |
| Agent-first (AGENTS.md, one-way API) | Yes | No | No | No |
| Lines for the same AI bot | 52 | 152 | — | — |

If you already have a grammY bot, tgx is additive — `c.tg` is the raw grammY
context, so you never lose access to anything underneath.

## Cookbook — buttons, toggles, menus

Every UI element is one line. Full reference in [AGENTS.md](./AGENTS.md).

```ts
// Inline buttons
.button("Click", "act").action("act", (c) => c.say("hi"))  // action button
.toggle("notify", "Notifications")                          // ✅/☐ toggle, bound to state.notify
.pick("size", ["S", "M", "L"])                              // single-select row, active gets ✅
.nav("Settings", "settings")                                // navigate (Back is automatic)
.row(() => [{ label: "Site", url: "https://x.com" },        // link + mini-app buttons
            { label: "App", webapp: "https://x.com/app" }])
```

```ts
// Menus, on run()
run({
  token,
  menu: [[{ label: "🏠 Home", go: "home" }, { label: "🛒 Shop", go: "shop" }]], // persistent bottom keyboard
  commands: [{ command: "start", description: "Home" }],                        // ≡ side command menu
}, screens);
```

```ts
// UI kit selectors (import { ui } from "@tgxjs/kit")
buttons: [
  ...ui.radio(plans, active, { do: "plan" }),        // ◉/◯ single-select
  ...ui.checklist(items, selected, { do: "tog" }),   // ✅/☐ multi-select
  ...ui.slider(pos, 5, { do: "vol" }),               // ◀ ◉◯◯ ▶
  ...ui.calendar(year, month, { do: "cal" }),        // full month grid
]
```

## Built to be built by AI

tgx is designed for the workflow where a developer pastes this repository into
a coding agent (Claude Code, Cursor) and asks it to build a bot. To make that produce
correct code first try:

- **[AGENTS.md](./AGENTS.md)** — a complete, unambiguous build reference: every
  button, menu, toggle, input, payment and component with copy-paste code, plus a
  "Do NOT" list. Agents read this automatically.
- **[CLAUDE.md](./CLAUDE.md)** — points Claude Code at the reference.
- **[llms.txt](./llms.txt)** — the AI-crawler standard, so the project is discoverable
  and correctly summarized by LLMs and generative search.
- **[FAQ.md](./FAQ.md)** — direct answers to common "how do I…" questions, so agents
  and search engines can quote them.
- **[Cursor rule](./.cursor/rules/tgx.mdc)** + **[Copilot instructions](./.github/copilot-instructions.md)** —
  drop-in rules so Cursor and GitHub Copilot build with tgx by default.
- **[tgx-mcp](./packages/mcp)** — an MCP server (`npx @tgxjs/mcp`) that serves the build
  reference to Claude Code / Cursor on demand, no repo-in-context needed.
- **One way to do each thing** — the API has no synonyms, so the agent cannot pick
  the wrong pattern.

## How It Works

The engine runs one pass per update. Every arrow is a class of boilerplate that
disappears:

```
update → resolve screen → load state → run handler → render → persist
```

- A screen is a pure function `state → { text, buttons }`.
- A button is an intent (`go` / `back` / an action / `url` / `webapp`); the engine
  resolves it to Telegram wire and one namespaced callback convention.
- The navigation stack lives in the session store, so a user deep in a flow resumes
  exactly where they were after a restart.
- Because the engine sees every update, it injects idempotency, analytics, payment
  matching and menu routing in one place instead of per screen.

## Full Customization

Clean helpers cover the common 90%, but there is an escape hatch at every level, so
you are never worse off than raw grammY:

```ts
.row((s) => [ ...anyCustomButtons ])       // emit any custom button row
.view((s) => ({ text, buttons }))          // bypass auto-render, return your own View
.on("act", (c) => c.tg.replyWithDice())    // c.tg is raw grammY — do anything
```

## UI Kit — `tgx-kit`

Components in the shadcn model: pure functions you copy into your project and own.
No CSS exists in Telegram, so "styling" is composition + unicode + emoji.

- **text** — `bar`, `stars`, `badge`, `breadcrumb`, `wizardProgress`, `kv`, `bullets`
- **keyboards** — `grid`, `radio`, `checklist`, `tabs`, `stepper`, `slider`,
  `paginate`, `carousel`, `confirm`, `langSwitcher`, `backRow`
- **calendar** — `calendar`, `calStep`, `timePicker`

```
 ◀  July 2026  ▶
 Mo  Tu  We  Th  Fr  Sa  Su
  6   7   8   9  10 [11] 12
 13  14 ·15· 16  17  18  19
```

## Examples

14 working bots in [`examples/`](./examples), all MIT-licensed. The
[showcase](./examples/showcase) bot demonstrates everything in one place.

| Bot | Demonstrates |
|---|---|
| `ai-image-bot` | Real AI generation, feed mode |
| `shop-bot` | Catalog, cart, Telegram Stars checkout |
| `booking-bot` | Calendar and time picker |
| `album-bot` | File normalization and buffered media albums |
| `subscription-bot` | Wizard flow with Stars |
| `habit-tracker` | Streaks and persistence |
| `support-flow` | A bot as a branching flowchart |
| `ui-showcase` | The full UI kit |
| `showcase` | All of the above in one bot |

Plus `movie-search`, `menu-app`, `syntx-bot`, `image-gen`, `tiktok-dl`.

## Project Structure

```
packages/core      the engine
  screen.ts        lifecycle, nav stack, render, files, menus, analytics
  builder.ts       the fluent API
  flow.ts          linear wizard sugar (ask / choose / payStars)
  storage.ts       zero-dependency file persistence
packages/kit       card with upload slots + ui/ components
examples/          14 bots
```

## Commands

```bash
npm run build       # build all packages
npm run typecheck   # type-check without emitting
npm test            # run the test suite (node:test)
```

## Prerequisites

- Node.js 20+ (uses native `--experimental-strip-types` and `--env-file`)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Philosophy

- **Exactly one way to express each thing** — so an AI agent cannot hallucinate
  architecture, and the shortest path is the correct one.
- **The opinion is the moat, the code is not.** The code is MIT and meant to be copied.
- **No lock-in.** The code lives in your project; the transport (grammY) under the
  hood is swappable.

## Status

Early alpha, honestly labeled. What is true today:

- **Tests:** 19 passing (`npm test`) — navigation, feed mode, keyboard evaporation,
  stale-button inertness, wizard flow + validation, Stars payments, album buffering,
  persistence, file normalization, calendar. Not exhaustive.
- **Not proven:** the core bet — that the one-way API + [AGENTS.md](./AGENTS.md) make
  an agent build correct bots first-try better than grammY — has **not** been
  benchmarked yet. Until it is, treat that as a hypothesis, not a result.
- **Known limits:** one active navigation stack per user (no parallel/sub-flows),
  DM-focused (no inline mode or group semantics), no mini-app `initData` bridge,
  file-based storage rewrites the whole file per write (use a real adapter at scale).
- **Prior art to know:** [aiogram-dialog](https://github.com/Tishka17/aiogram_dialog)
  (Python) and grammY's `menu` + `conversations` + `sessions` plugins implement much
  of the same "screen = f(state)" idea, with more maturity. tgx's distinct bets
  are feed mode and the agent-first, one-way design.

## Author

Built by [Yerdaulet Damir](https://yerdaulet.xyz) — AI product engineer. tgx is
extracted from real production Telegram-bot and AI-SaaS work used by thousands.
[GitHub](https://github.com/yerdaulet-damir) · [X](https://x.com/aimyerdaulet)

## License

MIT © Yerdaulet Damir
