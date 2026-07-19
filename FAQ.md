# tgx FAQ

Common questions about building Telegram bots with tgx. Each answer is
self-contained so it reads well on its own.

## What is tgx?

tgx is an open-source TypeScript framework for building stateful Telegram
bots and mini apps. It sits on top of [grammY](https://grammy.dev) and turns the
patterns you normally hand-write — persistent state, keyboard cleanup, Telegram
Stars payment matching, menus, file handling and analytics — into defaults. You
describe a screen as a pure function of state; the engine owns the request
lifecycle. It is MIT-licensed.

## How do I keep a Telegram bot's state after a restart?

In tgx, state and navigation position are persistent by default — you pass a
storage path (or adapter) to `run()` and the engine reloads the user's exact screen
and data on the next update. There is no separate session wiring.

```ts
run({ token, storage: "state.json" }, [home]);
// kill the process mid-flow, restart — the user resumes on the same screen
```

On raw grammY or Telegraf you write this yourself with the sessions plugin plus a
storage adapter and a hand-rolled state machine.

## How do I handle Telegram Stars payments?

tgx answers the `pre_checkout_query` automatically and matches the incoming
`successful_payment` update back to the right user's screen — so payment logic lives
inside the flow instead of in a global handler you have to correlate by hand.

```ts
.pay(500, "Pro plan").onPaid((c) => c.say("You're Pro now 🎉"));
```

## grammY vs tgx — what is the difference?

grammY is a Telegram bot **client**: the raw Bot API plus low-level plugins
(`sessions`, `conversations`, `menu`) that you compose yourself. tgx is a
**layer on top of grammY** that makes the stateful-app patterns defaults. tgx
does not replace grammY — `c.tg` is the raw grammY context, so anything grammY can
do is still available. The same AI image bot is 52 lines on tgx versus 152 on
raw grammY.

## Can I use tgx with an AI coding agent like Claude Code or Cursor?

Yes — that is a primary design goal. The repo ships an `AGENTS.md` build reference
and a `CLAUDE.md` pointer, and the API has exactly one way to express each thing, so
an agent cannot pick a wrong or synonymous pattern. Paste the repo into the agent and
ask it to build a bot.

## How do I build a multi-step form or wizard in a Telegram bot?

Use the `flow` helper, which is linear-wizard sugar over the same engine — each step
collects and validates input, and the collected data is persisted between steps and
across restarts.

```ts
flow("signup", {
  steps: [ask("email", "Your email?", { validate: "email" }), choose("plan", "Plan?", { free: "Free", pro: "Pro" })],
  async done(ctx, d) { await ctx.reply(`Got ${d.email} on ${d.plan}`); },
});
```

## How do I make old inline buttons stop working?

tgx cleans up automatically: when a screen transitions, the previous message's
buttons evaporate, and taps on any stale button are inert rather than misrouting the
flow. You write no cleanup code — it is a property of the engine seeing every update.

## Does tgx support Telegram Mini Apps?

tgx builds the bot side of a mini app (menus, `webapp` buttons, the backend
flow). A built-in `initData` validation bridge for authenticating mini-app requests
is not shipped yet as of the current alpha; you validate `initData` yourself for now.

## What languages and runtimes does tgx support?

tgx is TypeScript and runs on Node.js 20+ (it uses native
`--experimental-strip-types` and `--env-file` in examples). Because it is built on
grammY, it also runs anywhere grammY runs, including Deno. A Python/aiogram port is
not available — for Python, see [aiogram-dialog](https://github.com/Tishka17/aiogram_dialog).

## Is tgx production-ready?

tgx is early alpha, labeled honestly. The engine has a passing test suite
(navigation, keyboard evaporation, wizard flows, Stars payments, album buffering,
persistence, file normalization). Known limits: one active navigation stack per user,
DM-focused (no inline mode or group semantics yet), and file-based storage rewrites
the whole file per write — use a real storage adapter at scale.
