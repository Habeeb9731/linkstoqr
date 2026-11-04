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
  type ContentResult,
  type WifiSecurity,
} from "@linkstoqr/qr-core";

export interface Field {
  key: string;
  label: string;
  type?: "text" | "textarea" | "url" | "tel" | "email" | "datetime-local" | "select" | "checkbox";
  placeholder?: string;
  options?: { value: string; label: string }[];
  initial?: string;
  /** Hide this field unless another field has one of these values. */
  showIf?: { key: string; notValue: string };
}

export interface ContentForm {
  id: string;
  label: string;
  note?: string;
  fields: Field[];
  build(values: Record<string, string>): ContentResult;
}

const get = (values: Record<string, string>, key: string) => values[key] ?? "";

export const CONTENT_FORMS: ContentForm[] = [
  {
    id: "app",
    label: "App stores",
    note: "You get one code per store. A single code that picks the store by phone would need a redirect server, which a free code never depends on.",
    fields: [
      { key: "play", label: "Google Play link or app ID", placeholder: "com.example.app" },
      { key: "apple", label: "App Store link", type: "url", placeholder: "https://apps.apple.com/app/id123456789" },
    ],
    build: (v) => buildAppLinks(get(v, "play"), get(v, "apple")),
  },
  {
    id: "text",
    label: "Text",
    fields: [{ key: "text", label: "Your text", type: "textarea", placeholder: "Anything you want the phone to show" }],
    build: (v) => buildText(get(v, "text")),
  },
  {
    id: "map",
    label: "Map",
    note: "Opens the place in Google Maps when scanned.",
    fields: [{ key: "place", label: "Address or coordinates", placeholder: "Mainzer Str. 115, Saarbrücken or 49.2354, 7.0097" }],
    build: (v) => buildMap(get(v, "place")),
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    note: "The password is stored inside the code, so anyone who can scan it can read it.",
    fields: [
      { key: "ssid", label: "Network name" },
      {
        key: "security",
        label: "Security",
        type: "select",
        initial: "WPA",
        options: [
          { value: "WPA", label: "WPA / WPA2 / WPA3" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "No password" },
        ],
      },
      { key: "password", label: "Password", showIf: { key: "security", notValue: "nopass" } },
      { key: "hidden", label: "Hidden network", type: "checkbox" },
    ],
    build: (v) => buildWifi(get(v, "ssid"), get(v, "password"), (get(v, "security") || "WPA") as WifiSecurity, get(v, "hidden") === "true"),
  },
  {
    id: "audio",
    label: "Audio",
    note: "A QR code can't hold the file itself, and nothing is uploaded here. Put the file online first, then paste its link.",
    fields: [{ key: "url", label: "Link to the audio file", type: "url", placeholder: "https://example.com/episode.mp3" }],
    build: (v) => buildFileLink(get(v, "url"), "audio file"),
  },
  {
    id: "pdf",
    label: "PDF",
    note: "A QR code can't hold the file itself, and nothing is uploaded here. Put the PDF online first, then paste its link.",
    fields: [{ key: "url", label: "Link to the PDF", type: "url", placeholder: "https://example.com/menu.pdf" }],
    build: (v) => buildFileLink(get(v, "url"), "PDF"),
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    fields: [
      { key: "phone", label: "Phone number with country code", type: "tel", placeholder: "+49 151 2345678" },
      { key: "message", label: "Pre-filled message (optional)", type: "textarea" },
    ],
    build: (v) => buildWhatsApp(get(v, "phone"), get(v, "message")),
  },
  {
    id: "email",
    label: "Email",
    fields: [
      { key: "address", label: "Email address", type: "email", placeholder: "hello@example.com" },
      { key: "subject", label: "Subject (optional)" },
      { key: "body", label: "Message (optional)", type: "textarea" },
    ],
    build: (v) => buildEmail(get(v, "address"), get(v, "subject"), get(v, "body")),
  },
  {
    id: "phone",
    label: "Phone",
    fields: [{ key: "phone", label: "Phone number", type: "tel", placeholder: "+49 30 123456" }],
    build: (v) => buildPhone(get(v, "phone")),
  },
  {
    id: "sms",
    label: "SMS",
    fields: [
      { key: "phone", label: "Phone number", type: "tel", placeholder: "+49 151 2345678" },
      { key: "message", label: "Message (optional)", type: "textarea" },
    ],
    build: (v) => buildSms(get(v, "phone"), get(v, "message")),
  },
  {
    id: "contact",
    label: "Contact",
    fields: [
      { key: "firstName", label: "First name" },
      { key: "lastName", label: "Last name" },
      { key: "organization", label: "Organization" },
      { key: "jobTitle", label: "Job title" },
      { key: "phone", label: "Phone number", type: "tel" },
      { key: "email", label: "Email address", type: "email" },
      { key: "website", label: "Website", type: "url" },
      { key: "address", label: "Postal address", type: "textarea" },
    ],
    build: (v) =>
      buildContact({
        firstName: get(v, "firstName"),
        lastName: get(v, "lastName"),
        organization: get(v, "organization"),
        jobTitle: get(v, "jobTitle"),
        phone: get(v, "phone"),
        email: get(v, "email"),
        website: get(v, "website"),
        address: get(v, "address"),
      }),
  },
  {
    id: "event",
    label: "Event",
    fields: [
      { key: "title", label: "Event title" },
      { key: "start", label: "Starts", type: "datetime-local" },
      { key: "end", label: "Ends (optional)", type: "datetime-local" },
      { key: "location", label: "Location (optional)" },
      { key: "description", label: "Description (optional)", type: "textarea" },
    ],
    build: (v) =>
      buildEvent({
        title: get(v, "title"),
        start: get(v, "start"),
        end: get(v, "end"),
        location: get(v, "location"),
        description: get(v, "description"),
      }),
  },
];

export const CATEGORY_SUGGESTIONS = ["Business", "Event", "Marketing", "Menu", "Personal", "Print", "Product"];
