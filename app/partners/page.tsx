"use client";

import { ArrowLeft, Check, Send, Store, CalendarDays, ClipboardList, Printer, UsersRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { AppearanceButtons } from "@/app/_components/RoleNavigation";
import { useI18n } from "@/app/lib/i18n";
import { PLATFORM_LOGO_PATH, PLATFORM_NAME } from "@/app/lib/platform-brand";

type Usage = "store" | "events" | "both";
type PartnerForm = {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
  region: string;
  usage: Usage;
  notes: string;
  website: string;
};
type TextFieldKey = Exclude<keyof PartnerForm, "usage">;

export default function PartnersPage() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const copy = useMemo(
    () =>
      language === "ja"
        ? {
            eyebrow: "ビジネス向け",
            title: "注文管理をもっとシンプルに",
            subtitle: "ショップ、イベント、注文、製造をひとつの環境で管理できます。",
            request: "利用について問い合わせる",
            requestDesc: "内容を確認後、利用方法とプランについてご連絡します。",
            name: "お名前",
            business: "店舗・事業名",
            email: "メールアドレス",
            phone: "電話番号（任意）",
            type: "業種（任意）",
            region: "地域（任意）",
            usage: "主な利用方法",
            store: "オンラインショップ",
            events: "イベント",
            both: "両方",
            notes: "補足（任意）",
            send: "問い合わせを送信",
            sending: "送信中…",
            success: "送信しました。確認後ご連絡します。",
            error: "送信できませんでした。もう一度お試しください。",
            back: "販売者ログインへ",
          }
        : language === "en"
          ? {
              eyebrow: "For businesses",
              title: "Bring your orders into one simple workflow",
              subtitle: "Manage storefronts, events, orders and production without exposing the platform behind your brand.",
              request: "Request access",
              requestDesc: "We review each request and contact you with access and plan options.",
              name: "Your name",
              business: "Business name",
              email: "Email",
              phone: "Phone (optional)",
              type: "Business type (optional)",
              region: "City / region (optional)",
              usage: "How would you use it?",
              store: "Online store",
              events: "Events",
              both: "Both",
              notes: "Anything else? (optional)",
              send: "Send request",
              sending: "Sending…",
              success: "Request sent. We will contact you after review.",
              error: "Could not send your request. Please try again.",
              back: "Seller sign in",
            }
          : {
              eyebrow: "Para negócios",
              title: "Leve seus pedidos para um fluxo mais simples",
              subtitle: "Loja, eventos, pedidos e produção em um único ambiente, mantendo a identidade do seu próprio negócio.",
              request: "Solicitar acesso",
              requestDesc: "As solicitações são analisadas individualmente. Depois entramos em contato com as opções de acesso e plano.",
              name: "Seu nome",
              business: "Nome do negócio",
              email: "E-mail",
              phone: "Telefone (opcional)",
              type: "Tipo de negócio (opcional)",
              region: "Cidade / região (opcional)",
              usage: "Como pretende usar?",
              store: "Loja online",
              events: "Eventos",
              both: "Loja e eventos",
              notes: "Conte um pouco mais (opcional)",
              send: "Enviar solicitação",
              sending: "Enviando…",
              success: "Solicitação enviada. Entraremos em contato após a análise.",
              error: "Não foi possível enviar. Tente novamente.",
              back: "Voltar ao acesso do vendedor",
            },
    [language],
  );

  const [form, setForm] = useState<PartnerForm>({
    fullName: "",
    businessName: "",
    email: "",
    phone: "",
    businessType: "",
    region: "",
    usage: "both",
    notes: "",
    website: "",
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const update = (key: TextFieldKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus("idle");

    try {
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error("REQUEST_FAILED");
      setStatus("success");
      setForm({ fullName: "", businessName: "", email: "", phone: "", businessType: "", region: "", usage: "both", notes: "", website: "" });
    } catch {
      setStatus("error");
    } finally {
      setBusy(false);
    }
  };

  const features = [
    { icon: Store, label: language === "ja" ? "オンラインショップ" : language === "en" ? "Storefront" : "Loja própria" },
    { icon: CalendarDays, label: language === "ja" ? "イベント" : language === "en" ? "Events" : "Eventos" },
    { icon: ClipboardList, label: language === "ja" ? "注文管理" : language === "en" ? "Orders" : "Pedidos" },
    { icon: Sparkles, label: language === "ja" ? "商品・特典" : language === "en" ? "Catalog & rewards" : "Catálogo e pontos" },
    { icon: Printer, label: language === "ja" ? "製造・印刷" : language === "en" ? "Production & print" : "Produção e impressão" },
    { icon: UsersRound, label: language === "ja" ? "顧客管理" : language === "en" ? "Customers" : "Clientes" },
  ];

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Link href="/login" className="inline-flex items-center gap-2 text-xs font-black text-neutral-500 hover:text-neutral-950 dark:hover:text-white">
            <ArrowLeft size={16} /> {copy.back}
          </Link>
          <AppearanceButtons />
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <section className="pt-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PLATFORM_LOGO_PATH} alt={PLATFORM_NAME} className="h-12 w-12 rounded-xl object-cover" />
              <span className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">{copy.eyebrow}</span>
            </div>
            <h1 className="mt-7 max-w-xl text-4xl font-black tracking-tight sm:text-5xl">{copy.title}</h1>
            <p className="mt-5 max-w-xl text-base font-medium leading-relaxed text-neutral-500 dark:text-neutral-400">{copy.subtitle}</p>

            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {features.map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
                  <Icon size={19} className="text-neutral-500" />
                  <p className="mt-3 text-xs font-black">{label}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
            <h2 className="text-2xl font-black">{copy.request}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{copy.requestDesc}</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <input
                aria-hidden="true"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => update("website", event.target.value)}
                className="absolute -left-[9999px] h-px w-px opacity-0"
              />
              {([
                { key: "fullName", label: copy.name, type: "text", required: true },
                { key: "businessName", label: copy.business, type: "text", required: true },
                { key: "email", label: copy.email, type: "email", required: true },
                { key: "phone", label: copy.phone, type: "tel", required: false },
                { key: "businessType", label: copy.type, type: "text", required: false },
                { key: "region", label: copy.region, type: "text", required: false },
              ] satisfies Array<{ key: TextFieldKey; label: string; type: string; required: boolean }>).map((field) => (
                <label key={field.key} className="block space-y-1.5">
                  <span className="text-xs font-black">{field.label}</span>
                  <input
                    type={field.type}
                    required={field.required}
                    value={form[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                    className="w-full rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
                  />
                </label>
              ))}

              <fieldset className="space-y-2">
                <legend className="text-xs font-black">{copy.usage}</legend>
                <div className="grid grid-cols-3 gap-2">
                  {(["store", "events", "both"] as Usage[]).map((usage) => (
                    <button
                      key={usage}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, usage }))}
                      className={`rounded-xl border px-2 py-3 text-[11px] font-black transition ${
                        form.usage === usage
                          ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                          : "border-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      {usage === "store" ? copy.store : usage === "events" ? copy.events : copy.both}
                    </button>
                  ))}
                </div>
              </fieldset>

              <label className="block space-y-1.5">
                <span className="text-xs font-black">{copy.notes}</span>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                  className="w-full resize-none rounded-xl border border-neutral-300 bg-transparent px-4 py-3 outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
                />
              </label>

              {status === "success" && (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                  <Check size={18} className="mt-0.5 shrink-0" /> {copy.success}
                </div>
              )}
              {status === "error" && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{copy.error}</div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 px-4 py-3 text-sm font-black text-white transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                <Send size={17} /> {busy ? copy.sending : copy.send}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
