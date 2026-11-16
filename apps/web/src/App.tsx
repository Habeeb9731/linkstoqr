import {
  codeDimensions,
  DEFAULT_FRAME_TEXT,
  DEFAULT_OPTIONS,
  designWarnings,
  encodeQr,
  fileBaseName,
  FRAME_TEXT_MAX,
  LOGO_SIZE_RANGE,
  MARGIN_RANGE,
  renderImage,
  renderSvg,
  SIZE_RANGE,
  type CornerStyle,
  type DotStyle,
  type Ecc,
  type FrameStyle,
  type ImageFormat,
  type QrLogo,
  type QrOptions,
} from "@linkstoqr/qr-core";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { BRAND_ICONS } from "./brand-icons.ts";
import { CATEGORY_SUGGESTIONS, CONTENT_FORMS, type ContentForm, type Field } from "./forms.ts";
import type { CustomItem, ResultItem, WorkerRequest, WorkerResponse } from "./protocol.ts";

const SAMPLE_LINK = "https://example.com";
const SAMPLE_LINKS = `${SAMPLE_LINK}\nexample.org/menu\nhttps://example.net/tickets?event=spring`;

const PREVIEW_BATCH = 60;
const MAX_LISTED_ERRORS = 100;
const LINK_TAB = "link";

const ECC_CHOICES: { value: Ecc; label: string; hint: string }[] = [
  { value: "L", label: "Low", hint: "7%" },
  { value: "M", label: "Medium", hint: "15%" },
  { value: "Q", label: "Quartile", hint: "25%" },
  { value: "H", label: "High", hint: "30%" },
];

type DesignTab = "frame" | "logo" | "look" | "size";

const DESIGN_TABS: { id: DesignTab; label: string }[] = [
  { id: "frame", label: "Frame" },
  { id: "logo", label: "Logo" },
  { id: "look", label: "Colour & shape" },
  { id: "size", label: "Size & quality" },
];

