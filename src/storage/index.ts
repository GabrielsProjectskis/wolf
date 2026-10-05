import type { StorageAdapter } from "./adapter";
import { TauriFileStorage } from "./tauri";
import { requestPersistence, WebStorage } from "./web";

export { StorageError } from "./adapter";
export type { LoadResult, StorageAdapter } from "./adapter";

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let adapter: StorageAdapter | null = null;

export const getStorage = (): StorageAdapter => {
  if (!adapter) {
    adapter = isTauri() ? new TauriFileStorage() : new WebStorage();
    if (!isTauri()) void requestPersistence();
  }
  return adapter;
};

/** Test hook: swap the storage backend. */
export const setStorageForTests = (next: StorageAdapter | null): void => {
  adapter = next;
};
