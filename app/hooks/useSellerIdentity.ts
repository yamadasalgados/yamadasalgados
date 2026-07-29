"use client";

import { useEffect, useState } from "react";

import {
  fetchPublicSellerProfile,
} from "@/app/lib/public-seller-client";
import {
  EMPTY_SELLER_IDENTITY,
  normalizeSellerIdentity,
  type SellerIdentity,
} from "@/app/lib/seller-identity";

export function useSellerIdentity(sellerId: string): SellerIdentity {
  const [identity, setIdentity] = useState<SellerIdentity>(
    EMPTY_SELLER_IDENTITY,
  );

  useEffect(() => {
    const normalizedSellerId = String(sellerId || "").trim();
    if (!normalizedSellerId) {
      setIdentity(EMPTY_SELLER_IDENTITY);
      return;
    }

    const controller = new AbortController();

    void fetchPublicSellerProfile(normalizedSellerId, {
      signal: controller.signal,
    })
      .then((profile) => {
        setIdentity(normalizeSellerIdentity(profile));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("[useSellerIdentity] profile load failed:", error);
        setIdentity(EMPTY_SELLER_IDENTITY);
      });

    return () => controller.abort();
  }, [sellerId]);

  return identity;
}
