// Zero-dependency persistence. Implements grammY's StorageAdapter over a single
// JSON file, so flow state survives a restart with no external service.
//
// This is what makes the core thesis real: kill -TERM mid-flow, restart, and the
// user continues from the same step. Writes are atomic (temp + rename) so a crash
// cannot corrupt the store. It is single-node only — under concurrent writes across
// processes it can lose updates (read-modify-write of the whole file). For that,
// swap in @grammyjs/storage-redis; the run() call is the only thing that changes.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { StorageAdapter } from "grammy";

export function fileStorage<T>(path: string): StorageAdapter<T> {
  const load = (): Record<string, T> => {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, T>;
    } catch {
      return {}; // corrupt/partial file → start clean rather than crash
    }
  };

  // Atomic write: serialize to a temp file, then rename over the target. rename is
  // atomic on the same filesystem, so a crash mid-write can never corrupt the store
  // (you keep the previous complete version instead of a half-written file).
  const save = (data: Record<string, T>) => {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  };

  return {
    read(key) {
      return load()[key];
    },
    write(key, value) {
      const data = load();
      data[key] = value;
      save(data);
    },
    delete(key) {
      const data = load();
      delete data[key];
      save(data);
    },
    has(key) {
      return key in load();
    },
    *readAllKeys() {
      yield* Object.keys(load());
    },
  };
}
