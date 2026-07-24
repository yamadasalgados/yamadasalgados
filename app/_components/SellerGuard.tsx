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
import type {
  Timestamp,
} from "firebase/firestore";

import {
  auth,
} from "@/app/lib/firebase";
import {
  ensureUserProfile,
  type EnsureResult,
} from "@/app/lib/ensureUserProfile";
import {
  normalizePlanId,
  type PlanId,
} from "@/app/lib/plan-catalog";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  useI18n,
} from "@/app/lib/i18n";
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
  currentPeriodEnd?: Timestamp;
  requestedPlanAt?: Timestamp;
  suspended?: boolean;

  storeName?: string;
  onboardingComplete?: boolean;
  operatingCountry?: OperatingCountry | null;
  currency?: SupportedCurrency | null;
  regionalLocale?: RegionalLocale | null;
  timeZone?: string;
  defaultLanguage?: SupportedLanguage;
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

function normalizeSubscriptionStatus(
  value: unknown,
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

function timestampToDate(
  value: unknown,
): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value
  ) {
    const toDate = (
      value as {
        toDate?: unknown;
      }
    ).toDate;

    if (typeof toDate === "function") {
      const date = toDate.call(value);

      return date instanceof Date &&
        !Number.isNaN(date.getTime())
        ? date
        : null;
    }
  }

  return null;
}

function isSubscriptionPeriodValid(
  periodEnd: unknown,
): boolean {
  if (!periodEnd) return true;

  const endDate =
    timestampToDate(periodEnd);

  return Boolean(
    endDate &&
      endDate.getTime() > Date.now(),
  );
}

function buildProfile(
  result: EnsureResult,
): UserDoc {
  const user = result.userDoc;
  const seller = result.sellerDoc;

  const role =
    user.role === "admin"
      ? "admin"
      : "seller";

  if (role === "admin") {
    return {
      role,
      active: user.active !== false,
      suspended: user.suspended === true,
      plan: "starter",
      subscriptionStatus: "active",
      onboardingComplete: true,
    };
  }

  const regional =
    normalizeSellerRegionalProfile(
      seller,
      {
        fallbackSellerId:
          String(
            user.sellerId ?? "",
          ).trim(),
        fallbackLanguage:
          user.locale === "en" ||
          user.locale === "ja"
            ? user.locale
            : "pt",
      },
    );

  const commercial =
    seller ?? user;

  return {
    role,
    sellerId:
      regional.sellerId ||
      String(user.sellerId ?? "").trim(),
    regionId:
      String(
        commercial.regionId ??
          user.regionId ??
          "",
      ).trim(),

    active:
      user.active !== false &&
      commercial.active !== false,
    suspended:
      user.suspended === true ||
      commercial.suspended === true,

    // Durante a migração, o admin legado ainda atualiza users/{uid}.
    // A assinatura usa o espelho do usuário primeiro até o pacote admin.
    plan: normalizePlanId(
      user.plan ?? commercial.plan,
    ),
    subscriptionStatus:
      normalizeSubscriptionStatus(
        user.subscriptionStatus ??
          commercial.subscriptionStatus,
      ),
    currentPeriodEnd:
      user.currentPeriodEnd ??
      commercial.currentPeriodEnd,
    requestedPlanAt:
      user.requestedPlanAt ??
      commercial.requestedPlanAt,

    storeName: regional.storeName,
    onboardingComplete:
      regional.onboardingComplete,
    operatingCountry:
      regional.operatingCountry,
    currency: regional.currency,
    regionalLocale:
      regional.regionalLocale,
    timeZone: regional.timeZone,
    defaultLanguage:
      regional.defaultLanguage,
  };
}

export default function SellerGuard({
  children,
  requireSellerIds = false,
}: SellerGuardProps) {
  const router = useRouter();
  const rawPathname = usePathname();
  const { t, lang } = useI18n();

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
  const [errMsg, setErrMsg] =
    useState("");

  const loadProfile = useCallback(
    async (user: User) => {
      setErrMsg("");

      try {
        const result =
          await ensureUserProfile(
            user,
            lang,
          );

        setProfile(
          buildProfile(result),
        );
      } catch (error: any) {
        console.error(
          "[SellerGuard] Falha ao validar perfil:",
          error,
        );

        setProfile(null);
        setErrMsg(
          error?.message ||
            t("guard.err.loadProfile"),
        );
      } finally {
        setChecking(false);
      }
    },
    [lang, t],
  );

  useEffect(() => {
    setChecking(true);

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

  const role = profile?.role ?? null;
  const inactive =
    profile?.active === false;
  const suspended =
    profile?.suspended === true;
  const sellerId =
    profile?.sellerId?.trim() || "";
  const regionId =
    profile?.regionId?.trim() || "";

  const planActive = useMemo(() => {
    if (!profile) return false;
    if (role === "admin") return true;
    if (role !== "seller") return false;
    if (inactive || suspended) {
      return false;
    }

    if (
      profile.subscriptionStatus !==
      "active"
    ) {
      return false;
    }

    return isSubscriptionPeriodValid(
      profile.currentPeriodEnd,
    );
  }, [
    inactive,
    profile,
    role,
    suspended,
  ]);

  const needsOnboarding =
    role === "seller" &&
    profile?.onboardingComplete !== true;

  const mustRedirectToOnboarding =
    Boolean(
      authUser &&
        profile &&
        needsOnboarding &&
        !onOnboardingRoute,
    );

  const mustRedirectToRent =
    Boolean(
      authUser &&
        profile &&
        role === "seller" &&
        !needsOnboarding &&
        !planActive &&
        !onRentRoute &&
        !onOnboardingRoute,
    );

  useEffect(() => {
    if (
      checking ||
      !pathname
    ) {
      return;
    }

    if (mustRedirectToOnboarding) {
      router.replace(
        ONBOARDING_PATH,
      );
      return;
    }

    if (mustRedirectToRent) {
      router.replace(RENT_PATH);
    }
  }, [
    checking,
    mustRedirectToOnboarding,
    mustRedirectToRent,
    pathname,
    router,
  ]);

  const handleLogout =
    useCallback(async () => {
      try {
        await signOut(auth);
      } finally {
        router.replace("/login");
      }
    }, [router]);

  if (
    checking ||
    mustRedirectToOnboarding ||
    mustRedirectToRent
  ) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4 bg-white transition-colors dark:bg-neutral-950">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />

        <p className="text-sm font-bold text-neutral-500">
          {needsOnboarding
            ? t("onboarding.loading")
            : t("dashboard.checking_session")}
        </p>
      </main>
    );
  }

  if (!authUser) return null;

  if (!profile) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <h1 className="text-xl font-black text-red-800 dark:text-red-200">
            {t("guard.profileMissing.title")}
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
            className="text-xs font-bold text-neutral-500 underline"
          >
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  if (inactive || suspended) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50/50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <div className="text-4xl">🚫</div>

          <h1 className="text-xl font-black text-red-900 dark:text-red-200">
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
            className="text-xs font-bold text-neutral-900 underline dark:text-white"
          >
            {t("common.logout")}
          </button>
        </div>
      </main>
    );
  }

  if (
    role !== "admin" &&
    (
      !sellerId ||
      (
        requireSellerIds &&
        !regionId
      )
    )
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">
            {t("guard.notConfigured.title")}
          </h1>

          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {t("guard.missingSellerIds", {
              path: `users/${authUser.uid}`,
            })}
          </p>

          <Link
            href={ONBOARDING_PATH}
            className="block w-full rounded-2xl bg-black py-3.5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {t("onboarding.open")}
          </Link>
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
