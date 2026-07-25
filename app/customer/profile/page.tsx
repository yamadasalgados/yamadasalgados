"use client";

import { Loader2, MapPin, Save, UserRound } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";

import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import PageHeader from "@/app/_components/PageHeader";
import useCustomerSession from "@/app/hooks/useCustomerSession";
import { EMPTY_CUSTOMER_ADDRESS, type CustomerAddressProfile } from "@/app/lib/customer-profile";
import { writeStoredCustomerProfile } from "@/app/lib/customer-storage";
import { auth } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";

const COPY = {
  pt: {
    title: "Meu perfil",
    subtitle: "Salve seus dados para finalizar as próximas compras com mais rapidez.",
    personal: "Informações pessoais",
    address: "Endereço padrão",
    postal: "Dados para envio por correio",
    name: "Nome",
    phone: "Telefone / WhatsApp",
    email: "E-mail da conta",
    deliveryAddress: "Endereço para entrega",
    locationLink: "Link da localização",
    recipientName: "Nome do destinatário",
    postalCode: "Código postal",
    prefecture: "Província / Estado",
    city: "Cidade",
    addressLine1: "Endereço principal",
    addressLine2: "Complemento",
    save: "Salvar perfil",
    saving: "Salvando...",
    saved: "Perfil salvo com sucesso.",
    error: "Não foi possível salvar o perfil.",
    login: "Entre para editar seu perfil",
    back: "Voltar",
    visitStore: "Visitar a loja",
    orders: "Meus pedidos",
    points: "pontos",
    rewards: "Minhas recompensas",
    rewardsHelp: "Os pontos são separados por loja.",
    help: "Os campos salvos serão usados somente para preencher compras futuras. Você poderá alterá-los no checkout.",
  },
  en: {
    title: "My profile",
    subtitle: "Save your details to complete future purchases faster.",
    personal: "Personal information",
    address: "Default address",
    postal: "Postal shipping details",
    name: "Name",
    phone: "Phone / WhatsApp",
    email: "Account email",
    deliveryAddress: "Delivery address",
    locationLink: "Location link",
    recipientName: "Recipient name",
    postalCode: "Postal code",
    prefecture: "Prefecture / State",
    city: "City",
    addressLine1: "Address line 1",
    addressLine2: "Address line 2",
    save: "Save profile",
    saving: "Saving...",
    saved: "Profile saved successfully.",
    error: "Could not save the profile.",
    login: "Sign in to edit your profile",
    back: "Back",
    visitStore: "Visit store",
    orders: "My orders",
    points: "points",
    rewards: "My rewards",
    rewardsHelp: "Points are kept separately for each store.",
    help: "Saved fields are only used to prefill future purchases. You can still change them during checkout.",
  },
  ja: {
    title: "マイプロフィール",
    subtitle: "次回のお買い物を簡単にするため、お客様情報を保存できます。",
    personal: "お客様情報",
    address: "既定の住所",
    postal: "郵送先情報",
    name: "お名前",
    phone: "電話番号 / WhatsApp",
    email: "アカウントのメールアドレス",
    deliveryAddress: "配達先住所",
    locationLink: "位置情報リンク",
    recipientName: "宛名",
    postalCode: "郵便番号",
    prefecture: "都道府県",
    city: "市区町村",
    addressLine1: "住所",
    addressLine2: "建物名・部屋番号",
    save: "プロフィールを保存",
    saving: "保存中...",
    saved: "プロフィールを保存しました。",
    error: "プロフィールを保存できませんでした。",
    login: "ログインしてプロフィールを編集",
    back: "戻る",
    visitStore: "ショップを見る",
    orders: "注文履歴",
    points: "ポイント",
    rewards: "ポイントを見る",
    rewardsHelp: "ポイントは店舗ごとに管理されます。",
    help: "保存した情報は次回の注文入力に使用されます。注文時に変更することもできます。",
  },
};

