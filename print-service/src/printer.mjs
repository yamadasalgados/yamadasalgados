import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { config, ROOT, assertProfile } from "./config.mjs";
import { pngToEscPosRaster, sendEscPosTcp } from "./escpos.mjs";
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

async function withTempHtml(html, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "order-print-"));
  const htmlPath = path.join(tempDir, "receipt.html");
  try {
    await fs.writeFile(htmlPath, html, "utf8");
    return await callback(htmlPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function renderPdf(html, outputPath) {
  await withTempHtml(html, async (htmlPath) => {
    await execFileAsync(config.chromePath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 45_000, maxBuffer: 2_000_000 });
  });

  const stats = await fs.stat(outputPath).catch(() => null);
  if (!stats || stats.size < 500) throw new Error(`O navegador não gerou um PDF válido em ${outputPath}.`);
}

async function renderPng(document, outputPath, profile) {
  const width = Math.max(128, Number(profile.dotsPerLine) || 576);
  const height = Math.max(200, Math.min(65_000, Number(document.rasterHeightDots) || 1200));
  await withTempHtml(document.rasterHtml, async (htmlPath) => {
    await execFileAsync(config.chromePath, [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ], { timeout: 45_000, maxBuffer: 2_000_000 });
  });

  const stats = await fs.stat(outputPath).catch(() => null);
  if (!stats || stats.size < 200) throw new Error(`O navegador não gerou uma imagem válida em ${outputPath}.`);
}

async function sendToCups(pdfPath, profile) {
  const args = ["-d", profile.printerName, ...splitOptions(profile.lpOptions), pdfPath];
  const { stdout } = await execFileAsync("lp", args, { timeout: 30_000 });
  return stdout.trim();
}

function numericExitCode(error) {
  const parsed = Number(error?.code);
  return Number.isFinite(parsed) ? parsed : null;
}

function windowsPrintError(code, profile) {
  const messages = {
    1: "O SumatraPDF terminou com o código não documentado 1.",
    2: "O SumatraPDF não conseguiu abrir o PDF.",
    3: "O documento não permite impressão.",
    4: `A impressora '${profile.printerName}' não foi encontrada pelo SumatraPDF.`,
    5: "O driver ou a impressora recusou o trabalho.",
    6: "A impressão foi bloqueada por uma política do Windows.",
  };
  return messages[code] ?? `Falha ao imprimir no Windows${code !== null ? ` (código ${code})` : ""}.`;
}

async function runSumatra(pdfPath, settings, profile) {
  const args = ["-silent", "-print-to", profile.printerName];
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

async function queueAccepted(beforeIds, profile) {
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    const jobs = await getWindowsPrintJobs(profile.printerName);
    if (jobs.some((job) => !beforeIds.has(String(job.ID)))) return true;
    await wait(200);
  }
  return false;
}

async function windowsDiagnostics(lastAttempt, profile) {
  const [printer, version, report] = await Promise.all([
    findWindowsPrinter(profile.printerName).catch(() => null),
    getWindowsFileVersion(config.sumatraPath).catch(() => ""),
    getSumatraPrinterReport(config.sumatraPath).catch(() => ""),
  ]);

  const details = [
    windowsPrintError(lastAttempt.code, profile),
    `Perfil: ${profile.name} (${profile.id})`,
    `Impressora configurada: ${profile.printerName}`,
    `SumatraPDF: ${config.sumatraPath}${version ? ` (versão ${version})` : ""}`,
    `Configuração tentada: ${lastAttempt.settings || "sem -print-settings"}`,
    printer
      ? `Windows: status=${printer.PrinterStatus ?? "?"}, porta=${printer.PortName ?? "?"}, driver=${printer.DriverName ?? "?"}`
      : "Windows: a impressora não foi encontrada por Get-Printer.",
    report.includes(profile.printerName)
      ? "SumatraPDF: a impressora aparece em -list-printers."
      : "SumatraPDF: a impressora NÃO aparece em -list-printers.",
  ];
  const output = [lastAttempt.stdout, lastAttempt.stderr].map((value) => value.trim()).filter(Boolean).join(" | ");
  if (output) details.push(`Saída do SumatraPDF: ${output.slice(0, 1000)}`);
  details.push("Execute 'npm run print-test' para testar sem depender da fila online.");
  return details.join("\n");
}

async function sendToWindows(pdfPath, profile) {
  const beforeJobs = await getWindowsPrintJobs(profile.printerName).catch(() => []);
  const beforeIds = new Set(beforeJobs.map((job) => String(job.ID)));
  const configuredSettings = profile.windowsPrintSettings.trim();
  const attempts = configuredSettings ? [configuredSettings, ""] : [""];
  let lastAttempt = null;

  for (const [index, settings] of attempts.entries()) {
    const attempt = await runSumatra(pdfPath, settings, profile);
    lastAttempt = { ...attempt, settings };
    if (attempt.ok) return;
    if (attempt.code === 1 && await queueAccepted(beforeIds, profile)) {
      console.warn("SumatraPDF retornou código 1, mas o trabalho apareceu na fila do Windows; tratado como enviado.");
      return;
    }
    if (attempt.code === 1 && index === 0 && attempts.length > 1) {
      console.warn("SumatraPDF retornou código 1; repetindo uma vez sem ajustes avançados.");
      await wait(500);
      continue;
    }
    break;
  }

  const enhanced = new Error(await windowsDiagnostics(lastAttempt, profile));
  enhanced.cause = lastAttempt?.raw;
  throw enhanced;
}

function copyTypes(copies) {
  return copies === "production" ? ["production"] : copies === "customer" ? ["customer"] : ["production", "customer"];
}

export async function printJob(job, profile) {
  assertProfile(profile);
  const copies = copyTypes(job.copies || profile.copies);
  const outputDir = path.join(ROOT, "output");
  await fs.mkdir(outputDir, { recursive: true });
  const outputFiles = [];

  for (const [index, copyType] of copies.entries()) {
    const document = receiptDocument(job, copyType, profile);
    const baseName = `${new Date().toISOString().replaceAll(":", "-")}_${job.jobId}_${copyType}`;

    if (profile.connectionMode === "tcp") {
      const pngPath = path.join(outputDir, `${baseName}.png`);
      const escposPath = path.join(outputDir, `${baseName}.escpos`);
      await renderPng(document, pngPath, profile);
      const escpos = pngToEscPosRaster(await fs.readFile(pngPath), profile);
      await fs.writeFile(escposPath, escpos);
      await sendEscPosTcp(escpos, profile, config.tcpTimeoutMs);
      outputFiles.push(pngPath, escposPath);
    } else {
      const pdfPath = path.join(outputDir, `${baseName}.pdf`);
      await renderPdf(document.html, pdfPath);
      outputFiles.push(pdfPath);
      if (profile.connectionMode === "cups") await sendToCups(pdfPath, profile);
      else if (profile.connectionMode === "windows") await sendToWindows(pdfPath, profile);
    }

    if (index < copies.length - 1 && profile.copyDelayMs > 0) await wait(profile.copyDelayMs);
  }

  return outputFiles;
}
