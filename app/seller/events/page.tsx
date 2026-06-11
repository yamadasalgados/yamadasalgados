import { Suspense } from "react";
import SellerEventsClient from "./SellerEventsClient";

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Carregando...</div>}>
      <SellerEventsClient />
    </Suspense>
  );
}