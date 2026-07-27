import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

const file = path.join(ROOT, "state", "printed.json");
let cache = null;

async function read() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await fs.readFile(file, "utf8"));
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
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
}
