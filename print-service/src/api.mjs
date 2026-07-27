import { config } from "./config.mjs";

const VERSION = "1.0.0";

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
      stationName: config.stationName,
      version: VERSION,
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
