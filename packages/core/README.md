# tgx

**Build Telegram bots fast, with less code.** `@tgxjs/core` is an open-source
TypeScript framework on top of [grammY](https://grammy.dev). You describe a screen as
a pure function of state; the engine owns the request lifecycle, so persistence,
keyboard cleanup, menus, payments, files and analytics come as defaults instead of
boilerplate you rewrite in every bot.

```bash
npm i @tgxjs/core
```

## A whole bot

```ts
import { screen, run } from "@tgxjs/core";

const home = screen("home")
  .text(() => "Welcome. What do you need?")
  .nav("🛒 Shop", "shop")          // push another screen (Back is automatic)
  .nav("⚙️ Settings", "settings")
  .button("Say hi", "hi")
  .action("hi", (c) => c.say("Hi!"))
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: "state.json" }, [home, shop, settings]);
```

That is the whole thing. State survives restarts, old buttons never misfire, and every
callback is answered for you.

## What's built in

Not just payments. tgx covers the whole surface of a real Telegram app:

- **Screens & navigation** — a persistent `go / back / replace / reset` stack. Deep in a
  flow, the user resumes exactly where they were after a restart.
- **Buttons as intents** — `button`, `toggle`, `pick`, `nav`, links and mini-app buttons.
  You never build an `InlineKeyboard` by hand.
- **Menus** — a persistent bottom menu and the command menu, from one config.
- **Feed mode** — for chat and generator UIs: the control panel follows the newest result.
  Great for AI assistants and image/video bots.
- **Text, files & albums** — eight media types normalized to one shape; media groups buffered.
- **Telegram Stars payments** — `successful_payment` matched back to the right user's screen.
- **Wizards** — `flow` / `ask` / `choose` for multi-step forms with validation.
- **Analytics** — every step counted; query the funnel with `/stats`. Zero tracking code.
- **AI streaming** — stream a model's tokens into a live-editing message.
- **Escape hatch** — `c.tg` is the raw grammY context, so you never lose access to anything.

UI components (calendars, keyboards, text builders) live in
[`@tgxjs/kit`](https://www.npmjs.com/package/@tgxjs/kit).

## Built to be built by AI

The API has exactly one correct way to do each thing, so a coding agent cannot pick a
wrong pattern. The repo ships an `AGENTS.md` build reference, a Cursor rule, Copilot
instructions, and an MCP server ([`@tgxjs/mcp`](https://www.npmjs.com/package/@tgxjs/mcp),
`npx @tgxjs/mcp`) that feeds the reference to Claude Code and Cursor on demand.

## Links

- **Repo & docs:** [github.com/yerdaulet-damir/tgx](https://github.com/yerdaulet-damir/tgx)
- **Full build reference:** [AGENTS.md](https://github.com/yerdaulet-damir/tgx/blob/main/AGENTS.md)
- **14 example bots:** shop, AI image, booking, album, subscription, support flow, and more.

Built by [Yerdaulet Damir](https://yerdaulet.xyz). MIT licensed. Early alpha, labeled honestly.
