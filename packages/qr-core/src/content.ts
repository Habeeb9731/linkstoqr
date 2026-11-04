import { normalizeLink } from "./links.ts";

/** Text to encode, and a safe description. The label may appear in file names, so it must hold no secrets. */
export interface ContentItem {
  value: string;
  label: string;
}

export type ContentResult = { items: ContentItem[] } | { error: string };

const fail = (error: string): ContentResult => ({ error });
const one = (value: string, label: string): ContentResult => ({ items: [{ value, label }] });
const shorten = (text: string, length = 40) => (text.length > length ? `${text.slice(0, length).trimEnd()}…` : text);

export function buildText(text: string): ContentResult {
  if (!text.trim()) return fail("Enter some text");
  return one(text, shorten(text.trim().replace(/\s+/g, " ")));
}

/** For content that lives at a URL, such as a PDF or audio file. Only web links can open a file. */
export function buildFileLink(url: string, kind: string): ContentResult {
  const input = url.trim();
  if (!input) return fail(`Enter the link to your ${kind}`);
  const result = normalizeLink(input);
  if ("error" in result) return fail(result.error);
  if (!/^https?:/i.test(result.value)) return fail(`The ${kind} link must start with https://`);
  return one(result.value, result.value);
}

const PACKAGE_ID = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** One code per store: choosing a store by device would need a redirect server. */
export function buildAppLinks(googlePlay: string, appStore: string): ContentResult {
  const items: ContentItem[] = [];
  const play = googlePlay.trim();
  const apple = appStore.trim();
  if (!play && !apple) return fail("Enter a Google Play or App Store link");

  if (play) {
    if (PACKAGE_ID.test(play) && !play.toLowerCase().startsWith("play.google.")) {
      items.push({ value: `https://play.google.com/store/apps/details?id=${play}`, label: `Google Play ${play}` });
    } else {
      const link = normalizeLink(play);
      if ("error" in link || hostOf(link.value) !== "play.google.com") {
        return fail("Enter a play.google.com link or an app ID like com.example.app");
      }
      items.push({ value: link.value, label: "Google Play app" });
    }
  }
  if (apple) {
    const link = normalizeLink(apple);
    if ("error" in link || !["apps.apple.com", "itunes.apple.com"].includes(hostOf(link.value) ?? "")) {
      return fail("Enter an apps.apple.com link");
    }
    items.push({ value: link.value, label: "App Store app" });
  }
  return { items };
}

export function buildMap(place: string): ContentResult {
  const query = place.trim();
  if (!query) return fail("Enter an address or coordinates");
  const coordinates = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(query);
  if (coordinates) {
    if (Math.abs(Number(coordinates[1])) > 90 || Math.abs(Number(coordinates[2])) > 180) {
      return fail("Coordinates must be within -90 to 90 and -180 to 180");
    }
    const pair = `${coordinates[1]},${coordinates[2]}`;
    return one(`https://www.google.com/maps/search/?api=1&query=${pair}`, `Map ${pair}`);
  }
  return one(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, `Map ${shorten(query)}`);
}

export type WifiSecurity = "WPA" | "WEP" | "nopass";

