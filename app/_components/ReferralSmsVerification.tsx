"use client";

import { linkWithPhoneNumber, RecaptchaVerifier, type ConfirmationResult } from "firebase/auth";
import { useEffect, useId, useRef, useState } from "react";
import { auth } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Ou confirme seu celular por SMS", number: "Celular com código do país (ex.: +819012345678)",
    send: "Enviar código SMS", code: "Código recebido", confirm: "Confirmar código", success: "Celular confirmado! Agora você pode participar.",
    format: "Informe o número completo, começando com + e o código do país.",
    secure: "A validação por SMS exige o site publicado em HTTPS. Abra a loja online para confirmar.",
    generic: "Não foi possível verificar o celular. Confira o número, o código ou tente novamente.",
    used: "Esse número já está associado a outra conta.",
    note: "O SMS pode ter custo e limite de envios. Seu número será vinculado a esta mesma conta, sem criar outra.",
  },
  en: {
    title: "Or verify your mobile by SMS", number: "Phone number with country code (e.g. +819012345678)",
    send: "Text me a code", code: "SMS code", confirm: "Verify code", success: "Phone verified. You can now participate.",
    format: "Enter the full number starting with + and the country code.",
    secure: "SMS verification requires the published HTTPS website. Open the online store to verify.",
    generic: "Could not verify your phone. Check the number and code, then retry.",
    used: "This phone number is linked to a different account.",
    note: "SMS charges and quotas may apply. The number will be linked to this account; no new account is created.",
  },
  ja: {
    title: "またはSMSで電話番号を認証", number: "国番号を含む電話番号（例：+819012345678）",
    send: "SMSを送信", code: "SMS認証コード", confirm: "コードを確認", success: "認証しました。紹介に参加できます。",
    format: "+と国番号から入力してください。", secure: "SMS認証にはHTTPSの公開サイトが必要です。",
    generic: "認証できませんでした。番号とコードを確認して再試行してください。",
    used: "この電話番号は別のアカウントに登録されています。",
    note: "SMSの料金・送信制限が適用される場合があります。既存のアカウントに電話番号を登録します。",
  },
};

export default function ReferralSmsVerification({ onVerified }: { onVerified: () => Promise<void> | void }) {
  const { lang } = useI18n();
  const copy = COPY[lang === "ja" || lang === "en" ? lang : "pt"];
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const verifier = useRef<RecaptchaVerifier | null>(null);
  const confirmation = useRef<ConfirmationResult | null>(null);
  const issuedForUid = useRef("");
  const insecurePreview = typeof window !== "undefined" &&
    (!window.isSecureContext || window.location.protocol !== "https:");

  useEffect(() => () => {
    // The widget belongs to this component only.
    try { verifier.current?.clear(); } catch { /* recaptcha may already be removed */ }
    verifier.current = null;
  }, []);

  async function send() {
    if (busy) return;
    setMessage("");
    if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) { setMessage(copy.format); return; }
    if (typeof window === "undefined" || !window.isSecureContext || !location.protocol.startsWith("https")) {
      setMessage(copy.secure); return;
    }
    const user = auth.currentUser;
    if (!user) { setMessage(copy.generic); return; }
    setBusy(true);
    try {
      if (!verifier.current) {
        verifier.current = new RecaptchaVerifier(auth, `referral-recaptcha-${id}`, { size: "normal" });
        await verifier.current.render();
      }
      confirmation.current = await linkWithPhoneNumber(user, phone.trim(), verifier.current);
      issuedForUid.current = user.uid;
      setSent(true);
    } catch (error) {
      const e = error as { code?: string };
      setMessage(e?.code === "auth/credential-already-in-use" ? copy.used : copy.generic);
      try { verifier.current?.clear(); } catch { /* noop */ }
      verifier.current = null;
    } finally { setBusy(false); }
  }

  async function verify() {
    if (busy || !confirmation.current || !/^\d{4,8}$/.test(code.trim()) ||
        !auth.currentUser || auth.currentUser.uid !== issuedForUid.current) {
      setMessage(copy.generic); return;
    }
    setBusy(true); setMessage("");
    try {
      await confirmation.current.confirm(code.trim());
      await auth.currentUser?.reload();
      setMessage(copy.success);
      await onVerified();
    } catch { setMessage(copy.generic); }
    finally { setBusy(false); }
  }

  return <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-700">
    <p className="text-sm font-bold">{copy.title}</p>
    {insecurePreview && <p role="note" className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{copy.secure}</p>}
    <label className="block space-y-1 text-xs font-semibold">{copy.number}
      <input type="tel" inputMode="tel" autoComplete="tel" value={phone} disabled={busy || sent} onChange={(e) => setPhone(e.target.value)} placeholder="+819012345678" className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-600" />
    </label>
    <div id={`referral-recaptcha-${id}`} className={sent ? "hidden" : "max-w-full overflow-hidden"} />
    {!sent && <><button type="button" disabled={busy} onClick={() => void send()} className="min-h-11 w-full rounded-xl border border-violet-500 px-3 font-bold disabled:opacity-50">{busy ? "…" : copy.send}</button></>}
    {sent && <><label className="block space-y-1 text-xs font-semibold">{copy.code}
      <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} className="block min-h-11 w-full rounded-lg border border-neutral-300 bg-transparent px-3 text-base dark:border-neutral-600" />
    </label><button type="button" disabled={busy} onClick={() => void verify()} className="min-h-11 w-full rounded-xl bg-violet-700 px-3 font-bold text-white disabled:opacity-50">{busy ? "…" : copy.confirm}</button></>}
    <p className="text-xs text-neutral-500 dark:text-neutral-400">{copy.note}</p>
    {message && <p role="status" className="text-xs font-semibold text-amber-700 dark:text-amber-300">{message}</p>}
  </div>;
}
