"use client";

import type { ReactNode } from "react";

import AdminGuard from "@/app/_components/AdminGuard";
import { AdminNav } from "@/app/_components/RoleNavigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminGuard>
      {({ profile }) => (
        <div className="min-h-screen bg-neutral-50 text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
          <AdminNav displayName={profile.displayName || profile.email || ""} />
          <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-3 py-4 pb-24 sm:px-4 md:px-6 md:py-6 lg:pb-6">
            <main className="min-h-[60vh] w-full min-w-0 overflow-x-hidden animate-fade-in">
              {children}
            </main>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
