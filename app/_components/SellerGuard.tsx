"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";

import {
  auth,
} from "@/app/lib/firebase";
import {
  ensureUserProfile,
  type EnsureResult,
} from "@/app/lib/ensureUserProfile";
import {
  accessIsActive,
  effectivePlanLimits,
  getEffectiveSellerAccess,
  normalizeAccountStatus,
} from "@/app/lib/access-control";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  normalizeSellerOrderSettings,
  type SellerOrderSettings,
} from "@/app/lib/order-settings-schema";
import {
  useI18n,
} from "@/app/lib/i18n";
import type {
  PlanId,
} from "@/app/lib/plan-catalog";
import {
  SellerSessionProvider,
} from "@/app/_components/SellerSessionContext";
import type {
  OperatingCountry,
  RegionalLocale,
  SupportedCurrency,
  SupportedLanguage,
} from "@/app/types/regional";

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
  currentPeriodEnd?: unknown;
  requestedPlanAt?: unknown;
  suspended?: boolean;
  maxEvents?: number;
  maxProducts?: number;
  accessActive?: boolean;
  accessMode?: "subscription" | "lifetime";
  billingInterval?: "monthly" | "annual" | null;

  storeName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
  regionName?: string;
  onboardingComplete?: boolean;
  operatingCountry?: OperatingCountry | null;
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
  timeZone?: string;
  defaultLanguage?: SupportedLanguage;
  orderSettings?: SellerOrderSettings;
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

const RENT_PATH = "/seller/rent";
const ONBOARDING_PATH =
  "/seller/onboarding";