const FRAME_CHOICES: { value: FrameStyle; label: string }[] = [
  { value: "none", label: "No frame" },
  { value: "border", label: "Border" },
  { value: "label", label: "Label" },
  { value: "banner", label: "Banner" },
  { value: "outline", label: "Outline" },
];
const DOT_CHOICES: { value: DotStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
];
const CORNER_CHOICES: { value: CornerStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

const HERO_POINTS = [
  "Links, Wi-Fi, contacts, WhatsApp and nine more",
  "One code, or thousands at once",
  "PNG and SVG, ready to print",
  "Frames, logos, colours and dot styles",
  "Codes that never expire",
  "Nothing you type leaves your browser",
  "No sign-up, ads or watermarks",
  "Open source, so anyone can check",
];

const WHY_POINTS: [string, string][] = [
  ["Your codes are yours.", "Each code holds your content directly. Nothing redirects through us."],
  ["They never expire.", "A static code keeps working even if this site goes away."],
  ["Private by design.", "Codes are made on your device, and a strict security policy stops the page sending what you type anywhere."],
  ["Free, with no catch.", "No sign-up, ads, watermarks or limits on codes."],
  ["Print-ready.", "Sharp PNG or SVG files up to 4096 pixels wide."],
  ["Tested to scan.", "Every style is decoded by two independent QR readers before a release."],
];

/** The features section shows a real, scannable code made with the same renderer as the downloads. */
const HERO_SAMPLE = (() => {
  const options: QrOptions = {
    ...DEFAULT_OPTIONS,
    size: 320,
    ecc: "Q",
    dots: "rounded",
    corners: "rounded",
    cornerColor: "#c2381a",
    margin: 2,
  };
  const matrix = encodeQr("https://linkstoqr.com", options.ecc);
  const { width, height } = codeDimensions(matrix, options);
  return { src: `data:image/svg+xml,${encodeURIComponent(renderSvg(matrix, options))}`, width, height };
})();

type Theme = "light" | "dark";

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** Light by default; a choice of dark is remembered in this browser only. */
function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const toggle = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be blocked; the choice then lasts for this visit.
    }
    setTheme(next);
  };
  return (
    <button type="button" class="theme-toggle" aria-label={`Switch to ${next} mode`} onClick={toggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {theme === "dark" ? (
          <path d="M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />
        ) : (
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

/** First suggestion when someone turns on a separate corner colour. */
const BRAND_ACCENT = "#c2381a";
/** Thumbnails show a short, real code, so each style choice is previewed exactly as it will look. */
const THUMB_MATRIX = encodeQr("https://linkstoqr.com", "M");
const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_LOGO_SIDE = 512;

/** Reads an image file into straight RGBA pixels, scaled down to at most 512 px. Nothing leaves the browser. */
async function readLogo(file: File): Promise<{ logo: QrLogo; src: string }> {
  // A data: URL, because the security policy allows images only from this site and data: URLs.
  const src = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { logo: await imagePixels(src), src };
}

/** Decodes an image URL into straight RGBA pixels, at most 512 px on the longer side. */
async function imagePixels(src: string): Promise<QrLogo> {
  const image = new Image();
  image.src = src;
  await image.decode();
  // SVGs without a width and height report 0; give them a square canvas.
  const naturalW = image.naturalWidth || MAX_LOGO_SIDE;
  const naturalH = image.naturalHeight || MAX_LOGO_SIDE;
  const k = Math.min(1, MAX_LOGO_SIDE / Math.max(naturalW, naturalH));
  const width = Math.max(1, Math.round(naturalW * k));
  const height = Math.max(1, Math.round(naturalH * k));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No canvas");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  return { width, height, rgba: new Uint8Array(pixels.buffer.slice(0)) };
}

/** 24-unit outline icons for the content tabs, drawn with the current text colour. */
const TAB_ICONS: Record<string, string> = {
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  app: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  text: "M4 6h16M4 12h16M4 18h10",
  map: "M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  wifi: "M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01",
  audio: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  pdf: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5",
  whatsapp: "M21 12a9 9 0 0 1-13.5 7.8L3 21l1.2-4.5A9 9 0 1 1 21 12z",
  email: "M3 5h18v14H3zM3 6l9 7 9-7",
  phone: "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z",
  sms: "M4 4h16v12H8l-4 4z",
  contact: "M3 5h18v14H3zM9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.5 16a3.5 3.5 0 0 1 7 0M15 10h3M15 14h3",
  event: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
};

/** Everyday icons, drawn in the same outline style as the tabs. */
const COMMON_ICONS: { id: string; title: string; path: string }[] = [
  { id: "website", title: "Website", path: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" },
  { id: "link", title: "Link", path: "" },
  { id: "email", title: "Email", path: "" },
  { id: "phone", title: "Phone", path: "" },
  { id: "sms", title: "Message", path: "" },
  { id: "wifi", title: "Wi-Fi", path: "" },
  { id: "map", title: "Location", path: "" },
  { id: "event", title: "Event", path: "" },
  { id: "contact", title: "Contact", path: "" },
  { id: "menu", title: "Menu", path: "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3.5 3.5-3.5 7 0 2 1.5 3 3.5 3" },
  { id: "shop", title: "Shop", path: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" },
  { id: "review", title: "Review", path: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
].map((icon) => ({ ...icon, path: icon.path || TAB_ICONS[icon.id]! }));

/** A rounded tile with a white glyph: brand icons on their brand colour, everyday icons on ink. */
function iconTile(id: string): string | null {
  const brand = BRAND_ICONS.find((icon) => icon.id === id);
  const common = COMMON_ICONS.find((icon) => icon.id === id);
  if (!brand && !common) return null;
  const glyph = brand
    ? `<g transform="translate(58 58) scale(5.83)"><path fill="#fff" d="${brand.path}"/></g>`
    : `<g transform="translate(50 50) scale(6.5)"><path fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="${common!.path}"/></g>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">` +
    `<rect width="256" height="256" rx="60" fill="${brand ? brand.color : "#17181a"}"/>${glyph}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function TabIcon(props: { id: string }) {
  const d = TAB_ICONS[props.id];
  if (!d) return null;
  return (
    <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Section(props: { title: string; children: ComponentChildren }) {
  return (
    <details class="section" open>
      <summary>
        {props.title}
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 15l6-6 6 6" />
        </svg>
      </summary>
      <div class="section-body">{props.children}</div>
    </details>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function clamp(value: number, min: number, max: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}

export function App() {
  const [tab, setTab] = useState(LINK_TAB);
  const [text, setText] = useState("");
  const [multipleLinks, setMultipleLinks] = useState(false);
  const linksField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const refocusLinks = useRef(false);
  const [custom, setCustom] = useState<CustomItem[]>([]);
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [options, setOptions] = useState<QrOptions>(DEFAULT_OPTIONS);
  const [sizeInput, setSizeInput] = useState(String(DEFAULT_OPTIONS.size));
  const [items, setItems] = useState<ResultItem[]>([]);
  // The level `items` were checked against. Content that fits at Low may not fit at High,
  // so previews must not use a new level until the worker has re-checked it.
  const [checkedEcc, setCheckedEcc] = useState<Ecc>(DEFAULT_OPTIONS.ecc);
  const [analyzing, setAnalyzing] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [previewCount, setPreviewCount] = useState(PREVIEW_BATCH);
  const [designTab, setDesignTab] = useState<DesignTab>("frame");
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  /** "upload", an icon id, or null. */
  const [logoChoice, setLogoChoice] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [eccRaised, setEccRaised] = useState(false);
  const moreSentinel = useRef<HTMLDivElement>(null);

  const worker = useRef<Worker | undefined>(undefined);
  const nextCustomId = useRef(1);
  const latestAnalyzeJob = useRef(0);
  const latestZipJob = useRef(0);
  const zipFormat = useRef<ImageFormat>("png");

  useEffect(() => {
    const instance = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "analyzed") {
        if (message.jobId !== latestAnalyzeJob.current) return;
        setItems(message.items);
        setCheckedEcc(message.ecc);
        setPreviewCount(PREVIEW_BATCH);
        setAnalyzing(false);
      } else if (message.type === "zip-progress") {
        setZipStatus(`Building ZIP: ${message.done.toLocaleString()} of ${message.total.toLocaleString()}`);
      } else if (message.type === "zip-done") {
        saveBlob(message.blob, `qr-codes-${zipFormat.current}.zip`);
        setZipStatus(null);
      } else {
        setFailure(message.message);
        setZipStatus(null);
        setAnalyzing(false);
      }
    };
    worker.current = instance;
    return () => instance.terminate();
  }, []);

  const send = (request: WorkerRequest) => worker.current?.postMessage(request);

  // Switching swaps the input for a textarea, which would otherwise drop keyboard focus.
  useEffect(() => {
    if (refocusLinks.current) linksField.current?.focus();
    refocusLinks.current = false;
  }, [multipleLinks]);

  const switchLinkMode = (multiple: boolean) => {
    refocusLinks.current = true;
    setMultipleLinks(multiple);
    if (!multiple) setText((current) => current.trim());
  };

  // A one-line input strips line breaks, which would merge pasted links into one broken link.
  const pasteIntoSingleLink = (event: ClipboardEvent & { currentTarget: HTMLInputElement }) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    if (!/[\r\n]/.test(pasted.trim())) return;
    event.preventDefault();
    const { value, selectionStart, selectionEnd } = event.currentTarget;
    setText(value.slice(0, selectionStart ?? value.length) + pasted + value.slice(selectionEnd ?? value.length));
    refocusLinks.current = true;
    setMultipleLinks(true);
  };

  // Name and category apply to the pasted links as a group, but only while on that tab's content.
  const linkName = useRef("");
  const linkCategory = useRef("");
  if (tab === LINK_TAB) {
    linkName.current = name;
    linkCategory.current = category;
  }

  useEffect(() => {
    const jobId = ++latestAnalyzeJob.current;
    setFailure(null);
    if (!text.trim() && custom.length === 0) {
      setItems([]);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const timer = setTimeout(
      () =>
        send({
          type: "analyze",
          jobId,
          text,
          ecc: options.ecc,
          linkName: linkName.current.trim(),
          linkCategory: linkCategory.current.trim(),
          custom,
        }),
      150,
    );
    return () => clearTimeout(timer);
  }, [text, options.ecc, custom, tab === LINK_TAB ? name : "", tab === LINK_TAB ? category : ""]);

  const update = (change: Partial<QrOptions>) => setOptions((current) => ({ ...current, ...change }));

  const chooseLogo = async (file: File | undefined) => {
    setLogoError(null);
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("That image is over 10 MB. Try a smaller one.");
      return;
    }
    try {
      const { logo, src } = await readLogo(file);
      applyLogo(logo, src, "upload");
    } catch {
      setLogoError("Couldn't read that image. Try a PNG or JPEG.");
    }
  };

  const chooseIcon = async (id: string) => {
    setLogoError(null);
    const src = iconTile(id);
    if (!src) return;
    try {
      applyLogo(await imagePixels(src), src, id);
    } catch {
      setLogoError("Couldn't draw that icon.");
    }
  };

  const applyLogo = (logo: QrLogo, src: string, choice: string) => {
    // A logo covers modules in the middle, so make sure the code can recover them.
    const raise = options.ecc === "L" || options.ecc === "M";
    if (raise) setEccRaised(true);
    setLogoSrc(src);
    setLogoChoice(choice);
    update({ logo, ...(raise ? { ecc: "H" as const } : {}) });
  };

  const removeLogo = () => {
    setLogoSrc(null);
    setLogoChoice(null);
    setEccRaised(false);
    update({ logo: null });
  };
  const commitSize = () => {
    const size = clamp(Number(sizeInput), SIZE_RANGE.min, SIZE_RANGE.max, options.size);
    setSizeInput(String(size));
    update({ size });
  };

  const valid = useMemo(() => items.filter((item) => item.value), [items]);
  const invalidCount = items.length - valid.length;
  const warnings = useMemo(() => designWarnings(options), [options]);
  const cardOptions = useMemo(() => ({ ...options, ecc: checkedEcc }), [options, checkedEcc]);
  const errors = useMemo(() => items.filter((item) => item.error), [items]);
  const hasMorePreviews = previewCount < valid.length;
  const activeForm = CONTENT_FORMS.find((form) => form.id === tab);

  // Only what's on screen is rendered. Every code is still in the ZIP.
  useEffect(() => {
    const sentinel = moreSentinel.current;
    if (!sentinel || !hasMorePreviews) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setPreviewCount((count) => count + PREVIEW_BATCH);
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMorePreviews, previewCount]);

  const downloadZip = (format: ImageFormat) => {
    zipFormat.current = format;
    setFailure(null);
    setZipStatus("Building ZIP");
    send({
      type: "zip",
      jobId: ++latestZipJob.current,
      entries: valid.map((item) => ({ value: item.value!, label: item.label, name: item.name, category: item.category })),
      options,
      format,
    });
  };

  /** Quick links: open the generator on a content type (or design tab) and bring it into view. */
  const startWith = (id: string, extra: { multiple?: boolean; design?: DesignTab } = {}) => {
    switchTab(id);
    if (extra.multiple) switchLinkMode(true);
    if (extra.design) setDesignTab(extra.design);
    document.getElementById("generator")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const switchTab = (id: string) => {
    setTab(id);
    setFormError(null);
    setName(id === LINK_TAB ? linkName.current : "");
    setCategory(id === LINK_TAB ? linkCategory.current : "");
  };

  const addFromForm = (form: ContentForm, event: Event) => {
    event.preventDefault();
    const result = form.build(formValues[form.id] ?? {});
    if ("error" in result) {
      setFormError(result.error);
      return;
    }
    const added = result.items.map((item) => ({
      ...item,
      id: nextCustomId.current++,
      name: name.trim() || undefined,
      category: category.trim() || undefined,
    }));
    setCustom((current) => [...current, ...added]);
    setFormValues((current) => ({ ...current, [form.id]: {} }));
    setFormError(null);
    setName("");
  };

  const setFieldValue = (formId: string, key: string, value: string) => {
    setFormValues((current) => ({ ...current, [formId]: { ...current[formId], [key]: value } }));
  };

  return (
    <>
      <div class="topbar" id="top">
        <p>Free forever · No sign-up · Codes that never expire</p>
        <p class="topbar-note">Made in your browser, never on our servers · No redirects</p>
      </div>

      <header class="site-nav">
        <a class="brand" href="/" aria-label="Links to QR home">
          <svg viewBox="0 0 256 256" aria-hidden="true">
            <path fill="currentColor" d="M34 34H202V134H166V70H70V166H134V202H34Z" />
            <rect class="brand-square" x="150" y="150" width="72" height="72" />
          </svg>
          Links to QR
        </a>
        <nav aria-label="Main">
          <a href="#generator">Generator</a>
          <a href="#quick-links">Quick start</a>
          <a href="#why">Why Links to QR</a>
          <a href="https://github.com/Habeeb9731/linkstoqr">Source code</a>
        </nav>
        <ThemeToggle />
      </header>

      <main>
        <section class="generator-section" id="generator" aria-labelledby="generator-heading">
          <div class="section-heading">
            <h1 id="generator-heading">Make your QR code</h1>
            <p>
              Paste a link, or pick Wi-Fi, a contact, WhatsApp and more. Everything stays in this browser, and each code
              holds your content directly, so it keeps working even if this site goes away.
            </p>
          </div>
        <div class="generator">
          <nav class="content-tabs" aria-label="What should the code contain?">
            <button type="button" aria-pressed={tab === LINK_TAB} onClick={() => switchTab(LINK_TAB)}>
              <TabIcon id={LINK_TAB} />
              Link
            </button>
            {CONTENT_FORMS.map((form) => (
              <button key={form.id} type="button" aria-pressed={tab === form.id} onClick={() => switchTab(form.id)}>
                <TabIcon id={form.id} />
                {form.label}
              </button>
            ))}
          </nav>

          <div class="workspace">
            <div class="input-column">
              <Section title="Content">
                {activeForm ? (
                  <form key={activeForm.id} class="content-form" onSubmit={(event) => addFromForm(activeForm, event)} noValidate>
                    {activeForm.note && <p class="note">{activeForm.note}</p>}
                    {activeForm.fields.map((field) => (
                      <FormField
                        key={field.key}
                        field={field}
                        formId={activeForm.id}
                        values={formValues[activeForm.id] ?? {}}
                        onChange={(value) => setFieldValue(activeForm.id, field.key, value)}
                      />
                    ))}
                    <NameAndCategory name={name} category={category} onName={setName} onCategory={setCategory} />
                    {formError && (
                      <p class="form-error" role="alert">
                        {formError}
                      </p>
                    )}
                    <button type="submit" class="primary add-button">
                      Add code
                    </button>
                  </form>
                ) : (
                  <div class="content-form">
                    <div class="field">
                      <div class="field-heading">
                        <label for="links">{multipleLinks ? "Links, one per line" : "Your link"}</label>
                        {!text && (
                          <button type="button" class="link-button" onClick={() => setText(multipleLinks ? SAMPLE_LINKS : SAMPLE_LINK)}>
                            Try an example
                          </button>
                        )}
                      </div>
                      {multipleLinks ? (
                        <textarea
                          id="links"
                          ref={linksField}
                          value={text}
                          rows={9}
                          spellcheck={false}
                          autocapitalize="off"
                          autocomplete="off"
                          placeholder={"https://example.com/menu\nexample.com/tickets"}
                          onInput={(event) => setText(event.currentTarget.value)}
                        />
                      ) : (
                        <input
                          id="links"
                          ref={linksField}
                          type="text"
                          inputMode="url"
                          value={text}
                          spellcheck={false}
                          autocapitalize="off"
                          autocomplete="off"
                          placeholder="https://example.com/menu"
                          onInput={(event) => setText(event.currentTarget.value)}
                          onPaste={pasteIntoSingleLink}
                        />
                      )}
                      {!multipleLinks ? (
                        <button type="button" class="link-button" onClick={() => switchLinkMode(true)}>
                          Add multiple links
                        </button>
                      ) : (
                        // Going back would have to discard every link but one, so it's only offered when there's at most one.
                        !/\n/.test(text.trim()) && (
                          <button type="button" class="link-button" onClick={() => switchLinkMode(false)}>
                            Use a single link
                          </button>
                        )
                      )}
                    </div>
                    <NameAndCategory name={name} category={category} onName={setName} onCategory={setCategory} />
                  </div>
                )}
              </Section>

              <Section title="Design">
                <div class="design-tabs" role="tablist" aria-label="Design options">
                  {DESIGN_TABS.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="tab"
                      id={`design-tab-${choice.id}`}
                      aria-controls="design-panel"
                      aria-selected={designTab === choice.id}
                      onClick={() => setDesignTab(choice.id)}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
                <div class="options" role="tabpanel" id="design-panel" aria-labelledby={`design-tab-${designTab}`}>
                  {designTab === "frame" && (
                    <>
                      <ChoiceGrid
                        label="Frame"
                        choices={FRAME_CHOICES}
                        value={options.frame ?? "none"}
                        options={options}
                        preview={(frame) => ({ frame })}
                        onChange={(frame) => update({ frame })}
                      />
                      {(options.frame ?? "none") !== "none" && (
                        <>
                          <div class="field">
                            <label for="frame-text">Frame text</label>
                            <input
                              id="frame-text"
                              type="text"
                              maxLength={FRAME_TEXT_MAX}
                              value={options.frameText ?? DEFAULT_FRAME_TEXT}
                              onInput={(event) => update({ frameText: event.currentTarget.value })}
                            />
                          </div>
                          <div class="field">
                            <label for="frame-colour">Frame colour</label>
                            <input
                              id="frame-colour"
                              type="color"
                              value={options.frameColor ?? options.foreground}
                              onInput={(event) => update({ frameColor: event.currentTarget.value })}
                            />
                          </div>
                          <p class="hint wide">Letters, numbers and simple punctuation. Other characters are left out.</p>
                        </>
                      )}
                    </>
                  )}
                  {designTab === "logo" && (
                    <>
                      <div class="field wide">
                        <div class="logo-row">
                          {logoSrc && <img src={logoSrc} alt="Your logo" width={56} height={56} />}
                          <label class="upload-button" for="logo-file">
                            {logoChoice === "upload" ? "Upload another" : "Upload logo"}
                          </label>
                          <input
                            id="logo-file"
                            class="visually-hidden"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              void chooseLogo(file);
                            }}
                          />
                          {options.logo && (
                            <button type="button" onClick={removeLogo}>
                              Remove logo
                            </button>
                          )}
                        </div>
                        <p class="hint">PNG, JPEG, WebP or SVG. Your logo stays in this browser, like everything else.</p>
                        {logoError && (
                          <p class="form-error" role="alert">
                            {logoError}
                          </p>
                        )}
                      </div>
                      <IconPicker label="Common icons" icons={COMMON_ICONS} value={logoChoice} onPick={(id) => void chooseIcon(id)} />
                      <IconPicker label="Brands" icons={BRAND_ICONS} value={logoChoice} onPick={(id) => void chooseIcon(id)} />
                      <p class="hint wide">
                        Brand icons come from Simple Icons and are trademarks of their owners. Use one only to point to
                        your own page on that service. LinkedIn asked for its logo to be removed, so it isn't here; you
                        can upload it from LinkedIn's brand page.
                      </p>
                      {options.logo && (
                        <div class="field wide">
                          <label for="logo-size">
                            Logo size <span class="value">{Math.round((options.logoSize ?? LOGO_SIZE_RANGE.default) * 100)}%</span>
                          </label>
                          <input
                            id="logo-size"
                            type="range"
                            min={LOGO_SIZE_RANGE.min * 100}
                            max={LOGO_SIZE_RANGE.max * 100}
                            value={Math.round((options.logoSize ?? LOGO_SIZE_RANGE.default) * 100)}
                            onInput={(event) => update({ logoSize: Number(event.currentTarget.value) / 100 })}
                          />
                        </div>
                      )}
                      {options.logo && eccRaised && (
                        <p class="note wide">Error correction is now High, so the code still scans with part of it covered.</p>
                      )}
                    </>
                  )}
                  {designTab === "look" && (
                    <>
                      <div class="field">
                        <label for="foreground">Code colour</label>
                        <input
                          id="foreground"
                          type="color"
                          value={options.foreground}
                          onInput={(event) => update({ foreground: event.currentTarget.value })}
                        />
                      </div>
                      <div class="field">
                        <label for="background">Background</label>
                        <input
                          id="background"
                          type="color"
                          value={options.background}
                          onInput={(event) => update({ background: event.currentTarget.value })}
                        />
                      </div>
                      <ChoiceGrid
                        label="Dot style"
                        choices={DOT_CHOICES}
                        value={options.dots ?? "square"}
                        options={options}
                        preview={(dots) => ({ dots, frame: "none" })}
                        onChange={(dots) => update({ dots })}
                      />
                      <ChoiceGrid
                        label="Corner style"
                        choices={CORNER_CHOICES}
                        value={options.corners ?? "square"}
                        options={options}
                        preview={(corners) => ({ corners, frame: "none" })}
                        onChange={(corners) => update({ corners })}
                      />
                      <label class="checkbox wide" for="corner-colour-on">
                        <input
                          id="corner-colour-on"
                          type="checkbox"
                          checked={!!options.cornerColor}
                          onChange={(event) => update({ cornerColor: event.currentTarget.checked ? BRAND_ACCENT : null })}
                        />
                        Different colour for the corners
                      </label>
                      {options.cornerColor && (
                        <div class="field">
                          <label for="corner-colour">Corner colour</label>
                          <input
                            id="corner-colour"
                            type="color"
                            value={options.cornerColor}
                            onInput={(event) => update({ cornerColor: event.currentTarget.value })}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {designTab === "size" && (
                    <>
                      <div class="field">
                        <label for="size">Image size (px)</label>
                        <input
                          id="size"
                          type="number"
                          min={SIZE_RANGE.min}
                          max={SIZE_RANGE.max}
                          step={1}
                          value={sizeInput}
                          onInput={(event) => setSizeInput(event.currentTarget.value)}
                          onBlur={commitSize}
                          onKeyDown={(event) => event.key === "Enter" && commitSize()}
                        />
                      </div>
                      <div class="field">
                        <label for="margin">
                          Margin <span class="value">{options.margin}</span>
                        </label>
                        <input
                          id="margin"
                          type="range"
                          min={MARGIN_RANGE.min}
                          max={MARGIN_RANGE.max}
                          value={options.margin}
                          onInput={(event) => update({ margin: Number(event.currentTarget.value) })}
                        />
                      </div>
                      <fieldset class="field ecc">
                        <legend>Error correction</legend>
                        <div class="segments">
                          {ECC_CHOICES.map((choice) => (
                            <label key={choice.value} class={options.ecc === choice.value ? "selected" : ""}>
                              <input
                                type="radio"
                                name="ecc"
                                value={choice.value}
                                checked={options.ecc === choice.value}
                                onChange={() => update({ ecc: choice.value })}
                              />
                              {choice.label}
                              <small>{choice.hint}</small>
                            </label>
                          ))}
                        </div>
                        <p class="hint">Higher levels survive more damage, but make the code denser.</p>
                      </fieldset>
                    </>
                  )}
                </div>

                {warnings.length > 0 && (
                  <ul class="warnings" data-testid="warnings">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <section class="results" aria-label="QR codes">
              <div class="results-bar">
                <p role="status" data-testid="status">
                  {analyzing
                    ? "Working…"
                    : zipStatus ??
                      (items.length === 0
                        ? "Your codes will appear here."
                        : `${valid.length.toLocaleString()} ${valid.length === 1 ? "code" : "codes"}` +
                          (invalidCount ? `, ${invalidCount.toLocaleString()} ${invalidCount === 1 ? "line" : "lines"} skipped` : ""))}
                </p>
                {/* With one code, its own PNG/SVG buttons are the download. */}
                {valid.length > 1 && (
                  <div class="actions">
                    <button type="button" class="primary" disabled={!!zipStatus || analyzing} onClick={() => downloadZip("png")}>
                      ZIP of PNGs
                    </button>
                    <button type="button" disabled={!!zipStatus || analyzing} onClick={() => downloadZip("svg")}>
                      ZIP of SVGs
                    </button>
                  </div>
                )}
              </div>

              {failure && (
                <p class="failure" role="alert">
                  {failure}
                </p>
              )}

              {errors.length > 0 && (
                <ul class="errors" data-testid="errors">
                  {errors.slice(0, MAX_LISTED_ERRORS).map((item) => (
                    <li key={item.key}>
                      <strong>{item.line ? `Line ${item.line}` : item.label}:</strong> {item.error}
                      {item.line && <code>{item.label.length > 80 ? `${item.label.slice(0, 80)}…` : item.label}</code>}
                      {item.customId !== undefined && (
                        <button type="button" class="link-button" onClick={() => setCustom((c) => c.filter((x) => x.id !== item.customId))}>
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {errors.length > MAX_LISTED_ERRORS && (
                    <li>And {(errors.length - MAX_LISTED_ERRORS).toLocaleString()} more.</li>
                  )}
                </ul>
              )}

              {valid.length > 0 ? (
                <>
                  <ul class="grid">
                    {valid.slice(0, previewCount).map((item, index) => (
                      <Card
                        key={item.key}
                        item={item}
                        position={index + 1}
                        total={valid.length}
                        options={cardOptions}
                        onRemove={
                          item.customId === undefined
                            ? undefined
                            : () => setCustom((current) => current.filter((entry) => entry.id !== item.customId))
                        }
                      />
                    ))}
                  </ul>
                  {hasMorePreviews && (
                    <div class="more" ref={moreSentinel} data-testid="more">
                      Showing {previewCount.toLocaleString()} of {valid.length.toLocaleString()}. Scroll for more. The ZIP
                      includes all of them.
                    </div>
                  )}
                </>
              ) : (
                items.length === 0 && (
                  <div class="empty" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path fill-rule="evenodd" d="M2 2h9v9H2zM4.5 4.5v4h4v-4zM13 2h9v9h-9zm2.5 2.5v4h4v-4zM2 13h9v9H2zm2.5 2.5v4h4v-4z" />
                      <path d="M13 13h4v4h-4zM18 18h4v4h-4z" />
                    </svg>
                  </div>
                )
              )}
            </section>
          </div>
        </div>

        </section>

        <section class="features" aria-labelledby="features-heading">
          <div class="features-copy">
            <h2 id="features-heading">With Links to QR, you get all this and more</h2>
            <ul class="checklist">
              {HERO_POINTS.map((point) => (
                <li key={point}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <figure class="features-art qr-card">
            <div class="qr-card-media">
              <p class="qr-card-title">linkstoqr.com</p>
              <p class="qr-card-status">
                <span class="status-dot" aria-hidden="true" />
                Ready to scan
              </p>
              <img src={HERO_SAMPLE.src} width={HERO_SAMPLE.width} height={HERO_SAMPLE.height} alt="An example QR code for linkstoqr.com" />
            </div>
            <figcaption class="qr-card-footer">
              <span class="qr-card-avatar" aria-hidden="true">
                <svg viewBox="0 0 256 256">
                  <path fill="currentColor" d="M34 34H202V134H166V70H70V166H134V202H34Z" />
                  <rect class="brand-square" x="150" y="150" width="72" height="72" />
                </svg>
              </span>
              <span class="qr-card-meta">
                <strong>Static code</strong>
                <span>Never expires</span>
              </span>
              <a class="pill-dark" href="#generator">
                <PlusIcon />
                Make yours
              </a>
            </figcaption>
          </figure>
        </section>

        <section class="promo-grid" aria-label="Highlights">
          <article class="promo">
            <h2>Ready for menus, tables and posters</h2>
            <p>Add a frame with your own call to action, then download a sharp PNG or SVG for print.</p>
            <button type="button" class="link-button" onClick={() => startWith(LINK_TAB, { design: "frame" })}>
              Add a frame
            </button>
          </article>
          <article class="promo">
            <h2>Links to QR vs. paid generators</h2>
            <p>Own your codes: no subscription, and no redirect that stops working when a plan ends.</p>
            <a class="link-button" href="#why">
              See why static codes last
            </a>
          </article>
        </section>

        <section class="quick-links" id="quick-links" aria-labelledby="quick-heading">
          <h2 id="quick-heading">Quick links to help you get started</h2>
          <div class="quick-grid">
            <button type="button" class="quick-card" onClick={() => startWith("wifi")}>
              <TabIcon id="wifi" />
              <strong>Wi-Fi codes</strong>
              <span>Let guests join without typing the password.</span>
            </button>
            <button type="button" class="quick-card" onClick={() => startWith("contact")}>
              <TabIcon id="contact" />
              <strong>Contact cards</strong>
              <span>Share your details in one scan.</span>
            </button>
            <button type="button" class="quick-card" onClick={() => startWith(LINK_TAB, { multiple: true })}>
              <TabIcon id="text" />
              <strong>Many links at once</strong>
              <span>Paste a list and download every code in one ZIP.</span>
            </button>
            <a class="quick-card" href="https://github.com/Habeeb9731/linkstoqr">
              <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />
              </svg>
              <strong>Open source</strong>
              <span>Read the code that makes your codes.</span>
            </a>
          </div>
        </section>

        <section class="why" id="why" aria-labelledby="why-heading">
          <h2 id="why-heading">Why make QR codes with Links to QR?</h2>
          <ul>
            {WHY_POINTS.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong> {text}
              </li>
            ))}
          </ul>
          <a class="button-link primary" href="#generator">
            Make one now
          </a>
        </section>
      </main>

      <footer class="site-footer">
        <div class="footer-brand">
          <a class="brand" href="/" aria-label="Links to QR home">
            <svg viewBox="0 0 256 256" aria-hidden="true">
              <path fill="currentColor" d="M34 34H202V134H166V70H70V166H134V202H34Z" />
              <rect class="brand-square" x="150" y="150" width="72" height="72" />
            </svg>
            Links to QR
          </a>
          <p>© {new Date().getFullYear()} Links to QR. Free, private QR codes that never expire.</p>
        </div>
        <nav aria-label="Footer">
          <a href="/privacy">Privacy</a>
          <a href="/impressum">Impressum</a>
          <a href="https://github.com/Habeeb9731/linkstoqr">Source code</a>
          <a href="#top">Back to top</a>
        </nav>
      </footer>
    </>
  );
}

function NameAndCategory(props: {
  name: string;
  category: string;
  onName: (value: string) => void;
  onCategory: (value: string) => void;
}) {
  return (
    <div class="name-fields">
      <div class="field">
        <label for="code-name">Name (optional)</label>
        <input id="code-name" type="text" value={props.name} onInput={(event) => props.onName(event.currentTarget.value)} />
      </div>
      <div class="field">
        <label for="code-category">Category (optional)</label>
        <input
          id="code-category"
          type="text"
          list="category-suggestions"
          value={props.category}
          onInput={(event) => props.onCategory(event.currentTarget.value)}
        />
        <datalist id="category-suggestions">
          {CATEGORY_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      <p class="hint">The name sets the file name. The category becomes a folder in the ZIP.</p>
    </div>
  );
}

function FormField(props: {
  field: Field;
  formId: string;
  values: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const { field, formId, values, onChange } = props;
  const id = `${formId}-${field.key}`;
  const value = values[field.key] ?? field.initial ?? "";

  if (field.showIf && (values[field.showIf.key] ?? "") === field.showIf.notValue) return null;

  if (field.type === "checkbox") {
    return (
      <label class="checkbox" for={id}>
        <input id={id} type="checkbox" checked={value === "true"} onChange={(event) => onChange(event.currentTarget.checked ? "true" : "")} />
        {field.label}
      </label>
    );
  }

  return (
    <div class="field">
      <label for={id}>{field.label}</label>
      {field.type === "textarea" ? (
        <textarea id={id} rows={3} class="short" value={value} placeholder={field.placeholder} onInput={(event) => onChange(event.currentTarget.value)} />
      ) : field.type === "select" ? (
        <select id={id} value={value} onChange={(event) => onChange(event.currentTarget.value)}>
          {field.options!.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={(field.type ?? "text") as "text"}
          value={value}
          placeholder={field.placeholder}
          autocomplete="off"
          spellcheck={false}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </div>
  );
}

function IconPicker(props: {
  label: string;
  icons: { id: string; title: string }[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  const { label, icons, value, onPick } = props;
  const labelId = `icons-${label.toLowerCase().replace(/\W+/g, "-")}`;
  const tiles = useMemo(() => icons.map((icon) => iconTile(icon.id)), [icons]);
  return (
    <div class="field wide">
      <span class="field-label" id={labelId}>
        {label}
      </span>
      <div class="icon-grid" role="radiogroup" aria-labelledby={labelId}>
        {icons.map((icon, index) => (
          <button
            key={icon.id}
            type="button"
            role="radio"
            aria-checked={value === icon.id}
            aria-label={icon.title}
            title={icon.title}
            onClick={() => onPick(icon.id)}
          >
            <img src={tiles[index]!} alt="" width={36} height={36} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceGrid<T extends string>(props: {
  label: string;
  choices: { value: T; label: string }[];
  value: T;
  options: QrOptions;
  preview: (value: T) => Partial<QrOptions>;
  onChange: (value: T) => void;
}) {
  const { label, choices, value, options, preview, onChange } = props;
  const thumbs = useMemo(
    () =>
      choices.map((choice) => {
        const svg = renderSvg(THUMB_MATRIX, { ...options, ecc: "M", size: 96, margin: 2, ...preview(choice.value) });
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
      }),
    // The preview function is rebuilt each render; the choices and options decide the thumbnails.
    [choices, options],
  );
  return (
    <div class="field wide">
      <span class="field-label" id={`${label}-label`}>
        {label}
      </span>
      <div class="choice-grid" role="radiogroup" aria-labelledby={`${label}-label`}>
        {choices.map((choice, index) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            onClick={() => onChange(choice.value)}
          >
            <img src={thumbs[index]} alt="" />
            <span>{choice.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg class="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg class="pill-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

function Card(props: { item: ResultItem; position: number; total: number; options: QrOptions; onRemove?: () => void }) {
  const { item, position, total, options, onRemove } = props;
  const value = item.value!;

  const preview = useMemo(() => {
    const matrix = encodeQr(value, options.ecc);
    const svg = renderSvg(matrix, options);
    const { width, height } = codeDimensions(matrix, options);
    return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, width, height };
  }, [value, options]);

  const download = (format: ImageFormat) => {
    const bytes = renderImage(value, options, format);
    const type = format === "png" ? "image/png" : "image/svg+xml";
    const base = fileBaseName(item.name || item.label, position, total);
    saveBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type }), `${base}.${format}`);
  };

  const title = item.name || item.label;

  return (
    <li class="card qr-card" data-testid="card">
      <div class="qr-card-media">
        <p class="qr-card-title" title={title}>
          {title}
        </p>
        <p class="qr-card-status">
          {preview.width > options.size ? (
            <span class="grown">Grown to {preview.width}px to stay scannable</span>
          ) : (
            <>
              <span class="status-dot" aria-hidden="true" />
              {item.modules}×{item.modules} modules
            </>
          )}
        </p>
        <img
          src={preview.src}
          alt={`QR code: ${title}`}
          width={200}
          height={Math.round((200 * preview.height) / preview.width)}
        />
      </div>
      <div class="qr-card-footer">
        <span class="qr-card-meta">
          <strong>{item.category || "QR code"}</strong>
          <span>
            {preview.width} × {preview.height} px
          </span>
        </span>
        <div class="card-actions">
          <button type="button" class="ghost" onClick={() => download("svg")}>
            SVG
          </button>
          <button type="button" class="pill-dark" onClick={() => download("png")}>
            <DownloadIcon />
            PNG
          </button>
          {onRemove && (
            <button type="button" class="remove" aria-label={`Remove ${title}`} onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
