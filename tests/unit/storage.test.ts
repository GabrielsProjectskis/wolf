import { beforeEach, describe, expect, it, vi } from "vitest";
import { issuedInvoice } from "../fixtures";

/**
 * An in-memory stand-in for @tauri-apps/plugin-fs, so the real
 * TauriFileStorage code runs against something that behaves like a disk.
 */
const disk = new Map<string, string>();
const dirs = new Set<string>();
let failRename = false;

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { Document: 6 },
  exists: async (p: string) =>
    disk.has(p) || dirs.has(p) || [...disk.keys()].some((k) => k.startsWith(`${p}/`)),
  mkdir: async (p: string) => void dirs.add(p),
  readTextFile: async (p: string) => {
    if (!disk.has(p)) throw new Error(`ENOENT ${p}`);
    return disk.get(p)!;
  },
  writeTextFile: async (p: string, text: string) => void disk.set(p, text),
  remove: async (p: string) => void disk.delete(p),
  rename: async (from: string, to: string) => {
    if (failRename) throw new Error("disk full");
    if (!disk.has(from)) throw new Error(`ENOENT ${from}`);
    disk.set(to, disk.get(from)!);
    disk.delete(from);
  },
  readDir: async (p: string) =>
    [...disk.keys()]
      .filter((k) => k.startsWith(`${p}/`) && !k.slice(p.length + 1).includes("/"))
      .map((k) => ({ name: k.slice(p.length + 1), isFile: true, isDirectory: false })),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: async () => {} }));
vi.mock("@tauri-apps/api/path", () => ({
  documentDir: async () => "/docs",
  join: async (...p: string[]) => p.join("/"),
}));

const { TauriFileStorage } = await import("../../src/storage/tauri");
const { StorageError } = await import("../../src/storage/adapter");

const good = () => issuedInvoice().data;

beforeEach(() => {
  disk.clear();
  dirs.clear();
  failRename = false;
});

describe("desktop file storage", () => {
  it("starts empty, then saves and loads the same data", async () => {
    const storage = new TauriFileStorage();
    expect(await storage.load()).toEqual({ status: "empty" });
    const data = good();
    await storage.save(data);
    const loaded = await storage.load();
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") expect(loaded.data).toEqual(data);
  });

  it("keeps the previous save as .bak and a daily copy", async () => {
    const storage = new TauriFileStorage();
    const first = good();
    await storage.save(first);
    await storage.save({ ...first, clients: [] });
    expect(JSON.parse(disk.get("Wolf/data.json.bak")!).clients).toHaveLength(1);
    expect([...disk.keys()].some((k) => /^Wolf\/backups\/daily-\d{4}-\d{2}-\d{2}\.json$/.test(k))).toBe(true);
    expect(disk.has("Wolf/data.json.tmp")).toBe(false);
  });

  it("prunes daily copies to the last 14", async () => {
    for (let d = 1; d <= 20; d++)
      disk.set(`Wolf/backups/daily-2026-07-${String(d).padStart(2, "0")}.json`, "{}");
    await new TauriFileStorage().save(good());
    const dailies = [...disk.keys()].filter((k) => k.includes("daily-"));
    expect(dailies).toHaveLength(14);
    expect(dailies).not.toContain("Wolf/backups/daily-2026-07-01.json");
  });

  // The original bug: a corrupt data.json loaded as "no data", the app
  // showed Setup, and the next save overwrote both the corrupt file and
  // the good backup.
  it("recovers from the backup when data.json is corrupt, and keeps the damaged file", async () => {
    const storage = new TauriFileStorage();
    const data = good();
    await storage.save(data);
    await storage.save(data); // now data.json.bak exists too
    disk.set("Wolf/data.json", '{"version":1,"documents":[{"trunc');

    const loaded = await storage.load();
    expect(loaded.status).toBe("recovered");
    if (loaded.status === "recovered") {
      expect(loaded.data).toEqual(data);
      expect(loaded.setAside).toMatch(/data\.unreadable-.*\.json$/);
    }
    const setAside = [...disk.keys()].find((k) => k.includes("unreadable"))!;
    expect(disk.get(setAside)).toContain("trunc");

    // Saving now must not touch the backup it recovered from.
    const backupBefore = disk.get("Wolf/data.json.bak");
    await storage.save(data);
    expect(disk.get("Wolf/data.json.bak")).toBe(backupBefore);
  });

  it("refuses to load (and so to save over) data it can't read and can't recover", async () => {
    disk.set("Wolf/data.json", "garbage");
    await expect(new TauriFileStorage().load()).rejects.toMatchObject({ kind: "unreadable" });
    expect(disk.get("Wolf/data.json")).toBe("garbage");
  });

  it("treats a schema-invalid file as unreadable, not as empty", async () => {
    disk.set("Wolf/data.json", JSON.stringify({ version: 1, documents: "nope" }));
    await expect(new TauriFileStorage().load()).rejects.toBeInstanceOf(StorageError);
  });

  it("falls back to an older daily copy when .bak is also bad", async () => {
    const data = good();
    disk.set("Wolf/data.json", "garbage");
    disk.set("Wolf/data.json.bak", "also garbage");
    disk.set("Wolf/backups/daily-2026-08-01.json", JSON.stringify(data));
    const loaded = await new TauriFileStorage().load();
    expect(loaded.status).toBe("recovered");
  });

  it("uses .bak without complaint if a crash happened between the two renames", async () => {
    disk.set("Wolf/data.json.bak", JSON.stringify(good()));
    expect((await new TauriFileStorage().load()).status).toBe("ok");
  });

  it("reports a failed write as a StorageError and leaves the old file intact", async () => {
    const storage = new TauriFileStorage();
    await storage.save(good());
    const before = disk.get("Wolf/data.json");
    failRename = true;
    await expect(storage.save({ ...good(), clients: [] })).rejects.toMatchObject({ kind: "write" });
    expect(disk.get("Wolf/data.json")).toBe(before);
  });

  it("writes exported backups into Documents/Wolf/backups", async () => {
    const where = await new TauriFileStorage().exportBackup(good());
    expect(where).toMatch(/^Documents\/Wolf\/backups\/wolf-backup-.*\.json$/);
    expect(where).not.toContain(":");
  });
});
