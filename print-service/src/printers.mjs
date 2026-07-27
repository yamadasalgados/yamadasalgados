import { getWindowsPrinters } from "./windows.mjs";

async function main() {
  if (process.platform !== "win32") {
    console.error("Este comando lista impressoras somente no Windows.");
    process.exitCode = 1;
    return;
  }

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
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
