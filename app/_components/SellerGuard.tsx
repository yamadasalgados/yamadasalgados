"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
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
  currentPeriodEnd?: Timestamp;
  requestedPlanAt?: Timestamp;
  suspended?: boolean;
};

function isPeriodValid(periodEnd?: Timestamp) {
  if (!periodEnd) return true;
  try {
    return periodEnd.toDate().getTime() > Date.now();
  } catch {
    return true;
  }
}

export default function SellerGuard({
  children,
  requireSellerIds = true,
}: {
  children: (args: { user: User; profile: UserDoc }) => React.ReactNode;
  requireSellerIds?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // 1) Escuta o estado da sessão do Firebase
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  // 2) Carrega o Perfil mapeado do Firestore
  const loadProfile = useCallback(async (u: User) => {
    setErrMsg("");
    try {
      const ref = doc(db, "users", u.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setProfileMissing(true);
        return;
      }

      const data = snap.data();
      const normalized: UserDoc = {
        role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
        sellerId: String(data.sellerId || ""),
        regionId: String(data.regionId || ""),
        active: data.active !== false,
        plan: data.plan || "starter",
        subscriptionStatus: data.subscriptionStatus || "none",
        currentPeriodEnd: data.currentPeriodEnd,
        requestedPlanAt: data.requestedPlanAt,
        suspended: !!data.suspended,
      };

      setProfile(normalized);
      setProfileMissing(false);
    } catch (e: any) {
      console.error("[SellerGuard] loadProfile erro:", e);
      setErrMsg(t("guard.err.loadProfile"));
    }
  }, [t]);

  useEffect(() => {
    if (authUser) {
      loadProfile(authUser);
    }
  }, [authUser, loadProfile]);

  // Validações de privilégio e subscrição
  const role = profile?.role ?? null;
  const inactive = profile?.active === false;
  const sellerId = profile?.sellerId || "";
  const regionId = profile?.regionId || "";
  const subscriptionStatus = profile?.subscriptionStatus || "none";
  const suspended = !!profile?.suspended;

  const planActive = useMemo(() => {
    if (role === "admin") return true; 
    if (suspended || inactive) return false;
    if (subscriptionStatus !== "active") return false;
    return isPeriodValid(profile?.currentPeriodEnd);
  }, [role, suspended, inactive, subscriptionStatus, profile?.currentPeriodEnd]);

  // 3) Redirecionamento Seguro e Reativo (Previne loops)
  useEffect(() => {
    if (!authUser || !profile || role !== "seller") return;
    
    const onRentRoute = pathname.startsWith("/seller/rent");

    if (!planActive && !onRentRoute) {
      router.replace("/seller/rent");
    }
  }, [authUser, profile, role, planActive, router, pathname]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleCreateProfileNow = async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
    } catch (e: any) {
      setErrMsg(e?.message || t("guard.err.createProfile"));
    } finally {
      setLoading(false);
    }
  };

  // --- Renderização dos Estados Corporativos ---

  if (checkingAuth || (authUser && !profile && !profileMissing)) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />
        <p className="text-sm font-black text-neutral-500 animate-pulse">{t("dashboard.checking_session")}</p>
      </main>
    );
  }

  if (!authUser) return null;

  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 space-y-4 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
          {t("guard.profileMissing.title")}
        </h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium leading-relaxed">
            {t("guard.profileMissing.desc", { path: `users/${authUser.uid}` })}
          </p>
          <button
            onClick={handleCreateProfileNow}
            disabled={loading}
            className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-3.5 hover:opacity-90 disabled:opacity-50 transition-all text-sm shadow-xl"
          >
            {loading ? t("common.saving") : t("guard.profileMissing.ctaCreate")}
          </button>
        </div>
        {errMsg && <p className="text-xs text-red-500 font-bold">{errMsg}</p>}
      </main>
    );
  }

  if (inactive || suspended) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-red-200 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 p-8 space-y-4 shadow-sm">
          <div className="text-4xl">🚫</div>
          <h1 className="text-xl font-black text-red-900 dark:text-red-200 tracking-tight">
            {suspended ? t("guard.suspended.title") : t("guard.inactive.title")}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 font-medium">
            {suspended ? t("guard.suspended.desc") : t("guard.inactive.desc")}
          </p>
          <button onClick={handleLogout} className="text-xs font-black underline text-neutral-900 dark:text-white uppercase tracking-wider">
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  if (!role || (role === "seller" && requireSellerIds && (!sellerId || !regionId))) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 space-y-4 shadow-xl">
          <div className="text-4xl">⏳</div>
          <h1 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight">
            {t("guard.notConfigured.title")}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
            {t("guard.notConfigured.desc", { path: `users/${authUser.uid}` })}
          </p>
          <button onClick={handleLogout} className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 py-3.5 text-xs font-black text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition">
            {t("common.back")}
          </button>
        </div>
      </main>
    );
  }

  const isOnRentPage = pathname.startsWith("/seller/rent");
  if (role === "seller" && !planActive && !isOnRentPage) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 space-y-5 shadow-2xl">
          <div className="text-4xl">💳</div>
          <h1 className="text-xl font-black text-neutral-900 dark:text-white tracking-tight">
            {t("guard.planRequired.title")}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium">
            {t("guard.planRequired.desc")}
          </p>
          <Link
            href="/seller/rent"
            className="block w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-4 hover:opacity-95 transition shadow-lg text-sm"
          >
            {t("guard.planRequired.cta")}
          </Link>
          <button onClick={handleLogout} className="text-xs text-neutral-400 dark:text-neutral-500 font-bold underline">
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  return <>{children({ user: authUser, profile: profile! })}</>;
}