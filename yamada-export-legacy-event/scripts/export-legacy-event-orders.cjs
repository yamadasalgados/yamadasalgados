#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8"),
  );
}

function normalizeValue(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    const date = value.toDate();

    return date instanceof Date &&
      !Number.isNaN(date.getTime())
      ? date.toISOString()
      : null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(value).map(
        ([key, nestedValue]) => [
          key,
          normalizeValue(nestedValue),
        ],
      ),
    );
  }

  return value ?? null;
}

function csvCell(value) {
  const text =
    value === null ||
    value === undefined
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function createCsv(headers, rows) {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) =>
      headers
        .map((header) => csvCell(row[header]))
        .join(","),
    ),
  ].join("\n");
}

function quantitiesToText(quantities) {
  if (
    !quantities ||
    typeof quantities !== "object" ||
    Array.isArray(quantities)
  ) {
    return "";
  }

  return Object.entries(quantities)
    .map(([productName, quantity]) =>
      `${productName}: ${quantity}`,
    )
    .join(" | ");
}

function finiteNumber(value) {
  return typeof value === "number" &&
    Number.isFinite(value)
      ? value
      : 0;
}

function safeSegment(value) {
  return String(value)
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sha256(content) {
  return crypto
    .createHash("sha256")
    .update(content)
    .digest("hex");
}

async function main() {
  const args = parseArgs(
    process.argv.slice(2),
  );

  const eventId =
    args["event-id"] ||
    process.env.EVENT_ID;

  if (
    typeof eventId !== "string" ||
    !eventId.trim()
  ) {
    fail(
      "Informe o ID com --event-id ID_DO_EVENTO",
    );
  }

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
      `Chave não encontrada em ${keyPath}. ` +
      "Use --key caminho/para/serviceAccountKey.json",
    );
  }

  const serviceAccount =
    readJson(keyPath);

  const projectId =
    String(
      args["project-id"] ||
      serviceAccount.project_id ||
      "",
    ).trim();

  if (!projectId) {
    fail(
      "project_id não encontrado na chave.",
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  const db = getFirestore();

  const eventRef =
    db.collection("events").doc(
      eventId.trim(),
    );

  console.log(
    `Lendo ${eventRef.path}...`,
  );

  const [eventSnapshot, ordersSnapshot] =
    await Promise.all([
      eventRef.get(),
      eventRef.collection("orders").get(),
    ]);

  if (!eventSnapshot.exists) {
    fail(
      `Evento não encontrado em ${eventRef.path}`,
    );
  }

  const eventData = normalizeValue(
    eventSnapshot.data() || {},
  );

  const orders = ordersSnapshot.docs
    .map((snapshot) => {
      const data = normalizeValue(
        snapshot.data() || {},
      );

      return {
        orderId: snapshot.id,
        ...data,
      };
    })
    .sort((left, right) =>
      String(left.createdAt || "").localeCompare(
        String(right.createdAt || ""),
      ),
    );

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const outputDirectory = path.resolve(
    process.cwd(),
    String(
      args.output ||
      path.join(
        "exports",
        `legacy-event-${safeSegment(eventId)}-${timestamp}`,
      ),
    ),
  );

  fs.mkdirSync(
    outputDirectory,
    { recursive: true },
  );

  const orderRows = orders.map((order) => ({
    orderId: order.orderId,
    channel: order.channel ?? "",
    customerName:
      order.customerName ?? "",
    quantities:
      quantitiesToText(
        order.quantities,
      ),
    quantitiesJson:
      JSON.stringify(
        order.quantities ?? {},
      ),
    totalItems:
      order.totalItems ?? "",
    amountYen:
      order.amountYen ??
      order.totalAmount ??
      "",
    status:
      order.status ?? "",
    deliveryDate:
      order.deliveryDate ?? "",
    deliveryMode:
      order.deliveryMode ?? "",
    deliveryTimeSlot:
      order.deliveryTimeSlot ?? "",
    paid:
      order.paid ?? "",
    createdAt:
      order.createdAt ?? "",
    updatedAt:
      order.updatedAt ?? "",
  }));

  const orderHeaders = [
    "orderId",
    "channel",
    "customerName",
    "quantities",
    "quantitiesJson",
    "totalItems",
    "amountYen",
    "status",
    "deliveryDate",
    "deliveryMode",
    "deliveryTimeSlot",
    "paid",
    "createdAt",
    "updatedAt",
  ];

  const productSummary = new Map();
  const channelSummary = new Map();

  for (const order of orders) {
    const channel =
      String(order.channel || "unknown");

    const currentChannel =
      channelSummary.get(channel) || {
        channel,
        orderCount: 0,
        totalItems: 0,
        amountYen: 0,
      };

    currentChannel.orderCount += 1;
    currentChannel.totalItems +=
      finiteNumber(order.totalItems);
    currentChannel.amountYen +=
      finiteNumber(
        order.amountYen ??
        order.totalAmount,
      );

    channelSummary.set(
      channel,
      currentChannel,
    );

    if (
      order.quantities &&
      typeof order.quantities === "object" &&
      !Array.isArray(order.quantities)
    ) {
      for (
        const [productName, rawQuantity]
        of Object.entries(
          order.quantities,
        )
      ) {
        const quantity =
          finiteNumber(rawQuantity);

        const currentProduct =
          productSummary.get(productName) || {
            productName,
            totalQuantity: 0,
            orderCount: 0,
          };

        currentProduct.totalQuantity +=
          quantity;
        currentProduct.orderCount += 1;

        productSummary.set(
          productName,
          currentProduct,
        );
      }
    }
  }

  const productRows = Array.from(
    productSummary.values(),
  ).sort((left, right) =>
    right.totalQuantity -
    left.totalQuantity,
  );

  const channelRows = Array.from(
    channelSummary.values(),
  ).sort((left, right) =>
    right.orderCount -
    left.orderCount,
  );

  const completeJson = JSON.stringify(
    {
      schemaVersion: 1,
      sourcePath: eventRef.path,
      projectId,
      exportedAt:
        new Date().toISOString(),
      event: {
        id: eventSnapshot.id,
        ...eventData,
      },
      orders,
    },
    null,
    2,
  );

  const ordersCsv =
    "\uFEFF" +
    createCsv(
      orderHeaders,
      orderRows,
    );

  const productsCsv =
    "\uFEFF" +
    createCsv(
      [
        "productName",
        "totalQuantity",
        "orderCount",
      ],
      productRows,
    );

  const channelsCsv =
    "\uFEFF" +
    createCsv(
      [
        "channel",
        "orderCount",
        "totalItems",
        "amountYen",
      ],
      channelRows,
    );

  const files = {
    json: "event-and-orders.json",
    ordersCsv: "orders.csv",
    productsCsv:
      "product-summary.csv",
    channelsCsv:
      "channel-summary.csv",
  };

  fs.writeFileSync(
    path.join(
      outputDirectory,
      files.json,
    ),
    completeJson,
    "utf8",
  );

  fs.writeFileSync(
    path.join(
      outputDirectory,
      files.ordersCsv,
    ),
    ordersCsv,
    "utf8",
  );

  fs.writeFileSync(
    path.join(
      outputDirectory,
      files.productsCsv,
    ),
    productsCsv,
    "utf8",
  );

  fs.writeFileSync(
    path.join(
      outputDirectory,
      files.channelsCsv,
    ),
    channelsCsv,
    "utf8",
  );

  const manifest = {
    schemaVersion: 1,
    projectId,
    sourcePath: eventRef.path,
    eventId:
      eventSnapshot.id,
    exportedAt:
      new Date().toISOString(),
    orderCount:
      orders.length,
    files: {
      [files.json]: {
        sha256:
          sha256(completeJson),
      },
      [files.ordersCsv]: {
        sha256:
          sha256(ordersCsv),
        rows:
          orderRows.length,
      },
      [files.productsCsv]: {
        sha256:
          sha256(productsCsv),
        rows:
          productRows.length,
      },
      [files.channelsCsv]: {
        sha256:
          sha256(channelsCsv),
        rows:
          channelRows.length,
      },
    },
  };

  fs.writeFileSync(
    path.join(
      outputDirectory,
      "manifest.json",
    ),
    JSON.stringify(
      manifest,
      null,
      2,
    ),
    "utf8",
  );

  console.log("\nExportação concluída.");
  console.log(
    `Evento: ${eventSnapshot.id}`,
  );
  console.log(
    `Pedidos: ${orders.length}`,
  );
  console.log(
    `Pasta: ${outputDirectory}`,
  );
  console.log("\nArquivos:");
  console.log(
    `- ${files.ordersCsv}`,
  );
  console.log(
    `- ${files.productsCsv}`,
  );
  console.log(
    `- ${files.channelsCsv}`,
  );
  console.log(
    `- ${files.json}`,
  );
  console.log("- manifest.json");
  console.log(
    "\nNenhum documento foi alterado ou excluído.",
  );
}

main().catch((error) => {
  console.error("\nFalha na exportação:");
  console.error(error);
  process.exit(1);
});
