"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth } from "@/app/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type User,
} from "firebase/auth";
import {
  ensureUserProfile,
  type EnsureResult,
} from "@/app/lib/ensureUserProfile";
import {
  accessIsActive,
} from "@/app/lib/access-control";
import {
  hasCompleteSellerOnboarding,
} from "@/app/lib/seller-regional-profile";
import { AppearanceButtons } from "@/app/_components/RoleNavigation";
import { resolveAuthenticatedAccount } from "@/app/lib/auth-role-client";
import { useI18n } from "@/app/lib/i18n";

type AuthMode = "email" | "google" | "phone";
type Busy = null | "email" | "register" | "google" | "sendCode" | "verifyCode";

type Role = "admin" | "seller";

function friendlyAuthError(err: any, tt: (k: string, fallback: string) => string) {
  const code = String(err?.code || "");

  // Email/senha
  if (code === "auth/invalid-credential") return tt("auth.err.invalidCredential", "E-mail ou senha inválidos.");
  if (code === "auth/user-not-found") return tt("auth.err.userNotFound", "Usuário não encontrado. Crie uma conta.");
  if (code === "auth/wrong-password") return tt("auth.err.wrongPassword", "Senha incorreta.");
  if (code === "auth/too-many-requests") return tt("auth.err.tooManyRequests", "Muitas tentativas. Aguarde e tente novamente.");
  if (code === "auth/invalid-email") return tt("auth.err.invalidEmail", "E-mail inválido.");
  if (code === "auth/email-already-in-use") return tt("auth.err.emailInUse", "Esse e-mail já está em uso. Tente entrar.");
  if (code === "auth/weak-password") return tt("auth.err.weakPassword", "Senha fraca. Use pelo menos 6 caracteres.");

  // Google
  if (code === "auth/popup-closed-by-user") return tt("auth.err.popupClosed", "Login cancelado.");
  if (code === "auth/popup-blocked") return tt("auth.err.popupBlocked", "O navegador bloqueou o pop-up. Libere pop-ups e tente novamente.");
  if (code === "auth/unauthorized-domain") return tt("auth.err.unauthorizedDomain", "Domínio não autorizado no Firebase Auth (Authorized domains).");
  if (code === "auth/operation-not-allowed") return tt("auth.err.operationNotAllowed", "Método de login não habilitado no Firebase Auth.");

  // Telefone
  if (code === "auth/invalid-phone-number") return tt("auth.err.invalidPhone", "Número inválido. Use DDI, ex: +81...");
  if (code === "auth/missing-phone-number") return tt("auth.err.missingPhone", "Informe o telefone.");
  if (code === "auth/captcha-check-failed") return tt("auth.err.captchaFailed", "Falha no reCAPTCHA. Recarregue a página e tente novamente.");
  if (code === "auth/code-expired") return tt("auth.err.codeExpired", "Código expirado. Peça um novo.");
  if (code === "auth/invalid-verification-code") return tt("auth.err.invalidSmsCode", "Código inválido.");

  return tt("auth.err.generic", "Não foi possível entrar. Tente novamente.");
}

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useI18n();

  // helper para evitar quebrar caso uma key não exista no dicionário
  const tt = useCallback(
    (key: string, fallback: string) => {
      try {
        const v = t(key);
        return v === key ? fallback : v;
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const portalCopy =
    lang === "ja"
      ? {
          title: "Yamadaログイン",
          subtitle: "アカウントを確認し、お客様・販売者・管理者の正しい画面へ自動的に移動します。",
          customer: "お客様としてログイン・登録",
          sellerHint: "新しい販売者アカウントを作成する場合は、下の「新規登録」を選択してください。",
          unknown: "このアカウントの種類を確認できませんでした。お客様用または販売者用の登録画面を選択してください。",
        }
      : lang === "en"
        ? {
            title: "Yamada sign in",
            subtitle: "We identify the account and send customers, sellers and admins to the correct area automatically.",
            customer: "Customer sign in or registration",
            sellerHint: "To create a new seller account, choose Create account below.",
            unknown: "We could not identify this account type. Choose the customer or seller registration flow.",
          }
        : {
            title: "Acesso Yamada",
            subtitle: "Identificamos a conta e direcionamos cliente, seller ou admin automaticamente para a área correta.",
            customer: "Entrar ou cadastrar como cliente",
            sellerHint: "Para criar uma nova conta de seller, selecione Criar conta abaixo.",
            unknown: "Não foi possível identificar o tipo desta conta. Escolha o cadastro de cliente ou seller.",
          };

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<AuthMode>("email");
  const [isRegister, setIsRegister] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const [recaptchaReady, setRecaptchaReady] = useState(false);

  const [busy, setBusy] = useState<Busy>(null);
  const didRedirectRef = useRef(false);

  const canUsePhone = useMemo(() => {
    if (typeof window === "undefined") return false;
    return true;
  }, []);

  const resolveAfterLogin = useCallback(
    async (
      result: EnsureResult,
    ) => {
      const userData = result.userDoc;
      const sellerData = result.sellerDoc;

      const role: Role =
        userData.role === "admin"
          ? "admin"
          : "seller";

      if (role === "admin") {
        router.replace("/admin");
        return;
      }

      if (
        !hasCompleteSellerOnboarding(
          sellerData,
        )
      ) {
        router.replace(
          "/seller/onboarding",
        );
        return;
      }

      router.replace(
        accessIsActive(
          sellerData,
          userData,
        )
          ? "/seller"
          : "/seller/rent",
      );
    },
    [router],
  );

  const goAfterLogin = useCallback(
    async (user: User, createSellerIfUnknown = false) => {
      if (didRedirectRef.current) return;
      didRedirectRef.current = true;

      try {
        const resolved = await resolveAuthenticatedAccount(user);

        if (resolved.role !== "unknown") {
          router.replace(resolved.destination || "/");
          return;
        }

        if (!createSellerIfUnknown) {
          didRedirectRef.current = false;
          setCheckingAuth(false);
          setError(portalCopy.unknown);
          return;
        }

        const result = await ensureUserProfile(user, lang);
        await resolveAfterLogin(result);
      } catch (e: any) {
        didRedirectRef.current = false;
        setCheckingAuth(false);
        setError(
          e?.message ||
            tt(
              "auth.err.validateProfile",
              "Falha ao validar o tipo de conta no Firestore.",
            ),
        );
      }
    },
    [lang, portalCopy.unknown, resolveAfterLogin, router, tt],
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await goAfterLogin(user);
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsub();
  }, [goAfterLogin]);

  useEffect(() => {
    if (mode !== "phone") return;
    if (!canUsePhone) return;
    if (typeof window === "undefined") return;

    if (recaptchaVerifierRef.current) {
      setRecaptchaReady(true);
      return;
    }

    try {
      const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
      recaptchaVerifierRef.current = verifier;
      setRecaptchaReady(true);
    } catch (e) {
      console.error("Recaptcha init error:", e);
      setRecaptchaReady(false);
    }

    return () => {
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {}
      recaptchaVerifierRef.current = null;
      setRecaptchaReady(false);
    };
  }, [mode, canUsePhone]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setBusy("email");

    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      await goAfterLogin(cred.user, true);
    } catch (err: any) {
      console.error(err);
      setError(friendlyAuthError(err, tt));
      didRedirectRef.current = false;
    } finally {
      setBusy(null);
    }
  };

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError(null);

    const nm = name.trim();
    const em = email.trim();

    if (!nm) {
      setError(tt("login.err.missingName", "Informe seu nome."));
      return;
    }
    if (!em) {
      setError(tt("login.err.missingEmail", "Informe um e-mail."));
      return;
    }
    if (password.length < 6) {
      setError(tt("login.err.weakPassword", "Senha fraca. Use pelo menos 6 caracteres."));
      return;
    }
    if (password !== confirmPassword) {
      setError(tt("login.err.passwordMismatch", "As senhas não conferem."));
      return;
    }

    setBusy("register");

    try {
      const cred = await createUserWithEmailAndPassword(auth, em, password);
      try {
        await updateProfile(cred.user, { displayName: nm });
      } catch {
        // se falhar, não bloqueia o cadastro
      }
      await goAfterLogin(cred.user, true);
    } catch (err: any) {
      console.error(err);
      setError(friendlyAuthError(err, tt));
      didRedirectRef.current = false;
    } finally {
      setBusy(null);
    }
  };

  const handleGoogleLogin = async () => {
    if (busy) return;

    setError(null);
    setBusy("google");

    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      await goAfterLogin(cred.user, true);
    } catch (err: any) {
      console.error(err);
      setError(friendlyAuthError(err, tt));
      didRedirectRef.current = false;
    } finally {
      setBusy(null);
    }
  };

  const handleSendCode = async () => {
    if (busy) return;

    setError(null);

    if (!phone.trim()) {
      setError(tt("login.err.missingPhone", "Informe um telefone com DDI, ex: +81..."));
      return;
    }

    if (!recaptchaVerifierRef.current || !recaptchaReady) {
      setError(tt("login.err.recaptchaNotReady", "reCAPTCHA ainda não carregou. Aguarde um instante e tente novamente."));
      return;
    }

    setBusy("sendCode");

    try {
      const result = await signInWithPhoneNumber(auth, phone.trim(), recaptchaVerifierRef.current);
      confirmationResultRef.current = result;
      alert(tt("login.sms.sentAlert", "Código SMS enviado. Digite o código para finalizar o login."));
    } catch (err: any) {
      console.error(err);
      setError(friendlyAuthError(err, tt));
      try {
        recaptchaVerifierRef.current?.clear();
      } catch {}
      recaptchaVerifierRef.current = null;
      setRecaptchaReady(false);
    } finally {
      setBusy(null);
    }
  };

  const handleVerifyCode = async () => {
    if (busy) return;

    setError(null);

    if (!smsCode.trim()) {
      setError(tt("login.err.missingSmsCode", "Digite o código SMS recebido."));
      return;
    }

    if (!confirmationResultRef.current) {
      setError(tt("login.err.sendCodeFirst", "Envie o código SMS primeiro."));
      return;
    }

    setBusy("verifyCode");

    try {
      const cred = await confirmationResultRef.current.confirm(smsCode.trim());
      await goAfterLogin(cred.user, true);
    } catch (err: any) {
      console.error(err);
      setError(friendlyAuthError(err, tt));
      didRedirectRef.current = false;
    } finally {
      setBusy(null);
    }
  };

  // quando trocar o modo, limpa erros e estados de cadastro
  useEffect(() => {
    setError(null);
    setBusy(null);
    confirmationResultRef.current = null;
    setSmsCode("");
    if (mode !== "email") setIsRegister(false);
    // não zera email/senha pra facilitar o usuário
  }, [mode]);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-white">
        <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300">{t("common.loading")}</p>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white">
      <div className="absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
        <AppearanceButtons />
      </div>
      <div className="w-full max-w-sm space-y-6 rounded-3xl border border-neutral-200 bg-white px-6 py-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:px-8">

        <div className="flex flex-col items-center gap-2">
          <div className="h-20 w-20 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-yamada.png" alt="Logo Yamada" className="h-full w-full object-cover" />
          </div>

          <h1 className="text-xl font-black text-neutral-950 dark:text-white">
            {mode === "email" && isRegister
              ? tt("login.register.title", "Criar conta de seller")
              : portalCopy.title}
          </h1>

          <p className="text-center text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {mode === "email" && isRegister
              ? tt("login.register.subtitle", "Crie sua conta para acessar o painel de vendas.")
              : portalCopy.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={`rounded-full px-3 py-2 text-xs font-semibold border transition ${
              mode === "email"
                ? "bg-black text-white border-black"
                : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {t("login.mode.email")}
          </button>

          <button
            type="button"
            onClick={() => setMode("google")}
            className={`rounded-full px-3 py-2 text-xs font-semibold border transition ${
              mode === "google"
                ? "bg-black text-white border-black"
                : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {t("login.mode.google")}
          </button>

          <button
            type="button"
            onClick={() => setMode("phone")}
            className={`rounded-full px-3 py-2 text-xs font-semibold border transition ${
              mode === "phone"
                ? "bg-black text-white border-black"
                : "bg-white text-neutral-800 border-neutral-300 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-200 dark:border-neutral-700 dark:hover:bg-neutral-800"
            }`}
          >
            {t("login.mode.sms")}
          </button>
        </div>

        {/* EMAIL: LOGIN / REGISTER */}
        {mode === "email" && (
          <div className="space-y-4">
            {!isRegister ? (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{t("login.email")}</label>
                  <input
                    type="email"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tt("login.email.placeholder", "vendedor@exemplo.com")}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{t("login.password")}</label>
                  <input
                    type="password"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tt("login.password.placeholder", "••••••••")}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy === "email"}
                  className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {busy === "email" ? t("login.entering") : t("login.enter")}
                </button>
              </form>
            ) : (
              <form onSubmit={handleEmailRegister} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                    {tt("login.register.name", "Nome")}
                  </label>
                  <input
                    type="text"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tt("login.register.name.placeholder", "Seu nome")}
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{t("login.email")}</label>
                  <input
                    type="email"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={tt("login.email.placeholder", "vendedor@exemplo.com")}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                    {tt("login.register.password", "Senha")}
                  </label>
                  <input
                    type="password"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tt("login.register.password.placeholder", "mínimo 6 caracteres")}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                    {tt("login.register.confirmPassword", "Confirmar senha")}
                  </label>
                  <input
                    type="password"
                    className="w-full border border-neutral-300 rounded-xl px-3 py-3 text-sm text-neutral-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={tt("login.register.confirmPassword.placeholder", "repita a senha")}
                    autoComplete="new-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy === "register"}
                  className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {busy === "register"
                    ? tt("login.register.creating", "Criando...")
                    : tt("login.register.createBtn", "Criar conta")}
                </button>

                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 text-center"></p>
              </form>
            )}

            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setIsRegister((v) => !v);
                }}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
              >
                {!isRegister
                  ? tt("login.register.toggleToRegister", "Não tem conta? Criar agora")
                  : tt("login.register.toggleToLogin", "Já tem conta? Entrar")}
              </button>
            </div>

            <div className="flex items-center justify-center pt-1">
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {tt("login.sessionHint", "Sua sessão será mantida neste dispositivo.")}
              </span>
            </div>
          </div>
        )}

        {/* GOOGLE */}
        {mode === "google" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={busy === "google"}
              className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {busy === "google" ? t("login.entering") : t("login.googleBtn")}
            </button>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {tt(
                "login.google.domainHint",
                "Se aparecer “domínio não autorizado”, adicione seu domínio em Firebase Auth → Authorized domains."
              )}
            </p>

            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {tt(
                "login.google.firstAccessHint",
                "Se for seu primeiro acesso com Google, a conta será criada automaticamente."
              )}
            </p>
          </div>
        )}

        {/* PHONE */}
        {mode === "phone" && (
          <div className="space-y-3">
            {!canUsePhone ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                {t("login.phone.unsupported")}
              </div>
            ) : (
              <div className="space-y-2 rounded-xl border border-neutral-200 p-3 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-950">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{t("login.phone.label")}</label>
                  <input
                    type="tel"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-xs text-neutral-950 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("login.phone.placeholder")}
                    autoComplete="tel"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={busy === "sendCode" || !phone.trim()}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-neutral-300 px-3 py-2 text-[11px] font-black text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  {busy === "sendCode" ? t("login.sms.sending") : t("login.sms.send")}
                </button>

                <div className="space-y-1 pt-1">
                  <label className="text-[11px] font-medium text-neutral-700 dark:text-neutral-200">{t("login.sms.code")}</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-3 text-xs text-neutral-950 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/70 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value)}
                    placeholder={tt("login.sms.code.placeholder", "123456")}
                    inputMode="numeric"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={busy === "verifyCode" || !smsCode.trim()}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-green-600 px-3 py-2 text-[11px] font-black text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy === "verifyCode" ? t("login.sms.verifying") : t("login.sms.confirm")}
                </button>

                <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {tt(
                    "login.phone.firstAccessHint",
                    "Se for seu primeiro acesso por telefone, a conta será criada automaticamente."
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-700 dark:bg-neutral-950/70">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300">{portalCopy.sellerHint}</p>
          <Link
            href="/customer/login?next=/customer/orders"
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-neutral-300 bg-white px-4 py-2 text-xs font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            {portalCopy.customer}
          </Link>
        </div>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        )}

        <div id="recaptcha-container" />
      </div>
    </main>
  );
}
