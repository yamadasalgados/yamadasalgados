// app/seller/events/[eventId]/page.tsx
import EventPanelClient from "./EventPanelClient";

export default async function EventPanelPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  return <EventPanelClient eventId={String(eventId || "").trim()} />;
}
