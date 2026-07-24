"use client";

import {
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
} from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  auth,
  db,
} from "@/app/lib/firebase";

import type {
  StoreOrderErrorCode,
} from "@/app/types/store-order";

type UseSellerIdResult = {
  loading: boolean;
  sellerId: string;
  userId: string;
  errorCode:
    | StoreOrderErrorCode
    | null;
  reload: () => void;
};

export default function useSellerId(): UseSellerIdResult {
  const [loading, setLoading] =
    useState(true);
  const [sellerId, setSellerId] =
    useState("");
  const [userId, setUserId] =
    useState("");
  const [errorCode, setErrorCode] =
    useState<
      StoreOrderErrorCode | null
    >(null);
  const [reloadKey, setReloadKey] =
    useState(0);

  const reload = useCallback(() => {
    setReloadKey(
      (current) => current + 1,
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setErrorCode(null);

    const unsubscribe =
      onAuthStateChanged(
        auth,
        async (user) => {
          if (cancelled) return;

          if (!user) {
            setUserId("");
            setSellerId("");
            setLoading(false);
            setErrorCode(
              "AUTH_REQUIRED",
            );
            return;
          }

          setUserId(user.uid);

          try {
            const profileSnapshot =
              await getDoc(
                doc(
                  db,
                  "users",
                  user.uid,
                ),
              );

            if (cancelled) return;

            const profile =
              profileSnapshot.exists()
                ? profileSnapshot.data()
                : null;

            const profileSellerId =
              profile?.sellerId;

            const resolvedSellerId =
              typeof profileSellerId ===
                "string" &&
              profileSellerId.trim()
                ? profileSellerId.trim()
                : user.uid;

            setSellerId(
              resolvedSellerId,
            );
            setErrorCode(null);
          } catch (profileError) {
            console.error(
              "[useSellerId] Não foi possível carregar o perfil:",
              profileError,
            );

            if (cancelled) return;

            // Fallback: em muitas contas sellerId é o próprio UID.
            setSellerId(user.uid);
            setErrorCode(null);
          } finally {
            if (!cancelled) {
              setLoading(false);
            }
          }
        },
      );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadKey]);

  return {
    loading,
    sellerId,
    userId,
    errorCode,
    reload,
  };
}
