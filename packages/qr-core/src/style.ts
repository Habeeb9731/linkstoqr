import { encodeRgbPng, encodeRgbaPng } from "./png.ts";
import { assertHexColor, layoutQr, type QrMatrix, type QrOptions } from "./qr.ts";

/** How each dark module is drawn. */
export type DotStyle = "square" | "rounded" | "dots";
/** How the three corner (finder) patterns are drawn. */
export type CornerStyle = "square" | "rounded" | "circle";
/** Decoration around the code. Every frame keeps the code's own quiet zone intact. */
export type FrameStyle = "none" | "border" | "label" | "banner" | "outline";

/** An image placed in the middle of the code, as straight RGBA pixels. */
export interface QrLogo {
  width: number;
  height: number;
  rgba: Uint8Array;
}

export const DOT_STYLES: readonly DotStyle[] = ["square", "rounded", "dots"];
export const CORNER_STYLES: readonly CornerStyle[] = ["square", "rounded", "circle"];
export const FRAME_STYLES: readonly FrameStyle[] = ["none", "border", "label", "banner", "outline"];
export const DEFAULT_FRAME_TEXT = "SCAN ME";
export const FRAME_TEXT_MAX = 24;
/** Logo width as a fraction of the code's width (without margin). Larger logos stop scanning reliably. */
export const LOGO_SIZE_RANGE = { min: 0.12, max: 0.26, default: 0.2 } as const;

/** True when the options need the styled renderer rather than the plain, 1-bit one. */
export function isStyled(options: QrOptions): boolean {
  return (
    (options.dots ?? "square") !== "square" ||
    (options.corners ?? "square") !== "square" ||
    (options.frame ?? "none") !== "none" ||
    !!options.logo ||
    (!!options.cornerColor && options.cornerColor.toLowerCase() !== options.foreground.toLowerCase())
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A 5 × 7 block font for frame labels. Drawing letters as rectangles keeps PNG and SVG identical, needs no font
// files, and means label text can never inject markup into the SVG.

const GLYPHS: Record<string, string> = {
  A: " ### |#   #|#   #|#####|#   #|#   #|#   #",
  B: "#### |#   #|#   #|#### |#   #|#   #|#### ",
  C: " ### |#   #|#    |#    |#    |#   #| ### ",
  D: "#### |#   #|#   #|#   #|#   #|#   #|#### ",
  E: "#####|#    |#    |#### |#    |#    |#####",
  F: "#####|#    |#    |#### |#    |#    |#    ",
  G: " ### |#   #|#    |# ###|#   #|#   #| ####",
  H: "#   #|#   #|#   #|#####|#   #|#   #|#   #",
  I: " ### |  #  |  #  |  #  |  #  |  #  | ### ",
  J: "  ###|   # |   # |   # |   # |#  # | ##  ",
  K: "#   #|#  # |# #  |##   |# #  |#  # |#   #",
  L: "#    |#    |#    |#    |#    |#    |#####",
  M: "#   #|## ##|# # #|# # #|#   #|#   #|#   #",
  N: "#   #|##  #|# # #|#  ##|#   #|#   #|#   #",
  O: " ### |#   #|#   #|#   #|#   #|#   #| ### ",
  P: "#### |#   #|#   #|#### |#    |#    |#    ",
  Q: " ### |#   #|#   #|#   #|# # #|#  # | ## #",
  R: "#### |#   #|#   #|#### |# #  |#  # |#   #",
  S: " ####|#    |#    | ### |    #|    #|#### ",
  T: "#####|  #  |  #  |  #  |  #  |  #  |  #  ",
  U: "#   #|#   #|#   #|#   #|#   #|#   #| ### ",
  V: "#   #|#   #|#   #|#   #|#   #| # # |  #  ",
  W: "#   #|#   #|#   #|# # #|# # #|# # #| # # ",
  X: "#   #|#   #| # # |  #  | # # |#   #|#   #",
  Y: "#   #|#   #| # # |  #  |  #  |  #  |  #  ",
  Z: "#####|    #|   # |  #  | #   |#    |#####",
  "0": " ### |#   #|#  ##|# # #|##  #|#   #| ### ",
  "1": "  #  | ##  |  #  |  #  |  #  |  #  | ### ",
  "2": " ### |#   #|    #|   # |  #  | #   |#####",
  "3": "#####|   # |  #  |   # |    #|#   #| ### ",
  "4": "   # |  ## | # # |#  # |#####|   # |   # ",
  "5": "#####|#    |#### |    #|    #|#   #| ### ",
  "6": "  ## | #   |#    |#### |#   #|#   #| ### ",
  "7": "#####|    #|   # |  #  | #   | #   | #   ",
  "8": " ### |#   #|#   #| ### |#   #|#   #| ### ",
  "9": " ### |#   #|#   #| ####|    #|   # | ##  ",
  " ": "     |     |     |     |     |     |     ",
  ".": "     |     |     |     |     | ##  | ##  ",
  ",": "     |     |     |     | ##  |  #  | #   ",
  "!": "  #  |  #  |  #  |  #  |  #  |     |  #  ",
  "?": " ### |#   #|    #|   # |  #  |     |  #  ",
  "-": "     |     |     | ### |     |     |     ",
  ":": "     | ##  | ##  |     | ##  | ##  |     ",
  "'": "  #  |  #  | #   |     |     |     |     ",
  "&": " ##  |#  # |# #  | #   |# # #|#  # | ## #",
  "/": "    #|    #|   # |  #  | #   |#    |#    ",
  "+": "     |  #  |  #  |#####|  #  |  #  |     ",
  "@": " ### |#   #|# ###|# # #|# ###|#    | ####",
  "#": " # # | # # |#####| # # |#####| # # | # # ",
};

/** Upper-cases the label and drops characters the font can't draw. */
export function cleanFrameText(text: string): string {
  return [...text.toUpperCase()]
    .filter((ch) => ch in GLYPHS)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FRAME_TEXT_MAX);
}

// ---------------------------------------------------------------------------------------------------------------
// Scene: everything is a (rounded) box in pixels, painted in order, plus an optional logo image on top.

type Radii = [number, number, number, number]; // top-left, top-right, bottom-right, bottom-left
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  r: Radii;
  color: string;
}
interface Scene {
  width: number;
  height: number;
  background: string;
  boxes: Box[];
  logo?: { x: number; y: number; w: number; h: number; image: QrLogo };
}