function safePath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/customer/orders";
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "url" | "numeric";
  readOnly?: boolean;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-black text-neutral-700 dark:text-neutral-200">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        readOnly={readOnly}
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-neutral-950 read-only:bg-neutral-100 read-only:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-white dark:read-only:bg-neutral-800"
      />
    </label>
  );
}

function CustomerProfileContent() {
  const params = useSearchParams();
  const next = useMemo(() => safePath(params.get("next")), [params]);
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const session = useCustomerSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState<CustomerAddressProfile>({ ...EMPTY_CUSTOMER_ADDRESS });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session.profile) return;
    setName(session.profile.name);
    setPhone(session.profile.phone);
    setAddress(session.profile.address);
  }, [session.profile]);

  const setAddressField = (field: keyof CustomerAddressProfile, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !auth.currentUser) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/customer/session", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          name,
          phone,
          preferredLanguage: language,
          address,
          replaceAddress: true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : text.error);
      }

      writeStoredCustomerProfile({ name, phone, email: session.profile?.email || "", address });
      await session.refresh();
      setMessage(text.saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : text.error);
    } finally {
      setBusy(false);
    }
  };

  if (session.loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <Loader2 className="animate-spin text-neutral-500" size={24} />
      </main>
    );
  }

  if (!session.registered) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-12 dark:bg-neutral-950">
        <section className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-7 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <UserRound className="mx-auto text-neutral-500" size={36} />
          <h1 className="mt-4 text-xl font-black text-neutral-950 dark:text-white">{text.login}</h1>
          <Link
            href={`/customer/login?next=${encodeURIComponent(`/customer/profile?next=${encodeURIComponent(next)}`)}`}
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white dark:bg-white dark:text-neutral-950"
          >
            {text.login}
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:py-12">
      <form onSubmit={submit} className="mx-auto w-full max-w-3xl space-y-5">
        <PageHeader
          back={<BackLink href={next} label={text.back} />}
          title={text.title}
          description={text.subtitle}
          meta={<p className="text-xs font-bold text-neutral-600 dark:text-neutral-300">{text.help}</p>}
        />

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <h2 className="text-lg font-black">{text.personal}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={text.name} value={name} onChange={setName} />
            <Field label={text.phone} value={phone} onChange={setPhone} inputMode="tel" />
            <div className="sm:col-span-2">
              <Field label={text.email} value={session.profile?.email || ""} onChange={() => undefined} type="email" readOnly />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <div className="flex items-center gap-2">
            <MapPin size={20} />
            <h2 className="text-lg font-black">{text.address}</h2>
          </div>
          <div className="mt-5 space-y-4">
            <Field label={text.deliveryAddress} value={address.deliveryAddress} onChange={(value) => setAddressField("deliveryAddress", value)} />
            <Field label={text.locationLink} value={address.locationLink} onChange={(value) => setAddressField("locationLink", value)} type="url" inputMode="url" />
          </div>
        </section>

        <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <h2 className="text-lg font-black">{text.postal}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label={text.recipientName} value={address.recipientName} onChange={(value) => setAddressField("recipientName", value)} />
            <Field label={text.postalCode} value={address.postalCode} onChange={(value) => setAddressField("postalCode", value)} />
            <Field label={text.prefecture} value={address.prefecture} onChange={(value) => setAddressField("prefecture", value)} />
            <Field label={text.city} value={address.city} onChange={(value) => setAddressField("city", value)} />
            <div className="sm:col-span-2">
              <Field label={text.addressLine1} value={address.addressLine1} onChange={(value) => setAddressField("addressLine1", value)} />
            </div>
            <div className="sm:col-span-2">
              <Field label={text.addressLine2} value={address.addressLine2} onChange={(value) => setAddressField("addressLine2", value)} />
            </div>
          </div>
        </section>

        {message && <FeedbackBanner tone="success">{message}</FeedbackBanner>}
        {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}

        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {busy ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {busy ? text.saving : text.save}
        </button>
      </form>
    </main>
  );
}

export default function CustomerProfilePage() {
  return (
    <Suspense fallback={null}>
      <CustomerProfileContent />
    </Suspense>
  );
}
