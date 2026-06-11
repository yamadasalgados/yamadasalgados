// app/seller/events/[eventId]/orders/[orderId]/page.tsx
import OrderDetailClient from "./OrderDetailClient";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; orderId: string }>;
}) {
  const { eventId, orderId } = await params;

  return (
    <OrderDetailClient
      eventId={String(eventId || "").trim()}
      orderId={String(orderId || "").trim()}
    />
  );
}
