import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { config, ROOT } from "./config.mjs";
import { receiptDocument } from "./receipt.mjs";
import {
  findWindowsPrinter,
  getSumatraPrinterReport,
  getWindowsFileVersion,
  getWindowsPrintJobs,
} from "./windows.mjs";

const execFileAsync = promisify(execFile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function splitOptions(value) {
  return value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

async function renderPdf(html, outputPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "yamada-print-"));
  const htmlPath = path.join(tempDir, "receipt.html");

  try {
    await fs.writeFile(htmlPath, html, "utf8");
    await execFileAsync(config.chromePath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 45_000, maxBuffer: 2_000_000 });

    const stats = await fs.stat(outputPath).catch(() => null);
    if (!stats || stats.size < 500) {
      throw new Error(`O navegador não gerou um PDF válido em ${outputPath}.`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function sendToCups(pdfPath) {
  const args = ["-d", config.printerName, ...splitOptions(config.lpOptions), pdfPath];
  const { stdout } = await execFileAsync("lp", args, { timeout: 30_000 });
  return stdout.trim();
}

function numericExitCode(error) {
  const parsed = Number(error?.code);
  return Number.isFinite(parsed) ? parsed : null;
}

function windowsPrintError(code) {
  const messages = {
    1: "O SumatraPDF terminou com o código não documentado 1.",
    2: "O SumatraPDF não conseguiu abrir o PDF.",
    3: "O documento não permite impressão.",
    4: `A impressora '${config.printerName}' não foi encontrada pelo SumatraPDF.`,
    5: "O driver ou a impressora recusou o trabalho.",
    6: "A impressão foi bloqueada por uma política do Windows.",
  };
  return messages[code] ?? `Falha ao imprimir no Windows${code !== null ? ` (código ${code})` : ""}.`;
}

async function runSumatra(pdfPath, settings) {
  const args = ["-silent", "-print-to", config.printerName];
  if (settings.trim()) args.push("-print-settings", settings.trim());
  args.push(pdfPath);

  try {
    const result = await execFileAsync(config.sumatraPath, args, {
      timeout: config.windowsPrintTimeoutMs,
      windowsHide: true,
      maxBuffer: 4_000_000,
    });
    return { ok: true, code: 0, args, stdout: result.stdout || "", stderr: result.stderr || "" };
  } catch (error) {
    return {
      ok: false,
      code: numericExitCode(error),
      args,
      stdout: String(error?.stdout ?? ""),
      stderr: String(error?.stderr ?? ""),
      raw: error,
    };
  }
}

async function queueAccepted(beforeIds) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const jobs = await getWindowsPrintJobs(config.printerName);
    if (jobs.some((job) => !beforeIds.has(String(job.ID)))) return true;
    await wait(200);
  }
  return false;
}

async function windowsDiagnostics(lastAttempt) {
  const [printer, version, report] = await Promise.all([
    findWindowsPrinter(config.printerName).catch(() => null),
    getWindowsFileVersion(config.sumatraPath).catch(() => ""),
    getSumatraPrinterReport(config.sumatraPath).catch(() => ""),
  ]);

  const details = [
    windowsPrintError(lastAttempt.code),
    `Impressora configurada: ${config.printerName}`,
    `SumatraPDF: ${config.sumatraPath}${version ? ` (versão ${version})` : ""}`,
    `Configuração tentada: ${lastAttempt.settings || "sem -print-settings"}`,
    printer
      ? `Windows: status=${printer.PrinterStatus ?? "?"}, porta=${printer.PortName ?? "?"}, driver=${printer.DriverName ?? "?"}`
      : "Windows: a impressora não foi encontrada por Get-Printer.",
    report.includes(config.printerName)
      ? "SumatraPDF: a impressora aparece em -list-printers."
      : "SumatraPDF: a impressora NÃO aparece em -list-printers.",
  ];

  const output = [lastAttempt.stdout, lastAttempt.stderr].map((value) => value.trim()).filter(Boolean).join(" | ");
  if (output) details.push(`Saída do SumatraPDF: ${output.slice(0, 1000)}`);
  details.push("Execute 'npm run print-test' em uma janela do PowerShell para testar sem depender da fila da Vercel.");
  return details.join("\n");
}

async function sendToWindows(pdfPath) {
  const beforeJobs = await getWindowsPrintJobs(config.printerName).catch(() => []);
  const beforeIds = new Set(beforeJobs.map((job) => String(job.ID)));
  const configuredSettings = config.windowsPrintSettings.trim();
  const attempts = configuredSettings ? [configuredSettings, ""] : [""];
  let lastAttempt = null;

  for (const [index, settings] of attempts.entries()) {
    const attempt = await runSumatra(pdfPath, settings);
    lastAttempt = { ...attempt, settings };
    if (attempt.ok) return;

    // O código 1 não faz parte da tabela oficial do SumatraPDF. Algumas versões
    // o retornam mesmo depois de entregar o trabalho ao spooler; confirmamos a fila.
    if (attempt.code === 1 && await queueAccepted(beforeIds)) {
      console.warn("SumatraPDF retornou código 1, mas o trabalho apareceu na fila do Windows; tratado como enviado.");
      return;
    }

    // Alguns drivers térmicos recusam opções avançadas. Tentamos uma única vez
    // sem -print-settings antes de considerar o trabalho perdido.
    if (attempt.code === 1 && index === 0 && attempts.length > 1) {
      console.warn("SumatraPDF retornou código 1; repetindo uma vez sem WINDOWS_PRINT_SETTINGS.");
      await wait(500);
      continue;
    }

    break;
  }

  const enhanced = new Error(await windowsDiagnostics(lastAttempt));
  enhanced.cause = lastAttempt?.raw;
  throw enhanced;
}

export async function printJob(job) {
  const copies = job.copies === "production"
    ? ["production"]
    : job.copies === "customer"
      ? ["customer"]
      : ["production", "customer"];

  const outputDir = path.join(ROOT, "output");
  await fs.mkdir(outputDir, { recursive: true });
  const outputFiles = [];

  for (const [index, copyType] of copies.entries()) {
    const document = receiptDocument(job, copyType);
    const filename = `${new Date().toISOString().replaceAll(":", "-")}_${job.jobId}_${copyType}.pdf`;
    const outputPath = path.join(outputDir, filename);
    await renderPdf(document.html, outputPath);
    outputFiles.push(outputPath);

    if (config.printMode === "cups") {
      await sendToCups(outputPath);
    } else if (config.printMode === "windows") {
      await sendToWindows(outputPath);
    }

    if (index < copies.length - 1 && config.copyDelayMs > 0) {
      await wait(config.copyDelayMs);
    }
  }

  return outputFiles;
}
