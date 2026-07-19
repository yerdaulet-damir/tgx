# tgx

When building or editing a Telegram bot in this repository, **read [AGENTS.md](AGENTS.md)
first** — it is the complete, unambiguous build reference with copy-paste code for
every primitive (inline buttons, toggles, pick, navigation, persistent reply menu,
command menu, feed mode, text/file/album input, Stars payments, the UI kit, and the
escape hatches).

There is exactly one correct way to build each thing; follow AGENTS.md and do not
reach around the engine (never hand-build keyboards, answer callbacks, or add a
session plugin).

Build & check: `npm run build` · `npm run typecheck`.
