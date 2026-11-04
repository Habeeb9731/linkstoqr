import { strToU8, zipSync, type Zippable } from "fflate";
import { fileBaseName } from "./links.ts";
import { renderPng } from "./png.ts";
import { encodeQr, renderSvg, type QrOptions } from "./qr.ts";

export type ImageFormat = "png" | "svg";

export function renderImage(value: string, options: QrOptions, format: ImageFormat): Uint8Array {
  const matrix = encodeQr(value, options.ecc);
  return format === "png" ? renderPng(matrix, options) : strToU8(renderSvg(matrix, options));
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Builds a ZIP of every link, plus links.csv to map each file to its link. */
export function buildZip(
  values: readonly string[],
  options: QrOptions,
  format: ImageFormat,
  onProgress?: (done: number, total: number) => void,
): Uint8Array {
  const files: Zippable = {};
  const manifest = ["file,link"];
  values.forEach((value, index) => {
    const name = `${fileBaseName(value, index + 1, values.length)}.${format}`;
    files[name] = [renderImage(value, options, format), { level: format === "png" ? 0 : 6 }];
    manifest.push(`${csvCell(name)},${csvCell(value)}`);
    onProgress?.(index + 1, values.length);
  });
  files["links.csv"] = strToU8(`${manifest.join("\r\n")}\r\n`);
  return zipSync(files);
}
