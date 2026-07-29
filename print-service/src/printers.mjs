import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getWindowsPrinters } from "./windows.mjs";

const execFileAsync = promisify(execFile);

async function main() {
  if (process.platform === "win32") {
    const printers = await getWindowsPrinters();
    if (!printers.length) {
      console.log("Nenhuma impressora instalada no Windows.");
      return;
    }
    console.table(printers.map((printer) => ({
      Nome: printer.Name,
      Status: printer.PrinterStatus,
      Porta: printer.PortName,
      Driver: printer.DriverName,
      Padrao: Boolean(printer.Default),
    })));
    return;
  }

  const { stdout } = await execFileAsync("lpstat", ["-p", "-d"], { timeout: 20_000 });
  console.log(stdout.trim() || "Nenhuma fila CUPS encontrada.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
