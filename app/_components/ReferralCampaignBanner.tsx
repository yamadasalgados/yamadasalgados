"use client";

import { Gift, Loader2, Share2, X } from "lucide-react";
import { copyTextWithFallback, localPreviewUrl, publicStoreOrigin } from "@/app/lib/share-link-client";
import ReferralSmsVerification from "@/app/_components/ReferralSmsVerification";
import Link from "next/link";
import { reload, sendEmailVerification } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth } from "@/app/lib/firebase";
import { REFERRAL_CAMPAIGN, referralCampaignActive, validReferralCode } from "@/app/lib/referral-campaign";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Indique um amigo. Ganhem 100 pontos cada!",
    sub: "Seu amigo cria uma conta nova e faz a primeira compra paga nesta loja. Os 100 pontos para cada um são liberados quando o pedido for entregue.",
    period: "Até 31/12/2026 — pode terminar antes para novos convites",
    verified: "Confirme seu e-mail OU celular por SMS. Bônus somente para conta nova e primeira compra paga e entregue.",
    invited: "Você recebeu um convite!",
    invitedSub: "Cadastre-se, confirme seu e-mail e faça a primeira compra para ganhar 100 pontos. Quem te indicou também ganha 100.",
    invite: "Criar minha conta e participar",
    join: "Aceitar convite",
    joined: "Convite registrado! Após sua primeira compra paga e entregue, os dois recebem os pontos.",
    account: "Entrar para indicar amigos",
    generate: "Criar meu link de indicação",
    share: "Compartilhar com um amigo",
    copy: "Copiar link",
    copied: "Link copiado!",
    manual: "Não foi possível copiar automaticamente. Toque no endereço acima, selecione tudo e copie.",
    preview: "Este endereço é do Mac na rede local e não funcionará para amigos fora do Wi-Fi. Configure NEXT_PUBLIC_SITE_URL com a URL HTTPS publicada.",
    verify: "Confirme o e-mail ou valide o celular por SMS para participar.",
    sendVerify: "Reenviar e-mail de confirmação",
    reload: "Já confirmei — verificar novamente",
    sent: "Enviamos a mensagem. Confira sua caixa de entrada e spam.",
    again: "Ver indicações",
    close: "Fechar",
    never: "Não exibir novamente nesta loja",
    error: "Não foi possível completar esta ação. Tente novamente.",
    useLink: "Os pontos viram desconto nas próximas compras nesta loja. Válido só para primeira compra paga e entregue; limite por indicador. A campanha pode encerrar convites antecipadamente.",
    verifyHelp: "Como confirmar: toque em Enviar e-mail, abra sua caixa de entrada (ou spam), toque no link e volte aqui para verificar.",
    businessHelp: "Indicações com pontos são exclusivas de contas de clientes. Para divulgar a loja como vendedor, use Compartilhar loja no painel. O vendedor não recebe bônus na própria loja.",
  },
  en: {
    title: "Invite a friend. Get 100 points each!",
    sub: "Your friend creates a new account and places their first paid order here. Both receive 100 points when the order is delivered.",
    period: "Through Dec 31, 2026 — new invites may close early",
    verified: "Verify your email OR phone by SMS. New accounts and first paid, delivered orders only.",
    invited: "You have been invited!",
    invitedSub: "Sign up, verify your email and make your first purchase to earn 100 points. Your friend earns 100 too.",
    invite: "Create my account",
    join: "Accept invitation",
    joined: "Invitation recorded! Both will earn points after your first paid order is delivered.",
    account: "Sign in to invite friends",
    generate: "Generate my referral link",
    share: "Share with a friend",
    copy: "Copy link",
    copied: "Link copied!",
    manual: "Automatic copy failed. Tap the URL above, select all and copy it.",
    preview: "This is a local Mac preview link. Configure NEXT_PUBLIC_SITE_URL with the published HTTPS website before sharing with friends.",
    verify: "Verify your email or mobile phone by SMS to participate.",
    sendVerify: "Resend verification email",
    reload: "I've verified — check again",
    sent: "Email sent. Please check your inbox and spam folder.",
    again: "View invitations",
    close: "Close",
    never: "Don't show again for this store",
    error: "Could not complete the request. Please retry.",
    useLink: "Points are store-specific discounts. First paid, delivered purchase only; per-referrer limit. New invitations may close early.",
    verifyHelp: "How to verify: send the email, open your inbox (or spam), tap the verification link and return to check again.",
    businessHelp: "Referral points are for customer accounts. Sellers can share their storefront from the dashboard but do not earn points from their own store.",
  },
  ja: {
    title: "友達紹介でお互い100ポイント！",
    sub: "友達が新規登録し、初回の有料注文を完了・受取すると、お二人に100ポイントずつ付与されます。",
    period: "2026年12月31日まで（新規紹介は早期終了する場合があります）",
    verified: "メール認証またはSMSによる電話番号認証が必要です。新規登録・初回注文が対象です。",
    invited: "紹介を受け取りました！",
    invitedSub: "新規登録してメール認証を完了し、初回注文を受け取ると100ポイント。紹介者にも100ポイント。",
    invite: "新規登録して参加",
    join: "紹介を登録",
    joined: "紹介を登録しました！初回の有料注文を受け取ると双方に付与されます。",
    account: "ログインして友達を紹介",
    generate: "紹介リンクを作成",
    share: "友達に共有",
    copy: "リンクをコピー",
    copied: "コピーしました！",
    manual: "自動コピーできませんでした。上のURLを長押ししてコピーしてください。",
    preview: "これはローカルの開発用URLです。共有前に NEXT_PUBLIC_SITE_URL に公開HTTPSサイトを設定してください。",
    verify: "メールまたはSMSで電話番号を認証してください。",
    sendVerify: "確認メールを再送信",
    reload: "認証済み — 再確認",
    sent: "送信しました。迷惑メールフォルダーも確認してください。",
    again: "紹介を確認",
    close: "閉じる",
    never: "この店舗では再表示しない",
    error: "処理できませんでした。再度お試しください。",
    useLink: "ポイントは当店のお買い物の割引に使えます。新規登録・初回有料注文・受取が必要です。人数制限と早期終了があります。",
    verifyHelp: "認証メールを送信し、受信箱（迷惑メールも確認）のリンクを開いてから、この画面で再確認してください。",
    businessHelp: "ポイント紹介はお客様アカウント専用です。販売者は管理画面からショップを共有できますが、自店の紹介ポイントは付与されません。",
  },
};

