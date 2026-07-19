# Building Telegram bots with tgx — agent guide

This file tells a coding agent (Claude Code, Cursor, etc.) how to build a Telegram
bot with tgx. **There is exactly one correct way; follow it.** Every UI element
below is shown with copy-paste code. If a request needs something not covered by a
helper, use the escape hatches at the end — never reach around the engine.

## Golden rules

1. A screen is a pure function of state: `screen("name").state({...}).text(s => ...)`.
2. Mutate `c.state` inside handlers; it is persisted automatically. Never track
   message ids, never call `answerCallbackQuery`, never handle "message is not
   modified" — the engine does all of that.
3. A button is an **intent**: navigate, run an action, open a url/webapp. You never
   build `InlineKeyboard` by hand.
4. Register screens with `run({ token }, [screenA, screenB])` at the end of the file.

## Minimal bot

```ts
import { screen, run } from "@tgxjs/core";

const home = screen("home")
  .text(() => "Hello. Tap a button.")
  .button("Say hi", "hi")                 // inline button → action "hi"
  .action("hi", (c) => c.say("Hi!"))      // the handler
  .entry("/start");                        // /start opens this screen

run({ token: process.env.BOT_TOKEN!, storage: "state.json" }, [home]);
```

## Inline buttons — every kind

Declare them on the builder; each is one line.

```ts
screen("demo")
  .state({ on: false, size: "M" })
  .text((s) => `size=${s.size} on=${s.on}`)

  // 1. Action button — runs .action(key)
  .button("Click me", "clicked")
  .action("clicked", (c) => c.say("clicked"))

  // 2. Conditional action button (only shown when predicate is true)
  .button("Checkout", "pay", (s) => s.size !== "")

  // 3. Toggle — boolean bound to state[key], label shows ✅/☐ automatically
  .toggle("on", "Notifications")

  // 4. Single-select row — bound to state[key], active gets ✅
  .pick("size", ["S", "M", "L"])

  // 5. Navigation — push another screen (Back is automatic)
  .nav("Open settings", "settings")

  // 6. Link and mini-app buttons (via a custom row)
  .row(() => [
    { label: "Website", url: "https://example.com" },
    { label: "Mini app", webapp: "https://example.com/app" },
  ])
```

Inside `.row()` / `.view()` a button object is one of:

```ts
{ label, do: "action", value?: "x" }   // run .action("action")(c, "x")
{ label, go: "screenName" }            // push a screen
{ label, back: true }                   // pop the stack
{ label, url: "https://…" }            // open a link
{ label, webapp: "https://…" }         // open a Telegram mini app
```

## Menus

Two different menus, both configured on `run()`:

```ts
run(
  {
    token: process.env.BOT_TOKEN!,
    storage: "state.json",

    // Persistent bottom menu — REPLACES the letter keyboard. Tapping a label jumps
    // to that screen. Rows of { label, go }.
    menu: [
      [{ label: "🏠 Home", go: "home" }, { label: "🛒 Shop", go: "shop" }],
      [{ label: "⚙️ Settings", go: "settings" }],
    ],

    // The ≡ side menu next to the input — the command list.
    commands: [
      { command: "start", description: "Home" },
      { command: "shop", description: "Shop" },
    ],
  },
  [home, shop, settings],
);
```

## Handler context `c`

Every `.action` / `.onPrompt` / `.onInput` / `.onPayment` handler receives `c`:

```ts
c.state              // the screen's state object; mutate it, it persists + re-renders
c.say(text)          // send a message
c.image(url, caption?) // send a photo (feed-aware)
c.working(text?)     // show a transient "…" state (hides buttons) mid-handler
c.call(fn)           // error boundary: fn throws → user gets a clean message
c.go(name) / c.back() / c.replace(name) / c.reset(name)  // navigation
c.action("typing")   // chat action indicator ("typing…", "upload_photo", …)
c.download(fileId)   // getFile → downloadable URL
c.track("event")     // custom analytics event
c.tg                 // raw grammY Context — escape hatch to anything
```

## Feed mode (chat/generator UIs)

`.mode("feed")` makes content post below and the control card re-appear at the
bottom, so controls follow the latest result:

```ts
screen("gen").mode("feed")
  .onPrompt(async (c, prompt) => {
    await c.working("Generating…");     // card collapses
    await c.image(await make(prompt));  // image posts; full card returns below it
  })
```

## Text input & files

