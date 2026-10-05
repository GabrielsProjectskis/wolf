import { isTauri } from "../storage";
import { reveal } from "../storage/tauri";
import { downloadBlob } from "../storage/web";
import { snapshotClient } from "./document";
import { pdfFileName, renderPdfBlob } from "./pdf";
import type { Business, Client, WolfDocument } from "../types";

/**
 * On the desktop, PDFs land in Documents/Wolf/pdf/, inside the folder
 * the app already has permission to write, so the user always knows
 * where to look. In a browser it falls back to a normal download.
 *
 * This module is loaded on demand: the PDF engine is most of the
 * bundle and isn't needed until the first PDF.
 */
export const savePdf = async (
  doc: WolfDocument,
  business: Business,
  correctsNumber: string | null,
  clients: Client[],
): Promise<string> => {
  // A draft has no frozen client yet; preview it with the current details.
  const current = clients.find((c) => c.id === doc.clientId);
  const printable = doc.client || !current ? doc : { ...doc, client: snapshotClient(current) };

  const blob = await renderPdfBlob(printable, business, { correctsNumber });
  const name = pdfFileName(printable, doc.language === "nl" ? "concept" : "draft");

  if (isTauri()) {
    const { BaseDirectory, exists, mkdir, writeFile } = await import("@tauri-apps/plugin-fs");
    const dir = "Wolf/pdf";
    const opts = { baseDir: BaseDirectory.Document } as const;
    if (!(await exists(dir, opts))) await mkdir(dir, { ...opts, recursive: true });
    await writeFile(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()), opts);
    await reveal(["Wolf", "pdf", name]);
    return `Documents/Wolf/pdf/${name}`;
  }

  downloadBlob(blob, name);
  return name;
};
