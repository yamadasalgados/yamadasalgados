"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { db } from "@/app/lib/firebase";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

import PushSubscribeBanner from "@/app/_components/PushSubscribeBanner";
import OpenInBrowserGate from "@/app/_components/OpenInBrowserGate";
import { PublicStoreNav } from "@/app/_components/RoleNavigation";
import { useI18n } from "@/app/lib/i18n";
import {
  normalizeSellerRegionalProfile,
} from "@/app/lib/seller-regional-profile";
import {
  fetchPublicSellerProfile,
} from "@/app/lib/public-seller-client";
import type {
  OperatingCountry,
} from "@/app/types/regional";

type EventStatus = "active" | "closed" | "cancelled";

type FireEvent = {
  title?: string;
  name?: string;
  region?: string;
  regionName?: string;
  sellerId?: string;
  regionId?: string;
  status?: EventStatus | string;
  createdAt?: Timestamp;
  startDate?: string;
};

type SellerProfile = {
  storeName?: string;
  displayName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
  available?: boolean;
  regional?: unknown;
};

function fmtDateShort(
  ts: Timestamp | undefined,
  locale: string,
  timeZone: string,
) {
  if (!ts) return "";
  const d = ts.toDate();

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
}

function normalizePhoneToWhatsappLink(
  raw: string,
  country: OperatingCountry | null,
) {
  const source = String(raw || "").trim();
  if (!source) return "";

  const hadInternationalPrefix =
    source.startsWith("+");
  let digits = source.replace(/[^\d]/g, "");

  if (!hadInternationalPrefix) {
    const countryCode =
      country === "BR"
        ? "55"
        : country === "US"
          ? "1"
          : "81";

    if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }

    if (!digits.startsWith(countryCode)) {
      digits = `${countryCode}${digits}`;
    }
  }

  return digits
    ? `https://wa.me/${digits}`
    : "";
}

function uniqByEventId(list: Array<{ id: string; data: FireEvent }>) {
  const map = new Map<string, { id: string; data: FireEvent }>();

  for (const item of list) {
    if (!map.has(item.id)) {
      map.set(item.id, item);
    }
  }

  return Array.from(map.values());
}

