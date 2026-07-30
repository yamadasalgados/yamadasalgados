import process from "node:process";

import { config } from "./config.mjs";

const VERSION = "2.2.0";
const capabilities = ["preview", "windows", "cups", "tcp-escpos-raster", "paper-58", "paper-80", "custom-receipts-qr", "event-production-summary"];

async function request(action, extra = {}) {
  const response = await fetch(`${config.baseUrl}/api/print/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      sellerId: config.sellerId,
      profileId: config.profileId,
      stationName: config.stationName,
      version: VERSION,
      platform: process.platform,
      arch: process.arch,
      capabilities,
      ...extra,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.code = payload.code || "PRINT_API_FAILED";
    throw error;
  }
  return payload;
}

export const api = {
  heartbeat: () => request("heartbeat"),
  claim: () => request("claim"),
  complete: (jobId, outputFiles = []) => request("complete", { jobId, outputFiles }),
  fail: (jobId, error) => request("fail", { jobId, error: String(error).slice(0, 1000) }),
};

export const serviceVersion = VERSION;
