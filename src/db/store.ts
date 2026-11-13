import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config.js";
import { seed } from "./seed.js";
import type { DB } from "./types.js";

/**
 * Armazenamento em arquivo JSON com escrita atômica.
 * Suficiente para um bar/restaurante (milhares de clientes). Para várias
 * unidades ou alto volume, troque por Postgres mantendo esta mesma interface.
 */
let db: DB;
let saveTimer: NodeJS.Timeout | null = null;

export function loadDb(): DB {
  const file = path.resolve(config.dataFile);
  if (fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<DB>;
    // Preenche coleções novas que versões antigas do arquivo não tinham
    db = { ...seed(), ...loaded } as DB;
  } else {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = seed();
    flush();
  }
  return db;
}

export function getDb(): DB {
  if (!db) loadDb();
  return db;
}

/** Agenda gravação (agrupa várias alterações seguidas em uma escrita). */
export function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 200);
}

export function flush(): void {
  const file = path.resolve(config.dataFile);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

process.on("SIGINT", () => {
  if (db) flush();
  process.exit(0);
});
process.on("SIGTERM", () => {
  if (db) flush();
  process.exit(0);
});
