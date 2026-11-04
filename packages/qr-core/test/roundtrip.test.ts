import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildZip,
  DEFAULT_OPTIONS,
  encodeQr,
  layoutQr,
  QrTooLongError,
  renderPng,
  renderSvg,
  type Ecc,
  type QrOptions,
} from "../src/index.ts";
import { decodeWithJsQr, decodeWithZxing, padWithWhite, prepareDecoders, svgToPng } from "./decode.ts";

beforeAll(prepareDecoders);

const LINKS = {
  short: "https://a.co",
  uppercaseShortLink: "HTTPS://GO.EXAMPLE.COM/ABC123",
  query: "https://example.com/path/to/page?utm_source=print&q=a%20b&x=1#section-2",
  long: `https://example.com/${"segment/".repeat(60)}end`,
  mailto: "mailto:hello@example.com?subject=Hi%20there",
  tel: "tel:+4930123456",
};
const ECC_LEVELS: Ecc[] = ["L", "M", "Q", "H"];

async function expectDecodes(text: string, options: QrOptions, padding = 0) {
  const matrix = encodeQr(text, options.ecc);
  let png = renderPng(matrix, options);
  let svgPng = svgToPng(renderSvg(matrix, options));
  if (padding) {
    png = padWithWhite(png, padding);
    svgPng = padWithWhite(svgPng, padding);
  }
  expect(decodeWithJsQr(png), "jsQR on PNG").toBe(text);
  expect(await decodeWithZxing(png), "ZXing on PNG").toBe(text);
  expect(decodeWithJsQr(svgPng), "jsQR on SVG").toBe(text);
  expect(await decodeWithZxing(svgPng), "ZXing on SVG").toBe(text);
}

describe("generated codes decode with two independent decoders", () => {
  for (const [name, text] of Object.entries(LINKS)) {
    for (const ecc of ECC_LEVELS) {
      it(`${name} at error correction ${ecc}`, async () => {
        await expectDecodes(text, { ...DEFAULT_OPTIONS, ecc });
      });
    }
  }

  for (const size of [128, 256, 512, 1024, 2048]) {
    it(`size ${size}px`, async () => {
      await expectDecodes(LINKS.query, { ...DEFAULT_OPTIONS, size });
    });
  }

  for (const margin of [1, 2, 4, 8, 16]) {
    it(`margin ${margin}`, async () => {
      await expectDecodes(LINKS.query, { ...DEFAULT_OPTIONS, margin });
    });
  }

  it("margin 0 on a white page", async () => {
    await expectDecodes(LINKS.query, { ...DEFAULT_OPTIONS, margin: 0 }, 40);
  });

  const COLOURS: [string, string][] = [
    ["#000000", "#ffffff"],
    ["#0b2545", "#fff8e7"],
    ["#7a1f3d", "#f4f1de"],
    ["#14532d", "#ecfdf5"],
  ];
  for (const [foreground, background] of COLOURS) {
    it(`colours ${foreground} on ${background}`, async () => {
      await expectDecodes(LINKS.query, { ...DEFAULT_OPTIONS, foreground, background });
    });
  }

  it("light code on a dark background", async () => {
    await expectDecodes(LINKS.query, { ...DEFAULT_OPTIONS, foreground: "#ffffff", background: "#111111" });
  });

  it("the largest link that fits at each error correction level", async () => {
    const capacity: Record<Ecc, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };
    for (const ecc of ECC_LEVELS) {
      const prefix = "https://example.com/";
      const text = prefix + "a".repeat(capacity[ecc] - prefix.length);
      await expectDecodes(text, { ...DEFAULT_OPTIONS, ecc, size: 2048 });
      expect(() => encodeQr(`${text}a`, ecc)).toThrow(QrTooLongError);
    }
  });
});

describe("the decoders can actually fail (negative control)", () => {
  it("reports nothing for a code with its finder patterns wiped", async () => {
    const matrix = encodeQr(LINKS.query, "H");
    matrix.modules.fill(0, 0, matrix.size * 8);
    const png = renderPng(matrix, DEFAULT_OPTIONS);
    expect(decodeWithJsQr(png)).toBeNull();
    expect(await decodeWithZxing(png)).toBeNull();
  });
});

describe("output format", () => {
  it("honours the requested image size", () => {
    const matrix = encodeQr(LINKS.short, "M");
    expect(layoutQr(matrix, { size: 1000, margin: 4 }).outputSize).toBe(1000);
  });

  it("grows rather than producing unreadable pixels when the size is too small", () => {
    const matrix = encodeQr(LINKS.long, "H");
    const layout = layoutQr(matrix, { size: 64, margin: 4 });
    expect(layout.scale).toBe(1);
    expect(layout.outputSize).toBe(matrix.size + 8);
  });

  it("is deterministic", () => {
    const matrix = encodeQr(LINKS.query, "Q");
    expect(renderPng(matrix, DEFAULT_OPTIONS)).toEqual(renderPng(matrix, DEFAULT_OPTIONS));
  });

  it("uses QR alphanumeric mode for uppercase links, which makes codes smaller", () => {
    expect(encodeQr(LINKS.uppercaseShortLink, "H").version).toBeLessThan(
      encodeQr(LINKS.uppercaseShortLink.toLowerCase(), "H").version,
    );
  });

  it("rejects colours that could inject markup into the SVG", () => {
    const matrix = encodeQr(LINKS.short, "M");
    expect(() => renderSvg(matrix, { ...DEFAULT_OPTIONS, foreground: '"/><script>' })).toThrow();
  });
});

describe("ZIP downloads", () => {
  const values = [LINKS.short, LINKS.query, LINKS.short];

  for (const format of ["png", "svg"] as const) {
    it(`every ${format.toUpperCase()} in the ZIP decodes to the link listed for it`, async () => {
      const files = unzipSync(buildZip(values, DEFAULT_OPTIONS, format));
      const manifest = strFromU8(files["links.csv"]!).trim().split("\r\n").slice(1);
      expect(manifest).toHaveLength(values.length);
      for (const [index, row] of manifest.entries()) {
        const [file, link] = row.slice(1, -1).split('","') as [string, string];
        expect(link).toBe(values[index]);
        const bytes = files[file]!;
        const png = format === "png" ? bytes : svgToPng(bytes);
        expect(decodeWithJsQr(png)).toBe(link);
        expect(await decodeWithZxing(png)).toBe(link);
      }
    });
  }

  it("keeps duplicate links as separate files", () => {
    const names = Object.keys(unzipSync(buildZip(values, DEFAULT_OPTIONS, "png")));
    expect(new Set(names).size).toBe(values.length + 1);
  });

  it("escapes quotes in the CSV", () => {
    const files = unzipSync(buildZip(['https://example.com/?q="x"'], DEFAULT_OPTIONS, "png"));
    expect(strFromU8(files["links.csv"]!)).toContain('"https://example.com/?q=""x"""');
  });
});
