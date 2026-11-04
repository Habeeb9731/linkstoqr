import type { Ecc, ImageFormat, QrOptions, ZipEntry } from "@linkstoqr/qr-core";

/** A code added through one of the content forms. */
export interface CustomItem extends ZipEntry {
  id: number;
}

export interface ResultItem {
  key: string;
  /** Line number, for pasted links only. */
  line?: number;
  customId?: number;
  /** The text to encode. Absent if the item is invalid. */
  value?: string;
  /** Safe to show and to use in file names: never contains a Wi-Fi password. */
  label: string;
  name?: string;
  category?: string;
  error?: string;
  /** Modules per side, excluding the margin. */
  modules?: number;
}

export type WorkerRequest =
  | { type: "analyze"; jobId: number; text: string; ecc: Ecc; linkName: string; linkCategory: string; custom: CustomItem[] }
  | { type: "zip"; jobId: number; entries: ZipEntry[]; options: QrOptions; format: ImageFormat };

export type WorkerResponse =
  | { type: "analyzed"; jobId: number; items: ResultItem[]; ecc: Ecc }
  | { type: "zip-progress"; jobId: number; done: number; total: number }
  | { type: "zip-done"; jobId: number; blob: Blob }
  | { type: "failed"; jobId: number; message: string };
