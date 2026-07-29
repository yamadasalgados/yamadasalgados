import process from "node:process";

import { api } from "./api.mjs";
import { assertBaseConfig, assertProfile, resolveProfile } from "./config.mjs";
import { printJob } from "./printer.mjs";

async function main() {
  assertBaseConfig();
  const heartbeat = await api.heartbeat();
  const profile = resolveProfile(heartbeat.profile);
  assertProfile(profile);
  console.log("Teste local do Print Service");
  console.log(`Perfil: ${profile.name} (${profile.id})`);
  console.log(`Modo: ${profile.connectionMode}`);
  if (["windows", "cups"].includes(profile.connectionMode)) console.log(`Impressora: ${profile.printerName}`);
  if (profile.connectionMode === "tcp") console.log(`Destino: ${profile.networkHost}:${profile.networkPort}`);

  const files = await printJob({
    jobId: `local-${Date.now()}`,
    type: "test",
    copies: "production",
    test: {
      storeName: "Loja de teste",
      message: "Se este papel saiu, o perfil, a conexão e a impressora estão funcionando.",
    },
  }, profile);

  console.log("✓ Teste concluído.");
  for (const file of files) console.log(`Arquivo: ${file}`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