const square: Radii = [0, 0, 0, 0];
const round = (r: number): Radii => [r, r, r, r];

interface FrameGeometry {
  /** Size in modules, including the frame. */
  w: number;
  h: number;
  /** Where the code (with its margin) starts, in modules. */
  codeX: number;
  codeY: number;
  boxes: (s: number) => Box[];
  label?: { x: number; y: number; w: number; h: number; color: string };
}

function frameGeometry(frame: FrameStyle, q: number, frameColor: string, background: string): FrameGeometry {
  switch (frame) {
    case "border": {
      const t = 1.5;
      const label = 5;
      const w = q + 2 * t;
      const h = q + t + label;
      return {
        w, h, codeX: t, codeY: t,
        boxes: (s) => [
          { x: 0, y: 0, w: w * s, h: h * s, r: round(2.2 * s), color: frameColor },
          { x: t * s, y: t * s, w: q * s, h: q * s, r: round(1.2 * s), color: background },
        ],
        label: { x: 0, y: t + q, w, h: label, color: background },
      };
    }
    case "label": {
      const label = 4.5;
      return { w: q, h: q + label, codeX: 0, codeY: 0, boxes: () => [], label: { x: 0, y: q - 0.5, w: q, h: label, color: frameColor } };
    }
    case "banner": {
      const label = 5;
      return {
        w: q, h: q + label, codeX: 0, codeY: label,
        boxes: (s) => [{ x: 0, y: 0, w: q * s, h: label * s, r: round(1.6 * s), color: frameColor }],
        label: { x: 0, y: 0, w: q, h: label, color: background },
      };
    }
    case "outline": {
      const t = 0.7;
      const label = 4.5;
      const w = q + 2 * t;
      const h = q + label + 2 * t;
      return {
        w, h, codeX: t, codeY: t,
        boxes: (s) => [
          { x: 0, y: 0, w: w * s, h: h * s, r: round(2.6 * s), color: frameColor },
          { x: t * s, y: t * s, w: (w - 2 * t) * s, h: (h - 2 * t) * s, r: round(1.9 * s), color: background },
        ],
        label: { x: t, y: t + q - 0.5, w: q, h: label, color: frameColor },
      };
    }
    default:
      return { w: q, h: q, codeX: 0, codeY: 0, boxes: () => [] };
  }
}

