import * as admin from "firebase-admin";

// Definição tipada segura do escopo global do Node para ambientes de Hot Reload (Next.js Dev)
declare global {
  var __firebaseAdminApp: admin.app.App | undefined;
  var __firestoreSettingsApplied: boolean | undefined;
}

function getEnv(name: string): string {
  return process.env[name] || "";
}

/**
 * Normaliza quebras de linha na chave privada do Firebase vindas do arquivo .env
 */
function normalizePrivateKey(raw: string): string {
  if (!raw) return "";
  return raw.replace(/["']/g, "").replace(/\\n/g, "\n");
}

function hasServiceAccountEnv(): boolean {
  return !!(getEnv("FIREBASE_PROJECT_ID") && getEnv("FIREBASE_CLIENT_EMAIL") && getEnv("FIREBASE_PRIVATE_KEY"));
}

export function getAdminApp(): admin.app.App {
  // 1) Retorna se já instanciado globalmente neste processo Node
  if (globalThis.__firebaseAdminApp) {
    return globalThis.__firebaseAdminApp;
  }

  // 2) Fallback caso já exista app nativo no SDK do Admin
  if (admin.apps.length > 0) {
    globalThis.__firebaseAdminApp = admin.apps[0]!;
    return globalThis.__firebaseAdminApp;
  }

  // 3) Inicialização explícita via Service Account (.env)
  if (hasServiceAccountEnv()) {
    const projectId = getEnv("FIREBASE_PROJECT_ID");
    const clientEmail = getEnv("FIREBASE_CLIENT_EMAIL");
    const privateKey = normalizePrivateKey(getEnv("FIREBASE_PRIVATE_KEY"));

    globalThis.__firebaseAdminApp = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      projectId,
    });

    return globalThis.__firebaseAdminApp;
  }

  // 4) Fallback automático: Application Default Credentials (GCP, Cloud Run, Vercel Integration)
  globalThis.__firebaseAdminApp = admin.initializeApp();
  return globalThis.__firebaseAdminApp;
}

export function getAdminDb(): admin.firestore.Firestore {
  const app = getAdminApp();
  const firestoreDb = admin.firestore(app);

  // Aplica definições críticas de sanitização apenas uma vez por ciclo de vida da instância
  if (!globalThis.__firestoreSettingsApplied) {
    try {
      firestoreDb.settings({ ignoreUndefinedProperties: true });
      globalThis.__firestoreSettingsApplied = true;
    } catch {
      // Ignora de forma segura caso já tenha sido selado pelo runtime anterior
      globalThis.__firestoreSettingsApplied = true;
    }
  }

  return firestoreDb;
}

export function getAdminAuth(): admin.auth.Auth {
  const app = getAdminApp();
  return admin.auth(app);
}