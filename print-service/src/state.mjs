import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

const printedFile = path.join(ROOT, "state", "printed.json");
const profileFile = path.join(ROOT, "state", "profile-cache.json");
let cache = null;

async function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(printedFile, "utf8"));
  } catch {
    cache = { jobs: {} };
  }
  return cache;
}

export async function wasPrinted(jobId) {
  const state = await read();
  return Boolean(state.jobs?.[jobId]);
}

export async function markPrinted(jobId, outputFiles) {
  const state = await read();
  state.jobs[jobId] = { printedAt: new Date().toISOString(), outputFiles };
  const entries = Object.entries(state.jobs).slice(-1000);
  state.jobs = Object.fromEntries(entries);
  await fs.mkdir(path.dirname(printedFile), { recursive: true });
  await fs.writeFile(printedFile, JSON.stringify(state, null, 2), "utf8");
}

export async function saveProfileCache(profile) {
  await fs.mkdir(path.dirname(profileFile), { recursive: true });
  await fs.writeFile(profileFile, JSON.stringify({ savedAt: new Date().toISOString(), profile }, null, 2), "utf8");
}

export async function readProfileCache() {
  try {
    const parsed = JSON.parse(await fs.readFile(profileFile, "utf8"));
    return parsed?.profile && typeof parsed.profile === "object" ? parsed.profile : null;
  } catch {
    return null;
  }
}
