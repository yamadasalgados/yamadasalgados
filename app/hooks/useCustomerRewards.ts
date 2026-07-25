"use client";

import { useCallback, useEffect, useState } from "react";

import {
  loadCustomerRewards,
  type CustomerRewardWallet,
} from "@/app/lib/customer-rewards-client";

export default function useCustomerRewards(
  sellerId: string,
  enabled: boolean,
) {
  const [wallet, setWallet] = useState<CustomerRewardWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled || !sellerId.trim()) {
      setWallet(null);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      setWallet(await loadCustomerRewards(sellerId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar seus pontos.",
      );
    } finally {
      setLoading(false);
    }
  }, [enabled, sellerId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { wallet, loading, error, refresh };
}