function textBoxes(text: string, area: { x: number; y: number; w: number; h: number }, color: string): Box[] {
  if (!text) return [];
  const columns = text.length * 6 - 1;
  const unit = Math.min((area.h * 0.5) / 7, (area.w * 0.86) / columns);
  const left = area.x + (area.w - columns * unit) / 2;
  const top = area.y + (area.h - 7 * unit) / 2;
  const boxes: Box[] = [];
  [...text].forEach((ch, index) => {
    const rows = GLYPHS[ch]!.split("|");
    rows.forEach((row, y) => {
      let x = 0;
      while (x < 5) {
        if (row[x] !== "#") {
          x++;
          continue;
        }
        const start = x;
        while (x < 5 && row[x] === "#") x++;
        // Each stroke is grown by 0.3 units so the letters read as bold.
        const bold = 0.15 * unit;
        boxes.push({
          x: left + (index * 6 + start) * unit - bold, y: top + y * unit - bold,
          w: (x - start) * unit + 2 * bold, h: unit + 2 * bold, r: square, color,
        });
      }
    });
  });
  return boxes;
}

/** Centres of the alignment patterns, as in the QR specification (none for version 1). */
function alignmentCentres(matrix: QrMatrix): [number, number][] {
  const { version, size } = matrix;
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  const centres: [number, number][] = [];
  for (const y of positions) {
    for (const x of positions) {
      const overlapsFinder = (x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6);
      if (!overlapsFinder) centres.push([x, y]);
    }
  }
  return centres;
}

/** Final image width and height for these options (frames make the image taller than it is wide). */
export function codeDimensions(matrix: QrMatrix, options: QrOptions): { width: number; height: number } {
  if (!isStyled(options)) {
    const { outputSize } = layoutQr(matrix, options);
    return { width: outputSize, height: outputSize };
  }
  const { width, height } = buildScene(matrix, options);
  return { width, height };
}

function clampLogoSize(value: number | undefined): number {
  const size = value ?? LOGO_SIZE_RANGE.default;
  return Math.min(LOGO_SIZE_RANGE.max, Math.max(LOGO_SIZE_RANGE.min, Number.isFinite(size) ? size : LOGO_SIZE_RANGE.default));
}

function checkLogo(logo: QrLogo): QrLogo {
  const { width, height, rgba } = logo;
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 2048 && height <= 2048)) {
    throw new Error("Invalid logo size");
  }
  if (rgba.length !== width * height * 4) throw new Error("Invalid logo pixels");
  return logo;
}

