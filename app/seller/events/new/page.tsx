"use client";

import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/app/lib/firebase";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  limit,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { useI18n } from "@/app/lib/i18n";
import { useSellerSession } from "@/app/_components/SellerSessionContext";
import PageHeader from "@/app/_components/PageHeader";
import BackLink from "@/app/_components/BackLink";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import { Gift } from "lucide-react";
import {
  formatMoneyMinor,
  majorToMinor,
} from "@/app/lib/money";
import { normalizeProductInventory } from "@/app/lib/inventory-schema";
import {
  normalizeOffer,
  offerIsCurrentlyActive,
  resolveLocalizedOfferText,
  type OfferDoc,
} from "@/app/lib/offer-schema";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

type DeliveryChoice = "none" | "delivery" | "pickup" | "both";
type ProductStatus = "active" | "inactive" | "made_to_order" | "hidden";
type EventProductMode = "normal" | "made_to_order";
type ProductSelectionMode = "excluded" | EventProductMode;

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
};

type ProductDoc = {
  id: string;
  name: string;
  price: number;
  priceMinor?: number;
  imageUrl?: string;
  image?: string;
  extraImageUrls?: string[];
  category?: string;
  status?: ProductStatus;
  stockQty?: number;
  lowStockThreshold?: number;
};

