import { run } from "@tgxjs/core";
import { card } from "@tgxjs/kit";

// Генерация изображений одной картой: слоты для загрузки фото, параметры,
// ре-рендер, испарение кнопок, error-boundary. Card сидит на том же движке, что и
// flow: рендер, персистентность и навигация — общие.
type S = { photos: string[]; ratio: string };

const gen = card<S>(
  "image_gen",
  {
    initial: () => ({ photos: [], ratio: "1:1" }),
    slots: { photos: { kind: "photo", min: 1, max: 2, maxMb: 20 } },

    render: (s) => ({
      text: `📸 Фото: ${s.photos.length}/2 · Формат: ${s.ratio}`,
      buttons: [
        [{ label: "➕ Добавить фото", slot: "photos" }],
        [
          { label: s.ratio === "1:1" ? "✅ 1:1" : "1:1", action: "ratio", value: "1:1" },
          { label: s.ratio === "16:9" ? "✅ 16:9" : "16:9", action: "ratio", value: "16:9" },
        ],
        s.photos.length >= 1 ? [{ label: "🚀 Сгенерировать", action: "go" }] : [],
      ],
    }),

    actions: {
      ratio: (s, _ctx, value) => ({ ...s, ratio: value! }),
      go: async (s, ctx) => {
        // ctx.call — error boundary. NSFW/провайдер/500 сами станут понятным текстом.
        const res = await ctx.call(() => generate(s.photos, s.ratio));
        await ctx.image(res.url);
      },
    },
  },
  { entry: "/gen" },
);

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/imagegen.json" }, [gen]);

declare function generate(photos: string[], ratio: string): Promise<{ url: string }>;
