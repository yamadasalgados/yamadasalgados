import path from "node:path";
import process from "node:process";

import { api, serviceVersion } from "./api.mjs";
import { assertBaseConfig, assertProfile, config, resolveProfile } from "./config.mjs";
import { printJob } from "./printer.mjs";
import { markPrinted, readProfileCache, saveProfileCache, wasPrinted } from "./state.mjs";

const once = process.argv.includes("--once");
let stopping = false;
let lastHeartbeat = 0;
let runtimeProfile = resolveProfile(await readProfileCache());

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function applyProfile(remoteProfile) {
  if (!remoteProfile) return;
  runtimeProfile = resolveProfile(remoteProfile);
  void saveProfileCache(remoteProfile).catch(() => undefined);
}

async function heartbeatIfNeeded() {
  if (Date.now() - lastHeartbeat < config.heartbeatIntervalMs) return;
  const payload = await api.heartbeat();
  applyProfile(payload.profile);
  lastHeartbeat = Date.now();
  const status = payload.printingEnabled === false ? "impressão global pausada" : "fila ativa";
  console.log(`[${new Date().toLocaleTimeString()}] Estação conectada · ${runtimeProfile.name} · ${runtimeProfile.connectionMode} · ${status}.`);
}

async function cycle() {
  await heartbeatIfNeeded();
  const payload = await api.claim();
  applyProfile(payload.profile);
  const { job } = payload;
  if (!job) return false;

  console.log(`[${new Date().toLocaleTimeString()}] Trabalho recebido: ${job.jobId}`);
  try {
    assertProfile(runtimeProfile);
    if (await wasPrinted(job.jobId)) {
      await api.complete(job.jobId, []);
      console.log(`Trabalho ${job.jobId} já impresso nesta estação; confirmação reenviada.`);
      return true;
    }

    const outputFiles = await printJob(job, runtimeProfile);
    await markPrinted(job.jobId, outputFiles);
    await api.complete(job.jobId, outputFiles.map((file) => path.basename(file)));
    console.log(`Trabalho ${job.jobId} concluído (${runtimeProfile.connectionMode}).`);
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
  assertBaseConfig();
  console.log(`Order Print Service ${serviceVersion}`);
  console.log(`Sistema: ${process.platform}/${process.arch}`);
  console.log(`Seller: ${config.sellerId}`);
  console.log(`Perfil: ${config.profileId}`);

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
