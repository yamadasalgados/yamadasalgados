"use client";

import Link from "next/link";
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Factory,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import useSellerId from "@/app/hooks/useSellerId";
import { useI18n } from "@/app/lib/i18n";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import MetricStrip from "@/app/_components/MetricStrip";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import {
  loadProductionReport,
  ProductionReportError,
  type ProductionReportMovement,
  type ProductionReportResult,
} from "@/app/lib/production-report-client";

const COPY = {
  pt: {
    title: "Histórico de produção",
    subtitle: "Acompanhe quantidades produzidas, operadores, pedidos atendidos e divergências.",
    back: "Voltar à produção",
    dashboard: "Painel",
    refresh: "Atualizar",
    export: "Exportar CSV",
    loading: "Carregando relatório...",
    authError: "Entre novamente na conta do vendedor.",
    loadError: "Não foi possível carregar o relatório.",
    start: "Data inicial",
    end: "Data final",
    apply: "Aplicar período",
    today: "Hoje",
    sevenDays: "7 dias",
    thirtyDays: "30 dias",
    produced: "Unidades produzidas",
    movements: "Registros",
    products: "Produtos",
    orders: "Pedidos atendidos",
    ready: "Pedidos liberados",
    actors: "Operadores",
    issues: "Divergências",
    noData: "Nenhuma produção foi registrada neste período.",
    topProducts: "Produção por produto",
    product: "Produto",
    quantity: "Quantidade",
    operations: "Operações",
    readyOrders: "Liberados",
    byActor: "Produção por operador",
    actor: "Operador",
    lastRecord: "Último registro",
    daily: "Resumo diário",
    date: "Data",
    history: "Movimentações",
    source: "Origem",
    order: "Pedido",
    createdAt: "Data e hora",
    status: "Resultado",
    becameReady: "Pedido ficou pronto",
    recorded: "Produção registrada",
    store: "Loja",
    event: "Evento",
    search: "Buscar produto, pedido ou operador",
    onlyIssues: "Somente divergências",
    noHistory: "Nenhum registro corresponde aos filtros.",
    showMore: "Mostrar mais",
    truncated: "O período ultrapassou o limite de registros. Reduza o intervalo para ver todo o histórico.",
    issueWarning: "Há registros que precisam de conferência.",
    issueMissingProduct: "Produto removido ou sem nome",
    issueInvalidQuantity: "Quantidade inválida",
    issueMissingTimestamp: "Data ausente",
    issueMissingActor: "Operador ausente",
    issueMissingOrder: "Pedido ausente",
    csvDate: "Data",
    csvProduct: "Produto",
    csvQuantity: "Quantidade",
    csvOrder: "Pedido",
    csvSource: "Origem",
    csvEvent: "Evento",
    csvActor: "Operador",
    csvReady: "Pedido liberado",
    csvIssues: "Divergências",
    yes: "Sim",
    no: "Não",
    invalidRange: "Informe um período válido.",
  },
  en: {
    title: "Production history",
    subtitle: "Track produced quantities, operators, fulfilled orders, and discrepancies.",
    back: "Back to production",
    dashboard: "Dashboard",
    refresh: "Refresh",
    export: "Export CSV",
    loading: "Loading report...",
    authError: "Sign in to the seller account again.",
    loadError: "The report could not be loaded.",
    start: "Start date",
    end: "End date",
    apply: "Apply range",
    today: "Today",
    sevenDays: "7 days",
    thirtyDays: "30 days",
    produced: "Units produced",
    movements: "Records",
    products: "Products",
    orders: "Orders served",
    ready: "Orders released",
    actors: "Operators",
    issues: "Discrepancies",
    noData: "No production was recorded in this period.",
    topProducts: "Production by product",
    product: "Product",
    quantity: "Quantity",
    operations: "Operations",
    readyOrders: "Released",
    byActor: "Production by operator",
    actor: "Operator",
    lastRecord: "Last record",
    daily: "Daily summary",
    date: "Date",
    history: "Movements",
    source: "Source",
    order: "Order",
    createdAt: "Date and time",
    status: "Result",
    becameReady: "Order became ready",
    recorded: "Production recorded",
    store: "Store",
    event: "Event",
    search: "Search product, order, or operator",
    onlyIssues: "Discrepancies only",
    noHistory: "No record matches the filters.",
    showMore: "Show more",
    truncated: "The period exceeded the record limit. Reduce the range to see the complete history.",
    issueWarning: "Some records need review.",
    issueMissingProduct: "Deleted or unnamed product",
    issueInvalidQuantity: "Invalid quantity",
    issueMissingTimestamp: "Missing date",
    issueMissingActor: "Missing operator",
    issueMissingOrder: "Missing order",
    csvDate: "Date",
    csvProduct: "Product",
    csvQuantity: "Quantity",
    csvOrder: "Order",
    csvSource: "Source",
    csvEvent: "Event",
    csvActor: "Operator",
    csvReady: "Order released",
    csvIssues: "Discrepancies",
    yes: "Yes",
    no: "No",
    invalidRange: "Enter a valid date range.",
  },
  ja: {
    title: "製造履歴",
    subtitle: "製造数、担当者、対応した注文、差異を確認します。",
    back: "製造画面へ戻る",
    dashboard: "ダッシュボード",
    refresh: "更新",
    export: "CSV出力",
    loading: "レポートを読み込み中...",
    authError: "販売者アカウントに再度ログインしてください。",
    loadError: "レポートを読み込めませんでした。",
    start: "開始日",
    end: "終了日",
    apply: "期間を適用",
    today: "本日",
    sevenDays: "7日間",
    thirtyDays: "30日間",
    produced: "製造数",
    movements: "記録数",
    products: "商品数",
    orders: "対応注文",
    ready: "準備完了になった注文",
    actors: "担当者",
    issues: "差異",
    noData: "この期間には製造記録がありません。",
    topProducts: "商品別の製造",
    product: "商品",
    quantity: "数量",
    operations: "操作数",
    readyOrders: "準備完了",
    byActor: "担当者別の製造",
    actor: "担当者",
    lastRecord: "最終記録",
    daily: "日別集計",
    date: "日付",
    history: "製造記録",
    source: "出所",
    order: "注文",
    createdAt: "日時",
    status: "結果",
    becameReady: "注文が準備完了",
    recorded: "製造を記録",
    store: "店舗",
    event: "イベント",
    search: "商品、注文、担当者を検索",
    onlyIssues: "差異のみ",
    noHistory: "条件に一致する記録はありません。",
    showMore: "さらに表示",
    truncated: "記録上限を超えました。期間を短くして全履歴を確認してください。",
    issueWarning: "確認が必要な記録があります。",
    issueMissingProduct: "削除済みまたは名称なしの商品",
    issueInvalidQuantity: "数量が不正",
    issueMissingTimestamp: "日時なし",
    issueMissingActor: "担当者なし",
    issueMissingOrder: "注文なし",
    csvDate: "日時",
    csvProduct: "商品",
    csvQuantity: "数量",
    csvOrder: "注文",
    csvSource: "出所",
    csvEvent: "イベント",
    csvActor: "担当者",
    csvReady: "注文準備完了",
    csvIssues: "差異",
    yes: "はい",
    no: "いいえ",
    invalidRange: "正しい期間を入力してください。",
  },
} as const;

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeForDays(days: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return { start: dateInputValue(start), end: dateInputValue(end) };
}