function normalizePathname(
  pathname: string | null,
): string {
  if (!pathname) return "";

  return pathname.length > 1 &&
    pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function isInsideRoute(
  pathname: string,
  route: string,
): boolean {
  return pathname === route ||
    pathname.startsWith(`${route}/`);
}

function buildProfile(
  result: EnsureResult,
): UserDoc {
  const user = result.userDoc;
  const seller = result.sellerDoc;

  const regional =
    normalizeSellerRegionalProfile(
      seller,
      {
        fallbackSellerId:
          String(
            user.sellerId ?? "",
          ).trim(),
        fallbackLanguage:
          user.uiLanguage === "en" ||
          user.uiLanguage === "ja"
            ? user.uiLanguage
            : "pt",
      },
    );

  const access =
    getEffectiveSellerAccess(seller);
  const limits =
    effectivePlanLimits(seller);

  const userStatus =
    normalizeAccountStatus(
      user.accountStatus,
      {
        active: user.active,
        suspended: user.suspended,
      },
    );

  const sellerStatus =
    normalizeAccountStatus(
      seller?.accountStatus,
      {
        active: seller?.active,
        suspended: seller?.suspended,
      },
    );

  return {
    role:
      user.role === "admin"
        ? "admin"
        : "seller",
    sellerId:
      regional.sellerId ||
      String(
        user.sellerId ?? "",
      ).trim(),
    regionId:
      String(
        seller?.regionId ??
        user.regionId ??
        "",
      ).trim(),

    active:
      userStatus !== "disabled" &&
      sellerStatus !== "disabled",
    suspended:
      userStatus === "suspended" ||
      sellerStatus === "suspended",

    plan: access.planId,
    subscriptionStatus:
      access.status === "revoked"
        ? "cancelled"
        : access.status,
    currentPeriodEnd:
      access.currentPeriodEnd,
    maxEvents: limits.maxEvents,
    maxProducts: limits.maxProducts,
    accessActive:
      accessIsActive(
        seller,
        user,
      ),
    accessMode: access.mode,
    billingInterval:
      access.billingInterval,

    storeName: regional.storeName,
    whatsapp: String(seller?.whatsapp ?? "").trim(),
    messengerId: String(seller?.messengerId ?? "").trim(),
    pickupLink: String(seller?.pickupLink ?? "").trim(),
    pickupNote: String(seller?.pickupNote ?? "").trim(),
    regionName: String(seller?.regionName ?? "").trim(),
    onboardingComplete:
      regional.onboardingComplete,
    operatingCountry:
      regional.operatingCountry,
    currency:
      regional.currency,
    regionalLocale:
      regional.regionalLocale,
    timeZone: regional.timeZone,
    defaultLanguage:
      regional.defaultLanguage,
    orderSettings: normalizeSellerOrderSettings(
      seller?.orderSettings,
      seller?.acceptOrdersWithoutStock,
    ),
  };
}

export default function SellerGuard({
  children,
  requireSellerIds = false,
}: SellerGuardProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const { lang } = useI18n();

  const pathname = useMemo(
    () => normalizePathname(rawPathname),
    [rawPathname],
  );

  const onRentRoute =
    isInsideRoute(
      pathname,
      RENT_PATH,
    );

  const onOnboardingRoute =
    isInsideRoute(
      pathname,
      ONBOARDING_PATH,
    );

  const [checking, setChecking] =
    useState(true);
  const [authUser, setAuthUser] =
    useState<User | null>(null);
  const [profile, setProfile] =
    useState<UserDoc | null>(null);
  const [error, setError] =
    useState("");

  const copy =
    lang === "ja"
      ? {
          loading: "アカウントを確認しています…",
          errorTitle: "プロフィールを読み込めませんでした",
          retry: "再試行",
          logout: "ログアウト",
          blockedTitle: "アカウントが停止されています",
          blockedBody: "管理者にお問い合わせください。",
          setupTitle: "販売者プロフィールが未設定です",
          setupBody: "初期設定を完了してください。",
          setup: "初期設定を開く",
          planTitle: "有効なプランが必要です",
          planBody: "月額、年額、またはLifetimeアクセスを選択してください。",
          plans: "プランを見る",
        }
      : lang === "en"
        ? {
            loading: "Checking your account…",
            errorTitle: "We could not load your profile",
            retry: "Try again",
            logout: "Sign out",
            blockedTitle: "Account unavailable",
            blockedBody: "Please contact the administrator.",
            setupTitle: "Seller profile not configured",
            setupBody: "Complete the initial setup to continue.",
            setup: "Open setup",
            planTitle: "An active plan is required",
            planBody: "Choose monthly, annual, or receive Lifetime access.",
            plans: "View plans",
          }
        : {
            loading: "Validando sua conta…",
            errorTitle: "Não foi possível carregar o perfil",
            retry: "Tentar novamente",
            logout: "Sair",
            blockedTitle: "Conta indisponível",
            blockedBody: "Entre em contato com o administrador.",
            setupTitle: "Perfil do vendedor não configurado",
            setupBody: "Conclua a configuração inicial para continuar.",
            setup: "Abrir configuração",
            planTitle: "É necessário um plano ativo",
            planBody: "Escolha mensal, anual ou receba acesso Lifetime.",
            plans: "Ver planos",
          };

  const loadProfile = useCallback(
    async (user: User) => {
      setChecking(true);
      setError("");

      try {
        const result =
          await ensureUserProfile(
            user,
            lang,
          );

        setProfile(
          buildProfile(result),
        );
      } catch (loadError: unknown) {
        console.error(
          "[SellerGuard] loadProfile:",
          loadError,
        );

        setProfile(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "PROFILE_LOAD_FAILED",
        );
      } finally {
        setChecking(false);
      }
    },
    [lang],
  );

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (user) => {
          setAuthUser(user);

          if (!user) {
            setProfile(null);
            setChecking(false);
            router.replace("/login");
            return;
          }

          void loadProfile(user);
        },
      );

    return () => unsubscribe();
  }, [loadProfile, router]);

  useEffect(() => {
    if (
      checking ||
      !authUser ||
      !profile
    ) {
      return;
    }

    if (
      !profile.onboardingComplete &&
      !onOnboardingRoute
    ) {
      router.replace(
        ONBOARDING_PATH,
      );
      return;
    }

    if (
      profile.onboardingComplete &&
      onOnboardingRoute
    ) {
      router.replace(
        profile.accessActive
          ? "/seller"
          : RENT_PATH,
      );
      return;
    }

    if (
      profile.onboardingComplete &&
      !profile.accessActive &&
      !onRentRoute
    ) {
      router.replace(RENT_PATH);
      return;
    }

  }, [
    authUser,
    checking,
    onOnboardingRoute,
    onRentRoute,
    profile,
    router,
  ]);

  const reloadProfile = useCallback(async () => {
    if (!authUser) return;
    await loadProfile(authUser);
  }, [authUser, loadProfile]);

  const handleLogout =
    useCallback(async () => {
      await signOut(auth);
      router.replace("/login");
    }, [router]);

  if (checking) {
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />
        <p className="text-sm font-bold text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  if (!authUser) {
    return null;
  }

  if (!profile) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <h1 className="text-xl font-black text-red-800 dark:text-red-200">
            {copy.errorTitle}
          </h1>

          <p className="break-words text-sm text-red-700 dark:text-red-300">
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              void loadProfile(authUser)
            }
            className="w-full rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {copy.retry}
          </button>

          <button
            type="button"
            onClick={() =>
              void handleLogout()
            }
            className="text-xs font-bold text-neutral-500 underline"
          >
            {copy.logout}
          </button>
        </div>
      </main>
    );
  }

  if (
    profile.active === false ||
    profile.suspended === true
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50/50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <div className="text-4xl">🚫</div>
          <h1 className="text-xl font-black text-red-900 dark:text-red-200">
            {copy.blockedTitle}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {copy.blockedBody}
          </p>
          <button
            type="button"
            onClick={() =>
              void handleLogout()
            }
            className="text-xs font-bold underline"
          >
            {copy.logout}
          </button>
        </div>
      </main>
    );
  }

  if (
    !profile.onboardingComplete &&
    !onOnboardingRoute
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-black">
            {copy.setupTitle}
          </h1>
          <p className="text-sm text-neutral-500">
            {copy.setupBody}
          </p>
          <Link
            href={ONBOARDING_PATH}
            className="block rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {copy.setup}
          </Link>
        </div>
      </main>
    );
  }

  if (
    profile.onboardingComplete &&
    !profile.accessActive &&
    !onRentRoute
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50 p-8 dark:border-amber-900/30 dark:bg-amber-950/20">
          <h1 className="text-xl font-black">
            {copy.planTitle}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {copy.planBody}
          </p>
          <Link
            href={RENT_PATH}
            className="block rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {copy.plans}
          </Link>
        </div>
      </main>
    );
  }

  if (
    requireSellerIds &&
    (
      !profile.sellerId ||
      !profile.regionId
    )
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-black">
            {copy.setupTitle}
          </h1>
          <Link
            href="/seller/settings"
            className="block rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {copy.setup}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <SellerSessionProvider
      user={authUser}
      profile={profile}
      reloadProfile={reloadProfile}
    >
      {typeof children === "function"
        ? children({
            user: authUser,
            profile,
          })
        : children}
    </SellerSessionProvider>
  );
}
