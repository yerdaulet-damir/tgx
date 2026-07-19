# tgx — architecture

> One paragraph: tgx is a thin layer over grammY. grammY stays the transport
> (polling/webhooks, Bot API methods, files, retries). tgx adds what it lacks:
> **screens-as-a-function-of-state with persistent state**, from which button
> evaporation, payment matching and analytics fall out on their own.

We **do not replace** grammY. As Next.js stands on React and Supabase on Postgres,
tgx stands on grammY. The transport can be swapped underneath; the API stays.

## Mental model — two roots

1. **A flow is a state machine whose position and data are persistent per user.**
   You describe ordered steps. The position (`step`) and the collected `data` live in
   the grammY session with a storage adapter, so they survive restarts. On the next
   update the dispatcher reloads the state and continues from the same step.

2. **A screen re-renders itself.** Each step can `enter` (show) and `onUpdate` (accept
   input → advance). Between steps the framework wipes the previous message's keyboard
   itself. "prompt saved" does not exist — the current screen is always rendered.

## How it compiles to grammY

| tgx primitive | What it becomes in grammY |
|---|---|
| `flow(...)` | a registry entry + the entry trigger registered as a `bot.command` |
| persistence | `bot.use(session({ storage }))` — state in Redis/file |
| dispatcher | one middleware: if a flow is active, hand the update to the current step |
| `ask` | `ctx.reply(prompt)` + a check on `ctx.message.text` in `onUpdate` |
| `choose` | `InlineKeyboard` + `answerCallbackQuery` (auto) in `onUpdate` |
| evaporation | `ctx.api.editMessageReplyMarkup(...)` on the tracked `ui` message |
| `payStars` | `replyWithInvoice(..., "XTR", ...)` + **one global** `pre_checkout_query` auto-answer |
| payment matching | `successful_payment` is a normal update → the dispatcher hands it to THIS user's active flow. **The session is the match key.** |
| zero-code analytics | `track()` on every transition; the developer writes nothing |

## The key trick — payment matching without a global mess

In raw grammY `pre_checkout_query` and `successful_payment` arrive outside the flow,
and correlating them with the user's session is painful. Here: `pre_checkout` is
auto-answered by one global handler, and `successful_payment` is just an update that
the dispatcher routes into the same user's `ctx.session.flow`. Because state is
persistent and user-scoped, **matching is free** — the payment lands in exactly the
`payStars` step that is waiting for it.

## One engine underneath (v0.2)

`screen` and `flow` are not two engines but one. There is a **single** render-owning
loop (`packages/core/screen.ts`): a screen renders from state, a button is an intent
(`go`/`back`/`do`/`url`), and navigation lives in a persistent stack.

- `screen()` — a self-rendering screen with navigation: menus, nesting, "back",
  reply keyboards. The stack (`go`/`back`/`replace`/`exit`) is persistent, so the
  navigation position survives restarts.
- `flow()` — a linear wizard — is **one** screen whose state is `{ step, data }`. No
  separate infrastructure: render, evaporation, callback routing, persistence and
  analytics are shared with `screen`.
- `card()` (in `tgx-kit`) — a thin layer over `screen`: file-upload slots via
  `onInput`, actions via `on`.

One callback convention: `t:<screen>:<action>:<value>`, namespaced per screen — a
stale button from another screen is inert rather than misrouting (64-byte limit
respected).

## Files

- `packages/core/screen.ts` — the engine: stack, dispatcher, render, `run()`.
- `packages/core/flow.ts` — `flow`/`ask`/`choose`/`payStars` over the engine.
- `packages/core/storage.ts` — zero-dep file StorageAdapter (survives restarts).
- `packages/kit/card.ts` — `card` as a screen with slots.
- `examples/subscription-bot` — subscription onboarding (flow). `examples/menu-app` —
  navigation/menus (screen). `examples/image-gen` — generation with slots (card).

Status: **built, typecheck green, engine covered by smoke tests** (push/back
navigation, evaporation, stale-button inertness, wizard with validation and step
skipping, zero-code funnel, full-stack persistence). A live run in Telegram
(`bot.start()` with a token) — done and working.