```ts
screen("io")
  .onPrompt((c, text) => c.say(`You said: ${text}`))   // plain text

  // Any media type, already normalized to one shape:
  .onInput(async (c, msg) => {
    const f = msg.file;                 // { kind, fileId, fileUniqueId, mime, size, fileName, ... }
    if (!f) return;
    if (f.size && f.size > 20 * 1024 * 1024) return c.say("Too big (max 20 MB).");
    await c.say(`Got a ${f.kind}, ${f.mime}`);
  })

  // Media groups (albums) arrive as N updates — the engine buffers them for you:
  .onAlbum((c, files) => c.say(`Album of ${files.length}`))
```

## Payments (Telegram Stars)

```ts
screen("shop")
  .action("buy", (c) =>
    c.tg.replyWithInvoice("Order", "Description", "payload", "XTR", [{ label: "Total", amount: 500 }]),
  )
  .onPayment((c) => c.say("Paid! Thank you."))   // pre_checkout is auto-answered; matched to this user
```

## UI kit — `tgx-kit`

Pure helpers. `text.*` return strings for `.text()`; `keyboards.*`/`calendar.*`
return `Btn[][]` for `.view()`/`.row()`. Wire each to an action with `{ do }`.

```ts
import { ui } from "@tgxjs/kit";

// text blocks
ui.bar(60)                     // "▓▓▓▓▓▓░░░░ 60%"
ui.stars(3)                    // "★★★☆☆"
ui.badge("New", "new")         // "🆕 New"
ui.breadcrumb(["Home", "X"])   // "Home › X"
ui.kv([["Price", "50⭐"]])

// keyboards (spread into buttons; wire the `do` action)
...ui.grid(items, { cols: 2, do: "open" })
...ui.radio(items, active, { do: "pick" })          // single-select ◉/◯
...ui.checklist(items, selectedArray, { do: "tog" }) // multi-select ✅/☐
...ui.tabs(items, active, { do: "tab" })
...ui.stepper(qty, { do: "qty" })                   // ➖ N ➕ → "inc"/"dec"
...ui.slider(pos, max, { do: "vol" })               // ◀ ◉◯◯ ▶ → "left"/"right"
...ui.paginate(page, pages, { do: "page" })         // ◀ 3/10 ▶ → "prev"/"next"
...ui.carousel(i, count, { do: "swipe" })
...ui.confirm({ do: "act" })                        // ✅/❌ → "yes"/"no"
...ui.langSwitcher(langs, active, { do: "lang" })
...ui.calendar(year, month, { do: "cal" })          // → calStep(year, month, value)
...ui.timePicker(h, m, { hDo: "hour", mDo: "min", okDo: "ok" })
```

Calendar handler pattern:

```ts
.action("cal", (c, v) => {
  const r = ui.calStep(c.state.year, c.state.month, v!); // handles prev/next/pick
  c.state.year = r.year; c.state.month = r.month;
  if (r.picked) c.state.date = r.picked; // "YYYY-MM-DD"
})
```

## Analytics (on by default)

```ts
run({ token, analytics: "stats.json" }, screens);
// Every screen open / step / payment is counted. Users send /stats to see the funnel.
```

## Escape hatches (when a helper doesn't fit)

Never reach around the engine — use these, in order:

```ts
.row((s) => [ ...anyButtons ])       // any custom button row, computed from state
.view((s) => ({ text, buttons }))    // full custom render, bypassing auto-build
.on("key", (c, v) => { c.tg.<any grammY method>() })  // raw grammY inside a handler
```

## Complete example

```ts
import { screen, run } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

const shop = screen<{ cart: Record<string, number> }>("shop")
  .state({ cart: {} })
  .view((s) => ({
    text: ui.badge("Shop", "info"),
    buttons: [
      ...ui.grid([{ label: "☕ 50⭐", value: "coffee" }], { cols: 2, do: "add" }),
      [{ label: "Pay", do: "pay" }],
      [{ label: "⬅️ Back", back: true }],
    ],
  }))
  .action("add", (c, id) => { c.state.cart[id!] = (c.state.cart[id!] ?? 0) + 1; })
  .action("pay", (c) => c.tg.replyWithInvoice("Order", "x", "p", "XTR", [{ label: "T", amount: 50 }]))
  .onPayment((c) => { c.state.cart = {}; return c.say("Paid!"); })
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: "state.json", analytics: "stats.json" }, [shop]);
```

## Do NOT

- Do not build `InlineKeyboard`/`Keyboard` by hand — use buttons/helpers.
- Do not call `answerCallbackQuery`, store message ids, or catch "not modified".
- Do not add a session/storage plugin — `storage` in `run()` handles persistence.
- Do not create two ways to do the same thing in one bot.
