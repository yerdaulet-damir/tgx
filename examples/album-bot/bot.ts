import { screen, run } from "@tgxjs/core";
import { ui } from "@tgxjs/kit";

// Обработка файлов и альбомов. Показывает: единый IncomingFile для любого типа
// медиа, буферизацию media-group (альбом прилетает N апдейтами — движок сам
// собирает их в один onAlbum), и chat-action «загружает…». Валидация типа/размера.
const MB = 1024 * 1024;

const album = screen<{ received: number }>("album")
  .state({ received: 0 })
  .text((s) => [
    ui.badge("Файл-бот", "info"),
    ui.rule(),
    "Пришли фото/документ/видео — распознаю тип и размер.",
    "Пришли АЛЬБОМ (несколько фото разом) — соберу в один пакет.",
    s.received ? `\nОбработано файлов: ${s.received}` : "",
  ].filter(Boolean).join("\n"))
  // одиночный файл любого типа — уже нормализован в IncomingFile
  .onInput(async (c, msg) => {
    const f = msg.file;
    if (!f) return;
    if (f.size && f.size > 20 * MB) {
      await c.say(`⚠️ ${Math.round(f.size / MB)} МБ — это больше лимита 20 МБ. Сожми файл или пришли ссылку.`);
      return;
    }
    await c.action("typing");
    c.state.received++;
    await c.say(
      `✅ Принял ${f.kind}\n${ui.kv([
        ["Тип", f.mime ?? "—"],
        ["Размер", f.size ? `${(f.size / MB).toFixed(2)} МБ` : "—"],
        ["Имя", f.fileName ?? "—"],
        ["ID (dedupe)", f.fileUniqueId.slice(0, 10) + "…"],
      ])}`,
    );
  })
  // альбом: движок отдебаунсил и собрал все элементы в один вызов
  .onAlbum(async (c, files) => {
    c.state.received += files.length;
    const kinds = files.map((f) => f.kind).join(", ");
    const totalMb = files.reduce((s, f) => s + (f.size ?? 0), 0) / MB;
    await c.say(`📦 Альбом собран: ${files.length} шт (${kinds})\nОбщий размер: ${totalMb.toFixed(2)} МБ`);
  })
  .entry("/start");

run({ token: process.env.BOT_TOKEN!, storage: ".tgx/album.json" }, [album]);