function buildScene(matrix: QrMatrix, options: QrOptions): Scene {
  const foreground = assertHexColor(options.foreground);
  const background = assertHexColor(options.background);
  const cornerColor = assertHexColor(options.cornerColor || options.foreground);
  const frameColor = assertHexColor(options.frameColor || options.foreground);
  const frame = FRAME_STYLES.includes(options.frame ?? "none") ? (options.frame ?? "none") : "none";
  const dots = DOT_STYLES.includes(options.dots ?? "square") ? (options.dots ?? "square") : "square";
  const corners = CORNER_STYLES.includes(options.corners ?? "square") ? (options.corners ?? "square") : "square";
  const text = cleanFrameText(options.frameText ?? DEFAULT_FRAME_TEXT);
  const logo = options.logo ? checkLogo(options.logo) : undefined;

  const n = matrix.size;
  const margin = options.margin;
  const geometry = frameGeometry(frame, n + margin * 2, frameColor, background);

  // Whole pixels per module keep module edges on pixel boundaries, so they stay sharp.
  const s = Math.max(1, Math.floor(options.size / geometry.w));
  const contentW = Math.round(geometry.w * s);
  const contentH = Math.round(geometry.h * s);
  const width = Math.max(options.size, contentW);
  const pad = Math.floor((width - contentW) / 2);
  const height = contentH + (width - contentW);
  const codeLeft = pad + Math.round(geometry.codeX * s) + margin * s;
  const codeTop = pad + Math.round(geometry.codeY * s) + margin * s;

  const boxes: Box[] = geometry.boxes(s).map((box) => ({ ...box, x: box.x + pad, y: box.y + pad }));
  if (geometry.label) {
    const l = geometry.label;
    boxes.push(...textBoxes(text, { x: pad + l.x * s, y: pad + l.y * s, w: l.w * s, h: l.h * s }, l.color));
  }

  // Modules hidden under the logo, centred on whole modules (n is always odd, so the logo span is odd too).
  let logoStart = -1;
  let logoSpan = 0;
  if (logo) {
    logoSpan = Math.max(3, Math.round(clampLogoSize(options.logoSize) * n));
    if ((n - logoSpan) % 2) logoSpan += 1;
    logoStart = (n - logoSpan) / 2;
  }
  const inLogo = (x: number, y: number) =>
    logoSpan > 0 && x >= logoStart && x < logoStart + logoSpan && y >= logoStart && y < logoStart + logoSpan;
  const inFinder = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  // Alignment patterns are drawn whole, like small corners: readers look for them as solid rings, which separate
  // dots break up. Ones under the logo stay hidden.
  const alignments = alignmentCentres(matrix).filter(([x, y]) => !inLogo(x, y));
  const inAlignment = (x: number, y: number) => alignments.some(([ax, ay]) => Math.abs(x - ax) <= 2 && Math.abs(y - ay) <= 2);
  const dark = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < n && y < n && !!matrix.modules[y * n + x] && !inFinder(x, y) && !inLogo(x, y) &&
    !(dots !== "square" && inAlignment(x, y));

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!dark(x, y)) continue;
      const px = codeLeft + x * s;
      const py = codeTop + y * s;
      if (dots === "dots") {
        const inset = s * 0.06;
        boxes.push({ x: px + inset, y: py + inset, w: s - 2 * inset, h: s - 2 * inset, r: round((s - 2 * inset) / 2), color: foreground });
      } else if (dots === "rounded") {
        const r = s / 2;
        const up = dark(x, y - 1);
        const down = dark(x, y + 1);
        const left = dark(x - 1, y);
        const right = dark(x + 1, y);
        boxes.push({
          x: px, y: py, w: s, h: s, color: foreground,
          r: [!up && !left ? r : 0, !up && !right ? r : 0, !down && !right ? r : 0, !down && !left ? r : 0],
        });
      } else {
        boxes.push({ x: px, y: py, w: s, h: s, r: square, color: foreground });
      }
    }
  }

  for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    const x = codeLeft + fx * s;
    const y = codeTop + fy * s;
    const radii =
      corners === "circle" ? [3.5, 2.5, 1.5] : corners === "rounded" ? [2.2, 1.5, 1] : [0, 0, 0];
    boxes.push({ x, y, w: 7 * s, h: 7 * s, r: round(radii[0]! * s), color: cornerColor });
    boxes.push({ x: x + s, y: y + s, w: 5 * s, h: 5 * s, r: round(radii[1]! * s), color: background });
    boxes.push({ x: x + 2 * s, y: y + 2 * s, w: 3 * s, h: 3 * s, r: round(radii[2]! * s), color: cornerColor });
  }

  if (dots !== "square") {
    const radii = corners === "circle" ? [2.5, 1.5, 0.5] : corners === "rounded" ? [1.4, 0.8, 0.5] : [0, 0, 0];
    for (const [ax, ay] of alignments) {
      const x = codeLeft + (ax - 2) * s;
      const y = codeTop + (ay - 2) * s;
      boxes.push({ x, y, w: 5 * s, h: 5 * s, r: round(radii[0]! * s), color: foreground });
      boxes.push({ x: x + s, y: y + s, w: 3 * s, h: 3 * s, r: round(radii[1]! * s), color: background });
      boxes.push({ x: x + 2 * s, y: y + 2 * s, w: s, h: s, r: round(radii[2]! * s), color: foreground });
    }
  }

  const scene: Scene = { width, height, background, boxes };
  if (logo) {
    const x = codeLeft + logoStart * s;
    const y = codeTop + logoStart * s;
    const size = logoSpan * s;
    boxes.push({ x, y, w: size, h: size, r: round(Math.min(size * 0.18, 2 * s)), color: background });
    // Fit the image inside the cleared square with a little breathing room, keeping its proportions.
    const room = size - 2 * Math.min(s * 0.6, size * 0.08);
    const k = Math.min(room / logo.width, room / logo.height);
    const w = logo.width * k;
    const h = logo.height * k;
    scene.logo = { x: x + (size - w) / 2, y: y + (size - h) / 2, w, h, image: logo };
  }
  return scene;
}

