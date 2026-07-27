import path from "node:path";
import process from "node:process";

import { api } from "./api.mjs";
import { assertConfig, config } from "./config.mjs";
import { printJob } from "./printer.mjs";
import { markPrinted, wasPrinted } from "./state.mjs";

const once = process.argv.includes("--once");
let stopping = false;
let lastHeartbeat = 0;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function heartbeatIfNeeded() {
  if (Date.now() - lastHeartbeat < config.heartbeatIntervalMs) return;
  await api.heartbeat();
  lastHeartbeat = Date.now();
  console.log(`[${new Date().toLocaleTimeString()}] Estação conectada.`);
}

async function cycle() {
  await heartbeatIfNeeded();
  const { job } = await api.claim();
  if (!job) return false;

  console.log(`[${new Date().toLocaleTimeString()}] Trabalho recebido: ${job.jobId}`);
  try {
    if (await wasPrinted(job.jobId)) {
      await api.complete(job.jobId, []);
      console.log(`Trabalho ${job.jobId} já impresso neste computador; confirmação reenviada.`);
      return true;
    }

    const outputFiles = await printJob(job);
    await markPrinted(job.jobId, outputFiles);
    await api.complete(job.jobId, outputFiles.map((file) => path.basename(file)));
    console.log(`Trabalho ${job.jobId} concluído (${config.printMode}).`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Falha no trabalho ${job.jobId}:`, message);
    try {
      await api.fail(job.jobId, message);
    } catch (reportError) {
      console.error("Falha ao reportar erro:", reportError);
    }
    return true;
  }
}

async function main() {
  assertConfig();
  console.log("Yamada Print Service 1.1.0");
  console.log(`Sistema: ${process.platform}`);
  console.log(`Modo: ${config.printMode}`);
  if (["cups", "windows"].includes(config.printMode)) {
    console.log(`Impressora: ${config.printerName}`);
  }

  while (!stopping) {
    try {
      const worked = await cycle();
      if (once) break;
      if (!worked) await wait(config.pollIntervalMs);
    } catch (error) {
      console.error(`[${new Date().toLocaleTimeString()}]`, error instanceof Error ? error.message : error);
      if (once) throw error;
      await wait(Math.max(config.pollIntervalMs, 5000));
    }
  }
}

process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
