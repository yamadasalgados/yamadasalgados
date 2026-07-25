"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";

import type { UserDoc } from "@/app/_components/SellerGuard";

type SellerSessionValue = {
  user: User;
  profile: UserDoc;
  sellerId: string;
  regionId: string;
  reloadProfile: () => Promise<void>;
};

const SellerSessionContext =
  createContext<SellerSessionValue | null>(null);

export function SellerSessionProvider({
  user,
  profile,
  reloadProfile,
  children,
}: {
  user: User;
  profile: UserDoc;
  reloadProfile: () => Promise<void>;
  children: ReactNode;
}) {
  const value = useMemo<SellerSessionValue>(
    () => ({
      user,
      profile,
      sellerId: profile.sellerId?.trim() || user.uid,
      regionId: profile.regionId?.trim() || "default",
      reloadProfile,
    }),
    [profile, reloadProfile, user],
  );

  return (
    <SellerSessionContext.Provider value={value}>
      {children}
    </SellerSessionContext.Provider>
  );
}

export function useSellerSession(): SellerSessionValue {
  const value = useContext(SellerSessionContext);

  if (!value) {
    throw new Error(
      "useSellerSession must be used inside the seller layout.",
    );
  }

  return value;
}

export function useOptionalSellerSession(): SellerSessionValue | null {
  return useContext(SellerSessionContext);
}
