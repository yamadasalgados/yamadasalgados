"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// Validação em ambiente de Desenvolvimento (Apenas no cliente)
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value || !value.trim())
    .map(([key]) => `NEXT_PUBLIC_FIREBASE_${key.toUpperCase()}`);

  if (missing.length > 0) {
    console.warn(`[Firebase SDK] Atenção! Variáveis ausentes: ${missing.join(", ")}`);
  }
}

// Inicializa o App como Singleton estável
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Garante persistência estável no navegador de forma não bloqueante
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn("[Firebase Auth] Falha ao configurar persistência local:", err);
  });
}

export { app, auth, db };