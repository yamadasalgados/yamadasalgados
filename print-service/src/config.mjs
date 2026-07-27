import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { defaultChromePath, defaultSumatraPath } from "./platform.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");

function readEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

const fileEnv = readEnvFile();
const env = (name, fallback = "") => process.env[name] ?? fileEnv[name] ?? fallback;

export const config = {
  baseUrl: env("YAMADA_BASE_URL").replace(/\/+$/, ""),
  sellerId: env("YAMADA_SELLER_ID"),
  token: env("YAMADA_PRINT_TOKEN"),
  stationName: env("YAMADA_STATION_NAME", "Yamada Print Service"),
  printMode: env("PRINT_MODE", "preview").toLowerCase(),
  printerName: env("PRINTER_NAME"),
  chromePath: env("CHROME_PATH", defaultChromePath(ROOT)),
  sumatraPath: env("SUMATRA_PATH", defaultSumatraPath(ROOT)),
  lpOptions: env("LP_OPTIONS"),
  windowsPrintSettings: env("WINDOWS_PRINT_SETTINGS", "fit,portrait,monochrome"),
  copyDelayMs: Math.max(0, Number(env("COPY_DELAY_MS", "1000")) || 0),
  pollIntervalMs: Math.max(1000, Number(env("POLL_INTERVAL_MS", "3000")) || 3000),
  heartbeatIntervalMs: Math.max(10000, Number(env("HEARTBEAT_INTERVAL_MS", "30000")) || 30000),
};

export function assertConfig() {
  const missing = [];
  if (!config.baseUrl) missing.push("YAMADA_BASE_URL");
  if (!config.sellerId) missing.push("YAMADA_SELLER_ID");
  if (!config.token) missing.push("YAMADA_PRINT_TOKEN");
  if (["cups", "windows"].includes(config.printMode) && !config.printerName) missing.push("PRINTER_NAME");
  if (config.printMode === "windows" && !config.sumatraPath) missing.push("SUMATRA_PATH");
  if (!config.chromePath) missing.push("CHROME_PATH");
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(", ")}`);
  if (!["preview", "cups", "windows"].includes(config.printMode)) {
    throw new Error("PRINT_MODE deve ser preview, cups ou windows.");
  }
  if (config.printMode === "cups" && process.platform === "win32") {
    throw new Error("PRINT_MODE=cups não é compatível com Windows. Use PRINT_MODE=windows.");
  }
  if (config.printMode === "windows" && process.platform !== "win32") {
    throw new Error("PRINT_MODE=windows só pode ser executado no Windows.");
  }
}
