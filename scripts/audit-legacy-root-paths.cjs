#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const scanRoots = ["app", "functions", "scripts"];
const extensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".cjs",
  ".mjs",
]);
const ignoredDirectories = new Set([
  "node_modules",
  ".next",
  ".git",
  "review_packages",
  "exports",
  "dist",
  "build",
]);
const thisFile = path.resolve(__filename);

const patterns = [
  {
    label: "Firestore Web root path",
    regex:
      /\b(?:doc|collection)\(\s*[^,\n]+,\s*["'](?:events|products)["']/g,
  },
  {
    label: "Firestore Admin root collection",
    regex:
      /\b(?:db|firestore)\s*\.\s*collection\(\s*["'](?:events|products)["']\s*\)/g,
  },
  {
    label: "Firestore Admin root document",
    regex:
      /\b(?:db|firestore)\s*\.\s*doc\(\s*["'](?:events|products)\//g,
  },
  {
    label: "Ambiguous event collectionGroup lookup",
    regex:
      /\.collectionGroup\(\s*["']events["']\s*\)/g,
  },
];

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;

  for (const entry of fs.readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (
      entry.isDirectory() &&
      ignoredDirectories.has(entry.name)
    ) {
      continue;
    }

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (
      extensions.has(path.extname(entry.name)) &&
      path.resolve(fullPath) !== thisFile
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = scanRoots.flatMap((root) =>
  walk(path.resolve(projectRoot, root)),
);
const findings = [];

for (const filePath of files) {
  const source = fs.readFileSync(filePath, "utf8");
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;

      if (pattern.regex.test(line)) {
        findings.push({
          type: pattern.label,
          file: path.relative(projectRoot, filePath),
          line: index + 1,
          source: line.trim(),
        });
      }
    }
  });
}

if (findings.length > 0) {
  console.error(
    "\nReferências incompatíveis com o schema V2:\n",
  );

  for (const finding of findings) {
    console.error(
      `[${finding.type}] ${finding.file}:${finding.line}`,
    );
    console.error(`  ${finding.source}`);
  }

  console.error(
    "\nO auditor encerrou com código 1. Remova essas referências antes de publicar.\n",
  );
  process.exit(1);
}

console.log(
  "Schema V2 confirmado: nenhuma leitura/gravação direta em /events ou /products e nenhum lookup ambíguo por collectionGroup foi encontrado.",
);
