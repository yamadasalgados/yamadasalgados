#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(process.cwd(), "app");
const extensions = new Set([".ts", ".tsx", ".js", ".jsx"]);
const patterns = [
  /doc\(\s*db\s*,\s*["']events["']/g,
  /collection\(\s*db\s*,\s*["']events["']/g,
  /doc\(\s*db\s*,\s*["']products["']/g,
  /collection\(\s*db\s*,\s*["']products["']/g,
];

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

const findings = [];

for (const filePath of walk(root)) {
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (patterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    })) {
      findings.push({
        file: path.relative(process.cwd(), filePath),
        line: index + 1,
        source: line.trim(),
      });
    }
  });
}

if (findings.length > 0) {
  console.log("\nReferências legadas encontradas para revisão:\n");
  findings.forEach((finding) => {
    console.log(`${finding.file}:${finding.line}`);
    console.log(`  ${finding.source}`);
  });
  console.log("\nAs Firestore Rules da Fundação 01C bloqueiam /events e /products na raiz. Essas referências não poderão recriar dados antigos, mas devem ser removidas em uma etapa de limpeza com os arquivos atuais.\n");
  process.exit(0);
}

console.log("Nenhuma referência direta em /events ou /products foi encontrada dentro de app/.");
