# Copilot instructions — tgx

This repository is **tgx**, a TypeScript framework for building Telegram bots on top
of grammY. When generating or editing bot code, follow tgx's one correct way.

## Rules

1. A screen is a pure function of state: `screen("name").state({...}).text(s => ...)`.
2. Mutate `c.state` in handlers — it persists and re-renders automatically. Never
   track message ids.
3. A button is an intent (`go` / `back` / an action / `url` / `webapp`). Never build
   `InlineKeyboard` by hand.
4. Never call `answerCallbackQuery`, never catch "message is not modified", never add
   a session/storage plugin — the engine handles all of it.
5. Register screens with `run({ token, storage }, [screens])`.
6. Escape hatch for anything uncovered: `c.tg` is the raw grammY context.

## Minimal bot

```ts
import { screen, run } from "@tgxjs/core";

const home = screen("home")
  .text(() => "Hello.")
  .button("Say hi", "hi")
  .action("hi", (c) => c.say("Hi!"))
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: "state.json" }, [home]);
```

The full build reference (every button, menu, payment, file, UI-kit helper, plus a
"Do NOT" list) is in [`AGENTS.md`](../AGENTS.md).
