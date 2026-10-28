"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import PageHeader from "@/app/_components/PageHeader";
import { auth } from "@/app/lib/firebase";
import { useI18n } from "@/app/lib/i18n";

type LeadStatus = "new" | "reviewing" | "contacted" | "approved" | "rejected";
type Lead = {
  id: string;
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  businessType: string;
  region: string;
  usage: string;
  notes: string;
  status: LeadStatus;
  adminNote: string;
  createdAt: string | null;
};

const STATUS_ORDER: LeadStatus[] = ["new", "reviewing", "contacted", "approved", "rejected"];

export default function AdminPartnersPage() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const copy = useMemo(
    () =>
      language === "ja"
        ? {
            eyebrow: "パートナー",
            title: "利用希望",
            description: "販売者としてシステム利用を希望している事業者です。",
            loading: "読み込み中…",
            empty: "新しい問い合わせはありません。",
            refresh: "更新",
            note: "管理メモ",
            save: "保存",
            error: "読み込みまたは更新に失敗しました。",
            usage: "利用",
            type: "業種",
            region: "地域",
            sent: "送信日",
            statuses: { new: "新規", reviewing: "確認中", contacted: "連絡済み", approved: "承認", rejected: "見送り" },
          }
        : language === "en"
          ? {
              eyebrow: "Partners",
              title: "Access requests",
              description: "Businesses interested in becoming sellers and using the platform.",
              loading: "Loading…",
              empty: "No access requests yet.",
              refresh: "Refresh",
              note: "Admin note",
              save: "Save",
              error: "Could not load or update requests.",
              usage: "Usage",
              type: "Type",
              region: "Region",
              sent: "Sent",
              statuses: { new: "New", reviewing: "Reviewing", contacted: "Contacted", approved: "Approved", rejected: "Rejected" },
            }
          : {
              eyebrow: "Parceiros",
              title: "Interessados em usar o sistema",
              description: "Solicitações de negócios interessados em se tornar sellers e alugar a plataforma.",
              loading: "Carregando…",
              empty: "Nenhuma solicitação recebida ainda.",
              refresh: "Atualizar",
              note: "Nota administrativa",
              save: "Salvar",
              error: "Não foi possível carregar ou atualizar as solicitações.",
              usage: "Uso",
              type: "Tipo",
              region: "Região",
              sent: "Enviado",
              statuses: { new: "Novo", reviewing: "Em análise", contacted: "Contatado", approved: "Aprovado", rejected: "Rejeitado" },
            },
    [language],
  );

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");

  const token = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("AUTH_REQUIRED");
    return user.getIdToken();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const idToken = await token();
      const response = await fetch("/api/admin/partner-leads", {
        headers: { authorization: `Bearer ${idToken}` },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; leads?: Lead[] } | null;
      if (!response.ok || !payload?.ok) throw new Error("LOAD_FAILED");
      setLeads(Array.isArray(payload.leads) ? payload.leads : []);
    } catch {
      setError(copy.error);
    } finally {
      setLoading(false);
    }
  }, [copy.error, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateLocal = (id: string, patch: Partial<Lead>) => {
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)));
  };

  const save = async (lead: Lead) => {
    setSavingId(lead.id);
    setError("");
    try {
      const idToken = await token();
      const response = await fetch("/api/admin/partner-leads", {
        method: "PATCH",
        headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
        body: JSON.stringify({ id: lead.id, status: lead.status, adminNote: lead.adminNote }),
      });
      if (!response.ok) throw new Error("SAVE_FAILED");
    } catch {
      setError(copy.error);
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />

      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs font-black hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800">
          <RefreshCw size={15} /> {copy.refresh}
        </button>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-neutral-200 bg-white p-10 text-sm font-bold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900"><Loader2 className="animate-spin" size={18} /> {copy.loading}</div>
      ) : leads.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-neutral-300 p-10 text-center text-sm font-bold text-neutral-500 dark:border-neutral-700">{copy.empty}</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {leads.map((lead) => (
            <article key={lead.id} className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black">{lead.businessName}</h2>
                  <p className="text-sm font-bold text-neutral-600 dark:text-neutral-300">{lead.fullName}</p>
                  <a href={`mailto:${lead.email}`} className="mt-1 block text-xs font-bold text-neutral-500 hover:underline">{lead.email}</a>
                  {lead.phone && <a href={`tel:${lead.phone}`} className="mt-1 block text-xs font-bold text-neutral-500 hover:underline">{lead.phone}</a>}
                </div>
                <select
                  value={lead.status}
                  onChange={(event) => updateLocal(lead.id, { status: event.target.value as LeadStatus })}
                  className="rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs font-black dark:border-neutral-700"
                >
                  {STATUS_ORDER.map((status) => <option key={status} value={status}>{copy.statuses[status]}</option>)}
                </select>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <Info label={copy.usage} value={lead.usage} />
                <Info label={copy.type} value={lead.businessType || "—"} />
                <Info label={copy.region} value={lead.region || "—"} />
                <Info label={copy.sent} value={lead.createdAt ? new Date(lead.createdAt).toLocaleString() : "—"} />
              </div>

              {lead.notes && <p className="mt-4 rounded-2xl bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-600 dark:bg-neutral-950 dark:text-neutral-300">{lead.notes}</p>}

              <label className="mt-4 block space-y-1.5">
                <span className="text-xs font-black">{copy.note}</span>
                <textarea
                  rows={3}
                  value={lead.adminNote}
                  onChange={(event) => updateLocal(lead.id, { adminNote: event.target.value })}
                  className="w-full resize-none rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-950 dark:border-neutral-700 dark:focus:border-white"
                />
              </label>
              <button
                type="button"
                onClick={() => void save(lead)}
                disabled={savingId === lead.id}
                className="mt-3 min-h-10 w-full rounded-xl bg-neutral-950 px-4 py-2 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-neutral-950"
              >
                {savingId === lead.id ? copy.loading : copy.save}
              </button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="mt-1 break-words font-bold">{value}</p>
    </div>
  );
}
