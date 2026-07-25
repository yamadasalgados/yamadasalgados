"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Edit3,
  Gift,
  Plus,
  Power,
  Search,
  Trash2,
} from "lucide-react";

import {
  db,
} from "@/app/lib/firebase";
import {
  formatMoneyMinor,
} from "@/app/lib/money";
import {
  firestoreValueToDate,
  normalizeOffer,
  offerPricingSummaryMajor,
  resolveLocalizedOfferText,
  type OfferDoc,
  type OfferLanguage,
} from "@/app/lib/offer-schema";
import {
  normalizeProductPriceMinor,
  resolveLocalizedProductText,
} from "@/app/lib/product-schema";
import {
  useI18n,
} from "@/app/lib/i18n";
import {
  useSellerSession,
} from "@/app/_components/SellerSessionContext";
import PageHeader from "@/app/_components/PageHeader";
import FeedbackBanner from "@/app/_components/FeedbackBanner";
import type {
  RegionalLocale,
  SupportedCurrency,
} from "@/app/types/regional";

import OfferModal, {
  type OfferSaveResult,
} from "./OfferModal";
import type {
  OfferProductOption,
} from "./OfferForm";

type SellerProfile = {
  storeName: string;
  currency: SupportedCurrency;
  locale: RegionalLocale;
  defaultLanguage: OfferLanguage;
};

function asRecord(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
}

function asText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSellerProfile(
  value: unknown,
): SellerProfile {
  const raw = asRecord(value);
  const regional = asRecord(
    raw.regional,
  );
  const country =
    regional.operatingCountry;
  const currency: SupportedCurrency =
    regional.currency === "BRL" ||
    regional.currency === "USD"
      ? regional.currency
      : "JPY";
  const locale: RegionalLocale =
    regional.locale === "pt-BR" ||
    regional.locale === "en-US" ||
    regional.locale === "ja-JP"
      ? regional.locale
      : currency === "BRL"
        ? "pt-BR"
        : currency === "USD"
          ? "en-US"
          : "ja-JP";
  const language: OfferLanguage =
    raw.storefrontLanguage === "en" ||
    raw.storefrontLanguage === "ja"
      ? raw.storefrontLanguage
      : country === "US"
        ? "en"
        : country === "JP"
          ? "ja"
          : "pt";

  return {
    storeName:
      asText(raw.storeName) ||
      "Store",
    currency,
    locale,
    defaultLanguage: language,
  };
}

function formatDate(
  value: unknown,
  locale: string,
): string {
  const date =
    firestoreValueToDate(value);

  return date
    ? new Intl.DateTimeFormat(
        locale,
        {
          dateStyle: "medium",
          timeStyle: "short",
        },
      ).format(date)
    : "—";
}

