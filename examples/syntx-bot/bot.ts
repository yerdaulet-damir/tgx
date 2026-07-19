import { run, defineScreen } from "@tgxjs/core";

// Syntx-style AI бот: ОДНА карточка, которая морфится под шаг. Бренд → модель →
// параметры (toggle-кнопки) → рефы → генерация с ожиданием. Всё редактирует то же
// сообщение (карточка «под рукой»), состояние персистентно, кнопки испаряются сами.
const BRANDS: Record<string, string> = { flux: "Flux", sd: "Stable Diffusion", mj: "Midjourney" };
const MODELS: Record<string, Record<string, string>> = {
  flux: { "flux-pro": "Flux Pro", "flux-dev": "Flux Dev" },
  sd: { "sd-3.5": "SD 3.5", "sdxl": "SDXL" },
  mj: { "v6": "MJ v6", "niji": "Niji" },
};

type S = {
  mode: "config" | "brand" | "model";
  brand?: string;
  model?: string;
  hd: boolean;
  priv: boolean;
  refs: string[];
  collecting: boolean;
  status: "idle" | "working";
  result?: string;
};

const syntx = defineScreen<S>(
  "syntx",
  {
    state: () => ({ mode: "config", hd: false, priv: false, refs: [], collecting: false, status: "idle" }),

    view: (s) => {
      // сбор референсов — карточка временно превращается в приёмник фото
      if (s.collecting)
        return { text: `📎 Пришли фото-референсы (${s.refs.length} шт). Когда хватит — «Готово».`,
          buttons: [[{ label: "✅ Готово", do: "donerefs" }]] };

      // выбор бренда
      if (s.mode === "brand")
        return { text: "Выбери бренд:",
          buttons: Object.entries(BRANDS).map(([v, l]) => [{ label: l, do: "pickbrand", value: v }]) };

      // выбор модели (зависит от бренда)
      if (s.mode === "model")
        return { text: `Модель ${BRANDS[s.brand!]}:`,
          buttons: Object.entries(MODELS[s.brand!]).map(([v, l]) => [{ label: l, do: "pickmodel", value: v }]) };

      // главная конфиг-карточка
      const lines = [
        "🎨 *Генерация*",
        `Бренд: ${s.brand ? BRANDS[s.brand] : "—"}`,
        `Модель: ${s.model ? MODELS[s.brand!][s.model] : "—"}`,
        `Референсы: ${s.refs.length}`,
        s.result ? `\n✅ Результат: ${s.result}` : "",
      ];
      return {
        text: lines.filter(Boolean).join("\n"),
        buttons: [
          [{ label: s.brand ? `Бренд: ${BRANDS[s.brand]} ✏️` : "① Выбрать бренд", do: "tobrand" }],
          s.brand ? [{ label: s.model ? `Модель: ${MODELS[s.brand][s.model]} ✏️` : "② Выбрать модель", do: "tomodel" }] : [],
          [
            { label: s.hd ? "✅ HD" : "☐ HD", do: "hd" },
            { label: s.priv ? "✅ Приватно" : "☐ Приватно", do: "priv" },
          ],
          [{ label: `📎 Референсы (${s.refs.length})`, do: "addref" }],
          s.brand && s.model
            ? [{ label: s.status === "working" ? "⏳ Генерирую…" : "🚀 Генерировать", do: "gen" }]
            : [],
        ],
      };
    },

    on: {
      tobrand: (c) => { c.state.mode = "brand"; },
      tomodel: (c) => { c.state.mode = "model"; },
      pickbrand: (c, v) => { c.state.brand = v; c.state.model = undefined; c.state.mode = "config"; },
      pickmodel: (c, v) => { c.state.model = v; c.state.mode = "config"; },
      hd: (c) => { c.state.hd = !c.state.hd; },       // toggle → карточка сама перерисуется
      priv: (c) => { c.state.priv = !c.state.priv; },
      addref: (c) => { c.state.collecting = true; },
      donerefs: (c) => { c.state.collecting = false; },
      gen: async (c) => {
        c.state.status = "working";
        await c.say("⏳ Отправил в очередь…");
        const res = await c.call(() => generate(c.state));   // error boundary включён
        c.state.result = res.url;
        c.state.status = "idle";
      },
    },

    // рефы прилетают как фото, пока карточка в режиме сбора
    onInput: (c, msg) => {
      if (c.state.collecting && msg.photo) c.state.refs.push(msg.photo);
    },
  },
  { entry: "/gen" },
);

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/syntx.json" }, [syntx]);

declare function generate(cfg: S): Promise<{ url: string }>;
