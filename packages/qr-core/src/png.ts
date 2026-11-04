import { zlibSync } from "fflate";
import { assertHexColor, layoutQr, type QrMatrix, type QrOptions } from "./qr.ts";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** Encodes a 1-bit palette PNG without canvas, so output is identical everywhere. */
export function renderPng(matrix: QrMatrix, options: QrOptions): Uint8Array {
  const { outputSize, scale, offset } = layoutQr(matrix, options);
  const rowBytes = 1 + Math.ceil(outputSize / 8);
  const raw = new Uint8Array(rowBytes * outputSize);

  for (let moduleY = 0; moduleY < matrix.size; moduleY++) {
    const firstRow = offset + moduleY * scale;
    const rowStart = firstRow * rowBytes;
    for (let moduleX = 0; moduleX < matrix.size; moduleX++) {
      if (!matrix.modules[moduleY * matrix.size + moduleX]) continue;
      const firstPixel = offset + moduleX * scale;
      for (let pixel = firstPixel; pixel < firstPixel + scale; pixel++) {
        raw[rowStart + 1 + (pixel >> 3)]! |= 0x80 >> (pixel & 7);
      }
    }
    for (let copy = 1; copy < scale; copy++) {
      raw.copyWithin(rowStart + copy * rowBytes, rowStart, rowStart + rowBytes);
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, outputSize);
  headerView.setUint32(4, outputSize);
  header.set([1, 3, 0, 0, 0], 8); // 1-bit depth, palette colour

  const palette = new Uint8Array([
    ...hexToRgb(assertHexColor(options.background)),
    ...hexToRgb(assertHexColor(options.foreground)),
  ]);

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("IDAT", zlibSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let position = 0;
  for (const part of parts) {
    png.set(part, position);
    position += part.length;
  }
  return png;
}
