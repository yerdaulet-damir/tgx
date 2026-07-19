// Real tests for the engine — run with: npm test
// Uses node:test (built-in). A tiny fake bot/context drives the engine in-process,
// no Telegram token needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { Engine, screen, flow, ask, choose, payStars, fileStorage, normalizeFile, requireChannel, broadcast, validate, runStream, graph } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

// ── shared in-process harness ────────────────────────────────────────────────
function harness(regs: { name: string; entry?: string; def: any }[]) {
  const session: any = { stack: [] };
  const log: string[] = [];
  let mid = 0;
  const bot: any = { _cmd: {}, on() {}, catch() {}, command(n: string, f: any) { this._cmd[n] = f; }, use(f: any) { this._use = f; } };
  const ctx = (u: any = {}) => ({
    session, from: { id: 1 }, callbackQuery: u.cb ? { data: u.cb } : undefined, message: u.msg,
    async reply(t: string) { const id = ++mid; log.push("reply#" + id + ":" + t.slice(0, 24)); return { chat: { id: 9 }, message_id: id }; },
    async replyWithPhoto(url: string) { log.push("PHOTO:" + url); return { chat: { id: 9 }, message_id: ++mid }; },
    async replyWithInvoice() { log.push("INVOICE"); return {}; },
    async replyWithChatAction() {}, async answerCallbackQuery() {},
    api: {
      async editMessageText(_c: any, m: number, t: string) { log.push("edit#" + m + ":" + t.slice(0, 16)); },
      async editMessageReplyMarkup() { log.push("evaporate"); },
      async deleteMessage(_c: any, m: number) { log.push("DELETE#" + m); },
      async getFile() { return { file_path: "x" }; },
    },
  });
  const engine = new Engine(regs as any, () => {});
  engine.install(bot, regs as any);
  return {
    session, log,
    start: (name = "start") => bot._cmd[name](ctx()),
    feed: (u: any) => bot._use(ctx(u), async () => {}),
    path: () => session.stack.map((f: any) => f.name).join(">"),
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

test("navigation: push/back, evaporation, stale buttons inert", async () => {
  const home = screen("home").text(() => "home").nav("P", "profile").entry("/start").build();
  const profile = screen("profile").text(() => "profile").button("Back", "b").action("b", (c) => c.back()).build();
  const other = screen("other").text(() => "o").build();
  const h = harness([home, profile, other]);

  await h.start();
  const card1 = h.session.stack[0].msg.messageId;
  await h.feed({ cb: "t:home:_go:profile" });
  assert.equal(h.path(), "home>profile", "push deepens the stack");
  assert.ok(h.log.includes("evaporate"), "old keyboard evaporates on navigate");

  const before = h.log.length;
  await h.feed({ cb: "t:other:noop" }); // stale button from a screen not on top
  assert.equal(h.log.length, before, "stale button is inert");

  await h.feed({ cb: "t:profile:b" });
  assert.equal(h.path(), "home", "back pops to parent");
  assert.ok(card1);
});

test("feed mode: content posts, card deletes and re-posts below", async () => {
  const gen = screen("gen").mode("feed").text(() => "card")
    .onPrompt(async (c: any, t: string) => { await c.working("gen"); await c.image("http://img/" + t); })
    .entry("/start").build();
  const h = harness([gen]);
  await h.start();
  const card1 = h.session.stack[0].msg.messageId;
  await h.feed({ msg: { text: "cat" } });
  const card2 = h.session.stack[0].msg.messageId;
  assert.ok(h.log.includes("DELETE#" + card1), "old card is deleted");
  assert.ok(h.log.some((l) => l.startsWith("PHOTO:")), "image is posted");
  assert.ok(card2 > card1, "a fresh card is re-posted below the content");
  assert.ok(!h.session.stack[0].state.__working, "working state is cleared afterwards");
});

test("flow wizard: validation re-prompts, valid advances, data collected, exits", async () => {
  let done: any = null;
  const wiz = flow("onboarding", {
    entry: "/start",
    steps: [
      ask("email", "email?", { validate: "email" }),
      choose("plan", "plan?", { trial: "Trial", pro: "Pro" }),
      payStars("Pro", 500, { when: (d) => d.plan === "pro" }),
    ],
    async done(_ctx, d) { done = d; },
  });
  const h = harness([wiz as any]);
  await h.start();
  await h.feed({ msg: { text: "nope" } });
  assert.equal(h.session.stack[0].state.i, 0, "invalid input keeps the wizard on step 0");
  await h.feed({ msg: { text: "a@b.co" } });
  await h.feed({ cb: "t:onboarding:pick:trial" });
  assert.deepEqual(done, { email: "a@b.co", plan: "trial" }, "only business data is collected");
  assert.equal(h.session.stack.length, 0, "wizard exits when done");
});

test("payments: invoice sent, onPayment matched, cart cleared", async () => {
  let paid = false;
  const shop = screen("shop").state({ cart: { p1: 2 } })
    .action("pay", (c: any) => c.tg.replyWithInvoice("o", "o", "o", "XTR", [{ label: "t", amount: 80 }]))
    .onPayment((c: any) => { c.state.cart = {}; paid = true; return c.say("ok"); })
    .entry("/start").build();
  const h = harness([shop]);
  await h.start();
  await h.feed({ cb: "t:shop:pay" });
  assert.ok(h.log.includes("INVOICE"), "invoice is sent");
  await h.feed({ msg: { successful_payment: {} } });
  assert.ok(paid, "onPayment runs on successful_payment");
  assert.equal(Object.keys(h.session.stack[0].state.cart).length, 0, "cart cleared after payment");
});

test("album buffering: N updates with one media_group_id → one onAlbum call", async () => {
  let files: any[] = [];
  const al = screen("al").onAlbum((_c: any, f: any[]) => { files = f; }).entry("/start").build();
  const h = harness([al]);
  await h.start();
  h.feed({ msg: { media_group_id: "g1", photo: [{ file_id: "a", file_unique_id: "ua" }] } });
  h.feed({ msg: { media_group_id: "g1", photo: [{ file_id: "b", file_unique_id: "ub" }] } });
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(files.length, 2, "both album items buffered into one call");
});

test("persistence: nav stack survives a restart (fresh adapter, same file)", () => {
  const path = "/tmp/tgx-test-persist.json";
  rmSync(path, { force: true });
  const s1 = fileStorage(path);
  s1.write("7", { stack: [{ name: "home", state: {} }, { name: "profile", state: { name: "Bob" } }] } as any);
  const s2 = fileStorage(path); // simulate a new process
  const r: any = s2.read("7");
  assert.equal(r.stack.length, 2, "stack restored");
  assert.equal(r.stack[1].state.name, "Bob", "nested state restored");
  rmSync(path, { force: true });
});

test("file normalization: any media type → one IncomingFile shape", () => {
  const photo = normalizeFile({ photo: [{ file_id: "s", file_unique_id: "u1" }, { file_id: "L", file_unique_id: "u1", file_size: 500 }] })!;
  assert.equal(photo.kind, "photo");
  assert.equal(photo.fileId, "L", "picks the largest photo size");
  assert.equal(photo.mime, "image/jpeg", "synthesizes photo mime");
  const voice = normalizeFile({ voice: { file_id: "v", file_unique_id: "u2" } })!;
  assert.equal(voice.mime, "audio/ogg", "synthesizes voice mime");
});

test("gate: blocks a screen until the guard passes, then reveals it", async () => {
  let subscribed = false;
  const guard = { async check() { return subscribed; }, view: () => ({ text: "join first", buttons: [[{ label: "I joined", do: "_recheck" }]] }) };
  const secret = screen("secret").gate(guard).text(() => "SECRET CONTENT").entry("/start").build();
  const h = harness([secret]);

  await h.start();
  assert.ok(h.log.some((l) => l.includes("join first")), "gate view shown when not subscribed");
  assert.ok(!h.log.some((l) => l.includes("SECRET")), "real content is hidden");

  await h.feed({ cb: "t:secret:_recheck" }); // still not subscribed
  assert.ok(!h.log.some((l) => l.includes("SECRET")), "recheck while blocked keeps the gate");

  subscribed = true;
  await h.feed({ cb: "t:secret:_recheck" });
  assert.ok(h.log.some((l) => l.includes("SECRET")), "passing the gate reveals the real screen");
});

test("broadcast: throttles, marks blocked on 403, tallies results", async () => {
  const blockedIds: number[] = [];
  const api = {
    async sendMessage(id: number) {
      if (id === 2) throw { error_code: 403 }; // user blocked the bot
      if (id === 3) throw { error_code: 500 }; // transient failure
      return {};
    },
  };
  const res = await broadcast(api, [1, 2, 3, 4], "hi", { rate: 1000, onBlocked: (id) => blockedIds.push(id) });
  assert.deepEqual(res, { sent: 2, blocked: 1, failed: 1 }, "tally is correct");
  assert.deepEqual(blockedIds, [2], "onBlocked fired for the 403 user, broadcast did not stop");
});

test("requireChannel: member passes, non-member is gated", async () => {
  const gate = requireChannel("@chan");
  const member: any = { api: { async getChatMember() { return { status: "member" }; } }, from: { id: 1 } };
  const stranger: any = { api: { async getChatMember() { return { status: "left" }; } }, from: { id: 2 } };
  assert.equal(await gate.check(member), true, "member passes");
  assert.equal(await gate.check(stranger), false, "non-member is blocked");
  assert.ok(gate.view().text.includes("@chan"), "gate view names the channel");
});

test("validate: catches a dangling nav target and suggests the fix", () => {
  const home = screen("home").text(() => "home").nav("Profile", "profil").entry("/start").build();
  const profile = screen("profile").text(() => "p").build();
  const issues = validate([home, profile]);
  assert.equal(issues.length, 1, "one problem found");
  assert.equal(issues[0].kind, "unknown-nav");
  assert.match(issues[0].message, /did you mean "profile"/, "suggests the near-miss name");
});

test("validate: catches a button wired to a missing action handler", () => {
  const s = screen("s").text(() => "s").button("Go", "submit").entry("/start").build();
  const issues = validate([s]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, "unknown-action");
  assert.match(issues[0].message, /add \.action\("submit"/);
});

test("validate: a correct bot produces no issues; escape-hatch buttons are not false-flagged", () => {
  const home = screen("home").text(() => "h").nav("P", "profile").entry("/start").build();
  const profile = screen("profile").text(() => "p")
    .button("Save", "save").action("save", () => {})
    .row(() => [{ label: "custom", do: "whatever_dynamic", value: "x" }]) // escape hatch → skipped
    .build();
  assert.deepEqual(validate([home, profile]), [], "clean spec, dynamic row not flagged");
});

test("validate: flags duplicate names, duplicate entries and an unreachable bot", () => {
  const a = screen("dup").text(() => "a").entry("/start").build();
  const b = screen("dup").text(() => "b").entry("/start").build();
  const kinds = validate([a, b]).map((i) => i.kind).sort();
  assert.ok(kinds.includes("duplicate-name"));
  assert.ok(kinds.includes("duplicate-entry"));
  const orphan = screen("x").text(() => "x").build(); // no entry, no menu
  assert.ok(validate([orphan]).some((i) => i.kind === "no-entry"), "unreachable bot flagged");
});

test("ai stream: throttles edits, renders reasoning then answer, final drops the cursor", async () => {
  const ops: string[] = [];
  const io = {
    detach: async () => { ops.push("detach"); },
    send: async (t: string) => { ops.push("send:" + t); return { chatId: 1, messageId: 1 }; },
    edit: async (_r: any, t: string) => { ops.push("edit:" + t); },
  };
  async function* src() {
    yield { type: "reasoning" as const, delta: "let me think" };
    yield "Hello";
    yield " world";
  }
  const res = await runStream(src(), io, { throttle: 1000, cursor: "▌", now: () => 0 });
  assert.equal(res.text, "Hello world", "full answer returned");
  assert.equal(res.reasoning, "let me think", "reasoning captured separately");
  assert.equal(ops[0], "detach", "detaches (feed-mode hook) before the first message");
  assert.ok(ops.some((o) => o.startsWith("send:")), "sends an initial message immediately");
  assert.ok(!ops[ops.length - 1].includes("▌"), "final flush removes the cursor");
  assert.ok(ops[ops.length - 1].includes("💭 let me think") && ops[ops.length - 1].includes("Hello world"), "reasoning header + answer composed");
});

test("ai stream: rolls into a second message past the 4096 limit", async () => {
  const sends: string[] = [];
  const io = {
    detach: async () => {},
    send: async (t: string) => { sends.push(t); return { chatId: 1, messageId: sends.length }; },
    edit: async () => {},
  };
  async function* src() { yield "x".repeat(5000); }
  const res = await runStream(src(), io, { now: () => 0 });
  assert.equal(res.text.length, 5000, "full text preserved");
  assert.ok(sends.length >= 2, "content past 4096 rolled into a new message");
  assert.ok(sends[0].length <= 4096, "each message stays under the ceiling");
});

test("graph: draws screens, entry, nav edges, controls and flow steps", () => {
  const home = screen("home").text(() => "Home")
    .nav("⚙️ Settings", "settings")
    .toggle("dark", "Dark mode")
    .button("✨ Generate", "gen")
    .entry("/start").build();
  const settings = screen("settings").text(() => "Settings").pick("lang", ["en", "ru"]).build();
  const wiz = flow("signup", { entry: "/signup", steps: [ask("email", "email?"), choose("plan", "plan?", { a: "A" })], async done() {} });
  const m = graph([home, settings, wiz as any], { menu: [[{ label: "🏠 Home", go: "home" }]] });

  assert.match(m, /^flowchart TD/, "is a mermaid flowchart");
  assert.match(m, /start\s*-->\|"\/start"\|\s*s_home/, "entry command edges from start to home");
  assert.match(m, /s_home\s*-->\|"⚙️ Settings"\|\s*s_settings/, "nav button becomes a labeled edge");
  assert.ok(m.includes("☑ Dark mode"), "toggle shown inside the node");
  assert.ok(m.includes("⚡gen"), "action button shows its action");
  assert.ok(m.includes("1. ask email") && m.includes("2. choose plan"), "flow steps drawn in order");
  assert.match(m, /menu\s*-->\|"🏠 Home"\|\s*s_home/, "menu button edge drawn");
});

test("graph: unknown nav target is drawn as a visible (missing) node", () => {
  const s = screen("home").text(() => "h").nav("Go", "ghost").entry("/start").build();
  const m = graph([s]);
  assert.ok(m.includes("(missing)"), "dangling target rendered as a missing node, not silently dropped");
});

test("ui kit: calendar renders a month and calStep navigates", () => {
  const cal = ui.calendar(2026, 6, { selected: "2026-07-15" });
  assert.ok(cal.length >= 5, "calendar has header, weekdays and day rows");
  const day = cal.flat().find((b: any) => b.value === "2026-07-15");
  assert.ok(day && day.label.includes("15"), "selected day is marked");
  const next = ui.calStep(2026, 11, "next");
  assert.deepEqual({ y: next.year, m: next.month }, { y: 2027, m: 0 }, "December → next rolls the year");
});
