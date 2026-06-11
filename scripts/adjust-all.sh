#!/usr/bin/env bash
set -euo pipefail

say() { printf "\n==> %s\n" "$1"; }

ROOT="$(pwd)"

say "1) Instalando deps do app (root)"
npm install

if [ -d "functions" ]; then
  say "2) Instalando deps das Functions (web-push + types)"
  (cd functions && npm install && npm i web-push && npm i -D @types/web-push)
fi

say "3) Criando componente de registro do Service Worker (PWA)"
mkdir -p app/_components
cat > app/_components/PwaRegister.tsx <<'EOF'
"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (e) {
        console.warn("SW register failed:", e);
      }
    };

    register();
  }, []);

  return null;
}
EOF

say "4) Criando detector do Meta In-App Browser + botão abrir no navegador"
cat > app/_components/OpenInBrowserGate.tsx <<'EOF'
"use client";

import { useMemo } from "react";

function isMetaInAppBrowser(ua: string) {
  const s = ua.toLowerCase();
  return s.includes("instagram") || s.includes("fbav") || s.includes("fban");
}

function isAndroid(ua: string) {
  return /android/i.test(ua);
}

function isIOS(ua: string) {
  return /iphone|ipad|ipod/i.test(ua);
}

export default function OpenInBrowserGate({ url }: { url: string }) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const meta = useMemo(() => isMetaInAppBrowser(ua), [ua]);

  if (!meta) return null;

  const handleOpen = async () => {
    try {
      // Android: tenta Intent (abre Chrome/Browser externo)
      if (isAndroid(ua)) {
        const safe = url.replace(/^https?:\/\//, "");
        const intentUrl = `intent://${safe}#Intent;scheme=https;package=com.android.chrome;end`;
        window.location.href = intentUrl;
        return;
      }

      // iOS: não dá pra forçar. Melhor copiar e instruir
      if (isIOS(ua)) {
        await navigator.clipboard?.writeText(url);
        alert("Link copiado! Abra no Safari/Chrome e cole na barra de endereços.");
        return;
      }

      // fallback geral
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.prompt("Copie este link e abra no navegador:", url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 space-y-3">
        <h2 className="text-lg font-bold">Abrir no navegador</h2>
        <p className="text-sm text-neutral-600">
          Você está no navegador do Facebook/Instagram. Para funcionar melhor, abra no navegador externo.
        </p>
        <button
          type="button"
          onClick={handleOpen}
          className="w-full rounded-xl bg-black text-white py-3 font-semibold"
        >
          Abrir no navegador
        </button>
        <p className="text-[11px] text-neutral-500 break-all">{url}</p>
      </div>
    </div>
  );
}
EOF

say "5) Injetando PwaRegister no layout (sem quebrar seu layout atual)"
# Se já existir, não duplica
if ! grep -q "PwaRegister" app/layout.tsx; then
  perl -0777 -i -pe 's/(import "\\.\/globals\\.css";\n)/$1import PwaRegister from ".\/_components\/PwaRegister";\n/' app/layout.tsx
  perl -0777 -i -pe 's/(\{children\})/\{children\}\n          <PwaRegister \/>/s' app/layout.tsx
fi

say "6) Build das functions (se existir)"
if [ -d "functions" ]; then
  (cd functions && npm run build || true)
fi

say "✅ Ajustes base feitos."
say "Agora rode: npm run dev"
