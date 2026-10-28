"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
  type ConfirmationResult,
  type User,
} from "firebase/auth";

import { AppearanceButtons } from "@/app/_components/RoleNavigation";
import PlatformLoginBrand from "@/app/_components/PlatformLoginBrand";
import { resolveAuthenticatedAccount, type ResolvedAccount } from "@/app/lib/auth-role-client";
import { auth } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";

type AuthMode = "email" | "google" | "phone";
type Busy = null | "email" | "google" | "sendCode" | "verifyCode";

function friendlyAuthError(error: unknown, fallback: string): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "E-mail ou senha inválidos.";
    case "auth/too-many-requests":
      return "Muitas tentativas. Aguarde e tente novamente.";
    case "auth/invalid-email":
      return "E-mail inválido.";
    case "auth/popup-closed-by-user":
      return "Login cancelado.";
    case "auth/popup-blocked":
      return "O navegador bloqueou a janela de login. Libere pop-ups e tente novamente.";
    case "auth/unauthorized-domain":
      return "Este domínio ainda não está autorizado para login.";
    case "auth/operation-not-allowed":
      return "Este método de login não está habilitado.";
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return "Informe o telefone com DDI, por exemplo +81...";
    case "auth/captcha-check-failed":
      return "Falha no reCAPTCHA. Recarregue a página e tente novamente.";
    case "auth/code-expired":
      return "O código expirou. Solicite um novo.";
    case "auth/invalid-verification-code":
      return "Código inválido.";
    default:
      return fallback;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";

  const copy = useMemo(
    () =>
      language === "ja"
        ? {
            title: "販売者ログイン",
            subtitle: "店舗・注文・イベント管理画面へログインします。",
            email: "メールアドレス",
            password: "パスワード",
            enter: "ログイン",
            entering: "確認中…",
            google: "Googleでログイン",
            sms: "SMS",
            phone: "電話番号",
            send: "コードを送信",
            code: "確認コード",
            verify: "確認してログイン",
            unknown: "このアカウントには販売者アクセスが設定されていません。",
            generic: "ログインできませんでした。もう一度お試しください。",
            businessQuestion: "このシステムをお店で利用したいですか？",
            requestAccess: "利用について問い合わせる",
            customerAccess: "お客様はこちらからログイン",
          }
        : language === "en"
          ? {
              title: "Seller access",
              subtitle: "Sign in to manage your store, orders and events.",
              email: "Email",
              password: "Password",
              enter: "Sign in",
              entering: "Checking…",
              google: "Continue with Google",
              sms: "SMS",
              phone: "Phone number",
              send: "Send code",
              code: "Verification code",
              verify: "Verify and sign in",
              unknown: "Seller access has not been enabled for this account.",
              generic: "Could not sign in. Please try again.",
              businessQuestion: "Want to use the platform for your business?",
              requestAccess: "Request access",
              customerAccess: "Shopping? Customer sign in",
            }
          : {
              title: "Acesso do vendedor",
              subtitle: "Entre para gerenciar sua loja, pedidos e eventos.",
              email: "E-mail",
              password: "Senha",
              enter: "Entrar",
              entering: "Validando…",
              google: "Continuar com Google",
              sms: "SMS",
              phone: "Telefone",
              send: "Enviar código",
              code: "Código de confirmação",
              verify: "Confirmar e entrar",
              unknown: "O acesso de vendedor ainda não está habilitado para esta conta.",
              generic: "Não foi possível entrar. Tente novamente.",
              businessQuestion: "Quer usar a plataforma no seu negócio?",
              requestAccess: "Solicitar acesso",
              customerAccess: "Vai comprar? Entrar como cliente",
            },
    [language],
  );

  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<AuthMode>("email");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const routingRef = useRef(false);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  const [existingAccount, setExistingAccount] = useState<ResolvedAccount | null>(null);

  const routeAuthenticatedUser = useCallback(
    async (user: User) => {
      if (routingRef.current) return;
      routingRef.current = true;

      try {
        const resolved = await resolveAuthenticatedAccount(user, "/customer/orders");
        if (resolved.role === "unknown") {
          await signOut(auth).catch(() => undefined);
          routingRef.current = false;
          setChecking(false);
          setError(copy.unknown);
          return;
        }

        // Admin, seller e customer são identificados pelo backend. A interface
        // desta página continua sendo exclusivamente apresentada como acesso do vendedor.
        router.replace(resolved.destination || "/login");
      } catch (routeError) {
        routingRef.current = false;
        setChecking(false);
        setError(friendlyAuthError(routeError, copy.generic));
      }
    },
    [copy.generic, copy.unknown, router],
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!active || routingRef.current) return;
      if (!user) {
        setExistingUser(null);
        setExistingAccount(null);
        setChecking(false);
        return;
      }
      // Não redirecionar automaticamente uma sessão antiga entre login de
      // cliente e vendedor. Exibir escolha explícita, evitando loops.
      void resolveAuthenticatedAccount(user)
        .then((resolved) => {
          if (!active || routingRef.current) return;
          setExistingUser(user);
          setExistingAccount(resolved);
        })
        .catch((cause) => {
          if (active && !routingRef.current) setError(friendlyAuthError(cause, copy.generic));
        })
        .finally(() => {
          if (active && !routingRef.current) setChecking(false);
        });
    });
    return () => { active = false; unsubscribe(); };
  }, [copy.generic]);

  const switchAccount = async () => {
    setBusy("email");
    try {
      await signOut(auth);
      routingRef.current = false;
      setExistingUser(null);
      setExistingAccount(null);
      setPassword("");
      setError("");
    } catch (cause) {
      setError(friendlyAuthError(cause, copy.generic));
    } finally {
      setBusy(null);
      setChecking(false);
    }
  };

  useEffect(() => {
    if (mode !== "phone" || typeof window === "undefined") return;

    if (recaptchaRef.current) {
      setRecaptchaReady(true);
      return;
    }

    try {
      recaptchaRef.current = new RecaptchaVerifier(auth, "seller-login-recaptcha", {
        size: "invisible",
      });
      setRecaptchaReady(true);
    } catch {
      setRecaptchaReady(false);
    }

    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
      setRecaptchaReady(false);
    };
  }, [mode]);

  const submitEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError("");
    setBusy("email");
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await routeAuthenticatedUser(credential.user);
    } catch (submitError) {
      routingRef.current = false;
      setError(friendlyAuthError(submitError, copy.generic));
    } finally {
      setBusy(null);
    }
  };

  const submitGoogle = async () => {
    if (busy) return;
    setError("");
    setBusy("google");
    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());
      await routeAuthenticatedUser(credential.user);
    } catch (googleError) {
      routingRef.current = false;
      setError(friendlyAuthError(googleError, copy.generic));
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    if (busy || !phone.trim()) return;
    if (!recaptchaRef.current || !recaptchaReady) {
      setError(copy.generic);
      return;
    }

    setError("");
    setBusy("sendCode");
    try {
      confirmationRef.current = await signInWithPhoneNumber(
        auth,
        phone.trim(),
        recaptchaRef.current,
      );
    } catch (sendError) {
      setError(friendlyAuthError(sendError, copy.generic));
      try {
        recaptchaRef.current?.clear();
      } catch {}
      recaptchaRef.current = null;
      setRecaptchaReady(false);
    } finally {
      setBusy(null);
    }
  };

  const verifyCode = async () => {
    if (busy || !confirmationRef.current || !smsCode.trim()) return;
    setError("");
    setBusy("verifyCode");
    try {
      const credential = await confirmationRef.current.confirm(smsCode.trim());
      await routeAuthenticatedUser(credential.user);
    } catch (verifyError) {
      routingRef.current = false;
      setError(friendlyAuthError(verifyError, copy.generic));
    } finally {
      setBusy(null);
    }
  };

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 text-sm font-bold text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
        {copy.entering}
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <AppearanceButtons />
      </div>

      <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8">
        <div className="flex flex-col items-center text-center">
          <PlatformLoginBrand />
          <h1 className="mt-5 text-2xl font-black tracking-tight">{copy.title}</h1>
          <p className="mt-2 max-w-xs text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
            {copy.subtitle}
          </p>
        </div>

        <Link href="/customer/login" className="mt-6 flex min-h-11 w-full items-center justify-center rounded-xl border border-neutral-300 px-4 py-3 text-sm font-bold text-neutral-800 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800">
          {copy.customerAccess}
        </Link>

        {existingUser && existingAccount ? (
          <div className="mt-7 space-y-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900/70 dark:bg-amber-950/30">
            <p className="font-black">Sessão já conectada</p>
            <p className="break-all text-sm text-neutral-700 dark:text-neutral-300">{existingUser.email || existingUser.phoneNumber || "Conta Google/SMS"}</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">{existingAccount.role === "admin" ? "Você está conectado como administrador." : existingAccount.role === "seller" ? "Você está conectado como vendedor." : existingAccount.role === "customer" ? "Você está conectado como cliente." : "Sua conta ainda não possui perfil de vendedor."}</p>
            {existingAccount.role === "admin" || existingAccount.role === "seller" ? (
              <Link href={existingAccount.destination || "/login"} className="block rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-neutral-950">Abrir meu painel</Link>
            ) : (
              <Link href="/customer/orders" className="block rounded-xl bg-neutral-950 px-4 py-3 text-center text-sm font-black text-white dark:bg-white dark:text-neutral-950">Ir para minha conta de cliente</Link>
            )}
            <button type="button" onClick={() => void switchAccount()} disabled={busy !== null} className="w-full rounded-xl border border-neutral-400 px-4 py-3 text-sm font-black dark:border-neutral-600">Sair desta conta e entrar com outra</button>
          </div>
        ) : <>
        <div className="mt-7 grid grid-cols-3 gap-2">
          {(["email", "google", "phone"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setMode(item);
                setError("");
              }}
              className={`rounded-xl border px-3 py-2.5 text-xs font-black transition ${
                mode === item
                  ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                  : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {item === "email" ? copy.email : item === "google" ? "Google" : copy.sms}
            </button>
          ))}
        </div>

        {mode === "email" && (
          <form onSubmit={submitEmail} className="mt-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-black">{copy.email}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black">{copy.password}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
              />
            </label>
            <button
              type="submit"
              disabled={busy === "email"}
              className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {busy === "email" ? copy.entering : copy.enter}
            </button>
          </form>
        )}

        {mode === "google" && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => void submitGoogle()}
              disabled={busy === "google"}
              className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              {busy === "google" ? copy.entering : copy.google}
            </button>
          </div>
        )}

        {mode === "phone" && (
          <div className="mt-6 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-black">{copy.phone}</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+81..."
                autoComplete="tel"
                className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
              />
            </label>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy === "sendCode" || !phone.trim()}
              className="min-h-11 w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-xs font-black disabled:opacity-50 dark:border-neutral-700"
            >
              {busy === "sendCode" ? copy.entering : copy.send}
            </button>
            {confirmationRef.current && (
              <>
                <label className="block space-y-1.5">
                  <span className="text-xs font-black">{copy.code}</span>
                  <input
                    value={smsCode}
                    onChange={(event) => setSmsCode(event.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void verifyCode()}
                  disabled={busy === "verifyCode" || !smsCode.trim()}
                  className="min-h-12 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-neutral-950"
                >
                  {busy === "verifyCode" ? copy.entering : copy.verify}
                </button>
              </>
            )}
          </div>
        )}

        </>}
        {error && (
          <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-7 border-t border-neutral-200 pt-5 text-center dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {copy.businessQuestion}
          </p>
          <Link
            href="/partners"
            className="mt-2 inline-flex text-xs font-black text-neutral-900 underline-offset-4 hover:underline dark:text-white"
          >
            {copy.requestAccess}
          </Link>
        </div>

        <div id="seller-login-recaptcha" />
      </section>
    </main>
  );
}
