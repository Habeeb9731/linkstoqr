import { readFileSync } from "node:fs";
import { expect, test, type Download, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { decodeWithJsQr, decodeWithZxing, prepareDecoders, svgToPng } from "../../../packages/qr-core/test/decode.ts";

test.beforeAll(prepareDecoders);

const bytes = async (download: Download) => new Uint8Array(readFileSync(await download.path()));

async function enterLinks(page: Page, links: string) {
  await page.getByLabel("Links, one per line").fill(links);
}

async function download(page: Page, action: () => Promise<void>) {
  const [file] = await Promise.all([page.waitForEvent("download"), action()]);
  return file;
}

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
  await page.goto("/");
});

test("the links you paste never leave the browser", async ({ page }) => {
  const secret = "secret-path-a1b2c3";
  await page.waitForLoadState("networkidle");

  const requests: string[] = [];
  const policyViolations: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("data:") && !request.url().startsWith("blob:")) {
      requests.push(`${request.method()} ${request.url()} ${request.postData() ?? ""}`);
    }
  });
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) policyViolations.push(message.text());
  });

  await enterLinks(page, `https://example.com/${secret}\nhttps://example.org/${secret}`);
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.getByTestId("card").first().locator("img")).toBeVisible();
  await download(page, () => page.getByRole("button", { name: "ZIP of PNGs" }).click());
  await download(page, () => page.getByTestId("card").first().getByRole("button", { name: "SVG" }).click());
  await page.waitForTimeout(500);

  expect(requests, "no network requests during generation").toEqual([]);
  expect(policyViolations, "nothing tried to break the security policy").toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});

test("the security policy blocks a script from sending data", async ({ page }) => {
  const outcome = await page.evaluate(async () => {
    try {
      await fetch("https://example.com/leak", { method: "POST", mode: "no-cors", body: "x" });
      return "sent";
    } catch {
      return "blocked";
    }
  });
  expect(outcome).toBe("blocked");
});

test("page loads use no third parties or cookies", async ({ page, baseURL }) => {
  const origins = new Set<string>();
  page.on("request", (request) => {
    if (request.url().startsWith("http")) origins.add(new URL(request.url()).origin);
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect([...origins]).toEqual([new URL(baseURL!).origin]);
  expect(await page.context().cookies()).toEqual([]);
});

test("the preview and both single downloads decode to the link", async ({ page }) => {
  const link = "https://example.com/menu?table=12";
  await enterLinks(page, link);
  const card = page.getByTestId("card");
  await expect(card).toHaveCount(1);

  const src = await card.locator("img").getAttribute("src");
  const previewSvg = decodeURIComponent(src!.slice("data:image/svg+xml,".length));
  expect(decodeWithJsQr(svgToPng(previewSvg))).toBe(link);

  const png = await download(page, () => card.getByRole("button", { name: "PNG" }).click());
  expect(png.suggestedFilename()).toBe("001-example-com-menu-table-12.png");
  expect(await decodeWithZxing(await bytes(png))).toBe(link);

  const svg = await download(page, () => card.getByRole("button", { name: "SVG" }).click());
  expect(await decodeWithZxing(svgToPng(await bytes(svg)))).toBe(link);
});

for (const [button, format] of [["ZIP of PNGs", "png"], ["ZIP of SVGs", "svg"]] as const) {
  test(`${button} contains a working code for every link`, async ({ page }) => {
    const links = ["https://example.com/1", "https://example.com/2", "https://example.com/3"];
    await enterLinks(page, links.join("\n"));
    await expect(page.getByTestId("card")).toHaveCount(3);
    const zip = await download(page, () => page.getByRole("button", { name: button }).click());
    const files = unzipSync(await bytes(zip));
    const images = Object.keys(files).filter((name) => name.endsWith(`.${format}`)).sort();
    expect(images).toHaveLength(3);
    for (const [index, name] of images.entries()) {
      const file = files[name]!;
      expect(decodeWithJsQr(format === "png" ? file : svgToPng(file))).toBe(links[index]);
    }
  });
}

test("the options change the downloaded code", async ({ page }) => {
  const link = "https://example.com/options";
  await enterLinks(page, link);
  await page.getByLabel("Image size (px)").fill("512");
  await page.getByLabel("Image size (px)").blur();
  await page.getByRole("radio", { name: /High/ }).check({ force: true });
  await page.getByLabel("Code colour").fill("#0b2545");
  await page.getByLabel("Background").fill("#fff8e7");
  await page.getByLabel(/^Margin/).fill("8");

  const card = page.getByTestId("card");
  const file = await download(page, () => card.getByRole("button", { name: "SVG" }).click());
  const svg = new TextDecoder().decode(await bytes(file));
  expect(svg).toContain('width="512"');
  expect(svg).toContain("#0b2545");
  expect(svg).toContain("#fff8e7");
  expect(decodeWithJsQr(svgToPng(svg))).toBe(link);
});

test("bad lines are explained without blocking the good ones", async ({ page }) => {
  await enterLinks(page, `https://example.com\nnot a link\njavascript:alert(1)\nhttps://example.com/${"x".repeat(4000)}`);
  await expect(page.getByTestId("card")).toHaveCount(1);
  const errors = page.getByTestId("errors");
  await expect(errors).toContainText("Line 2");
  await expect(errors).toContainText("Line 3");
  await expect(errors).toContainText("Line 4");
  await expect(errors).toContainText("Too long");
  await expect(page.getByTestId("status")).toHaveText("1 code, 3 lines skipped");
});

test("poor designs get a warning but are still allowed", async ({ page }) => {
  await enterLinks(page, "https://example.com");
  await page.getByLabel("Code colour").fill("#dddddd");
  await expect(page.getByTestId("warnings")).toContainText("Low colour contrast");
  await expect(page.getByTestId("card")).toHaveCount(1);
});

test("raising error correction past a link's capacity reports it instead of crashing", async ({ page }) => {
  await enterLinks(page, `https://example.com/${"x".repeat(2000)}`);
  await page.getByRole("radio", { name: /Low/ }).check({ force: true });
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.getByRole("radio", { name: /High/ }).check({ force: true });
  await expect(page.getByTestId("errors")).toContainText("Too long");
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a large batch of 5,000 links works and the page stays responsive", async ({ page }) => {
  const links = Array.from({ length: 5000 }, (_, i) => `https://example.com/item/${i}`);
  // Measured inside the page: Playwright's own fill() is far slower than the app on text this large.
  const timing = await page.evaluate(async (text) => {
    let longestStall = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      longestStall = Math.max(longestStall, now - last);
      last = now;
    }, 10);
    const started = performance.now();
    const textarea = document.querySelector("textarea")!;
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (document.querySelector('[data-testid="status"]')!.textContent === "5,000 codes") {
          clearInterval(check);
          resolve();
        }
      }, 20);
    });
    clearInterval(ticker);
    return { total: performance.now() - started, longestStall };
  }, links.join("\n"));
  expect(timing.longestStall, "main thread stays responsive").toBeLessThan(500);
  expect(timing.total, "5,000 links are ready quickly").toBeLessThan(15_000);
  await expect(page.getByTestId("card")).toHaveCount(60);
  await page.getByTestId("more").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("card")).not.toHaveCount(60);
  const zip = await download(page, () => page.getByRole("button", { name: "ZIP of PNGs" }).click());
  const files = unzipSync(await bytes(zip));
  expect(Object.keys(files)).toHaveLength(5001);
  const name = Object.keys(files).find((file) => file.startsWith("4999-"))!;
  expect(decodeWithJsQr(files[name]!)).toBe(links[4998]);
});

