"use client";

import type { ReactNode } from "react";
import AdminGuard from "@/app/_components/AdminGuard";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({
  children,
}: AdminLayoutProps) {
  return (
    <AdminGuard>
      {() => (
        <div className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden px-3 py-4 sm:px-4 md:px-6 md:py-6">
          <main className="min-h-[60vh] w-full min-w-0 overflow-x-hidden animate-fade-in">
            {children}
          </main>
        </div>
      )}
    </AdminGuard>
  );
}