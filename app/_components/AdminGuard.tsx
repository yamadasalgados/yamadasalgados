"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";

export type PlanId = "starter" | "pro" | "business";
export type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";

export type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  suspended?: boolean;
  maxEvents?: number;
  maxProducts?: number;
  email?: string | null;
  displayName?: string | null;
};

export default function AdminGuard({
  children,
}: {
  children: (args: { user: User; profile: UserDoc }) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  const loadProfile = useCallback(async (u: User) => {
    setErrMsg("");
    setProfileMissing(false);

    try {
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setProfileMissing(true);
        setProfile(null);
        return;
      }

      const data = snap.data() as any;
      const normalized: UserDoc = {
        role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
        sellerId: String(data.sellerId || ""),
        regionId: String(data.regionId || ""),
        active: data.active !== false,
        suspended: !!data.suspended,
        plan: data.plan || "starter",
        subscriptionStatus: data.subscriptionStatus || "none",
        maxEvents: typeof data.maxEvents === "number" ? data.maxEvents : undefined,
        maxProducts: typeof data.maxProducts === "number" ? data.maxProducts : undefined,
        email: data.email ?? null,
        displayName: data.displayName ?? null,
      };

      setProfile(normalized);
    } catch (e: any) {
      console.error("[AdminGuard] loadProfile erro:", e);
      setErrMsg(t("eventPanel.err.profileLoad"));
    }
  }, [t]);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser);
  }, [authUser, loadProfile]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  if (checkingAuth || (authUser && !profile && !profileMissing)) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />
        <p className="text-sm font-black text-neutral-500 animate-pulse">Validando credenciais de administrador...</p>
      </main>
    );
  }

  if (!authUser) return null;

  // Barreira técnica caso o documento raiz do Admin não tenha sido criado via console
  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 space-y-4 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
          {t("eventPanel.guard.profileMissing.title")}
        </h1>

        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            Seu login foi validado, mas não existe um registro correspondente em <code className="font-mono font-black text-neutral-900 dark:text-white">users/{authUser.uid}</code>.
          </p>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 text-left text-xs space-y-2">
            <p className="font-black text-neutral-900 dark:text-white">Injeção Manual Obrigatória (Console):</p>
            <ol className="list-decimal ml-5 space-y-1 text-neutral-600 dark:text-neutral-400 font-medium">
              <li>Crie o documento <code className="font-bold">users/{authUser.uid}</code></li>
              <li>Adicione a chave: <code className="font-bold">role: "admin"</code></li>
              <li>Adicione a chave: <code className="font-bold">active: true</code></li>
            </ol>
          </div>

          <button onClick={handleLogout} className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-3.5 shadow-md">
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  // Bloqueio estrito se um Seller tentar quebrar a URL digitando /admin manualmente
  if (profile?.role !== "admin") {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center space-y-4 animate-fade-in">
        <div className="rounded-3xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 p-8 space-y-4 shadow-xl">
          <div className="text-4xl">🛑</div>
          <h1 className="text-xl font-black text-red-900 dark:text-red-200 tracking-tight">
            {t("settings.guard.notAllowed.title")}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">
            {t("settings.guard.notAllowed.role")}
          </p>

          <div className="flex flex-col gap-2 pt-2">
            <Link
              href="/seller"
              className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-3 text-sm shadow-md"
            >
              Ir para Painel do Vendedor
            </Link>
            <button
              onClick={handleLogout}
              className="text-xs font-black underline text-neutral-400 dark:text-neutral-500 mt-2"
            >
              {t("common.logout")}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return <>{children({ user: authUser, profile: profile! })}</>;
}