export default function SellerOffersPage() {
  const { lang } = useI18n();
  const language: OfferLanguage =
    lang === "en" || lang === "ja"
      ? lang
      : "pt";

  const copy = useMemo(
    () =>
      language === "ja"
        ? {
            title: "オファーとセット",
            subtitle: "組み合わせ自由のプロモーション、セット、割引を管理します。",
            add: "オファーを追加",
            loading: "読み込み中...",
            search: "オファーを検索",
            all: "すべて",
            active: "有効",
            inactive: "無効",
            empty: "オファーはまだありません。",
            emptyFiltered: "条件に一致するオファーはありません。",
            products: "対象商品",
            required: "必要数量",
            edit: "編集",
            activate: "有効化",
            deactivate: "無効化",
            delete: "削除",
            deleteConfirm: "このオファーを削除しますか？",
            created: "オファーを作成しました。",
            updated: "オファーを更新しました。",
            activated: "オファーを有効にしました。",
            deactivated: "オファーを無効にしました。",
            deleted: "オファーを削除しました。",
            error: "操作を完了できませんでした。",
            fixedTotal: "固定セット価格",
            fixedDiscount: "固定割引",
            percentageDiscount: "パーセント割引",
            period: "期間",
            always: "期間制限なし",
          }
        : language === "en"
          ? {
              title: "Offers and kits",
              subtitle: "Manage flexible promotions, kits, and discounts.",
              add: "Add offer",
              loading: "Loading...",
              search: "Search offers",
              all: "All",
              active: "Active",
              inactive: "Inactive",
              empty: "No offers have been created yet.",
              emptyFiltered: "No offers match the selected filters.",
              products: "Eligible products",
              required: "Required quantity",
              edit: "Edit",
              activate: "Activate",
              deactivate: "Deactivate",
              delete: "Delete",
              deleteConfirm: "Delete this offer?",
              created: "Offer created.",
              updated: "Offer updated.",
              activated: "Offer activated.",
              deactivated: "Offer deactivated.",
              deleted: "Offer deleted.",
              error: "The action could not be completed.",
              fixedTotal: "Fixed bundle total",
              fixedDiscount: "Fixed discount",
              percentageDiscount: "Percentage discount",
              period: "Period",
              always: "No date restriction",
            }
          : {
              title: "Ofertas e kits",
              subtitle: "Gerencie promoções flexíveis, kits e descontos da loja.",
              add: "Adicionar oferta",
              loading: "Carregando...",
              search: "Buscar ofertas",
              all: "Todas",
              active: "Ativas",
              inactive: "Inativas",
              empty: "Nenhuma oferta foi criada ainda.",
              emptyFiltered: "Nenhuma oferta corresponde aos filtros.",
              products: "Produtos participantes",
              required: "Quantidade obrigatória",
              edit: "Editar",
              activate: "Ativar",
              deactivate: "Desativar",
              delete: "Excluir",
              deleteConfirm: "Excluir esta oferta?",
              created: "Oferta criada.",
              updated: "Oferta atualizada.",
              activated: "Oferta ativada.",
              deactivated: "Oferta desativada.",
              deleted: "Oferta excluída.",
              error: "Não foi possível concluir a operação.",
              fixedTotal: "Preço total fixo",
              fixedDiscount: "Desconto fixo",
              percentageDiscount: "Desconto percentual",
              period: "Período",
              always: "Sem restrição de período",
            },
    [language],
  );

  const sellerSession = useSellerSession();
  const authUser = sellerSession.user as User;
  const sellerId = sellerSession.sellerId;

  const [profile, setProfile] =
    useState<SellerProfile>(() =>
      normalizeSellerProfile({}),
    );
  const [products, setProducts] =
    useState<OfferProductOption[]>([]);
  const [offers, setOffers] =
    useState<OfferDoc[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [toast, setToast] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | "active" | "inactive">(
      "all",
    );
  const [modalOpen, setModalOpen] =
    useState(false);
  const [selectedOffer, setSelectedOffer] =
    useState<OfferDoc | null>(null);

  useEffect(() => {
    if (!sellerId) return;

    let sellerReady = false;
    let productsReady = false;
    let offersReady = false;

    const finish = () => {
      if (
        sellerReady &&
        productsReady &&
        offersReady
      ) {
        setLoading(false);
      }
    };

    setLoading(true);
    setError("");

    const unsubscribeSeller =
      onSnapshot(
        doc(db, "sellers", sellerId),
        (snapshot) => {
          sellerReady = true;

          if (snapshot.exists()) {
            setProfile(
              normalizeSellerProfile(
                snapshot.data(),
              ),
            );
          }

          finish();
        },
        (snapshotError) => {
          console.error(
            "[SellerOffers] seller:",
            snapshotError,
          );
          sellerReady = true;
          setError(copy.error);
          finish();
        },
      );

    const unsubscribeProducts =
      onSnapshot(
        collection(
          db,
          "sellers",
          sellerId,
          "products",
        ),
        (snapshot) => {
          productsReady = true;

          const nextProducts =
            snapshot.docs
              .map((productSnapshot) => {
                const raw =
                  productSnapshot.data();
                const localized =
                  resolveLocalizedProductText(
                    raw.content,
                    language,
                    profile.defaultLanguage,
                    asText(raw.name),
                    asText(raw.description),
                  );

                return {
                  id: productSnapshot.id,
                  name:
                    localized.name ||
                    productSnapshot.id,
                  priceMinor:
                    normalizeProductPriceMinor(
                      raw,
                      profile.currency,
                    ),
                  imageUrl:
                    asText(raw.imageUrl),
                  active:
                    raw.status !== "inactive" &&
                    raw.active !== false,
                } satisfies OfferProductOption;
              })
              .sort((left, right) =>
                left.name.localeCompare(
                  right.name,
                  profile.locale,
                ),
              );

          setProducts(nextProducts);
          finish();
        },
        (snapshotError) => {
          console.error(
            "[SellerOffers] products:",
            snapshotError,
          );
          productsReady = true;
          setError(copy.error);
          finish();
        },
      );

    const unsubscribeOffers =
      onSnapshot(
        collection(
          db,
          "sellers",
          sellerId,
          "offers",
        ),
        (snapshot) => {
          offersReady = true;

          const nextOffers =
            snapshot.docs
              .map((offerSnapshot) =>
                normalizeOffer(
                  offerSnapshot.id,
                  offerSnapshot.data(),
                  profile.currency,
                ),
              )
              .filter(
                (
                  offer,
                ): offer is OfferDoc =>
                  offer !== null,
              )
              .sort((left, right) => {
                const rightDate =
                  firestoreValueToDate(
                    right.updatedAt,
                  )?.getTime() ?? 0;
                const leftDate =
                  firestoreValueToDate(
                    left.updatedAt,
                  )?.getTime() ?? 0;

                return rightDate - leftDate;
              });

          setOffers(nextOffers);
          finish();
        },
        (snapshotError) => {
          console.error(
            "[SellerOffers] offers:",
            snapshotError,
          );
          offersReady = true;
          setError(copy.error);
          finish();
        },
      );

    return () => {
      unsubscribeSeller();
      unsubscribeProducts();
      unsubscribeOffers();
    };
  }, [
    copy.error,
    language,
    profile.currency,
    profile.defaultLanguage,
    profile.locale,
    sellerId,
  ]);

  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(
      () => setToast(""),
      2600,
    );

    return () =>
      window.clearTimeout(timer);
  }, [toast]);

  const filteredOffers = useMemo(() => {
    const normalizedSearch =
      search
        .trim()
        .toLocaleLowerCase(
          profile.locale,
        );

    return offers.filter((offer) => {
      if (
        statusFilter !== "all" &&
        offer.status !== statusFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const localized =
        resolveLocalizedOfferText(
          offer.content,
          language,
          profile.defaultLanguage,
        );

      return [
        localized.name,
        localized.description,
      ]
        .join(" ")
        .toLocaleLowerCase(
          profile.locale,
        )
        .includes(normalizedSearch);
    });
  }, [
    language,
    offers,
    profile.defaultLanguage,
    profile.locale,
    search,
    statusFilter,
  ]);

  const applySave = useCallback(
    (result: OfferSaveResult) => {
      setOffers((current) => {
        const without = current.filter(
          (offer) =>
            offer.id !== result.offer.id,
        );

        return [
          result.offer,
          ...without,
        ];
      });
      setToast(
        result.mode === "created"
          ? copy.created
          : copy.updated,
      );
    },
    [copy.created, copy.updated],
  );

  const toggleStatus = useCallback(
    async (offer: OfferDoc) => {
      if (!authUser || !sellerId) return;

      const nextStatus =
        offer.status === "active"
          ? "inactive"
          : "active";

      try {
        await updateDoc(
          doc(
            db,
            "sellers",
            sellerId,
            "offers",
            offer.id,
          ),
          {
            status: nextStatus,
            updatedAt:
              serverTimestamp(),
            updatedBy: authUser.uid,
          },
        );

        setToast(
          nextStatus === "active"
            ? copy.activated
            : copy.deactivated,
        );
      } catch (actionError) {
        console.error(
          "[SellerOffers] toggle:",
          actionError,
        );
        setError(copy.error);
      }
    },
    [
      authUser,
      copy.activated,
      copy.deactivated,
      copy.error,
      sellerId,
    ],
  );

  const removeOffer = useCallback(
    async (offer: OfferDoc) => {
      if (
        !sellerId ||
        !window.confirm(
          copy.deleteConfirm,
        )
      ) {
        return;
      }

      try {
        await deleteDoc(
          doc(
            db,
            "sellers",
            sellerId,
            "offers",
            offer.id,
          ),
        );
        setToast(copy.deleted);
      } catch (actionError) {
        console.error(
          "[SellerOffers] delete:",
          actionError,
        );
        setError(copy.error);
      }
    },
    [
      copy.deleteConfirm,
      copy.deleted,
      copy.error,
      sellerId,
    ],
  );

  if (
    loading ||
    !sellerId
  ) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-6xl items-center justify-center px-4">
        <p className="text-sm font-bold text-neutral-500">
          {copy.loading}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <PageHeader
        eyebrow={copy.title}
        title={copy.title}
        description={copy.subtitle}
        action={
          <button
            type="button"
            onClick={() => {
              setSelectedOffer(null);
              setModalOpen(true);
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-black px-5 text-sm font-black text-white dark:bg-white dark:text-black"
          >
            <Plus size={18} />
            {copy.add}
          </button>
        }
      />

      {error && <FeedbackBanner tone="error" role="alert">{error}</FeedbackBanner>}

      <section className="grid gap-3 rounded-3xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-neutral-300 bg-neutral-50 px-3 dark:border-neutral-700 dark:bg-neutral-950">
          <Search
            size={18}
            className="text-neutral-400"
          />
          <input
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder={copy.search}
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>

        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(
              event.target.value as
                typeof statusFilter,
            )
          }
          className="min-h-12 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-black dark:border-neutral-700 dark:bg-neutral-950"
        >
          <option value="all">
            {copy.all}
          </option>
          <option value="active">
            {copy.active}
          </option>
          <option value="inactive">
            {copy.inactive}
          </option>
        </select>
      </section>

      {offers.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <Gift
            size={42}
            className="mx-auto text-orange-500"
          />
          <p className="mt-4 text-sm font-bold text-neutral-500">
            {copy.empty}
          </p>
        </section>
      ) : filteredOffers.length === 0 ? (
        <section className="rounded-3xl border border-neutral-200 bg-white p-8 text-center text-sm font-bold text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">
          {copy.emptyFiltered}
        </section>
      ) : (
        <section className="grid gap-5 lg:grid-cols-2">
          {filteredOffers.map((offer) => {
            const localized =
              resolveLocalizedOfferText(
                offer.content,
                language,
                profile.defaultLanguage,
              );
            const pricing =
              offerPricingSummaryMajor(
                offer,
                profile.currency,
              );
            const modeLabel =
              offer.pricing.mode ===
              "fixed_discount"
                ? copy.fixedDiscount
                : offer.pricing.mode ===
                    "percentage_discount"
                  ? copy.percentageDiscount
                  : copy.fixedTotal;
            const pricingLabel =
              offer.pricing.mode ===
              "fixed_total"
                ? `${formatMoneyMinor(
                    offer.pricing
                      .regularTotalMinor ?? 0,
                    profile.currency,
                    profile.locale,
                  )} → ${formatMoneyMinor(
                    offer.pricing
                      .promotionalTotalMinor ?? 0,
                    profile.currency,
                    profile.locale,
                  )}`
                : offer.pricing.mode ===
                    "fixed_discount"
                  ? `- ${formatMoneyMinor(
                      offer.pricing
                        .discountMinor ?? 0,
                      profile.currency,
                      profile.locale,
                    )}`
                  : `${pricing.percentage ?? 0}%`;
            const period =
              offer.startsAt ||
              offer.endsAt
                ? `${formatDate(
                    offer.startsAt,
                    profile.locale,
                  )} — ${formatDate(
                    offer.endsAt,
                    profile.locale,
                  )}`
                : copy.always;

            return (
              <article
                key={offer.id}
                className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={[
                            "rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider",
                            offer.status ===
                            "active"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
                          ].join(" ")}
                        >
                          {offer.status ===
                          "active"
                            ? copy.active
                            : copy.inactive}
                        </span>
                        <span className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
                          {modeLabel}
                        </span>
                      </div>

                      <h2 className="mt-3 break-words text-xl font-black">
                        {localized.name}
                      </h2>

                      {localized.description && (
                        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                          {localized.description}
                        </p>
                      )}
                    </div>

                    <Gift
                      size={26}
                      className="shrink-0 text-orange-500"
                    />
                  </div>

                  <div className="mt-5 grid gap-3 rounded-2xl bg-neutral-50 p-4 text-sm dark:bg-neutral-950/50 sm:grid-cols-2">
                    <Info
                      label={copy.products}
                      value={String(
                        offer
                          .eligibleProductIds
                          .length,
                      )}
                    />
                    <Info
                      label={copy.required}
                      value={String(
                        offer.requiredQuantity,
                      )}
                    />
                    <Info
                      label={modeLabel}
                      value={pricingLabel}
                    />
                    <Info
                      label={copy.period}
                      value={period}
                    />
                  </div>
                </div>

                <footer className="flex flex-wrap gap-2 border-t border-neutral-200 p-4 dark:border-neutral-800">
                  <ActionButton
                    onClick={() => {
                      setSelectedOffer(offer);
                      setModalOpen(true);
                    }}
                  >
                    <Edit3 size={16} />
                    {copy.edit}
                  </ActionButton>

                  <ActionButton
                    secondary
                    onClick={() =>
                      void toggleStatus(offer)
                    }
                  >
                    <Power size={16} />
                    {offer.status === "active"
                      ? copy.deactivate
                      : copy.activate}
                  </ActionButton>

                  <ActionButton
                    danger
                    onClick={() =>
                      void removeOffer(offer)
                    }
                  >
                    <Trash2 size={16} />
                    {copy.delete}
                  </ActionButton>
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-[120] -translate-x-1/2 rounded-2xl bg-neutral-950 px-5 py-3 text-sm font-black text-white shadow-xl dark:bg-white dark:text-neutral-950"
        >
          {toast}
        </div>
      )}

      <OfferModal
        open={modalOpen}
        offer={selectedOffer}
        authUser={authUser}
        sellerId={sellerId}
        products={products}
        currency={profile.currency}
        locale={profile.locale}
        lang={language}
        onClose={() => {
          setModalOpen(false);
          setSelectedOffer(null);
        }}
        onSaved={applySave}
      />
    </main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <p className="mt-1 break-words font-black">
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  secondary = false,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
  danger?: boolean;
}) {
  const style = danger
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300"
    : secondary
      ? "border-neutral-300 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white"
      : "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${style}`}
    >
      {children}
    </button>
  );
}