const escapeWifi = (text: string) => text.replace(/([\\;,:"])/g, "\\$1");

export function buildWifi(ssid: string, password: string, security: WifiSecurity, hidden: boolean): ContentResult {
  if (!ssid) return fail("Enter the network name");
  if (security !== "nopass" && !password) return fail("Enter the password, or choose No password");
  if (security === "WPA" && (password.length < 8 || password.length > 63)) {
    return fail("WPA passwords are 8 to 63 characters");
  }
  const secret = security === "nopass" ? "" : `P:${escapeWifi(password)};`;
  return one(`WIFI:T:${security};S:${escapeWifi(ssid)};${secret}${hidden ? "H:true;" : ""};`, `Wi-Fi ${shorten(ssid)}`);
}

function phoneDigits(phone: string): string | null {
  const cleaned = phone.trim().replace(/[\s().-]/g, "").replace(/^00/, "+");
  return /^\+?\d{3,15}$/.test(cleaned) ? cleaned : null;
}

export function buildWhatsApp(phone: string, message: string): ContentResult {
  const number = phoneDigits(phone);
  if (!number?.startsWith("+")) return fail("Enter the full number with country code, like +49 151 2345678");
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return one(`https://wa.me/${number.slice(1)}${text}`, `WhatsApp ${number}`);
}

export function buildEmail(address: string, subject: string, body: string): ContentResult {
  const to = address.trim();
  if (!/^[^\s@,;?&]+@[^\s@,;?&]+\.[^\s@,;?&]+$/.test(to)) return fail("Enter a valid email address");
  const query = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ].filter(Boolean);
  return one(`mailto:${to}${query.length ? `?${query.join("&")}` : ""}`, `Email ${to}`);
}

export function buildPhone(phone: string): ContentResult {
  const number = phoneDigits(phone);
  if (!number) return fail("Enter a valid phone number");
  return one(`tel:${number}`, `Phone ${number}`);
}

export function buildSms(phone: string, message: string): ContentResult {
  const number = phoneDigits(phone);
  if (!number) return fail("Enter a valid phone number");
  return one(`SMSTO:${number}:${message}`, `SMS ${number}`);
}

/** Escapes vCard and iCalendar text, so a value can't add extra lines or fields. */
const escapeCard = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");

export interface ContactFields {
  firstName: string;
  lastName: string;
  organization: string;
  jobTitle: string;
  phone: string;
  email: string;
  website: string;
  address: string;
}

export function buildContact(fields: ContactFields): ContentResult {
  const first = fields.firstName.trim();
  const last = fields.lastName.trim();
  const organization = fields.organization.trim();
  if (!first && !last && !organization) return fail("Enter a name or organization");

  const full = [first, last].filter(Boolean).join(" ") || organization;
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${escapeCard(last)};${escapeCard(first)};;;`, `FN:${escapeCard(full)}`];
  if (organization) lines.push(`ORG:${escapeCard(organization)}`);
  if (fields.jobTitle.trim()) lines.push(`TITLE:${escapeCard(fields.jobTitle.trim())}`);
  if (fields.phone.trim()) {
    const number = phoneDigits(fields.phone);
    if (!number) return fail("Enter a valid phone number");
    lines.push(`TEL:${number}`);
  }
  if (fields.email.trim()) lines.push(`EMAIL:${escapeCard(fields.email.trim())}`);
  if (fields.website.trim()) {
    const site = normalizeLink(fields.website.trim());
    if ("error" in site || !/^https?:/i.test(site.value)) return fail("Enter a valid website");
    lines.push(`URL:${escapeCard(site.value)}`);
  }
  if (fields.address.trim()) lines.push(`ADR:;;${escapeCard(fields.address.trim())};;;;`);
  lines.push("END:VCARD");
  return one(lines.join("\r\n"), `Contact ${shorten(full)}`);
}

export interface EventFields {
  title: string;
  /** Local time, as a datetime-local input gives it: 2026-11-04T15:00 */
  start: string;
  end: string;
  location: string;
  description: string;
}

const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

function calendarTime(local: string): { text: string; ms: number } | null {
  const match = LOCAL_TIME.exec(local);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return {
    text: `${year}${month}${day}T${hour}${minute}00`,
    ms: Date.UTC(+year!, +month! - 1, +day!, +hour!, +minute!),
  };
}

export function buildEvent(fields: EventFields): ContentResult {
  const title = fields.title.trim();
  if (!title) return fail("Enter an event title");
  const start = calendarTime(fields.start);
  if (!start) return fail("Enter a start date and time");

  let endText: string;
  if (fields.end) {
    const end = calendarTime(fields.end);
    if (!end) return fail("Enter a valid end date and time");
    if (end.ms <= start.ms) return fail("The event must end after it starts");
    endText = end.text;
  } else {
    // Without an end, some phones refuse the event, so default to one hour.
    endText = new Date(start.ms + 3_600_000).toISOString().replace(/[-:]/g, "").slice(0, 15);
  }

  const lines = ["BEGIN:VEVENT", `SUMMARY:${escapeCard(title)}`, `DTSTART:${start.text}`, `DTEND:${endText}`];
  if (fields.location.trim()) lines.push(`LOCATION:${escapeCard(fields.location.trim())}`);
  if (fields.description.trim()) lines.push(`DESCRIPTION:${escapeCard(fields.description.trim())}`);
  lines.push("END:VEVENT");
  return one(lines.join("\r\n"), `Event ${shorten(title)}`);
}
