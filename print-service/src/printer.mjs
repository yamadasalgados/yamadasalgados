import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { config, ROOT } from "./config.mjs";
import { receiptDocument } from "./receipt.mjs";

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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function sendToCups(pdfPath) {
  const args = ["-d", config.printerName, ...splitOptions(config.lpOptions), pdfPath];
  const { stdout } = await execFileAsync("lp", args, { timeout: 30_000 });
  return stdout.trim();
}

function windowsPrintError(error) {
  const code = Number(error?.code);
  const messages = {
    2: "O SumatraPDF não conseguiu abrir o PDF.",
    3: "O documento não permite impressão.",
    4: `A impressora '${config.printerName}' não foi encontrada.`,
    5: "O driver ou a impressora recusou o trabalho.",
    6: "A impressão foi bloqueada por uma política do Windows.",
  };
  return messages[code] ?? `Falha ao imprimir no Windows${Number.isFinite(code) ? ` (código ${code})` : ""}.`;
}

async function sendToWindows(pdfPath) {
  const args = ["-silent", "-print-to", config.printerName];
  if (config.windowsPrintSettings.trim()) {
    args.push("-print-settings", config.windowsPrintSettings.trim());
  }
  args.push(pdfPath);

  try {
    await execFileAsync(config.sumatraPath, args, {
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
    });
  } catch (error) {
    const enhanced = new Error(windowsPrintError(error));
    enhanced.cause = error;
    throw enhanced;
  }
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
