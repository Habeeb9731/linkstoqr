export interface LinkLine {
  /** 1-based line number in the pasted text. */
  line: number;
  input: string;
  /** The exact text to encode. Absent when the line is invalid. */
  value?: string;
  error?: string;
}

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms", "geo"]);
const BARE_DOMAIN = /^[^\s/:@?#]+\.[^\s/:@?#]+(:\d+)?([/?#]|$)/u;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const NON_ASCII = /[^\x00-\x7f]/;

export function normalizeLink(input: string): { value: string } | { error: string } {
  if (/\s/.test(input)) return { error: "Links can't contain spaces" };

  let text = input;
  if (BARE_DOMAIN.test(text)) {
    text = `https://${text}`;
  }

  const scheme = SCHEME.exec(text)?.[1]?.toLowerCase();
  if (!scheme) return { error: "This doesn't look like a link" };
  if (!ALLOWED_SCHEMES.has(scheme)) {
    return { error: `Links starting with "${scheme}:" aren't supported` };
  }

  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { error: "This doesn't look like a valid link" };
  }
  if ((scheme === "http" || scheme === "https") && !parsed.hostname) {
    return { error: "This link has no domain" };
  }

  // Scanners disagree about non-ASCII text, so use the equivalent ASCII form.
  return { value: NON_ASCII.test(text) ? parsed.href : text };
}

export function parseLinks(text: string): LinkLine[] {
  const result: LinkLine[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const input = raw.trim();
    if (!input) return;
    result.push({ line: index + 1, input, ...normalizeLink(input) });
  });
  return result;
}

/** Builds a safe, unique-by-position file name without an extension. */
export function fileBaseName(value: string, position: number, total: number): string {
  const width = Math.max(3, String(total).length);
  const prefix = String(position).padStart(width, "0");
  const readable = value
    .replace(/^https?:\/\//i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return readable ? `${prefix}-${readable}` : prefix;
}
