"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerServiceWorker = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        
        if (process.env.NODE_ENV === "development") {
          console.log("[PWA Kernel] Service Worker registrado sob escopo:", registration.scope);
        }
      } catch (err) {
        console.warn("[PWA Kernel] Falha ao instanciar Service Worker:", err);
      }
    };

    // Executa o registro de forma não-bloqueante apenas após o carregamento completo do ciclo de vida da página
    if (document.readyState === "complete") {
      registerServiceWorker();
    } else {
      window.addEventListener("load", registerServiceWorker);
      return () => window.removeEventListener("load", registerServiceWorker);
    }
  }, []);

  return null;
}