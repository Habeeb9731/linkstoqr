import qrcodegen from "./vendor/qrcodegen.ts";

export type Ecc = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /** Requested image width and height in pixels. */
  size: number;
  /** Quiet zone around the code, in modules. */
  margin: number;
  foreground: string;
  background: string;
  ecc: Ecc;
}

export const DEFAULT_OPTIONS: QrOptions = {
  size: 1024,
  margin: 4,
  foreground: "#000000",
  background: "#ffffff",
  ecc: "M",
};

export const SIZE_RANGE = { min: 64, max: 4096 } as const;
export const MARGIN_RANGE = { min: 0, max: 16 } as const;

export interface QrMatrix {
  /** Modules per side, excluding the margin. */
  size: number;
  version: number;
  modules: Uint8Array;
}

export class QrTooLongError extends Error {
  constructor() {
    super("Too long to fit in a QR code at this error correction level");
    this.name = "QrTooLongError";
  }
}

const ECC = {
  L: qrcodegen.QrCode.Ecc.LOW,
  M: qrcodegen.QrCode.Ecc.MEDIUM,
  Q: qrcodegen.QrCode.Ecc.QUARTILE,
  H: qrcodegen.QrCode.Ecc.HIGH,
} as const;

export function encodeQr(text: string, ecc: Ecc): QrMatrix {
  let code: qrcodegen.QrCode;
  try {
    const segments = qrcodegen.QrSegment.makeSegments(text);
    code = qrcodegen.QrCode.encodeSegments(segments, ECC[ecc], 1, 40, -1, false);
  } catch (error) {
    if (error instanceof RangeError) throw new QrTooLongError();
    throw error;
  }
  const modules = new Uint8Array(code.size * code.size);
  for (let y = 0; y < code.size; y++) {
    for (let x = 0; x < code.size; x++) {
      modules[y * code.size + x] = code.getModule(x, y) ? 1 : 0;
    }
  }
  return { size: code.size, version: code.version, modules };
}

export interface QrLayout {
  /** Final image width and height. Larger than requested if the code needs it. */
  outputSize: number;
  /** Pixels per module. Always a whole number, so edges stay sharp. */
  scale: number;
  /** Pixels between the image edge and the first module. */
  offset: number;
}

export function layoutQr(matrix: QrMatrix, options: Pick<QrOptions, "size" | "margin">): QrLayout {
  const total = matrix.size + options.margin * 2;
  const scale = Math.max(1, Math.floor(options.size / total));
  const outputSize = Math.max(options.size, total * scale);
  const offset = Math.floor((outputSize - matrix.size * scale) / 2);
  return { outputSize, scale, offset };
}

export function renderSvg(matrix: QrMatrix, options: QrOptions): string {
  const { outputSize, scale, offset } = layoutQr(matrix, options);
  const foreground = assertHexColor(options.foreground);
  const background = assertHexColor(options.background);
  const path: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.modules[y * matrix.size + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && matrix.modules[y * matrix.size + x]) x++;
      path.push(`M${offset + start * scale} ${offset + y * scale}h${(x - start) * scale}v${scale}h-${(x - start) * scale}z`);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${outputSize}" height="${outputSize}" ` +
    `viewBox="0 0 ${outputSize} ${outputSize}" shape-rendering="crispEdges">` +
    `<rect width="100%" height="100%" fill="${background}"/>` +
    `<path fill="${foreground}" d="${path.join("")}"/></svg>`
  );
}

export function assertHexColor(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Invalid colour: ${color}`);
  return color.toLowerCase();
}

function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Advice only: these never block generation. */
export function designWarnings(options: QrOptions): string[] {
  const warnings: string[] = [];
  const foreground = assertHexColor(options.foreground);
  const background = assertHexColor(options.background);
  if (contrastRatio(foreground, background) < 4) {
    warnings.push("Low colour contrast. Many phones may not be able to scan this.");
  }
  if (luminance(foreground) > luminance(background)) {
    warnings.push("Light codes on a dark background don't scan on every phone. Test before printing.");
  }
  if (options.margin < 4) {
    warnings.push("Margins under 4 can fail unless the code sits on a plain, light area.");
  }
  return warnings;
}
