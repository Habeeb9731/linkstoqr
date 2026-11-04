import { strToU8, zipSync, type Zippable } from "fflate";
import { fileBaseName, slugify } from "./links.ts";
import { renderPng } from "./png.ts";
import { encodeQr, renderSvg, type QrOptions } from "./qr.ts";

export type ImageFormat = "png" | "svg";

export interface ZipEntry {
  value: string;
  /** Safe description. Unlike `value`, it never contains secrets such as Wi-Fi passwords. */
  label: string;
  name?: string;
  category?: string;
}

export function renderImage(value: string, options: QrOptions, format: ImageFormat): Uint8Array {
  const matrix = encodeQr(value, options.ecc);
  return format === "png" ? renderPng(matrix, options) : strToU8(renderSvg(matrix, options));
}

function csvCell(value: string): string {
  // Spreadsheets run cells starting with these characters as formulas.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Builds a ZIP of every code, plus links.csv to say what each file is. */
export function buildZip(
  entries: readonly ZipEntry[],
  options: QrOptions,
  format: ImageFormat,
  onProgress?: (done: number, total: number) => void,
): Uint8Array {
  const files: Zippable = {};
  const manifest = ["file,name,category,content"];
  entries.forEach((entry, index) => {
    const base = fileBaseName(entry.name || entry.label, index + 1, entries.length);
    const folder = entry.category ? slugify(entry.category) : "";
    const path = `${folder ? `${folder}/` : ""}${base}.${format}`;
    files[path] = [renderImage(entry.value, options, format), { level: format === "png" ? 0 : 6 }];
    manifest.push([path, entry.name ?? "", entry.category ?? "", entry.label].map(csvCell).join(","));
    onProgress?.(index + 1, entries.length);
  });
  files["links.csv"] = strToU8(`${manifest.join("\r\n")}\r\n`);
  return zipSync(files);
}
