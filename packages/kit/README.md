# @tgxjs/kit

UI kit for [tgx](https://github.com/yerdaulet-damir/tgx) — copy-in components for
Telegram bots built with [`@tgxjs/core`](https://www.npmjs.com/package/@tgxjs/core).

```bash
npm i @tgxjs/kit
```

Pure helpers with no hidden state. There is no CSS in Telegram, so "styling" is
composition plus unicode and emoji.

- **text** — `bar`, `stars`, `badge`, `breadcrumb`, `kv`, `bullets`, `wizardProgress`
- **keyboards** — `grid`, `radio`, `checklist`, `tabs`, `stepper`, `slider`, `paginate`,
  `carousel`, `confirm`, `langSwitcher`
- **calendar** — `calendar`, `calStep`, `timePicker`
- **card** — a self-rendering panel with file-upload slots

```ts
import { ui } from "@tgxjs/kit";

buttons: [
  ...ui.radio(plans, active, { do: "plan" }),        // ◉ / ◯ single-select
  ...ui.checklist(items, selected, { do: "tog" }),   // ✅ / ☐ multi-select
  ...ui.calendar(year, month, { do: "cal" }),        // full month grid
];
```

Full reference: [AGENTS.md](https://github.com/yerdaulet-damir/tgx/blob/main/AGENTS.md).
MIT licensed.
