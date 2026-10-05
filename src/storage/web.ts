import { del, get, set } from "idb-keyval";
import { validateData } from "../lib/validate";
import type { WolfData } from "../types";
import { fileStamp, serialise, StorageError, type LoadResult, type StorageAdapter } from "./adapter";

const KEY = "wolf:data";
const PREVIOUS = "wolf:data:previous";
const UNREADABLE = "wolf:data:unreadable";
const SNAPSHOT = "wolf:data:snapshot";

/**
 * Browser fallback. Durable in Chrome, Edge and Firefox; on Safari,
 * ITP wipes script-writable storage after seven days of no visits
 * unless the app was installed to the Dock or Home Screen.
 */
export class WebStorage implements StorageAdapter {
  readonly locationLabel = "This browser (IndexedDB)";
  readonly isFileBacked = false;

  async load(): Promise<LoadResult> {
    let stored: unknown;
    let previous: unknown;
    try {
      [stored, previous] = await Promise.all([get(KEY), get(PREVIOUS)]);
    } catch (cause) {
      throw new StorageError("read", "Could not read saved data from this browser.", [String(cause)], cause);
    }
    if (stored === undefined) return { status: "empty" };

    const main = validateData(stored);
    if (main.ok) return { status: "ok", data: main.data, warnings: main.warnings };

    if (previous !== undefined) {
      const backup = validateData(previous);
      if (backup.ok) {
        const setAside = await this.setAsideUnreadable();
        return {
          status: "recovered",
          data: backup.data,
          warnings: backup.warnings,
          source: "previous save",
          setAside,
        };
      }
    }
    throw new StorageError("unreadable", "The data saved in this browser could not be read.", main.errors);
  }

  async save(data: WolfData): Promise<void> {
    try {
      const current = await get(KEY);
      if (current !== undefined) await set(PREVIOUS, current);
      await set(KEY, data);
    } catch (cause) {
      throw new StorageError("write", "Could not save data in this browser.", [String(cause)], cause);
    }
  }

  async exportBackup(data: WolfData): Promise<string> {
    const name = `wolf-backup-${fileStamp()}.json`;
    downloadBlob(new Blob([serialise(data)], { type: "application/json" }), name);
    return name;
  }

  async snapshot(data: WolfData): Promise<void> {
    await set(SNAPSHOT, data);
  }

  async setAsideUnreadable(): Promise<string | null> {
    const current = await get(KEY);
    if (current === undefined) return null;
    await set(UNREADABLE, current);
    await del(KEY);
    return "this browser (kept under a separate key)";
  }
}

/** Ask the browser not to evict us under storage pressure. Best effort. */
export const requestPersistence = async (): Promise<boolean> => {
  if (!navigator.storage?.persist) return false;
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
};

export const downloadBlob = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
