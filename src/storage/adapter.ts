import type { WolfData } from "../types";

export type LoadResult =
  | { status: "empty" }
  | { status: "ok"; data: WolfData; warnings: string[] }
  /** The main file was unreadable; data came from a backup and the bad file was set aside. */
  | { status: "recovered"; data: WolfData; warnings: string[]; source: string; setAside: string | null };

/**
 * The whole app talks to storage through this and nothing else.
 * Two implementations exist (a file on disk under Tauri, IndexedDB in a
 * plain browser) and no screen knows or cares which is live.
 */
export interface StorageAdapter {
  /** Human-readable description of where data lives, shown in Settings. */
  readonly locationLabel: string;
  /** True when the backing store is a real file the user can find. */
  readonly isFileBacked: boolean;

  /**
   * Reads and validates stored data. Throws StorageError with
   * kind "unreadable" when data exists but neither it nor any backup
   * can be read; the caller must then refuse to save, so that the
   * damaged file is never overwritten.
   */
  load(): Promise<LoadResult>;
  save(data: WolfData): Promise<void>;
  /** Writes a full backup the user keeps. Returns where it went. */
  exportBackup(data: WolfData): Promise<string>;
  /** Keeps a copy of the current data before something replaces it. */
  snapshot(data: WolfData, reason: string): Promise<void>;
  /** Moves an unreadable data file out of the way so a fresh start can't overwrite it. */
  setAsideUnreadable(): Promise<string | null>;
}

export type StorageErrorKind = "unreadable" | "read" | "write";

export class StorageError extends Error {
  readonly kind: StorageErrorKind;
  readonly details: string[];
  constructor(kind: StorageErrorKind, message: string, details: string[] = [], cause?: unknown) {
    super(message, { cause });
    this.name = "StorageError";
    this.kind = kind;
    this.details = details;
  }
}

export const serialise = (data: WolfData): string => JSON.stringify(data, null, 2);

/** "2026-08-13T09-05-12" for file names (no colons; Windows forbids them). */
export const fileStamp = (now = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
};
