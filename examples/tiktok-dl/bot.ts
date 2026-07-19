import { run, defineScreen } from "@tgxjs/core";

// Простейший «пришли ссылку — получи видео» бот. Одна строка ввода, вызов
// внешнего сервиса под error-boundary, отдача файла через сырой grammY (ctx.tg).
type S = { last?: string };

const tiktok = defineScreen<S>(
  "tiktok",
  {
    state: () => ({}),
    view: (s) => ({
      text: s.last ? `Готово ✅\nЗакинь ещё ссылку.` : "📥 Пришли ссылку на TikTok — верну видео без watermark.",
    }),
    onInput: async (c, msg) => {
      const url = msg.text;
      if (!url || !/tiktok\.com/.test(url)) {
        await c.say("Это не похоже на ссылку TikTok.");
        return;
      }
      const file = await c.call(() => resolveTikTok(url));   // внешний резолвер + error boundary
      await c.tg.replyWithVideo(file.videoUrl, { caption: file.author });  // escape hatch в grammY
      c.state.last = url;
    },
  },
  { entry: "/start" },
);

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/tiktok.json" }, [tiktok]);

declare function resolveTikTok(url: string): Promise<{ videoUrl: string; author: string }>;
