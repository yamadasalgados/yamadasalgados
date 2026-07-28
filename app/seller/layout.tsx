"use client";

import type { ReactNode } from "react";

import SellerGuard from "@/app/_components/SellerGuard";
import { SellerNav } from "@/app/_components/RoleNavigation";
import SellerShellStatus from "@/app/_components/SellerShellStatus";

export default function SellerLayout({ children }: { children: ReactNode }) {
  return (
    <SellerGuard requireSellerIds={false}>
      {({ profile }) => (
        <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
          <SellerNav displayName={profile.storeName || ""} sellerId={profile.sellerId || ""} />
          <SellerShellStatus />
          <div className="pb-24 lg:pb-0">{children}</div>
        </div>
      )}
    </SellerGuard>
  );
}
