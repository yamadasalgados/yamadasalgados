"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/app/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ensureUserProfile } from "@/app/lib/ensureUserProfile";
import { useI18n } from "@/app/lib/i18n";

type UserDoc = {
  role?: "seller" | "admin";
  sellerId?: string;
  regionId?: string;
  active?: boolean;
  displayName?: string;
  whatsapp?: string;
  messengerId?: string;
  pickupLink?: string;
  pickupNote?: string;
  regionName?: string;
  updatedAt?: any;
};

export default function SellerSettingsPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Estados do Formulário
  const [displayName, setDisplayName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [messengerId, setMessengerId] = useState("");
  const [pickupLink, setPickupLink] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [regionName, setRegionName] = useState("");

  const role = profile?.role ?? null;
  const sellerId = profile?.sellerId || "";
  const regionId = profile?.regionId || "";
  const inactive = profile?.active === false;

  const canLoad = useMemo(() => {
    if (!authUser || inactive) return false;
    if (role !== "seller" && role !== "admin") return false;
    return true;
  }, [authUser, inactive, role]);

  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const publicUrl = sellerId && regionId && origin ? `${origin}/c/${sellerId}/${regionId}` : "";

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setAuthUser(u || null);
      setCheckingAuth(false);
      if (!u) router.replace("/login");
    });
    return () => unsub();
  }, [router]);

  const loadProfile = useCallback(async (u: User) => {
    setErrMsg("");
    setProfileMissing(false);

    const snap = await getDoc(doc(db, "users", u.uid));
    if (!snap.exists()) {
      setProfileMissing(true);
      setProfile(null);
      return;
    }

    const data = snap.data() as UserDoc;
    setProfile(data);

    setDisplayName(data.displayName || "");
    setWhatsapp(data.whatsapp || "");
    setMessengerId(data.messengerId || "");
    setPickupLink(data.pickupLink || "");
    setPickupNote(data.pickupNote || "");
    setRegionName(data.regionName || "");
  }, []);

  useEffect(() => {
    if (!authUser) return;
    loadProfile(authUser).catch(() => setErrMsg(t("settings.err.profileLoad")));
  }, [authUser, loadProfile, t]);

  const handleLogout = async () => {
    await signOut(auth);
    router.replace("/login");
  };

  const handleCreateProfileNow = useCallback(async () => {
    if (!authUser) return;
    setErrMsg("");
    setSuccessMsg("");
    setSaving(true);
    try {
      await ensureUserProfile(authUser, "pt");
      await loadProfile(authUser);
      setSuccessMsg(t("settings.profileCreated"));
    } catch {
      setErrMsg(t("settings.err.profileCreate"));
    } finally {
      setSaving(false);
    }
  }, [authUser, loadProfile, t]);

  const handleCopy = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setSuccessMsg(t("settings.publicLink.copied"));
    } catch {
      setErrMsg(t("settings.err.copy"));
    }
  }, [publicUrl, t]);

  const handleSave = useCallback(async () => {
    if (!authUser) return;
    setSaving(true);
    setErrMsg("");
    setSuccessMsg("");

    try {
      await updateDoc(doc(db, "users", authUser.uid), {
        displayName: displayName.trim(),
        whatsapp: whatsapp.trim(),
        messengerId: messengerId.trim(),
        pickupLink: pickupLink.trim(),
        pickupNote: pickupNote.trim(),
        regionName: regionName.trim(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMsg(t("settings.saved"));
    } catch {
      setErrMsg(t("settings.err.save"));
    } finally {
      setSaving(false);
    }
  }, [authUser, displayName, whatsapp, messengerId, pickupLink, pickupNote, regionName, t]);

  // --- 🔒 Proteção e Guards Internos ---
  if (checkingAuth || (authUser && !profile && !profileMissing)) {
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
        <h1 className="text-2xl font-black text-neutral-900 dark:text-white tracking-tight">{t("settings.guard.profileMissing.title")}</h1>
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 space-y-4 mt-4 shadow-xl">
          <p className="text-sm text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
            {t("settings.guard.profileMissing.line1").replace("{uid}", authUser.uid)}
          </p>
          <button onClick={handleCreateProfileNow} disabled={saving} className="w-full rounded-2xl bg-black text-white dark:bg-white dark:text-black font-black py-4 shadow-xl text-sm transition-all">
            {saving ? t("settings.guard.profileMissing.btn.creating") : t("settings.guard.profileMissing.btn.create")}
          </button>
        </div>
      </main>
    );
  }

  if (!canLoad) {
    return (
      <main className="max-w-md mx-auto p-4 mt-16 text-center animate-fade-in">
        <div className="rounded-3xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-8 shadow-sm space-y-4">
          <h1 className="text-xl font-black text-neutral-900 dark:text-white">{t("settings.guard.notAllowed.title")}</h1>
          <p className="text-xs font-bold text-red-500 bg-red-50/50 dark:bg-red-950/20 p-3 rounded-xl border border-red-200/40">
            {inactive ? t("settings.guard.notAllowed.inactive") : t("settings.guard.notAllowed.role")}
          </p>
          <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-black text-white text-xs font-black uppercase tracking-wider">{t("common.logout")}</button>
        </div>
      </main>
    );
  }

  return (
    <main className="p-4 sm:p-6 space-y-8 bg-white dark:bg-neutral-950 min-h-screen transition-colors animate-fade-in">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 dark:border-neutral-800 pb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 dark:text-white">{t("settings.title")}</h1>
          <p className="text-sm font-medium text-neutral-400 dark:text-neutral-500">{t("settings.subtitle")}</p>
        </div>
      </header>

      {/* FEEDBACK DE REALIMENTAÇÃO */}
      {(errMsg || successMsg) && (
        <div className={`rounded-2xl border px-4 py-3.5 text-xs font-black uppercase tracking-wider ${errMsg ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400" : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400"}`}>
          {errMsg || successMsg}
        </div>
      )}

      {/* SEÇÃO CARD: POLÍTICA DE DADOS */}
<section className="rounded-[2.5rem] bg-red-50 dark:bg-red-950/10 p-6 border border-red-200 dark:border-red-900/30 space-y-3">
  <div className="space-y-1">
    <h2 className="text-sm font-black text-red-900 dark:text-red-400 uppercase tracking-widest">
      {t("rent.dataPolicy.title")}
    </h2>

    <p className="text-xs text-red-800 dark:text-red-300 font-bold leading-relaxed">
      {t("rent.dataPolicy.body")}
    </p>
  </div>

  <div className="rounded-2xl border border-red-200 dark:border-red-900/30 bg-white/60 dark:bg-red-950/20 p-4">
    <p className="text-[11px] font-black text-red-700 dark:text-red-400 leading-relaxed">
      {t("rent.confirm.warning")}
    </p>
  </div>
</section>

      {/* SEÇÃO CARD: LINK PÚBLICO */}
      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("settings.publicLink.title")}</h2>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 leading-relaxed">{t("settings.publicLink.desc")}</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-2 bg-white dark:bg-neutral-900 p-3 rounded-2xl border border-neutral-200 dark:border-neutral-800">
          <code className="w-full text-xs font-mono font-black text-neutral-800 dark:text-neutral-200 px-3 py-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800/80 rounded-xl truncate">
            {publicUrl || t("settings.publicLink.waiting")}
          </code>
          <button
            onClick={handleCopy}
            disabled={!publicUrl}
            className="w-full sm:w-auto px-5 py-3 rounded-xl bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider transition disabled:opacity-40"
          >
            {t("settings.publicLink.copy")}
          </button>
        </div>
      </section>

      {/* SEÇÃO CARD: FORMULÁRIO */}
      <section className="bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 rounded-[2.5rem] p-6 space-y-6">
        <h2 className="text-sm font-black uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{t("settings.form.title")}</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Coluna 1: Identidade */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-200 dark:border-neutral-800/60 pb-1">
              {t("settings.section.identification")}
            </h3>

            <Field label={t("settings.field.displayName")}>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("settings.ph.displayName")} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition" />
            </Field>

            <Field label={t("settings.field.whatsapp")}>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder={t("settings.ph.whatsapp")} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition" />
            </Field>

            <Field label={t("settings.field.messengerId")}>
              <input value={messengerId} onChange={(e) => setMessengerId(e.target.value)} placeholder={t("settings.ph.messengerId")} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition" />
            </Field>

            <Field label={t("settings.field.regionName")}>
              <input value={regionName} onChange={(e) => setRegionName(e.target.value)} placeholder={t("settings.ph.regionName")} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition" />
            </Field>
          </div>

          {/* Coluna 2: Logística */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-neutral-400 border-b border-neutral-200 dark:border-neutral-800/60 pb-1">
              {t("settings.section.logistics")}
            </h3>

            <Field label={t("settings.field.pickupLink")}>
              <input value={pickupLink} onChange={(e) => setPickupLink(e.target.value)} placeholder={t("settings.ph.pickupLink")} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition" />
            </Field>

            <Field label={t("settings.field.pickupNote")}>
              <textarea value={pickupNote} onChange={(e) => setPickupNote(e.target.value)} placeholder={t("settings.ph.pickupNote")} rows={5} className="w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition resize-none" />
            </Field>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto px-10 py-3.5 rounded-2xl bg-black dark:bg-white text-white dark:text-black text-xs font-black uppercase tracking-wider shadow-md transition disabled:opacity-40"
          >
            {saving ? t("settings.btn.saving") : t("settings.btn.save")}
          </button>
        </div>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-wider text-neutral-400 dark:text-neutral-500 ml-1">
        {label}
      </label>
      {children}
    </div>
  );
}