import { run, defineScreen } from "@tgxjs/core";

// Поисковый бот с пагинацией и карточкой деталей — всё в одном экране, который
// морфится: промпт → список результатов (стр. N) → детали → назад к списку.
type Movie = { id: string; title: string; year: number; overview: string };
type S = { query?: string; results: Movie[]; page: number; open?: string };

const PER = 3;

const movie = defineScreen<S>(
  "movie",
  {
    state: () => ({ results: [], page: 0 }),

    view: (s) => {
      // экран деталей
      if (s.open) {
        const m = s.results.find((x) => x.id === s.open)!;
        return { text: `🎬 *${m.title}* (${m.year})\n\n${m.overview}`,
          buttons: [[{ label: "⬅️ К результатам", do: "list" }]] };
      }
      // пустой старт
      if (!s.results.length)
        return { text: "🔎 Пришли название фильма." };
      // список с пагинацией
      const start = s.page * PER;
      const pageItems = s.results.slice(start, start + PER);
      const rows = pageItems.map((m) => [{ label: `${m.title} (${m.year})`, do: "open", value: m.id }]);
      const nav: { label: string; do: string }[] = [];
      if (s.page > 0) nav.push({ label: "◀️", do: "prev" });
      if (start + PER < s.results.length) nav.push({ label: "▶️", do: "next" });
      return {
        text: `Нашёл ${s.results.length} по «${s.query}». Стр. ${s.page + 1}:`,
        buttons: nav.length ? [...rows, nav] : rows,
      };
    },

    on: {
      open: (c, v) => { c.state.open = v; },
      list: (c) => { c.state.open = undefined; },
      next: (c) => { c.state.page++; },
      prev: (c) => { c.state.page--; },
    },

    onInput: async (c, msg) => {
      if (!msg.text) return;
      c.state.query = msg.text;
      c.state.results = await c.call(() => searchMovies(msg.text!));  // внешний API + error boundary
      c.state.page = 0;
      c.state.open = undefined;
    },
  },
  { entry: "/start" },
);

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/movie.json" }, [movie]);

declare function searchMovies(q: string): Promise<Movie[]>;
