import type {
  ReactNode,
} from "react";

import SellerGuard from "@/app/_components/SellerGuard";

export default function SellerLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <SellerGuard
      requireSellerIds={false}
    >
      {children}
    </SellerGuard>
  );
}
