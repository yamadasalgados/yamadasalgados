"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();

  // estados globais
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // email/senha
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittingEmail, setSubmittingEmail] = useState(false);

  // google
  const [submittingGoogle, setSubmittingGoogle] = useState(false);

  // telefone
  const [showPhone, setShowPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // 🔁 manter sessão e pular login se já estiver logado
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmittingEmail(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/dashboard");
    } catch (err: any) {
      console.error(err);
      let msg = "Não foi possível entrar. Verifique os dados.";
      if (err.code === "auth/invalid-credential") msg = "E-mail ou senha inválidos.";
      if (err.code === "auth/user-not-found") msg = "Usuário não encontrado.";
      setError(msg);
    } finally {
      setSubmittingEmail(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setSubmittingGoogle(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Não foi possível entrar com o Google.");
    } finally {
      setSubmittingGoogle(false);
    }
  };

  const ensureRecaptcha = () => {
    if (recaptchaVerifierRef.current) return recaptchaVerifierRef.current;
    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const handleSendCode = async () => {
    setError(null);
    if (!phone.trim()) {
      setError("Informe um telefone com DDI, ex: +81...");
      return;
    }
    try {
      setSendingCode(true);
      const appVerifier = ensureRecaptcha();
      const result = await signInWithPhoneNumber(auth, phone.trim(), appVerifier);
      confirmationResultRef.current = result;
      alert("Código SMS enviado. Digite o código para finalizar o login.");
    } catch (err) {
      console.error(err);
      setError("Não foi possível enviar o código SMS.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    setError(null);
    if (!smsCode.trim()) {
      setError("Digite o código SMS recebido.");
      return;
    }
    if (!confirmationResultRef.current) {
      setError("Envie o código SMS primeiro.");
      return;
    }
    try {
      setVerifyingCode(true);
      await confirmationResultRef.current.confirm(smsCode.trim());
      router.replace("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Código inválido. Tente novamente.");
    } finally {
      setVerifyingCode(false);
    }
  };

  if (checkingAuth) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <p className="text-sm text-neutral-600">Verificando sessão...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md border border-neutral-200 px-6 py-8 space-y-6">
        {/* logo + título */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-20 w-20 rounded-full overflow-hidden bg-neutral-100 flex items-center justify-center">
            <img
              src="/logo-yamada.png"
              alt="Logo Yamada Salgados"
              className="h-full w-full object-cover"
            />
          </div>
          <h1 className="text-lg font-semibold">Login do vendedor</h1>
          <p className="text-xs text-neutral-600 text-center">
            Entre para acessar seu painel de eventos e links de venda.
          </p>
        </div>

        {/* EMAIL / SENHA (principal) */}
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">E-mail</label>
            <input
              type="email"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendedor@exemplo.com"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-neutral-700">Senha</label>
            <input
              type="password"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={submittingEmail}
            className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {submittingEmail ? "Entrando..." : "Entrar"}
          </button>
        </form>

        {/* OPÇÕES SECUNDÁRIAS, MAIS ENXUTAS */}
        <div className="space-y-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={submittingGoogle}
            className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {submittingGoogle ? "Entrando com Google..." : "Entrar com Google"}
          </button>

          <button
            type="button"
            onClick={() => setShowPhone((prev) => !prev)}
            className="w-full inline-flex justify-center items-center px-4 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {showPhone ? "Esconder login por telefone" : "Entrar com telefone (SMS)"}
          </button>

          {showPhone && (
            <div className="mt-2 space-y-2 border rounded-md p-3 bg-neutral-50">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-700">
                  Telefone (com DDI)
                </label>
                <input
                  type="tel"
                  className="w-full border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+81 90 1234 5678"
                />
              </div>

              <button
                type="button"
                onClick={handleSendCode}
                disabled={sendingCode || !phone.trim()}
                className="w-full inline-flex justify-center items-center px-3 py-1.5 rounded-full border border-neutral-300 text-[11px] font-medium hover:bg-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {sendingCode ? "Enviando código..." : "Enviar código SMS"}
              </button>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-700">
                  Código SMS
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/70 focus:border-orange-500"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value)}
                  placeholder="Código recebido"
                />
              </div>

              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={verifyingCode || !smsCode.trim()}
                className="w-full inline-flex justify-center items-center px-3 py-1.5 rounded-full bg-green-600 text-white text-[11px] font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {verifyingCode ? "Verificando..." : "Confirmar e entrar"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        {/* reCAPTCHA invisível */}
        <div id="recaptcha-container" />

        <p className="text-[10px] text-neutral-500 text-center">
          Sua sessão permanece ativa neste dispositivo. Use e-mail, Google ou
          telefone, conforme for melhor para você.
        </p>
      </div>
    </main>
  );
}
