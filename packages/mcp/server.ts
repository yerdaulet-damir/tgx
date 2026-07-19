#!/usr/bin/env node
// tgx-mcp — an MCP server that hands AI coding agents the tgx build reference on
// demand, so Claude Code / Cursor / any MCP client write correct tgx bots without
// the repo in context. Fetches the canonical docs from GitHub (no drift), with a
// small embedded fallback when offline.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RAW = "https://raw.githubusercontent.com/yerdaulet-damir/tgx/main";

// Known example bots (name → one-line purpose). Kept in sync with examples/.
const EXAMPLES: Record<string, string> = {
  "subscription-bot": "Wizard onboarding with Telegram Stars payment",
  "shop-bot": "Catalog, cart and Stars checkout",
  "ai-image-bot": "AI image generation with feed mode",
  "booking-bot": "Calendar and time picker",
  "album-bot": "File normalization and buffered media albums",
  "menu-app": "Navigation, menus and back stack",
  "habit-tracker": "Streaks and persistence",
  "support-flow": "A bot as a branching flowchart",
  "ui-showcase": "The full tgx-kit UI kit",
  "showcase": "Everything in one bot",
};

const FALLBACK_GUIDE = `# tgx quick reference (offline fallback)
A screen is a pure function of state. Buttons are intents. Never build InlineKeyboard
by hand, never answerCallbackQuery, never track message ids, never add a session plugin.

import { screen, run } from "@tgxjs/core";
const home = screen("home")
  .text(() => "Hello.")
  .button("Say hi", "hi")
  .action("hi", (c) => c.say("Hi!"))
  .entry("/start");
run({ token: process.env.BOT_TOKEN!, storage: "state.json" }, [home]);

Full reference: https://github.com/yerdaulet-damir/tgx/blob/main/AGENTS.md`;

async function fetchText(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${RAW}/${path}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const server = new McpServer({ name: "tgx", version: "0.1.0" });

server.tool(
  "tgx_guide",
  "The complete tgx build reference for Telegram bots: every button kind, menus, feed mode, files, Telegram Stars payments, the UI kit, and a Do-NOT list. Read this before writing a tgx bot.",
  {},
  async () => {
    const guide = (await fetchText("AGENTS.md")) ?? FALLBACK_GUIDE;
    return { content: [{ type: "text", text: guide }] };
  },
);

server.tool(
  "tgx_list_examples",
  "List the available tgx example bots (name → what it demonstrates).",
  {},
  async () => {
    const lines = Object.entries(EXAMPLES).map(([n, d]) => `- ${n}: ${d}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.tool(
  "tgx_example",
  "Get the full source of one tgx example bot by name (see tgx_list_examples).",
  { name: z.string().describe("Example name, e.g. 'subscription-bot'") },
  async ({ name }) => {
    if (!EXAMPLES[name]) {
      return {
        content: [{ type: "text", text: `Unknown example "${name}". Known: ${Object.keys(EXAMPLES).join(", ")}` }],
        isError: true,
      };
    }
    const src = await fetchText(`examples/${name}/bot.ts`);
    return {
      content: [{ type: "text", text: src ?? `Could not fetch examples/${name}/bot.ts (offline?).` }],
      isError: src === null,
    };
  },
);

await server.connect(new StdioServerTransport());
