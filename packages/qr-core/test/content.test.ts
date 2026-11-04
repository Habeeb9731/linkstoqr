import { strFromU8, unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildAppLinks,
  buildContact,
  buildEmail,
  buildEvent,
  buildFileLink,
  buildMap,
  buildPhone,
  buildSms,
  buildText,
  buildWhatsApp,
  buildWifi,
  buildZip,
  DEFAULT_OPTIONS,
  encodeQr,
  renderPng,
  renderSvg,
  type ContentResult,
} from "../src/index.ts";
import { decodeWithJsQr, decodeWithZxing, prepareDecoders, svgToPng } from "./decode.ts";

beforeAll(prepareDecoders);

function valueOf(result: ContentResult): string {
  if ("error" in result) throw new Error(result.error);
  return result.items[0]!.value;
}

const CONTACT = {
  firstName: "Ada",
  lastName: "Lovelace",
  organization: "Analytical, Inc; Ltd",
  jobTitle: "Mathematician",
  phone: "+44 20 7946 0000",
  email: "ada@example.com",
  website: "example.com",
  address: "12 Example St\nLondon",
};
const EVENT = {
  title: "Launch; party, 2026",
  start: "2026-12-31T22:30",
  end: "",
  location: "Saarbrücken",
  description: "Line one\nLine two",
};

describe("every content type decodes with two independent decoders", () => {
  const cases: [string, ContentResult][] = [
    ["text", buildText("Hello\nsecond line")],
    ["non-ASCII text", buildText("Grüße aus Saarbrücken 👋")],
    ["PDF link", buildFileLink("https://example.com/menu.pdf", "PDF")],
    ["audio link", buildFileLink("example.com/song.mp3", "audio file")],
    ["Google Play", buildAppLinks("com.example.app", "")],
    ["App Store", buildAppLinks("", "https://apps.apple.com/app/id123456")],
    ["map address", buildMap("Mainzer Str. 115, Saarbrücken")],
    ["map coordinates", buildMap("49.2354, 7.0097")],
    ["Wi-Fi", buildWifi('My;Net,"1"', "pa:ss;word\\1", "WPA", false)],
    ["open Wi-Fi", buildWifi("Cafe", "", "nopass", true)],
    ["WhatsApp", buildWhatsApp("+49 151 2345678", "Hi & hello?")],
    ["email", buildEmail("a@example.com", "Hi there", "Body & more")],
    ["phone", buildPhone("+49 (30) 123-456")],
    ["SMS", buildSms("+49151234567", "Hello")],
    ["contact", buildContact(CONTACT)],
    ["event", buildEvent(EVENT)],
  ];

  for (const [name, result] of cases) {
    it(name, async () => {
      const value = valueOf(result);
      const matrix = encodeQr(value, DEFAULT_OPTIONS.ecc);
      const png = renderPng(matrix, DEFAULT_OPTIONS);
      const svgPng = svgToPng(renderSvg(matrix, DEFAULT_OPTIONS));
      expect(decodeWithJsQr(png)).toBe(value);
      expect(await decodeWithZxing(png)).toBe(value);
      expect(decodeWithJsQr(svgPng)).toBe(value);
      expect(await decodeWithZxing(svgPng)).toBe(value);
    });
  }
});

describe("exact content formats", () => {
  it("escapes Wi-Fi special characters", () => {
    expect(valueOf(buildWifi('a;b,c:d"e\\f', "12345678", "WPA", false))).toBe('WIFI:T:WPA;S:a\\;b\\,c\\:d\\"e\\\\f;P:12345678;;');
  });
  it("marks hidden and open networks", () => {
    expect(valueOf(buildWifi("Cafe", "ignored", "nopass", true))).toBe("WIFI:T:nopass;S:Cafe;H:true;;");
  });
  it("builds WhatsApp links with digits only", () => {
    expect(valueOf(buildWhatsApp("0049 151 234567", "Hi there"))).toBe("https://wa.me/49151234567?text=Hi%20there");
  });
  it("encodes email fields so they can't add parameters", () => {
    expect(valueOf(buildEmail("a@example.com", "x&bcc=evil@example.com", ""))).toBe(
      "mailto:a@example.com?subject=x%26bcc%3Devil%40example.com",
    );
  });
  it("encodes map addresses", () => {
    expect(valueOf(buildMap("A & B"))).toBe("https://www.google.com/maps/search/?api=1&query=A%20%26%20B");
  });
  it("creates one code per store", () => {
    const result = buildAppLinks("com.example.app", "https://apps.apple.com/app/id1");
    expect("items" in result && result.items.map((item) => item.value)).toEqual([
      "https://play.google.com/store/apps/details?id=com.example.app",
      "https://apps.apple.com/app/id1",
    ]);
  });
  it("stops a contact field from adding extra vCard lines", () => {
    const value = valueOf(buildContact({ ...CONTACT, jobTitle: "CEO\r\nURL:https://evil.example" }));
    expect(value.split("\r\n").filter((line) => line.startsWith("URL:"))).toEqual(["URL:https://example.com"]);
  });
  it("stops an event field from adding extra lines, and defaults to one hour", () => {
    const value = valueOf(buildEvent({ ...EVENT, title: "Party\nDTSTART:19990101T000000" }));
    expect(value.split("\r\n").filter((line) => line.startsWith("DTSTART:"))).toEqual(["DTSTART:20261231T223000"]);
    expect(value).toContain("DTEND:20261231T233000");
  });
  it("rolls a default end time over midnight", () => {
    expect(valueOf(buildEvent({ ...EVENT, start: "2026-12-31T23:30" }))).toContain("DTEND:20270101T003000");
  });
});

