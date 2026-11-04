import type { ImageFormat, QrOptions } from "@linkstoqr/qr-core";

export interface ResultItem {
  line: number;
  input: string;
  value?: string;
  error?: string;
  /** Modules per side, excluding the margin. */
  modules?: number;
}

export type WorkerRequest =
  | { type: "analyze"; jobId: number; text: string; ecc: QrOptions["ecc"] }
  | { type: "zip"; jobId: number; values: string[]; options: QrOptions; format: ImageFormat };

export type WorkerResponse =
  | { type: "analyzed"; jobId: number; items: ResultItem[]; ecc: QrOptions["ecc"] }
  | { type: "zip-progress"; jobId: number; done: number; total: number }
  | { type: "zip-done"; jobId: number; blob: Blob }
  | { type: "failed"; jobId: number; message: string };
