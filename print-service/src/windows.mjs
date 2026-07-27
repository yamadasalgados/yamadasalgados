import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { powershellPath } from "./platform.mjs";

const execFileAsync = promisify(execFile);

export async function getWindowsPrinters() {
  if (process.platform !== "win32") return [];

  const command = [
    "Get-Printer",
    "| Select-Object Name,PrinterStatus,PortName,DriverName,Default",
    "| ConvertTo-Json -Compress",
  ].join(" ");

  const { stdout } = await execFileAsync(
    powershellPath(),
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    { timeout: 20_000, maxBuffer: 2_000_000 },
  );

  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

export async function findWindowsPrinter(name) {
  const printers = await getWindowsPrinters();
  return printers.find((printer) => printer.Name === name) ?? null;
}
