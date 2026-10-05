import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { todayIso } from "../lib/dates";
import { parseDataFile } from "../lib/validate";
import type { WolfData } from "../types";
import { fileStamp, serialise, StorageError, type LoadResult, type StorageAdapter } from "./adapter";

const DIR = "Wolf";
const BACKUP_DIR = `${DIR}/backups`;
const FILE = `${DIR}/data.json`;
const TEMP = `${DIR}/data.json.tmp`;
const PREVIOUS = `${DIR}/data.json.bak`;
const DAILY_PREFIX = "daily-";
const DAILY_KEEP = 14;

const OPTS = { baseDir: BaseDirectory.Document } as const;
const RENAME_OPTS = {
  oldPathBaseDir: BaseDirectory.Document,
  newPathBaseDir: BaseDirectory.Document,
} as const;

/**
 * Writes to Documents/Wolf/data.json.
 *
 * Every save goes through a temp file and a rename, keeping the previous
 * version as data.json.bak, plus one dated copy per day in backups/
 * (the last 14 are kept). A crash mid-write therefore cannot leave the
 * user with a truncated history.
 *
 * On load, an unreadable data.json is never overwritten: Wolf falls back
 * to the newest readable backup and moves the damaged file aside under a
 * new name, or, if there is no usable backup, refuses to save at all.
 */
export class TauriFileStorage implements StorageAdapter {
  readonly locationLabel = "Documents/Wolf/data.json";
  readonly isFileBacked = true;

  private async ensureDir(path: string): Promise<void> {
    if (!(await exists(path, OPTS))) await mkdir(path, { ...OPTS, recursive: true });
  }

  private async tryRead(path: string): Promise<{ data: WolfData; warnings: string[] } | string[]> {
    try {
      const result = parseDataFile(await readTextFile(path, OPTS));
      return result.ok ? { data: result.data, warnings: result.warnings } : result.errors;
    } catch (cause) {
      return [String(cause)];
    }
  }

  private async dailyBackups(): Promise<string[]> {
    if (!(await exists(BACKUP_DIR, OPTS))) return [];
    const entries = await readDir(BACKUP_DIR, OPTS);
    return entries
      .filter((e) => e.isFile && e.name.startsWith(DAILY_PREFIX) && e.name.endsWith(".json"))
      .map((e) => e.name)
      .sort()
      .reverse();
  }

  async load(): Promise<LoadResult> {
    let mainErrors: string[] = [];
    try {
      await this.ensureDir(DIR);
      if (await exists(FILE, OPTS)) {
        const main = await this.tryRead(FILE);
        if (!Array.isArray(main)) return { status: "ok", ...main };
        mainErrors = main;
      }

      const candidates = [PREVIOUS, ...(await this.dailyBackups()).map((n) => `${BACKUP_DIR}/${n}`)];
      for (const path of candidates) {
        if (!(await exists(path, OPTS))) continue;
        const backup = await this.tryRead(path);
        if (Array.isArray(backup)) continue;
        // A previous run may have died between the two renames, leaving
        // only the .bak. That isn't damage; just carry on with it.
        if (mainErrors.length === 0) return { status: "ok", ...backup };
        const setAside = await this.setAsideUnreadable();
        return { status: "recovered", ...backup, source: path, setAside };
      }
    } catch (cause) {
      throw new StorageError("read", "Wolf could not read its data folder.", [String(cause)], cause);
    }

    if (mainErrors.length) {
      throw new StorageError(
        "unreadable",
        "Your Wolf data file could not be read, and no usable backup was found.",
        mainErrors,
      );
    }
    return { status: "empty" };
  }

  async save(data: WolfData): Promise<void> {
    try {
      await this.ensureDir(DIR);
      const json = serialise(data);
      await writeTextFile(TEMP, json, OPTS);
      if (await exists(FILE, OPTS)) {
        if (await exists(PREVIOUS, OPTS)) await remove(PREVIOUS, OPTS);
        await rename(FILE, PREVIOUS, RENAME_OPTS);
      }
      await rename(TEMP, FILE, RENAME_OPTS);
      await this.writeDaily(json);
    } catch (cause) {
      throw new StorageError("write", "Wolf could not save your data file.", [String(cause)], cause);
    }
  }

  /** One dated copy per day, so a mistake noticed next week is still recoverable. */
  private async writeDaily(json: string): Promise<void> {
    await this.ensureDir(BACKUP_DIR);
    const today = `${BACKUP_DIR}/${DAILY_PREFIX}${todayIso()}.json`;
    if (await exists(today, OPTS)) return;
    await writeTextFile(today, json, OPTS);
    const all = await this.dailyBackups();
    for (const old of all.slice(DAILY_KEEP)) await remove(`${BACKUP_DIR}/${old}`, OPTS);
  }

  async exportBackup(data: WolfData): Promise<string> {
    await this.ensureDir(BACKUP_DIR);
    const name = `wolf-backup-${fileStamp()}.json`;
    await writeTextFile(`${BACKUP_DIR}/${name}`, serialise(data), OPTS);
    await reveal(["Wolf", "backups", name]);
    return `Documents/Wolf/backups/${name}`;
  }

  async snapshot(data: WolfData, reason: string): Promise<void> {
    await this.ensureDir(BACKUP_DIR);
    const safe = reason.replace(/[^a-z0-9-]/gi, "");
    await writeTextFile(`${BACKUP_DIR}/${safe}-${fileStamp()}.json`, serialise(data), OPTS);
  }

  async setAsideUnreadable(): Promise<string | null> {
    if (!(await exists(FILE, OPTS))) return null;
    const name = `data.unreadable-${fileStamp()}.json`;
    await rename(FILE, `${DIR}/${name}`, RENAME_OPTS);
    return `Documents/Wolf/${name}`;
  }
}

/** Opens the file manager at a file inside Documents. Best effort. */
export const reveal = async (segments: string[]): Promise<void> => {
  try {
    const [{ revealItemInDir }, { documentDir, join }] = await Promise.all([
      import("@tauri-apps/plugin-opener"),
      import("@tauri-apps/api/path"),
    ]);
    await revealItemInDir(await join(await documentDir(), ...segments));
  } catch {
    // Revealing is a convenience; the file is already written.
  }
};
