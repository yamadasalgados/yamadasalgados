"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/app/lib/firebase";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

type PlanId = "starter" | "pro" | "business";

type SubscriptionStatus =
  | "none"
  | "pending"
  | "active"
  | "past_due"
  | "cancelled";

type PlanRequestType = "renew" | "upgrade" | "downgrade";
type PlanRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  suspended?: boolean;

  displayName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
  regionName?: string;

  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  currentPeriodEnd?: Timestamp;
  maxEvents?: number;
  maxProducts?: number;

  requestedPlan?: PlanId;
  planRequestType?: PlanRequestType;
  planRequestStatus?: PlanRequestStatus;
  requestedPlanAt?: Timestamp;

  updatedAt?: Timestamp;
};

type PlanDefinition = {
  id: PlanId;
  name: string;
  price: string;
  maxEvents: number;
  maxProducts: number;
  features: string[];
};

const PLAN_ORDER: Record<PlanId, number> = {
  starter: 1,
  pro: 2,
  business: 3,
};

function isTimestamp(value: unknown): value is Timestamp {
  return (
    !!value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as Timestamp).toDate === "function"
  );
}

function toDate(value?: Timestamp): Date | null {
  if (!value || !isTimestamp(value)) return null;

  try {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getRequestType(
  currentPlan: PlanId,
  requestedPlan: PlanId
): PlanRequestType {
  if (currentPlan === requestedPlan) return "renew";

  return PLAN_ORDER[requestedPlan] > PLAN_ORDER[currentPlan]
    ? "upgrade"
    : "downgrade";
}

export default function SellerSettingsPage() {
  const { t, lang } = useI18n();
  const router = useRouter();

  const fallbackText = useMemo<Record<string, Record<"pt" | "en" | "ja", string>>>(
    () => ({
      "plan.starter.name": {
        pt: "Starter",
        en: "Starter",
        ja: "スターター",
      },
      "plan.starter.price": {
        pt: "¥2.980 / mês",
        en: "¥2,980 / month",
        ja: "月額 ¥2,980",
      },
      "plan.starter.features": {
        pt: "1 evento ativo\nAté 20 produtos\nGestão de pedidos",
        en: "1 active event\nUp to 20 products\nOrder management",
        ja: "有効イベント1件\n商品20件まで\n注文管理",
      },
      "plan.pro.name": {
        pt: "Pro",
        en: "Pro",
        ja: "プロ",
      },
      "plan.pro.price": {
        pt: "¥5.980 / mês",
        en: "¥5,980 / month",
        ja: "月額 ¥5,980",
      },
      "plan.pro.features": {
        pt: "Até 3 eventos ativos\nAté 60 produtos\nRelatórios ampliados",
        en: "Up to 3 active events\nUp to 60 products\nExtended reports",
        ja: "有効イベント3件まで\n商品60件まで\n拡張レポート",
      },
      "plan.business.name": {
        pt: "Business",
        en: "Business",
        ja: "ビジネス",
      },
      "plan.business.price": {
        pt: "¥9.980 / mês",
        en: "¥9,980 / month",
        ja: "月額 ¥9,980",
      },
      "plan.business.features": {
        pt: "Até 10 eventos ativos\nAté 200 produtos\nRecursos completos",
        en: "Up to 10 active events\nUp to 200 products\nFull feature access",
        ja: "有効イベント10件まで\n商品200件まで\n全機能を利用可能",
      },

      "settings.plan.status.expired": {
        pt: "Vencido",
        en: "Expired",
        ja: "期限切れ",
      },
      "settings.plan.status.active": {
        pt: "Ativo",
        en: "Active",
        ja: "有効",
      },
      "settings.plan.status.pending": {
        pt: "Pendente",
        en: "Pending",
        ja: "保留中",
      },
      "settings.plan.status.pastDue": {
        pt: "Pagamento atrasado",
        en: "Payment overdue",
        ja: "支払い遅延",
      },
      "settings.plan.status.cancelled": {
        pt: "Cancelado",
        en: "Cancelled",
        ja: "キャンセル済み",
      },
      "settings.plan.status.none": {
        pt: "Sem assinatura",
        en: "No subscription",
        ja: "未契約",
      },
      "settings.plan.noExpiration": {
        pt: "Data não definida",
        en: "Date not set",
        ja: "日付未設定",
      },

      "settings.err.profileLoad": {
        pt: "Erro ao carregar o perfil.",
        en: "Failed to load the profile.",
        ja: "プロフィールの読み込みに失敗しました。",
      },
      "settings.profileCreated": {
        pt: "Perfil criado com sucesso.",
        en: "Profile created successfully.",
        ja: "プロフィールを作成しました。",
      },
      "settings.err.profileCreate": {
        pt: "Não foi possível criar o perfil.",
        en: "Could not create the profile.",
        ja: "プロフィールを作成できませんでした。",
      },
      "settings.publicLink.copied": {
        pt: "Link copiado.",
        en: "Link copied.",
        ja: "リンクをコピーしました。",
      },
      "settings.err.copy": {
        pt: "Não foi possível copiar o link.",
        en: "Could not copy the link.",
        ja: "リンクをコピーできませんでした。",
      },
      "settings.saved": {
        pt: "Configurações salvas.",
        en: "Settings saved.",
        ja: "設定を保存しました。",
      },
      "settings.err.save": {
        pt: "Não foi possível salvar.",
        en: "Could not save the settings.",
        ja: "設定を保存できませんでした。",
      },

      "settings.plan.request.renew.success": {
        pt: "Solicitação de renovação enviada.",
        en: "Renewal request sent.",
        ja: "更新申請を送信しました。",
      },
      "settings.plan.request.upgrade.success": {
        pt: "Solicitação de upgrade enviada.",
        en: "Upgrade request sent.",
        ja: "アップグレード申請を送信しました。",
      },
      "settings.plan.request.downgrade.success": {
        pt: "Solicitação de downgrade enviada.",
        en: "Downgrade request sent.",
        ja: "ダウングレード申請を送信しました。",
      },
      "settings.plan.request.error": {
        pt: "Não foi possível enviar a solicitação do plano.",
        en: "Could not submit the plan request.",
        ja: "プラン申請を送信できませんでした。",
      },

      "settings.guard.profileMissing.title": {
        pt: "Perfil não encontrado",
        en: "Profile not found",
        ja: "プロフィールが見つかりません",
      },
      "settings.guard.profileMissing.line1": {
        pt: "O documento users/{uid} não foi encontrado.",
        en: "The document users/{uid} was not found.",
        ja: "users/{uid} のドキュメントが見つかりません。",
      },
      "settings.guard.profileMissing.btn.creating": {
        pt: "Criando...",
        en: "Creating...",
        ja: "作成中...",
      },
      "settings.guard.profileMissing.btn.create": {
        pt: "Criar perfil",
        en: "Create profile",
        ja: "プロフィールを作成",
      },
      "settings.err.title": {
        pt: "Erro ao carregar",
        en: "Loading error",
        ja: "読み込みエラー",
      },
      "common.retry": {
        pt: "Tentar novamente",
        en: "Try again",
        ja: "再試行",
      },
      "settings.guard.notAllowed.title": {
        pt: "Acesso não permitido",
        en: "Access not allowed",
        ja: "アクセスできません",
      },
      "settings.guard.notAllowed.inactive": {
        pt: "Esta conta está inativa.",
        en: "This account is inactive.",
        ja: "このアカウントは無効です。",
      },
      "guard.suspended.desc": {
        pt: "Esta conta está suspensa.",
        en: "This account is suspended.",
        ja: "このアカウントは停止されています。",
      },
      "settings.guard.notAllowed.role": {
        pt: "Seu perfil não possui permissão para acessar esta página.",
        en: "Your profile does not have permission to access this page.",
        ja: "このページにアクセスする権限がありません。",
      },
      "common.logout": {
        pt: "Sair",
        en: "Log out",
        ja: "ログアウト",
      },

      "settings.title": {
        pt: "Configurações",
        en: "Settings",
        ja: "設定",
      },
      "settings.subtitle": {
        pt: "Gerencie os dados da loja e sua assinatura.",
        en: "Manage your store details and subscription.",
        ja: "店舗情報と契約プランを管理します。",
      },
      "settings.plan.title": {
        pt: "Assinatura e plano",
        en: "Subscription and plan",
        ja: "契約とプラン",
      },
      "settings.plan.desc": {
        pt: "Solicite renovação, upgrade ou downgrade. O plano atual só será alterado após a aprovação do administrador.",
        en: "Request a renewal, upgrade, or downgrade. Your current plan will only change after administrator approval.",
        ja: "更新、アップグレード、ダウングレードを申請できます。現在のプランは管理者の承認後に変更されます。",
      },
      "settings.plan.current": {
        pt: "Plano atual",
        en: "Current plan",
        ja: "現在のプラン",
      },
      "settings.plan.expires": {
        pt: "Vencimento",
        en: "Expiration",
        ja: "有効期限",
      },
      "settings.plan.events": {
        pt: "Limite de eventos",
        en: "Event limit",
        ja: "イベント上限",
      },
      "settings.plan.products": {
        pt: "Limite de produtos",
        en: "Product limit",
        ja: "商品上限",
      },
      "settings.plan.pending.title": {
        pt: "Solicitação aguardando aprovação",
        en: "Request awaiting approval",
        ja: "承認待ちの申請",
      },
      "settings.plan.pending.body": {
        pt: "Plano solicitado: {plan}.",
        en: "Requested plan: {plan}.",
        ja: "申請中のプラン：{plan}",
      },
      "settings.plan.action.renew": {
        pt: "Solicitar renovação",
        en: "Request renewal",
        ja: "更新を申請",
      },
      "settings.plan.action.upgrade": {
        pt: "Solicitar upgrade",
        en: "Request upgrade",
        ja: "アップグレードを申請",
      },
      "settings.plan.action.downgrade": {
        pt: "Solicitar downgrade",
        en: "Request downgrade",
        ja: "ダウングレードを申請",
      },
      "settings.plan.action.requested": {
        pt: "Solicitado",
        en: "Requested",
        ja: "申請済み",
      },
      "settings.plan.badge.current": {
        pt: "Atual",
        en: "Current",
        ja: "現在",
      },
      "settings.plan.adminNote": {
        pt: "Contas de administrador não precisam solicitar alterações de plano.",
        en: "Administrator accounts do not need to request plan changes.",
        ja: "管理者アカウントはプラン変更申請を行う必要がありません。",
      },

      "rent.dataPolicy.title": {
        pt: "Política de dados e inatividade",
        en: "Data and inactivity policy",
        ja: "データと非アクティブ時のポリシー",
      },
      "rent.dataPolicy.body": {
        pt: "Contas sem assinatura ativa por mais de 30 dias poderão ser excluídas permanentemente, incluindo cadastro, eventos, produtos, pedidos, mensagens e relatórios.",
        en: "Accounts without an active subscription for more than 30 days may be permanently deleted, including profile data, events, products, orders, messages, and reports.",
        ja: "有効な契約が30日以上ないアカウントは、登録情報、イベント、商品、注文、メッセージ、レポートを含めて完全に削除される場合があります。",
      },
      "rent.confirm.warning": {
        pt: "A exclusão é definitiva e os dados não poderão ser recuperados.",
        en: "Deletion is permanent and the data cannot be recovered.",
        ja: "削除は完全に実行され、データを復元することはできません。",
      },

      "settings.publicLink.title": {
        pt: "Link público",
        en: "Public link",
        ja: "公開リンク",
      },
      "settings.publicLink.desc": {
        pt: "Compartilhe este endereço com seus clientes.",
        en: "Share this address with your customers.",
        ja: "このリンクをお客様と共有してください。",
      },
      "settings.publicLink.waiting": {
        pt: "Aguardando configuração...",
        en: "Waiting for configuration...",
        ja: "設定を待っています...",
      },
      "settings.publicLink.copy": {
        pt: "Copiar",
        en: "Copy",
        ja: "コピー",
      },

      "settings.form.title": {
        pt: "Dados da loja",
        en: "Store details",
        ja: "店舗情報",
      },
      "settings.section.identification": {
        pt: "Identificação",
        en: "Identification",
        ja: "基本情報",
      },
      "settings.field.displayName": {
        pt: "Nome da loja",
        en: "Store name",
        ja: "店舗名",
      },
      "settings.ph.displayName": {
        pt: "Nome exibido",
        en: "Displayed name",
        ja: "表示名",
      },
      "settings.field.whatsapp": {
        pt: "WhatsApp",
        en: "WhatsApp",
        ja: "WhatsApp",
      },
      "settings.ph.whatsapp": {
        pt: "Número do WhatsApp",
        en: "WhatsApp number",
        ja: "WhatsApp番号",
      },
      "settings.field.messengerId": {
        pt: "Messenger ID",
        en: "Messenger ID",
        ja: "Messenger ID",
      },
      "settings.ph.messengerId": {
        pt: "ID do Messenger",
        en: "Messenger ID",
        ja: "Messenger ID",
      },
      "settings.field.regionName": {
        pt: "Nome da região",
        en: "Region name",
        ja: "地域名",
      },
      "settings.ph.regionName": {
        pt: "Região atendida",
        en: "Service region",
        ja: "対応地域",
      },
      "settings.section.logistics": {
        pt: "Logística",
        en: "Logistics",
        ja: "受け渡し情報",
      },
      "settings.field.pickupLink": {
        pt: "Link de retirada",
        en: "Pickup link",
        ja: "受け取り場所リンク",
      },
      "settings.ph.pickupLink": {
        pt: "Link do mapa",
        en: "Map link",
        ja: "地図リンク",
      },
      "settings.field.pickupNote": {
        pt: "Instruções de retirada",
        en: "Pickup instructions",
        ja: "受け取り案内",
      },
      "settings.ph.pickupNote": {
        pt: "Orientações para o cliente",
        en: "Instructions for the customer",
        ja: "お客様向けの案内",
      },
      "settings.btn.saving": {
        pt: "Salvando...",
        en: "Saving...",
        ja: "保存中...",
      },
      "settings.btn.save": {
        pt: "Salvar",
        en: "Save",
        ja: "保存",
      },

      "settings.plan.confirm.renew.title": {
        pt: "Confirmar renovação",
        en: "Confirm renewal",
        ja: "更新申請の確認",
      },
      "settings.plan.confirm.upgrade.title": {
        pt: "Confirmar upgrade",
        en: "Confirm upgrade",
        ja: "アップグレード申請の確認",
      },
      "settings.plan.confirm.downgrade.title": {
        pt: "Confirmar downgrade",
        en: "Confirm downgrade",
        ja: "ダウングレード申請の確認",
      },
      "settings.plan.confirm.body": {
        pt: "Sua solicitação será enviada para análise. O plano atual continuará sem alterações até a aprovação.",
        en: "Your request will be submitted for review. Your current plan will remain unchanged until approval.",
        ja: "申請は審査のため送信されます。承認されるまでは現在のプランが維持されます。",
      },
      "settings.plan.confirm.selected": {
        pt: "Plano solicitado",
        en: "Requested plan",
        ja: "申請するプラン",
      },
      "settings.plan.confirm.downgrade.warning": {
        pt: "Após a aprovação, os limites de eventos e produtos serão reduzidos para os limites do novo plano.",
        en: "After approval, your event and product limits will be reduced to the limits of the new plan.",
        ja: "承認後、イベント数と商品数の上限は新しいプランの上限まで引き下げられます。",
      },
      "common.cancel": {
        pt: "Cancelar",
        en: "Cancel",
        ja: "キャンセル",
      },
      "common.saving": {
        pt: "Enviando...",
        en: "Sending...",
        ja: "送信中...",
      },
      "settings.plan.confirm.accept": {
        pt: "Confirmar solicitação",
        en: "Confirm request",
        ja: "申請を確定",
      },
    }),
    []
  );

  const tt = useCallback(
    (key: string, fallback?: string) => {
      const translated = t(key);

      if (translated && translated !== key) {
        return translated;
      }

      const selectedLanguage: "pt" | "en" | "ja" =
        lang === "en" ? "en" : lang === "ja" ? "ja" : "pt";

      return (
        fallbackText[key]?.[selectedLanguage] ??
        fallback ??
        fallbackText[key]?.pt ??
        key
      );
    },
    [fallbackText, lang, t]
  );

  const locale =
    lang === "pt"
      ? "pt-BR"
      : lang === "en"
        ? "en-US"
        : "ja-JP";

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [requestingPlan, setRequestingPlan] = useState(false);
  const [confirmPlanId, setConfirmPlanId] = useState<PlanId | null>(null);

  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [pickupLink, setPickupLink] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [regionName, setRegionName] = useState("");

  const role = profile?.role ?? null;
  const sellerId = profile?.sellerId?.trim() || "";
  const regionId = profile?.regionId?.trim() || "";
  const inactive = profile?.active === false;
  const suspended = profile?.suspended === true;

  const canLoad = useMemo(() => {
    if (!authUser || inactive || suspended) return false;
    return role === "seller" || role === "admin";
  }, [authUser, inactive, suspended, role]);

  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";

  const publicUrl =
    sellerId && regionId && origin
      ? `${origin}/c/${sellerId}/${regionId}`
      : "";

  const plans = useMemo<PlanDefinition[]>(
    () => [
      {
        id: "starter",
        name: tt("plan.starter.name", "Starter"),
        price: tt("plan.starter.price", "¥2.980 / mês"),
        maxEvents: 1,
        maxProducts: 20,
        features: (
          tt(
            "plan.starter.features",
            "1 evento ativo\nAté 20 produtos\nGestão de pedidos"
          ) || ""
        )
          .split("\n")
          .filter(Boolean),
      },
      {
        id: "pro",
        name: tt("plan.pro.name", "Pro"),
        price: tt("plan.pro.price", "¥5.980 / mês"),
        maxEvents: 3,
        maxProducts: 60,
        features: (
          tt(
            "plan.pro.features",
            "Até 3 eventos ativos\nAté 60 produtos\nRelatórios ampliados"
          ) || ""
        )
          .split("\n")
          .filter(Boolean),
      },
      {
        id: "business",
        name: tt("plan.business.name", "Business"),
        price: tt("plan.business.price", "¥9.980 / mês"),
        maxEvents: 10,
        maxProducts: 200,
        features: (
          tt(
            "plan.business.features",
            "Até 10 eventos ativos\nAté 200 produtos\nRecursos completos"
          ) || ""
        )
          .split("\n")
          .filter(Boolean),
      },
    ],
    [tt]
  );

  const currentPlanId: PlanId = profile?.plan ?? "starter";
  const currentPlan =
    plans.find((plan) => plan.id === currentPlanId) ?? plans[0];

  const requestedPlan =
    plans.find((plan) => plan.id === profile?.requestedPlan) ?? null;

  const hasPendingPlanRequest =
    profile?.planRequestStatus === "pending" &&
    !!profile.requestedPlan;

  const currentPeriodEndDate = toDate(profile?.currentPeriodEnd);

  const planExpired =
    !!currentPeriodEndDate &&
    currentPeriodEndDate.getTime() <= Date.now();

  const planStatusLabel = useMemo(() => {
    if (planExpired) {
      return tt("settings.plan.status.expired", "Vencido");
    }

    switch (profile?.subscriptionStatus) {
      case "active":
        return tt("settings.plan.status.active", "Ativo");
      case "pending":
        return tt("settings.plan.status.pending", "Pendente");
      case "past_due":
        return tt("settings.plan.status.pastDue", "Pagamento atrasado");
      case "cancelled":
        return tt("settings.plan.status.cancelled", "Cancelado");
      default:
        return tt("settings.plan.status.none", "Sem assinatura");
    }
  }, [planExpired, profile?.subscriptionStatus, tt]);

  const formattedPeriodEnd = useMemo(() => {
    if (!currentPeriodEndDate) {
      return tt("settings.plan.noExpiration", "Data não definida");
    }

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "2-digit",
    }).format(currentPeriodEndDate);
  }, [currentPeriodEndDate, locale, tt]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setCheckingAuth(false);

      if (!user) {
        setProfile(null);
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadProfile = useCallback(async (user: User) => {
    setErrMsg("");
    setProfileMissing(false);

    const snapshot = await getDoc(doc(db, "users", user.uid));

    if (!snapshot.exists()) {
      setProfileMissing(true);
      setProfile(null);
      return;
    }

    const data = snapshot.data() as UserDoc;
    setProfile(data);

    setDisplayName(data.displayName || "");
    setWhatsapp(data.whatsapp || "");
    setMessengerId(data.messengerId || "");
    setPickupLink(data.pickupLink || "");
    setPickupNote(data.pickupNote || "");
    setRegionName(data.regionName || "");
  }, []);

  useEffect(() => {
    if (!authUser) return;

    loadProfile(authUser).catch((error) => {
      console.error("[SellerSettings] loadProfile:", error);
      setErrMsg(
        tt("settings.err.profileLoad", "Erro ao carregar o perfil.")
      );
    });
  }, [authUser, loadProfile, tt]);

  const handleLogout = useCallback(async () => {
    await signOut(auth);
    router.replace("/login");
  }, [router]);

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;

    setErrMsg("");
    setSuccessMsg("");
    setSaving(true);

    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);

      setSuccessMsg(
        tt("settings.profileCreated", "Perfil criado com sucesso.")
      );
    } catch (error) {
      console.error("[SellerSettings] createProfile:", error);
      setErrMsg(
        tt("settings.err.profileCreate", "Não foi possível criar o perfil.")
      );
    } finally {
      setSaving(false);
    }
  }, [authUser, loadProfile, tt]);

  const handleCopy = useCallback(async () => {
    if (!publicUrl) return;

    setErrMsg("");
    setSuccessMsg("");

    try {
      await navigator.clipboard.writeText(publicUrl);
      setSuccessMsg(
        tt("settings.publicLink.copied", "Link copiado.")
      );
    } catch (error) {
      console.error("[SellerSettings] copy:", error);
      setErrMsg(
        tt("settings.err.copy", "Não foi possível copiar o link.")
      );
    }
  }, [publicUrl, tt]);

  const handleSave = useCallback(async () => {
    if (!authUser) return;

    setSaving(true);
    setErrMsg("");
    setSuccessMsg("");

    try {
      await updateDoc(doc(db, "users", authUser.uid), {
        displayName: displayName.trim(),
        whatsapp: whatsapp.trim(),
        messengerId: messengerId.trim(),
        pickupLink: pickupLink.trim(),
        pickupNote: pickupNote.trim(),
        regionName: regionName.trim(),
        updatedAt: serverTimestamp(),
      });

      setProfile((previous) =>
        previous
          ? {
              ...previous,
              displayName: displayName.trim(),
              whatsapp: whatsapp.trim(),
              messengerId: messengerId.trim(),
              pickupLink: pickupLink.trim(),
              pickupNote: pickupNote.trim(),
              regionName: regionName.trim(),
            }
          : previous
      );

      setSuccessMsg(
        tt("settings.saved", "Configurações salvas.")
      );
    } catch (error) {
      console.error("[SellerSettings] save:", error);
      setErrMsg(
        tt("settings.err.save", "Não foi possível salvar.")
      );
    } finally {
      setSaving(false);
    }
  }, [
    authUser,
    displayName,
    whatsapp,
    messengerId,
    pickupLink,
    pickupNote,
    regionName,
    tt,
  ]);

  const handleRequestPlan = useCallback(
    async (requestedPlanId: PlanId) => {
      if (!authUser || !profile || role !== "seller") return;

      const plan = plans.find((item) => item.id === requestedPlanId);
      if (!plan) return;

      const requestType = getRequestType(currentPlanId, requestedPlanId);

      setRequestingPlan(true);
      setErrMsg("");
      setSuccessMsg("");

      try {
        /*
         * Importante:
         * não alteramos profile.plan, subscriptionStatus, maxEvents ou
         * maxProducts neste momento. O plano atual continua valendo até
         * o administrador aprovar a solicitação.
         */
        await updateDoc(doc(db, "users", authUser.uid), {
          requestedPlan: plan.id,
          planRequestType: requestType,
          planRequestStatus: "pending",
          requestedPlanAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setProfile((previous) =>
          previous
            ? {
                ...previous,
                requestedPlan: plan.id,
                planRequestType: requestType,
                planRequestStatus: "pending",
                requestedPlanAt: Timestamp.now(),
              }
            : previous
        );

        setSuccessMsg(
          tt(`settings.plan.request.${requestType}.success`)
        );
      } catch (error: any) {
        console.error("[SellerSettings] requestPlan:", error);

        setErrMsg(
          error?.message ||
            tt(
              "settings.plan.request.error",
              "Não foi possível enviar a solicitação do plano."
            )
        );
      } finally {
        setRequestingPlan(false);
        setConfirmPlanId(null);
      }
    },
    [
      authUser,
      profile,
      role,
      plans,
      currentPlanId,
      tt,
    ]
  );

  if (checkingAuth || (authUser && !profile && !profileMissing && !errMsg)) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white transition-colors dark:bg-neutral-950">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (!authUser) return null;

  if (profileMissing) {
    return (
      <main className="mx-auto mt-12 max-w-md p-4 text-center animate-fade-in">
        <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
          {tt(
            "settings.guard.profileMissing.title",
            "Perfil não encontrado"
          )}
        </h1>

        <div className="mt-4 space-y-4 rounded-3xl border border-neutral-200 bg-neutral-50 p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-sm font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
            {tt(
              "settings.guard.profileMissing.line1",
              `O documento users/${authUser.uid} não foi encontrado.`
            ).replace("{uid}", authUser.uid)}
          </p>

          <button
            type="button"
            onClick={handleCreateProfileNow}
            disabled={saving}
            className="w-full rounded-2xl bg-black py-4 text-sm font-black text-white shadow-xl transition-all disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {saving
              ? tt(
                  "settings.guard.profileMissing.btn.creating",
                  "Criando..."
                )
              : tt(
                  "settings.guard.profileMissing.btn.create",
                  "Criar perfil"
                )}
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-4 rounded-3xl border border-red-200 bg-red-50 p-8 dark:border-red-900/30 dark:bg-red-950/20">
          <h1 className="text-xl font-black text-red-800 dark:text-red-200">
            {tt("settings.err.title", "Erro ao carregar")}
          </h1>

          <p className="text-sm font-bold text-red-600 dark:text-red-300">
            {errMsg ||
              tt(
                "settings.err.profileLoad",
                "Não foi possível carregar o perfil."
              )}
          </p>

          <button
            type="button"
            onClick={() => void loadProfile(authUser)}
            className="w-full rounded-2xl bg-black py-3.5 text-xs font-black uppercase text-white dark:bg-white dark:text-black"
          >
            {tt("common.retry", "Tentar novamente")}
          </button>
        </div>
      </main>
    );
  }

  if (!canLoad) {
    return (
      <main className="mx-auto mt-16 max-w-md p-4 text-center animate-fade-in">
        <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">
            {tt(
              "settings.guard.notAllowed.title",
              "Acesso não permitido"
            )}
          </h1>

          <p className="rounded-xl border border-red-200/40 bg-red-50/50 p-3 text-xs font-bold text-red-500 dark:bg-red-950/20">
            {inactive
              ? tt(
                  "settings.guard.notAllowed.inactive",
                  "Esta conta está inativa."
                )
              : suspended
                ? tt(
                    "guard.suspended.desc",
                    "Esta conta está suspensa."
                  )
                : tt(
                    "settings.guard.notAllowed.role",
                    "Seu perfil não possui permissão para acessar esta página."
                  )}
          </p>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl bg-black py-3 text-xs font-black uppercase tracking-wider text-white dark:bg-white dark:text-black"
          >
            {tt("common.logout", "Sair")}
          </button>
        </div>
      </main>
    );
  }

  const confirmedPlan =
    plans.find((plan) => plan.id === confirmPlanId) ?? null;

  const confirmedRequestType = confirmedPlan
    ? getRequestType(currentPlanId, confirmedPlan.id)
    : null;

  return (
    <main className="min-h-screen space-y-8 bg-white p-4 transition-colors animate-fade-in dark:bg-neutral-950 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {tt("settings.title", "Configurações")}
          </h1>

          <p className="text-sm font-medium text-neutral-400 dark:text-neutral-500">
            {tt(
              "settings.subtitle",
              "Gerencie os dados da loja e sua assinatura."
            )}
          </p>
        </div>
      </header>

      {(errMsg || successMsg) && (
        <div
          className={`rounded-2xl border px-4 py-3.5 text-xs font-black uppercase tracking-wider ${
            errMsg
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
          }`}
        >
          {errMsg || successMsg}
        </div>
      )}

      {/* ASSINATURA E ALTERAÇÃO DE PLANO */}
      <section className="space-y-6 rounded-[2.5rem] border border-neutral-200 bg-neutral-50/70 p-6 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">
              {tt("settings.plan.title", "Assinatura e plano")}
            </h2>

            <p className="text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
              {tt(
                "settings.plan.desc",
                "Solicite renovação, upgrade ou downgrade. O plano atual só será alterado após a aprovação do administrador."
              )}
            </p>
          </div>

          <div
            className={`inline-flex w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${
              planExpired ||
              profile.subscriptionStatus === "past_due" ||
              profile.subscriptionStatus === "cancelled"
                ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                : profile.subscriptionStatus === "active"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            }`}
          >
            {planStatusLabel}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard
            label={tt("settings.plan.current", "Plano atual")}
            value={currentPlan.name}
          />

          <InfoCard
            label={tt("settings.plan.expires", "Vencimento")}
            value={formattedPeriodEnd}
          />

          <InfoCard
            label={tt("settings.plan.events", "Limite de eventos")}
            value={String(profile.maxEvents ?? currentPlan.maxEvents)}
          />

          <InfoCard
            label={tt("settings.plan.products", "Limite de produtos")}
            value={String(profile.maxProducts ?? currentPlan.maxProducts)}
          />
        </div>

        {hasPendingPlanRequest && requestedPlan && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
            <p className="text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
              {tt(
                "settings.plan.pending.title",
                "Solicitação aguardando aprovação"
              )}
            </p>

            <p className="mt-1 text-xs font-bold text-amber-700 dark:text-amber-400">
              {tt(
                "settings.plan.pending.body",
                "Plano solicitado: {plan}."
              ).replace("{plan}", requestedPlan.name)}
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            const isRequested =
              hasPendingPlanRequest &&
              profile.requestedPlan === plan.id;

            const actionType = getRequestType(currentPlanId, plan.id);

            const buttonLabel =
              actionType === "renew"
                ? tt("settings.plan.action.renew", "Solicitar renovação")
                : actionType === "upgrade"
                  ? tt("settings.plan.action.upgrade", "Solicitar upgrade")
                  : tt(
                      "settings.plan.action.downgrade",
                      "Solicitar downgrade"
                    );

            return (
              <article
                key={plan.id}
                className={`flex flex-col rounded-[2rem] border p-5 ${
                  isCurrent
                    ? "border-black bg-white shadow-lg dark:border-white dark:bg-neutral-900"
                    : "border-neutral-200 bg-white/70 dark:border-neutral-800 dark:bg-neutral-900/50"
                }`}
              >
                <div className="mb-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-neutral-900 dark:text-white">
                        {plan.name}
                      </h3>

                      <p className="mt-1 text-2xl font-black text-neutral-900 dark:text-white">
                        {plan.price}
                      </p>
                    </div>

                    {isCurrent && (
                      <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[9px] font-black uppercase text-white dark:bg-white dark:text-black">
                        {tt("settings.plan.badge.current", "Atual")}
                      </span>
                    )}
                  </div>
                </div>

                <ul className="mb-6 flex-1 space-y-2 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex gap-2 text-xs font-bold text-neutral-600 dark:text-neutral-300"
                    >
                      <span>✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  disabled={
                    requestingPlan ||
                    hasPendingPlanRequest ||
                    role === "admin"
                  }
                  onClick={() => setConfirmPlanId(plan.id)}
                  className="w-full rounded-2xl bg-black py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
                >
                  {isRequested
                    ? tt(
                        "settings.plan.action.requested",
                        "Solicitado"
                      )
                    : buttonLabel}
                </button>
              </article>
            );
          })}
        </div>

        {role === "admin" && (
          <p className="text-[11px] font-bold text-neutral-400">
            {tt(
              "settings.plan.adminNote",
              "Contas de administrador não precisam solicitar alterações de plano."
            )}
          </p>
        )}
      </section>

      {/* POLÍTICA DE DADOS */}
      <section className="space-y-3 rounded-[2.5rem] border border-red-200 bg-red-50 p-6 dark:border-red-900/30 dark:bg-red-950/10">
        <div className="space-y-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-red-900 dark:text-red-400">
            {tt(
              "rent.dataPolicy.title",
              "Política de dados e inatividade"
            )}
          </h2>

          <p className="text-xs font-bold leading-relaxed text-red-800 dark:text-red-300">
            {tt(
              "rent.dataPolicy.body",
              "Contas sem assinatura ativa por mais de 30 dias poderão ser excluídas permanentemente, incluindo cadastro, eventos, produtos, pedidos, mensagens e relatórios."
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-red-200 bg-white/60 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <p className="text-[11px] font-black leading-relaxed text-red-700 dark:text-red-400">
            {tt(
              "rent.confirm.warning",
              "A exclusão é definitiva e os dados não poderão ser recuperados."
            )}
          </p>
        </div>
      </section>

      {/* LINK PÚBLICO */}
      <section className="space-y-4 rounded-[2.5rem] border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="space-y-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
            {tt("settings.publicLink.title", "Link público")}
          </h2>

          <p className="text-xs font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">
            {tt(
              "settings.publicLink.desc",
              "Compartilhe este endereço com seus clientes."
            )}
          </p>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 sm:flex-row">
          <code className="w-full truncate rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono text-xs font-black text-neutral-800 dark:border-neutral-800/80 dark:bg-neutral-950 dark:text-neutral-200">
            {publicUrl ||
              tt(
                "settings.publicLink.waiting",
                "Aguardando configuração..."
              )}
          </code>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!publicUrl}
            className="w-full rounded-xl bg-black px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition disabled:opacity-40 dark:bg-white dark:text-black sm:w-auto"
          >
            {tt("settings.publicLink.copy", "Copiar")}
          </button>
        </div>
      </section>

      {/* FORMULÁRIO */}
      <section className="space-y-6 rounded-[2.5rem] border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/40">
        <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
          {tt("settings.form.title", "Dados da loja")}
        </h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="border-b border-neutral-200 pb-1 text-xs font-black uppercase tracking-widest text-neutral-400 dark:border-neutral-800/60">
              {tt(
                "settings.section.identification",
                "Identificação"
              )}
            </h3>

            <Field
              label={tt(
                "settings.field.displayName",
                "Nome da loja"
              )}
            >
              <input
                value={displayName}
                onChange={(event) =>
                  setDisplayName(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.displayName",
                  "Nome exibido"
                )}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>

            <Field
              label={tt(
                "settings.field.whatsapp",
                "WhatsApp"
              )}
            >
              <input
                value={whatsapp}
                onChange={(event) =>
                  setWhatsapp(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.whatsapp",
                  "Número do WhatsApp"
                )}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>

            <Field
              label={tt(
                "settings.field.messengerId",
                "Messenger ID"
              )}
            >
              <input
                value={messengerId}
                onChange={(event) =>
                  setMessengerId(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.messengerId",
                  "ID do Messenger"
                )}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>

            <Field
              label={tt(
                "settings.field.regionName",
                "Nome da região"
              )}
            >
              <input
                value={regionName}
                onChange={(event) =>
                  setRegionName(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.regionName",
                  "Região atendida"
                )}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>
          </div>

          <div className="space-y-4">
            <h3 className="border-b border-neutral-200 pb-1 text-xs font-black uppercase tracking-widest text-neutral-400 dark:border-neutral-800/60">
              {tt("settings.section.logistics", "Logística")}
            </h3>

            <Field
              label={tt(
                "settings.field.pickupLink",
                "Link de retirada"
              )}
            >
              <input
                value={pickupLink}
                onChange={(event) =>
                  setPickupLink(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.pickupLink",
                  "Link do mapa"
                )}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>

            <Field
              label={tt(
                "settings.field.pickupNote",
                "Instruções de retirada"
              )}
            >
              <textarea
                value={pickupNote}
                onChange={(event) =>
                  setPickupNote(event.target.value)
                }
                placeholder={tt(
                  "settings.ph.pickupNote",
                  "Orientações para o cliente"
                )}
                rows={5}
                className="w-full resize-none rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 transition focus:outline-none focus:ring-2 focus:ring-black dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:focus:ring-white"
              />
            </Field>
          </div>
        </div>

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-2xl bg-black px-10 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-md transition disabled:opacity-40 dark:bg-white dark:text-black sm:w-auto"
          >
            {saving
              ? tt("settings.btn.saving", "Salvando...")
              : tt("settings.btn.save", "Salvar")}
          </button>
        </div>
      </section>

      {confirmedPlan && confirmedRequestType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-5 rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="space-y-2">
              <h2 className="text-xl font-black text-neutral-900 dark:text-white">
                {confirmedRequestType === "renew"
                  ? tt(
                      "settings.plan.confirm.renew.title",
                      "Confirmar renovação"
                    )
                  : confirmedRequestType === "upgrade"
                    ? tt(
                        "settings.plan.confirm.upgrade.title",
                        "Confirmar upgrade"
                      )
                    : tt(
                        "settings.plan.confirm.downgrade.title",
                        "Confirmar downgrade"
                      )}
              </h2>

              <p className="text-sm font-bold leading-relaxed text-neutral-500 dark:text-neutral-400">
                {tt(
                  "settings.plan.confirm.body",
                  "Sua solicitação será enviada para análise. O plano atual continuará sem alterações até a aprovação."
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <p className="text-xs font-black uppercase tracking-wider text-neutral-400">
                {tt(
                  "settings.plan.confirm.selected",
                  "Plano solicitado"
                )}
              </p>

              <p className="mt-1 text-lg font-black text-neutral-900 dark:text-white">
                {confirmedPlan.name} — {confirmedPlan.price}
              </p>
            </div>

            {confirmedRequestType === "downgrade" && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
                <p className="text-xs font-black leading-relaxed text-amber-700 dark:text-amber-300">
                  {tt(
                    "settings.plan.confirm.downgrade.warning",
                    "Após a aprovação, os limites de eventos e produtos serão reduzidos para os limites do novo plano."
                  )}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmPlanId(null)}
                disabled={requestingPlan}
                className="flex-1 rounded-2xl border border-neutral-200 py-3 text-xs font-black uppercase tracking-wider text-neutral-700 disabled:opacity-40 dark:border-neutral-800 dark:text-neutral-300"
              >
                {tt("common.cancel", "Cancelar")}
              </button>

              <button
                type="button"
                disabled={requestingPlan}
                onClick={() =>
                  void handleRequestPlan(confirmedPlan.id)
                }
                className="flex-1 rounded-2xl bg-black py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {requestingPlan
                  ? tt("common.saving", "Enviando...")
                  : tt(
                      "settings.plan.confirm.accept",
                      "Confirmar solicitação"
                    )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="ml-1 text-[10px] font-black uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        {label}
      </label>

      {children}
    </div>
  );
}

function InfoCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-black text-neutral-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}
