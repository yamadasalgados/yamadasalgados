import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import process from "node:process";
import { promisify } from "node:util";

import { api } from "./api.mjs";
import { assertBaseConfig, assertProfile, config, resolveProfile } from "./config.mjs";
import {
  findWindowsPrinter,
  getSumatraPrinterReport,
  getWindowsFileVersion,
} from "./windows.mjs";

const execFileAsync = promisify(execFile);

async function testTcp(profile) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: profile.networkHost, port: profile.networkPort });
    socket.setTimeout(5000, () => socket.destroy(new Error("Tempo esgotado.")));
    socket.once("connect", () => { socket.end(); resolve(); });
    socket.once("error", reject);
  });
}

async function main() {
  assertBaseConfig();
  const heartbeat = await api.heartbeat();
  const profile = resolveProfile(heartbeat.profile);
  assertProfile(profile);
  console.log(`✓ API aceitou a estação (${process.platform}/${process.arch})`);
  console.log(`✓ Perfil recebido: ${profile.name} (${profile.id})`);
  console.log(`  Modo: ${profile.connectionMode} · papel ${profile.paperWidthMm} mm · ${profile.dotsPerLine} pontos`);
  if (heartbeat.printingEnabled === false) {
    console.warn("⚠ A impressão global está pausada no painel. A estação conecta, mas não recebe novos trabalhos.");
  }

  if (!fs.existsSync(config.chromePath)) throw new Error(`Chrome/Edge/Chromium não encontrado em: ${config.chromePath}`);
  console.log(`✓ Navegador encontrado: ${config.chromePath}`);

  if (profile.connectionMode === "cups") {
    const { stdout } = await execFileAsync("lpstat", ["-p"]);
    if (!stdout.includes(`printer ${profile.printerName} `)) throw new Error(`Fila CUPS não encontrada: ${profile.printerName}\n${stdout}`);
    console.log(`✓ Fila CUPS encontrada: ${profile.printerName}`);
  } else if (profile.connectionMode === "windows") {
    if (!fs.existsSync(config.sumatraPath)) throw new Error(`SumatraPDF não encontrado em: ${config.sumatraPath}`);
    const version = await getWindowsFileVersion(config.sumatraPath);
    console.log(`✓ SumatraPDF encontrado: ${config.sumatraPath}${version ? ` (versão ${version})` : ""}`);
    const printer = await findWindowsPrinter(profile.printerName);
    if (!printer) throw new Error(`Impressora do Windows não encontrada: ${profile.printerName}\nExecute: npm run printers`);
    console.log(`✓ Impressora do Windows encontrada: ${printer.Name}`);
    console.log(`  Driver: ${printer.DriverName || "não informado"}`);
    console.log(`  Porta: ${printer.PortName || "não informada"}`);
    if (printer.WorkOffline === true) console.warn("⚠ O Windows marcou esta impressora como offline.");
    const report = await getSumatraPrinterReport(config.sumatraPath);
    if (!report.includes(profile.printerName)) throw new Error(`O SumatraPDF não reconheceu '${profile.printerName}'.`);
    console.log("✓ SumatraPDF também reconhece a impressora");
  } else if (profile.connectionMode === "tcp") {
    await testTcp(profile);
    console.log(`✓ Porta TCP acessível: ${profile.networkHost}:${profile.networkPort}`);
    console.log(`  Intensidade: ${profile.intensity}%${profile.useAdvancedThreshold ? ` · limiar ${profile.rasterThreshold}` : ""}`);
  } else {
    console.log("✓ Modo preview: arquivos serão gerados em output/");
  }

  console.log("Tudo pronto. Próximo teste: npm run print-test");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
