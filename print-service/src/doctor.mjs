import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";

import { api } from "./api.mjs";
import { assertConfig, config } from "./config.mjs";
import {
  findWindowsPrinter,
  getSumatraPrinterReport,
  getWindowsFileVersion,
} from "./windows.mjs";

const execFileAsync = promisify(execFile);

async function main() {
  assertConfig();
  console.log(`✓ Configuração básica preenchida (${process.platform})`);

  if (!fs.existsSync(config.chromePath)) {
    throw new Error(`Chrome/Edge não encontrado em: ${config.chromePath}`);
  }
  console.log(`✓ Navegador encontrado: ${config.chromePath}`);

  if (config.printMode === "cups") {
    const { stdout } = await execFileAsync("lpstat", ["-p"]);
    if (!stdout.includes(`printer ${config.printerName} `)) {
      throw new Error(`Fila CUPS não encontrada: ${config.printerName}\n${stdout}`);
    }
    console.log(`✓ Impressora CUPS encontrada: ${config.printerName}`);
  } else if (config.printMode === "windows") {
    if (!fs.existsSync(config.sumatraPath)) {
      throw new Error(`SumatraPDF não encontrado em: ${config.sumatraPath}`);
    }
    const version = await getWindowsFileVersion(config.sumatraPath);
    console.log(`✓ SumatraPDF encontrado: ${config.sumatraPath}${version ? ` (versão ${version})` : ""}`);

    const printer = await findWindowsPrinter(config.printerName);
    if (!printer) {
      throw new Error(`Impressora do Windows não encontrada: ${config.printerName}\nExecute: npm run printers`);
    }
    console.log(`✓ Impressora do Windows encontrada: ${printer.Name}`);
    console.log(`  Driver: ${printer.DriverName || "não informado"}`);
    console.log(`  Porta: ${printer.PortName || "não informada"}`);
    console.log(`  Status: ${printer.PrinterStatus ?? "não informado"}`);

    if (/Microsoft Print to PDF|OneNote/i.test(printer.Name)) {
      console.warn("⚠ Esta impressora virtual abre uma janela e não é indicada para impressão automática.");
    }
    if (printer.WorkOffline === true) {
      console.warn("⚠ O Windows marcou esta impressora como offline.");
    }

    const report = await getSumatraPrinterReport(config.sumatraPath);
    if (!report.includes(config.printerName)) {
      throw new Error(
        `O Windows encontra '${config.printerName}', mas o SumatraPDF não.\n` +
        "Instale/atualize o SumatraPDF e confirme o nome com SumatraPDF.exe -list-printers.",
      );
    }
    console.log("✓ SumatraPDF também reconhece a impressora");
    console.log(`  Ajustes: ${config.windowsPrintSettings || "nenhum"}`);
  } else {
    console.log("✓ Modo preview: PDFs serão gerados em output/");
  }

  await api.heartbeat();
  console.log("✓ API da Vercel aceitou a estação");
  console.log("Tudo pronto.");
  if (config.printMode === "windows") {
    console.log("Próximo teste recomendado: npm run print-test");
  }
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
