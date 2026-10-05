import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { App } from "../../src/App";
import { StorageError, type LoadResult, type StorageAdapter } from "../../src/storage";
import { StoreProvider } from "../../src/store/store";
import type { WolfData } from "../../src/types";

/** In-memory storage that records every call. */
export class MemoryStorage implements StorageAdapter {
  readonly locationLabel = "memory";
  readonly isFileBacked = true;
  saved: WolfData[] = [];
  snapshots: WolfData[] = [];
  setAside = 0;
  constructor(private initial: LoadResult | Error = { status: "empty" }) {}
  load = vi.fn(async (): Promise<LoadResult> => {
    if (this.initial instanceof Error) throw this.initial;
    return this.initial;
  });
  save = vi.fn(async (data: WolfData) => {
    this.saved.push(structuredClone(data));
  });
  exportBackup = vi.fn(async () => "Documents/Wolf/backups/test.json");
  snapshot = vi.fn(async (data: WolfData) => {
    this.snapshots.push(structuredClone(data));
  });
  setAsideUnreadable = vi.fn(async () => {
    this.setAside++;
    return "Documents/Wolf/data.unreadable.json";
  });
  get last(): WolfData | undefined {
    return this.saved.at(-1);
  }
}

export const unreadable = () =>
  new StorageError("unreadable", "Your Wolf data file could not be read, and no usable backup was found.", [
    "Unexpected token",
  ]);

export const renderApp = (storage: StorageAdapter = new MemoryStorage()) => {
  const user = userEvent.setup();
  const utils = render(
    <StoreProvider storage={storage}>
      <App />
    </StoreProvider>,
  );
  return { user, storage, ...utils };
};
