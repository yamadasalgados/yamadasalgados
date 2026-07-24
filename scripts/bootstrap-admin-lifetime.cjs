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
  getAuth,
} = require("firebase-admin/auth");
const {
  FieldValue,
  getFirestore,
} = require("firebase-admin/firestore");

function parseArgs(argv) {
  const result = {};

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const value = argv[index];

    if (!value.startsWith("--")) {
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];

    if (
      !next ||
      next.startsWith("--")
    ) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
}

function fail(message) {
  console.error(`\nErro: ${message}\n`);
  process.exit(1);
}

function normalizeCountry(value) {
  const normalized =
    String(value || "JP")
      .trim()
      .toUpperCase();

  if (
    normalized === "JP" ||
    normalized === "BR" ||
    normalized === "US"
  ) {
    return normalized;
  }

  fail(
    "País inválido. Use JP, BR ou US.",
  );
}

function normalizeLanguage(value) {
  const normalized =
    String(value || "pt")
      .trim()
      .toLowerCase();

  if (
    normalized === "pt" ||
    normalized === "en" ||
    normalized === "ja"
  ) {
    return normalized;
  }

  fail(
    "Idioma inválido. Use pt, en ou ja.",
  );
}

function normalizePlan(value) {
  const normalized =
    String(value || "business")
      .trim()
      .toLowerCase();

  if (
    normalized === "starter" ||
    normalized === "pro" ||
    normalized === "business"
  ) {
    return normalized;
  }

  fail(
    "Plano inválido. Use starter, pro ou business.",
  );
}

const REGIONAL = {
  JP: {
    currency: "JPY",
    locale: "ja-JP",
    timeZone: "Asia/Tokyo",
  },
  BR: {
    currency: "BRL",
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
  },
  US: {
    currency: "USD",
    locale: "en-US",
    timeZone: "America/New_York",
  },
};

async function main() {
  const args = parseArgs(
    process.argv.slice(2),
  );

  const email =
    String(
      args.email || "",
    )
      .trim()
      .toLowerCase();

  if (!email) {
    fail(
      "Informe --email EMAIL_DO_ADMIN",
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
      `Chave não encontrada: ${keyPath}`,
    );
  }

  const serviceAccount =
    JSON.parse(
      fs.readFileSync(
        keyPath,
        "utf8",
      ),
    );

  if (!getApps().length) {
    initializeApp({
      credential:
        cert(serviceAccount),
      projectId:
        serviceAccount.project_id,
    });
  }

  const auth = getAuth();
  const db = getFirestore();

  const authUser =
    await auth.getUserByEmail(
      email,
    );

  const uid = authUser.uid;
  const sellerId =
    String(
      args["seller-id"] || uid,
    ).trim();
  const storeName =
    String(
      args["store-name"] ||
      authUser.displayName ||
      "Admin",
    ).trim();
  const country =
    normalizeCountry(
      args.country,
    );
  const language =
    normalizeLanguage(
      args.language,
    );
  const planId =
    normalizePlan(
      args.plan,
    );
  const regional =
    REGIONAL[country];
  const timestamp =
    FieldValue.serverTimestamp();

  const userDocument = {
    schemaVersion: 2,
    role: "admin",
    sellerId,

    email:
      authUser.email || email,
    displayName:
      authUser.displayName || null,
    photoURL:
      authUser.photoURL || null,
    uiLanguage: language,

    accountStatus: "active",

    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  };

  const sellerDocument = {
    schemaVersion: 2,
    ownerUid: uid,

    storeName,
    storefrontLanguage:
      language,

    regional: {
      operatingCountry:
        country,
      currency:
        regional.currency,
      locale:
        regional.locale,
      timeZone:
        regional.timeZone,
    },

    onboarding: {
      complete: true,
      completedAt: timestamp,
      schemaVersion: 2,
    },

    accountStatus: "active",

    access: {
      planId,
      mode: "lifetime",
      billingInterval: null,
      status: "active",
      source: "admin_grant",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      grantedAt: timestamp,
      grantedBy: uid,
      note:
        "Conta administrativa Lifetime",
    },

    limitsOverride: null,

    regionId: null,
    regionName: null,
    whatsapp: null,
    messengerId: null,
    pickupLink: null,
    pickupNote: null,

    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: uid,
    updatedBy: uid,
  };

  const batch = db.batch();

  // set sem merge remove os espelhos legados do documento raiz.
  batch.set(
    db.collection("users").doc(uid),
    userDocument,
  );

  batch.set(
    db.collection("sellers").doc(sellerId),
    sellerDocument,
  );

  await batch.commit();

  console.log("\nBootstrap concluído.");
  console.log(`Admin UID: ${uid}`);
  console.log(`Seller ID: ${sellerId}`);
  console.log(`E-mail: ${email}`);
  console.log(`Plano: ${planId}`);
  console.log("Modo: lifetime");
  console.log(`País: ${country}`);
  console.log(
    "\nOs documentos users e sellers foram regravados no schemaVersion 2.",
  );
  console.log(
    "Subcoleções existentes não foram apagadas.",
  );
}

main().catch((error) => {
  console.error(
    "\nFalha no bootstrap:",
  );
  console.error(error);
  process.exit(1);
});
