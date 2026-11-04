import { describe, expect, it } from "vitest";
import { contrastRatio, DEFAULT_OPTIONS, designWarnings, fileBaseName, normalizeLink, parseLinks } from "../src/index.ts";

describe("normalizeLink", () => {
  it.each([
    ["https://example.com", "https://example.com"],
    ["http://example.com/a?b=c", "http://example.com/a?b=c"],
    ["HTTPS://EXAMPLE.COM/ABC", "HTTPS://EXAMPLE.COM/ABC"],
    ["example.com", "https://example.com"],
    ["example.com:8080/path", "https://example.com:8080/path"],
    ["www.example.com/a?b=1#c", "https://www.example.com/a?b=1#c"],
    ["mailto:a@example.com", "mailto:a@example.com"],
    ["tel:+491234", "tel:+491234"],
    ["http://localhost:3000", "http://localhost:3000"],
  ])("accepts %s", (input, value) => {
    expect(normalizeLink(input)).toEqual({ value });
  });

  it("converts non-ASCII links to their ASCII form", () => {
    expect(normalizeLink("https://müller.de/straße")).toEqual({ value: "https://xn--mller-kva.de/stra%C3%9Fe" });
  });

  it.each([
    "hello",
    "two words.com",
    "user@example.com",
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "localhost:3000",
    "http://",
  ])("rejects %s", (input) => {
    expect(normalizeLink(input)).toHaveProperty("error");
  });
});

describe("parseLinks", () => {
  it("handles every line ending, skips blanks and keeps real line numbers", () => {
    const lines = parseLinks("a.com\r\n\r\n  b.com  \nnot a link\rc.com");
    expect(lines.map((line) => [line.line, line.value])).toEqual([
      [1, "https://a.com"],
      [3, "https://b.com"],
      [4, undefined],
      [5, "https://c.com"],
    ]);
  });

  it("has no limit on the number of links", () => {
    const lines = parseLinks(Array.from({ length: 100_000 }, (_, i) => `https://example.com/${i}`).join("\n"));
    expect(lines).toHaveLength(100_000);
  });
});

describe("fileBaseName", () => {
  it("creates safe readable names", () => {
    expect(fileBaseName("https://Example.com/a/../b?x=1", 7, 20)).toBe("007-example-com-a-b-x-1");
  });
  it("widens numbering for large batches so files sort correctly", () => {
    expect(fileBaseName("https://a.co", 7, 12345)).toBe("00007-a-co");
  });
  it("limits length", () => {
    expect(fileBaseName(`https://a.co/${"x".repeat(500)}`, 1, 1).length).toBeLessThanOrEqual(64);
  });
});

describe("designWarnings", () => {
  it("is silent for the defaults", () => {
    expect(designWarnings(DEFAULT_OPTIONS)).toEqual([]);
  });
  it("warns about low contrast, inversion and small margins", () => {
    expect(designWarnings({ ...DEFAULT_OPTIONS, foreground: "#cccccc" })).toHaveLength(1);
    expect(designWarnings({ ...DEFAULT_OPTIONS, foreground: "#ffffff", background: "#000000" })).toHaveLength(1);
    expect(designWarnings({ ...DEFAULT_OPTIONS, margin: 1 })).toHaveLength(1);
  });
  it("calculates contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
  });
});
