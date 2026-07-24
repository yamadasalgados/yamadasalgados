"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useRouter,
} from "next/navigation";
import {
  onAuthStateChanged,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";

import {
  auth,
  db,
} from "@/app/lib/firebase";
import {
  normalizeAccountStatus,
  type AccountStatus,
} from "@/app/lib/access-control";
import {
  useI18n,
} from "@/app/lib/i18n";

export type AdminProfile = {
  role: "admin";
  sellerId: string;
  email: string | null;
  displayName: string | null;
  accountStatus: AccountStatus;
};

export default function AdminGuard({
  children,
}: {
  children:
    | ReactNode
    | ((args: {
        user: User;
        profile: AdminProfile;
      }) => ReactNode);
}) {
  const router = useRouter();
  const { lang } = useI18n();

  const [checking, setChecking] =
    useState(true);
  const [user, setUser] =
    useState<User | null>(null);
  const [profile, setProfile] =
    useState<AdminProfile | null>(null);
  const [missing, setMissing] =
    useState(false);
  const [error, setError] =
    useState("");

  const copy =
    lang === "ja"
      ? {
          loading: "管理者権限を確認しています…",
          missing: "管理者プロフィールがありません",
          denied: "管理者権限がありません",
          blocked: "管理者アカウントが停止されています",
          bootstrap: "bootstrap-admin-lifetime スクリプトを実行してください。",
          seller: "販売者画面へ",
          logout: "ログアウト",
        }
      : lang === "en"
        ? {
            loading: "Checking administrator access…",
            missing: "Administrator profile not found",
            denied: "Administrator access required",
            blocked: "Administrator account is unavailable",
            bootstrap: "Run the bootstrap-admin-lifetime script.",
            seller: "Go to seller panel",
            logout: "Sign out",
          }
        : {
            loading: "Validando acesso administrativo…",
            missing: "Perfil administrativo não encontrado",
            denied: "Acesso exclusivo do administrador",
            blocked: "Conta administrativa indisponível",
            bootstrap: "Execute o script bootstrap-admin-lifetime.",
            seller: "Ir para o painel do vendedor",
            logout: "Sair",
          };

  const load = useCallback(
    async (currentUser: User) => {
      setChecking(true);
      setMissing(false);
      setError("");

      try {
        const snapshot =
          await getDoc(
            doc(
              db,
              "users",
              currentUser.uid,
            ),
          );

        if (!snapshot.exists()) {
          setMissing(true);
          setProfile(null);
          return;
        }

        const data = snapshot.data();

        if (data.role !== "admin") {
          setProfile(null);
          setError("ADMIN_ROLE_REQUIRED");
          return;
        }

        setProfile({
          role: "admin",
          sellerId:
            String(
              data.sellerId ??
              currentUser.uid,
            ).trim(),
          email:
            typeof data.email ===
            "string"
              ? data.email
              : currentUser.email,
          displayName:
            typeof data.displayName ===
            "string"
              ? data.displayName
              : currentUser.displayName,
          accountStatus:
            normalizeAccountStatus(
              data.accountStatus,
              {
                active: data.active,
                suspended:
                  data.suspended,
              },
            ),
        });
      } catch (loadError: unknown) {
        console.error(
          "[AdminGuard] load:",
          loadError,
        );

        setProfile(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "ADMIN_PROFILE_LOAD_FAILED",
        );
      } finally {
        setChecking(false);
      }
    },
    [],
  );

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);

          if (!currentUser) {
            setChecking(false);
            router.replace("/login");
            return;
          }

          void load(currentUser);
        },
      );

    return () => unsubscribe();
  }, [load, router]);

  const logout =
    useCallback(async () => {
      await signOut(auth);
      router.replace("/login");
    }, [router]);

  if (checking) {
    return (
      <main className="flex min-h-[65vh] flex-col items-center justify-center gap-4">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 dark:border-neutral-800 dark:border-t-white" />
        <p className="text-sm font-black text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (missing) {
    return (
      <main className="mx-auto mt-12 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-amber-200 bg-amber-50 p-8 dark:border-amber-900/30 dark:bg-amber-950/20">
          <h1 className="text-xl font-black">
            {copy.missing}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {copy.bootstrap}
          </p>
          <code className="block break-all rounded-xl bg-black/5 p-3 text-xs dark:bg-white/10">
            users/{user.uid}
          </code>
          <button
            type="button"
            onClick={() =>
              void logout()
            }
            className="text-xs font-black underline"
          >
            {copy.logout}
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50/50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <div className="text-4xl">🛑</div>
          <h1 className="text-xl font-black text-red-900 dark:text-red-200">
            {copy.denied}
          </h1>
          {error && (
            <p className="break-words text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}
          <Link
            href="/seller"
            className="block rounded-2xl bg-black py-3 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            {copy.seller}
          </Link>
          <button
            type="button"
            onClick={() =>
              void logout()
            }
            className="text-xs font-black underline"
          >
            {copy.logout}
          </button>
        </div>
      </main>
    );
  }

  if (
    profile.accountStatus !== "active"
  ) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50/50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <h1 className="text-xl font-black">
            {copy.blocked}
          </h1>
          <button
            type="button"
            onClick={() =>
              void logout()
            }
            className="text-xs font-black underline"
          >
            {copy.logout}
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {typeof children === "function"
        ? children({
            user,
            profile,
          })
        : children}
    </>
  );
}
