"use client";

import type { ReactNode } from "react";

import { CustomerNav } from "@/app/_components/RoleNavigation";
import CustomerShellStatus from "@/app/_components/CustomerShellStatus";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
      <CustomerNav />
      <CustomerShellStatus />
      <div className="pb-24 lg:pb-0">{children}</div>
    </div>
  );
}
