"use client";

import { ChevronDown, ChevronUp, Gift, Loader2, Sparkles, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { CustomerRewardWallet } from "@/app/lib/customer-rewards-client";
import {
  rewardProductPointCost,
  type RewardCartLine,
  type RewardRedemptionSelection,
} from "@/app/lib/reward-schema";
import { formatMoneyMinor } from "@/app/lib/money";
import type { SupportedCurrency } from "@/app/types/regional";

type Props = {
  language: "pt" | "en" | "ja";
  sellerId: string;
  returnTo: string;
  registered: boolean;
  loading: boolean;
  wallet: CustomerRewardWallet | null;
  currency: SupportedCurrency;
  locale: string;
  cartLines: RewardCartLine[];
  merchandisePayableMinor: number;
  offerApplied: boolean;
  selection: RewardRedemptionSelection;
  maximumDiscountPoints: number;
  pointsToEarn: number;
  onChange: (selection: RewardRedemptionSelection) => void;
};

const COPY = {
  pt: {
    title: "Recompensas e pontos",
    guest: "Entre para acumular e usar pontos nesta compra.",
    login: "Entrar",
    balance: "Saldo",
    points: "pts",
    usePoints: "Usar pontos",
    hideOptions: "Ocultar opções",
    none: "Guardar",
    discount: "Desconto",
    product: "Trocar item",
    amount: "Quantos pontos deseja usar?",
    max: "Usar máximo",
    chooseProduct: "Escolha um produto do carrinho",
    productOfferBlocked: "A troca por produto não pode ser combinada com oferta ou kit. Use os pontos como desconto.",
    insufficient: "Saldo insuficiente",
    earn: "+{points} ponto(s) após a entrega deste pedido.",
    noEarn: "Esta compra não gera pontos após os descontos atuais.",
    history: "Carteira",
    rule: "1 ponto a cada 100 pagos. Cada ponto vale 1 na moeda da loja.",
  },
  en: {
    title: "Rewards & points",
    guest: "Sign in to earn and use points on this purchase.",
    login: "Sign in",
    balance: "Balance",
    points: "pts",
    usePoints: "Use points",
    hideOptions: "Hide options",
    none: "Save",
    discount: "Discount",
    product: "Redeem item",
    amount: "How many points would you like to use?",
    max: "Use maximum",
    chooseProduct: "Choose a product from the cart",
    productOfferBlocked: "Product redemption cannot be combined with an offer or bundle. Use points as a discount instead.",
    insufficient: "Insufficient balance",
    earn: "+{points} point(s) when this order is delivered.",
    noEarn: "This purchase will not earn a point after the current discounts.",
    history: "Wallet",
    rule: "Earn 1 point per 100 paid. Each point is worth 1 unit of the store currency.",
  },
  ja: {
    title: "ポイント・特典",
    guest: "ログインすると、この注文でポイントを貯めたり使ったりできます。",
    login: "ログイン",
    balance: "残高",
    points: "pt",
    usePoints: "ポイントを使う",
    hideOptions: "閉じる",
    none: "使わない",
    discount: "割引",
    product: "商品交換",
    amount: "使用するポイント数",
    max: "最大まで使う",
    chooseProduct: "カートの商品を選択",
    productOfferBlocked: "商品交換はセット・キャンペーンと併用できません。ポイント割引をご利用ください。",
    insufficient: "ポイント不足",
    earn: "受け渡し完了で +{points}pt 獲得予定",
    noEarn: "現在の割引後の金額ではポイントは付与されません。",
    history: "履歴",
    rule: "お支払い100ごとに1ポイント。1ポイントは店舗通貨の1相当です。",
  },
};

export default function RewardsCheckoutPanel(props: Props) {
  const {
    language,
    sellerId,
    returnTo,
    registered,
    loading,
    wallet,
    currency,
    locale,
    cartLines,
    merchandisePayableMinor,
    offerApplied,
    selection,
    maximumDiscountPoints,
    pointsToEarn,
    onChange,
  } = props;
  const text = COPY[language];
  const balance = wallet?.pointsBalance ?? 0;
  const [expanded, setExpanded] = useState(selection.mode !== "none");

  useEffect(() => {
    if (selection.mode !== "none") setExpanded(true);
  }, [selection.mode]);

  const eligibleProducts = cartLines
    .map((line) => ({
      ...line,
      pointCost: rewardProductPointCost(line.unitPriceMinor, currency),
    }))
    .filter((line) => line.quantity > 0 && line.pointCost > 0 && line.unitPriceMinor <= merchandisePayableMinor);

  const selectedProductEligible =
    !selection.productId ||
    eligibleProducts.some((line) => line.productId === selection.productId && line.pointCost <= balance);

  useEffect(() => {
    if (selection.mode === "discount" && selection.points > maximumDiscountPoints) {
      onChange({
        mode: maximumDiscountPoints > 0 ? "discount" : "none",
        points: maximumDiscountPoints,
        productId: "",
      });
      return;
    }

    if (selection.mode === "product" && (offerApplied || !selectedProductEligible)) {
      onChange({ mode: "none", points: 0, productId: "" });
    }
  }, [
    maximumDiscountPoints,
    offerApplied,
    onChange,
    selectedProductEligible,
    selection.mode,
    selection.points,
  ]);

  if (!registered) {
    return (
      <section className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex min-w-0 items-center gap-2.5">
          <Gift className="shrink-0 text-amber-700 dark:text-amber-300" size={18} />
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-amber-950 dark:text-amber-100">{text.title}</p>
            <p className="line-clamp-1 text-[11px] font-medium text-amber-800/80 dark:text-amber-200/70">
              {text.guest}
            </p>
          </div>
        </div>
        <Link
          href={`/customer/login?next=${encodeURIComponent(returnTo)}`}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-black text-white transition active:scale-95"
        >
          {text.login}
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/90 p-3.5 dark:border-violet-900/60 dark:bg-violet-950/25 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black text-violet-950 dark:text-violet-100 sm:text-sm">{text.title}</p>
              <span className="inline-flex items-center rounded-full bg-violet-200/80 px-2 py-0.5 text-[11px] font-black text-violet-900 dark:bg-violet-900/80 dark:text-violet-100">
                {text.balance}:{" "}
                {loading ? <Loader2 className="ml-1 inline animate-spin" size={12} /> : `${balance} ${text.points}`}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-bold text-violet-700 dark:text-violet-300">
              {pointsToEarn > 0 ? text.earn.replace("{points}", String(pointsToEarn)) : text.noEarn}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {balance > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xs font-black text-violet-800 transition active:scale-95 dark:border-violet-800 dark:bg-neutral-900 dark:text-violet-200"
            >
              {expanded ? text.hideOptions : text.usePoints}
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <Link
            href={`/customer/rewards?sellerId=${encodeURIComponent(sellerId)}&next=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-10 items-center px-2 text-xs font-black text-violet-700 underline dark:text-violet-300"
          >
            {text.history}
          </Link>
        </div>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-violet-200/70 pt-3 dark:border-violet-900/50">
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ["none", text.none, Gift],
              ["discount", text.discount, TicketPercent],
              ["product", text.product, Sparkles],
            ] as const).map(([mode, label, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ mode, points: 0, productId: "" })}
                disabled={mode !== "none" && (balance <= 0 || (mode === "product" && offerApplied))}
                className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
                  selection.mode === mode
                    ? "border-violet-600 bg-violet-600 text-white shadow-sm"
                    : "border-violet-200 bg-white text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-neutral-950 dark:text-violet-100"
                }`}
              >
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {selection.mode === "discount" && (
            <div className="space-y-2 rounded-xl bg-white p-3 dark:bg-neutral-950">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-neutral-700 dark:text-neutral-200">{text.amount}</span>
                <button
                  type="button"
                  onClick={() => onChange({ mode: "discount", points: maximumDiscountPoints, productId: "" })}
                  className="min-h-9 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black text-violet-700 transition active:scale-95 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300"
                >
                  {text.max} ({maximumDiscountPoints})
                </button>
              </div>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={maximumDiscountPoints}
                step={1}
                value={selection.points || ""}
                onChange={(event) =>
                  onChange({
                    mode: "discount",
                    points: Math.min(
                      maximumDiscountPoints,
                      Math.max(0, Math.floor(Number(event.target.value) || 0)),
                    ),
                    productId: "",
                  })
                }
                className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-black outline-none focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
              />
            </div>
          )}

          {selection.mode === "product" && (
            <div className="space-y-2 rounded-xl bg-white p-3 dark:bg-neutral-950">
              {offerApplied ? (
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">{text.productOfferBlocked}</p>
              ) : (
                <label className="block text-xs font-black text-neutral-700 dark:text-neutral-200">
                  {text.chooseProduct}
                  <select
                    value={selection.productId}
                    onChange={(event) => onChange({ mode: "product", points: 0, productId: event.target.value })}
                    className="mt-2 min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-bold outline-none focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
                  >
                    <option value="">—</option>
                    {eligibleProducts.map((line) => (
                      <option key={line.productId} value={line.productId} disabled={line.pointCost > balance}>
                        {line.name} — {line.pointCost} {text.points} ({formatMoneyMinor(line.unitPriceMinor, currency, locale)})
                        {line.pointCost > balance ? ` — ${text.insufficient}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <p className="text-[11px] font-medium text-violet-700/80 dark:text-violet-300/70">{text.rule}</p>
        </div>
      )}
    </section>
  );
}