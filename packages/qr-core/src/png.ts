import { zlibSync } from "fflate";
import { assertHexColor, layoutQr, type QrMatrix, type QrOptions } from "./qr.ts";
import { isStyled, renderStyledPng } from "./style.ts";

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

function assemble(width: number, height: number, bitDepth: number, colorType: number, raw: Uint8Array, palette?: Uint8Array) {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header.set([bitDepth, colorType, 0, 0, 0], 8);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...(palette ? [chunk("PLTE", palette)] : []),
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

/** Packs rows of `channels`-byte pixels with the "Up" filter, which compresses flat artwork well. */
function filterRows(width: number, height: number, channels: number, pixels: Uint8Array): Uint8Array {
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (stride + 1);
    raw[out] = 2;
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      raw[out + 1 + i] = (pixels[row + i]! - (y ? pixels[row - stride + i]! : 0)) & 0xff;
    }
  }
  return raw;
}

/** 8-bit RGB PNG from packed RGB pixels. */
export function encodeRgbPng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  return assemble(width, height, 8, 2, filterRows(width, height, 3, rgb));
}

/** 8-bit RGBA PNG from packed RGBA pixels (straight alpha). */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  return assemble(width, height, 8, 6, filterRows(width, height, 4, rgba));
}

/** Encodes a 1-bit palette PNG without canvas, so output is identical everywhere. */
export function renderPng(matrix: QrMatrix, options: QrOptions): Uint8Array {
  if (isStyled(options)) return renderStyledPng(matrix, options);
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

  const palette = new Uint8Array([
    ...hexToRgb(assertHexColor(options.background)),
    ...hexToRgb(assertHexColor(options.foreground)),
  ]);
  return assemble(outputSize, outputSize, 1, 3, raw, palette); // 1-bit depth, palette colour
}
