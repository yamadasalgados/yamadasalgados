import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { powershellPath } from "./platform.mjs";

const execFileAsync = promisify(execFile);

function psLiteral(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function normalizeJsonRows(stdout) {
  const trimmed = String(stdout ?? "").trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function runPowerShell(command, timeout = 20_000) {
  return execFileAsync(
    powershellPath(),
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    { timeout, maxBuffer: 4_000_000 },
  );
}

export async function getWindowsPrinters() {
  if (process.platform !== "win32") return [];

  const command = [
    "Get-Printer",
    "| Select-Object Name,PrinterStatus,PortName,DriverName,Default,Shared,WorkOffline",
    "| ConvertTo-Json -Compress",
  ].join(" ");

  const { stdout } = await runPowerShell(command);
  return normalizeJsonRows(stdout);
}

export async function findWindowsPrinter(name) {
  const printers = await getWindowsPrinters();
  return printers.find((printer) => printer.Name === name) ?? null;
}

export async function getWindowsPrintJobs(printerName) {
  if (process.platform !== "win32") return [];
  const command = [
    `Get-PrintJob -PrinterName ${psLiteral(printerName)} -ErrorAction SilentlyContinue`,
    "| Select-Object ID,DocumentName,JobStatus,SubmittedTime",
    "| ConvertTo-Json -Compress",
  ].join(" ");

  const { stdout } = await runPowerShell(command).catch(() => ({ stdout: "" }));
  return normalizeJsonRows(stdout);
}

export async function getSumatraPrinterReport(sumatraPath) {
  if (process.platform !== "win32") return "";
  const { stdout, stderr } = await execFileAsync(sumatraPath, ["-list-printers"], {
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 8_000_000,
  });
  return `${stdout || ""}${stderr || ""}`.trim();
}

export async function getWindowsFileVersion(filePath) {
  if (process.platform !== "win32") return "";
  const command = `(Get-Item ${psLiteral(filePath)}).VersionInfo.ProductVersion`;
  const { stdout } = await runPowerShell(command).catch(() => ({ stdout: "" }));
  return String(stdout ?? "").trim();
}
