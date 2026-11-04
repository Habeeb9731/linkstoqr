import { buildZip, encodeQr, parseLinks, QrTooLongError, type Ecc } from "@linkstoqr/qr-core";
import type { ResultItem, WorkerRequest, WorkerResponse } from "./protocol.ts";

const post = (message: WorkerResponse) => self.postMessage(message);

function checkFits(item: ResultItem, ecc: Ecc): ResultItem {
  if (!item.value) return item;
  try {
    return { ...item, modules: encodeQr(item.value, ecc).size };
  } catch (error) {
    if (error instanceof QrTooLongError) return { ...item, value: undefined, error: error.message };
    throw error;
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "analyze") {
      const links = parseLinks(request.text).map((line): ResultItem => ({
        key: `line-${line.line}`,
        line: line.line,
        value: line.value,
        label: line.value ?? line.input,
        error: line.error,
        name: request.linkName || undefined,
        category: request.linkCategory || undefined,
      }));
      const custom = request.custom.map((item): ResultItem => ({
        key: `custom-${item.id}`,
        customId: item.id,
        value: item.value,
        label: item.label,
        name: item.name,
        category: item.category,
      }));
      const items = [...links, ...custom].map((item) => checkFits(item, request.ecc));
      post({ type: "analyzed", jobId: request.jobId, items, ecc: request.ecc });
      return;
    }

    let lastReported = 0;
    const zip = buildZip(request.entries, request.options, request.format, (done, total) => {
      const now = Date.now();
      if (now - lastReported > 100 || done === total) {
        lastReported = now;
        post({ type: "zip-progress", jobId: request.jobId, done, total });
      }
    });
    const blob = new Blob([zip.slice().buffer as ArrayBuffer], { type: "application/zip" });
    post({ type: "zip-done", jobId: request.jobId, blob });
  } catch (error) {
    post({
      type: "failed",
      jobId: request.jobId,
      message: error instanceof Error ? error.message : "Something went wrong",
    });
  }
};
