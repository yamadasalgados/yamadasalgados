"use client";

import type React from "react";
import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  setDoc,
  onSnapshot,
  query,
  limit,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

type DeliveryChoice = "delivery" | "pickup" | "both";
type ProductStatus = "active" | "inactive";

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

export default function CreateNewEventPage() {
  const router = useRouter();
  const { t, lang } = useI18n();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [regionName, setRegionName] = useState("");
  const [deliveryChoice, setDeliveryChoice] = useState<DeliveryChoice>("pickup");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [ownProducts, setOwnProducts] = useState<ProductDoc[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedOwn, setSelectedOwn] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const sellerId = (typeof profile?.sellerId === "string" && profile.sellerId.trim()) || (authUser?.uid ?? "");
  const role = profile?.role ?? "";
  const inactive = profile?.active === false;

  const yen = useCallback(
    (n: number) => {
      const locale = lang === "pt" ? "pt-BR" : lang === "en" ? "en-US" : "ja-JP";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0,
      }).format(Math.round(n || 0));
    },
    [lang]
  );

  const pickedCount = useMemo(() => {
    return Object.values(selectedOwn).filter(Boolean).length;
  }, [selectedOwn]);

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

  const loadProfile = useCallback(async (u: User) => {
    setErrMsg("");
    setOkMsg("");
    setProfileMissing(false);

    const snap = await getDoc(doc(db, "users", u.uid));
    if (!snap.exists()) {
      setProfileMissing(true);
      return;
    }

    const data = snap.data() as UserDoc;
    setProfile({
      role: data.role === "admin" ? "admin" : data.role === "seller" ? "seller" : undefined,
      sellerId: typeof data.sellerId === "string" ? data.sellerId : "",
      regionId: typeof data.regionId === "string" ? data.regionId : "",
      active: data.active !== false,
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser).catch((e: any) => setErrMsg(e?.message || t("events.create.error.profileLoad")));
  }, [authUser, loadProfile, t]);

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;

    setErrMsg("");
    setOkMsg("");
    setCreatingProfile(true);

    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
      setOkMsg(t("events.create.success.profileCreated"));
    } catch (e: any) {
      setErrMsg(e?.message || t("events.create.error.profileCreate"));
    } finally {
      setCreatingProfile(false);
    }
  }, [authUser, loadProfile, t]);

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

            return {
              id: d.id,
              name: String(data.name || ""),
              price: Number(data.sellPrice || data.price || 0),
              imageUrl: String(data.imageUrl || data.image || ""),
              extraImageUrls: normalizeStringArray(data.extraImageUrls),
              category: String(data.category || ""),
              status: (data.status === "inactive" ? "inactive" : "active") as ProductStatus,
              stockQty: toNumberOrUndef(data.stockQty),
              lowStockThreshold: toNumberOrUndef(data.lowStockThreshold),
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

  const toggleOwn = (id: string) => {
    setSelectedOwn((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const selectAllOwn = () => {
    const next: Record<string, boolean> = {};
    ownProducts.forEach((p) => {
      next[p.id] = true;
    });
    setSelectedOwn(next);
  };

  const clearOwn = () => {
    setSelectedOwn({});
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
        .filter(([, v]) => v)
        .map(([k]) => k);

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

        const base = {
          source: "own",
          productId: pid,
          enabled: true,
          name: p.name,
          price: Number(p.price || 0),
          imageUrl: pickImageUrl(p),
          extraImageUrls: normalizeStringArray(p.extraImageUrls),
          category: String(p.category || ""),
          status: p.status,
          stockQty: toNumberOrUndef(p.stockQty),
          lowStockThreshold: toNumberOrUndef(p.lowStockThreshold),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        batch.set(doc(db, "sellers", sellerId, "events", eventRef.id, "items", pid), stripUndefined(base));
      }

      await batch.commit();

      await setDoc(
        doc(db, "users", authUser.uid),
        {
          sellerId,
          regionId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      router.push(`/seller/events/${eventRef.id}`);
    } catch (e: any) {
      setErrMsg(e?.message || t("events.create.error.generic"));
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-[75vh] items-center justify-center bg-white dark:bg-neutral-950 transition-colors">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-neutral-200 border-t-black dark:border-neutral-800 dark:border-t-white" />
      </div>
    );
  }

  if (!authUser) return null;

  if (profileMissing) {
    return (
      <main className="max-w-md mx-auto p-4 mt-12 text-center animate-fade-in">
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
          {t("events.create.guard.profileMissing.title")}
        </h1>

        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4 mt-4 shadow-xl">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
            {t("events.create.guard.profileMissing.hint")}
          </p>

          <button
            onClick={handleCreateProfileNow}
            disabled={creatingProfile}
            className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-4 shadow-xl text-sm transition-all disabled:opacity-40"
          >
            {creatingProfile
              ? t("events.create.guard.profileMissing.creating")
              : t("events.create.guard.profileMissing.create")}
          </button>
        </div>
      </main>
    );
  }

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
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in max-w-3xl mx-auto">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">
            {t("events.create.title")}
          </h1>
        </div>

        <Link
          href="/seller/events"
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 text-xs font-black px-5 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 dark:text-white transition uppercase tracking-wider"
        >
          {t("events.create.back")}
        </Link>
      </header>

      {(errMsg || okMsg) && (
        <div
          className={`rounded-2xl border px-4 py-3.5 text-xs font-black uppercase tracking-wider ${
            errMsg
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"
          }`}
        >
          {errMsg || okMsg}
        </div>
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
            {t("events.create.form.delivery.label")} *
          </label>

          <div className="flex gap-4 flex-wrap bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 rounded-xl">
            {(["delivery", "pickup", "both"] as const).map((choice) => (
              <label
                key={choice}
                className="flex items-center gap-2 text-xs font-bold text-neutral-800 dark:text-neutral-200 cursor-pointer"
              >
                <input
                  type="radio"
                  name="deliveryChoice"
                  value={choice}
                  checked={deliveryChoice === choice}
                  onChange={() => setDeliveryChoice(choice)}
                  className="accent-black dark:accent-white"
                />
                <span>{t(`events.create.form.delivery.${choice}`)}</span>
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
                const checked = !!selectedOwn[p.id];

                return (
                  <label
                    key={p.id}
                    className={`group border rounded-2xl p-3 cursor-pointer transition-all flex flex-col justify-between h-[210px] relative ${
                      checked
                        ? "border-black bg-white dark:border-white dark:bg-neutral-900 shadow-md ring-2 ring-black dark:ring-white"
                        : "border-neutral-200 bg-white dark:border-neutral-800/40 dark:bg-neutral-900"
                    }`}
                  >
                    <div className="flex items-center justify-between z-10">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleOwn(p.id)}
                        className="accent-black dark:accent-white h-4 w-4 rounded-md"
                      />

                      {checked && (
                        <span className="text-[9px] font-black tracking-wider px-2 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black uppercase">
                          OK
                        </span>
                      )}
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

                    <div className="space-y-0.5 pt-2">
                      <p className="text-xs font-black text-neutral-900 dark:text-white truncate tracking-tight">
                        {p.name}
                      </p>

                      <p className="text-[10px] font-bold text-neutral-400 truncate">
                        {yen(p.price)} {p.category ? `• ${p.category}` : ""}
                      </p>
                    </div>
                  </label>
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