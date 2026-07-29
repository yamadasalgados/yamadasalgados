"use client";

import type { ReactNode } from "react";

import SellerGuard, { type UserDoc } from "@/app/_components/SellerGuard";
import { SellerNav } from "@/app/_components/RoleNavigation";
import SellerShellStatus from "@/app/_components/SellerShellStatus";
import { useDocumentBranding } from "@/app/hooks/useDocumentBranding";

function SellerBrandedShell({
  children,
  profile,
}: {
  children: ReactNode;
  profile: UserDoc;
}) {
  useDocumentBranding({
    title: profile.storeName ? `${profile.storeName} · Painel` : "Painel do seller",
    themeColor: profile.brandPrimaryColor,
  });

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <SellerNav
        displayName={profile.storeName || ""}
        sellerId={profile.sellerId || ""}
        logoUrl={profile.logoUrl || ""}
        primaryColor={profile.brandPrimaryColor || "#f97316"}
      />
      <SellerShellStatus />
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>
  );
}

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <SellerGuard requireSellerIds={false}>
      {({ profile }) => (
        <SellerBrandedShell profile={profile}>{children}</SellerBrandedShell>
      )}
    </SellerGuard>
  );
}