// ---------------------------------------------------------------------------------------------------------------
// SVG output

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

function boxPath({ x, y, w, h, r }: Box): string {
  const limit = Math.min(w, h) / 2;
  const [tl, tr, br, bl] = r.map((v) => Math.min(v, limit)) as Radii;
  if (!tl && !tr && !br && !bl) return `M${fmt(x)} ${fmt(y)}h${fmt(w)}v${fmt(h)}h${fmt(-w)}z`;
  const arc = (rr: number, dx: number, dy: number) => (rr ? `a${fmt(rr)} ${fmt(rr)} 0 0 1 ${fmt(dx)} ${fmt(dy)}` : "");
  return (
    `M${fmt(x + tl)} ${fmt(y)}h${fmt(w - tl - tr)}${arc(tr, tr, tr)}v${fmt(h - tr - br)}${arc(br, -br, br)}` +
    `h${fmt(-(w - br - bl))}${arc(bl, -bl, -bl)}v${fmt(-(h - bl - tl))}${arc(tl, tl, -tl)}z`
  );
}

const logoDataUrls = new WeakMap<QrLogo, string>();

function logoDataUrl(logo: QrLogo): string {
  let url = logoDataUrls.get(logo);
  if (!url) {
    const png = encodeRgbaPng(logo.width, logo.height, logo.rgba);
    let binary = "";
    for (let i = 0; i < png.length; i += 0x8000) binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
    url = `data:image/png;base64,${btoa(binary)}`;
    logoDataUrls.set(logo, url);
  }
  return url;
}

export function renderStyledSvg(matrix: QrMatrix, options: QrOptions): string {
  const scene = buildScene(matrix, options);
  const parts: string[] = [];
  let color = "";
  let path = "";
  const flush = () => {
    if (path) parts.push(`<path fill="${color}" d="${path}"/>`);
    path = "";
  };
  for (const box of scene.boxes) {
    if (box.color !== color) {
      flush();
      color = box.color;
    }
    path += boxPath(box);
  }
  flush();
  if (scene.logo) {
    const { x, y, w, h, image } = scene.logo;
    parts.push(
      `<image href="${logoDataUrl(image)}" x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" preserveAspectRatio="none"/>`,
    );
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height}" ` +
    `viewBox="0 0 ${scene.width} ${scene.height}">` +
    `<rect width="100%" height="100%" fill="${scene.background}"/>${parts.join("")}</svg>`
  );
}

