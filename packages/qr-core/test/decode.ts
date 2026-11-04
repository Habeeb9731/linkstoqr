import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

const require = createRequire(import.meta.url);
let ready: Promise<void> | undefined;

/** Loads both WebAssembly decoders from disk, never from a CDN. */
export function prepareDecoders(): Promise<void> {
  ready ??= (async () => {
    const zxingWasm = readFileSync(require.resolve("zxing-wasm/reader/zxing_reader.wasm"));
    prepareZXingModule({
      overrides: { wasmBinary: zxingWasm.buffer.slice(zxingWasm.byteOffset, zxingWasm.byteOffset + zxingWasm.byteLength) as ArrayBuffer },
      fireImmediately: true,
    });
    await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
  })();
  return ready;
}

/** Decodes with jsQR, working only from the PNG's actual pixels. */
export function decodeWithJsQr(png: Uint8Array): string | null {
  const image = PNG.sync.read(Buffer.from(png));
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
}

/** Decodes with ZXing, an independent implementation that reads the PNG file itself. */
export async function decodeWithZxing(png: Uint8Array): Promise<string | null> {
  const results = await readBarcodes(png, { formats: ["QRCode"], tryInvert: true });
  return results[0]?.text ?? null;
}

/** Rasterizes SVG with resvg, a real renderer, so the SVG path is really tested. */
export function svgToPng(svg: string | Uint8Array): Uint8Array {
  return new Resvg(svg).render().asPng();
}

/** Adds a white surround, as a code with no margin would have on a white page. */
export function padWithWhite(png: Uint8Array, padding: number): Uint8Array {
  const source = PNG.sync.read(Buffer.from(png));
  const target = new PNG({ width: source.width + padding * 2, height: source.height + padding * 2 });
  target.data.fill(255);
  PNG.bitblt(source, target, 0, 0, source.width, source.height, padding, padding);
  return PNG.sync.write(target);
}