type Props = { sellerId: string; embedded?: boolean };

export default function ReferralCampaignBanner({ sellerId, embedded = false }: Props) {
  const { lang } = useI18n();
  const text = COPY[lang === "en" || lang === "ja" ? lang : "pt"];
  const session = useCustomerSession();
  const [ready, setReady] = useState(false);
  const [campaignEnabled, setCampaignEnabled] = useState(false);
  const [maxFriends, setMaxFriends] = useState(10);
  const [registrationEndsAtMs, setRegistrationEndsAtMs] = useState(REFERRAL_CAMPAIGN.endsAtMs);
  const [open, setOpen] = useState(embedded);
  const [optOut, setOptOut] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [ownCode, setOwnCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState(false);
  const key = useMemo(() => `referral:${REFERRAL_CAMPAIGN.id}:${sellerId}`, [sellerId]);
  const live = campaignEnabled && referralCampaignActive(Date.now());
  const businessAccount = session.accountRole === "seller" || session.accountRole === "admin";

  useEffect(() => {
    setVerified(Boolean(session.user?.emailVerified || session.user?.phoneNumber));
  }, [session.user]);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/referral-campaign?sellerId=${encodeURIComponent(sellerId)}`, { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { enabled: false })
      .then((result) => {
        if (!mounted) return;
        setCampaignEnabled(result.enabled === true);
        if (typeof result.maxRewardsPerInviter === "number") setMaxFriends(result.maxRewardsPerInviter);
        if (typeof result.registrationEndsAtMs === "number") setRegistrationEndsAtMs(result.registrationEndsAtMs);
      })
      .catch(() => { if (mounted) setCampaignEnabled(false); });
    return () => { mounted = false; };
  }, [sellerId]);

  useEffect(() => {
    if (!live) return;
    const params = new URLSearchParams(window.location.search);
    const ref = validReferralCode(params.get("ref"));
    if (ref) {
      setInviteCode(ref);
      try { sessionStorage.setItem(`${key}:invite`, ref); } catch { /* disabled storage */ }
    } else {
      try { setInviteCode(validReferralCode(sessionStorage.getItem(`${key}:invite`))); } catch { /* disabled storage */ }
    }
    let suppressed = false;
    let shown = false;
    try {
      suppressed = localStorage.getItem(`${key}:hide`) === "1";
      shown = sessionStorage.getItem(`${key}:shown`) === "1";
      sessionStorage.setItem(`${key}:shown`, "1");
    } catch { /* browser private mode */ }
    if (!embedded && (!suppressed && !shown || Boolean(ref))) setOpen(true);
    setReady(true);
  }, [embedded, key, live]);

  const api = useCallback(async (action: "create" | "join", code = "") => {
    const user = auth.currentUser;
    if (!user) throw new Error(text.account);
    await reload(user);
    setVerified(Boolean(user.emailVerified || user.phoneNumber));
    if (!user.emailVerified && !user.phoneNumber) throw new Error(text.verify);
    const token = await user.getIdToken(true);
    const response = await fetch("/api/customer/referrals", {
      method: "POST", cache: "no-store",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action, sellerId, code }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || text.error);
    return payload as { code?: string; joined?: boolean };
  }, [sellerId, text]);

  const handle = useCallback(async (action: "create" | "join") => {
    setBusy(true); setMessage("");
    try {
      const result = await api(action, inviteCode);
      if (action === "create") setOwnCode(result.code || "");
      else if (result.joined) { setJoined(true); setMessage(text.joined); }
    } catch (error) { setMessage(error instanceof Error ? error.message : text.error); }
    finally { setBusy(false); }
  }, [api, inviteCode, text]);

  useEffect(() => {
    if (!ready || !open || !live || session.loading || businessAccount || !session.registered || !inviteCode || joined || busy) return;
    // One attempt per page open; explicit retry remains available after email verification.
    const id = setTimeout(() => { void handle("join"); }, 200);
    return () => clearTimeout(id);
    // intentionally only on login / link change, not on every request state update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, open, live, session.registered, session.loading, inviteCode]);

  const goToRegister = `/customer/login?mode=register&ref=${encodeURIComponent(inviteCode)}&next=${encodeURIComponent(`/store/${sellerId}?ref=${inviteCode}`)}`;
  const goToLogin = `/customer/login?next=${encodeURIComponent(`/store/${sellerId}`)}`;
  const link = ownCode && typeof window !== "undefined"
    ? `${publicStoreOrigin()}/store/${encodeURIComponent(sellerId)}?ref=${encodeURIComponent(ownCode)}` : "";
  const localLink = Boolean(link) && localPreviewUrl(link);

  const copyLink = async () => {
    if (!link) return;
    const copied = await copyTextWithFallback(link);
    setMessage(copied ? text.copied : text.manual);
  };

  const dismiss = () => {
    if (optOut) try { localStorage.setItem(`${key}:hide`, "1"); } catch { /* nothing */ }
    setOpen(false);
  };

  // Seller/admin accounts can browse the store but never generate customer reward links.
  // Backend applies the same role restriction; no need to bother sellers with a customer popup.
  if (!live || !ready || !open || session.loading || businessAccount) return null;
  const content = (
    <section role="dialog" aria-modal={!embedded} aria-label={text.title} className="relative w-full max-w-lg rounded-3xl border border-violet-200 bg-white p-5 text-neutral-950 shadow-2xl dark:border-violet-800 dark:bg-neutral-900 dark:text-white sm:p-7">
      {!embedded && <button type="button" aria-label={text.close} onClick={dismiss} className="absolute right-4 top-4 rounded-xl p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800"><X size={20} /></button>}
      <div className="flex items-center gap-3"><div className="rounded-2xl bg-violet-100 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300"><Gift size={25}/></div><p className="pr-6 text-[11px] font-black uppercase tracking-wider text-violet-700 dark:text-violet-300">{text.period}</p></div>
      <h2 className="mt-4 text-2xl font-black leading-tight">{inviteCode ? text.invited : text.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">{inviteCode ? text.invitedSub : text.sub}</p>
      <p className="mt-3 rounded-xl bg-violet-50 p-3 text-xs font-semibold text-violet-800 dark:bg-violet-950/50 dark:text-violet-200">{text.verified}</p>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{lang === "ja"
        ? `新規招待の受付は ${new Date(registrationEndsAtMs - 9 * 3600_000).toISOString().slice(0, 10)} まで。紹介者1人につき最大${maxFriends}人。途中終了の場合があります。`
        : lang === "en"
          ? `New invitations until ${new Date(registrationEndsAtMs - 9 * 3600_000).toISOString().slice(0, 10)} (Japan time); up to ${maxFriends} friends per referrer. May end early.`
          : `Novos convites até ${new Date(registrationEndsAtMs - 9 * 3600_000).toLocaleDateString("pt-BR", { timeZone: "UTC" })} (Japão). Até ${maxFriends} amigos por indicador. Pode terminar antes.`}</p>
      <div className="mt-5 space-y-3">
        {inviteCode ? (
          !session.registered ? <Link href={goToRegister} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-center text-sm font-black text-white">{text.invite}</Link>
            : joined ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{text.joined}</p>
              : <button type="button" onClick={() => void handle("join")} disabled={busy} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 p-3 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={18}/> : text.join}</button>
        ) : (
          !session.registered ? <Link href={goToLogin} className="flex min-h-12 w-full items-center justify-center rounded-xl bg-violet-600 p-3 text-sm font-black text-white">{text.account}</Link>
            : <><button type="button" disabled={busy} onClick={() => void handle("create")} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 p-3 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin"/> : <Share2 size={18}/>} {text.generate}</button>
              {link && <>
                {localLink && <p role="note" className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-xs font-bold text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">{text.preview}</p>}
                <button type="button" onClick={() => {
                  // Native sheet requires HTTPS + a direct tap; do not silently fail.
                  if (localLink || !navigator.share) { void copyLink(); return; }
                  void navigator.share({ title: text.title, text: text.sub, url: link })
                    .catch((error: unknown) => { if ((error as { name?: string })?.name !== "AbortError") void copyLink(); });
                }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 font-black text-white"><Share2 size={19}/>{text.share}</button>
                <input aria-label={text.copy} value={link} readOnly onFocus={(e) => e.target.select()} onClick={(e) => e.currentTarget.select()} className="w-full min-w-0 rounded-xl border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white" />
                <button type="button" onClick={() => void copyLink()} className="min-h-11 w-full rounded-xl border border-neutral-300 p-2 text-sm font-bold dark:border-neutral-700">{text.copy}</button>
                <p className="text-xs text-neutral-500">{text.useLink}</p>
              </>}
            </>
        )}
        {!session.loading && session.user && !session.registered && session.error && <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-bold">Não foi possível acessar sua conta de cliente.</p>
          <p className="mt-1 break-words text-xs">{session.error}</p>
          <button type="button" onClick={() => void session.refresh()} className="mt-2 min-h-10 font-black underline">Tentar novamente</button>
        </div>}
        {session.registered && !verified && <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">{text.verify}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300">{text.verifyHelp}</p>
          <button type="button" onClick={async () => { try {
            if (!auth.currentUser?.email) { setMessage(text.verify); return; }
            await sendEmailVerification(auth.currentUser);
            setMessage(text.sent);
          } catch (error) { setMessage(error instanceof Error ? error.message : text.error); } }} className="block min-h-10 text-left text-sm font-bold text-violet-700 underline dark:text-violet-300">{text.sendVerify}</button>
          <button type="button" onClick={async () => { try { if (auth.currentUser) { await reload(auth.currentUser); const confirmed = Boolean(auth.currentUser.emailVerified || auth.currentUser.phoneNumber); setVerified(confirmed); setMessage(confirmed ? "✓" : text.verifyHelp); } } catch { setMessage(text.error); } }} className="block min-h-10 text-left text-sm font-bold text-violet-700 underline dark:text-violet-300">{text.reload}</button>
          <ReferralSmsVerification onVerified={async () => { if (auth.currentUser) { await reload(auth.currentUser); setVerified(Boolean(auth.currentUser.emailVerified || auth.currentUser.phoneNumber)); setMessage(""); } }} />
        </div>}
        {message && <p role="status" className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold dark:bg-neutral-800">{message}</p>}
      </div>
      {!embedded && <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-4 dark:border-neutral-700"><label className="flex items-center gap-2 text-xs font-semibold text-neutral-600 dark:text-neutral-300"><input type="checkbox" checked={optOut} onChange={(e) => setOptOut(e.target.checked)} />{text.never}</label><button type="button" onClick={dismiss} className="rounded-lg px-4 py-2 text-sm font-bold">{text.close}</button></div>}
    </section>
  );
  return embedded ? content : <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/65 p-4" onClick={(event) => { if (event.target === event.currentTarget) dismiss(); }}>{content}</div>;
}
