#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const {
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const {
  getFirestore,
} = require("firebase-admin/firestore");

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function fail(message) {
  console.error(`\nErro: ${message}\n`);
  process.exit(1);
}

function normalizeDate(value) {
  if (
    value &&
    typeof value.toDate === "function"
  ) {
    return value
      .toDate()
      .toISOString();
  }

  return value || "";
}

async function main() {
  const args = parseArgs(
    process.argv.slice(2),
  );

  const keyPath = path.resolve(
    process.cwd(),
    String(
      args.key ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      "serviceAccountKey.json",
    ),
  );

  if (!fs.existsSync(keyPath)) {
    fail(
      `Chave não encontrada em ${keyPath}`,
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(
      keyPath,
      "utf8",
    ),
  );

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId:
        serviceAccount.project_id,
    });
  }

  const db = getFirestore();
  const snapshot =
    await db.collection("events").get();

  if (snapshot.empty) {
    console.log(
      "Nenhum evento legado encontrado em /events.",
    );
    return;
  }

  const rows = [];

  for (const document of snapshot.docs) {
    const data = document.data();
    const orders = await document.ref
      .collection("orders")
      .count()
      .get();

    rows.push({
      eventId: document.id,
      title:
        data.title ||
        data.name ||
        "",
      deliveryDateLabel:
        data.deliveryDateLabel ||
        "",
      createdAt:
        normalizeDate(data.createdAt),
      orderCount:
        orders.data().count,
    });
  }

  rows.sort((left, right) =>
    String(right.createdAt).localeCompare(
      String(left.createdAt),
    ),
  );

  console.table(rows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
