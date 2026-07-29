export type PublicEventChatMessage = {
  id: string;
  text: string;
  senderId: string;
  senderRole: "seller" | "customer";
  createdAt: string;
};

type EventChatAccess = {
  sellerId: string;
  eventId: string;
  orderId: string;
  token: string;
};

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => null) as
    | { ok?: boolean; error?: unknown; messages?: PublicEventChatMessage[]; message?: PublicEventChatMessage }
    | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "Não foi possível acessar o chat.",
    );
  }
  return payload;
}

export async function loadPublicEventChat(
  access: EventChatAccess,
  signal?: AbortSignal,
): Promise<PublicEventChatMessage[]> {
  const query = new URLSearchParams({
    sellerId: access.sellerId,
    eventId: access.eventId,
    orderId: access.orderId,
  });
  const response = await fetch(`/api/public/event-chat?${query.toString()}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${access.token}`,
    },
    cache: "no-store",
    signal,
  });
  const payload = await parseResponse(response);
  return Array.isArray(payload.messages) ? payload.messages : [];
}

export async function sendPublicEventChatMessage(
  access: EventChatAccess,
  text: string,
): Promise<PublicEventChatMessage> {
  const response = await fetch("/api/public/event-chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${access.token}`,
    },
    cache: "no-store",
    body: JSON.stringify({
      sellerId: access.sellerId,
      eventId: access.eventId,
      orderId: access.orderId,
      text,
    }),
  });
  const payload = await parseResponse(response);
  if (!payload.message) throw new Error("Resposta inválida do chat.");
  return payload.message;
}