describe("invalid input gets a clear error", () => {
  it.each<[string, ContentResult]>([
    ["empty text", buildText("   ")],
    ["empty file link", buildFileLink("", "PDF")],
    ["non-web file link", buildFileLink("mailto:a@example.com", "PDF")],
    ["no store links", buildAppLinks("", "")],
    ["wrong store domain", buildAppLinks("https://evil.example/app", "")],
    ["fake Apple domain", buildAppLinks("", "https://apps.apple.com.evil.example/app")],
    ["empty map", buildMap(" ")],
    ["out-of-range coordinates", buildMap("95, 200")],
    ["no network name", buildWifi("", "12345678", "WPA", false)],
    ["no password", buildWifi("Net", "", "WPA", false)],
    ["short WPA password", buildWifi("Net", "short", "WPA", false)],
    ["WhatsApp without country code", buildWhatsApp("0151 234567", "")],
    ["bad email", buildEmail("not-an-email", "", "")],
    ["email with injected parameters", buildEmail("a@example.com?bcc=b@example.com", "", "")],
    ["bad phone", buildPhone("call me")],
    ["bad SMS number", buildSms("x", "hi")],
    ["empty contact", buildContact({ ...CONTACT, firstName: "", lastName: "", organization: "" })],
    ["event without a start", buildEvent({ ...EVENT, start: "" })],
    ["event ending before it starts", buildEvent({ ...EVENT, end: "2026-12-31T21:00" })],
  ])("%s", (_name, result) => {
    expect(result).toHaveProperty("error");
  });
});

describe("ZIP names, folders and manifest", () => {
  it("never puts a Wi-Fi password in a file name or the manifest", () => {
    const result = buildWifi("Office", "hunter2-secret", "WPA", false);
    if ("error" in result) throw new Error(result.error);
    const files = unzipSync(buildZip(result.items, DEFAULT_OPTIONS, "png"));
    expect(Object.keys(files).join(" ")).not.toContain("hunter2");
    expect(strFromU8(files["links.csv"]!)).not.toContain("hunter2");
    expect(Object.keys(files)).toContain("001-wi-fi-office.png");
  });

  it("uses the name for the file and the category as a folder", () => {
    const files = unzipSync(
      buildZip([{ value: "https://a.co", label: "https://a.co", name: "Café Menü", category: "Print / Spring" }], DEFAULT_OPTIONS, "svg"),
    );
    expect(Object.keys(files)).toContain("print-spring/001-cafe-menu.svg");
    expect(strFromU8(files["links.csv"]!)).toContain('"print-spring/001-cafe-menu.svg","Café Menü","Print / Spring","https://a.co"');
  });

  it("stops the category from escaping the ZIP folder", () => {
    const files = unzipSync(
      buildZip([{ value: "https://a.co", label: "x", category: "../../etc" }], DEFAULT_OPTIONS, "svg"),
    );
    expect(Object.keys(files).some((name) => name.includes(".."))).toBe(false);
  });

  it("stops spreadsheet formulas from running when links.csv is opened", () => {
    const result = buildText("=HYPERLINK(1)");
    if ("error" in result) throw new Error(result.error);
    const csv = strFromU8(unzipSync(buildZip(result.items, DEFAULT_OPTIONS, "svg"))["links.csv"]!);
    expect(csv).toContain(`"'=HYPERLINK(1)"`);
  });
});
