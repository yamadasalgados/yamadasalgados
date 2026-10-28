"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadCustomerRewards,
  type CustomerRewardWallet,
} from "@/app/lib/customer-rewards-client";

/** Uma carteira por loja. Nunca mostra o saldo da loja anterior durante a troca. */
export default function useCustomerRewards(
  sellerId: string,
  enabled: boolean,
) {
  const [wallet, setWallet] = useState<CustomerRewardWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled || !sellerId.trim()) {
      setWallet(null);
      setLoading(false);
      setError("");
      return;
    }

    setWallet(null);
    setLoading(true);
    setError("");
    try {
      const nextWallet = await loadCustomerRewards(sellerId);
      if (requestVersion.current !== version) return;
      if (nextWallet.sellerId !== sellerId) {
        throw new Error("A carteira recebida não pertence a esta loja.");
      }
      setWallet(nextWallet);
    } catch (loadError) {
      if (requestVersion.current !== version) return;
      setWallet(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar seus pontos.",
      );
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [enabled, sellerId]);

  useEffect(() => {
    void refresh();
    // Ignora respostas de consultas antigas ao mudar de loja ou desmontar.
    return () => {
      requestVersion.current += 1;
    };
  }, [refresh]);

  return {
    wallet: wallet?.sellerId === sellerId ? wallet : null,
    loading,
    error,
    refresh,
  };
}
