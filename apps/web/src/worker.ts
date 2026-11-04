import { buildZip, encodeQr, parseLinks, QrTooLongError } from "@linkstoqr/qr-core";
import type { ResultItem, WorkerRequest, WorkerResponse } from "./protocol.ts";

const post = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "analyze") {
      const items = parseLinks(request.text).map((line): ResultItem => {
        if (!line.value) return line;
        try {
          return { ...line, modules: encodeQr(line.value, request.ecc).size };
        } catch (error) {
          if (error instanceof QrTooLongError) return { ...line, value: undefined, error: error.message };
          throw error;
        }
      });
      post({ type: "analyzed", jobId: request.jobId, items, ecc: request.ecc });
      return;
    }

    let lastReported = 0;
    const zip = buildZip(request.values, request.options, request.format, (done, total) => {
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
