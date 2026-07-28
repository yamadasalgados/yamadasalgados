import process from "node:process";

import { assertConfig, config } from "./config.mjs";
import { printJob } from "./printer.mjs";

async function main() {
  assertConfig();
  console.log("Teste local de impressão Yamada");
  console.log(`Modo: ${config.printMode}`);
  if (["windows", "cups"].includes(config.printMode)) {
    console.log(`Impressora: ${config.printerName}`);
  }

  const files = await printJob({
    jobId: `local-${Date.now()}`,
    type: "test",
    copies: "production",
    test: {
      storeName: "Yamada",
      message: "Se este papel saiu, o computador, o PDF, o driver e a impressora estão funcionando.",
    },
  });

  console.log("✓ Teste concluído.");
  for (const file of files) console.log(`PDF: ${file}`);
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
