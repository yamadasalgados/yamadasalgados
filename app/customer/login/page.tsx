"use client";

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type User,
} from "firebase/auth";
import { ArrowLeft, Gift, Loader2, LogIn, Store, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import CustomerAppReadiness from "@/app/_components/CustomerAppReadiness";
import { auth } from "@/app/lib/firebase";
import { readStoredCustomerProfile } from "@/app/lib/customer-storage";
import { useI18n } from "@/app/lib/i18n";

type Mode = "login" | "register";

const COPY = {
  pt: {
    title: "Conta do cliente",
    subtitle: "Entre para manter seus pedidos e acumular pontos.",
    reward: "Ganhe 1 ponto a cada ¥100 pagos e use depois como desconto ou troca por produto.",
    login: "Entrar",
    register: "Criar conta",
    name: "Nome",
    email: "E-mail",
    password: "Senha",
    confirm: "Confirmar senha",
    google: "Continuar com Google",
    submitLogin: "Entrar na conta",
    submitRegister: "Criar minha conta",
    back: "Voltar",
    weak: "Use uma senha com pelo menos 6 caracteres.",
    mismatch: "As senhas não conferem.",
    missingName: "Informe seu nome.",
    generic: "Não foi possível entrar. Verifique os dados e tente novamente.",
    emailInUse: "Este e-mail já está cadastrado. Tente entrar.",
    invalid: "E-mail ou senha inválidos.",
    loading: "Validando conta...",
    or: "ou",
    visitStore: "Visitar a loja",
  },
  en: {
    title: "Customer account",
    subtitle: "Sign in to keep your orders and earn points.",
    reward: "Earn 1 point for every ¥100 paid, then use points as a discount or product reward.",
    login: "Sign in",
    register: "Create account",
    name: "Name",
    email: "Email",
    password: "Password",
    confirm: "Confirm password",
    google: "Continue with Google",
    submitLogin: "Sign in",
    submitRegister: "Create my account",
    back: "Back",
    weak: "Use a password with at least 6 characters.",
    mismatch: "Passwords do not match.",
    missingName: "Enter your name.",
    generic: "Could not sign in. Check your details and try again.",
    emailInUse: "This email is already registered. Try signing in.",
    invalid: "Invalid email or password.",
    loading: "Checking account...",
    or: "or",
    visitStore: "Visit store",
  },
  ja: {
    title: "お客様アカウント",
    subtitle: "ログインすると注文履歴を保持し、ポイントを貯められます。",
    reward: "お支払い¥100ごとに1ポイント。割引または商品交換に利用できます。",
    login: "ログイン",
    register: "新規登録",
    name: "お名前",
    email: "メールアドレス",
    password: "パスワード",
    confirm: "パスワード確認",
    google: "Googleで続ける",
    submitLogin: "ログイン",
    submitRegister: "アカウントを作成",
    back: "戻る",
    weak: "6文字以上のパスワードを入力してください。",
    mismatch: "パスワードが一致しません。",
    missingName: "お名前を入力してください。",
    generic: "ログインできませんでした。入力内容を確認してください。",
    emailInUse: "このメールアドレスは登録済みです。ログインしてください。",
    invalid: "メールアドレスまたはパスワードが正しくありません。",
    loading: "アカウントを確認中...",
    or: "または",
    visitStore: "ショップを見る",
  },
};

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function storeHrefFromNext(next: string): string {
  const match = next.match(/^\/event\/([^/]+)/);
  return match?.[1] ? `/store/${encodeURIComponent(match[1])}` : "";
}

function errorMessage(error: unknown, text: (typeof COPY)["pt"]): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  if (code === "auth/email-already-in-use") return text.emailInUse;
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found" ||
    code === "auth/invalid-email"
  ) {
    return text.invalid;
  }

  return text.generic;
}

async function ensureCustomerProfile(user: User, language: "pt" | "en" | "ja", name = "") {
  const stored = readStoredCustomerProfile();
  const token = await user.getIdToken();
  const response = await fetch("/api/customer/session", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
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
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Não foi possível criar a conta do cliente.",
    );
  }
}

function CustomerLoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { lang } = useI18n();
  const language: keyof typeof COPY =
    lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const next = useMemo(() => safeNext(params.get("next")), [params]);
  const storeHref = useMemo(() => storeHrefFromNext(next), [next]);

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState(() => readStoredCustomerProfile().name);
  const [email, setEmail] = useState(() => readStoredCustomerProfile().email);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const completingRef = useRef(false);

  const finish = useCallback(
    async (user: User, explicitName = "") => {
      if (completingRef.current) return;
      completingRef.current = true;

      try {
        await ensureCustomerProfile(user, language, explicitName);
        router.replace(next);
      } catch (finishError) {
        completingRef.current = false;
        setChecking(false);
        setBusy(false);
        setError(finishError instanceof Error ? finishError.message : text.generic);
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

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active) return;
      if (user) {
        void finish(user);
      } else {
        setChecking(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [finish, text]);

  const submitEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    setError("");
    if (password.length < 6) {
      setError(text.weak);
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError(text.missingName);
      return;
    }
    if (mode === "register" && password !== confirmPassword) {
      setError(text.mismatch);
      return;
    }

    setBusy(true);
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() }).catch(() => undefined);
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
      const provider = new GoogleAuthProvider();
      const credential = await signInWithPopup(auth, provider);
      await finish(credential.user);
    } catch (googleError) {
      const code =
        googleError && typeof googleError === "object" && "code" in googleError
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
        <div className="flex items-center gap-3 text-sm font-bold text-neutral-500">
          <Loader2 className="animate-spin" size={20} />
          {text.loading}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:py-14">
      <section className="mx-auto w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={next} className="inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
            <ArrowLeft size={16} />
            {text.back}
          </Link>
          {storeHref && (
            <Link href={storeHref} className="inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-neutral-900 dark:hover:text-white">
              <Store size={15} />
              {text.visitStore}
            </Link>
          )}
        </div>

        <div className="mt-5">
          <CustomerAppReadiness language={language} compact />
        </div>

        <div className="mt-6 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <Gift className="mt-0.5 shrink-0 text-amber-600" size={22} />
            <div>
              <h1 className="text-xl font-black">{text.title}</h1>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{text.subtitle}</p>
              <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">{text.reward}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-lg px-3 py-2 text-sm font-black transition ${
              mode === "login" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"
            }`}
          >
            {text.login}
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-lg px-3 py-2 text-sm font-black transition ${
              mode === "register" ? "bg-white shadow-sm dark:bg-neutral-700" : "text-neutral-500"
            }`}
          >
            {text.register}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void submitGoogle()}
          disabled={busy}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-black transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
          {text.google}
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-neutral-400">
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
          {text.or}
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <form onSubmit={submitEmail} className="space-y-4">
          {mode === "register" && (
            <label className="block space-y-1.5">
              <span className="text-xs font-black">{text.name}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-black">{text.email}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-black">{text.password}</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              required
              className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
            />
          </label>

          {mode === "register" && (
            <label className="block space-y-1.5">
              <span className="text-xs font-black">{text.confirm}</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                required
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:focus:border-white"
              />
            </label>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
          >
            {busy ? <Loader2 className="animate-spin" size={18} /> : mode === "register" ? <UserPlus size={18} /> : <LogIn size={18} />}
            {mode === "register" ? text.submitRegister : text.submitLogin}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={null}>
      <CustomerLoginContent />
    </Suspense>
  );
}
