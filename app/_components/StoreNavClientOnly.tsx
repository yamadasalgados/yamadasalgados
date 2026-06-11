"use client";

import dynamic from "next/dynamic";

// Inicializa a Navbar sem renderização no servidor (SSR) para blindar contra Hydration Bugs
const StoreNav = dynamic(() => import("./StoreNav"), {
  ssr: false,
  loading: () => (
    <div className="sticky top-0 z-30 border-b border-neutral-200 dark:border-neutral-800 bg-white/75 dark:bg-neutral-900/75 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="h-9 w-28 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-9 w-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
          <div className="h-9 w-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
          <div className="h-9 w-16 rounded-xl bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
        </div>
      </div>
    </div>
  ),
});

export default function StoreNavClientOnly() {
  return <StoreNav />;
}