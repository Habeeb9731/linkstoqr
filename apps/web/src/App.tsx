import {
  DEFAULT_OPTIONS,
  designWarnings,
  encodeQr,
  fileBaseName,
  layoutQr,
  MARGIN_RANGE,
  renderImage,
  renderSvg,
  SIZE_RANGE,
  type Ecc,
  type ImageFormat,
  type QrOptions,
} from "@linkstoqr/qr-core";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ResultItem, WorkerRequest, WorkerResponse } from "./protocol.ts";

const SAMPLE = "https://example.com\nexample.org/menu\nhttps://example.net/tickets?event=spring";

const PREVIEW_BATCH = 60;
const MAX_LISTED_ERRORS = 100;

const ECC_CHOICES: { value: Ecc; label: string; hint: string }[] = [
  { value: "L", label: "Low", hint: "7%" },
  { value: "M", label: "Medium", hint: "15%" },
  { value: "Q", label: "Quartile", hint: "25%" },
  { value: "H", label: "High", hint: "30%" },
];

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
  const [text, setText] = useState("");
  const [options, setOptions] = useState<QrOptions>(DEFAULT_OPTIONS);
  const [sizeInput, setSizeInput] = useState(String(DEFAULT_OPTIONS.size));
  const [items, setItems] = useState<ResultItem[]>([]);
  // The level `items` were checked against. Links that fit at Low may not fit at High,
  // so previews must not use a new level until the worker has re-checked them.
  const [checkedEcc, setCheckedEcc] = useState<Ecc>(DEFAULT_OPTIONS.ecc);
  const [analyzing, setAnalyzing] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const [previewCount, setPreviewCount] = useState(PREVIEW_BATCH);
  const moreSentinel = useRef<HTMLDivElement>(null);

  const worker = useRef<Worker | undefined>(undefined);
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

  useEffect(() => {
    const jobId = ++latestAnalyzeJob.current;
    setFailure(null);
    if (!text.trim()) {
      setItems([]);
      setAnalyzing(false);
      return;
    }
    setAnalyzing(true);
    const timer = setTimeout(() => send({ type: "analyze", jobId, text, ecc: options.ecc }), 150);
    return () => clearTimeout(timer);
  }, [text, options.ecc]);

  const update = (change: Partial<QrOptions>) => setOptions((current) => ({ ...current, ...change }));
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

  // Only what's on screen is rendered. Every link is still in the ZIP.
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
      values: valid.map((item) => item.value!),
      options,
      format,
    });
  };

  return (
    <>
      <header class="site-header">
        <a class="brand" href="/" aria-label="Links to QR home">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill-rule="evenodd" d="M2 2h9v9H2zM4.5 4.5v4h4v-4zM13 2h9v9h-9zm2.5 2.5v4h4v-4zM2 13h9v9H2zm2.5 2.5v4h4v-4z" />
            <path d="M13 13h4v4h-4zM18 18h4v4h-4z" />
          </svg>
          Links to QR
        </a>
        <span class="badge">Free. No sign-up.</span>
      </header>

      <main>
        <section class="intro">
          <h1>Paste your links. Get your QR codes.</h1>
          <p>
            Your links stay in this browser. Each code contains the link itself, so it keeps working even if this
            site goes away.
          </p>
        </section>

        <div class="workspace">
          <section class="panel input-panel" aria-label="Links and options">
            <div class="field">
              <div class="field-heading">
                <label for="links">Links, one per line</label>
                {!text && (
                  <button type="button" class="link-button" onClick={() => setText(SAMPLE)}>
                    Try an example
                  </button>
                )}
              </div>
              <textarea
                id="links"
                value={text}
                rows={9}
                spellcheck={false}
                autocapitalize="off"
                autocomplete="off"
                placeholder={"https://example.com/menu\nexample.com/tickets"}
                onInput={(event) => setText(event.currentTarget.value)}
              />
            </div>

            <div class="options">
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
            </div>

            {warnings.length > 0 && (
              <ul class="warnings" data-testid="warnings">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
          </section>

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
              {valid.length > 0 && (
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
                  <li key={item.line}>
                    <strong>Line {item.line}:</strong> {item.error}
                    <code>{item.input.length > 80 ? `${item.input.slice(0, 80)}…` : item.input}</code>
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
                    <Card key={item.line} item={item} position={index + 1} total={valid.length} options={cardOptions} />
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

        <ul class="promises">
          <li>
            <strong>Private</strong> Codes are made on your device, and links never reach our servers.
          </li>
          <li>
            <strong>Permanent</strong> Codes hold your link directly, with no redirect that can expire.
          </li>
          <li>
            <strong>Free</strong> No ads, watermarks, tracking or limits on codes.
          </li>
        </ul>
      </main>

      <footer class="site-footer">
        <a href="/privacy">Privacy</a>
        <a href="/impressum">Impressum</a>
        <a href="https://github.com/Habeeb9731/linkstoqr">Source code</a>
      </footer>
    </>
  );
}

function Card(props: { item: ResultItem; position: number; total: number; options: QrOptions }) {
  const { item, position, total, options } = props;
  const value = item.value!;
  const preview = useMemo(() => {
    const matrix = encodeQr(value, options.ecc);
    const svg = renderSvg(matrix, options);
    const outputSize = layoutQr(matrix, options).outputSize;
    return { src: `data:image/svg+xml,${encodeURIComponent(svg)}`, outputSize };
  }, [value, options]);

  const download = (format: ImageFormat) => {
    const bytes = renderImage(value, options, format);
    const type = format === "png" ? "image/png" : "image/svg+xml";
    saveBlob(new Blob([bytes.slice().buffer as ArrayBuffer], { type }), `${fileBaseName(value, position, total)}.${format}`);
  };

  return (
    <li class="card" data-testid="card">
      <div class="preview">
        <img src={preview.src} alt={`QR code for ${value}`} width={200} height={200} />
      </div>
      <p class="card-link" title={value}>
        {value}
      </p>
      <div class="card-meta">
        {preview.outputSize > options.size ? (
          <span class="grown">Grown to {preview.outputSize}px to stay scannable</span>
        ) : (
          <span>
            {item.modules}×{item.modules} modules
          </span>
        )}
      </div>
      <div class="card-actions">
        <button type="button" onClick={() => download("png")}>
          PNG
        </button>
        <button type="button" onClick={() => download("svg")}>
          SVG
        </button>
      </div>
    </li>
  );
}
