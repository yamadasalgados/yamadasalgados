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
import { useI18n } from "@/app/lib/i18n";

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
  displayName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
};

function fmtDateShort(ts?: Timestamp) {
  if (!ts) return "";
  const d = ts.toDate();

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "Asia/Tokyo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
}

function normalizePhoneToWhatsappLink(raw: string) {
  const s = String(raw || "").trim();
  if (!s) return "";

  let digits = s.replace(/[^\d]/g, "");

  if (digits.startsWith("0")) {
    digits = `81${digits.slice(1)}`;
  }

  return digits ? `https://wa.me/${digits}` : "";
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
  const { t } = useI18n();

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

  const canLoad = useMemo(() => !!sellerId && !!regionId, [sellerId, regionId]);

  useEffect(() => {
    if (!canLoad) return;

    let alive = true;

    const fetchSeller = async () => {
      try {
        const qSeller = query(
          collection(db, "users"),
          where("sellerId", "==", sellerId),
          limit(1)
        );

        const snap = await getDocs(qSeller);

        if (!alive) return;

        if (!snap.empty) {
          setSeller(snap.docs[0].data() as SellerProfile);
        } else {
          setSeller(null);
        }
      } catch (e) {
        console.warn("[ClientRegionPage] Seller profile public read failed:", e);
        if (alive) setSeller(null);
      }
    };

    fetchSeller();

    return () => {
      alive = false;
    };
  }, [canLoad, sellerId]);

  useEffect(() => {
    if (!canLoad) return;

    let alive = true;

    const fetchRootEvents = async () => {
      try {
        const qRoot = query(
          collection(db, "events"),
          where("sellerId", "==", sellerId),
          where("regionId", "==", regionId),
          where("status", "==", "active"),
          orderBy("createdAt", "desc"),
          limit(30)
        );

        const snap = await getDocs(qRoot);

        return snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as FireEvent,
        }));
      } catch {
        const qRootFallback = query(
          collection(db, "events"),
          where("sellerId", "==", sellerId),
          where("regionId", "==", regionId),
          where("status", "==", "active"),
          limit(30)
        );

        const snap = await getDocs(qRootFallback);

        return snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as FireEvent,
        }));
      }
    };

    const fetchSellerEvents = async () => {
      try {
        const qSellerEvents = query(
          collection(db, "sellers", sellerId, "events"),
          where("regionId", "==", regionId),
          where("status", "==", "active"),
          orderBy("createdAt", "desc"),
          limit(30)
        );

        const snap = await getDocs(qSellerEvents);

        return snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as FireEvent,
        }));
      } catch {
        const qSellerEventsFallback = query(
          collection(db, "sellers", sellerId, "events"),
          where("regionId", "==", regionId),
          where("status", "==", "active"),
          limit(30)
        );

        const snap = await getDocs(qSellerEventsFallback);

        return snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as FireEvent,
        }));
      }
    };

    const fetchData = async () => {
      setLoading(true);
      setErrMsg("");

      try {
        const results = await Promise.allSettled([
          fetchRootEvents(),
          fetchSellerEvents(),
        ]);

        const rootEvents =
          results[0].status === "fulfilled" ? results[0].value : [];

        const sellerEvents =
          results[1].status === "fulfilled" ? results[1].value : [];

        const merged = uniqByEventId([...sellerEvents, ...rootEvents]);

        merged.sort((a, b) => {
          const aTime = a.data.createdAt?.toMillis?.() || 0;
          const bTime = b.data.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        if (!alive) return;

        setEvents(merged);

        if (results[0].status === "rejected" && results[1].status === "rejected") {
          setErrMsg(
            tr("clientRegion.errors.loadEvents", "Erro ao carregar os eventos.")
          );
        }
      } catch (e) {
        console.error("[ClientRegionPage] Load Error:", e);

        if (!alive) return;

        setErrMsg(
          tr("clientRegion.errors.loadEvents", "Erro ao carregar os eventos.")
        );
        setEvents([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchData();

    return () => {
      alive = false;
    };
  }, [canLoad, sellerId, regionId]);

  const whatsappLink = seller?.whatsapp
    ? normalizePhoneToWhatsappLink(seller.whatsapp)
    : "";

  const gateUrl = sellerId && regionId ? `/c/${sellerId}/${regionId}` : "/";

  return (
    <>
      <OpenInBrowserGate url={gateUrl} />

      <main className="max-w-2xl mx-auto p-4 md:p-6 space-y-8 animate-fade-in">
        <header className="text-center md:text-left space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-black uppercase tracking-tighter dark:text-white">
              {tr("clientRegion.title", "Pedidos Abertos")}
            </h1>

            <p className="text-sm font-medium text-neutral-500">
              {seller?.displayName
                ? tr("clientRegion.organizedBy", "Organizado por {name}").replace(
                    "{name}",
                    seller.displayName
                  )
                : tr(
                    "clientRegion.subtitle",
                    "Escolha um evento abaixo para fazer seu pedido"
                  )}
            </p>
          </div>

          <PushSubscribeBanner
            sellerId={sellerId}
            regionId={regionId}
            vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""}
          />

          <div className="flex flex-wrap justify-center md:justify-start gap-2">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl border dark:border-neutral-800 text-xs font-black hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors uppercase"
              >
                {tr("clientRegion.cta.whatsapp", "WhatsApp")}
              </a>
            )}

            {seller?.pickupLink && (
              <a
                href={seller.pickupLink}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-xl border dark:border-neutral-800 text-xs font-black hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors uppercase"
              >
                {tr("clientRegion.cta.pickupLocation", "Local de Retirada")}
              </a>
            )}
          </div>

          {seller?.pickupNote && (
            <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-800 text-[11px] font-bold text-neutral-600 dark:text-neutral-400">
              <span className="text-black dark:text-white uppercase mr-2">
                {tr("clientRegion.notice", "Aviso")}:
              </span>
              {seller.pickupNote}
            </div>
          )}

          {errMsg ? (
            <div className="p-4 rounded-2xl border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 text-[11px] font-bold text-red-700 dark:text-red-400">
              {errMsg}
            </div>
          ) : null}
        </header>

        <section className="space-y-4">
          {loading ? (
            <div className="text-center py-10 text-xs font-black text-neutral-400 uppercase animate-pulse">
              {tr("clientRegion.loading", "Carregando eventos...")}
            </div>
          ) : events.length === 0 ? (
            <div className="text-center p-12 border-2 border-dashed rounded-3xl dark:border-neutral-800 text-xs font-black uppercase text-neutral-400">
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
                    className="group p-6 rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-black dark:hover:border-white transition-all flex justify-between items-center shadow-sm"
                  >
                    <div>
                      <h3 className="font-black dark:text-white text-lg group-hover:text-blue-600 transition-colors">
                        {title}
                      </h3>

                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-black uppercase text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-md">
                          {tr("clientRegion.badge.open", "Aberto")}
                        </span>

                        {!!e.data.createdAt && (
                          <span className="text-[10px] font-bold text-neutral-400 uppercase">
                            {tr("clientRegion.startedOn", "Iniciado em {date}").replace(
                              "{date}",
                              fmtDateShort(e.data.createdAt)
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-full bg-neutral-50 dark:bg-neutral-800 flex items-center justify-center group-hover:bg-black group-hover:text-white transition-all">
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