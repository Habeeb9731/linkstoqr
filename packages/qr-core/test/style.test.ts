import { strFromU8, unzipSync } from "fflate";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildZip,
  cleanFrameText,
  codeDimensions,
  CORNER_STYLES,
  DEFAULT_OPTIONS,
  designWarnings,
  DOT_STYLES,
  encodeQr,
  FRAME_STYLES,
  isStyled,
  LOGO_SIZE_RANGE,
  renderPng,
  renderSvg,
  type Ecc,
  type QrLogo,
  type QrOptions,
} from "../src/index.ts";
import { decodeWithJsQr, decodeWithZxing, prepareDecoders, svgToPng } from "./decode.ts";

beforeAll(prepareDecoders);

const LINK = "https://example.com/path/to/page?utm_source=print&q=a%20b&x=1#section-2";
const LONG = `https://example.com/${"segment/".repeat(25)}end`;

/** A busy logo: an orange disc with a dark ring and transparent corners, the worst case for scanning. */
function sampleLogo(size = 96): QrLogo {
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const i = (y * size + x) * 4;
      if (d > 1) continue;
      const ring = d > 0.8;
      rgba.set(ring ? [23, 24, 26, 255] : [232, 67, 26, 255], i);
    }
  }
  return { width: size, height: size, rgba };
}

async function expectDecodes(text: string, options: QrOptions) {
  const matrix = encodeQr(text, options.ecc);
  const png = renderPng(matrix, options);
  const svgPng = svgToPng(renderSvg(matrix, options));
  expect(decodeWithJsQr(png), "jsQR on PNG").toBe(text);
  expect(await decodeWithZxing(png), "ZXing on PNG").toBe(text);
  expect(decodeWithJsQr(svgPng), "jsQR on SVG").toBe(text);
  expect(await decodeWithZxing(svgPng), "ZXing on SVG").toBe(text);
}

describe("styled codes still decode with two independent decoders", () => {
  for (const dots of DOT_STYLES) {
    for (const corners of CORNER_STYLES) {
      it(`${dots} dots with ${corners} corners`, async () => {
        await expectDecodes(LINK, { ...DEFAULT_OPTIONS, dots, corners });
      });
    }
  }

  for (const dots of ["rounded", "dots"] as const) {
    it(`${dots} dots at every error correction level and size`, async () => {
      for (const ecc of ["L", "M", "Q", "H"] as Ecc[]) {
        for (const size of [256, 512, 1024]) {
          await expectDecodes(LONG, { ...DEFAULT_OPTIONS, dots, ecc, size });
        }
      }
    }, 60_000);
  }

  it("coloured corners", async () => {
    await expectDecodes(LINK, { ...DEFAULT_OPTIONS, corners: "rounded", cornerColor: "#c2381a" });
  });

  for (const frame of FRAME_STYLES) {
    it(`${frame} frame with a label`, async () => {
      await expectDecodes(LINK, { ...DEFAULT_OPTIONS, frame, frameText: "Scan me!", frameColor: "#17181a" });
    });
  }

  for (const ecc of ["Q", "H"] as Ecc[]) {
    for (const [name, text] of [["short", "https://a.co"], ["medium", LINK], ["long", LONG]] as const) {
      it(`largest logo on a ${name} link at error correction ${ecc}`, async () => {
        await expectDecodes(text, { ...DEFAULT_OPTIONS, ecc, logo: sampleLogo(), logoSize: LOGO_SIZE_RANGE.max });
      });
    }
  }

  it("everything at once, at a small size", async () => {
    await expectDecodes(LINK, {
      ...DEFAULT_OPTIONS,
      size: 320,
      ecc: "H",
      dots: "dots",
      corners: "circle",
      cornerColor: "#c2381a",
      frame: "border",
      frameText: "Menu",
      logo: sampleLogo(40),
    });
  });

  it("every code in a styled ZIP decodes", async () => {
    const options: QrOptions = { ...DEFAULT_OPTIONS, ecc: "H", dots: "rounded", frame: "banner", logo: sampleLogo() };
    const values = ["https://a.co", LINK];
    const files = unzipSync(buildZip(values.map((value) => ({ value, label: value })), options, "png"));
    const rows = strFromU8(files["links.csv"]!).trim().split("\r\n").slice(1);
    for (const [index, row] of rows.entries()) {
      const file = row.slice(1).split('","')[0]!;
      expect(decodeWithJsQr(files[file]!)).toBe(values[index]);
    }
  });
});

describe("styled output", () => {
  it("leaves the plain renderer untouched when nothing is styled", () => {
    const plain = { ...DEFAULT_OPTIONS, dots: "square", corners: "square", frame: "none", logo: null } as const;
    expect(isStyled(plain)).toBe(false);
    const matrix = encodeQr(LINK, "M");
    expect(renderPng(matrix, plain)).toEqual(renderPng(matrix, DEFAULT_OPTIONS));
  });

  it("frames with a label make the image taller, at the requested width", () => {
    const matrix = encodeQr(LINK, "M");
    for (const frame of ["border", "label", "banner", "outline"] as const) {
      const { width, height } = codeDimensions(matrix, { ...DEFAULT_OPTIONS, size: 600, frame });
      expect(width, frame).toBe(600);
      expect(height, frame).toBeGreaterThan(width);
      const png = PNG.sync.read(Buffer.from(renderPng(matrix, { ...DEFAULT_OPTIONS, size: 600, frame })));
      expect([png.width, png.height], frame).toEqual([width, height]);
      expect(renderSvg(matrix, { ...DEFAULT_OPTIONS, size: 600, frame })).toContain(`width="600" height="${height}"`);
    }
  });

  it("draws the label as shapes, so text can't inject markup", () => {
    const matrix = encodeQr(LINK, "M");
    const svg = renderSvg(matrix, { ...DEFAULT_OPTIONS, frame: "label", frameText: '"/><script>alert(1)</script>' });
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("<text");
    expect(cleanFrameText('"/><script>alert(1)</script>')).toBe("/SCRIPTALERT1/SCRIPT");
    expect(cleanFrameText("  scan   me, please!  ")).toBe("SCAN ME, PLEASE!");
  });

  it("rejects colours and logos that could break the output", () => {
    const matrix = encodeQr(LINK, "M");
    expect(() => renderSvg(matrix, { ...DEFAULT_OPTIONS, frame: "border", frameColor: '"/><script>' })).toThrow();
    expect(() => renderSvg(matrix, { ...DEFAULT_OPTIONS, cornerColor: "red" })).toThrow();
    expect(() => renderPng(matrix, { ...DEFAULT_OPTIONS, logo: { width: 4, height: 4, rgba: new Uint8Array(3) } })).toThrow();
  });

  it("embeds the logo in the SVG as a PNG data URL", () => {
    const svg = renderSvg(encodeQr(LINK, "H"), { ...DEFAULT_OPTIONS, ecc: "H", logo: sampleLogo() });
    expect(svg).toMatch(/<image href="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  });

  it("is deterministic", () => {
    const options: QrOptions = { ...DEFAULT_OPTIONS, dots: "dots", corners: "rounded", frame: "outline", logo: sampleLogo() };
    const matrix = encodeQr(LINK, "H");
    expect(renderPng(matrix, options)).toEqual(renderPng(matrix, options));
  });

  it("warns when a logo is used with low error correction", () => {
    expect(designWarnings({ ...DEFAULT_OPTIONS, ecc: "M", logo: sampleLogo() }).join(" ")).toContain("logo");
    expect(designWarnings({ ...DEFAULT_OPTIONS, ecc: "H", logo: sampleLogo() }).join(" ")).not.toContain("logo");
  });
});