function rangeToIso(start: string, end: string): { startAt: string; endAt: string } | null {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (!start || !end || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return null;
  }
  endDate.setDate(endDate.getDate() + 1);
  if (endDate.getTime() <= startDate.getTime()) return null;
  return { startAt: startDate.toISOString(), endAt: endDate.toISOString() };
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function issueText(code: string, text: (typeof COPY)[keyof typeof COPY]): string {
  if (code === "missing_product_id" || code === "missing_product_name") return text.issueMissingProduct;
  if (code === "invalid_quantity") return text.issueInvalidQuantity;
  if (code === "missing_timestamp") return text.issueMissingTimestamp;
  if (code === "missing_actor") return text.issueMissingActor;
  if (code === "missing_order_id") return text.issueMissingOrder;
  return code;
}

export default function ProductionHistoryClient() {
  const { lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";
  const text = COPY[language];
  const { loading: sellerLoading, sellerId, errorCode, reload } = useSellerId();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedRange, setAppliedRange] = useState<{ start: string; end: string } | null>(null);
  const [report, setReport] = useState<ProductionReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(100);

  useEffect(() => {
    const initial = rangeForDays(7);
    setStartDate(initial.start);
    setEndDate(initial.end);
    setAppliedRange(initial);
  }, []);

  const load = useCallback(async () => {
    if (!sellerId || !appliedRange) return;
    const range = rangeToIso(appliedRange.start, appliedRange.end);
    if (!range) {
      setError(text.invalidRange);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const result = await loadProductionReport({
        sellerId,
        startAt: range.startAt,
        endAt: range.endAt,
        lang: language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setReport(result);
      setHistoryLimit(100);
    } catch (loadError) {
      setReport(null);
      setError(
        loadError instanceof ProductionReportError
          ? loadError.message
          : text.loadError,
      );
    } finally {
      setLoading(false);
    }
  }, [appliedRange, language, sellerId, text.invalidRange, text.loadError]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const formatDateTime = useCallback(
    (value: string) => {
      if (!value) return "—";
      const parsed = new Date(value);
      if (!Number.isFinite(parsed.getTime())) return "—";
      return new Intl.DateTimeFormat(
        language === "pt" ? "pt-BR" : language === "en" ? "en-US" : "ja-JP",
        { dateStyle: "short", timeStyle: "short" },
      ).format(parsed);
    },
    [language],
  );

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (report?.movements ?? []).filter((movement) => {
      if (onlyIssues && movement.issueCodes.length === 0) return false;
      if (!term) return true;
      return [
        movement.productName,
        movement.productId,
        movement.orderId,
        movement.createdBy,
        movement.eventTitle,
        movement.customerName,
      ].some((value) => value.toLocaleLowerCase().includes(term));
    });
  }, [onlyIssues, report?.movements, search]);

  const visibleMovements = filteredMovements.slice(0, historyLimit);
  const maxProductQuantity = Math.max(1, ...(report?.products.map((item) => item.quantity) ?? [1]));

  const applyPreset = (days: number) => {
    const next = rangeForDays(days);
    setStartDate(next.start);
    setEndDate(next.end);
    setAppliedRange(next);
  };

  const applyCustomRange = () => {
    if (!rangeToIso(startDate, endDate)) {
      setError(text.invalidRange);
      return;
    }
    setAppliedRange({ start: startDate, end: endDate });
  };

  const exportCsv = () => {
    if (!report) return;
    const headers = [
      text.csvDate,
      text.csvProduct,
      text.csvQuantity,
      text.csvOrder,
      text.csvSource,
      text.csvEvent,
      text.csvActor,
      text.csvReady,
      text.csvIssues,
    ];
    const rows = report.movements.map((movement) => [
      formatDateTime(movement.createdAt),
      movement.productName,
      movement.quantity,
      movement.orderId,
      movement.orderSource === "event" ? text.event : text.store,
      movement.eventTitle,
      movement.createdBy,
      movement.orderBecameReady ? text.yes : text.no,
      movement.issueCodes.map((code) => issueText(code, text)).join(" | "),
    ]);
    const content = `\ufeff${[headers, ...rows]
      .map((row) => row.map(csvCell).join(";"))
      .join("\n")}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `production-${appliedRange?.start ?? "start"}-${appliedRange?.end ?? "end"}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (sellerLoading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-white p-6 dark:bg-neutral-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin" />
          <p className="mt-4 text-sm font-bold text-neutral-500">{text.loading}</p>
        </div>
      </main>
    );
  }

  if (!sellerId || errorCode) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          <CircleAlert className="mx-auto h-10 w-10" />
          <p className="mt-4 text-sm font-black">{text.authError}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-5 rounded-xl bg-black px-5 py-3 text-xs font-black text-white dark:bg-white dark:text-black"
          >
            {text.refresh}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-4 text-neutral-950 dark:bg-neutral-950 dark:text-white sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow={text.history}
          title={text.title}
          description={text.subtitle}
          back={<BackLink href="/seller/production" label={text.back} />}
          action={
            <button
              type="button"
              disabled={!report}
              onClick={exportCsv}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-4 text-xs font-black text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200"
            >
              <ClipboardList className="h-4 w-4" />
              {text.export}
            </button>
          }
        />

        <section className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-1 text-xs font-black text-neutral-600 dark:text-neutral-300">
              <span>{text.start}</span>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="space-y-1 text-xs font-black text-neutral-600 dark:text-neutral-300">
              <span>{text.end}</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <button
              type="button"
              onClick={applyCustomRange}
              className="min-h-11 self-end rounded-xl bg-black px-5 text-xs font-black text-white transition hover:opacity-85 dark:bg-white dark:text-black"
            >
              {text.apply}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => applyPreset(1)} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">
              {text.today}
            </button>
            <button type="button" onClick={() => applyPreset(7)} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">
              {text.sevenDays}
            </button>
            <button type="button" onClick={() => applyPreset(30)} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700">
              {text.thirtyDays}
            </button>
            <button
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-xs font-black dark:border-neutral-700"
            >
              <RefreshCw className="h-4 w-4" />
              {text.refresh}
            </button>
          </div>
        </section>

        {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}

        {report?.truncated && <FeedbackBanner tone="warning">{text.truncated}</FeedbackBanner>}

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="text-center">
              <Loader2 className="mx-auto h-9 w-9 animate-spin" />
              <p className="mt-4 text-sm font-bold text-neutral-500">{text.loading}</p>
            </div>
          </div>
        ) : report && report.summary.totalMovements > 0 ? (
          <>
            <MetricStrip
              items={[
                { label: text.produced, value: report.summary.totalQuantity, tone: "violet" },
                { label: text.movements, value: report.summary.totalMovements },
                { label: text.products, value: report.summary.uniqueProducts },
                { label: text.orders, value: report.summary.uniqueOrders },
                { label: text.ready, value: report.summary.readyOrders, tone: "success" },
                { label: text.actors, value: report.summary.uniqueActors },
                { label: text.issues, value: report.summary.issueCount, tone: report.summary.issueCount > 0 ? "warning" : "success" },
              ]}
            />

            {report.summary.issueCount > 0 && (
              <FeedbackBanner tone="warning">{text.issueWarning}</FeedbackBanner>
            )}

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="text-lg font-black">{text.topProducts}</h2>
                <div className="mt-5 space-y-4">
                  {report.products.map((product) => (
                    <div key={product.productId || product.productName}>
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">{product.productName}</p>
                          <p className="mt-1 text-[11px] font-bold text-neutral-500">
                            {product.orders} {text.orders.toLocaleLowerCase()} · {product.movements} {text.operations.toLocaleLowerCase()} · {product.readyOrders} {text.readyOrders.toLocaleLowerCase()}
                          </p>
                        </div>
                        <strong className="text-xl font-black">{product.quantity}</strong>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <div
                          className="h-full rounded-full bg-violet-600 dark:bg-violet-400"
                          style={{ width: `${Math.max(2, (product.quantity / maxProductQuantity) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <h2 className="text-lg font-black">{text.byActor}</h2>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      <tr>
                        <th className="pb-3">{text.actor}</th>
                        <th className="pb-3 text-right">{text.quantity}</th>
                        <th className="pb-3 text-right">{text.operations}</th>
                        <th className="pb-3 text-right">{text.orders}</th>
                        <th className="pb-3 text-right">{text.lastRecord}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {report.actors.map((actor) => (
                        <tr key={actor.actorUid || actor.actor}>
                          <td className="py-3 font-black">{actor.actor}</td>
                          <td className="py-3 text-right font-black">{actor.quantity}</td>
                          <td className="py-3 text-right">{actor.movements}</td>
                          <td className="py-3 text-right">{actor.orders}</td>
                          <td className="py-3 text-right text-xs text-neutral-500">{formatDateTime(actor.lastAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="text-lg font-black">{text.daily}</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="pb-3">{text.date}</th>
                      <th className="pb-3 text-right">{text.quantity}</th>
                      <th className="pb-3 text-right">{text.operations}</th>
                      <th className="pb-3 text-right">{text.orders}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {report.days.map((day) => (
                      <tr key={day.date}>
                        <td className="py-3 font-black">{day.date}</td>
                        <td className="py-3 text-right font-black">{day.quantity}</td>
                        <td className="py-3 text-right">{day.movements}</td>
                        <td className="py-3 text-right">{day.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-black">{text.history}</h2>
                  <p className="mt-1 text-xs font-bold text-neutral-500">{filteredMovements.length} {text.movements.toLocaleLowerCase()}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={text.search}
                      className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white pl-10 pr-3 text-sm font-bold dark:border-neutral-700 dark:bg-neutral-950 sm:w-80"
                    />
                  </label>
                  <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 px-3 text-xs font-black dark:border-neutral-700">
                    <input
                      type="checkbox"
                      checked={onlyIssues}
                      onChange={(event) => setOnlyIssues(event.target.checked)}
                    />
                    {text.onlyIssues}
                  </label>
                </div>
              </div>

              {visibleMovements.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm font-bold text-neutral-500 dark:border-neutral-700">
                  {text.noHistory}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {visibleMovements.map((movement) => (
                    <MovementCard
                      key={movement.id}
                      movement={movement}
                      text={text}
                      formatDateTime={formatDateTime}
                    />
                  ))}
                </div>
              )}

              {visibleMovements.length < filteredMovements.length && (
                <button
                  type="button"
                  onClick={() => setHistoryLimit((current) => current + 100)}
                  className="mt-5 min-h-11 w-full rounded-xl border border-neutral-300 text-xs font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                >
                  {text.showMore}
                </button>
              )}
            </section>
          </>
        ) : report ? (
          <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <CalendarDays className="mx-auto h-10 w-10 text-neutral-400" />
            <p className="mt-4 text-sm font-black text-neutral-600 dark:text-neutral-300">{text.noData}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function MovementCard(props: {
  movement: ProductionReportMovement;
  text: (typeof COPY)[keyof typeof COPY];
  formatDateTime: (value: string) => string;
}) {
  const { movement, text, formatDateTime } = props;
  const detailHref =
    movement.orderSource === "event" && movement.eventId
      ? `/seller/events/${movement.eventId}/orders/${movement.orderId}`
      : `/seller/store-orders/${movement.orderId}`;

  return (
    <article className="rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-black">{movement.productName}</h3>
            <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-black text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
              +{movement.quantity}
            </span>
            {movement.orderBecameReady && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                {text.becameReady}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-bold text-neutral-500">
            {formatDateTime(movement.createdAt)} · {movement.createdBy}
          </p>
          <p className="mt-1 text-xs font-bold text-neutral-500">
            {movement.orderSource === "event" ? `${text.event}${movement.eventTitle ? `: ${movement.eventTitle}` : ""}` : text.store}
            {movement.customerName ? ` · ${movement.customerName}` : ""}
          </p>
        </div>
        {movement.orderId ? (
          <Link
            href={detailHref}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-neutral-300 px-3 text-xs font-black transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {text.order} #{movement.orderId.slice(-8)}
          </Link>
        ) : null}
      </div>
      {movement.issueCodes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {movement.issueCodes.map((code) => (
            <span key={code} className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {issueText(code, text)}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
