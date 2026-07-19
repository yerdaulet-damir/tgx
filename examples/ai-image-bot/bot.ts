import { screen, run } from "@tgxjs/core";

// Полноценный AI-бот генерации на tgx — fluent-форма. Читается сверху вниз
// как сценарий. Бэкенд — бесплатный Pollinations (без ключа). mode("feed") →
// панель управления едет ВНИЗ к последней картинке, а не остаётся сверху.

const MODELS = ["flux", "turbo"];
const RATIOS: Record<string, [number, number]> = {
  "1:1": [1024, 1024], "16:9": [1280, 720], "9:16": [720, 1280],
};

interface S {
  model: string;
  ratio: string;
  enhance: boolean;
  lastPrompt?: string;
}

function pollinations(prompt: string, s: S): string {
  const [w, h] = RATIOS[s.ratio];
  const q = new URLSearchParams({
    width: String(w), height: String(h), model: s.model, nologo: "true",
    ...(s.enhance ? { enhance: "true" } : {}),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${q}`;
}

async function draw(c: import("tgx").ScreenHandlerCtx<S>, prompt: string) {
  c.state.lastPrompt = prompt;
  await c.working("⏳ Рисую… секунд 10–20"); // карточка сворачивается, кнопки прячутся
  await c.call(() => c.image(pollinations(prompt, c.state), `«${prompt}» · ${c.state.model} · ${c.state.ratio}`));
  // после этого settle вернёт полную карточку — уже ПОД новой картинкой (feed)
}

const ai = screen<S>("ai")
  .state({ model: "flux", ratio: "1:1", enhance: true })
  .mode("feed")
  .text((s) => `🎨 AI генерация\nМодель: ${s.model} · Формат: ${s.ratio}\nПришли промпт — нарисую.`)
  .pick("model", MODELS)
  .pick("ratio", Object.keys(RATIOS))
  .toggle("enhance", "Улучшать промпт")
  .webapp("🖼 Галерея", "https://pollinations.ai")
  .link("📣 Канал", "https://t.me/telegram")
  .button("🔁 Повторить последний", "again", (s) => !!s.lastPrompt)
  .action("again", (c) => (c.state.lastPrompt ? draw(c, c.state.lastPrompt) : undefined))
  .onPrompt((c, text) => draw(c, text))
  .entry("/start");

run(
  { token: process.env.BOT_TOKEN!, storage: ".tgx/ai.json", analytics: ".tgx/ai-stats.json" },
  [ai],
);
