#!/usr/bin/env node
/**
 * Identidade de contas v5.4. Safe by default: diagnostics only.
 * Repair requires an exact email, UID, project ID and explicit --apply.
 * NEVER changes seller access, points, orders, or subscription settings.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { isLegacyCustomerCandidate, isSellerStatusCandidate } = require("./identity-recovery-policy-v54.cjs");

function parse(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw Error(`Argumento desconhecido: ${arg}`);
    const name = arg.slice(2);
    if (["apply"].includes(name)) { args[name] = true; continue; }
    if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw Error(`Falta valor de --${name}`);
    args[name] = argv[++i];
  }
  return args;
}

function ensure(check, message) { if (!check) throw Error(message); }

function status(data) {
  return data ? (typeof data.accountStatus === "string" ? data.accountStatus : "(ausente)") : "(sem documento)";
}

function projectFromFile() {
  try {
    const value = JSON.parse(fs.readFileSync(".firebaserc", "utf8"));
    return value.projects?.default ?? "";
  } catch { return ""; }
}

function backup(uid, user) {
  const folder = path.join(os.homedir(), ".order-system-identity-backups");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  fs.chmodSync(folder, 0o700);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filepath = path.join(folder, `${uid}-${stamp}.json`);
  // Firestore Timestamp JSON is meant as a forensic snapshot, not auto-restore.
  fs.writeFileSync(filepath, JSON.stringify({ uid, capturedAt: new Date().toISOString(), user }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(`Backup de auditoria salvo (local): ${filepath}`);
}

async function main() {
  const args = parse(process.argv.slice(2));
  const email = String(args.email || "").trim().toLowerCase();
  const key = path.resolve(String(args.key || process.env.GOOGLE_APPLICATION_CREDENTIALS || "serviceAccountKey.json"));
  const expectedProject = String(args.project || projectFromFile()).trim();
  const repair = args.repair ? String(args.repair).trim() : null;

  ensure(email.includes("@"), "Use --email usuario@dominio.");
  ensure(fs.existsSync(key), "Arquivo de credenciais não encontrado. Use --key /caminho/serviceAccountKey.json (não envie a chave ao chat).");
  ensure(expectedProject, "Use --project ID_PROJETO. Não é seguro diagnosticar sem conferir o projeto.");
  ensure(!repair || ["customer", "seller-status"].includes(repair), "--repair deve ser customer ou seller-status.");
  ensure(!args.apply || repair, "--apply exige --repair customer ou --repair seller-status.");

  const serviceAccount = JSON.parse(fs.readFileSync(key, "utf8"));
  ensure(serviceAccount.project_id === expectedProject,
    `PROJETO DIFERENTE: a chave aponta para ${serviceAccount.project_id}, mas você informou ${expectedProject}. Nada foi alterado.`);
  if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount), projectId: expectedProject });

  const auth = getAuth();
  const db = getFirestore();
  const user = await auth.getUserByEmail(email);
  const uid = user.uid;
  const userRef = db.collection("users").doc(uid);
  const customerRef = db.collection("customers").doc(uid);
  const [userSnap, customerSnap, selfSellerSnap, owned] = await Promise.all([
    userRef.get(), customerRef.get(), db.collection("sellers").doc(uid).get(),
    db.collection("sellers").where("ownerUid", "==", uid).limit(2).get(),
  ]);
  const identity = userSnap.data() ?? null;
  const sellerId = typeof identity?.sellerId === "string" ? identity.sellerId.trim() : "";
  const sellerRef = sellerId ? db.collection("sellers").doc(sellerId) : db.collection("sellers").doc(uid);
  const sellerSnap = sellerRef.id === uid ? selfSellerSnap : await sellerRef.get();
  const seller = sellerSnap.data() ?? null;

  console.log("\n=== DIAGNÓSTICO DE IDENTIDADE — SOMENTE LEITURA ===");
  console.log(`Projeto: ${expectedProject}`);
  console.log(`Conta Firebase Auth: ${user.email || "sem e-mail"} | UID: ${uid} | disabled=${user.disabled}`);
  console.log(`users/{UID}: ${userSnap.exists ? "existe" : "não existe"} | role=${identity?.role ?? "(ausente)"} | accountStatus=${status(identity)} | sellerId=${sellerId || "(ausente)"} | schemaVersion=${identity?.schemaVersion ?? "(ausente)"} | isActive=${identity?.isActive ?? "(ausente)"}`);
  console.log(`customers/{UID}: ${customerSnap.exists ? "existe" : "não existe"} | accountStatus=${status(customerSnap.data())}`);
  console.log(`sellers/{sellerId ou UID}: ${sellerSnap.exists ? sellerRef.id : "não existe"} | ownerUid corresponde=${seller?.ownerUid === uid} | accountStatus=${status(seller)}`);
  console.log(`sellers com ownerUid=UID: ${owned.size}${owned.size === 2 ? "+" : ""}`);

  const legacyCustomer = isLegacyCustomerCandidate(identity, {
    sellerId, sellerExists: sellerSnap.exists, selfSellerExists: selfSellerSnap.exists,
    ownedSellerCount: owned.size, authDisabled: user.disabled,
  });
  const sellerStatusRepair = isSellerStatusCandidate(identity, {
    uid, seller, sellerExists: sellerSnap.exists, authDisabled: user.disabled,
  });

  console.log(`\nPossível identidade legada de customer criada indevidamente como seller: ${legacyCustomer ? "SIM" : "não comprovado"}`);
  console.log(`Possível status seller legado reparável com confirmação: ${sellerStatusRepair ? "SIM" : "não comprovado"}`);
  if (!repair) {
    console.log("Nenhuma escrita foi realizada.\n");
    return;
  }

  if (repair === "customer") {
    ensure(legacyCustomer, "Não é seguro converter: padrões de identidade legada não correspondem, ou há uma loja associada. Requer análise manual.");
  } else {
    ensure(sellerStatusRepair, "Não é seguro ativar: não há loja ativa corretamente vinculada ao UID ou não há indicadores suficientes de status legado.");
  }

  if (!args.apply) {
    console.log(`\nPREVISUALIZAÇÃO: pode executar --repair ${repair} --apply --confirm-uid ${uid} após conferir que é a conta certa.`);
    console.log("Nada foi alterado.\n");
    return;
  }
  ensure(args["confirm-uid"] === uid, "Falta --confirm-uid UID_EXATO. Nenhum dado foi alterado.");
  backup(uid, identity);
  await db.runTransaction(async (transaction) => {
    const freshIdentitySnap = await transaction.get(userRef);
    const freshSellerSnap = await transaction.get(sellerRef);
    const fresh = freshIdentitySnap.data() ?? null;
    ensure(freshIdentitySnap.exists && freshIdentitySnap.updateTime.isEqual(userSnap.updateTime), "Os dados mudaram após a auditoria. Rode novamente.");
    if (repair === "customer") {
      ensure(!freshSellerSnap.exists && owned.empty, "Uma loja surgiu; conversão interrompida.");
      transaction.update(userRef, {
        role: "customer",
        accountStatus: "active",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      ensure(freshSellerSnap.exists && freshSellerSnap.data()?.ownerUid === uid && freshSellerSnap.data()?.accountStatus === "active", "Vínculo do seller mudou; abortado.");
      transaction.update(userRef, { accountStatus: "active", updatedAt: FieldValue.serverTimestamp() });
    }
  });
  console.log(`\nREPARO CONCLUÍDO: ${repair}. Nenhuma carteira, pedido ou assinatura foi modificado.`);
  console.log("Saia e entre novamente no sistema. Para customers, o app criará customers/{UID} via API autenticada se necessário.\n");
}

main().catch((error) => { console.error(`\nERRO: ${error.message || error}`); process.exitCode = 1; });
