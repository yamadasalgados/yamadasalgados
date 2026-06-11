"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";

type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "cancelled";
type PlanId = "starter" | "pro" | "business";

type UserDoc = {
  role?: "admin" | "seller";
  active?: boolean;
  suspended?: boolean;
  plan?: PlanId;
  subscriptionStatus?: SubscriptionStatus;
  maxEvents?: number;
  maxProducts?: number;
};

export default function RentPage() {
  const router = useRouter();
  const { t } = useI18n();

  const tt = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v === key ? fallback : v;
    },
    [t]
  );

  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<(typeof plans)[number] | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);

      try {
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data() as UserDoc;
          setProfile(data);

          if (data.subscriptionStatus === "active" && !data.suspended && data.active !== false) {
            router.replace("/seller");
          }
        }
      } catch (e) {
        setErr(tt("guard.err.loadProfile", "Erro ao carregar perfil."));
      } finally {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [router, tt]);

  const status = profile?.subscriptionStatus ?? "none";

  const plans = useMemo(
    () =>
      [
        {
          id: "starter",
          name: tt("plan.starter.name", "Starter"),
          price: tt("plan.starter.price", "¥2.980 / mês"),
          features: (tt("plan.starter.features", "") || "").split("\n").filter(Boolean),
          maxEvents: 1,
          maxProducts: 20,
        },
        {
          id: "pro",
          name: tt("plan.pro.name", "Pro"),
          price: tt("plan.pro.price", "¥5.980 / mês"),
          features: (tt("plan.pro.features", "") || "").split("\n").filter(Boolean),
          maxEvents: 3,
          maxProducts: 60,
        },
        {
          id: "business",
          name: tt("plan.business.name", "Business"),
          price: tt("plan.business.price", "¥9.980 / mês"),
          features: (tt("plan.business.features", "") || "").split("\n").filter(Boolean),
          maxEvents: 10,
          maxProducts: 200,
        },
      ] as const,
    [tt]
  );

  const [confirmPlanId, setConfirmPlanId] = useState<PlanId | null>(null);

