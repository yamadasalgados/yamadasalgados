"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { auth, db } from "@/app/lib/firebase";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import {
  doc,
  getDoc,
  type Timestamp,
} from "firebase/firestore";

export type PlanId =
  | "starter"
  | "pro"
  | "business";

export type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

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

type SellerGuardChildrenArgs = {
  user: User;
  profile: UserDoc;
};

type SellerGuardProps = {
  children:
    | ReactNode
    | ((args: SellerGuardChildrenArgs) => ReactNode);
  requireSellerIds?: boolean;
};

/**
 * Rotas da área do vendedor que precisam continuar acessíveis
 * mesmo quando o plano estiver vencido ou ainda não estiver ativo.
 */
const PLAN_FREE_ROUTES = [
  "/seller/rent",
] as const;

function normalizePathname(pathname: string | null): string {
  if (!pathname) return "";

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function isPlanFreeRoute(pathname: string): boolean {
  return PLAN_FREE_ROUTES.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`)
  );
}

function timestampToDate(value?: Timestamp): Date | null {
  if (!value) return null;

  try {
    const date = value.toDate();

    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  } catch {
    return null;
  }
}

function isSubscriptionPeriodValid(
  periodEnd?: Timestamp
): boolean {
  /*
   * Mantém compatibilidade com contas antigas que ainda não possuem
   * currentPeriodEnd. Nesse caso, subscriptionStatus === "active"
   * continua sendo considerado válido.
   */
  if (!periodEnd) return true;

  const endDate = timestampToDate(periodEnd);

  if (!endDate) {
    return false;
  }

  return endDate.getTime() > Date.now();
}

function normalizeSubscriptionStatus(
  value: unknown
): SubscriptionStatus {
  switch (value) {
    case "pending":
    case "active":
    case "past_due":
    case "cancelled":
    case "none":
      return value;

    default:
      return "none";
  }
}

function normalizePlan(value: unknown): PlanId {
  switch (value) {
    case "pro":
    case "business":
    case "starter":
      return value;

    default:
      return "starter";
  }
}

export default function SellerGuard({
  children,
  requireSellerIds = true,
}: SellerGuardProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const { t } = useI18n();

  const pathname = useMemo(
    () => normalizePathname(rawPathname),
    [rawPathname]
  );

  const planRouteAllowed = useMemo(
    () => isPlanFreeRoute(pathname),
    [pathname]
  );

  const [checkingAuth, setCheckingAuth] =
    useState(true);

  const [checkingProfile, setCheckingProfile] =
    useState(false);

  const [authUser, setAuthUser] =
    useState<User | null>(null);

  const [profile, setProfile] =
    useState<UserDoc | null>(null);

  const [profileMissing, setProfileMissing] =
    useState(false);

  const [creatingProfile, setCreatingProfile] =
    useState(false);

  const [errMsg, setErrMsg] =
    useState("");

  /**
   * Escuta a autenticação.
   */
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setAuthUser(currentUser);
        setCheckingAuth(false);

        if (!currentUser) {
          setProfile(null);
          setProfileMissing(false);
          router.replace("/login");
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  /**
   * Carrega o perfil do Firestore.
   */
  const loadProfile = useCallback(
    async (user: User) => {
      setErrMsg("");
      setCheckingProfile(true);
      setProfileMissing(false);

      try {
        const userRef = doc(
          db,
          "users",
          user.uid
        );

        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setProfile(null);
          setProfileMissing(true);
          return;
        }

        const data = userSnap.data();

        const normalizedProfile: UserDoc = {
          role:
            data.role === "admin"
              ? "admin"
              : data.role === "seller"
                ? "seller"
                : undefined,

          sellerId:
            typeof data.sellerId === "string"
              ? data.sellerId.trim()
              : "",

          regionId:
            typeof data.regionId === "string"
              ? data.regionId.trim()
              : "",

          active: data.active !== false,

          plan: normalizePlan(data.plan),

          subscriptionStatus:
            normalizeSubscriptionStatus(
              data.subscriptionStatus
            ),

          currentPeriodEnd:
            data.currentPeriodEnd,

          requestedPlanAt:
            data.requestedPlanAt,

          suspended:
            data.suspended === true,
        };

        setProfile(normalizedProfile);
        setProfileMissing(false);
      } catch (error) {
        console.error(
          "[SellerGuard] Erro ao carregar perfil:",
          error
        );

        setProfile(null);

        setErrMsg(
          t("guard.err.loadProfile")
        );
      } finally {
        setCheckingProfile(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!authUser) return;

    void loadProfile(authUser);
  }, [authUser, loadProfile]);

  const role = profile?.role ?? null;

  const inactive =
    profile?.active === false;

  const suspended =
    profile?.suspended === true;

  const sellerId =
    profile?.sellerId?.trim() || "";

  const regionId =
    profile?.regionId?.trim() || "";

  const subscriptionStatus =
    profile?.subscriptionStatus || "none";

  /**
   * Plano válido.
   *
   * Admin não precisa de plano.
   * Seller precisa:
   * - conta ativa;
   * - não suspensa;
   * - subscriptionStatus active;
   * - currentPeriodEnd ainda válido, quando existir.
   */
  const planActive = useMemo(() => {
    if (!profile) return false;

    if (role === "admin") {
      return true;
    }

    if (role !== "seller") {
      return false;
    }

    if (inactive || suspended) {
      return false;
    }

    if (subscriptionStatus !== "active") {
      return false;
    }

    return isSubscriptionPeriodValid(
      profile.currentPeriodEnd
    );
  }, [
    profile,
    role,
    inactive,
    suspended,
    subscriptionStatus,
  ]);

  /**
   * Identifica exatamente quando o seller deve ser enviado
   * para a página de planos.
   *
   * A própria rota /seller/rent nunca é redirecionada.
   */
  const mustRedirectToRent = useMemo(() => {
    if (!authUser || !profile) {
      return false;
    }

    if (role !== "seller") {
      return false;
    }

    if (planRouteAllowed) {
      return false;
    }

    return !planActive;
  }, [
    authUser,
    profile,
    role,
    planRouteAllowed,
    planActive,
  ]);

  /**
   * Redireciona o seller sem plano para a renovação,
   * exceto quando ele já estiver na página de renovação.
   */
  useEffect(() => {
    if (checkingAuth || checkingProfile) {
      return;
    }

    if (!pathname) {
      return;
    }

    if (mustRedirectToRent) {
      router.replace("/seller/rent");
    }
  }, [
    checkingAuth,
    checkingProfile,
    pathname,
    mustRedirectToRent,
    router,
  ]);

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
    } finally {
      router.replace("/login");
    }
  }, [router]);

  const handleCreateProfileNow =
    useCallback(async () => {
      if (!authUser) return;

      setCreatingProfile(true);
      setErrMsg("");

      try {
        await ensureUserProfile(
          authUser,
          "pt"
        );

        await loadProfile(authUser);
      } catch (error: any) {
        console.error(
          "[SellerGuard] Erro ao criar perfil:",
          error
        );

        setErrMsg(
          error?.message ||
            t("guard.err.createProfile")
        );
      } finally {
        setCreatingProfile(false);
      }
    }, [
      authUser,
      loadProfile,
      t,
    ]);

  const initialLoading =
    checkingAuth ||
    checkingProfile ||
    (
      authUser !== null &&
      profile === null &&
      !profileMissing &&
      !errMsg
    );

  if (initialLoading) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />

        <p className="animate-pulse text-sm font-black text-neutral-500">
          {t("dashboard.checking_session")}
        </p>
      </main>
    );
  }

  if (!authUser) {
    return null;
  }

  if (profileMissing) {
    return (
      <main className="mx-auto mt-12 max-w-md space-y-4 p-4 text-center animate-fade-in">
        <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
          {t("guard.profileMissing.title")}
        </h1>

        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium leading-relaxed text-neutral-600 dark:text-neutral-400">
            {t("guard.profileMissing.desc", {
              path: `users/${authUser.uid}`,
            })}
          </p>

          <button
            type="button"
            onClick={handleCreateProfileNow}
            disabled={creatingProfile}
            className="w-full rounded-2xl bg-black py-3.5 text-sm font-black text-white shadow-xl transition-all hover:opacity-90 disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {creatingProfile
              ? t("common.saving")
              : t(
                  "guard.profileMissing.ctaCreate"
                )}
          </button>
        </div>

        {errMsg && (
          <p className="text-xs font-bold text-red-500">
            {errMsg}
          </p>
        )}
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <h1 className="text-xl font-black text-red-800 dark:text-red-200">
            {t("eventPanel.error.title")}
          </h1>

          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            {errMsg ||
              t("guard.err.loadProfile")}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadProfile(authUser)
            }
            className="w-full rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {t("common.continue")}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-black uppercase tracking-wider text-neutral-500 underline"
          >
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  /**
   * Conta realmente inativa ou suspensa.
   *
   * Isso é diferente de plano vencido.
   * Um seller com plano vencido continua com active=true
   * e pode entrar em /seller/rent.
   */
  if (inactive || suspended) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50/50 p-8 shadow-sm dark:border-red-900/30 dark:bg-red-950/20">
          <div className="text-4xl">
            🚫
          </div>

          <h1 className="text-xl font-black tracking-tight text-red-900 dark:text-red-200">
            {suspended
              ? t("guard.suspended.title")
              : t("guard.inactive.title")}
          </h1>

          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            {suspended
              ? t("guard.suspended.desc")
              : t("guard.inactive.desc")}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-black uppercase tracking-wider text-neutral-900 underline dark:text-white"
          >
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  if (
    !role ||
    (
      role === "seller" &&
      requireSellerIds &&
      (!sellerId || !regionId)
    )
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-4xl">
            ⏳
          </div>

          <h1 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t(
              "guard.notConfigured.title"
            )}
          </h1>

          <p className="text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
            {t(
              "guard.notConfigured.desc",
              {
                path: `users/${authUser.uid}`,
              }
            )}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-2xl border border-neutral-200 py-3.5 text-xs font-black text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            {t("common.back")}
          </button>
        </div>
      </main>
    );
  }

  /**
   * Enquanto o redirecionamento acontece, não renderizamos
   * a página protegida. Isso evita o efeito de piscar.
   */
  if (mustRedirectToRent) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-white dark:bg-neutral-950">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />

        <p className="text-sm font-black text-neutral-500">
          {t("guard.planRequired.title")}
        </p>
      </main>
    );
  }

  /**
   * Na própria página de planos, seller vencido é autorizado.
   */
  if (
    role === "seller" &&
    !planActive &&
    !planRouteAllowed
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-5 rounded-3xl border border-neutral-200 bg-white p-8 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-4xl">
            💳
          </div>

          <h1 className="text-xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t(
              "guard.planRequired.title"
            )}
          </h1>

          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {t(
              "guard.planRequired.desc"
            )}
          </p>

          <Link
            href="/seller/rent"
            replace
            className="block w-full rounded-2xl bg-black py-4 text-sm font-black text-white shadow-lg transition hover:opacity-95 dark:bg-white dark:text-black"
          >
            {t(
              "guard.planRequired.cta"
            )}
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-bold text-neutral-400 underline dark:text-neutral-500"
          >
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  if (typeof children === "function") {
    return (
      <>
        {children({
          user: authUser,
          profile,
        })}
      </>
    );
  }

  return <>{children}</>;
}