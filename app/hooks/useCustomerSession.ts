"use client";

import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

import { auth } from "@/app/lib/firebase";
import { resolveAuthenticatedAccount, type ResolvedAccountRole } from "@/app/lib/auth-role-client";
import { normalizeCustomerAddress, type CustomerAddressProfile } from "@/app/lib/customer-profile";
import {
  getOrCreateCustomerClientId,
  writeStoredCustomerProfile,
} from "@/app/lib/customer-storage";

export type CustomerProfile = {
  uid: string;
  name: string;
  phone: string;
  email: string;
  photoURL: string;
  preferredLanguage: "pt" | "en" | "ja";
  pointsBalance: number;
  address: CustomerAddressProfile;
};

export type CustomerSession = {
  loading: boolean;
  user: User | null;
  profile: CustomerProfile | null;
  clientId: string;
  error: string;
  accountRole: ResolvedAccountRole | null;
  dashboardHref: string;
  registered: boolean;
  displayName: string;
  refresh: () => Promise<void>;
  signOutCustomer: () => Promise<void>;
};

function asProfile(value: unknown): CustomerProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const uid = typeof raw.uid === "string" ? raw.uid : "";
  if (!uid) return null;

  return {
    uid,
    name: typeof raw.name === "string" ? raw.name : "",
    phone: typeof raw.phone === "string" ? raw.phone : "",
    email: typeof raw.email === "string" ? raw.email : "",
    photoURL: typeof raw.photoURL === "string" ? raw.photoURL : "",
    preferredLanguage:
      raw.preferredLanguage === "en" || raw.preferredLanguage === "ja"
        ? raw.preferredLanguage
        : "pt",
    pointsBalance:
      typeof raw.pointsBalance === "number" && Number.isFinite(raw.pointsBalance)
        ? Math.max(0, Math.floor(raw.pointsBalance))
        : 0,
    address: normalizeCustomerAddress(raw.address),
  };
}

async function loadProfile(user: User): Promise<CustomerProfile> {
  const token = await user.getIdToken();
  const response = await fetch("/api/customer/session", {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; profile?: unknown; error?: unknown }
    | null;

  const profile = asProfile(payload?.profile);
  if (!response.ok || !payload?.ok || !profile) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Não foi possível carregar a conta do cliente.",
    );
  }

  writeStoredCustomerProfile(profile);
  return profile;
}

export default function useCustomerSession(): CustomerSession {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [accountRole, setAccountRole] = useState<ResolvedAccountRole | null>(null);
  const [dashboardHref, setDashboardHref] = useState("");

  const refresh = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || accountRole === "seller" || accountRole === "admin") {
      setProfile(null);
      return;
    }

    setError("");
    try {
      setProfile(await loadProfile(currentUser));
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Não foi possível carregar a conta do cliente.",
      );
    }
  }, [accountRole]);

  useEffect(() => {
    setClientId(getOrCreateCustomerClientId());
    let requestVersion = 0;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      const currentVersion = ++requestVersion;
      setLoading(true);
      setUser(nextUser);
      setProfile(null);
      setAccountRole(null);
      setDashboardHref("");
      setError("");

      if (!nextUser) {
        setLoading(false);
        return;
      }
      try {
        const resolved = await resolveAuthenticatedAccount(nextUser);
        if (requestVersion !== currentVersion) return;
        setAccountRole(resolved.role);
        if (resolved.role === "admin" || resolved.role === "seller") {
          setDashboardHref(resolved.destination || (resolved.role === "admin" ? "/admin" : "/seller"));
          return;
        }
        if (resolved.role !== "customer") {
          setError(resolved.issue
            ? "A conta está com um conflito de permissões. Entre em contato com o administrador."
            : "Esta conta ainda não possui um perfil de cliente válido.");
          return;
        }
        const profile = await loadProfile(nextUser);
        if (requestVersion !== currentVersion) return;
        setProfile(profile);
        setAccountRole("customer");
      } catch (profileError) {
        if (requestVersion !== currentVersion) return;
        setProfile(null);
        setError(profileError instanceof Error ? profileError.message : "Não foi possível carregar a conta do cliente.");
      } finally {
        if (requestVersion === currentVersion) setLoading(false);
      }
    });
    return () => { requestVersion++; unsubscribe(); };
  }, []);

  const signOutCustomer = useCallback(async () => {
    const currentUser = auth.currentUser;

    if (currentUser && typeof window !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager?.getSubscription();
        if (subscription) {
          const token = await currentUser.getIdToken();
          const response = await fetch("/api/customer/push/unsubscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }).catch(() => null);

          // Se o servidor não conseguir desvincular o aparelho, remove a
          // assinatura localmente para impedir notificações da conta anterior.
          if (!response?.ok) {
            await subscription.unsubscribe().catch(() => false);
          }
        }
      } catch (error) {
        console.warn("[customer-session] Falha ao remover push no logout:", error);
      }
    }

    await signOut(auth);
    setProfile(null);
    setUser(null);
    setAccountRole(null);
    setDashboardHref("");
  }, []);

  const displayName = useMemo(
    () => profile?.name || user?.displayName || user?.email || "",
    [profile, user],
  );

  return {
    loading,
    user,
    profile,
    clientId,
    error,
    accountRole,
    dashboardHref,
    registered: Boolean(user && profile && accountRole === "customer"),
    displayName,
    refresh,
    signOutCustomer,
  };
}
