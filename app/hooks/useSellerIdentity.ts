"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "@/app/lib/firebase";
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

    return onSnapshot(
      doc(db, "sellers", normalizedSellerId),
      (snapshot) => {
        setIdentity(
          snapshot.exists()
            ? normalizeSellerIdentity(snapshot.data())
            : EMPTY_SELLER_IDENTITY,
        );
      },
      (error) => {
        console.warn("[useSellerIdentity] profile load failed:", error);
        setIdentity(EMPTY_SELLER_IDENTITY);
      },
    );
  }, [sellerId]);

  return identity;
}
