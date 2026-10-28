"use client";

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  sendEmailVerification,
  updateProfile,
  type User,
} from "firebase/auth";
import { ArrowLeft, Loader2, LogIn, Store, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { AppearanceButtons } from "@/app/_components/RoleNavigation";
import PlatformLoginBrand from "@/app/_components/PlatformLoginBrand";
import { resolveAuthenticatedAccount, type ResolvedAccount } from "@/app/lib/auth-role-client";
import { auth } from "@/app/lib/firebase";
import { readStoredCustomerProfile } from "@/app/lib/customer-storage";
import { useI18n } from "@/app/lib/i18n";

type Mode = "login" | "register";

const COPY = {
  pt: {
    title: "Sua conta",
    sellerAccess: "Sou vendedor — acessar meu painel",
    subtitle: "Entre para acompanhar pedidos, pontos e seus dados.",
    login: "Entrar",
    register: "Criar conta",
    name: "Nome",
    email: "E-mail",
    password: "Senha",
    confirm: "Confirmar senha",
    google: "Continuar com Google",
    submitLogin: "Entrar",
    submitRegister: "Criar minha conta",
    weak: "Use uma senha com pelo menos 6 caracteres.",
    mismatch: "As senhas não conferem.",
    missingName: "Informe seu nome.",
    generic: "Não foi possível entrar. Verifique os dados e tente novamente.",
    emailInUse: "Este e-mail já está cadastrado. Tente entrar.",
    invalid: "E-mail ou senha inválidos.",
    loading: "Validando conta...",
    or: "ou",
    visitStore: "Voltar à loja",
    benefit: "Pedidos • Pontos • Perfil",
  },
  en: {
    title: "Your account",
    sellerAccess: "Seller? Open seller sign in",
    subtitle: "Sign in to view orders, rewards and your details.",
    login: "Sign in",
    register: "Create account",
    name: "Name",
    email: "Email",
    password: "Password",
    confirm: "Confirm password",
    google: "Continue with Google",
    submitLogin: "Sign in",
    submitRegister: "Create my account",
    weak: "Use a password with at least 6 characters.",
    mismatch: "Passwords do not match.",
    missingName: "Enter your name.",
    generic: "Could not sign in. Check your details and try again.",
    emailInUse: "This email is already registered. Try signing in.",
    invalid: "Invalid email or password.",
    loading: "Checking account...",
    or: "or",
    visitStore: "Back to store",
    benefit: "Orders • Rewards • Profile",
  },
  ja: {
    title: "お客様アカウント",
    sellerAccess: "販売者ログインへ",
    subtitle: "注文、ポイント、プロフィールを確認できます。",
    login: "ログイン",
    register: "新規登録",
    name: "お名前",
    email: "メールアドレス",
    password: "パスワード",
    confirm: "パスワード確認",
    google: "Googleで続ける",
    submitLogin: "ログイン",
    submitRegister: "アカウントを作成",
    weak: "6文字以上のパスワードを入力してください。",
    mismatch: "パスワードが一致しません。",
    missingName: "お名前を入力してください。",
    generic: "ログインできませんでした。入力内容を確認してください。",
    emailInUse: "このメールアドレスは登録済みです。ログインしてください。",
    invalid: "メールアドレスまたはパスワードが正しくありません。",
    loading: "アカウントを確認中...",
    or: "または",
    visitStore: "ショップへ戻る",
    benefit: "注文 • ポイント • プロフィール",
  },
};

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/customer/orders";
  // Nunca regressar a /login, /seller, /admin ou / (que abre login comercial).
  const pathname = value.split(/[?#]/)[0] || "";
  const allowed = /^\/customer\/(orders|profile|rewards|stores)(\/|$)/.test(pathname)
    || /^\/store\/[a-zA-Z0-9_-]{4,150}(\/|$)/.test(pathname)
    || /^\/event\/[a-zA-Z0-9_-]{4,150}(\/|$)/.test(pathname)
    || /^\/c\/[a-zA-Z0-9_-]{4,150}(\/|$)/.test(pathname);
  return allowed ? value : "/customer/orders";
}

function storeHrefFromNext(next: string): string {
  const store = next.match(/^\/store\/([^/?#]+)/);
  if (store?.[1]) return `/store/${encodeURIComponent(store[1])}`;
  const event = next.match(/^\/event\/([^/?#]+)/);
  if (event?.[1]) return `/store/${encodeURIComponent(event[1])}`;
  const regional = next.match(/^\/c\/([^/?#]+)/);
  if (regional?.[1]) return `/store/${encodeURIComponent(regional[1])}`;
  return "";
}

function errorMessage(error: unknown, text: (typeof COPY)["pt"]): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (code === "auth/email-already-in-use") return text.emailInUse;
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code)) {
    return text.invalid;
  }
  return text.generic;
}

async function ensureCustomerProfile(user: User, language: "pt" | "en" | "ja", name = "") {
  const stored = readStoredCustomerProfile();
  const token = await user.getIdToken();
  const response = await fetch("/api/customer/session", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      name: name || stored.name || user.displayName || "",
      phone: stored.phone || "",
      address: stored.address,
      preferredLanguage: language,
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(typeof payload?.error === "string" ? payload.error : "CUSTOMER_PROFILE_FAILED");
  }
}

function CustomerLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useI18n();
  const language: keyof typeof COPY = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const next = useMemo(() => safeNext(params.get("next")), [params]);
  const storeHref = useMemo(() => storeHrefFromNext(next), [next]);

  const [mode, setMode] = useState<Mode>(() => params.get("mode") === "register" ? "register" : "login");
  const [name, setName] = useState(() => readStoredCustomerProfile().name);
  const [email, setEmail] = useState(() => readStoredCustomerProfile().email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const completingRef = useRef(false);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  const [existingAccount, setExistingAccount] = useState<ResolvedAccount | null>(null);

  const finish = useCallback(
    async (user: User, explicitName = "") => {
      if (completingRef.current) return;
      completingRef.current = true;
      try {
        const resolved = await resolveAuthenticatedAccount(user, next);
        if (resolved.role === "admin" || resolved.role === "seller") {
          router.replace(resolved.destination);
          return;
        }
        if (resolved.issue) {
          // Não reenviar uma identidade de seller/admin inconsistente para o
          // cadastro de customer; isso causava redirecionamentos em loop.
          const notice = language === "ja"
            ? "このアカウントの利用権限に不整合があります。管理者に確認してください。"
            : language === "en"
              ? "This account has inconsistent access settings. Ask an administrator to review its role and status."
              : "Este cadastro possui um conflito de permissões. Um administrador precisa revisar o papel e o status da conta.";
          throw new Error(`${notice} (${resolved.issue})`);
        }
        await ensureCustomerProfile(user, language, explicitName);
        router.replace(next);
      } catch (finishError) {
        completingRef.current = false;
        setChecking(false);
        setBusy(false);
        setError(finishError instanceof Error && finishError.message !== "CUSTOMER_PROFILE_FAILED" ? finishError.message : text.generic);
      }
    },
    [language, next, router, text.generic],
  );

  useEffect(() => {
    let active = true;
    void getRedirectResult(auth)
      .then((result) => {
        if (active && result?.user) void finish(result.user);
      })
      .catch((redirectError) => {
        if (active) setError(errorMessage(redirectError, text));
      });

    // A sessão Firebase é compartilhada por customer/seller/admin no mesmo navegador.
    // Nunca redirecione silenciosamente uma sessão antiga ao abrir esta tela:
    // primeiro ofereça a opção de trocar de conta.
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active || completingRef.current) return;
      if (!user) {
        setExistingUser(null);
        setExistingAccount(null);
        setChecking(false);
        return;
      }
      void resolveAuthenticatedAccount(user, next)
        .then((resolved) => {
          if (!active || completingRef.current) return;
          setExistingUser(user);
          setExistingAccount(resolved);
        })
        .catch((cause) => {
          if (active && !completingRef.current) setError(cause instanceof Error ? cause.message : text.generic);
        })
        .finally(() => {
          if (active && !completingRef.current) setChecking(false);
        });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [finish, text]);

  const switchAccount = async () => {
    setBusy(true);
    try {
      await signOut(auth);
      completingRef.current = false;
      setExistingUser(null);
      setExistingAccount(null);
      setError("");
      setPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.generic);
    } finally {
      setBusy(false);
      setChecking(false);
    }
  };

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 6) return setError(text.weak);
    if (mode === "register" && !name.trim()) return setError(text.missingName);
    if (mode === "register" && password !== confirmPassword) return setError(text.mismatch);

    setBusy(true);
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() }).catch(() => undefined);
        if (params.get("ref") && !credential.user.emailVerified) {
          await sendEmailVerification(credential.user).catch(() => undefined);
        }
        await finish(credential.user, name.trim());
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        await finish(credential.user);
      }
    } catch (submitError) {
      completingRef.current = false;
      setError(errorMessage(submitError, text));
      setBusy(false);
    }
  };

  const submitGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      await finish(credential.user);
    } catch (googleError) {
      const code = googleError && typeof googleError === "object" && "code" in googleError
        ? String((googleError as { code?: unknown }).code || "")
        : "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, new GoogleAuthProvider());
        return;
      }
      completingRef.current = false;
      setError(errorMessage(googleError, text));
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-950 dark:bg-neutral-950 dark:text-white">
        <div className="flex items-center gap-3 text-sm font-bold text-neutral-500"><Loader2 className="animate-spin" size={20} />{text.loading}</div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><AppearanceButtons /></div>
      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8">
        {storeHref && (
          <Link href={storeHref} className="inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            <ArrowLeft size={16} /><Store size={15} />{text.visitStore}
          </Link>
        )}

        <div className={storeHref ? "mt-7 text-center" : "text-center"}>
          <PlatformLoginBrand />
          <h1 className="mt-5 text-2xl font-black tracking-tight">{text.title}</h1>
          <p className="mt-2 text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">{text.subtitle}</p>
          <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-neutral-400">{text.benefit}</p>
        </div>
        <Link href="/login" className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-bold text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">
          <Store size={17} />{text.sellerAccess}
        </Link>

        {existingUser && existingAccount ? (
          <div className="mt-7 space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left dark:border-amber-900/70 dark:bg-amber-950/30">
            <p className="font-black">Sessão já conectada</p>
            <p className="break-all text-sm text-neutral-700 dark:text-neutral-300">{existingUser.email || existingUser.phoneNumber || "Conta Google/SMS"}</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              {existingAccount.role === "admin" ? "Esta é uma conta de administrador." : existingAccount.role === "seller" ? "Esta é uma conta de vendedor." : existingAccount.role === "customer" ? "Esta é uma conta de cliente." : existingAccount.issue ? "Esta conta possui um conflito de permissões que requer revisão administrativa." : "Ainda não existe um perfil para esta conta."}
            </p>
            {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-100 px-3 py-2 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
            {(existingAccount.role === "seller" || existingAccount.role === "admin") ? (
              <Link href={existingAccount.destination || "/login"} className="block rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-neutral-950">Abrir meu painel</Link>
            ) : (
              <button type="button" onClick={() => void finish(existingUser)} className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white dark:bg-white dark:text-neutral-950">Continuar como cliente</button>
            )}
            <button type="button" onClick={() => void switchAccount()} disabled={busy} className="w-full rounded-xl border border-neutral-400 px-4 py-3 text-sm font-black disabled:opacity-50 dark:border-neutral-600">Sair desta conta e usar outra</button>
          </div>
        ) : <>
        <div className="mt-7 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          <button type="button" onClick={() => setMode("login")} className={`rounded-lg px-3 py-2 text-sm font-black transition ${mode === "login" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"}`}>{text.login}</button>
          <button type="button" onClick={() => setMode("register")} className={`rounded-lg px-3 py-2 text-sm font-black transition ${mode === "register" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"}`}>{text.register}</button>
        </div>

        <button type="button" onClick={() => void submitGoogle()} disabled={busy} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
          {busy ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}{text.google}
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-neutral-400"><span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />{text.or}<span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" /></div>

        <form onSubmit={submitEmail} className="space-y-4">
          {mode === "register" && <Field label={text.name}><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required className="input-neutral" /></Field>}
          <Field label={text.email}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="input-neutral" /></Field>
          <Field label={text.password}><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required className="input-neutral" /></Field>
          {mode === "register" && <Field label={text.confirm}><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required className="input-neutral" /></Field>}

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
          <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200">
            {busy ? <Loader2 className="animate-spin" size={18} /> : mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}{mode === "register" ? text.submitRegister : text.submitLogin}
          </button>
        </form>
        </>}
      </section>
      <style jsx>{` .input-neutral { width: 100%; border-radius: .75rem; border: 1px solid rgb(212 212 212); background: transparent; padding: .75rem 1rem; outline: none; } :global(.dark) .input-neutral { border-color: rgb(64 64 64); } .input-neutral:focus { border-color: rgb(23 23 23); } :global(.dark) .input-neutral:focus { border-color: white; } `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-xs font-black">{label}</span>{children}</label>;
}

export default function CustomerLoginPage() {
  return <Suspense fallback={null}><CustomerLoginContent /></Suspense>;
}
