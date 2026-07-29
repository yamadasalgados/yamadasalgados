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
const envFirst = (names, fallback = "") => {
  for (const name of names) {
    const value = env(name).trim();
    if (value) return value;
  }
  return fallback;
};
const bool = (name, fallback) => {
  const value = env(name, fallback ? "true" : "false").trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(value);
};
const integer = (name, fallback, minimum, maximum) => {
  const parsed = Number(env(name, String(fallback)));
  return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
};

const localPaperWidth = integer("PAPER_WIDTH_MM", 80, 58, 80) === 58 ? 58 : 80;
const localDotsDefault = localPaperWidth === 58 ? 384 : 576;

export const config = {
  // YAMADA_* permanece somente para migrar instalações antigas.
  baseUrl: envFirst(["PRINT_BASE_URL", "YAMADA_BASE_URL"]).replace(/\/+$/, ""),
  sellerId: envFirst(["PRINT_SELLER_ID", "YAMADA_SELLER_ID"]),
  profileId: envFirst(["PRINT_PROFILE_ID"], "legacy"),
  token: envFirst(["PRINT_STATION_TOKEN", "YAMADA_PRINT_TOKEN"]),
  stationName: envFirst(["PRINT_STATION_NAME", "YAMADA_STATION_NAME"], "Order Print Service"),
  chromePath: envFirst(["CHROME_PATH"], defaultChromePath(ROOT)),
  sumatraPath: envFirst(["SUMATRA_PATH"], defaultSumatraPath(ROOT)),
  pollIntervalMs: Math.max(1000, Number(env("POLL_INTERVAL_MS", "3000")) || 3000),
  heartbeatIntervalMs: Math.max(10_000, Number(env("HEARTBEAT_INTERVAL_MS", "30000")) || 30_000),
  tcpTimeoutMs: Math.max(3000, Number(env("TCP_TIMEOUT_MS", "15000")) || 15_000),
  useLocalProfile: bool("PRINT_USE_LOCAL_PROFILE", false),
  localProfile: {
    id: envFirst(["PRINT_PROFILE_ID"], "legacy"),
    name: env("PRINT_PROFILE_NAME", "Impressora local"),
    stationName: envFirst(["PRINT_STATION_NAME", "YAMADA_STATION_NAME"], "Order Print Service"),
    enabled: true,
    autoPrint: true,
    copies: env("PRINT_COPIES", "both"),
    connectionMode: env("PRINT_MODE", "preview").toLowerCase(),
    printerName: env("PRINTER_NAME"),
    networkHost: env("PRINTER_HOST"),
    networkPort: integer("PRINTER_PORT", 9100, 1, 65535),
    paperWidthMm: localPaperWidth,
    dpi: integer("PRINTER_DPI", 203, 180, 600),
    dotsPerLine: integer("DOTS_PER_LINE", localDotsDefault, 128, 2048),
    intensity: integer("RASTER_INTENSITY", 55, 0, 100),
    useAdvancedThreshold: Boolean(env("RASTER_THRESHOLD").trim()),
    rasterThreshold: integer("RASTER_THRESHOLD", 168, 1, 254),
    cutAfterPrint: bool("CUT_AFTER_PRINT", true),
    feedLines: integer("FEED_LINES", 4, 0, 20),
    windowsPrintSettings: env("WINDOWS_PRINT_SETTINGS", "fit"),
    lpOptions: env("LP_OPTIONS"),
    copyDelayMs: Math.max(0, Number(env("COPY_DELAY_MS", "1000")) || 0),
  },
  windowsPrintTimeoutMs: Math.max(10_000, Number(env("WINDOWS_PRINT_TIMEOUT_MS", "60000")) || 60_000),
};

function bounded(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? Math.round(parsed) : fallback));
}

function normalizeMode(value) {
  return ["preview", "windows", "cups", "tcp", "local"].includes(value) ? value : "preview";
}

export function resolveProfile(remoteValue = null) {
  const remote = remoteValue && typeof remoteValue === "object" ? remoteValue : {};
  const useLocal = config.useLocalProfile || normalizeMode(remote.connectionMode) === "local";
  const source = useLocal ? config.localProfile : { ...config.localProfile, ...remote };
  const paperWidthMm = Number(source.paperWidthMm) === 58 ? 58 : 80;
  const dotsSource = !useLocal && remote.dotsPerLine == null
    ? (paperWidthMm === 58 ? 384 : 576)
    : source.dotsPerLine;
  return {
    id: String(source.id || config.profileId || "legacy"),
    name: String(source.name || "Impressora principal"),
    stationName: String(source.stationName || config.stationName),
    enabled: source.enabled !== false,
    autoPrint: source.autoPrint !== false,
    copies: ["production", "customer"].includes(source.copies) ? source.copies : "both",
    connectionMode: normalizeMode(source.connectionMode),
    printerName: String(source.printerName || ""),
    networkHost: String(source.networkHost || ""),
    networkPort: bounded(source.networkPort, 9100, 1, 65535),
    paperWidthMm,
    dpi: bounded(source.dpi, 203, 180, 600),
    dotsPerLine: bounded(dotsSource, paperWidthMm === 58 ? 384 : 576, 128, 2048),
    intensity: bounded(source.intensity, 55, 0, 100),
    useAdvancedThreshold: source.useAdvancedThreshold === true,
    rasterThreshold: bounded(source.rasterThreshold, 168, 1, 254),
    cutAfterPrint: source.cutAfterPrint !== false,
    feedLines: bounded(source.feedLines, 4, 0, 20),
    windowsPrintSettings: String(source.windowsPrintSettings || "fit"),
    lpOptions: String(source.lpOptions || ""),
    copyDelayMs: bounded(source.copyDelayMs, 1000, 0, 30_000),
  };
}

export function assertBaseConfig() {
  const missing = [];
  if (!config.baseUrl) missing.push("PRINT_BASE_URL");
  if (!config.sellerId) missing.push("PRINT_SELLER_ID");
  if (!config.profileId) missing.push("PRINT_PROFILE_ID");
  if (!config.token) missing.push("PRINT_STATION_TOKEN");
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(", ")}`);
}

export function assertProfile(profile) {
  const missing = [];
  if (["preview", "windows", "cups", "tcp"].includes(profile.connectionMode) && !config.chromePath) {
    missing.push("CHROME_PATH");
  }
  if (["cups", "windows"].includes(profile.connectionMode) && !profile.printerName) {
    missing.push("nome da impressora no perfil");
  }
  if (profile.connectionMode === "windows" && !config.sumatraPath) missing.push("SUMATRA_PATH");
  if (profile.connectionMode === "tcp" && !profile.networkHost) missing.push("IP/host da impressora");
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(", ")}`);
  if (profile.connectionMode === "cups" && process.platform === "win32") {
    throw new Error("O perfil CUPS não é compatível com Windows. Use o perfil Windows ou TCP/IP.");
  }
  if (profile.connectionMode === "windows" && process.platform !== "win32") {
    throw new Error("O perfil Windows só pode ser executado no Windows.");
  }
}

// Compatibilidade com scripts da versão anterior.
export function assertConfig() {
  assertBaseConfig();
  assertProfile(resolveProfile());
}
