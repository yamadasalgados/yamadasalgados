"use client";

import {
  useCallback,
  useState,
} from "react";

import {
  useSellerSession,
} from "@/app/_components/SellerSessionContext";

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
  const session = useSellerSession();
  const [reloading, setReloading] = useState(false);
  const [errorCode, setErrorCode] = useState<StoreOrderErrorCode | null>(null);

  const reload = useCallback(() => {
    if (reloading) return;

    setReloading(true);
    setErrorCode(null);

    void session.reloadProfile()
      .catch((error) => {
        console.error(
          "[useSellerId] Não foi possível atualizar o perfil:",
          error,
        );
        setErrorCode("ORDER_LOAD_FAILED");
      })
      .finally(() => {
        setReloading(false);
      });
  }, [reloading, session]);

  return {
    loading: reloading,
    sellerId: session.sellerId,
    userId: session.user.uid,
    errorCode,
    reload,
  };
}