test("the layout has no sideways scrolling on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await enterLinks(page, `https://example.com/${"very-long-path/".repeat(10)}`);
  await expect(page.getByTestId("card")).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("every content tab produces a code that decodes to the right content", async ({ page }) => {
  const fillAndCheck = async (tab: string, fields: Record<string, string>, expected: string | RegExp) => {
    await page.reload();
    await page.getByRole("button", { name: tab, exact: true }).click();
    for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByRole("button", { name: "Add code" }).click();
    const card = page.getByTestId("card");
    await expect(card).toHaveCount(1);
    const file = await download(page, () => card.getByRole("button", { name: "PNG" }).click());
    const decoded = await decodeWithZxing(await bytes(file));
    if (typeof expected === "string") expect(decoded, tab).toBe(expected);
    else expect(decoded, tab).toMatch(expected);
    expect(decodeWithJsQr(await bytes(file)), tab).toBe(decoded);
  };

  await fillAndCheck("App stores", { "Google Play link or app ID": "com.example.app" }, "https://play.google.com/store/apps/details?id=com.example.app");
  await fillAndCheck("Text", { "Your text": "Hello there" }, "Hello there");
  await fillAndCheck("Map", { "Address or coordinates": "49.2354, 7.0097" }, "https://www.google.com/maps/search/?api=1&query=49.2354,7.0097");
  await fillAndCheck("Wi-Fi", { "Network name": "Office", Password: "correct-horse" }, "WIFI:T:WPA;S:Office;P:correct-horse;;");
  await fillAndCheck("Audio", { "Link to the audio file": "https://example.com/a.mp3" }, "https://example.com/a.mp3");
  await fillAndCheck("PDF", { "Link to the PDF": "https://example.com/a.pdf" }, "https://example.com/a.pdf");
  await fillAndCheck("WhatsApp", { "Phone number with country code": "+49 151 2345678", "Pre-filled message (optional)": "Hi" }, "https://wa.me/491512345678?text=Hi");
  await fillAndCheck("Email", { "Email address": "a@example.com", "Subject (optional)": "Hi" }, "mailto:a@example.com?subject=Hi");
  await fillAndCheck("Phone", { "Phone number": "+49 30 123456" }, "tel:+4930123456");
  await fillAndCheck("SMS", { "Phone number": "+49151234567", "Message (optional)": "Hi" }, "SMSTO:+49151234567:Hi");
  await fillAndCheck("Contact", { "First name": "Ada", "Last name": "Lovelace" }, /^BEGIN:VCARD[\s\S]*FN:Ada Lovelace[\s\S]*END:VCARD$/);
  await fillAndCheck("Event", { "Event title": "Launch", Starts: "2026-12-31T22:30" }, /^BEGIN:VEVENT[\s\S]*DTSTART:20261231T223000[\s\S]*END:VEVENT$/);
});

test("a Wi-Fi password stays out of the card, file names and network", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  const requests: string[] = [];
  page.on("request", (request) => {
    if (!/^(data|blob):/.test(request.url())) requests.push(request.url());
  });
  await page.getByRole("button", { name: "Wi-Fi", exact: true }).click();
  await page.getByLabel("Network name").fill("Office");
  await page.getByLabel("Password").fill("hunter2-secret");
  await page.getByRole("button", { name: "Add code" }).click();
  const card = page.getByTestId("card");
  await expect(card).toHaveCount(1);
  expect(await card.innerText()).not.toContain("hunter2");
  expect(await card.locator("img").getAttribute("alt")).not.toContain("hunter2");
  const single = await download(page, () => card.getByRole("button", { name: "PNG" }).click());
  expect(single.suggestedFilename()).toBe("001-wi-fi-office.png");
  const zip = await download(page, () => page.getByRole("button", { name: "ZIP of PNGs" }).click());
  const files = unzipSync(await bytes(zip));
  expect(Object.keys(files).join()).not.toContain("hunter2");
  expect(new TextDecoder().decode(files["links.csv"]!)).not.toContain("hunter2");
  expect(requests).toEqual([]);
});

