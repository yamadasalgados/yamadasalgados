import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEARCH_ROOTS = ["app", "public", "functions/src", "functions/_src", "print-service"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".json",
  ".css",
  ".md",
  ".sh",
  ".ps1",
  ".cmd",
]);

const checks = [
  { label: "marca comercial fixa", pattern: /Yamada/ },
  { label: "domínio comercial fixo", pattern: /yamadasalgados\.vercel\.app/i },
  { label: "e-mail administrativo fixo", pattern: /admin@yamada\.app/i },
  { label: "título antigo da plataforma", pattern: /Order System/i },
  { label: "lista fixa de administradores", pattern: /\bADMIN_EMAILS\b/ },
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "lib", "output", "logs"].includes(entry.name)) {
        return [];
      }
      return walk(absolute);
    }
    return TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [absolute] : [];
  });
}

function isAllowedLegacyReference(relativePath, line) {
  // Identificadores abaixo são lidos apenas para migrar instalações antigas.
  if (relativePath.startsWith("print-service/scripts/")) {
    if (line.includes("Yamada Print Service") || line.includes("com.yamada.print-service")) {
      return true;
    }
  }
  return false;
}

const findings = [];
for (const searchRoot of SEARCH_ROOTS) {
  for (const file of walk(path.join(ROOT, searchRoot))) {
    const relativePath = path.relative(ROOT, file).split(path.sep).join("/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const check of checks) {
        if (!check.pattern.test(line)) continue;
        check.pattern.lastIndex = 0;
        if (isAllowedLegacyReference(relativePath, line)) continue;
        findings.push({
          file: relativePath,
          line: index + 1,
          label: check.label,
          text: line.trim(),
        });
      }
    });
  }
}

if (findings.length) {
  console.error("\nAuditoria white-label encontrou referências que precisam ser revisadas:\n");
  for (const finding of findings) {
    console.error(
      `- ${finding.file}:${finding.line} [${finding.label}] ${finding.text}`,
    );
  }
  process.exitCode = 1;
} else {
  console.log("✓ Auditoria white-label concluída sem nomes comerciais fixos visíveis.");
  console.log("  Referências técnicas legadas permitidas existem somente para migração.");
}