export default function ClientRegionPage() {
  const { t, lang } = useI18n();
  const language = lang === "en" || lang === "ja" ? lang : "pt";

  const tr = (key: string, fallback: string) => {
    try {
      const v = t(key as any);
      return !v || v === key ? fallback : v;
    } catch {
      return fallback;
    }
  };

  const params = useParams() as { sellerId?: string; regionId?: string };
  const sellerId = String(params?.sellerId || "").trim();
  const regionId = String(params?.regionId || "").trim();

  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; data: FireEvent }>>([]);

  const regional = useMemo(
    () =>
      normalizeSellerRegionalProfile(
        seller,
        { fallbackSellerId: sellerId },
      ),
    [seller, sellerId],
  );

  const sellerAvailable =
    useMemo(
      () => seller?.available === true,
      [seller],
    );

  const canLoad = useMemo(() => !!sellerId && !!regionId, [sellerId, regionId]);

  useEffect(() => {
    if (!canLoad) return;

    let alive = true;

    const fetchSeller = async () => {
      try {
        const profile =
          await fetchPublicSellerProfile(
            sellerId,
          );

        if (!alive) return;

        setSeller(profile as SellerProfile);
      } catch (error) {
        console.warn(
          "[ClientRegionPage] Seller read failed:",
          error,
        );

        if (alive) {
          setSeller(null);
        }
      }
    };

    void fetchSeller();

    return () => {
      alive = false;
    };
  }, [canLoad, sellerId]);

  useEffect(() => {
    if (!canLoad) return;

    let alive = true;

    const fetchData = async () => {
      setLoading(true);
      setErrMsg("");

      try {
        let snapshot;

        try {
          snapshot = await getDocs(
            query(
              collection(
                db,
                "sellers",
                sellerId,
                "events",
              ),
              where(
                "regionId",
                "==",
                regionId,
              ),
              where(
                "status",
                "==",
                "active",
              ),
              orderBy(
                "createdAt",
                "desc",
              ),
              limit(30),
            ),
          );
        } catch {
          snapshot = await getDocs(
            query(
              collection(
                db,
                "sellers",
                sellerId,
                "events",
              ),
              where(
                "regionId",
                "==",
                regionId,
              ),
              where(
                "status",
                "==",
                "active",
              ),
              limit(30),
            ),
          );
        }

        if (!alive) return;

        const next = snapshot.docs.map(
          (document) => ({
            id: document.id,
            data:
              document.data() as FireEvent,
          }),
        );

        next.sort((left, right) => {
          const leftTime =
            left.data.createdAt
              ?.toMillis?.() || 0;
          const rightTime =
            right.data.createdAt
              ?.toMillis?.() || 0;

          return rightTime - leftTime;
        });

        setEvents(
          uniqByEventId(next),
        );
      } catch (error) {
        console.error(
          "[ClientRegionPage] Load Error:",
          error,
        );

        if (!alive) return;

        setErrMsg(
          tr(
            "clientRegion.errors.loadEvents",
            "Erro ao carregar os eventos.",
          ),
        );
        setEvents([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };

    void fetchData();

    return () => {
      alive = false;
    };
  }, [canLoad, regionId, sellerId]);

  const whatsappLink = seller?.whatsapp
    ? normalizePhoneToWhatsappLink(
        seller.whatsapp,
        regional.operatingCountry,
      )
    : "";

  const gateUrl = sellerId && regionId ? `/c/${sellerId}/${regionId}` : "/";

  return (
    <>
      <PublicStoreNav
        kind="public"
        sellerId={sellerId}
        storeHref={`/store/${encodeURIComponent(sellerId)}`}
      />
      <OpenInBrowserGate url={gateUrl} />

      <main className="mx-auto max-w-2xl space-y-6 px-4 pb-28 pt-5 animate-fade-in md:px-6">
        <header className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 dark:text-orange-300">
              {regionId}
            </p>
            <h1 className="text-2xl font-black tracking-tight text-neutral-950 dark:text-white sm:text-3xl">
              {tr("clientRegion.title", "Pedidos Abertos")}
            </h1>

            <p className="text-xs font-medium text-neutral-500 sm:text-sm">
              {(seller?.storeName || seller?.displayName)
                ? tr("clientRegion.organizedBy", "Organizado por {name}").replace(
                    "{name}",
                    seller.storeName || seller.displayName || "",
                  )
                : tr(
                    "clientRegion.subtitle",
                    "Escolha um evento abaixo para fazer seu pedido",
                  )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {sellerId && (
              <Link
                href={`/store/${encodeURIComponent(sellerId)}`}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-neutral-950 px-4 py-2.5 text-xs font-black text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-950"
              >
                {tr("clientRegion.cta.store", "Abrir Loja Completa")}
              </Link>
            )}

            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-black uppercase transition hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
              >
                {tr("clientRegion.cta.whatsapp", "WhatsApp")}
              </a>
            )}

            {seller?.pickupLink && (
              <a
                href={seller.pickupLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs font-black uppercase transition hover:bg-neutral-100 active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:bg-neutral-800"
              >
                {tr("clientRegion.cta.pickupLocation", "Local de Retirada")}
              </a>
            )}
          </div>

          {seller?.pickupNote && (
            <div className="rounded-2xl border border-neutral-100 bg-neutral-50 p-3.5 text-xs font-bold text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-neutral-300">
              <span className="mr-2 font-black uppercase text-neutral-950 dark:text-white">
                {tr("clientRegion.notice", "Aviso")}:
              </span>
              {seller.pickupNote}
            </div>
          )}

          {errMsg ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
              {errMsg}
            </div>
          ) : null}
        </header>

        <PushSubscribeBanner
          sellerId={sellerId}
          regionId={regionId}
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""}
        />

        <section className="space-y-3">
          {loading ? (
            <div className="py-12 text-center text-xs font-black uppercase text-neutral-400 animate-pulse">
              {tr("clientRegion.loading", "Carregando eventos...")}
            </div>
          ) : seller && !sellerAvailable ? (
            <div className="rounded-3xl border-2 border-dashed border-neutral-200 p-10 text-center text-xs font-black uppercase text-neutral-400 dark:border-neutral-800">
              {tr(
                "clientRegion.storeUnavailable",
                "Esta loja não está recebendo pedidos no momento.",
              )}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-neutral-200 p-10 text-center text-xs font-black uppercase text-neutral-400 dark:border-neutral-800">
              {tr("clientRegion.empty", "Nenhum pedido ativo no momento.")}
            </div>
          ) : (
            <div className="grid gap-3">
              {events.map((e) => {
                const title =
                  e.data.title ||
                  e.data.name ||
                  tr("clientRegion.defaultEventTitle", "Evento de vendas");

                return (
                  <Link
                    key={e.id}
                    href={`/event/${sellerId}/${e.id}`}
                    className="group flex min-h-20 items-center justify-between gap-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-neutral-950 active:scale-[0.99] dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-white"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-black text-neutral-950 transition-colors group-hover:text-orange-600 dark:text-white sm:text-lg">
                        {title}
                      </h3>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className=" inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {tr("clientRegion.badge.open", "Aberto")}
                        </span>

                        {!!e.data.createdAt && (
                          <span className="text-[11px] font-bold text-neutral-400">
                            {tr("clientRegion.startedOn", "Iniciado em {date}").replace(
                              "{date}",
                              fmtDateShort(
                                e.data.createdAt,
                                regional.regionalLocale ?? "pt-BR",
                                regional.timeZone || "Asia/Tokyo",
                              ),
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-100 font-black transition-all group-hover:bg-neutral-950 group-hover:text-white dark:bg-neutral-800 dark:group-hover:bg-white dark:group-hover:text-neutral-950">
                      →
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}