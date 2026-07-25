"use client";

import { Gift, Loader2, Sparkles, TicketPercent } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

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
    title: "Usar recompensas",
    guest: "Entre para acumular e usar pontos nesta compra.",
    login: "Entrar ou cadastrar",
    balance: "Saldo",
    points: "pontos",
    none: "Guardar para depois",
    discount: "Usar como desconto",
    product: "Trocar por um produto",
    amount: "Quantos pontos deseja usar?",
    max: "Usar máximo",
    chooseProduct: "Escolha um produto do carrinho",
    productOfferBlocked: "A troca por produto não pode ser combinada com oferta ou kit. Use os pontos como desconto.",
    insufficient: "Saldo insuficiente",
    earn: "Você ganhará {points} ponto(s) quando este pedido for entregue.",
    noEarn: "Esta compra não gera ponto após os descontos atuais.",
    history: "Ver carteira e histórico",
    rule: "1 ponto a cada 100 pagos. Cada ponto vale 1 na moeda da loja.",
  },
  en: {
    title: "Use rewards",
    guest: "Sign in to earn and use points on this purchase.",
    login: "Sign in or register",
    balance: "Balance",
    points: "points",
    none: "Save for later",
    discount: "Use as a discount",
    product: "Redeem a product",
    amount: "How many points would you like to use?",
    max: "Use maximum",
    chooseProduct: "Choose a product from the cart",
    productOfferBlocked: "Product redemption cannot be combined with an offer or bundle. Use points as a discount instead.",
    insufficient: "Insufficient balance",
    earn: "You will earn {points} point(s) when this order is delivered.",
    noEarn: "This purchase will not earn a point after the current discounts.",
    history: "View wallet and history",
    rule: "Earn 1 point per 100 paid. Each point is worth 1 unit of the store currency.",
  },
  ja: {
    title: "ポイントを使う",
    guest: "ログインすると、この注文でポイントを貯めたり使ったりできます。",
    login: "ログイン・新規登録",
    balance: "残高",
    points: "ポイント",
    none: "今回は使わない",
    discount: "割引に使う",
    product: "商品と交換する",
    amount: "使用するポイント数",
    max: "最大まで使う",
    chooseProduct: "カートの商品を選択",
    productOfferBlocked: "商品交換はセット・キャンペーンと併用できません。ポイント割引をご利用ください。",
    insufficient: "ポイントが足りません",
    earn: "この注文が受け渡し済みになると、{points}ポイント獲得します。",
    noEarn: "現在の割引後の金額ではポイントは付与されません。",
    history: "ポイント履歴を見る",
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
  const eligibleProducts = cartLines
    .map((line) => ({
      ...line,
      pointCost: rewardProductPointCost(line.unitPriceMinor, currency),
    }))
    .filter((line) => line.quantity > 0 && line.pointCost > 0 && line.unitPriceMinor <= merchandisePayableMinor);

  const selectedProductEligible = !selection.productId || eligibleProducts.some(
    (line) => line.productId === selection.productId && line.pointCost <= balance,
  );

  useEffect(() => {
    if (selection.mode === "discount" && selection.points > maximumDiscountPoints) {
      onChange({
        mode: maximumDiscountPoints > 0 ? "discount" : "none",
        points: maximumDiscountPoints,
        productId: "",
      });
      return;
    }

    if (
      selection.mode === "product" &&
      (offerApplied || !selectedProductEligible)
    ) {
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
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
        <div className="flex items-start gap-3">
          <Gift className="mt-0.5 text-amber-700 dark:text-amber-300" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-amber-950 dark:text-amber-100">{text.title}</p>
            <p className="mt-1 text-xs font-medium text-amber-800/80 dark:text-amber-200/70">{text.guest}</p>
            <Link
              href={`/customer/login?next=${encodeURIComponent(returnTo)}`}
              className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white"
            >
              {text.login}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/60 dark:bg-violet-950/25">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-100 p-2 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-violet-950 dark:text-violet-100">{text.title}</p>
            <p className="mt-0.5 text-xs font-bold text-violet-700 dark:text-violet-300">
              {text.balance}: {loading ? <Loader2 className="inline animate-spin" size={13} /> : `${balance} ${text.points}`}
            </p>
          </div>
        </div>
        <Link
          href={`/customer/rewards?sellerId=${encodeURIComponent(sellerId)}&next=${encodeURIComponent(returnTo)}`}
          className="text-xs font-black text-violet-700 underline dark:text-violet-300"
        >
          {text.history}
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {([
          ["none", text.none, Gift],
          ["discount", text.discount, TicketPercent],
          ["product", text.product, Sparkles],
        ] as const).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ mode, points: 0, productId: "" })}
            disabled={
              mode !== "none" &&
              (balance <= 0 || (mode === "product" && offerApplied))
            }
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
              selection.mode === mode
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-violet-200 bg-white text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-neutral-950 dark:text-violet-100"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {selection.mode === "discount" && (
        <div className="space-y-2 rounded-xl bg-white p-3 dark:bg-neutral-950">
          <label className="block text-xs font-black text-neutral-700 dark:text-neutral-200">
            {text.amount}
            <input
              type="number"
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
              className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-black outline-none focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-neutral-500">
            <span>0–{maximumDiscountPoints} {text.points}</span>
            <button
              type="button"
              onClick={() => onChange({ mode: "discount", points: maximumDiscountPoints, productId: "" })}
              className="rounded-lg border border-violet-200 px-3 py-1.5 font-black text-violet-700 dark:border-violet-800 dark:text-violet-300"
            >
              {text.max}
            </button>
          </div>
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
                className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 dark:border-neutral-700 dark:bg-neutral-900"
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

      <div className="rounded-xl bg-violet-100/70 px-3 py-2 text-xs font-bold text-violet-900 dark:bg-violet-950/70 dark:text-violet-100">
        {pointsToEarn > 0
          ? text.earn.replace("{points}", String(pointsToEarn))
          : text.noEarn}
      </div>
      <p className="text-[11px] font-medium text-violet-700/80 dark:text-violet-300/70">{text.rule}</p>
    </section>
  );
}