async function resolveRegionId(params: { idToken: string; sellerId: string; regionName: string }) {
  const res = await fetch("/api/region/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });

  const json = await res.json().catch(() => ({} as any));
  if (!res.ok || !json?.ok) {
    const msg = String(json?.error || "").trim();
    throw new Error(msg || `Falha ao resolver regionId. (HTTP ${res.status})`);
  }

  return {
    regionId: String(json.regionId || ""),
    reused: Boolean(json.reused),
  };
}

function isValidISODate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function normalizeStringArray(value: any): string[] {
  return Array.isArray(value)
    ? value
        .filter((v) => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function toNumberOrUndef(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) out[k] = stripUndefined(v);
    else out[k] = v;
  }
  return out;
}

function pickImageUrl(p: ProductDoc): string {
  const raw = String(p.imageUrl || p.image || "").trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
  return "";
}

function defaultEventProductMode(product?: ProductDoc): EventProductMode {
  return product?.status === "made_to_order" ? "made_to_order" : "normal";
}

function eventFulfillmentChoiceLabel(
  choice: DeliveryChoice,
  language: "pt" | "en" | "ja",
): string {
  if (choice === "none") {
    return language === "ja"
      ? "お客様に受取方法を聞かない（販売者が手配）"
      : language === "en"
        ? "Do not ask the customer (arranged by seller)"
        : "Não perguntar ao cliente (organizado pelo seller)";
  }
  if (choice === "delivery") {
    return language === "ja" ? "配達" : language === "en" ? "Delivery" : "Entrega";
  }
  if (choice === "pickup") {
    return language === "ja" ? "受取" : language === "en" ? "Pickup" : "Retirada";
  }
  return language === "ja"
    ? "配達または受取"
    : language === "en"
      ? "Delivery or pickup"
      : "Entrega ou retirada";
}

export default function CreateNewEventPage() {
  const router = useRouter();
  const { t, lang } = useI18n();

  const sellerSession = useSellerSession();
  const authUser = sellerSession.user;
  const profile = sellerSession.profile as UserDoc;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [regionName, setRegionName] = useState("");
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>("none");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ownProducts, setOwnProducts] = useState<ProductDoc[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedOwn, setSelectedOwn] = useState<Record<string, ProductSelectionMode>>({});
  const [ownOffers, setOwnOffers] = useState<OfferDoc[]>([]);
  const [selectedOfferIds, setSelectedOfferIds] = useState<Record<string, boolean>>({});
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [currency, setCurrency] = useState<SupportedCurrency>("JPY");
  const [regionalLocale, setRegionalLocale] = useState<RegionalLocale>("ja-JP");

  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const sellerId = sellerSession.sellerId;
  const role = profile?.role ?? "seller";
  const inactive = profile?.active === false;

  const money = useCallback(
    (n: number) =>
      new Intl.NumberFormat(regionalLocale, {
        style: "currency",
        currency,
        maximumFractionDigits: currency === "JPY" ? 0 : 2,
      }).format(Number(n || 0)),
    [currency, regionalLocale],
  );

  const pickedCount = useMemo(() => {
    return Object.values(selectedOwn).filter((mode) => mode !== "excluded").length;
  }, [selectedOwn]);

  const productById = useMemo(
    () => new Map(ownProducts.map((product) => [product.id, product])),
    [ownProducts],
  );

  const selectableOffers = useMemo(
    () =>
      ownOffers.filter((offer) =>
        offer.eligibleProductIds.every((productId) => productById.has(productId)),
      ),
    [ownOffers, productById],
  );

  const selectedOffers = useMemo(
    () => selectableOffers.filter((offer) => selectedOfferIds[offer.id]),
    [selectableOffers, selectedOfferIds],
  );

  const requiredProductIds = useMemo(() => {
    const ids = new Set<string>();
    selectedOffers.forEach((offer) => {
      offer.eligibleProductIds.forEach((productId) => ids.add(productId));
    });
    return ids;
  }, [selectedOffers]);

  const canSubmit = useMemo(() => {
    if (!authUser || !sellerId || inactive) return false;
    if (role !== "seller" && role !== "admin") return false;
    if (!title.trim() || !regionName.trim()) return false;
    if (startDate && !isValidISODate(startDate)) return false;
    if (endDate && !isValidISODate(endDate)) return false;
    if (startDate && endDate && endDate < startDate) return false;
    if (pickedCount <= 0) return false;
    return true;
  }, [authUser, sellerId, inactive, role, title, regionName, startDate, endDate, pickedCount]);

  useEffect(() => {
    if (!authUser || !sellerId || inactive) {
      setOwnProducts([]);
      return;
    }

    let alive = true;
    setLoadingProducts(true);

    const unsubOwn = onSnapshot(
      query(collection(db, "sellers", sellerId, "products"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => {
        const list = snap.docs
          .map((d) => {
            const data = d.data() as any;
            const inventory = normalizeProductInventory(
              data.inventory,
              data.stockQty ?? data.stock,
              data.lowStockThreshold,
            );

            return {
              id: d.id,
              name: String(data.name || ""),
              price: Number(data.sellPrice || data.price || 0),
              priceMinor: typeof data.priceMinor === "number"
                ? Math.max(0, Math.round(data.priceMinor))
                : undefined,
              imageUrl: String(data.imageUrl || data.image || ""),
              extraImageUrls: normalizeStringArray(data.extraImageUrls),
              category: String(data.category || ""),
              status: (data.status === "inactive"
                ? "inactive"
                : data.status === "hidden"
                  ? "hidden"
                  : data.status === "made_to_order"
                    ? "made_to_order"
                    : "active") as ProductStatus,
              stockQty: inventory.tracked ? inventory.available : undefined,
              lowStockThreshold: inventory.lowStockThreshold,
            };
          })
          .filter((p) => p.name && p.status !== "inactive");

        if (!alive) return;

        setOwnProducts(list);
        setLoadingProducts(false);
      },
      (err) => {
        if (!alive) return;

        setErrMsg(err?.message || t("products.err.loadOwn"));
        setLoadingProducts(false);
      }
    );

    return () => {
      alive = false;
      unsubOwn();
    };
  }, [authUser, sellerId, inactive, t]);

  useEffect(() => {
    if (!sellerId) return;

    getDoc(doc(db, "sellers", sellerId))
      .then((snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() as any;
        const nextCurrency = data?.regional?.currency;
        const nextLocale = data?.regional?.locale;
        if (nextCurrency === "BRL" || nextCurrency === "USD" || nextCurrency === "JPY") {
          setCurrency(nextCurrency);
        }
        if (nextLocale === "pt-BR" || nextLocale === "en-US" || nextLocale === "ja-JP") {
          setRegionalLocale(nextLocale);
        }
      })
      .catch(() => undefined);
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId || inactive) {
      setOwnOffers([]);
      return;
    }

    setLoadingOffers(true);
    return onSnapshot(
      query(collection(db, "sellers", sellerId, "offers"), orderBy("createdAt", "desc"), limit(200)),
      (snapshot) => {
        const list = snapshot.docs
          .map((document) => normalizeOffer(document.id, document.data(), currency))
          .filter((offer): offer is OfferDoc => offer !== null && offerIsCurrentlyActive(offer));
        setOwnOffers(list);
        setLoadingOffers(false);
      },
      (error) => {
        console.error("[CreateEvent] offers:", error);
        setOwnOffers([]);
        setLoadingOffers(false);
      },
    );
  }, [currency, inactive, sellerId]);

  const toggleOffer = (offer: OfferDoc) => {
    const selecting = !selectedOfferIds[offer.id];
    setSelectedOfferIds((current) => ({ ...current, [offer.id]: selecting }));

    if (selecting) {
      setSelectedOwn((current) => {
        const next = { ...current };
        offer.eligibleProductIds.forEach((productId) => {
          const product = productById.get(productId);
          if (!product) return;
          if (!next[productId] || next[productId] === "excluded") {
            next[productId] = defaultEventProductMode(product);
          }
        });
        return next;
      });
    }
  };

  const setOwnMode = (id: string, mode: ProductSelectionMode) => {
    if (mode === "excluded" && requiredProductIds.has(id)) return;

    setSelectedOwn((current) => ({
      ...current,
      [id]: mode,
    }));
  };

  const selectAllOwn = () => {
    const next: Record<string, ProductSelectionMode> = {};
    ownProducts.forEach((product) => {
      next[product.id] = defaultEventProductMode(product);
    });
    setSelectedOwn(next);
  };

  const clearOwn = () => {
    const next: Record<string, ProductSelectionMode> = {};
    requiredProductIds.forEach((productId) => {
      next[productId] = defaultEventProductMode(productById.get(productId));
    });
    setSelectedOwn(next);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (loading || !canSubmit || !authUser) return;

    setLoading(true);
    setErrMsg("");
    setOkMsg("");

    try {
      const regionTrim = regionName.trim();
      const titleTrim = title.trim();

      if (startDate && !isValidISODate(startDate)) {
        throw new Error(t("events.create.error.invalidStartDate") || "Data inicial inválida.");
      }

      if (endDate && !isValidISODate(endDate)) {
        throw new Error(t("events.create.error.invalidEndDate") || "Data final inválida.");
      }

      if (startDate && endDate && endDate < startDate) {
        throw new Error(t("events.create.form.dateError"));
      }

      const idToken = await authUser.getIdToken();
      const { regionId } = await resolveRegionId({
        idToken,
        sellerId,
        regionName: regionTrim,
      });

      if (!regionId) {
        throw new Error(t("events.create.error.regionIdMissing") || "ID de região ausente.");
      }

      const allowDelivery = deliveryChoice === "delivery" || deliveryChoice === "both";
      const allowPickup = deliveryChoice === "pickup" || deliveryChoice === "both";

      const pickedOwnIds = Object.entries(selectedOwn)
        .filter(([, mode]) => mode !== "excluded")
        .map(([productId]) => productId);
      const productAvailabilityModes = Object.fromEntries(
        pickedOwnIds.map((productId) => [
          productId,
          selectedOwn[productId] === "made_to_order" ? "made_to_order" : "normal",
        ]),
      ) as Record<string, EventProductMode>;

      const eventPayload: any = {
        sellerId,
        regionId,
        regionName: regionTrim,
        title: titleTrim,
        description: description.trim(),
        status: "active",
        allowDelivery,
        allowPickup,
        name: titleTrim,
        isActive: true,
        productIds: pickedOwnIds,
        productAvailabilityModes,
        offerIds: selectedOffers.map((offer) => offer.id),
        currency,
        regionalLocale,
        defaultLanguage: lang === "en" || lang === "ja" ? lang : "pt",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (startDate) eventPayload.startDate = startDate;
      if (endDate) eventPayload.endDate = endDate;

      const eventRef = await addDoc(collection(db, "sellers", sellerId, "events"), eventPayload);

      const batch = writeBatch(db);
      const ownById = new Map(ownProducts.map((p) => [p.id, p]));

      for (const pid of pickedOwnIds) {
        const p = ownById.get(pid);
        if (!p) continue;

        const availabilityMode = productAvailabilityModes[pid] ?? defaultEventProductMode(p);
        const base = {
          source: "own",
          productId: pid,
          enabled: true,
          name: p.name,
          price: Number(p.price || 0),
          priceMinor: p.priceMinor ?? majorToMinor(Number(p.price || 0), currency),
          currency,
          imageUrl: pickImageUrl(p),
          extraImageUrls: normalizeStringArray(p.extraImageUrls),
          category: String(p.category || ""),
          status: "active",
          sourceProductStatus: p.status ?? "active",
          availabilityMode,
          availabilityStatus: availabilityMode === "made_to_order" ? "made_to_order" : "active",
          productionMode: availabilityMode === "made_to_order" ? "made_to_order" : "stock",
          stockQty: toNumberOrUndef(p.stockQty),
          lowStockThreshold: toNumberOrUndef(p.lowStockThreshold),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        batch.set(doc(db, "sellers", sellerId, "events", eventRef.id, "items", pid), stripUndefined(base));
      }

      for (const offer of selectedOffers) {
        batch.set(
          doc(db, "sellers", sellerId, "events", eventRef.id, "offers", offer.id),
          {
            schemaVersion: 2,
            sourceOfferId: offer.id,
            content: offer.content,
            status: "active",
            eligibleProductIds: offer.eligibleProductIds,
            requiredQuantity: offer.requiredQuantity,
            pricing: offer.pricing,
            startsAt: offer.startsAt ?? null,
            endsAt: offer.endsAt ?? null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: authUser.uid,
            updatedBy: authUser.uid,
          },
        );
      }

      await batch.commit();

      router.push(`/seller/events/${eventRef.id}`);
    } catch (e: any) {
      setErrMsg(e?.message || t("events.create.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  if (inactive || !sellerId || (role !== "seller" && role !== "admin")) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">
            {t("events.create.guard.notConfigured.title")}
          </h1>

          <p className="text-xs font-bold text-red-500 bg-red-50/50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200/40">
            {inactive
              ? t("events.create.guard.notConfigured.inactive")
              : t("events.create.guard.notConfigured.incomplete")}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl space-y-6 bg-white p-4 text-neutral-950 transition-colors dark:bg-neutral-950 dark:text-white sm:p-6">
      <PageHeader
        eyebrow={t("events.title")}
        title={t("events.create.title")}
        back={<BackLink href="/seller/events" label={t("events.create.back")} />}
      />

      {(errMsg || okMsg) && (
        <FeedbackBanner tone={errMsg ? "error" : "success"} role={errMsg ? "alert" : "status"}>
          {errMsg || okMsg}
        </FeedbackBanner>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-6"
      >
        <div className="space-y-1.5">
          <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
            {t("events.create.form.region.label")} *
          </label>

          <input
            type="text"
            value={regionName}
            onChange={(e) => setRegionName(e.target.value)}
            required
            className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
            placeholder={t("events.create.form.region.placeholder")}
          />

          <p className="text-[10px] font-bold text-neutral-400">
            {t("events.create.form.region.hint")}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
            {t("events.create.form.title.label")} *
          </label>

          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition"
            placeholder={t("events.create.form.title.placeholder")}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
            {t("events.create.form.description.label")}
          </label>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition resize-none"
            placeholder={t("events.create.form.description.placeholder")}
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
            {lang === "ja"
              ? "お客様に表示する受取方法"
              : lang === "en"
                ? "Fulfillment details shown to the customer"
                : "Dados de entrega mostrados ao cliente"}
          </label>

          <p className="text-[11px] font-bold leading-relaxed text-neutral-500 dark:text-neutral-400">
            {lang === "ja"
              ? "販売者が受取場所や配達をすでに決めている場合は、最初の選択肢を使用するとチェックアウトが簡潔になります。"
              : lang === "en"
                ? "When the seller already knows where the order will be delivered, choose the first option to keep checkout clean."
                : "Quando o seller já sabe onde levará os pedidos, escolha a primeira opção para não exibir entrega, data e hora no checkout."}
          </p>

          <div className="grid gap-2 bg-white p-4 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl sm:grid-cols-2">
            {(["none", "delivery", "pickup", "both"] as const).map((choice) => (
              <label
                key={choice}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-xs font-bold transition ${
                  deliveryChoice === choice
                    ? "border-black bg-neutral-50 text-neutral-950 dark:border-white dark:bg-neutral-800 dark:text-white"
                    : "border-neutral-200 text-neutral-600 dark:border-neutral-800 dark:text-neutral-300"
                }`}
              >
                <input
                  type="radio"
                  name="deliveryChoice"
                  value={choice}
                  checked={deliveryChoice === choice}
                  onChange={() => setDeliveryChoice(choice)}
                  className="mt-0.5 accent-black dark:accent-white"
                />
                <span>{eventFulfillmentChoiceLabel(choice, lang === "en" || lang === "ja" ? lang : "pt")}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              {t("events.create.form.startDate")}
            </label>

            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none h-[46px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-black text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              {t("events.create.form.endDate")}
            </label>

            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none h-[46px]"
            />
          </div>
        </div>

        {startDate && endDate && endDate < startDate && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 text-xs font-bold text-red-500">
            {t("events.create.form.dateError")}
          </div>
        )}

        <div className="space-y-4 border-t border-neutral-200 dark:border-neutral-800 pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-black text-neutral-900 dark:text-white tracking-tight">
                {t("eventPanel.products.title")}
              </h3>

              <p className="text-[11px] font-bold text-neutral-400">
                {t("eventPanel.products.hint")}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={selectAllOwn}
                className="text-xs font-black underline text-neutral-900 dark:text-white"
              >
                {t("events.create.products.selectAll")}
              </button>

              <button
                type="button"
                onClick={clearOwn}
                className="text-xs font-black underline text-neutral-400 dark:text-neutral-500"
              >
                {t("common.clear")}
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-3xl border border-orange-200 bg-orange-50/40 p-4 dark:border-orange-900/40 dark:bg-orange-950/10">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-orange-500" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">
                  {lang === "ja" ? "オファーとセット" : lang === "en" ? "Offers and kits" : "Ofertas e kits"}
                </h4>
                <p className="mt-1 text-[11px] font-bold text-neutral-500 dark:text-neutral-400">
                  {lang === "ja"
                    ? "選択すると対象商品もイベントに追加されます。"
                    : lang === "en"
                      ? "Selecting an offer automatically includes its eligible products."
                      : "Ao selecionar uma oferta, os produtos participantes entram automaticamente no evento."}
                </p>
              </div>
            </div>

            {loadingOffers ? (
              <p className="py-3 text-center text-xs font-bold text-neutral-400">{t("products.updating")}</p>
            ) : selectableOffers.length === 0 ? (
              <p className="py-3 text-center text-xs font-bold text-neutral-400">
                {lang === "ja" ? "利用可能なオファーはありません。" : lang === "en" ? "No eligible offers found." : "Nenhuma oferta disponível para estes produtos."}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectableOffers.map((offer) => {
                  const checked = Boolean(selectedOfferIds[offer.id]);
                  const localized = resolveLocalizedOfferText(
                    offer.content,
                    lang === "en" || lang === "ja" ? lang : "pt",
                    lang === "en" || lang === "ja" ? lang : "pt",
                  );
                  const priceLabel =
                    offer.pricing.mode === "fixed_total"
                      ? `${formatMoneyMinor(offer.pricing.regularTotalMinor ?? 0, currency, regionalLocale)} → ${formatMoneyMinor(offer.pricing.promotionalTotalMinor ?? 0, currency, regionalLocale)}`
                      : offer.pricing.mode === "fixed_discount"
                        ? `- ${formatMoneyMinor(offer.pricing.discountMinor ?? 0, currency, regionalLocale)}`
                        : `${offer.pricing.percentage ?? 0}%`;

                  return (
                    <label
                      key={offer.id}
                      className={`cursor-pointer rounded-2xl border p-4 transition ${checked ? "border-orange-500 bg-white ring-2 ring-orange-500/20 dark:bg-neutral-900" : "border-orange-200 bg-white/70 dark:border-orange-900/40 dark:bg-neutral-900/60"}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOffer(offer)}
                          className="mt-1 h-4 w-4 accent-orange-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-neutral-900 dark:text-white">{localized.name}</p>
                          <p className="mt-1 text-xs font-black text-orange-600 dark:text-orange-300">{priceLabel}</p>
                          <p className="mt-2 text-[10px] font-bold text-neutral-400">
                            {lang === "ja" ? "必要数" : lang === "en" ? "Required quantity" : "Quantidade necessária"}: {offer.requiredQuantity}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {loadingProducts ? (
            <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">
              {t("products.updating")}
            </p>
          ) : ownProducts.length === 0 ? (
            <p className="text-xs font-bold text-neutral-400 italic py-4 text-center">
              {t("eventPanel.products.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[460px] overflow-y-auto pr-1 scrollbar-none">
              {ownProducts.map((p) => {
                const img = pickImageUrl(p);
                const mode = selectedOwn[p.id] ?? "excluded";
                const selected = mode !== "excluded";
                const required = requiredProductIds.has(p.id);
                const labels = lang === "ja"
                  ? { excluded: "含めない", normal: "通常販売", madeToOrder: "予約のみ" }
                  : lang === "en"
                    ? { excluded: "Do not include", normal: "Regular sale", madeToOrder: "Made to order" }
                    : { excluded: "Não incluir", normal: "Venda normal", madeToOrder: "Somente encomenda" };

                return (
                  <div
                    key={p.id}
                    className={`group border rounded-2xl p-3 transition-all flex flex-col justify-between min-h-[245px] relative ${
                      selected
                        ? mode === "made_to_order"
                          ? "border-violet-500 bg-white dark:bg-neutral-900 shadow-md ring-2 ring-violet-500/30"
                          : "border-black bg-white dark:border-white dark:bg-neutral-900 shadow-md ring-2 ring-black dark:ring-white"
                        : "border-neutral-200 bg-white dark:border-neutral-800/40 dark:bg-neutral-900"
                    }`}
                  >
                    <div className="flex items-center justify-between z-10">
                      <span className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full uppercase ${
                        mode === "made_to_order"
                          ? "bg-violet-600 text-white"
                          : selected
                            ? "bg-black text-white dark:bg-white dark:text-black"
                            : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                      }`}>
                        {mode === "made_to_order" ? labels.madeToOrder : selected ? labels.normal : labels.excluded}
                      </span>
                    </div>

                    <div className="absolute inset-x-3 top-10 h-[100px] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200/10">
                      {img ? (
                        <img
                          src={img}
                          alt={p.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-[9px] font-black text-neutral-400 uppercase">
                          {t("eventPanel.products.noImage")}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-[112px]">
                      <div>
                        <p className="text-xs font-black text-neutral-900 dark:text-white truncate tracking-tight">{p.name}</p>
                        <p className="text-[10px] font-bold text-neutral-400 truncate">
                          {money(p.price)} {p.category ? `• ${p.category}` : ""}
                        </p>
                        {required && (
                          <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-orange-500">
                            {lang === "ja" ? "セット必須" : lang === "en" ? "Required by kit" : "Obrigatório pelo kit"}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <button
                          type="button"
                          onClick={() => setOwnMode(p.id, "excluded")}
                          disabled={required}
                          className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition disabled:cursor-not-allowed disabled:opacity-30 ${mode === "excluded" ? "bg-neutral-800 text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                        >
                          {labels.excluded}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOwnMode(p.id, "normal")}
                          className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition ${mode === "normal" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"}`}
                        >
                          {labels.normal}
                        </button>
                        <button
                          type="button"
                          onClick={() => setOwnMode(p.id, "made_to_order")}
                          className={`min-h-9 rounded-lg px-1 text-[9px] font-black transition ${mode === "made_to_order" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300"}`}
                        >
                          {labels.madeToOrder}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
          {pickedCount <= 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs font-bold text-amber-700 dark:border-amber-900/30 dark:text-amber-400">
              {t("errors.select_one_item")}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className="w-full rounded-2xl bg-black dark:bg-white text-white dark:text-black py-4 font-black text-sm uppercase tracking-wider shadow-xl transition-all hover:opacity-90 disabled:opacity-40"
          >
            {loading ? t("events.create.submitting") : t("events.create.submit")}
          </button>
        </div>
      </form>
    </main>
  );
}