const requestPlan = useCallback(
  async (p: (typeof plans)[number]) => { 
      if (!user) return;
      setBusy(true);
      setErr(null);
      setMsg(null);

      try {
        await updateDoc(doc(db, "users", user.uid), {
          plan: p.id,
          subscriptionStatus: "pending",
          maxEvents: p.maxEvents,
          maxProducts: p.maxProducts,
          requestedPlanAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        setMsg(tt("rent.requested", "Solicitação enviada! Aguarde a ativação."));
        setProfile((prev) => (prev ? { ...prev, plan: p.id, subscriptionStatus: "pending" } : prev));
} catch (e: any) {
  console.error("PLAN ERROR:", e);

  setErr(
    e?.message ||
    tt("settings.err.save", "Falha ao solicitar plano.")
  );
      } finally {
        setBusy(false);
      }
    },
    [user, tt]
  );

  if (checking) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  const currentYear = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-20 transition-colors animate-fade-in">
      <div className="mx-auto max-w-5xl px-4 pt-8 space-y-8">
        
        {/* Cabeçalho de Impacto */}
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {tt("rent.title", "Planos de Acesso")}
          </h1>
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 max-w-xl">
            {tt("rent.subtitle", "Selecione a assinatura ideal para expandir suas vendas e gerenciar seus pedidos.")}
          </p>
        </div>

        {/* Notificações de Feedback */}
        {(msg || err) && (
          <div
            className={`rounded-2xl border px-4 py-3.5 text-xs font-black uppercase tracking-wider ${
              err
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400"
                : "border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-400"
            }`}
          >
            {err ?? msg}
          </div>
        )}

        {/* Grid de Planos */}
        <div className="grid gap-6 md:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = profile?.plan === p.id;
            const isPending = isCurrent && status === "pending";

            return (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-[2.5rem] p-6 border transition-all ${
                  isCurrent
                    ? "bg-black text-white border-black ring-2 ring-black dark:ring-neutral-700 dark:bg-neutral-900 dark:border-neutral-800 shadow-2xl md:scale-[1.03] z-10"
                    : "bg-white text-neutral-900 border-neutral-200 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-100 shadow-sm hover:border-neutral-400 dark:hover:border-neutral-700"
                }`}
              >
                {isPending && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[10px] font-black px-4 py-1.5 rounded-full shadow-md tracking-wider uppercase">
                    {tt("rent.status.pending", "Pendente")}
                  </div>
                )}

                <div className="mb-6 space-y-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{p.name}</h3>
                  <p className="text-3xl font-black tracking-tight">{p.price}</p>
                </div>

                <ul className="mb-8 space-y-3.5 flex-1 border-t border-neutral-100 dark:border-neutral-800/60 pt-5">
                  {p.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs font-black text-neutral-600 dark:text-neutral-300">
                      <span className={isCurrent ? "text-green-400" : "text-black dark:text-white font-serif"}>✓</span>
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  disabled={busy || isPending}
                onClick={() => setConfirmPlanId(p.id)}   
               className={`w-full rounded-2xl py-3.5 text-xs font-black transition-all active:scale-[0.98] shadow-sm uppercase tracking-wider ${
                    isCurrent
                      ? "bg-white text-black hover:bg-neutral-100 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                      : "bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-100"
                  } disabled:opacity-40`}
                >
                  {isPending
                    ? tt("rent.requested", "SOLICITADO")
                    : isCurrent
                    ? tt("rent.currentPlan", "PLANO ATUAL")
                    : tt("rent.requestPlan", "ESCOLHER ESTE")}
                </button>
              </div>
            );
          })}
        </div>

        {/* Informações de Pagamento Semânticas */}
        <div className="rounded-3xl bg-amber-50/60 dark:bg-amber-950/10 p-6 border border-amber-200 dark:border-amber-900/20 space-y-2">
          <h3 className="text-sm font-black text-amber-900 dark:text-amber-400 uppercase tracking-wider flex items-center gap-2">
            💳 {tt("rent.payment.title", "Formas de pagamento")}
          </h3>
          <p className="text-xs text-amber-800 dark:text-amber-300 font-bold leading-relaxed">
            {tt("rent.payment.methods", "PayPay / Transferência bancária / Dinheiro (a combinar)")}
          </p>
          <p className="text-[11px] text-amber-600/80 dark:text-amber-500/60 font-medium italic pt-2 border-t border-amber-200/50 dark:border-amber-900/20">
            *{tt("rent.payment.note", "Após o pagamento, o admin ativa seu plano e você libera o acesso ao painel.")}
          </p>
        </div>

        <div className="rounded-3xl bg-red-50 dark:bg-red-950/10 p-6 border border-red-200 dark:border-red-900/30 space-y-2">
  <h3 className="text-sm font-black text-red-900 dark:text-red-400 uppercase tracking-wider">
    {tt("rent.dataPolicy.title", "Política de dados e inatividade")}
  </h3>

  <p className="text-xs text-red-800 dark:text-red-300 font-bold leading-relaxed">
    {tt(
      "rent.dataPolicy.body",
      "Contas sem assinatura ativa por mais de 30 dias poderão ser excluídas permanentemente, incluindo cadastro, eventos, produtos, pedidos, mensagens e relatórios. Caso deseje usar o sistema novamente, será necessário criar uma nova conta do zero."
    )}
  </p>
</div>

        {confirmPlanId && (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-md rounded-[2rem] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 space-y-5 shadow-2xl">
      <div className="space-y-2">
        <h2 className="text-xl font-black text-neutral-900 dark:text-white">
          {tt("rent.confirm.title", "Confirmar solicitação")}
        </h2>

        <p className="text-sm font-bold text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {tt(
            "rent.confirm.body",
            "Ao solicitar este plano, você declara estar ciente de que contas sem assinatura ativa por mais de 30 dias poderão ser excluídas permanentemente com todos os dados vinculados."
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 p-4">
        <p className="text-xs font-black text-red-700 dark:text-red-400 leading-relaxed">
          {tt(
            "rent.confirm.warning",
            "A exclusão é definitiva. Produtos, eventos, pedidos, mensagens e relatórios não poderão ser recuperados."
          )}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setConfirmPlanId(null)}
          className="flex-1 rounded-2xl border border-neutral-200 dark:border-neutral-800 py-3 text-xs font-black uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
        >
          {tt("common.cancel", "Cancelar")}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const plan = plans.find((p) => p.id === confirmPlanId);
            if (plan) requestPlan(plan);
            setConfirmPlanId(null);
          }}
          className="flex-1 rounded-2xl bg-black dark:bg-white text-white dark:text-black py-3 text-xs font-black uppercase tracking-wider disabled:opacity-40"
        >
          {busy
            ? tt("common.saving", "Salvando...")
            : tt("rent.confirm.accept", "Aceito e solicitar")}
        </button>
      </div>
    </div>
  </div>
)}

        <footer className="text-center pt-8">
          <p className="text-[10px] text-neutral-400 dark:text-neutral-600 font-black uppercase tracking-widest">
            Order System • {currentYear}
          </p>
        </footer>
      </div>
    </main>
  );
}