test("name and category set the file name and ZIP folder, and links combine with other codes", async ({ page }) => {
  await enterLinks(page, "https://example.com/a");
  await page.getByLabel("Name (optional)").fill("Spring menu");
  await page.getByLabel("Category (optional)").fill("Print");
  await expect(page.getByTestId("card").first()).toContainText("Spring menu");

  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByLabel("Name (optional)")).toHaveValue("");
  await page.getByLabel("Your text").fill("Hello");
  await page.getByLabel("Name (optional)").fill("Greeting");
  await page.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByTestId("card")).toHaveCount(2);
  await expect(page.getByTestId("card").first()).toContainText("Spring menu");

  const zip = await download(page, () => page.getByRole("button", { name: "ZIP of PNGs" }).click());
  const names = Object.keys(unzipSync(await bytes(zip)));
  expect(names).toContain("print/001-spring-menu.png");
  expect(names).toContain("002-greeting.png");
});

test("an added code can be removed, and invalid forms explain what is wrong", async ({ page }) => {
  await page.getByRole("button", { name: "Phone", exact: true }).click();
  await page.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByRole("alert")).toContainText("valid phone number");
  await expect(page.getByTestId("card")).toHaveCount(0);

  await page.getByLabel("Phone number").fill("+49 30 123456");
  await page.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.getByRole("button", { name: /^Remove/ }).click();
  await expect(page.getByTestId("card")).toHaveCount(0);
  await expect(page.getByTestId("status")).toHaveText("Your codes will appear here.");
});

test("added text too long for a higher error correction level is reported, not fatal", async ({ page }) => {
  await page.getByRole("radio", { name: /Low/ }).check({ force: true });
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByLabel("Your text").fill("x".repeat(2000));
  await page.getByRole("button", { name: "Add code" }).click();
  await expect(page.getByTestId("card")).toHaveCount(1);
  await page.getByRole("radio", { name: /High/ }).check({ force: true });
  await expect(page.getByTestId("errors")).toContainText("Too long");
  await expect(page.getByTestId("card")).toHaveCount(0);
});

test("the legal pages have no placeholders left", async ({ page }) => {
  for (const path of ["/impressum", "/privacy"]) {
    await page.goto(path);
    const content = await page.content();
    expect(content).not.toMatch(/LEGAL_NAME|FULL_ADDRESS|CONTACT_EMAIL|STREET_AND_NUMBER|POSTCODE_AND_CITY/);
    expect(content).toContain("Mainzer Str. 115");
  }
});

test("legal pages are reachable", async ({ page }) => {
  await page.getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy" })).toBeVisible();
  await page.goto("/impressum");
  await expect(page.getByRole("heading", { level: 1, name: "Impressum" })).toBeVisible();
});