// ---------------------------------------------------------------------------------------------------------------
// PNG output: a small anti-aliased rasteriser, so the PNG matches the SVG without needing a canvas.

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function fillBox(pixels: Uint8Array, width: number, height: number, box: Box) {
  const [cr, cg, cb] = rgb(box.color);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(width, Math.ceil(box.x + box.w));
  const y1 = Math.min(height, Math.ceil(box.y + box.h));
  const limit = Math.min(box.w, box.h) / 2;
  const radii = box.r.map((v) => Math.min(v, limit)) as Radii;
  const aligned =
    !radii[0] && !radii[1] && !radii[2] && !radii[3] &&
    Number.isInteger(box.x) && Number.isInteger(box.y) && Number.isInteger(box.w) && Number.isInteger(box.h);
  const hw = box.w / 2;
  const hh = box.h / 2;
  const cx = box.x + hw;
  const cy = box.y + hh;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      let alpha = 1;
      if (!aligned) {
        // Signed distance from the pixel centre to the rounded box; one pixel of anti-aliasing.
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        const rr = dx > 0 ? (dy > 0 ? radii[2] : radii[1]) : dy > 0 ? radii[3] : radii[0];
        const qx = Math.abs(dx) - hw + rr;
        const qy = Math.abs(dy) - hh + rr;
        const distance = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - rr;
        alpha = Math.min(1, Math.max(0, 0.5 - distance));
        if (alpha <= 0) continue;
      }
      const i = (py * width + px) * 3;
      pixels[i] = Math.round(pixels[i]! + (cr - pixels[i]!) * alpha);
      pixels[i + 1] = Math.round(pixels[i + 1]! + (cg - pixels[i + 1]!) * alpha);
      pixels[i + 2] = Math.round(pixels[i + 2]! + (cb - pixels[i + 2]!) * alpha);
    }
  }
}

function drawLogo(pixels: Uint8Array, width: number, height: number, logo: NonNullable<Scene["logo"]>) {
  const { image } = logo;
  const x0 = Math.max(0, Math.floor(logo.x));
  const y0 = Math.max(0, Math.floor(logo.y));
  const x1 = Math.min(width, Math.ceil(logo.x + logo.w));
  const y1 = Math.min(height, Math.ceil(logo.y + logo.h));
  const sample = (sx: number, sy: number, channel: number) => {
    const x = Math.min(image.width - 1, Math.max(0, sx));
    const y = Math.min(image.height - 1, Math.max(0, sy));
    return image.rgba[(y * image.width + x) * 4 + channel]!;
  };
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Bilinear sampling in the logo's own pixel grid.
      const u = ((px + 0.5 - logo.x) / logo.w) * image.width - 0.5;
      const v = ((py + 0.5 - logo.y) / logo.h) * image.height - 0.5;
      if (u < -0.5 || v < -0.5 || u > image.width - 0.5 || v > image.height - 0.5) continue;
      const ix = Math.floor(u);
      const iy = Math.floor(v);
      const fx = u - ix;
      const fy = v - iy;
      const mix = (channel: number) =>
        (sample(ix, iy, channel) * (1 - fx) + sample(ix + 1, iy, channel) * fx) * (1 - fy) +
        (sample(ix, iy + 1, channel) * (1 - fx) + sample(ix + 1, iy + 1, channel) * fx) * fy;
      const alpha = mix(3) / 255;
      if (alpha <= 0) continue;
      const i = (py * width + px) * 3;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(pixels[i + c]! + (mix(c) - pixels[i + c]!) * alpha);
    }
  }
}

export function renderStyledPng(matrix: QrMatrix, options: QrOptions): Uint8Array {
  const scene = buildScene(matrix, options);
  const { width, height } = scene;
  const pixels = new Uint8Array(width * height * 3);
  const [br, bg, bb] = rgb(scene.background);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = br;
    pixels[i + 1] = bg;
    pixels[i + 2] = bb;
  }
  for (const box of scene.boxes) fillBox(pixels, width, height, box);
  if (scene.logo) drawLogo(pixels, width, height, scene.logo);
  return encodeRgbPng(width, height, pixels);
}
